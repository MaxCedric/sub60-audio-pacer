import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription, State as BleState } from 'react-native-ble-plx';

/**
 * Chuẩn Bluetooth SIG GATT cho Heart Rate Service & Characteristic:
 * - Service UUID: 0x180D
 * - Characteristic UUID: 0x2A37 (Heart Rate Measurement)
 * Lưu ý: App chỉ đọc nhịp tim thời gian thực để cảnh báo qua tai nghe,
 * KHÔNG ghi hay đồng bộ lên Strava để tránh trùng lặp với Huawei Health.
 */
export const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const HEART_RATE_CHARACTERISTIC_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
const SHORT_SERVICE_UUID = '180d';

export type BleConnectionStatus =
  | 'IDLE'
  | 'SCANNING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'SIMULATED'
  | 'ERROR';

export interface HeartRatePacket {
  bpm: number;
  contactDetected: boolean | null;
  energyExpendedKj?: number;
  rrIntervalsMs: number[];
  timestamp: number;
}

/**
 * Giải mã chuỗi Base64 không phụ thuộc thư viện ngoài (an toàn trên Hermes iOS)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const byteLength = Math.floor((clean.length * 3) / 4) - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = chars.indexOf(clean.charAt(i));
    const enc2 = chars.indexOf(clean.charAt(i + 1));
    const enc3 = clean.charAt(i + 2) === '=' ? 0 : chars.indexOf(clean.charAt(i + 2));
    const enc4 = clean.charAt(i + 3) === '=' ? 0 : chars.indexOf(clean.charAt(i + 3));

    const chunk = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 8) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = chunk & 0xff;
  }
  return bytes;
}

/**
 * Giải mã gói dữ liệu BLE Heart Rate Measurement (UUID 0x2A37) theo đặc tả Bluetooth SIG:
 * - Byte 0 (Flags):
 *   + Bit 0: 0 => Nhịp tim định dạng UINT8 (1 byte tại offset 1)
 *            1 => Nhịp tim định dạng UINT16 Little-Endian (2 bytes tại offset 1..2)
 *   + Bit 1-2: Trạng thái tiếp xúc cảm biến cổ tay (Sensor Contact)
 *   + Bit 3: Có trường Energy Expended (UINT16, 2 bytes)
 *   + Bit 4: Có một hoặc nhiều giá trị RR-Interval (UINT16, đơn vị 1/1024 giây)
 */
