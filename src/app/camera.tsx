import React, { useState, useRef } from 'react';
import { 
  View, TouchableOpacity, Text, StyleSheet, StatusBar, Platform, Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, FlashMode } from 'expo-camera'; 
import * as ImagePicker from 'expo-image-picker'; 
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addPageToSession, currentSessionPages } from '../core/store/session';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();

  const [isMathMode, setIsMathMode] = useState(false); 
  const [flash, setFlash] = useState<FlashMode>('off'); 
  const [sessionCount, setSessionCount] = useState(currentSessionPages.length);

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: 'white', marginBottom: 20 }}>Camera permission is required.</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleFlash = () => setFlash(cur => (cur === 'off' ? 'on' : 'off'));

  const addToSession = (uri: string) => {
    addPageToSession({ uri, mode: isMathMode });
    setSessionCount(prev => prev + 1); 
  };

  const pickImage = async () => {
    // FEATURE: Batch Upload
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: true, 
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      result.assets.forEach(asset => addToSession(asset.uri));
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        if (photo) {
          addToSession(photo.uri);
        }
      } catch (e) {
        Alert.alert("Error", "Could not take picture.");
      }
    }
  };

  const handleDone = () => {
    // NAVIGATION: Go to Workspace (not back to Home)
    router.push("/workspace");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* FEATURE: pointerEvents allows touches to pass through for focus */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleFlash} style={styles.iconBtn}>
          <Ionicons name={flash === 'on' ? "flash" : "flash-off"} size={24} color={flash === 'on' ? "#fbbf24" : "white"} />
        </TouchableOpacity>
      </SafeAreaView>

      <View style={styles.cameraFrame}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} flash={flash} />
      </View>

      <View style={styles.bottomDeck} pointerEvents="box-none">
        <View style={styles.modeSelector}>
          <TouchableOpacity onPress={() => setIsMathMode(false)}>
            <Text style={[styles.modeText, !isMathMode && styles.activeMode]}>STANDARD</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity onPress={() => setIsMathMode(true)}>
            <Text style={[styles.modeText, isMathMode && styles.activeMode]}>MATH / SCIENCE</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlRow}>
          <TouchableOpacity onPress={pickImage} style={styles.sideBtn}>
            <Ionicons name="images" size={28} color="white" style={{ opacity: 0.8 }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={takePicture} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDone} style={styles.sideBtn}>
            {sessionCount > 0 ? (
              <View style={styles.doneBtn}>
                <Text style={styles.doneText}>{sessionCount}</Text>
                <Ionicons name="checkmark" size={16} color="black" />
              </View>
            ) : <View />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { justifyContent: 'center', alignItems: 'center' },
  permBtn: { backgroundColor: '#2563EB', padding: 12, borderRadius: 8 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 10 : 0, zIndex: 50 },
  iconBtn: { padding: 8 },
  cameraFrame: { flex: 1, marginVertical: 10, borderRadius: 24, overflow: 'hidden', backgroundColor: '#111' },
  bottomDeck: { paddingBottom: 40, paddingHorizontal: 20, justifyContent: 'flex-end', zIndex: 50 },
  modeSelector: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modeText: { color: '#888', fontWeight: '600', fontSize: 13, letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8 },
  activeMode: { color: '#FFF', fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  divider: { width: 1, height: 12, backgroundColor: '#333', marginHorizontal: 4 },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sideBtn: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  shutterOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  shutterInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'white' },
  doneBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#fbbf24', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 2 },
  doneText: { fontWeight: 'bold', fontSize: 16, color: 'black' },
});