import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, StatusBar, Alert, KeyboardAvoidingView, Platform, Switch, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker'; 
import { transcribeHandwriting } from '../core/services/gemini'; 
import { saveProject, getProject, ExamProject } from '../core/services/storage'; 

interface Question {
  id: string;
  number: string;
  text: string;
  marks: string;
  diagramUri?: string;
  hideText?: boolean;
}

interface ExamHeader {
  schoolName: string;
  title: string;
  duration: string;
  totalMarks: string;
  instructions: string;
}

export default function EditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  // FIX: Robust ID Retrieval
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const initialData = Array.isArray(params.initialData) ? params.initialData[0] : params.initialData;

  const [currentProjectId, setCurrentProjectId] = useState<string>(
    projectId || Date.now().toString()
  );

  const [header, setHeader] = useState<ExamHeader>({
    schoolName: "PaperLoop Academy",
    title: "Mid-Term Examination", 
    duration: "90 Mins",
    totalMarks: "50",
    instructions: "1. All questions are compulsory.\n2. Draw diagrams where necessary."
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [isAppending, setIsAppending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // --- HYDRATION (Load Data) ---
  useEffect(() => {
    const init = async () => {
      // 1. EDIT MODE: Load existing project
      if (projectId) {
        const saved = await getProject(projectId);
        if (saved) {
          setHeader(saved.header);
          setQuestions(saved.questions);
          setCurrentProjectId(saved.id);
        }
      } 
      // 2. CREATE MODE: Load fresh scan
      else if (initialData) {
        try {
          const parsed = JSON.parse(initialData);
          const formatted = parsed.map((q: any, index: number) => ({
            id: Date.now().toString() + index,
            number: (q.question_number || (index + 1)).toString(),
            text: q.question_text || "",
            marks: (q.marks || "5").toString(),
            diagramUri: q.diagramUri,
            hideText: q.has_diagram ? true : false 
          }));
          setQuestions(formatted);
          // Initial Auto-Save
          saveToDrafts(formatted, header);
        } catch (e) { Alert.alert("Error", "Could not load scan data"); }
      }
    };
    init();
  }, [initialData, projectId]);

  // --- SAVE LOGIC ---
  const saveToDrafts = async (qs: Question[], hd: ExamHeader) => {
    const project: ExamProject = {
      id: currentProjectId,
      title: hd.title, // Title comes from Header Input
      updatedAt: Date.now(), // Force update timestamp
      header: hd,
      questions: qs,
      settings: { columnLayout: '1-column', fontTheme: 'modern' }
    };
    await saveProject(project);
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    await saveToDrafts(questions, header);
    setIsSaving(false);
    Alert.alert("Saved", "Draft updated successfully.");
  };

  // Helper Functions
  const updateQuestion = (id: string, field: keyof Question, value: any) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  };
  const deleteQuestion = (id: string) => {
    Alert.alert("Delete Question?", "", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => setQuestions(prev => prev.filter(q => q.id !== id)) }]);
  };
  const addQuestion = () => {
    setQuestions(prev => [...prev, { id: Date.now().toString(), number: (questions.length + 1).toString(), text: "New Question...", marks: "5", hideText: false }]);
  };
  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) return;
    const newQs = [...questions];
    const target = direction === 'up' ? index - 1 : index + 1;
    [newQs[index], newQs[target]] = [newQs[target], newQs[index]];
    setQuestions(newQs);
  };
  const handleHome = () => {
      Alert.alert("Exit Editor?", "Make sure to save your changes.", [{ text: "Cancel", style: "cancel" }, { text: "Exit", style: "destructive", onPress: () => router.push("/") }]);
  };

  const handleAppendScan = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setIsAppending(true);
        const geminiResult = await transcribeHandwriting([{ uri: result.assets[0].uri }]);
        const newQuestions = geminiResult.questions.map((q: any, index: number) => ({
          id: Date.now().toString() + index,
          number: (questions.length + index + 1).toString(),
          text: q.question_text || "",
          marks: (q.marks || "5").toString(),
          diagramUri: q.diagramUri,
          hideText: q.has_diagram ? true : false 
        }));
        const updatedQs = [...questions, ...newQuestions];
        setQuestions(updatedQs);
        saveToDrafts(updatedQs, header); 
        Alert.alert("Success", `Added ${newQuestions.length} new questions.`);
      }
    } catch (e) { Alert.alert("Error", "Could not analyze new page."); } finally { setIsAppending(false); }
  };

  const generatePdfUri = async () => {
      const processedQuestions = await Promise.all(questions.map(async (q) => {
        if (q.diagramUri) {
          try {
            const b64 = await FileSystem.readAsStringAsync(q.diagramUri, { encoding: 'base64' });
            return { ...q, imageSrc: `data:image/png;base64,${b64}` };
          } catch (e) { return q; }
        }
        return q;
      }));
  
      const html = `
        <html>
          <head>
            <script>document.addEventListener("DOMContentLoaded",()=>{document.body.innerHTML=document.body.innerHTML.replace(/\\\\\\$/g,'$');});</script>
            <script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$']]},svg:{fontCache:'global'},startup:{pageReady:()=>MathJax.startup.defaultPageReady()}};</script>
            <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
              body { font-family: 'Inter', sans-serif; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #111; padding-bottom: 20px; }
              .school-name { font-size: 26px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
              .exam-title { font-size: 18px; font-weight: 500; margin-bottom: 15px; color: #444; }
              .meta-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; text-transform: uppercase; }
              .instructions { background: #f8f9fa; padding: 15px; font-size: 12px; margin-bottom: 40px; border-left: 4px solid #111; line-height: 1.6; }
              .q-item { margin-bottom: 25px; page-break-inside: avoid; border-bottom: 1px dashed #eee; padding-bottom: 20px; }
              .q-row { display: flex; flex-direction: row; }
              .q-num { width: 35px; font-weight: 800; font-size: 16px; flex-shrink: 0; }
              .q-content { flex: 1; }
              .q-text { white-space: pre-wrap; line-height: 1.6; font-size: 15px; margin-bottom: 15px; }
              .q-marks { width: 50px; text-align: right; font-weight: 700; font-size: 14px; }
              .diagram-img { display: block; max-width: 100%; max-height: 250px; margin-top: 10px; border: 1px solid #e5e7eb; filter: grayscale(100%) contrast(140%) brightness(105%); mix-blend-mode: multiply; }
              mjx-container { display: inline-block !important; margin: 0 !important; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="school-name">${header.schoolName}</div>
              <div class="exam-title">${header.title}</div>
              <div class="meta-row"><span>Duration: ${header.duration}</span><span>Max Marks: ${header.totalMarks}</span></div>
            </div>
            ${header.instructions ? `<div class="instructions"><strong>INSTRUCTIONS:</strong><br/>${header.instructions.replace(/\n/g, '<br/>')}</div>` : ''}
            <div class="list">
              ${processedQuestions.map(q => `
                <div class="q-item">
                  <div class="q-row">
                    <div class="q-num">${q.number}.</div>
                    <div class="q-content">
                      ${!q.hideText ? `<div class="q-text">${q.text}</div>` : ''}
                      ${(q as any).imageSrc ? `<img src="${(q as any).imageSrc}" class="diagram-img" />` : ''}
                    </div>
                    <div class="q-marks">[ ${q.marks} ]</div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div style="margin-top:60px; text-align:center; font-size:10px; color:#aaa; letter-spacing:1px;">GENERATED BY PAPERLOOP</div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const fileName = `${header.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
      const docDir = FileSystem.documentDirectory + 'exams/';
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      const newUri = docDir + fileName;
      await FileSystem.moveAsync({ from: uri, to: newUri });
      return newUri;
  };

  const handleExport = async () => {
    try {
      await saveToDrafts(questions, header);
      const savedUri = await generatePdfUri();
      await Sharing.shareAsync(savedUri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) { Alert.alert("Export Failed", "Could not generate PDF."); }
  };

  // RENDER HELPERS
  const renderHeader = () => (
    <View style={styles.headerCard}>
      <TextInput style={styles.schoolInput} value={header.schoolName} onChangeText={t => setHeader({...header, schoolName: t})} placeholder="SCHOOL NAME" />
      <TextInput style={styles.titleInput} value={header.title} onChangeText={t => setHeader({...header, title: t})} placeholder="EXAM TITLE" />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}><Text style={styles.label}>DURATION</Text><TextInput style={styles.metaInput} value={header.duration} onChangeText={t => setHeader({...header, duration: t})} /></View>
        <View style={styles.metaBox}><Text style={styles.label}>MARKS</Text><TextInput style={styles.metaInput} value={header.totalMarks} onChangeText={t => setHeader({...header, totalMarks: t})} /></View>
      </View>
      <View style={styles.instructionBox}><Text style={styles.label}>INSTRUCTIONS</Text><TextInput style={styles.instInput} value={header.instructions} onChangeText={t => setHeader({...header, instructions: t})} multiline /></View>
    </View>
  );

  const renderQuestion = ({ item, index }: { item: Question, index: number }) => (
    <View style={styles.qCard}>
      <View style={styles.qHeader}>
        <View style={styles.numTag}><TextInput style={styles.numInput} value={item.number} onChangeText={t => updateQuestion(item.id, 'number', t)} /></View>
        <View style={styles.toolRow}>
          <TouchableOpacity onPress={() => moveQuestion(index, 'up')} style={styles.toolBtn}><Ionicons name="arrow-up" size={16} color="#555" /></TouchableOpacity>
          <TouchableOpacity onPress={() => moveQuestion(index, 'down')} style={styles.toolBtn}><Ionicons name="arrow-down" size={16} color="#555" /></TouchableOpacity>
          <TouchableOpacity onPress={() => deleteQuestion(item.id)} style={[styles.toolBtn, {backgroundColor:'#fee2e2'}]}><Ionicons name="trash" size={16} color="#dc2626" /></TouchableOpacity>
        </View>
      </View>
      {item.diagramUri && (
        <View style={styles.diagramControl}>
           <View style={{flex:1}}><Text style={styles.ctrlLabel}>Diagram Mode</Text><Text style={styles.ctrlSub}>{item.hideText ? "Image Only" : "Text + Image"}</Text></View>
           <Switch value={item.hideText} onValueChange={v => updateQuestion(item.id, 'hideText', v)} trackColor={{false: "#e5e7eb", true: "#2563EB"}} />
        </View>
      )}
      <TextInput style={[styles.qInput, item.hideText && styles.dimmedInput]} value={item.text} onChangeText={t => updateQuestion(item.id, 'text', t)} multiline editable={!item.hideText} placeholder={item.hideText ? "(Text Hidden in PDF)" : "Type question here..."} />
      {item.diagramUri && <Image source={{ uri: item.diagramUri }} style={[styles.qImage, item.hideText && {borderColor:'#2563EB', borderWidth:2}]} resizeMode="contain" />}
      <View style={styles.qFooter}><Text style={styles.markLabel}>Marks</Text><TextInput style={styles.markInput} value={item.marks} onChangeText={t => updateQuestion(item.id, 'marks', t)} keyboardType="numeric" /></View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      <View style={styles.nav}>
        <TouchableOpacity onPress={handleHome} style={styles.navBack}><Ionicons name="home-outline" size={24} color="#111" /></TouchableOpacity>
        <Text style={styles.navTitle}>Editor</Text>
        <TouchableOpacity onPress={handleManualSave} style={styles.saveBtn} disabled={isSaving}>
          {isSaving ? <ActivityIndicator size="small" color="#2563EB"/> : <Text style={styles.saveBtnText}>Save Draft</Text>}
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <FlatList data={questions} keyExtractor={item => item.id} renderItem={renderQuestion} ListHeaderComponent={renderHeader} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} ListFooterComponent={
            <View style={styles.footerActions}>
              <TouchableOpacity onPress={handleAppendScan} style={styles.appendBtn} disabled={isAppending}>{isAppending ? <ActivityIndicator color="#2563EB"/> : <Ionicons name="camera" size={20} color="#2563EB" />}<Text style={styles.appendBtnText}>{isAppending ? "Scanning..." : "Scan Page"}</Text></TouchableOpacity>
              <TouchableOpacity onPress={addQuestion} style={styles.addBtn}><Text style={styles.addText}>+ Manual Question</Text></TouchableOpacity>
            </View>
        }/>
      </KeyboardAvoidingView>
      <TouchableOpacity onPress={handleExport} style={styles.fab}><Ionicons name="share-outline" size={24} color="white" /><Text style={styles.fabText}>Export PDF</Text></TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  navBack: { padding: 4 },
  navTitle: { fontSize: 16, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#EFF6FF', borderRadius: 20 },
  saveBtnText: { color: '#2563EB', fontWeight: 'bold' },
  list: { padding: 16, paddingBottom: 100 },
  headerCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  schoolInput: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8, color: '#111' },
  titleInput: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: '#555', marginBottom: 20 },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  metaBox: { flex: 1, backgroundColor: '#f9fafb', padding: 10, borderRadius: 8 },
  label: { fontSize: 10, fontWeight: '700', color: '#9ca3af', marginBottom: 4 },
  metaInput: { fontSize: 14, fontWeight: '700', color: '#111' },
  instructionBox: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 8 },
  instInput: { fontSize: 13, color: '#1e3a8a', lineHeight: 20, minHeight: 40 },
  qCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 5, elevation: 1 },
  qHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  numTag: { backgroundColor: '#111', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  numInput: { color: 'white', fontWeight: 'bold', fontSize: 14, textAlign: 'center', padding: 0, includeFontPadding: false },
  toolRow: { flexDirection: 'row', gap: 8 },
  toolBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  diagramControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#dcfce7' },
  ctrlLabel: { fontSize: 12, fontWeight: '700', color: '#166534' },
  ctrlSub: { fontSize: 10, color: '#15803d' },
  qInput: { fontSize: 16, lineHeight: 24, color: '#374151', minHeight: 40, textAlignVertical: 'top' },
  dimmedInput: { opacity: 0.4, fontStyle: 'italic' },
  qImage: { width: '100%', height: 180, backgroundColor: '#f9fafb', borderRadius: 8, marginTop: 12 },
  qFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6' },
  markLabel: { fontSize: 12, color: '#9ca3af', marginRight: 8 },
  markInput: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, fontWeight: 'bold', minWidth: 40, textAlign: 'center', padding: 0, includeFontPadding: false },
  footerActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  appendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', padding: 16, borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#2563EB' },
  appendBtnText: { color: '#2563EB', fontWeight: 'bold', marginLeft: 8 },
  addBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 12, backgroundColor: '#F9FAFB' },
  addText: { color: '#6B7280', fontWeight: '700' },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 32, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: {width:0, height:4}, elevation: 5 },
  fabText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 16 }
});