export function parseHeartRateMeasurement(base64Value: string): HeartRatePacket | null {
  try {
    const bytes = base64ToUint8Array(base64Value);
    if (bytes.length < 2) {
      return null;
    }

    const flags = bytes[0];
    const isUint16 = (flags & 0x01) !== 0;
    const sensorContactBits = (flags >> 1) & 0x03;
    const hasEnergyExpended = (flags & 0x08) !== 0;
    const hasRrIntervals = (flags & 0x10) !== 0;

    let offset = 1;
    let bpm = 0;

    if (isUint16) {
      if (bytes.length < offset + 2) return null;
      bpm = bytes[offset] | (bytes[offset + 1] << 8);
      offset += 2;
    } else {
      bpm = bytes[offset];
      offset += 1;
    }

    let contactDetected: boolean | null = null;
    if (sensorContactBits === 2) contactDetected = false;
    if (sensorContactBits === 3) contactDetected = true;

    let energyExpendedKj: number | undefined;
    if (hasEnergyExpended && bytes.length >= offset + 2) {
      energyExpendedKj = bytes[offset] | (bytes[offset + 1] << 8);
      offset += 2;
    }

    const rrIntervalsMs: number[] = [];
    if (hasRrIntervals) {
      while (bytes.length >= offset + 2) {
        const rawRr = bytes[offset] | (bytes[offset + 1] << 8);
        rrIntervalsMs.push(Math.round((rawRr / 1024) * 1000));
        offset += 2;
      }
    }

    return {
      bpm,
      contactDetected,
      energyExpendedKj,
      rrIntervalsMs,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

// Singleton BleManager để duy trì kết nối xuyên suốt vòng đời ứng dụng
let sharedBleManager: BleManager | null = null;
function getBleManager(): BleManager {
  if (!sharedBleManager) {
    sharedBleManager = new BleManager({
      restoreStateIdentifier: 'sub60-ble-central-restore-id',
      restoreStateFunction: () => {
        // iOS tự động đánh thức app khi HUAWEI WATCH FIT 4 phát gói 0x2A37 trong nền
      },
    });
  }
  return sharedBleManager;
}

export function useBleHeartRate() {
  const [status, setStatus] = useState<BleConnectionStatus>('IDLE');
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);

  const connectedDeviceRef = useRef<Device | null>(null);
  const lastDeviceIdRef = useRef<string | null>(null);
  const monitorSubRef = useRef<Subscription | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simulationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isManualDisconnectRef = useRef<boolean>(false);

  const clearTimersAndSubscriptions = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (monitorSubRef.current) {
      monitorSubRef.current.remove();
      monitorSubRef.current = null;
    }
    if (disconnectSubRef.current) {
      disconnectSubRef.current.remove();
      disconnectSubRef.current = null;
    }
  }, []);

  const requestBlePermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      return true;
    }
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return (
        result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
        result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  }, []);

  const subscribeToHeartRate = useCallback(
    async (device: Device) => {
      const manager = getBleManager();
      clearTimersAndSubscriptions();

      const connected = await device.connect({ autoConnect: true, requestMTU: 64 });
      const discovered = await connected.discoverAllServicesAndCharacteristics();
      connectedDeviceRef.current = discovered;
      lastDeviceIdRef.current = discovered.id;
      setDeviceName(discovered.name || discovered.localName || 'HUAWEI WATCH FIT 4');
      setStatus('CONNECTED');
      setErrorMessage(null);

      // Lắng nghe sự kiện mất kết nối để tự động kết nối lại (Auto-reconnect)
      disconnectSubRef.current = manager.onDeviceDisconnected(
        discovered.id,
        (_error, disconnectedDevice) => {
          if (isManualDisconnectRef.current) {
            setStatus('DISCONNECTED');
            return;
          }
          setStatus('RECONNECTING');
          const targetId = disconnectedDevice?.id || lastDeviceIdRef.current;
          if (targetId) {
            reconnectTimerRef.current = setTimeout(() => {
              attemptReconnect(targetId, 1);
            }, 2000);
          }
        }
      );

      // Đăng ký nhận Notification từ Characteristic 0x2A37
      monitorSubRef.current = discovered.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            return;
          }
          if (characteristic?.value) {
            const parsed = parseHeartRateMeasurement(characteristic.value);
            if (parsed && parsed.bpm > 30 && parsed.bpm < 240) {
              setHeartRate(parsed.bpm);
              setLastUpdated(parsed.timestamp);
            }
          }
        }
      );
    },
    [clearTimersAndSubscriptions]
  );

  const attemptReconnect = useCallback(
    async (deviceId: string, attempt: number) => {
      if (isManualDisconnectRef.current) return;
      const manager = getBleManager();
      setStatus('RECONNECTING');

      try {
        const devices = await manager.devices([deviceId]);
        if (devices.length > 0) {
          await subscribeToHeartRate(devices[0]);
          return;
        }
        const connected = await manager.connectToDevice(deviceId, { autoConnect: true });
        await subscribeToHeartRate(connected);
      } catch {
        const nextDelayMs = Math.min(10000, 2000 * Math.pow(1.4, attempt));
        reconnectTimerRef.current = setTimeout(() => {
          attemptReconnect(deviceId, attempt + 1);
        }, nextDelayMs);
      }
    },
    [subscribeToHeartRate]
  );

  const startScanAndConnect = useCallback(async () => {
    try {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
        simulationTimerRef.current = null;
        setIsSimulated(false);
      }

      isManualDisconnectRef.current = false;
      setErrorMessage(null);

      const hasPermission = await requestBlePermissions();
      if (!hasPermission) {
        setStatus('ERROR');
        setErrorMessage('Chưa cấp quyền Bluetooth trên thiết bị.');
        return;
      }

      const manager = getBleManager();
      const bleState = await manager.state();
      if (bleState !== BleState.PoweredOn) {
        setStatus('ERROR');
        setErrorMessage('Bluetooth đang tắt. Hãy bật Bluetooth trên iPhone và phát sóng nhịp tim trên HUAWEI WATCH FIT 4.');
        return;
      }

      setStatus('SCANNING');

      // Kiểm tra xem đồng hồ đã được iOS kết nối sẵn trong hệ thống với Service 0x180D chưa
      const alreadyConnected = await manager.connectedDevices([HEART_RATE_SERVICE_UUID]);
      if (alreadyConnected.length > 0) {
        setStatus('CONNECTING');
        await subscribeToHeartRate(alreadyConnected[0]);
        return;
      }

      // Quét thiết bị BLE phát quảng bá Service 0x180D hoặc có tên HUAWEI WATCH FIT
      manager.startDeviceScan(
        null,
        { allowDuplicates: false },
        async (error, scannedDevice) => {
          if (error) {
            setStatus('ERROR');
            setErrorMessage(`Lỗi quét BLE: ${error.message}`);
            manager.stopDeviceScan();
            return;
          }

          if (!scannedDevice) return;

          const name = (scannedDevice.name || scannedDevice.localName || '').toUpperCase();
          const uuids = (scannedDevice.serviceUUIDs || []).map((u) => u.toLowerCase());
          const advertisesHrService = uuids.some(
            (u) => u.includes(SHORT_SERVICE_UUID) || u === HEART_RATE_SERVICE_UUID
          );
          const isHuaweiWatch =
            name.includes('HUAWEI') || name.includes('WATCH FIT') || name.includes('FIT 4');

          if (advertisesHrService || isHuaweiWatch) {
            manager.stopDeviceScan();
            setStatus('CONNECTING');
            try {
              await subscribeToHeartRate(scannedDevice);
            } catch (connectErr: any) {
              setStatus('ERROR');
              setErrorMessage(
                connectErr?.message || 'Không thể kết nối với HUAWEI WATCH FIT 4. Hãy kiểm tra tính năng Phát sóng nhịp tim.'
              );
            }
          }
        }
      );

      // Dừng quét sau 18 giây nếu chưa tìm thấy
      setTimeout(() => {
        manager.stopDeviceScan();
        setStatus((prev) => {
          if (prev === 'SCANNING') {
            setErrorMessage(
              'Không tìm thấy HUAWEI WATCH FIT 4. Hãy bật "Phát sóng dữ liệu nhịp tim (HR Broadcast)" trên đồng hồ.'
            );
            return 'DISCONNECTED';
          }
          return prev;
        });
      }, 18000);
    } catch (err: any) {
      setStatus('ERROR');
      setErrorMessage(err?.message || 'Lỗi khởi tạo Bluetooth.');
    }
  }, [requestBlePermissions, subscribeToHeartRate]);

  const disconnect = useCallback(async () => {
    isManualDisconnectRef.current = true;
    clearTimersAndSubscriptions();

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
      setIsSimulated(false);
    }

    const manager = getBleManager();
    manager.stopDeviceScan();

    if (connectedDeviceRef.current) {
      try {
        await connectedDeviceRef.current.cancelConnection();
      } catch {
        // Bỏ qua lỗi khi ngắt kết nối
      }
      connectedDeviceRef.current = null;
    }

    setHeartRate(null);
    setStatus('DISCONNECTED');
  }, [clearTimersAndSubscriptions]);

  /**
   * Chế độ giả lập nhịp tim (dùng khi test ứng dụng tại nhà hoặc kiểm tra cảnh báo đỏ >= 178 bpm)
   */
  const toggleSimulationMode = useCallback((simulateHighHrAlert = false) => {
    clearTimersAndSubscriptions();
    const manager = getBleManager();
    manager.stopDeviceScan();

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
      setIsSimulated(false);
      setHeartRate(null);
      setStatus('IDLE');
      return;
    }

    setIsSimulated(true);
    setDeviceName('HUAWEI WATCH FIT 4 (Mô phỏng)');
    setStatus('SIMULATED');
    setErrorMessage(null);

    const baseHr = simulateHighHrAlert ? 180 : 154;
    setHeartRate(baseHr);
    setLastUpdated(Date.now());

    simulationTimerRef.current = setInterval(() => {
      const jitter = Math.floor(Math.random() * 3) - 1;
      setHeartRate(baseHr + jitter);
      setLastUpdated(Date.now());
    }, 1000);
  }, [clearTimersAndSubscriptions]);

  useEffect(() => {
    return () => {
      clearTimersAndSubscriptions();
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
      }
    };
  }, [clearTimersAndSubscriptions]);

  return {
    status,
    heartRate,
    deviceName,
    errorMessage,
    lastUpdated,
    isSimulated,
    startScanAndConnect,
    disconnect,
    toggleSimulationMode,
  };
}
