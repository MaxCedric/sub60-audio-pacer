import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { RunHudScreen } from './src/screens/RunHudScreen';
import { useBleHeartRate } from './src/hooks/useBleHeartRate';
import { WorkoutPlan } from './src/hooks/useRunningPacer';

export default function App() {
  const [activeWorkout, setActiveWorkout] = useState<WorkoutPlan | null>(null);
  const {
    status: bleStatus,
    heartRate,
    deviceName,
    errorMessage: bleError,
    isSimulated: isSimulatedBle,
    startScanAndConnect,
    disconnect,
    toggleSimulationMode,
  } = useBleHeartRate();

  return (
    <>
      <StatusBar style="light" />
      {activeWorkout ? (
        <RunHudScreen
          workout={activeWorkout}
          heartRate={heartRate}
          bleStatus={bleStatus}
          onToggleSimBle={toggleSimulationMode}
          onBackToHome={() => setActiveWorkout(null)}
        />
      ) : (
        <HomeScreen
          bleStatus={bleStatus}
          heartRate={heartRate}
          deviceName={deviceName}
          bleError={bleError}
          isSimulatedBle={isSimulatedBle}
          onScanBle={startScanAndConnect}
          onDisconnectBle={disconnect}
          onToggleSimBle={toggleSimulationMode}
          onSelectWorkout={(workout) => setActiveWorkout(workout)}
        />
      )}
    </>
  );
}
