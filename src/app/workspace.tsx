import React, { useState, useCallback } from 'react';
import { 
  View, Text, Image, TouchableOpacity, FlatList, 
  StyleSheet, Modal, StatusBar, Alert, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator'; // <--- NEW IMPORT
import { 
  getSessionPages, 
  removePageFromSession, 
  updatePageInSession, 
  swapPagesInSession, 
  clearSession,
  ScannedPage 
} from '../core/store/session';
import { transcribeHandwriting } from '../core/services/gemini';

export default function WorkspaceScreen() {
  const router = useRouter();
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedImage, setSelectedImage] = useState<ScannedPage | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Sync with Store
  useFocusEffect(
    useCallback(() => {
      setPages([...getSessionPages()]);
    }, [])
  );

  const handleOpenScanner = () => {
    router.push("/camera");
  };

  const handleImagePress = (page: ScannedPage, index: number) => {
    setSelectedImage(page);
    setSelectedIndex(index);
  };

  const handleDeletePage = () => {
    if (selectedIndex > -1) {
      removePageFromSession(selectedIndex);
      const newPages = [...getSessionPages()];
      setPages(newPages);
      
      if (newPages.length === 0) {
        setSelectedImage(null);
      } else if (selectedIndex >= newPages.length) {
        const newIndex = newPages.length - 1;
        setSelectedIndex(newIndex);
        setSelectedImage(newPages[newIndex]);
      } else {
        setSelectedImage(newPages[selectedIndex]);
      }
    }
  };

  const handleRotate = () => {
    if (selectedImage && selectedIndex > -1) {
      const newRotation = (selectedImage.rotation + 90) % 360;
      updatePageInSession(selectedIndex, { rotation: newRotation });
      const updatedPage = { ...selectedImage, rotation: newRotation };
      setSelectedImage(updatedPage);
      const newPages = [...pages];
      newPages[selectedIndex] = updatedPage;
      setPages(newPages);
    }
  };

  const handleMovePage = (direction: 'left' | 'right') => {
    if (selectedIndex === -1) return;
    const newIndex = direction === 'left' ? selectedIndex - 1 : selectedIndex + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;
    swapPagesInSession(selectedIndex, newIndex);
    const newPages = [...getSessionPages()]; 
    setPages(newPages);
    setSelectedIndex(newIndex); 
  };
  const handleExit = () => {
    Alert.alert("Discard Scan?", "Going home will clear these pages.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => {
        clearSession();
        router.replace("/");
      }}
    ]);
  };

  // --- REPLACED: NEW ANALYZE FUNCTION ---
  const handleAnalyze = async () => {
    if (pages.length === 0) return;
    setIsAnalyzing(true);
    
    try {
      // Step A: Get Data from Gemini
      const result = await transcribeHandwriting(pages);
      
      const processedQuestions = [];

      // Step B: The Cropping Loop
      for (const q of result.questions) {
        let finalQ = { ...q };

        // If Gemini says "There is a diagram here"
        if (q.has_diagram && q.box_2d && q.pageUri) {
          try {
            // Get real image size
            const { width: imgW, height: imgH } = await new Promise((resolve) => {
                 Image.getSize(q.pageUri, (w, h) => resolve({width: w, height: h}), () => resolve({width: 1000, height: 1000}));
            }) as any;

            const [ymin, xmin, ymax, xmax] = q.box_2d;
            
            // Calculate Crop Rectangle
            const cropConfig = {
              originX: (xmin / 1000) * imgW,
              originY: (ymin / 1000) * imgH,
              width: ((xmax - xmin) / 1000) * imgW,
              height: ((ymax - ymin) / 1000) * imgH
            };

            // Perform the Cut
            const cropResult = await ImageManipulator.manipulateAsync(
              q.pageUri,
              [{ crop: cropConfig }],
              { compress: 1, format: ImageManipulator.SaveFormat.PNG }
            );

            // Save the new image URI to the question object
            finalQ.diagramUri = cropResult.uri;
            console.log("Cropped Diagram:", cropResult.uri);

          } catch (e) {
            console.error("Crop Failed", e);
          }
        }
        processedQuestions.push(finalQ);
      }

      // Step C: Go to Editor with the cropped images
      router.push({
        pathname: "/editor",
        params: { initialData: JSON.stringify(processedQuestions) }
      });

    } catch (e) {
      Alert.alert("Analysis Failed", "Please try again.");
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderItem = ({ item, index }: { item: ScannedPage, index: number }) => (
    <TouchableOpacity onPress={() => handleImagePress(item, index)} style={styles.card}>
      <Image 
        source={{ uri: item.uri }} 
        style={[styles.thumbnail, { transform: [{ rotate: `${item.rotation}deg` }] }]} 
      />
      <View style={styles.pageNumberBadge}>
        <Text style={styles.pageNumberText}>{index + 1}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <View style={{alignItems:'center'}}>
          <Text style={styles.headerTitle}>New Exam</Text>
          <Text style={styles.headerSub}>{pages.length} pages</Text>
        </View>
        <View style={{width:60}} />
      </View>

      {pages.length === 0 ? (
        <View style={styles.emptyState}>
          <TouchableOpacity onPress={handleOpenScanner} style={styles.emptyIconCircle}>
            <Ionicons name="camera-outline" size={40} color="#9CA3AF" />
          </TouchableOpacity>
          <Text style={styles.emptyTitle}>No scans yet</Text>
          <Text style={styles.emptySub}>Tap camera to start.</Text>
        </View>
      ) : (
        <FlatList
          data={pages}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${index}-${item.uri}`} 
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
        />
      )}

      <View style={styles.fabContainer}>
        {pages.length > 0 && (
          <TouchableOpacity onPress={handleAnalyze} disabled={isAnalyzing} style={styles.analyzeBtn}>
            {isAnalyzing ? <ActivityIndicator color="black"/> : <><Text style={styles.analyzeText}>Analyze All</Text><Ionicons name="sparkles" size={18} color="black" style={{marginLeft:8}}/></>}
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleOpenScanner} style={styles.cameraFab}>
          <Ionicons name="camera" size={28} color="white" />
        </TouchableOpacity>
      </View>

      <Modal visible={!!selectedImage} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSelectedImage(null)} />
          <View style={styles.modalContent}>
            {selectedImage && (
              <Image 
                source={{ uri: selectedImage.uri }} 
                style={[styles.fullImage, { transform: [{ rotate: `${selectedImage.rotation}deg` }] }]} 
                resizeMode="contain" 
              />
            )}
            <View style={styles.modalControls}>
              <View style={styles.modalHeaderControl}>
                 <TouchableOpacity 
                   onPress={() => handleMovePage('left')} 
                   disabled={selectedIndex === 0}
                   style={[styles.miniBtn, selectedIndex === 0 && { opacity: 0.3 }]}
                 >
                   <Ionicons name="arrow-back" size={20} color="white" />
                 </TouchableOpacity>
                 <Text style={styles.modalTitle}>Page {selectedIndex + 1}</Text>
                 <TouchableOpacity 
                   onPress={() => handleMovePage('right')} 
                   disabled={selectedIndex === pages.length - 1}
                   style={[styles.miniBtn, selectedIndex === pages.length - 1 && { opacity: 0.3 }]}
                 >
                   <Ionicons name="arrow-forward" size={20} color="white" />
                 </TouchableOpacity>
              </View>
              <View style={styles.modalActionRow}>
                <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.controlBtn}>
                  <Ionicons name="close" size={24} color="white" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRotate} style={styles.controlBtn}>
                  <Ionicons name="refresh" size={24} color="white" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeletePage} style={[styles.controlBtn, {backgroundColor:'#EF4444'}]}>
                  <Ionicons name="trash" size={22} color="white" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backText: { color: '#1F2937', fontSize: 16, marginLeft: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#9CA3AF' },
  grid: { padding: 16, paddingBottom: 120 },
  card: { flex: 1, height: 220, borderRadius: 12, backgroundColor: '#E5E7EB', overflow: 'hidden', marginBottom: 12 },
  thumbnail: { width: '100%', height: '100%', resizeMode: 'cover' },
  pageNumberBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  pageNumberText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  fabContainer: { position: 'absolute', bottom: 30, right: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  analyzeBtn: { backgroundColor: '#fbbf24', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, height: 56, borderRadius: 28, elevation: 4 },
  analyzeText: { fontWeight: 'bold', fontSize: 16, color: 'black' },
  cameraFab: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalContent: { width: '100%', height: '100%', justifyContent: 'center' },
  fullImage: { flex: 1, width: '100%' },
  modalControls: { position: 'absolute', bottom: 40, left: 20, right: 20 },
  modalHeaderControl: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, gap: 20 },
  modalActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(50,50,50,0.9)', borderRadius: 50, padding: 10, paddingHorizontal: 20 },
  miniBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  controlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  modalTitle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
});