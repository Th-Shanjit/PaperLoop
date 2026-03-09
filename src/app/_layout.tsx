import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants'; // <-- NEW IMPORT
import { configurePurchases, syncCustomerState } from '../core/services/purchases';

export default function RootLayout() {
  useEffect(() => {
    const initPurchases = async () => {
      // Configure RevenueCat with the new service
      configurePurchases();
      
      // Sync customer state (entitlements, tokens, etc.)
      await syncCustomerState();
    };
    initPurchases();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
      {/* Dashboard: The Base Layer */}
      <Stack.Screen name="index" />

      {/* Camera: Opens normally (or you can make this slide up too) */}
      <Stack.Screen name="camera" options={{ animation: 'fade' }} />

      {/* WORKSPACE (Preview): SLIDES UP FROM BOTTOM */}
      <Stack.Screen 
        name="workspace" 
        options={{ 
          presentation: 'modal',  // This creates the "Sheet" effect
          animation: 'slide_from_bottom',
          gestureEnabled: true, // Allows dragging down to close (on iOS)
        }} 
      />

      {/* EDITOR: SLIDES UP FROM BOTTOM */}
      <Stack.Screen 
        name="editor" 
        options={{ 
          presentation: 'modal',
          animation: 'slide_from_bottom' 
        }} 
      />
    </Stack>
  );
}