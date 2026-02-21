import React, { useState, useCallback } from 'react';
import { 
  View, Text, Image, TouchableOpacity, FlatList, 
  StyleSheet, Modal, StatusBar, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getSessionPages, removePageFromSession, updatePageInSession, swapPagesInSession, clearSession, ScannedPage, currentSessionPages } from '../core/store/session';
import { transcribeHandwriting } from '../core/services/gemini';

export default function WorkspaceScreen() {
  const router = useRouter();
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedImage, setSelectedImage] = useState<ScannedPage | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('');   
  const [reorderModalVisible, setReorderModalVisible] = useState(false);
  const [targetIndex, setTargetIndex] = useState<string>("");
  const [sourceIndex, setSourceIndex] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      setPages([...getSessionPages()]);
    }, [])
  );

  const handleOpenScanner = () => {
    router.push("/camera");
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

  const handleDeletePage = (index: number) => {
    removePageFromSession(index);
    setPages([...getSessionPages()]);
  };

  const handleRotatePage = (index: number) => {
    const p = pages[index];
    const newRot = (p.rotation + 90) % 360;
    updatePageInSession(index, { rotation: newRot });
    setPages([...getSessionPages()]);
  };

  const handleSwap = (index: number, direction: 'left' | 'right') => {
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;
    swapPagesInSession(index, newIndex);
    setPages([...getSessionPages()]);
  };

  const openReorder = (index: number) => {
    setSourceIndex(index);
    setTargetIndex((index + 1).toString());
    setReorderModalVisible(true);
  };

  const confirmReorder = () => {
    const target = parseInt(targetIndex) - 1;
    if (sourceIndex !== null && !isNaN(target) && target >= 0 && target < pages.length) {
      const item = currentSessionPages.splice(sourceIndex, 1)[0];
      currentSessionPages.splice(target, 0, item);
      setPages([...currentSessionPages]);
    }
    setReorderModalVisible(false);
  };

  const handleAnalyze = async () => {
    if (pages.length === 0) return;
    setIsAnalyzing(true);
    setScanStatus('Warming up AI engine...'); // Trigger the overlay
    
    try {
      // Pass the callback here!
      const result = await transcribeHandwriting(pages, (msg) => setScanStatus(msg));
      
      // Process diagrams for cropping (works for both sections and questions)
      const processDiagramCrop = async (q: any, qIndex: number) => {
        let finalQ = { ...q };
        if (q.has_diagram && q.box_2d && q.pageUri) {
          try {
            setScanStatus(`Cropping diagram ${qIndex + 1}...`); // Feed diagram cropping status too!
            console.log(`🔍 Cropping diagram for Q${qIndex + 1}, box_2d:`, q.box_2d, "from:", q.pageUri);

            const { width: imgW, height: imgH } = await new Promise((resolve) => {
                 Image.getSize(q.pageUri, (w, h) => resolve({width: w, height: h}), () => resolve({width: 1000, height: 1000}));
            }) as any;

            console.log(`📐 Image dimensions: ${imgW}x${imgH}`);

            const [ymin, xmin, ymax, xmax] = q.box_2d;
            
            // --- HYBRID PADDING STRATEGY ---
            const paddingX = Math.max(imgW * 0.05, 50);
            const paddingY = Math.max(imgH * 0.05, 50);

            const finalX = Math.max(0, (xmin / 1000) * imgW - paddingX);
            const finalY = Math.max(0, (ymin / 1000) * imgH - paddingY);
            const boxW = ((xmax - xmin) / 1000) * imgW;
            const finalW = Math.min(imgW - finalX, boxW + (paddingX * 2));
            const boxH = ((ymax - ymin) / 1000) * imgH;
            const finalH = Math.min(imgH - finalY, boxH + (paddingY * 2));

            // Validate crop dimensions
            if (finalW <= 0 || finalH <= 0) {
              console.error(`❌ Invalid crop dimensions: ${finalW}x${finalH}`);
              return finalQ;
            }

            const cropConfig = { originX: finalX, originY: finalY, width: finalW, height: finalH };
            console.log(`✂️ Crop config:`, cropConfig);

            const cropResult = await ImageManipulator.manipulateAsync(
              q.pageUri,
              [{ crop: cropConfig }],
              { compress: 1, format: ImageManipulator.SaveFormat.PNG }
            );

            // Save to permanent location so it survives until PDF export
            const diagDir = FileSystem.documentDirectory + 'diagrams/';
            const dirInfo = await FileSystem.getInfoAsync(diagDir);
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(diagDir, { intermediates: true });
            
            const permanentUri = diagDir + `diagram_${Date.now()}_${qIndex}.png`;
            await FileSystem.copyAsync({ from: cropResult.uri, to: permanentUri });
            
            finalQ.diagramUri = permanentUri;
            console.log(`✅ Diagram saved: ${permanentUri}`);
          } catch (e) { console.error("❌ Crop Failed for Q" + (qIndex + 1), e); }
        } else if (q.has_diagram && !q.box_2d) {
          console.warn(`⚠️ Q${qIndex + 1} has_diagram=true but NO box_2d returned by Gemini`);
        }
        return finalQ;
      };

      // Check if we have sections (new format) or questions (old format)
      if (result.sections && result.sections.length > 0) {
        // NEW FORMAT: Process sections
        const processedSections = [];
        let globalQIndex = 0;
        for (const section of result.sections) {
          const processedQuestions = [];
          for (const q of section.questions) {
            const processed = await processDiagramCrop(q, globalQIndex);
            processedQuestions.push(processed);
            globalQIndex++;
          }
          processedSections.push({
            ...section,
            questions: processedQuestions
          });
        }

        console.log(`📋 Processed ${globalQIndex} questions across ${processedSections.length} sections`);

        // PASS SECTIONS to Editor
        router.push({
          pathname: "/editor",
          params: { 
            initialData: JSON.stringify(processedSections),
            isSectionData: "true"
          }
        });
      } else if (result.questions) {
        // OLD FORMAT: Process flat questions list
        const processedQuestions = [];
        for (let i = 0; i < result.questions.length; i++) {
          const processed = await processDiagramCrop(result.questions[i], i);
          processedQuestions.push(processed);
        }

        router.push({
          pathname: "/editor",
          params: { initialData: JSON.stringify(processedQuestions) }
        });
      } else {
        Alert.alert("Error", "No questions detected.");
      }

    } catch (e) {
      Alert.alert("Analysis Failed", "Please try again.");
      console.error(e);
    } finally {
      setIsAnalyzing(false);
      setScanStatus(''); // Close the overlay
    }
  };

  const renderItem = ({ item, index }: { item: ScannedPage, index: number }) => (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setSelectedImage(item)} style={styles.cardImageContainer}>
        <Image 
          source={{ uri: item.uri }} 
          style={[styles.thumbnail, { transform: [{ rotate: `${item.rotation}deg` }] }]} 
        />
      </TouchableOpacity>
      
      <View style={styles.cardToolbar}>
        <TouchableOpacity onPress={() => openReorder(index)} style={styles.pageBadge}>
           <Text style={styles.pageText}>Pg {index + 1}</Text>
           <Ionicons name="create-outline" size={12} color="white" style={{marginLeft:4}} />
        </TouchableOpacity>

        <View style={{flexDirection:'row', gap: 8}}>
          <TouchableOpacity onPress={() => handleSwap(index, 'left')} disabled={index===0} style={styles.miniBtn}>
            <Ionicons name="caret-back" size={16} color={index===0 ? "#ccc" : "#555"} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleSwap(index, 'right')} disabled={index===pages.length-1} style={styles.miniBtn}>
            <Ionicons name="caret-forward" size={16} color={index===pages.length-1 ? "#ccc" : "#555"} />
          </TouchableOpacity>
        </View>

        <View style={{flexDirection:'row', gap: 8}}>
          <TouchableOpacity onPress={() => handleRotatePage(index)} style={styles.miniBtn}>
            <Ionicons name="refresh" size={16} color="#555" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeletePage(index)} style={[styles.miniBtn, {backgroundColor:'#fee2e2'}]}>
            <Ionicons name="trash" size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.backBtn}>
          <Ionicons name="close" size={24} color="#1F2937" />
          <Text style={styles.backText}>Discard</Text>
        </TouchableOpacity>
        <View style={{alignItems:'center'}}>
          <Text style={styles.headerTitle}>Review Pages</Text>
          <Text style={styles.headerSub}>{pages.length} scanned</Text>
        </View>
        <View style={{width:60}} />
      </View>

      {pages.length === 0 ? (
        <View style={styles.emptyState}>
          <TouchableOpacity onPress={handleOpenScanner} style={styles.emptyIconCircle}>
            <Ionicons name="camera-outline" size={40} color="#9CA3AF" />
          </TouchableOpacity>
          <Text style={styles.emptyTitle}>No pages yet</Text>
        </View>
      ) : (
        <FlatList
          data={pages}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${index}-${item.uri}`} 
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.fabContainer}>
         <TouchableOpacity onPress={handleOpenScanner} style={styles.addBtn}>
            <Ionicons name="camera" size={24} color="#2563EB" />
            <Text style={styles.addBtnText}>Add Page</Text>
         </TouchableOpacity>

         {pages.length > 0 && (
          <TouchableOpacity onPress={handleAnalyze} disabled={isAnalyzing} style={styles.analyzeBtn}>
            {isAnalyzing ? <ActivityIndicator color="white"/> : (
              <>
                <Text style={styles.analyzeText}>Analyze {pages.length} Pages</Text>
                <Ionicons name="arrow-forward" size={20} color="white" style={{marginLeft:8}}/>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={reorderModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Move Page</Text>
            <Text style={styles.dialogSub}>Enter new position number (1 - {pages.length})</Text>
            <TextInput 
              style={styles.dialogInput}
              value={targetIndex}
              onChangeText={setTargetIndex}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.dialogActions}>
              <TouchableOpacity onPress={() => setReorderModalVisible(false)} style={styles.dialogBtn}>
                <Text style={styles.dialogBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmReorder} style={[styles.dialogBtn, {backgroundColor:'#2563EB'}]}>
                <Text style={[styles.dialogBtnText, {color:'white'}]}>Move</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!selectedImage} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSelectedImage(null)} />
          <View style={styles.fsContent}>
            {selectedImage && (
              <Image 
                source={{ uri: selectedImage.uri }} 
                style={[styles.fullImage, { transform: [{ rotate: `${selectedImage.rotation}deg` }] }]} 
                resizeMode="contain" 
              />
            )}
            <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.fsClose}>
              <Ionicons name="close" size={24} color="black" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SCAN PROGRESS TRACKER OVERLAY */}
      {scanStatus !== '' && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <View style={styles.loadingHeader}>
              <View style={styles.loadingIconRing}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
              <Text style={styles.loadingTitle}>Scanning Pages</Text>
            </View>

            {[
              { key: 'Optimizing', label: 'Optimizing images',   icon: '⚡' },
              { key: 'AI reading', label: 'AI reading text',     icon: '🔍' },
              { key: 'Formatting', label: 'Formatting results',  icon: '✏️' },
              { key: 'Finalizing', label: 'Finalizing exam',     icon: '✅' },
              { key: 'Cropping',   label: 'Extracting diagrams', icon: '✂️' }
            ].map((step, index) => {
              const isActive    = scanStatus.toLowerCase().includes(step.key.toLowerCase());
              const stepOrder   = ['Optimizing', 'AI reading', 'Formatting', 'Finalizing', 'Cropping'];
              const activeIndex = stepOrder.findIndex(k => scanStatus.toLowerCase().includes(k.toLowerCase()));
              const isDone      = activeIndex > index;

              return (
                <View key={step.key} style={styles.stepRow}>
                  <View style={[styles.stepDot, isDone && styles.stepDotDone, isActive && styles.stepDotActive]}>
                    {isDone ? <Text style={styles.stepDotText}>✓</Text> : isActive ? <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.6 }] }} /> : <Text style={styles.stepDotText}>{index + 1}</Text>}
                  </View>
                  <Text style={[styles.stepLabel, isDone && styles.stepLabelDone, isActive && styles.stepLabelActive]}>
                    {step.icon} {step.label}
                  </Text>
                  {index < 4 && <View style={[styles.stepConnector, isDone && styles.stepConnectorDone]} />}
                </View>
              );
            })}
            <Text style={styles.loadingStatusText}>{scanStatus}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 80 },
  backText: { color: '#1F2937', fontSize: 16, marginLeft: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280' },
  grid: { padding: 16, paddingBottom: 120 },
  card: { backgroundColor: 'white', borderRadius: 12, marginBottom: 16, overflow: 'hidden', elevation: 2, shadowColor: "#000", shadowOpacity: 0.05 },
  cardImageContainer: { height: 200, backgroundColor: '#E5E7EB' },
  thumbnail: { width: '100%', height: '100%', resizeMode: 'contain' },
  cardToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderTopWidth: 1, borderColor: '#F3F4F6' },
  pageBadge: { backgroundColor: '#2563EB', flexDirection:'row', alignItems:'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  pageText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  miniBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  fabContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#E5E7EB' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 20, height: 50, borderRadius: 25 },
  addBtnText: { color: '#2563EB', fontWeight: 'bold', marginLeft: 8 },
  analyzeBtn: { flex: 1, marginLeft: 16, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 25, shadowColor: "#000", shadowOpacity: 0.2, elevation: 3 },
  analyzeText: { fontWeight: 'bold', fontSize: 16, color: 'white' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 },
  dialogTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: '#111' },
  dialogSub: { fontSize: 14, color: '#666', marginBottom: 20 },
  dialogInput: { backgroundColor: '#F3F4F6', fontSize: 24, fontWeight: 'bold', textAlign: 'center', padding: 16, borderRadius: 12, marginBottom: 20 },
  dialogActions: { flexDirection: 'row', gap: 12 },
  dialogBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  dialogBtnText: { fontWeight: 'bold', color: '#333' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  fsContent: { width: '90%', height: '80%', backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' },
  fullImage: { width: '100%', height: '100%' },
  fsClose: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 20, padding: 8 },

  // --- Scan Progress Overlay ---
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingBox: { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: 300, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 },
  loadingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  loadingIconRing: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  loadingTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, position: 'relative' },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginRight: 12, zIndex: 1 },
  stepDotActive: { backgroundColor: '#2563EB' },
  stepDotDone: { backgroundColor: '#16A34A' },
  stepDotText: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  stepLabel: { fontSize: 14, fontWeight: '500', color: '#9CA3AF', flex: 1 },
  stepLabelActive: { color: '#2563EB', fontWeight: '700' },
  stepLabelDone: { color: '#16A34A', fontWeight: '600' },
  stepConnector: { position: 'absolute', left: 13, top: 28, width: 2, height: 14, backgroundColor: '#E5E7EB', zIndex: 0 },
  stepConnectorDone: { backgroundColor: '#16A34A' },
  loadingStatusText: { marginTop: 12, fontSize: 12, color: '#6B7280', fontWeight: '500', textAlign: 'center' }
});