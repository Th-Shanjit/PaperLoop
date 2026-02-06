import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, StatusBar, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy'; // Needed for Base64 injection

// --- TYPES ---
interface Question {
  id: string;
  number: string;
  text: string;
  marks: string;
  diagramUri?: string;
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
  const { initialData } = useLocalSearchParams();

  const [header, setHeader] = useState<ExamHeader>({
    schoolName: "PaperLoop Academy",
    title: "New Exam",
    duration: "60 mins",
    totalMarks: "50",
    instructions: "All questions are compulsory."
  });

  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (initialData) {
      try {
        const parsed = JSON.parse(initialData as string);
        const formatted = parsed.map((q: any, index: number) => ({
          id: Date.now().toString() + index,
          number: (q.question_number || (index + 1)).toString(),
          text: q.question_text || "",
          marks: (q.marks || "5").toString(),
          diagramUri: q.diagramUri 
        }));
        setQuestions(formatted);
      } catch (e) { Alert.alert("Error", "Could not load data"); }
    }
  }, [initialData]);

  const updateQuestion = (id: string, field: keyof Question, value: string) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const deleteQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const addQuestion = () => {
    setQuestions(prev => [...prev, {
      id: Date.now().toString(),
      number: (questions.length + 1).toString(),
      text: "New Question...",
      marks: "5"
    }]);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) return;
    const newQs = [...questions];
    const target = direction === 'up' ? index - 1 : index + 1;
    [newQs[index], newQs[target]] = [newQs[target], newQs[index]];
    setQuestions(newQs);
  };

  // --- PDF ENGINE ---
  const handleExport = async () => {
    try {
      // 1. Convert all diagram URIs to Base64 to ensure they render in PDF
      // This fixes the "[blank]" issue
      const processedQuestions = await Promise.all(questions.map(async (q) => {
        if (q.diagramUri) {
          try {
            const b64 = await FileSystem.readAsStringAsync(q.diagramUri, { encoding: 'base64' });
            return { ...q, imageSrc: `data:image/png;base64,${b64}` };
          } catch (e) { return q; }
        }
        return q;
      }));

      // 2. HTML Template with "CamScanner" CSS
      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #111; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
              .school-name { font-size: 22px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; }
              .exam-title { font-size: 18px; margin-bottom: 10px; }
              .meta-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; }
              
              .instructions { background: #f0f0f0; padding: 15px; font-style: italic; font-size: 12px; margin-bottom: 30px; border-left: 4px solid #333; }

              .q-item { margin-bottom: 30px; page-break-inside: avoid; }
              .q-row { display: flex; flex-direction: row; }
              .q-num { width: 30px; font-weight: bold; flex-shrink: 0; }
              .q-content { flex: 1; }
              .q-text { white-space: pre-wrap; line-height: 1.5; margin-bottom: 10px; }
              .q-marks { width: 40px; text-align: right; font-weight: bold; }

              /* THE CAMSCANNER EFFECT */
              .diagram-img {
                max-width: 100%;
                max-height: 300px;
                border: 1px solid #ddd;
                /* High Contrast + Grayscale to remove shadow/yellow paper */
                filter: grayscale(100%) contrast(150%) brightness(110%);
                mix-blend-mode: multiply; 
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="school-name">${header.schoolName}</div>
              <div class="exam-title">${header.title}</div>
              <div class="meta-row"><span>Duration: ${header.duration}</span><span>Marks: ${header.totalMarks}</span></div>
            </div>
            
            ${header.instructions ? `<div class="instructions"><strong>Instructions:</strong><br/>${header.instructions}</div>` : ''}

            <div class="list">
              ${processedQuestions.map(q => `
                <div class="q-item">
                  <div class="q-row">
                    <div class="q-num">${q.number}.</div>
                    <div class="q-content">
                      <div class="q-text">${q.text}</div>
                      ${(q as any).imageSrc ? `<img src="${(q as any).imageSrc}" class="diagram-img" />` : ''}
                    </div>
                    <div class="q-marks">[${q.marks}]</div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div style="margin-top:50px; text-align:center; font-size:10px; color:#888;">Generated by PaperLoop</div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) {
      Alert.alert("Export Failed", "Could not generate PDF.");
    }
  };

  const renderQuestion = ({ item, index }: { item: Question, index: number }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.numberBadge}><Text style={styles.numberLabel}>Q</Text><TextInput style={styles.numberInput} value={item.number} onChangeText={t => updateQuestion(item.id, 'number', t)} /></View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => moveQuestion(index, 'up')} style={styles.actionBtn}><Ionicons name="caret-up" size={20} color="#6B7280" /></TouchableOpacity>
          <TouchableOpacity onPress={() => moveQuestion(index, 'down')} style={styles.actionBtn}><Ionicons name="caret-down" size={20} color="#6B7280" /></TouchableOpacity>
          <TouchableOpacity onPress={() => deleteQuestion(item.id)} style={[styles.actionBtn, { marginLeft: 8 }]}><Ionicons name="trash-outline" size={18} color="#EF4444" /></TouchableOpacity>
        </View>
      </View>
      <TextInput style={styles.bodyInput} value={item.text} onChangeText={t => updateQuestion(item.id, 'text', t)} multiline placeholder="Question text..." scrollEnabled={false} />
      
      {/* DIAGRAM PREVIEW (No filter here, so user sees original) */}
      {item.diagramUri && (
        <View style={styles.diagramContainer}>
          <Text style={styles.diagramLabel}>Attached Diagram:</Text>
          <Image source={{ uri: item.diagramUri }} style={styles.diagramImage} resizeMode="contain" />
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.marksLabel}>Marks:</Text>
        <TextInput style={styles.marksInput} value={item.marks} onChangeText={t => updateQuestion(item.id, 'marks', t)} keyboardType="numeric" />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={24} color="#111827" /><Text style={styles.backText}>Edit</Text></TouchableOpacity>
        <TouchableOpacity onPress={handleExport} style={styles.saveBtn}><Text style={styles.saveText}>Save PDF</Text><Ionicons name="download-outline" size={18} color="white" style={{ marginLeft: 4 }} /></TouchableOpacity>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <FlatList
          data={questions}
          keyExtractor={item => item.id}
          renderItem={renderQuestion}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<TouchableOpacity onPress={addQuestion} style={styles.addBtn}><Ionicons name="add-circle" size={24} color="#2563EB" /><Text style={styles.addText}>Add Question</Text></TouchableOpacity>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  navBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 16, fontWeight: '600', color: '#111827', marginLeft: 4 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563EB', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 100 },
  headerSection: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 20, elevation: 2 },
  headerRow: { borderBottomWidth: 1, borderColor: '#E5E7EB', marginBottom: 12, paddingBottom: 8 },
  schoolInput: { fontSize: 14, color: '#6B7280', fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  titleInput: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  metaLabel: { fontSize: 12, color: '#6B7280', marginRight: 8 },
  metaInput: { fontSize: 14, fontWeight: 'bold', color: '#111827', minWidth: 40 },
  instructionBlock: { backgroundColor: '#F0F9FF', padding: 12, borderRadius: 8, borderLeftWidth: 3, borderColor: '#2563EB' },
  instructionLabel: { fontSize: 11, fontWeight: 'bold', color: '#1E40AF', marginBottom: 4, textTransform: 'uppercase' },
  instructionInput: { fontSize: 13, color: '#1E3A8A', fontStyle: 'italic', lineHeight: 20 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  numberBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  numberLabel: { fontSize: 12, fontWeight: 'bold', color: '#2563EB', marginRight: 4 },
  numberInput: { fontSize: 16, fontWeight: 'bold', color: '#1E3A8A', minWidth: 20 },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 4 },
  bodyInput: { fontSize: 16, color: '#374151', lineHeight: 24, minHeight: 60, textAlignVertical: 'top' },
  diagramContainer: { marginTop: 10, padding: 10, backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  diagramLabel: { fontSize: 10, fontWeight: 'bold', color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' },
  diagramImage: { width: '100%', height: 150, backgroundColor: 'white' },
  cardFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: '#F3F4F6' },
  marksLabel: { fontSize: 12, color: '#9CA3AF', marginRight: 8 },
  marksInput: { fontSize: 14, fontWeight: 'bold', color: '#111827', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, minWidth: 30, textAlign: 'center' },
  addBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#2563EB', borderRadius: 12, backgroundColor: '#EFF6FF' },
  addText: { color: '#2563EB', fontWeight: 'bold', marginLeft: 8 }
});