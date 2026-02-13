import React, { useState, useEffect, useCallback, memo } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, StatusBar, Alert, KeyboardAvoidingView, Platform, Switch, ActivityIndicator, Modal 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview'; // THE NEW POWER TOOL
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker'; 
import { transcribeHandwriting } from '../core/services/gemini'; 
import { saveProject, getProject, ExamProject, Section, Question } from '../core/services/storage'; 
import { generateExamHtml } from '../core/services/pdf'; // THE SHARED RENDERER

// --- SUB-COMPONENTS (Keep HeaderEditor, QuestionCard, SectionCard as is) ---
// (I will omit the full code of sub-components here to save space, 
//  BUT YOU SHOULD KEEP THEM EXACTLY AS THEY WERE IN THE PREVIOUS STEP. 
//  Copy them back in if you are doing a full file replace.)

// ... [INSERT HeaderEditor HERE] ...
// ... [INSERT QuestionCard HERE] ...
// ... [INSERT SectionCard HERE] ...

// RE-INSERTING SUB-COMPONENTS FOR SAFETY (Just copy-paste this block)
const HeaderEditor = memo(({ header, onChange }: { header: any, onChange: (h: any) => void }) => (
  <View style={styles.headerCard}>
    <TextInput style={styles.schoolInput} value={header.schoolName} onChangeText={t => onChange({...header, schoolName: t})} placeholder="SCHOOL NAME" />
    <TextInput style={styles.titleInput} value={header.title} onChangeText={t => onChange({...header, title: t})} placeholder="EXAM TITLE" />
    <View style={styles.metaRow}>
      <View style={styles.metaBox}><Text style={styles.label}>DURATION</Text><TextInput style={styles.metaInput} value={header.duration} onChangeText={t => onChange({...header, duration: t})} /></View>
      <View style={styles.metaBox}><Text style={styles.label}>MARKS</Text><TextInput style={styles.metaInput} value={header.totalMarks} onChangeText={t => onChange({...header, totalMarks: t})} /></View>
    </View>
    <View style={styles.instructionBox}><Text style={styles.label}>INSTRUCTIONS</Text><TextInput style={styles.instInput} value={header.instructions} onChangeText={t => onChange({...header, instructions: t})} multiline /></View>
  </View>
));

