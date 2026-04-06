import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Image, ScrollView, Modal 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  addPageToSession, 
  getSessionPages, 
  removePageFromSession, 
  updatePageInSession,
  ScannedPage 
} from '../core/store/session';
import { usePostHog } from 'posthog-react-native';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
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
        const fileExt = asset.uri.split('.').pop() || 'jpg';
        const newFileName = `snippet_${Date.now()}.${fileExt}`;
        const newPath = FileSystem.documentDirectory + 'snippets/' + newFileName;
        
        await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'snippets/', { intermediates: true });
        await FileSystem.copyAsync({ from: asset.uri, to: newPath });

        addPageToSession({ localUri: newPath, width: asset.width, height: asset.height });
        posthog?.capture('photo_captured');
        refreshPages();
      } 
    } catch (e) {
      showAlert("Error", "Could not launch camera.");
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsMultipleSelection: true
    });
    if (!result.canceled) {
      await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'snippets/', { intermediates: true });
      for (const asset of result.assets) {
        const fileExt = asset.uri.split('.').pop() || 'jpg';
        const newFileName = `snippet_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const newPath = FileSystem.documentDirectory + 'snippets/' + newFileName;
        await FileSystem.copyAsync({ from: asset.uri, to: newPath });
        addPageToSession({ localUri: newPath, width: asset.width, height: asset.height });
        posthog?.capture('photo_captured');
      }
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

  const handleDelete = async () => {
    if (reviewIndex !== null) {
      await removePageFromSession(reviewIndex);
      refreshPages();
      setReviewIndex(null);
    }
  };

  const handleRotate = async () => {
    if (reviewIndex !== null) {
      try {
        const currentPage = pages[reviewIndex];
        
        // CRITICAL FIX: Physically rotate the image file instead of just CSS
        const result = await ImageManipulator.manipulateAsync(
          currentPage.localUri,
          [{ rotate: 90 }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Delete the old file
        try {
          await FileSystem.deleteAsync(currentPage.localUri, { idempotent: true });
        } catch (e) {}

        const newFileName = `snippet_${Date.now()}_rot.jpg`;
        const newPath = FileSystem.documentDirectory + 'snippets/' + newFileName;
        await FileSystem.copyAsync({ from: result.uri, to: newPath });

        updatePageInSession(reviewIndex, { 
          localUri: newPath, 
          width: result.width, 
          height: result.height,
          rotation: 0 // Reset CSS rotation since file is actually rotated
        });
        
        refreshPages();
      } catch (e) {
        showAlert("Error", "Could not rotate image.");
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="black" />
      
      {/* HEADER */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity accessibilityLabel="Close camera" onPress={() => {
          if (pages.length > 0) {
            showAlert(
              "Leave without saving?",
              `You have ${pages.length} scanned page${pages.length > 1 ? 's' : ''}. They will be lost if you leave now.`,
              [
                { text: "Stay", style: "cancel" },
                { text: "Leave", style: "destructive", onPress: () => router.back() }
              ]
            );
          } else {
            router.back();
          }
        }} style={styles.iconBtn}>
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
          <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
             {pages.map((p, index) => (
               <TouchableOpacity key={index} onPress={() => setReviewIndex(index)} style={styles.gridItem}>
                 <Image 
                   source={{ uri: p.localUri }} 
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
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity accessibilityLabel="Pick from gallery" onPress={pickImage} style={styles.subBtn}>
          <Ionicons name="images" size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity accessibilityLabel="Take photo" onPress={launchSystemCamera} style={styles.captureBtn}>
          <Ionicons name="add" size={40} color="black" />
        </TouchableOpacity>

        <TouchableOpacity 
          accessibilityLabel="Done scanning"
          onPress={handleDone} 
          style={[styles.doneBtn, pages.length > 0 ? styles.doneActive : styles.doneInactive]}
          disabled={pages.length === 0}
        >
          <Ionicons name="checkmark" size={28} color={pages.length > 0 ? "white" : "#666"} />
        </TouchableOpacity>
      </View>

      {/* REVIEW MODAL */}
      <Modal visible={reviewIndex !== null} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {reviewIndex !== null && pages[reviewIndex] && (
              <Image 
                source={{ uri: pages[reviewIndex].localUri }} 
                style={[styles.modalImage, { transform: [{ rotate: `${pages[reviewIndex].rotation}deg` }] }]} 
                resizeMode="contain" 
              />
            )}
            <View style={styles.modalControls}>
              <TouchableOpacity accessibilityLabel="Close review" onPress={() => setReviewIndex(null)} style={styles.controlBtn}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Rotate image" onPress={handleRotate} style={styles.controlBtn}>
                <Ionicons name="refresh" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Delete page" onPress={handleDelete} style={[styles.controlBtn, {backgroundColor:'#EF4444'}]}>
                <Ionicons name="trash" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert {...alertState} onClose={closeAlert} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', borderRadius: 22 },
  headerTitle: { color: colors.background.normal, fontSize: 16, fontWeight: 'bold' },

  mainArea: { flex: 1, backgroundColor: colors.label.normal },
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
  
  badge: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.primary.normal, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' },
  badgeText: { color: colors.background.normal, fontSize: 10, fontWeight: 'bold' },

  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40, paddingVertical: 20, backgroundColor: 'black' },
  
  subBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.background.normal, justifyContent: 'center', alignItems: 'center' },
  
  doneBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  doneActive: { backgroundColor: colors.primary.normal },
  doneInactive: { backgroundColor: '#222' },

  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  modalImage: { width: '90%', height: '60%' },
  modalControls: { flexDirection: 'row', gap: 30, marginTop: 40 },
  controlBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }
});