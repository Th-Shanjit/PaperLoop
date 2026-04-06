import React, { useState, useCallback } from 'react';
import { 
  View, Text, Image, TouchableOpacity, FlatList, 
  StyleSheet, Modal, StatusBar, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Dimensions 
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { getSessionPages, removePageFromSession, updatePageInSession, swapPagesInSession, clearSession, ScannedPage, currentSessionPages } from '../core/store/session';
import { transcribeHandwriting } from '../core/services/gemini';
import { deductScanToken, getAppSettings } from '../core/services/storage';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { usePostHog } from 'posthog-react-native';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

export default function WorkspaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedImage, setSelectedImage] = useState<ScannedPage | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('');   
  const [reorderModalVisible, setReorderModalVisible] = useState(false);
  const [targetIndex, setTargetIndex] = useState<string>("");
  const [sourceIndex, setSourceIndex] = useState<number | null>(null);
  const [tokensLeft, setTokensLeft] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setPages([...getSessionPages()]);
      
      // Clean, instant token fetch
      getAppSettings().then(settings => {
        setTokensLeft(settings.scanTokens || 0);
      });
    }, [])
  );

  const handleOpenScanner = () => {
    router.push("/camera");
  };

  const handleExit = () => {
    showAlert("Discard Scan?", "Going home will clear these pages.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: async () => {
        await clearSession();
        router.replace("/");
      }}
    ]);
  };

  const handleDeletePage = async (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // <--- Add this!
    await removePageFromSession(index);
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

    // --- THE STOP LOSS GUARD ---
    const settings = await getAppSettings();
    const currentTokens = settings.scanTokens || 0;
    
    // If they aren't Pro, and they are trying to scan more pages than they can afford:
    if (!settings.isPro && pages.length > currentTokens) {
      showAlert(
        "Not Enough Scans", 
        `You are trying to analyze ${pages.length} page(s), but you only have ${currentTokens} scan(s) left.\n\nPlease top up in the Settings menu or remove some pages.`,
        [{ text: "OK", style: "default" }]
      );
      return;
    }
    // ---------------------------

    setIsAnalyzing(true);
    setScanStatus('Warming up AI engine...'); 
    
    try {
      const startTime = Date.now();
      const result = await transcribeHandwriting(
        pages.map(p => ({ uri: p.localUri, width: p.width, height: p.height })),
        (msg) => setScanStatus(msg)
      );
      posthog?.capture('ai_scan_success', {
        duration_seconds: (Date.now() - startTime) / 1000,
      });
      
      // 1. Count the total questions found across all scanned pages
      let totalQuestions = 0;
      if (result.sections) {
        result.sections.forEach((s: any) => totalQuestions += (s.questions?.length || 0));
      } else if (result.questions) {
        totalQuestions = result.questions.length;
      }

      // --- THE CORE PROCESSING LOGIC ---
      const finishProcessing = async () => {
        try {
          // CHARGE THE TOLL: Deduct 1 token for each successful page in the batch
          for (let i = 0; i < pages.length; i++) {
            await deductScanToken();
          }

          const processDiagramCrop = async (q: any, qIndex: number) => {
            let finalQ = { ...q };
            if (q.has_diagram && q.box_2d && q.pageUri) {
              try {
                setScanStatus(`Cropping diagram ${qIndex + 1}...`); 
                const { width: imgW, height: imgH } = await new Promise((resolve) => {
                     Image.getSize(q.pageUri, (w, h) => resolve({width: w, height: h}), () => resolve({width: 1000, height: 1000}));
                }) as any;

                const [ymin, xmin, ymax, xmax] = q.box_2d;
                const paddingX = Math.max(imgW * 0.05, 50);
                const paddingY = Math.max(imgH * 0.05, 50);

                const finalX = Math.max(0, (xmin / 1000) * imgW - paddingX);
                const finalY = Math.max(0, (ymin / 1000) * imgH - paddingY);
                const boxW = ((xmax - xmin) / 1000) * imgW;
                const finalW = Math.min(imgW - finalX, boxW + (paddingX * 2));
                const boxH = ((ymax - ymin) / 1000) * imgH;
                const finalH = Math.min(imgH - finalY, boxH + (paddingY * 2));

                if (finalW > 0 && finalH > 0) {
                  const cropConfig = { originX: finalX, originY: finalY, width: finalW, height: finalH };
                  const cropResult = await ImageManipulator.manipulateAsync(
                    q.pageUri, [{ crop: cropConfig }], { compress: 1, format: ImageManipulator.SaveFormat.PNG }
                  );
                  const diagDir = FileSystem.documentDirectory + 'diagrams/';
                  const dirInfo = await FileSystem.getInfoAsync(diagDir);
                  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(diagDir, { intermediates: true });
                  
                  const permanentUri = diagDir + `diagram_${Date.now()}_${qIndex}.png`;
                  await FileSystem.copyAsync({ from: cropResult.uri, to: permanentUri });
                  finalQ.localUri = permanentUri;
                }
              } catch (e) { console.error("❌ Crop Failed for Q" + (qIndex + 1), e); }
            }
            return finalQ;
          };

          if (result.sections && result.sections.length > 0) {
            const processedSections = [];
            let globalQIndex = 0;
            for (const section of result.sections) {
              const processedQuestions = [];
              for (const q of section.questions) {
                const processed = await processDiagramCrop(q, globalQIndex);
                processedQuestions.push(processed);
                globalQIndex++;
              }
              processedSections.push({ ...section, questions: processedQuestions });
            }
            router.push({ pathname: "/editor", params: { initialData: JSON.stringify(processedSections), isSectionData: "true" } });
          } else if (result.questions) {
            const processedQuestions = [];
            for (let i = 0; i < result.questions.length; i++) {
              const processed = await processDiagramCrop(result.questions[i], i);
              processedQuestions.push(processed);
            }
            router.push({ pathname: "/editor", params: { initialData: JSON.stringify(processedQuestions) } });
          } else {
            showAlert("Error", "No questions detected.");
          }
        } catch (e) {
          showAlert("Analysis Failed", "Please try again.");
          console.error(e);
        } finally {
          setIsAnalyzing(false);
          setScanStatus(''); 
        }
      };

      // --- THE FAIRNESS RULES ---

      // Rule 1: Zero Questions Found (Total Failure)
      if (totalQuestions === 0) {
        showAlert("Scan Failed", "We couldn't detect any questions on these pages. Please try taking brighter photos.\n\n(No scan tokens were deducted).");
        setIsAnalyzing(false);
        setScanStatus('');
        return;
      }

      // Rule 2: Low Yield (<= 2 questions)
      if (totalQuestions <= 2) {
        showAlert(
          "Low Questions Detected", 
          `We only found ${totalQuestions} question(s) across ${pages.length} page(s). Do you want to keep this (Costs ${pages.length} Token(s)) or discard and try again (Free)?`,
          [
            { text: "Discard (Free)", style: "cancel", onPress: () => {
                setIsAnalyzing(false);
                setScanStatus('');
            }},
            { text: `Keep (-${pages.length} Tokens)`, onPress: () => {
                setScanStatus('Finalizing...');
                finishProcessing();
            }}
          ]
        );
        return;
      }

      // Rule 3: Success! Run the processing and charge the tokens.
      await finishProcessing();

    } catch (e: any) {
      posthog?.capture('ai_scan_failed', {
        error_message: e?.message ?? String(e),
      });
      showAlert("Analysis Failed", "Please try again.");
      console.error(e);
      setIsAnalyzing(false);
      setScanStatus('');
    }
  };

  const cardWidth = (Dimensions.get('window').width - 16 * 2 - 10) / 2;

  const renderItem = ({ item, index }: { item: ScannedPage, index: number }) => (
    <View style={[styles.card, { width: cardWidth }]}>
      <TouchableOpacity onPress={() => setSelectedImage(item)} style={styles.cardImageContainer}>
        <Image 
          source={{ uri: item.localUri }} 
          style={[styles.thumbnail, { transform: [{ rotate: `${item.rotation}deg` }] }]} 
        />
        <View style={styles.pageBadgeOverlay}>
          <Text style={styles.pageText}>Pg {index + 1}</Text>
        </View>
      </TouchableOpacity>
      
      <View style={styles.cardToolbar}>
        <TouchableOpacity onPress={() => openReorder(index)} style={styles.reorderBtn}>
           <Ionicons name="swap-vertical" size={14} color={colors.primary.normal} />
           <Text style={styles.reorderText}>Move</Text>
        </TouchableOpacity>

        <View style={{flexDirection:'row', gap: 6}}>
          <TouchableOpacity onPress={() => handleRotatePage(index)} style={styles.miniBtn} accessibilityLabel="Rotate page">
            <Ionicons name="refresh" size={14} color={colors.label.alternative} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeletePage(index)} style={[styles.miniBtn, {backgroundColor: colors.status.negativeBg}]} accessibilityLabel="Delete page">
            <Ionicons name="trash" size={14} color={colors.status.negative} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background.alternative} />
      <View style={styles.header}>
        {pages.length > 0 ? (
          <TouchableOpacity onPress={handleExit} style={styles.backBtn} accessibilityLabel="Discard and go home">
            <Ionicons name="close" size={24} color={colors.label.normal} />
            <Text style={styles.backText}>Discard</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.replace("/")} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={colors.label.normal} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}
        <View style={{alignItems:'center'}}>
          <Text style={styles.headerTitle}>Workspace</Text>
          {pages.length > 0 && <Text style={styles.headerSub}>{pages.length} scanned</Text>}
        </View>
        <View style={{width:80}} />
      </View>

      {pages.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateHeading}>Create New Exam</Text>
          <Text style={styles.emptyStateSub}>Choose how you want to start</Text>

          <TouchableOpacity onPress={handleOpenScanner} style={styles.actionCard}>
            <View style={[styles.actionIconBg, { backgroundColor: colors.accent.blue.bg }]}>
              <Ionicons name="scan" size={32} color={colors.primary.normal} />
            </View>
            <View style={styles.actionTextContent}>
              <Text style={styles.actionTitle}>Scan a Worksheet</Text>
              <Text style={styles.actionDesc}>Use camera or gallery to AI-digitize</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.interaction.inactive} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push({ pathname: "/editor", params: { initialData: JSON.stringify([]) } })} style={styles.actionCard}>
            <View style={[styles.actionIconBg, { backgroundColor: colors.background.alternative }]}>
              <Ionicons name="document-text" size={32} color={colors.label.alternative} />
            </View>
            <View style={styles.actionTextContent}>
              <Text style={styles.actionTitle}>Start Blank Exam</Text>
              <Text style={styles.actionDesc}>Create from scratch using the editor</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.interaction.inactive} />
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={pages}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${index}-${item.localUri}`} 
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 140 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {pages.length > 0 && (
        <View style={[styles.fabContainer, { paddingBottom: Platform.OS === 'ios' ? 24 : 16 }]}>
           <TouchableOpacity onPress={handleOpenScanner} style={styles.addBtn}>
              <Ionicons name="camera" size={20} color={colors.primary.normal} />
              <Text style={styles.addBtnText}>Add Page</Text>
           </TouchableOpacity>

           <View style={{flex: 1, marginLeft: spacing.md}}>
             <Text style={{fontSize: 11, fontWeight: '600', color: colors.label.alternative, textAlign: 'center', marginBottom: 4}}>
               {tokensLeft} Scans Remaining
             </Text>
             <TouchableOpacity onPress={handleAnalyze} disabled={isAnalyzing} style={styles.analyzeBtn}>
               {isAnalyzing ? <ActivityIndicator color={colors.static.white}/> : (
                 <>
                   <Text style={styles.analyzeText}>Analyze {pages.length} Pages</Text>
                   <Ionicons name="arrow-forward" size={18} color={colors.static.white} style={{marginLeft: 6}}/>
                 </>
               )}
             </TouchableOpacity>
           </View>
        </View>
      )}

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
              <TouchableOpacity onPress={confirmReorder} style={[styles.dialogBtn, {backgroundColor: colors.primary.normal}]}>
                <Text style={[styles.dialogBtnText, {color: colors.static.white}]}>Move</Text>
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
                source={{ uri: selectedImage.localUri }} 
                style={[styles.fullImage, { transform: [{ rotate: `${selectedImage.rotation}deg` }] }]} 
                resizeMode="contain" 
              />
            )}
            <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.fsClose} accessibilityLabel="Close preview">
              <Ionicons name="close" size={24} color={colors.label.strong} />
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
                <ActivityIndicator size="small" color={colors.static.white} />
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
                    {isDone ? <Text style={styles.stepDotText}>✓</Text> : isActive ? <ActivityIndicator size="small" color={colors.static.white} style={{ transform: [{ scale: 0.6 }] }} /> : <Text style={styles.stepDotText}>{index + 1}</Text>}
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

      <CustomAlert {...alertState} onClose={closeAlert} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.alternative },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.background.normal, borderBottomWidth: 1, borderColor: colors.line.normal },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 80 },
  backText: { color: colors.label.normal, fontSize: 15, fontWeight: '600', marginLeft: 4 },
  headerTitle: { ...typography.heading3, color: colors.label.normal },
  headerSub: { ...typography.caption, color: colors.label.alternative },
  grid: { padding: spacing.lg, paddingBottom: 140 },
  card: { backgroundColor: colors.background.normal, borderRadius: radii.lg, marginBottom: spacing.md, overflow: 'hidden', ...shadows.small },
  cardImageContainer: { height: 130, backgroundColor: colors.fill.normal, position: 'relative' },
  thumbnail: { width: '100%', height: '100%', resizeMode: 'contain' },
  pageBadgeOverlay: { position: 'absolute', top: spacing.sm, left: spacing.sm, backgroundColor: colors.primary.normal, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm },
  pageText: { color: colors.static.white, fontWeight: '800', fontSize: 10 },
  cardToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.sm, borderTopWidth: 1, borderColor: colors.line.alternative },
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  reorderText: { fontSize: 11, fontWeight: '600', color: colors.primary.normal },
  miniBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.fill.normal, justifyContent: 'center', alignItems: 'center' },
  fabContainer: { backgroundColor: colors.background.normal, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: colors.line.normal },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.normal, paddingHorizontal: spacing.lg, height: 48, borderRadius: radii.full, borderWidth: 1, borderColor: colors.primary.normal },
  addBtnText: { color: colors.primary.normal, fontWeight: '700', fontSize: 14, marginLeft: 6 },
  analyzeBtn: { flex: 1, backgroundColor: colors.primary.normal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: radii.full, ...shadows.small },
  analyzeText: { fontWeight: '800', fontSize: 15, color: colors.static.white },
  emptyStateContainer: { flex: 1, padding: spacing.xxl, justifyContent: 'center' },
  emptyStateHeading: { ...typography.heading1, color: colors.label.normal, marginBottom: spacing.sm, textAlign: 'center' },
  emptyStateSub: { ...typography.body, color: colors.label.alternative, marginBottom: spacing.xxxl, textAlign: 'center' },
  actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.normal, padding: spacing.xl, borderRadius: radii.lg, marginBottom: spacing.lg, ...shadows.small, borderWidth: 1, borderColor: colors.line.alternative },
  actionIconBg: { width: 56, height: 56, borderRadius: radii.lg, justifyContent: 'center', alignItems: 'center', marginRight: spacing.lg },
  actionTextContent: { flex: 1 },
  actionTitle: { ...typography.heading4, color: colors.label.normal, marginBottom: 4 },
  actionDesc: { ...typography.bodySmall, color: colors.label.alternative },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.xxl, width: '100%', maxWidth: 340 },
  dialogTitle: { ...typography.heading2, marginBottom: spacing.sm, color: colors.label.normal },
  dialogSub: { ...typography.body, color: colors.label.alternative, marginBottom: spacing.xl },
  dialogInput: { backgroundColor: colors.fill.normal, fontSize: 24, fontWeight: 'bold', textAlign: 'center', padding: spacing.lg, borderRadius: radii.md, marginBottom: spacing.xl, color: colors.label.normal },
  dialogActions: { flexDirection: 'row', gap: spacing.md },
  dialogBtn: { flex: 1, padding: 14, borderRadius: radii.md, alignItems: 'center', backgroundColor: colors.fill.normal },
  dialogBtnText: { fontWeight: 'bold', color: colors.label.normal },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  fsContent: { width: '92%', height: '80%', backgroundColor: colors.background.normal, borderRadius: radii.lg, overflow: 'hidden' },
  fullImage: { width: '100%', height: '100%' },
  fsClose: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 8 },

  // --- Scan Progress Overlay ---
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingBox: { backgroundColor: colors.background.normal, borderRadius: radii.xxl, padding: 28, width: 300, ...shadows.large },
  loadingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  loadingIconRing: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary.normal, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  loadingTitle: { fontSize: 17, fontWeight: '800', color: colors.label.normal },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, position: 'relative' },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.line.normal, justifyContent: 'center', alignItems: 'center', marginRight: 12, zIndex: 1 },
  stepDotActive: { backgroundColor: colors.primary.normal },
  stepDotDone: { backgroundColor: colors.status.positive },
  stepDotText: { fontSize: 11, fontWeight: '700', color: colors.label.assistive },
  stepLabel: { fontSize: 14, fontWeight: '500', color: colors.label.assistive, flex: 1 },
  stepLabelActive: { color: colors.primary.normal, fontWeight: '700' },
  stepLabelDone: { color: colors.status.positive, fontWeight: '600' },
  stepConnector: { position: 'absolute', left: 13, top: 28, width: 2, height: 14, backgroundColor: colors.line.normal, zIndex: 0 },
  stepConnectorDone: { backgroundColor: colors.status.positive },
  loadingStatusText: { marginTop: 12, fontSize: 12, color: colors.label.alternative, fontWeight: '500', textAlign: 'center' }
});