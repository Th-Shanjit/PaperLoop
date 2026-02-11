import { Stack } from 'expo-router';
import { View } from 'react-native';

export default function Layout() {
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