const QuestionCard = memo(({ 
  item, sectionId, onUpdate, onDelete, onMove 
}: { 
  item: Question, sectionId: string, 
  onUpdate: (sId: string, qId: string, field: keyof Question, val: any) => void,
  onDelete: (sId: string, qId: string) => void,
  onMove: (sId: string, idx: number, dir: 'up' | 'down') => void
}) => {
  const updateOption = (idx: number, text: string) => {
    const newOptions = [...(item.options || ["", "", "", ""])];
    newOptions[idx] = text;
    onUpdate(sectionId, item.id, 'options', newOptions);
  };
  return (
    <View style={styles.qCard}>
      <View style={styles.qHeader}>
        <View style={styles.numTag}><TextInput style={styles.numInput} value={item.number} onChangeText={t => onUpdate(sectionId, item.id, 'number', t)} /></View>
        <TouchableOpacity onPress={() => onUpdate(sectionId, item.id, 'type', item.type === 'mcq' ? 'standard' : 'mcq')} style={[styles.typeBadge, item.type === 'mcq' ? styles.typeBadgeMCQ : {}]}>
          <Text style={[styles.typeText, item.type === 'mcq' && {color:'white'}]}>{item.type === 'mcq' ? 'MCQ' : 'TEXT'}</Text>
        </TouchableOpacity>
        <View style={styles.toolRow}>
          <TouchableOpacity onPress={() => onMove(sectionId, parseInt(item.number)-1, 'up')} style={styles.toolBtn}><Ionicons name="arrow-up" size={16} color="#555" /></TouchableOpacity>
          <TouchableOpacity onPress={() => onMove(sectionId, parseInt(item.number)-1, 'down')} style={styles.toolBtn}><Ionicons name="arrow-down" size={16} color="#555" /></TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(sectionId, item.id)} style={[styles.toolBtn, {backgroundColor:'#fee2e2'}]}><Ionicons name="trash" size={16} color="#dc2626" /></TouchableOpacity>
        </View>
      </View>
      <TextInput style={[styles.qInput, item.hideText && styles.dimmedInput]} value={item.text} onChangeText={t => onUpdate(sectionId, item.id, 'text', t)} multiline editable={!item.hideText} placeholder="Question text..." />
      {item.type === 'mcq' && !item.hideText && (
        <View style={styles.mcqContainer}>
          <View style={styles.mcqRow}>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>A</Text><TextInput style={styles.mcqInput} placeholder="Option A" value={item.options?.[0]} onChangeText={t => updateOption(0, t)}/></View>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>B</Text><TextInput style={styles.mcqInput} placeholder="Option B" value={item.options?.[1]} onChangeText={t => updateOption(1, t)}/></View>
          </View>
          <View style={styles.mcqRow}>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>C</Text><TextInput style={styles.mcqInput} placeholder="Option C" value={item.options?.[2]} onChangeText={t => updateOption(2, t)}/></View>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>D</Text><TextInput style={styles.mcqInput} placeholder="Option D" value={item.options?.[3]} onChangeText={t => updateOption(3, t)}/></View>
          </View>
        </View>
      )}
      {item.diagramUri && (
        <View>
          <Image source={{ uri: item.diagramUri }} style={[styles.qImage, item.hideText && {borderColor:'#2563EB', borderWidth:2}]} resizeMode="contain" />
           <View style={styles.diagramControl}>
             <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={styles.ctrlSub}>Settings</Text>
                <View style={{flexDirection:'row', gap:12}}>
                  <View style={{alignItems:'center'}}><Text style={{fontSize:8}}>HIDE TEXT</Text><Switch value={item.hideText} onValueChange={v => onUpdate(sectionId, item.id, 'hideText', v)} trackColor={{false:"#e5e7eb",true:"#2563EB"}} style={{transform:[{scaleX:.6},{scaleY:.6}]}}/></View>
                  <View style={{alignItems:'center'}}><Text style={{fontSize:8}}>FULL WIDTH</Text><Switch value={item.isFullWidth} onValueChange={v => onUpdate(sectionId, item.id, 'isFullWidth', v)} trackColor={{false:"#e5e7eb",true:"#2563EB"}} style={{transform:[{scaleX:.6},{scaleY:.6}]}}/></View>
                </View>
             </View>
          </View>
        </View>
      )}
      <View style={styles.qFooter}><Text style={styles.markLabel}>Marks</Text><TextInput style={styles.markInput} value={item.marks} onChangeText={t => onUpdate(sectionId, item.id, 'marks', t)} keyboardType="numeric" /></View>
    </View>
  );
});

