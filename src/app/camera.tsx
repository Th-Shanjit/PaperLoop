import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Image, ScrollView, Modal, Alert 
} from 'react-native';
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
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  useEffect(() => {
    refreshPages();
  }, []);

  const refreshPages = () => {
    setPages([...getSessionPages()]);
  };

  const launchSystemCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1, 
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        addPageToSession({ uri: asset.uri, width: asset.width, height: asset.height });
        refreshPages();
      } 
    } catch (e) {
      Alert.alert("Error", "Could not launch camera");
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

  const handleDone = () => {
    if (pages.length === 0) {
      router.back();
    } else {
      router.push("/workspace");
    }
  };

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
      <StatusBar barStyle="light-content" backgroundColor="black" />
      
      {/* HEADER */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {pages.length === 0 ? "Ready to Scan" : `${pages.length} Pages Scanned`}
        </Text>
        <View style={{width:44}} /> 
      </SafeAreaView>

      {/* MAIN CONTENT: PREVIEW DESK */}
      <View style={styles.mainArea}>
        {pages.length === 0 ? (
          <View style={styles.centerMsg}>
             <Ionicons name="documents-outline" size={64} color="#333" />
             <Text style={{color:'#666', marginTop:16, fontSize: 16}}>Pages you scan will appear here</Text>
             <Text style={{color:'#444', marginTop:8, fontSize: 13}}>Tap '+' below to start</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
             {pages.map((p, index) => (
               <TouchableOpacity key={index} onPress={() => setReviewIndex(index)} style={styles.gridItem}>
                 <Image 
                   source={{ uri: p.uri }} 
                   style={[styles.gridThumb, { transform: [{ rotate: `${p.rotation}deg` }] }]} 
                   resizeMode="contain" // FIX: Ensures no cropping on rotation
                 />
                 <View style={styles.badge}><Text style={styles.badgeText}>{index + 1}</Text></View>
               </TouchableOpacity>
             ))}
          </ScrollView>
        )}
      </View>

      {/* BOTTOM ACTION BAR */}
      <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
        <TouchableOpacity onPress={pickImage} style={styles.subBtn}>
          <Ionicons name="images" size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity onPress={launchSystemCamera} style={styles.captureBtn}>
          <Ionicons name="add" size={40} color="black" />
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={handleDone} 
          style={[styles.doneBtn, pages.length > 0 ? styles.doneActive : styles.doneInactive]}
          disabled={pages.length === 0}
        >
          <Ionicons name="checkmark" size={28} color={pages.length > 0 ? "white" : "#666"} />
        </TouchableOpacity>
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
  
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', borderRadius: 22 },
  headerTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },

  mainArea: { flex: 1, backgroundColor: '#111' },
  centerMsg: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.8 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 15, gap: 15 },
  
  // FIX: Square Aspect Ratio + Centering
  gridItem: { 
    width: '30%', 
    aspectRatio: 1, // Forces a square shape
    backgroundColor: '#222', 
    borderRadius: 12, 
    overflow: 'hidden', 
    borderWidth: 1, 
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center'
  },
  
  gridThumb: { width: '100%', height: '100%' },
  
  badge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#2563EB', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40, paddingVertical: 20, backgroundColor: 'black' },
  
  subBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
  
  doneBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  doneActive: { backgroundColor: '#2563EB' },
  doneInactive: { backgroundColor: '#222' },

  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  modalImage: { width: '90%', height: '60%' },
  modalControls: { flexDirection: 'row', gap: 30, marginTop: 40 },
  controlBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }
});