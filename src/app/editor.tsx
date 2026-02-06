import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  StyleSheet, StatusBar, Alert, KeyboardAvoidingView, Platform, ScrollView, Image 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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

  // --- STATE ---
  const [header, setHeader] = useState<ExamHeader>({
    schoolName: "PaperLoop Academy",
    title: "New Exam",
    duration: "60 mins",
    totalMarks: "50",
    instructions: "All questions are compulsory."
  });

  const [questions, setQuestions] = useState<Question[]>([]);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (initialData) {
      try {
        console.log("EDITOR RECEIVED:", initialData); // <--- DEBUG LOG
        const parsed = JSON.parse(initialData as string);
        
        // Map raw Gemini output with "Fallbacks"
        const formatted = parsed.map((q: any, index: number) => ({
          id: Date.now().toString() + index,
          // Try multiple keys for number
          number: (q.question_number || q.number || q.id || (index + 1)).toString(),
          // Try multiple keys for text
          text: q.question_text || q.text || q.question || "Blank Question", 
          // Try multiple keys for marks
          marks: (q.marks || q.mark || "5").toString()
        }));
        
        setQuestions(formatted);
      } catch (e) {
        Alert.alert("Error", "Could not load exam data.");
      }
    }
  }, [initialData]);
  // --- ACTIONS ---

  const updateQuestion = (id: string, field: keyof Question, value: string) => {
    setQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const deleteQuestion = (id: string) => {
    Alert.alert("Delete Question?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
          setQuestions(prev => prev.filter(q => q.id !== id));
      }}
    ]);
  };

  const addQuestion = () => {
    const newQ: Question = {
      id: Date.now().toString(),
      number: (questions.length + 1).toString(),
      text: "Type your question here...",
      marks: "5"
    };
    setQuestions(prev => [...prev, newQ]);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;

    const newQs = [...questions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap
    [newQs[index], newQs[targetIndex]] = [newQs[targetIndex], newQs[index]];
    setQuestions(newQs);
  };

  // 1. THE HTML GENERATOR (The "Printer")
  const generateHTML = () => {
    return `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .school-name { font-size: 24px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; }
            .exam-title { font-size: 20px; margin-bottom: 15px; }
            .meta-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; }
            
            .instructions { 
              background-color: #f9f9f9; 
              padding: 15px; 
              font-style: italic; 
              font-size: 12px; 
              margin-bottom: 30px; 
              border-left: 4px solid #444;
            }

            .question-item { margin-bottom: 25px; page-break-inside: avoid; }
            .q-row { display: flex; flex-direction: row; align-items: flex-start; }
            .q-num { font-weight: bold; width: 30px; flex-shrink: 0; }
            .q-text { flex: 1; white-space: pre-wrap; line-height: 1.5; } /* pre-wrap preserves your formatting */
            .q-marks { font-weight: bold; width: 40px; text-align: right; margin-left: 10px; }
            
            .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          
          <div class="header">
            <div class="school-name">${header.schoolName}</div>
            <div class="exam-title">${header.title}</div>
            <div class="meta-row">
              <span>Duration: ${header.duration}</span>
              <span>Total Marks: ${header.totalMarks}</span>
            </div>
          </div>

          ${header.instructions ? `
            <div class="instructions">
              <strong>Instructions:</strong><br/>
              ${header.instructions.replace(/\n/g, '<br/>')}
            </div>
          ` : ''}

          <div class="questions-list">
            ${questions.map(q => `
              <div class="question-item">
                <div class="q-row">
                  <div class="q-num">${q.number}.</div>
                  <div class="q-text">${q.text}</div>
                  <div class="q-marks">[${q.marks}]</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="footer">
            Generated by PaperLoop AI
          </div>

        </body>
      </html>
    `;
  };

  // 2. THE EXPORT ACTION
  const handleExport = async () => {
    try {
      // Generate the HTML string
      const html = generateHTML();

      // Create PDF file
      const { uri } = await Print.printToFileAsync({
        html: html,
        base64: false
      });

      // Open Share Menu (Save to Files, WhatsApp, Email)
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
    } catch (error) {
      Alert.alert("Export Error", "Could not generate PDF. Please try again.");
      console.error(error);
    }
  };

  // --- RENDERERS ---

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={styles.headerRow}>
        <TextInput 
          style={styles.schoolInput} 
          value={header.schoolName}
          onChangeText={t => setHeader({...header, schoolName: t})}
          placeholder="Institution Name"
        />
      </View>
      <TextInput 
        style={styles.titleInput} 
        value={header.title}
        onChangeText={t => setHeader({...header, title: t})}
        placeholder="Exam Title"
      />
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Duration:</Text>
          <TextInput 
            style={styles.metaInput} 
            value={header.duration}
            onChangeText={t => setHeader({...header, duration: t})}
          />
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Marks:</Text>
          <TextInput 
            style={styles.metaInput} 
            value={header.totalMarks}
            onChangeText={t => setHeader({...header, totalMarks: t})}
          />
        </View>
      </View>
      
      {/* INSTRUCTIONS BLOCK */}
      <View style={styles.instructionBlock}>
        <Text style={styles.instructionLabel}>Instructions:</Text>
        <TextInput 
          style={styles.instructionInput} 
          value={header.instructions}
          onChangeText={t => setHeader({...header, instructions: t})}
          multiline
          placeholder="Enter general instructions here..."
        />
      </View>
    </View>
  );

  const renderQuestion = ({ item, index }: { item: Question, index: number }) => (
    <View style={styles.card}>
      {/* Top Bar: Number & Actions */}
      <View style={styles.cardTop}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberLabel}>Q</Text>
          <TextInput 
            style={styles.numberInput} 
            value={item.number}
            onChangeText={t => updateQuestion(item.id, 'number', t)}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => moveQuestion(index, 'up')} style={styles.actionBtn}>
            <Ionicons name="caret-up" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => moveQuestion(index, 'down')} style={styles.actionBtn}>
            <Ionicons name="caret-down" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteQuestion(item.id)} style={[styles.actionBtn, { marginLeft: 8 }]}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Body */}
      <TextInput 
        style={styles.bodyInput} 
        value={item.text}
        onChangeText={t => updateQuestion(item.id, 'text', t)}
        multiline
        placeholder="Question text..."
        scrollEnabled={false} // Expands with content
      />

      {/* --- NEW: DIAGRAM PREVIEW --- */}
      {item.diagramUri && (
        <View style={styles.diagramContainer}>
          <Text style={styles.diagramLabel}>Attached Diagram:</Text>
          <Image 
            source={{ uri: item.diagramUri }} 
            style={styles.diagramImage} 
            resizeMode="contain" 
          />
        </View>
      )}

      {/* Footer: Marks */}
      <View style={styles.cardFooter}>
        <Text style={styles.marksLabel}>Marks:</Text>
        <TextInput 
          style={styles.marksInput} 
          value={item.marks}
          onChangeText={t => updateQuestion(item.id, 'marks', t)}
          keyboardType="numeric"
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      {/* Top Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
          <Text style={styles.backText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleExport} style={styles.saveBtn}>
          <Text style={styles.saveText}>Save PDF</Text>
          <Ionicons name="download-outline" size={18} color="white" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        <FlatList
          data={questions}
          keyExtractor={item => item.id}
          renderItem={renderQuestion}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <TouchableOpacity onPress={addQuestion} style={styles.addBtn}>
              <Ionicons name="add-circle" size={24} color="#2563EB" />
              <Text style={styles.addText}>Add Question</Text>
            </TouchableOpacity>
          }
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

  // HEADER STYLES
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

  // QUESTION CARD STYLES
  card: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  
  numberBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  numberLabel: { fontSize: 12, fontWeight: 'bold', color: '#2563EB', marginRight: 4 },
  numberInput: { fontSize: 16, fontWeight: 'bold', color: '#1E3A8A', minWidth: 20 },

  cardActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 4 },

  bodyInput: { fontSize: 16, color: '#374151', lineHeight: 24, minHeight: 60, textAlignVertical: 'top' },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: '#F3F4F6' },
  marksLabel: { fontSize: 12, color: '#9CA3AF', marginRight: 8 },
  marksInput: { fontSize: 14, fontWeight: 'bold', color: '#111827', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, minWidth: 30, textAlign: 'center' },

  // ADD BUTTON
  addBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#2563EB', borderRadius: 12, backgroundColor: '#EFF6FF' },
  addText: { color: '#2563EB', fontWeight: 'bold', marginLeft: 8 },

  // DIAGRAM STYLES
  diagramContainer: { marginTop: 10, padding: 10, backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  diagramLabel: { fontSize: 10, fontWeight: 'bold', color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' },
  diagramImage: { width: '100%', height: 150, backgroundColor: 'white' }
});