const SectionCard = memo(({ 
  section, index, onUpdateSection, onDeleteSection, 
  onUpdateQ, onDeleteQ, onMoveQ, onAddQ, onPasteScan
}: { 
  section: Section, index: number, 
  onUpdateSection: (id: string, field: keyof Section, val: any) => void,
  onDeleteSection: (id: string) => void,
  onUpdateQ: any, onDeleteQ: any, onMoveQ: any, onAddQ: any, onPasteScan: any
}) => (
  <View style={styles.sectionContainer}>
    <View style={styles.sectionHeader}>
      <TextInput style={styles.sectionTitleInput} value={section.title} onChangeText={t => onUpdateSection(section.id, 'title', t)} placeholder="Section Title" />
      <View style={styles.sectionTools}>
         <TouchableOpacity onPress={() => onUpdateSection(section.id, 'layout', section.layout === '1-column' ? '2-column' : '1-column')} style={[styles.layoutBadge, section.layout === '2-column' && styles.layoutBadgeActive]}>
            <Text style={[styles.layoutText, section.layout === '2-column' && {color:'white'}]}>{section.layout === '1-column' ? '1 Col' : '2 Col'}</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={() => onDeleteSection(section.id)} style={styles.delSectionBtn}><Ionicons name="close" size={16} color="#ef4444" /></TouchableOpacity>
      </View>
    </View>
    {section.questions.map((q, idx) => (
       <QuestionCard key={q.id} item={{...q, number: (idx+1).toString()}} sectionId={section.id} onUpdate={onUpdateQ} onDelete={onDeleteQ} onMove={onMoveQ} />
    ))}
    <View style={styles.sectionFooter}>
       <TouchableOpacity onPress={() => onPasteScan(section.id)} style={styles.secActionBtn}><Ionicons name="camera" size={16} color="#2563EB" /><Text style={styles.secActionText}>Scan</Text></TouchableOpacity>
       <TouchableOpacity onPress={() => onAddQ(section.id)} style={styles.secActionBtn}><Ionicons name="add" size={16} color="#2563EB" /><Text style={styles.secActionText}>Question</Text></TouchableOpacity>
    </View>
  </View>
));

// --- MAIN SCREEN ---

