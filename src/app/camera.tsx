import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Image, ScrollView, Modal 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  addPageToSession, 
  getSessionPages, 
  removePageFromSession, 
  updatePageInSession,
  ScannedPage 
} from '../core/store/session';

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  
  // Local state to track captured pages for the "Tray"
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null); // For the review modal

  // Sync with store on load
  useEffect(() => {
    setPages([...getSessionPages()]);
  }, []);

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{marginBottom: 10, color: 'white'}}>Camera permission required</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}><Text style={{color:'white'}}>Grant Permission</Text></TouchableOpacity>
      </View>
    );
  }

  const refreshPages = () => {
    setPages([...getSessionPages()]);
  };

  const handleCapture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
        if (photo) {
          addPageToSession({ uri: photo.uri, width: photo.width, height: photo.height });
          refreshPages();
        }
      } catch (e) { Alert.alert("Error", "Could not capture photo"); }
    }
  };

  const handleDone = () => {
    if (pages.length === 0) {
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
      refreshPages();
    }
  };

  // --- REVIEW MODAL ACTIONS ---
  const handleDelete = () => {
    if (reviewIndex !== null) {
      removePageFromSession(reviewIndex);
      refreshPages();
      setReviewIndex(null);
    }
  };

  const handleRotate = () => {
    if (reviewIndex !== null) {
      const currentPage = pages[reviewIndex];
      const newRotation = (currentPage.rotation + 90) % 360;
      updatePageInSession(reviewIndex, { rotation: newRotation });
      refreshPages();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <CameraView 
        style={StyleSheet.absoluteFill} 
        facing="back" 
        flash={flash}
        ref={cameraRef}
      />

      <SafeAreaView style={styles.uiLayer} pointerEvents="box-none">
        
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="white" />
          </TouchableOpacity>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>{pages.length} Pages</Text>
          </View>
          <TouchableOpacity onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')} style={styles.iconBtn}>
            <Ionicons name={flash === 'on' ? "flash" : "flash-off"} size={22} color="white" />
          </TouchableOpacity>
        </View>

        {/* MIDDLE: EMPTY SPACER */}
        <View style={{flex: 1}} />

        {/* PREVIEW TRAY (WhatsApp Style) */}
        {pages.length > 0 && (
          <View style={styles.trayContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayContent}>
              {pages.map((p, index) => (
                <TouchableOpacity key={index} onPress={() => setReviewIndex(index)} style={styles.trayItem}>
                  <Image 
                    source={{ uri: p.uri }} 
                    style={[styles.trayThumb, { transform: [{ rotate: `${p.rotation}deg` }] }]} 
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* BOTTOM CONTROL BAR */}
        <View style={styles.bottomBar}>
          
          {/* LEFT: GALLERY (Upload) */}
          <TouchableOpacity onPress={pickImage} style={styles.galleryBtn}>
            <Ionicons name="images" size={24} color="white" />
          </TouchableOpacity>

          {/* CENTER: SHUTTER */}
          <View style={styles.shutterContainer}>
             <TouchableOpacity onPress={handleCapture} style={styles.captureBtn}>
               <View style={styles.captureInner} />
             </TouchableOpacity>
          </View>

          {/* RIGHT: DONE (Icon) */}
          <TouchableOpacity 
            onPress={handleDone} 
            style={[styles.doneBtn, pages.length > 0 ? styles.doneActive : styles.doneInactive]}
          >
            <Ionicons name="checkmark" size={32} color="white" />
          </TouchableOpacity>

        </View>

      </SafeAreaView>

      {/* REVIEW MODAL */}
      <Modal visible={reviewIndex !== null} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {reviewIndex !== null && pages[reviewIndex] && (
              <Image 
                source={{ uri: pages[reviewIndex].uri }} 
                style={[styles.modalImage, { transform: [{ rotate: `${pages[reviewIndex].rotation}deg` }] }]} 
                resizeMode="contain" 
              />
            )}
            
            {/* Modal Controls */}
            <View style={styles.modalControls}>
              <TouchableOpacity onPress={() => setReviewIndex(null)} style={styles.controlBtn}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRotate} style={styles.controlBtn}>
                <Ionicons name="refresh" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={[styles.controlBtn, {backgroundColor:'#EF4444'}]}>
                <Ionicons name="trash" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'black' },
  permBtn: { padding: 12, backgroundColor: '#2563EB', borderRadius: 8 },
  
  uiLayer: { flex: 1, justifyContent: 'space-between' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 22 },
  counterPill: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  counterText: { color: 'white', fontWeight: 'bold' },

  // TRAY
  trayContainer: { height: 80, marginBottom: 10 },
  trayContent: { paddingHorizontal: 20, gap: 10, alignItems: 'center' },
  trayItem: { width: 60, height: 60, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'white', backgroundColor: '#333' },
  trayThumb: { width: '100%', height: '100%' },

  // BOTTOM BAR
  bottomBar: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 30, 
    paddingBottom: 40,
    height: 100,
    position: 'relative'
  },
  galleryBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  
  shutterContainer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', bottom: 40, pointerEvents: 'box-none' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  captureInner: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#111', backgroundColor: 'white' },

  doneBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  doneActive: { backgroundColor: '#2563EB' },
  doneInactive: { backgroundColor: 'rgba(255,255,255,0.2)' },

  // MODAL
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  modalImage: { width: '90%', height: '70%' },
  modalControls: { flexDirection: 'row', gap: 30, marginTop: 40 },
  controlBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }
});