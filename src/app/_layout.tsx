import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostHogProvider } from 'posthog-react-native';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { configurePurchases, syncCustomerState } from '../core/services/purchases';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    const init = async () => {
      try {
        configurePurchases();
        await syncCustomerState();
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    init();
  }, []);

  return (
    <SafeAreaProvider>
      <PostHogProvider
        apiKey="phc_D9DBZTXaZQaRTHA6HYENU7NoQDmuJ5v5Dvdk9SmVSxG5"
        options={{ host: 'https://app.posthog.com' }}
      >
        <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="camera" options={{ animation: 'fade' }} />
          <Stack.Screen 
            name="workspace" 
            options={{ 
              presentation: 'modal',
              animation: 'slide_from_bottom',
              gestureEnabled: true,
            }} 
          />
          <Stack.Screen 
            name="editor" 
            options={{ 
              presentation: 'modal',
              animation: 'slide_from_bottom' 
            }} 
          />
          <Stack.Screen name="history" />
          <Stack.Screen name="generator" />
        </Stack>
      </PostHogProvider>
    </SafeAreaProvider>
  );
}
