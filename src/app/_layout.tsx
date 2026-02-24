import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants'; // <-- NEW IMPORT

const API_KEYS = {
  apple: "appl_YOUR_APPLE_KEY_HERE",
  google: "goog_wFYnGCIMqJwlCoUvpUwBPtTtAtG"
};

export default function RootLayout() {
  useEffect(() => {
    const initPurchases = async () => {
      // THE BYPASS: If we are in Expo Go, do not initialize RevenueCat!
      if (Constants.appOwnership === 'expo') {
        console.log("Running in Expo Go: Bypassing RevenueCat native setup.");
        return;
      }

      try {
        if (Platform.OS === 'ios') {
          Purchases.configure({ apiKey: API_KEYS.apple });
        } else if (Platform.OS === 'android') {
          Purchases.configure({ apiKey: API_KEYS.google });
        }
      } catch (e) {
        console.error("Failed to initialize RevenueCat", e);
      }
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