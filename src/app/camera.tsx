import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { addPageToSession, clearSession } from '../core/store/session';

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [flash, setFlash] = useState<'off' | 'on'>('off');

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{marginBottom: 10}}>Camera permission required</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}><Text style={{color:'white'}}>Grant Permission</Text></TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
        if (photo) {
          addPageToSession({ uri: photo.uri, width: photo.width, height: photo.height });
          setSessionCount(prev => prev + 1);
        }
      } catch (e) { Alert.alert("Error", "Could not capture photo"); }
    }
  };

  const handleDone = () => {
    if (sessionCount === 0) {
      router.back();
    } else {
      router.push("/workspace");
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsMultipleSelection: true
    });
    if (!result.canceled) {
      result.assets.forEach(asset => {
        addPageToSession({ uri: asset.uri, width: asset.width, height: asset.height });
      });
      setSessionCount(prev => prev + result.assets.length);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <CameraView 
        style={styles.camera} 
        facing="back" 
        flash={flash}
        ref={cameraRef}
      >
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>{sessionCount} Scanned</Text>
          </View>
          <TouchableOpacity onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')} style={styles.iconBtn}>
            <Ionicons name={flash === 'on' ? "flash" : "flash-off"} size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* BOTTOM BAR */}
        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={pickImage} style={styles.galleryBtn}>
            <Ionicons name="images" size={24} color="white" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCapture} style={styles.captureBtn}>
            <View style={styles.captureInner} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDone} style={styles.doneBtn}>
            <Text style={styles.doneText}>Done</Text>
            <Ionicons name="arrow-forward" size={20} color="black" />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permBtn: { padding: 10, backgroundColor: '#2563EB', borderRadius: 8 },
  camera: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: 20 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20 },
  counterPill: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  counterText: { color: 'white', fontWeight: 'bold' },
  bottomBar: { position: 'absolute', bottom: 40, flexDirection: 'row', width: '100%', justifyContent: 'space-around', alignItems: 'center' },
  galleryBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: 'black', backgroundColor: 'white' },
  doneBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fbbf24', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30 },
  doneText: { fontWeight: 'bold', marginRight: 5 },
});