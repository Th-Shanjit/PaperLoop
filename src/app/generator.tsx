import React, { useState, useEffect } from 'react';
import { 
  View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, 
  Dimensions, TextInput, KeyboardAvoidingView, Platform, Modal, StyleSheet
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { transcribeHandwriting } from '../core/services/gemini';
import { generateExamPDF, TemplateType } from '../core/services/pdf';
import { saveExam } from '../core/services/storage';
import { usePostHog } from 'posthog-react-native';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

const { width } = Dimensions.get('window');
const IMAGE_SIZE = (width - 48) / 2;

export default function GeneratorScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
  
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isMathMode, setIsMathMode] = useState(false);

  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('simple');
  const [pdfHeader, setPdfHeader] = useState({
    schoolName: "Greenwood High School",
    examTitle: "Unit Test I",
    duration: "1 Hour",
    totalMarks: "25",
    instructions: "All questions are compulsory."
  });

  useEffect(() => {
    const incoming = (global as any).scannedImages;
    const mathMode = (global as any).isMathMode;
    if (incoming && incoming.length > 0) setImages(incoming);
    if (mathMode !== undefined) setIsMathMode(mathMode);
  }, []);

  const handleImageTap = (index: number) => {
    if (selectedIdx === null) {
      setSelectedIdx(index);
    } else if (selectedIdx === index) {
      setSelectedIdx(null);
    } else {
      const newImages = [...images];
      const temp = newImages[selectedIdx];
      newImages[selectedIdx] = newImages[index];
      newImages[index] = temp;
      setImages(newImages);
      setSelectedIdx(null);
    }
  };

  const handleRemoveImage = () => {
    if (selectedIdx !== null) {
      const newImages = images.filter((_, i) => i !== selectedIdx);
      setImages(newImages);
      setSelectedIdx(null);
      (global as any).scannedImages = newImages;
    }
  };

  const handleTranscribe = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setResult(null);
    setStatus("Preparing images...");
    try {
      setStatus(isMathMode ? "Math/Science Mode: Tracing structures..." : "Standard Mode: Reading handwriting...");
      const startTime = Date.now();
      const data = await transcribeHandwriting(
        images.map(uri => ({ uri })),
        (msg) => setStatus(msg)
      );
      posthog?.capture('ai_scan_success', {
        duration_seconds: (Date.now() - startTime) / 1000,
      });
      setStatus("Finalizing...");
      setResult(data);
    } catch (err: any) {
      posthog?.capture('ai_scan_failed', { error_message: err?.message ?? String(err) });
      showAlert("Error", err.message);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleOpenPDFSetup = () => {
    if (!result?.questions) return;
    setShowPdfModal(true);
  };

  const handleGenerateFinalPDF = async () => {
    setShowPdfModal(false);
    await generateExamPDF(pdfHeader, result.questions, selectedTemplate);
  };

  const handleSave = async () => {
    if (!result?.questions) return;
    const defaultName = `Exam ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const success = await saveExam(defaultName, result.questions);
    if (success) showAlert("Success", "Exam saved to History!");
  };

  const updateQuestionText = (text: string, index: number) => {
    const updatedQuestions = [...result.questions];
    updatedQuestions[index].text = text;
    setResult({ ...result, questions: updatedQuestions });
  };
  const updateQuestionMarks = (marks: string, index: number) => {
    const updatedQuestions = [...result.questions];
    updatedQuestions[index].marks = marks;
    setResult({ ...result, questions: updatedQuestions });
  };
  const deleteQuestion = (index: number) => {
    showAlert("Delete Question", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
          const updatedQuestions = result.questions.filter((_: any, i: number) => i !== index);
          setResult({ ...result, questions: updatedQuestions });
      }}
    ]);
  };
  const addQuestion = () => {
    const newQ = { id: result.questions.length + 1, text: "New question...", marks: "5" };
    setResult({ ...result, questions: [...result.questions, newQ] });
  };

  const TemplateOption = ({ type, label, icon }: { type: TemplateType, label: string, icon: React.ReactNode }) => (
    <TouchableOpacity 
      onPress={() => setSelectedTemplate(type)}
      style={[
        styles.templateOption,
        selectedTemplate === type ? styles.templateOptionActive : styles.templateOptionInactive
      ]}
    >
      <View style={styles.templateIconBox}>{icon}</View>
      <Text style={[
        styles.templateLabel,
        selectedTemplate === type ? styles.templateLabelActive : {}
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // --- LOADING VIEW ---
  if (loading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary.normal} />
      <Text style={styles.loadingTitle}>Generating Exam</Text>
      <Text style={styles.loadingStatus}>{status}</Text>
      <CustomAlert {...alertState} onClose={closeAlert} />
    </View>
  );

  // --- RESULT / EDITOR VIEW ---
  if (result) return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.resultHeader}>
        <TouchableOpacity onPress={() => setResult(null)} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.label.normal} />
        </TouchableOpacity>
        <View style={styles.resultHeaderCenter}>
          <Text style={styles.resultHeaderTitle}>Edit Exam</Text>
          <Text style={styles.resultHeaderSub}>{result.questions.length} Questions</Text>
        </View>
        <View style={styles.resultHeaderActions}>
          <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleOpenPDFSetup} style={styles.pdfBtn}>
            <Ionicons name="grid-outline" size={20} color={colors.primary.normal} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultScrollContent}>
        {result.questions?.map((q: any, i: number) => (
          <View key={i} style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <Text style={styles.questionNumber}>Q{i + 1}</Text>
              <View style={styles.questionActions}>
                <View style={styles.marksBox}>
                  <TextInput 
                    value={String(q.marks)} 
                    onChangeText={(val) => updateQuestionMarks(val, i)} 
                    keyboardType="numeric" 
                    style={styles.marksInput} 
                  />
                  <Text style={styles.marksLabel}>Marks</Text>
                </View>
                <TouchableOpacity onPress={() => deleteQuestion(i)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.status.negative} />
                </TouchableOpacity>
              </View>
            </View>
            <TextInput 
              value={q.text} 
              onChangeText={(val) => updateQuestionText(val, i)} 
              multiline 
              style={styles.questionInput} 
            />
          </View>
        ))}
        <TouchableOpacity onPress={addQuestion} style={styles.addQuestionBtn}>
          <Ionicons name="add-circle-outline" size={24} color={colors.label.assistive} />
          <Text style={styles.addQuestionText}>Add Question</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* FLOATING ACTION BUTTON */}
      <View style={styles.fabContainer}>
        <TouchableOpacity onPress={handleOpenPDFSetup} style={styles.fab}>
          <Text style={styles.fabText}>Finalize PDF</Text>
          <Ionicons name="grid-outline" size={20} color={colors.background.normal} />
        </TouchableOpacity>
      </View>

      {/* PDF SETTINGS MODAL */}
      <Modal visible={showPdfModal} animationType="slide" transparent>
        <View style={styles.pdfModalOverlay}>
          <View style={styles.pdfModalSheet}>
            <View style={styles.pdfModalHeader}>
              <Text style={styles.pdfModalTitle}>Paper Settings</Text>
              <TouchableOpacity onPress={() => setShowPdfModal(false)}>
                <Ionicons name="close" size={24} color={colors.label.normal} />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>SELECT TEMPLATE</Text>
              <View style={styles.templateRow}>
                <TemplateOption 
                  type="simple" 
                  label="Simple" 
                  icon={<View style={styles.tplIconSimple} />} 
                />
                <TemplateOption 
                  type="unit_test" 
                  label="Unit Test" 
                  icon={<View style={styles.tplIconUnit}><View style={styles.tplIconUnitInner} /></View>} 
                />
                <TemplateOption 
                  type="final_exam" 
                  label="Final Exam" 
                  icon={<View style={styles.tplIconFinal} />} 
                />
              </View>

              <Text style={styles.fieldLabel}>School Name</Text>
              <TextInput style={styles.fieldInput} value={pdfHeader.schoolName} onChangeText={t => setPdfHeader({...pdfHeader, schoolName: t})} />
              
              <Text style={styles.fieldLabel}>Exam Title (e.g. Final Term)</Text>
              <TextInput style={styles.fieldInput} value={pdfHeader.examTitle} onChangeText={t => setPdfHeader({...pdfHeader, examTitle: t})} />
              
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Time</Text>
                  <TextInput style={styles.fieldInput} value={pdfHeader.duration} onChangeText={t => setPdfHeader({...pdfHeader, duration: t})} />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Marks</Text>
                  <TextInput style={styles.fieldInput} value={pdfHeader.totalMarks} onChangeText={t => setPdfHeader({...pdfHeader, totalMarks: t})} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Instructions</Text>
              <TextInput 
                style={[styles.fieldInput, styles.fieldInputTall]} 
                multiline 
                textAlignVertical="top" 
                value={pdfHeader.instructions} 
                onChangeText={t => setPdfHeader({...pdfHeader, instructions: t})} 
              />

              <TouchableOpacity onPress={handleGenerateFinalPDF} style={styles.generateBtn}>
                <Text style={styles.generateBtnText}>Print / Share PDF</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CustomAlert {...alertState} onClose={closeAlert} />
    </KeyboardAvoidingView>
  );

  // --- STAGING VIEW ---
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.containerAlt}>
      <View style={styles.stagingHeader}>
        <Text style={styles.stagingTitle}>New Test</Text>
        <Text style={styles.stagingSub}>Review scans.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.stagingScroll}>
        {images.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="camera-outline" size={40} color={colors.label.assistive} />
            </View>
            <Text style={styles.emptyText}>No scans yet.{'\n'}Tap camera to start.</Text>
          </View>
        ) : (
          <View style={styles.imageGrid}>
            {images.map((uri, index) => {
              const isSelected = selectedIdx === index;
              return (
                <TouchableOpacity 
                  key={index} 
                  onPress={() => handleImageTap(index)} 
                  activeOpacity={0.8} 
                  style={[
                    styles.imageCard,
                    { width: IMAGE_SIZE, height: IMAGE_SIZE * 1.3 },
                    isSelected && styles.imageCardSelected
                  ]}
                > 
                  <Image source={{ uri }} style={styles.imageThumbnail} resizeMode="cover" />
                  <View style={styles.imageLabel}>
                    <Text style={styles.imageLabelText}>Page {index + 1}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.imageOverlay}>
                      <Text style={styles.imageOverlayText}>Tap to Swap</Text>
                      <TouchableOpacity onPress={handleRemoveImage} style={styles.imageRemoveBtn}>
                        <Ionicons name="close" size={16} color={colors.background.normal} />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity 
              onPress={() => router.push('/camera')} 
              style={[styles.addPageCard, { width: IMAGE_SIZE, height: IMAGE_SIZE * 1.3 }]}
            >
              <Ionicons name="add-circle-outline" size={32} color={colors.label.assistive} />
              <Text style={styles.addPageText}>Add Page</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        {images.length > 0 ? (
          <TouchableOpacity onPress={handleTranscribe} style={styles.transcribeBtn}>
            <Ionicons name="sparkles" size={20} color="#FFD700" />
            <Text style={styles.transcribeBtnText}>Transcribe</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.bottomBarEmpty}>
            <View style={styles.topicInput}>
              <TextInput style={styles.topicInputField} placeholder="Type topic..." placeholderTextColor={colors.label.assistive} />
            </View>
            <TouchableOpacity style={styles.sendBtn}>
              <Ionicons name="send" size={20} color={colors.label.alternative} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => router.push('/camera')}>
              <Ionicons name="camera" size={24} color={colors.background.normal} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <CustomAlert {...alertState} onClose={closeAlert} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Shared
  container: { flex: 1, backgroundColor: colors.background.normal },
  containerAlt: { flex: 1, backgroundColor: colors.background.alternative },

  // Loading
  loadingContainer: { flex: 1, backgroundColor: colors.background.normal, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxxl },
  loadingTitle: { ...typography.heading2, color: colors.label.normal, marginTop: spacing.xxl },
  loadingStatus: { ...typography.body, color: colors.label.alternative, marginTop: spacing.sm },

  // Result header
  resultHeader: { backgroundColor: colors.background.normal, paddingTop: 48, paddingBottom: spacing.lg, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderColor: colors.line.normal, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { padding: spacing.sm },
  resultHeaderCenter: { alignItems: 'center' },
  resultHeaderTitle: { ...typography.heading3, color: colors.label.normal },
  resultHeaderSub: { ...typography.caption, color: colors.label.assistive, marginTop: 2 },
  resultHeaderActions: { flexDirection: 'row', gap: spacing.sm },
  saveBtn: { backgroundColor: colors.fill.normal, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm },
  saveBtnText: { ...typography.buttonSmall, color: colors.label.normal },
  pdfBtn: { padding: spacing.sm, backgroundColor: colors.accent.blue.bg, borderRadius: radii.sm },

  // Result scroll
  resultScroll: { flex: 1, paddingHorizontal: spacing.lg },
  resultScrollContent: { paddingTop: spacing.lg, paddingBottom: 120 },

  // Question cards
  questionCard: { backgroundColor: colors.background.normal, borderWidth: 1, borderColor: colors.line.normal, padding: spacing.lg, borderRadius: radii.lg, marginBottom: spacing.md, ...shadows.small },
  questionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  questionNumber: { ...typography.heading4, color: colors.primary.normal },
  questionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  marksBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.fill.normal, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line.normal },
  marksInput: { ...typography.caption, color: colors.label.normal, width: 24, textAlign: 'center', padding: 0 },
  marksLabel: { ...typography.caption, color: colors.label.assistive, marginLeft: spacing.xs },
  deleteBtn: { padding: spacing.xs },
  questionInput: { ...typography.body, color: colors.label.normal, lineHeight: 24, paddingTop: 0 },

  addQuestionBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xxl, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line.normal, borderRadius: radii.lg, marginBottom: 80, backgroundColor: colors.fill.alternative },
  addQuestionText: { ...typography.button, color: colors.label.assistive, marginLeft: spacing.sm },

  // FAB
  fabContainer: { position: 'absolute', bottom: spacing.xxxl, left: spacing.xxl, right: spacing.xxl },
  fab: { backgroundColor: colors.primary.normal, height: 56, borderRadius: radii.full, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', ...shadows.large },
  fabText: { ...typography.button, color: colors.background.normal, marginRight: spacing.sm, fontSize: 17 },

  // PDF Modal
  pdfModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  pdfModalSheet: { backgroundColor: colors.background.normal, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, padding: spacing.xxl, height: '85%' },
  pdfModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxl },
  pdfModalTitle: { ...typography.heading2, color: colors.label.normal },

  templateRow: { flexDirection: 'row', marginBottom: spacing.xxl, gap: spacing.sm },
  templateOption: { flex: 1, alignItems: 'center', padding: spacing.md, borderRadius: radii.lg, borderWidth: 2 },
  templateOptionActive: { borderColor: colors.primary.normal, backgroundColor: colors.accent.blue.bg },
  templateOptionInactive: { borderColor: colors.line.normal, backgroundColor: colors.background.normal },
  templateIconBox: { marginBottom: spacing.sm },
  templateLabel: { ...typography.caption, color: colors.label.assistive },
  templateLabelActive: { color: colors.primary.normal },

  tplIconSimple: { width: 32, height: 40, borderWidth: 1, borderColor: colors.label.assistive, backgroundColor: colors.fill.normal, borderRadius: 2 },
  tplIconUnit: { width: 32, height: 40, borderWidth: 1, borderColor: colors.label.normal, backgroundColor: colors.background.normal, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  tplIconUnitInner: { width: 24, height: 24, borderWidth: 1, borderColor: colors.line.normal },
  tplIconFinal: { width: 32, height: 40, borderWidth: 2, borderColor: colors.label.normal, backgroundColor: colors.background.normal, borderRadius: 2 },

  fieldLabel: { ...typography.label, color: colors.label.assistive, marginBottom: spacing.xs, marginLeft: spacing.xs },
  fieldInput: { backgroundColor: colors.fill.normal, padding: spacing.lg, borderRadius: radii.lg, ...typography.body, color: colors.label.normal, marginBottom: spacing.lg },
  fieldInputTall: { height: 96 },
  fieldRow: { flexDirection: 'row', gap: spacing.lg },
  fieldHalf: { flex: 1 },

  generateBtn: { backgroundColor: colors.label.normal, height: 56, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center', ...shadows.large, marginBottom: spacing.xxxl },
  generateBtnText: { ...typography.button, color: colors.background.normal, fontSize: 17 },

  // Staging view
  stagingHeader: { backgroundColor: colors.background.normal, paddingTop: 48, paddingBottom: spacing.lg, paddingHorizontal: spacing.xxl, borderBottomWidth: 1, borderColor: colors.line.normal },
  stagingTitle: { ...typography.heading1, color: colors.label.normal },
  stagingSub: { ...typography.body, color: colors.label.alternative },

  stagingScroll: { padding: spacing.xxl, flexGrow: 1 },

  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: { backgroundColor: colors.fill.strong, padding: spacing.xxl, borderRadius: radii.full, marginBottom: spacing.lg },
  emptyText: { ...typography.body, color: colors.label.assistive, textAlign: 'center' },

  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  imageCard: { marginBottom: spacing.lg, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.background.normal, borderWidth: 2, borderColor: 'transparent', ...shadows.small },
  imageCardSelected: { borderColor: colors.primary.normal, transform: [{ scale: 0.95 }] },
  imageThumbnail: { flex: 1 },
  imageLabel: { backgroundColor: colors.fill.normal, paddingVertical: spacing.sm, borderTopWidth: 1, borderColor: colors.line.normal, alignItems: 'center' },
  imageLabelText: { ...typography.caption, color: colors.label.alternative },
  imageOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,102,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  imageOverlayText: { ...typography.button, color: colors.background.normal, marginTop: spacing.sm },
  imageRemoveBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm, backgroundColor: colors.status.negative, padding: spacing.sm, borderRadius: radii.full },

  addPageCard: { marginBottom: spacing.lg, borderRadius: radii.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line.normal, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.fill.alternative },
  addPageText: { ...typography.buttonSmall, color: colors.label.assistive, marginTop: spacing.sm },

  // Bottom bar
  bottomBar: { backgroundColor: colors.background.normal, borderTopWidth: 1, borderColor: colors.line.normal, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  bottomBarEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  transcribeBtn: { backgroundColor: colors.label.normal, height: 56, borderRadius: radii.xl, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', ...shadows.large },
  transcribeBtnText: { ...typography.button, color: colors.background.normal, marginLeft: spacing.sm, fontSize: 17 },
  topicInput: { flex: 1, backgroundColor: colors.fill.normal, borderRadius: radii.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  topicInputField: { ...typography.body, color: colors.label.normal },
  sendBtn: { backgroundColor: colors.fill.strong, borderRadius: radii.full, padding: spacing.md },
  cameraBtn: { backgroundColor: colors.primary.normal, borderRadius: radii.full, padding: spacing.lg, ...shadows.medium },
});