export default function EditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const initialData = Array.isArray(params.initialData) ? params.initialData[0] : params.initialData;

  const [currentProjectId, setCurrentProjectId] = useState<string>(projectId || Date.now().toString());
  
  // VIEW MODE: 'edit' or 'preview'
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [previewHtml, setPreviewHtml] = useState<string>('');

  const [header, setHeader] = useState<any>({
    schoolName: "PaperLoop Academy", title: "Mid-Term Examination", 
    duration: "90 Mins", totalMarks: "50", 
    instructions: "1. All questions are compulsory.\n2. Draw diagrams where necessary."
  });

  const [sections, setSections] = useState<Section[]>([]);
  const [fontTheme, setFontTheme] = useState<'modern' | 'classic' | 'typewriter'>('modern');
  const [isAppending, setIsAppending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (projectId) {
        const saved = await getProject(projectId);
        if (saved) {
          setHeader(saved.header);
          setFontTheme(saved.settings?.fontTheme as any || 'modern');
          if (saved.sections && saved.sections.length > 0) {
            setSections(saved.sections);
          } else if (saved.questions && saved.questions.length > 0) {
            setSections([{ id: 'default_section', title: 'Section A', layout: '1-column', questions: saved.questions.map(q => ({...q, type: 'standard'})) }]);
          } else {
             setSections([{ id: Date.now().toString(), title: 'Section A', layout: '1-column', questions: [] }]);
          }
          setCurrentProjectId(saved.id);
        }
      } 
      else if (initialData) {
        try {
          const parsed = JSON.parse(initialData);
          const isSectionData = parsed.length > 0 && parsed[0].questions;
          if (isSectionData) {
            const sanitizedSections = parsed.map((sec: any) => ({
              ...sec, id: sec.id || Date.now().toString() + Math.random(),
              questions: sec.questions.map((q: any) => ({ ...q, id: q.id || Date.now().toString() + Math.random() }))
            }));
            setSections(sanitizedSections);
            saveToDrafts(sanitizedSections, header, fontTheme);
          } else {
            const formatted = parsed.map((q: any, index: number) => ({
              id: Date.now().toString() + index, number: "", text: q.text || q.question_text || "", 
              marks: (q.marks || "5").toString(), diagramUri: q.diagramUri, 
              hideText: q.has_diagram ? true : false, isFullWidth: false, type: 'standard', options: []
            }));
            const newSection: Section = { id: Date.now().toString(), title: 'Section A', layout: '1-column', questions: formatted };
            setSections([newSection]);
            saveToDrafts([newSection], header, fontTheme);
          }
        } catch (e) { Alert.alert("Error", "Could not load scan data"); }
      }
    };
    init();
  }, [initialData, projectId]);

  const saveToDrafts = async (secs: Section[], hd: any, ft: any) => {
    const project: ExamProject = {
      id: currentProjectId, title: hd.title, updatedAt: Date.now(),
      header: hd, sections: secs, settings: { fontTheme: ft }
    };
    await saveProject(project);
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    await saveToDrafts(sections, header, fontTheme);
    setIsSaving(false);
    Alert.alert("Saved", "Draft updated successfully.");
  };

  // --- PREVIEW GENERATOR ---
  const handleTogglePreview = async () => {
    if (viewMode === 'edit') {
      const html = await generateExamHtml(header, sections, fontTheme);
      setPreviewHtml(html);
      setViewMode('preview');
    } else {
      setViewMode('edit');
    }
  };

  const handleExport = async () => {
    try {
      await saveToDrafts(sections, header, fontTheme);
      const html = await generateExamHtml(header, sections, fontTheme);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      
      const fileName = `${header.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
      const docDir = FileSystem.documentDirectory + 'exams/';
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      const newUri = docDir + fileName;
      await FileSystem.moveAsync({ from: uri, to: newUri });
      await Sharing.shareAsync(newUri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) { Alert.alert("Export Failed", "Could not generate PDF."); }
  };

  // --- ACTIONS (Same as before) ---
  const addSection = () => setSections(prev => [...prev, { id: Date.now().toString(), title: "New Section", layout: '1-column', questions: [] }]);
  const updateSection = useCallback((id: string, field: keyof Section, value: any) => setSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s)), []);
  const deleteSection = useCallback((id: string) => Alert.alert("Delete Section?", "Remove all questions?", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => setSections(prev => prev.filter(s => s.id !== id)) }]), []);
  const updateQ = useCallback((secId: string, qId: string, field: any, value: any) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: s.questions.map(q => q.id === qId ? { ...q, [field]: value } : q) } : s)), []);
  const deleteQ = useCallback((secId: string, qId: string) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: s.questions.filter(q => q.id !== qId) } : s)), []);
  const addQ = (secId: string) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: [...s.questions, { id: Date.now().toString(), number: "", text: "New Question...", marks: "1", type: 'standard', options:["","","",""] }] } : s));
  const moveQ = useCallback((secId: string, idx: number, dir: 'up' | 'down') => {
    setSections(prev => prev.map(s => {
      if (s.id !== secId) return s;
      const qs = [...s.questions];
      if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === qs.length - 1)) return s;
      const target = dir === 'up' ? idx - 1 : idx + 1;
      [qs[idx], qs[target]] = [qs[target], qs[idx]];
      return { ...s, questions: qs };
    }));
  }, []);
  const handleScanToSection = async (secId: string) => {
    try {
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
        if (!result.canceled && result.assets[0]) {
          setIsAppending(true);
          const geminiResult = await transcribeHandwriting([{ uri: result.assets[0].uri }]);
          let newQuestions: Question[] = [];
          if (geminiResult.sections) {
             geminiResult.sections.forEach((s: any) => { newQuestions.push(...s.questions); });
          }
          setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: [...s.questions, ...newQuestions] } : s));
          Alert.alert("Success", `Added ${newQuestions.length} questions.`);
        }
    } catch (e) { Alert.alert("Error", "Scan failed"); } finally { setIsAppending(false); }
  };
  const handleHome = () => Alert.alert("Exit?", "Unsaved changes will be lost.", [{ text: "Cancel", style: "cancel" }, { text: "Exit", style: "destructive", onPress: () => router.push("/") }]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      {/* HEADER NAV */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={handleHome} style={styles.navBack}><Ionicons name="home-outline" size={24} color="#111" /></TouchableOpacity>
        
        {/* VIEW MODE TOGGLE (Edit vs Preview) */}
        <View style={styles.toggleContainer}>
           <TouchableOpacity onPress={handleTogglePreview} style={[styles.toggleBtn, viewMode === 'edit' && styles.toggleActive]}>
              <Text style={[styles.toggleText, viewMode === 'edit' && styles.toggleTextActive]}>Edit</Text>
           </TouchableOpacity>
           <TouchableOpacity onPress={handleTogglePreview} style={[styles.toggleBtn, viewMode === 'preview' && styles.toggleActive]}>
              <Text style={[styles.toggleText, viewMode === 'preview' && styles.toggleTextActive]}>Preview</Text>
           </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleManualSave} style={styles.saveBtn} disabled={isSaving}>
          {isSaving ? <ActivityIndicator size="small" color="#2563EB"/> : <Ionicons name="save-outline" size={20} color="#2563EB" />}
        </TouchableOpacity>
      </View>

      {/* CONTENT AREA */}
      <View style={{ flex: 1 }}>
        {viewMode === 'edit' ? (
          // EDIT MODE
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <FlatList 
                data={sections} 
                keyExtractor={item => item.id} 
                renderItem={({ item, index }) => (
                    <SectionCard 
                        section={item} index={index} 
                        onUpdateSection={updateSection} onDeleteSection={deleteSection}
                        onUpdateQ={updateQ} onDeleteQ={deleteQ} onMoveQ={moveQ} onAddQ={addQ} onPasteScan={handleScanToSection}
                    />
                )}
                ListHeaderComponent={
                  <>
                    <HeaderEditor header={header} onChange={setHeader} />
                    <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.fontBtn}>
                       <Text style={styles.fontBtnText}>Font: {fontTheme.toUpperCase()}</Text>
                       <Ionicons name="chevron-down" size={14} color="#555" />
                    </TouchableOpacity>
                  </>
                } 
                contentContainerStyle={styles.list} 
                showsVerticalScrollIndicator={false} 
                ListFooterComponent={
                    <View style={styles.footerActions}>
                      <TouchableOpacity onPress={addSection} style={styles.addBtn}>
                        <Text style={styles.addText}>+ Add New Section</Text>
                      </TouchableOpacity>
                    </View>
                }
            />
          </KeyboardAvoidingView>
        ) : (
          // PREVIEW MODE (WebView)
          <View style={styles.previewContainer}>
             <WebView 
               originWhitelist={['*']} 
               source={{ html: previewHtml }} 
               style={{ flex: 1 }}
               scalesPageToFit={false} // Improves text rendering
             />
             <TouchableOpacity onPress={handleExport} style={styles.fabPreview}>
                <Ionicons name="share-outline" size={24} color="white" />
                <Text style={styles.fabText}>Export PDF</Text>
             </TouchableOpacity>
          </View>
        )}
      </View>

      {viewMode === 'edit' && (
        <TouchableOpacity onPress={handleExport} style={styles.fab}><Ionicons name="share-outline" size={24} color="white" /><Text style={styles.fabText}>Export PDF</Text></TouchableOpacity>
      )}
      
      <Modal visible={showSettings} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowSettings(false)} activeOpacity={1}>
           <View style={styles.menu}>
              <Text style={styles.menuTitle}>Font Theme</Text>
              {['modern', 'classic', 'typewriter'].map((f) => (
                <TouchableOpacity key={f} style={styles.menuItem} onPress={() => { setFontTheme(f as any); setShowSettings(false); }}>
                  <Text style={styles.menuText}>{f.toUpperCase()}</Text>
                  {fontTheme === f && <Ionicons name="checkmark" size={18} color="#2563EB"/>}
                </TouchableOpacity>
              ))}
           </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  navBack: { padding: 8 },
  
  toggleContainer: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 8, padding: 2 },
  toggleBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 6 },
  toggleActive: { backgroundColor: 'white', shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#111' },

  saveBtn: { padding: 8, backgroundColor: '#EFF6FF', borderRadius: 20 },
  list: { padding: 16, paddingBottom: 100 },
  headerCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 10 },
  fontBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap:6, padding:10, backgroundColor: 'white', borderRadius: 12, marginBottom: 20 },
  fontBtnText: { fontSize: 12, fontWeight: '700', color: '#555' },

  schoolInput: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8, color: '#111' },
  titleInput: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: '#555', marginBottom: 20 },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  metaBox: { flex: 1, backgroundColor: '#f9fafb', padding: 10, borderRadius: 8 },
  label: { fontSize: 10, fontWeight: '700', color: '#9ca3af', marginBottom: 4 },
  metaInput: { fontSize: 14, fontWeight: '700', color: '#111' },
  instructionBox: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 8 },
  instInput: { fontSize: 13, color: '#1e3a8a', lineHeight: 20, minHeight: 40 },
  
  // SECTIONS
  sectionContainer: { marginBottom: 25 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  sectionTitleInput: { fontSize: 16, fontWeight: '800', color: '#1f2937', flex: 1, borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 4 },
  sectionTools: { flexDirection: 'row', gap: 8, marginLeft: 10 },
  layoutBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e5e7eb' },
  layoutBadgeActive: { backgroundColor: '#111' },
  layoutText: { fontSize: 10, fontWeight: '700', color: '#555' },
  delSectionBtn: { padding: 4 },
  sectionFooter: { flexDirection: 'row', justifyContent: 'center', gap: 15, marginTop: 10 },
  secActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  secActionText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },

  // QUESTIONS
  qCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 5, elevation: 1 },
  qHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  numTag: { backgroundColor: '#111', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  numInput: { color: 'white', fontWeight: 'bold', fontSize: 14, textAlign: 'center', padding: 0, includeFontPadding: false },
  
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#e5e7eb', marginLeft: 8 },
  typeBadgeMCQ: { backgroundColor: '#8b5cf6' }, 
  typeText: { fontSize: 10, fontWeight: '800', color: '#555' },

  toolRow: { flexDirection: 'row', gap: 8 },
  toolBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  
  mcqContainer: { marginBottom: 12 },
  mcqRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  mcqOption: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: '#F3F4F6' },
  mcqLabel: { fontWeight: '800', color: '#9CA3AF', marginRight: 6, fontSize: 12 },
  mcqInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#374151' },

  // MISSING STYLES RESTORED HERE:
  diagramControl: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#dcfce7' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  ctrlLabel: { fontSize: 12, fontWeight: '700', color: '#166534', marginBottom: 8 },
  ctrlSub: { fontSize: 11, color: '#15803d' },

  qInput: { fontSize: 16, lineHeight: 24, color: '#374151', minHeight: 40, textAlignVertical: 'top' },
  dimmedInput: { opacity: 0.4, fontStyle: 'italic' },
  qImage: { width: '100%', height: 180, backgroundColor: '#f9fafb', borderRadius: 8, marginTop: 12 },
  qFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6' },
  markLabel: { fontSize: 12, color: '#9ca3af', marginRight: 8 },
  markInput: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, fontWeight: 'bold', minWidth: 40, textAlign: 'center', padding: 0, includeFontPadding: false },
  
  footerActions: { marginTop: 20, marginBottom: 40 },
  addBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 12, backgroundColor: '#e5e7eb' },
  addText: { color: '#374151', fontWeight: '700' },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 32, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: {width:0, height:4}, elevation: 5 },
  fabPreview: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 32, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: {width:0, height:4}, elevation: 5 },
  fabText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  previewContainer: { flex: 1, backgroundColor: '#eee' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  menu: { width: 200, backgroundColor: 'white', borderRadius: 12, padding: 8, shadowColor: "#000", shadowOpacity: 0.1, elevation: 10 },
  menuTitle: { fontSize: 11, fontWeight: '700', color: '#999', padding: 8, textTransform: 'uppercase' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8 },
  menuText: { fontSize: 14, color: '#111' }
});