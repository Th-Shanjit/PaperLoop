import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Camera, Send, ChevronLeft, Sparkles, X, Trash2, PlusCircle, Layout } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import tw from 'twrnc';
import { transcribeHandwriting } from '../core/services/gemini';
import { generateExamPDF, TemplateType } from '../core/services/pdf';
import { saveExam } from '../core/services/storage';

const { width } = Dimensions.get('window');
const IMAGE_SIZE = (width - 48) / 2;

export default function GeneratorScreen() {
  const router = useRouter();
  
  // --- STATE ---
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isMathMode, setIsMathMode] = useState(false);

  // --- PDF SETTINGS STATE (These were missing!) ---
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('simple');
  const [pdfHeader, setPdfHeader] = useState({
    schoolName: "Greenwood High School",
    examTitle: "Unit Test I",
    duration: "1 Hour",
    totalMarks: "25",
    instructions: "All questions are compulsory."
  });

  // 1. LOAD IMAGES AND MATH MODE
  useEffect(() => {
    const incoming = (global as any).scannedImages;
    const mathMode = (global as any).isMathMode;
    if (incoming && incoming.length > 0) {
      setImages(incoming);
    }
    if (mathMode !== undefined) {
      setIsMathMode(mathMode);
    }
  }, []);

  // 2. SWAP LOGIC
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

  // 3. TRANSCRIBE
  const handleTranscribe = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setResult(null);
    setStatus("Preparing images...");
    try {
      const base64Images = await Promise.all(
        images.map(async (uri) => await FileSystem.readAsStringAsync(uri, { encoding: 'base64' }))
      );
      setStatus(isMathMode ? "📐 Math/Science Mode: Tracing structures..." : "📝 Standard Mode: Reading handwriting...");
      const data = await transcribeHandwriting(base64Images, isMathMode);
      setStatus("Finalizing...");
      setResult(data);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  // 4. OPEN PDF SETTINGS
  const handleOpenPDFSetup = () => {
    if (!result?.questions) return;
    setShowPdfModal(true);
  };

  // 5. GENERATE FINAL PDF (FIXED: Uses state correctly)
  const handleGenerateFinalPDF = async () => {
    setShowPdfModal(false);
    // Pass the full header object and template choice, NOT just a string
    await generateExamPDF(pdfHeader, result.questions, selectedTemplate);
  };

  // 6. SAVE EXAM
  const handleSave = async () => {
    if (!result?.questions) return;
    const defaultName = `Exam ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const success = await saveExam(defaultName, result.questions);
    if (success) Alert.alert("Success", "Exam saved to History!");
  };

  // --- EDITOR UPDATES ---
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
    Alert.alert("Delete Question", "Are you sure?", [
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

  // --- RENDER HELPERS ---
  const TemplateOption = ({ type, label, icon }: { type: TemplateType, label: string, icon: any }) => (
    <TouchableOpacity 
      onPress={() => setSelectedTemplate(type)}
      style={[
        tw`flex-1 items-center p-3 rounded-xl border-2 mr-2`,
        selectedTemplate === type ? tw`border-blue-500 bg-blue-50` : tw`border-gray-200 bg-white`
      ]}
    >
      <View style={tw`mb-2`}>{icon}</View>
      <Text style={[tw`text-xs font-bold`, selectedTemplate === type ? tw`text-blue-600` : tw`text-gray-500`]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // --- VIEWS ---
  if (loading) return (
    <View style={tw`flex-1 bg-white justify-center items-center px-8`}>
      <ActivityIndicator size="large" color="#2563EB" />
      <Text style={tw`mt-6 text-xl font-bold text-gray-800`}>Generating Exam</Text>
      <Text style={tw`mt-2 text-gray-500`}>{status}</Text>
    </View>
  );

  if (result) return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={tw`flex-1 bg-white`}>
      <View style={tw`bg-white px-6 pt-12 pb-4 border-b border-gray-100 flex-row justify-between items-center`}>
        <TouchableOpacity onPress={() => setResult(null)} style={tw`p-2`}><ChevronLeft size={24} color="#333" /></TouchableOpacity>
        <View><Text style={tw`text-lg font-bold text-center`}>Edit Exam</Text><Text style={tw`text-xs text-gray-400 text-center`}>{result.questions.length} Questions</Text></View>
        <View style={tw`flex-row gap-2`}>
          <TouchableOpacity onPress={handleSave} style={tw`bg-gray-100 px-4 py-2 rounded-lg`}><Text style={tw`font-bold text-gray-900`}>Save</Text></TouchableOpacity>
          <TouchableOpacity onPress={handleOpenPDFSetup} style={tw`p-2 bg-blue-50 rounded-lg`}><Layout size={20} color="#2563EB" /></TouchableOpacity>
        </View>
      </View>

      <ScrollView style={tw`flex-1 px-4 pt-4`}>
        {result.questions?.map((q: any, i: number) => (
          <View key={i} style={tw`bg-white border border-gray-200 p-4 rounded-xl mb-3 shadow-sm`}>
            <View style={tw`flex-row justify-between items-center mb-2`}>
              <Text style={tw`font-bold text-blue-600`}>Q{i + 1}</Text>
              <View style={tw`flex-row items-center gap-2`}>
                <View style={tw`flex-row items-center bg-gray-50 px-2 py-1 rounded border border-gray-200`}><TextInput value={String(q.marks)} onChangeText={(val) => updateQuestionMarks(val, i)} keyboardType="numeric" style={tw`font-bold text-gray-700 text-xs w-6 text-center`} /><Text style={tw`text-xs text-gray-400 ml-1`}>Marks</Text></View>
                <TouchableOpacity onPress={() => deleteQuestion(i)} style={tw`p-1`}><Trash2 size={18} color="#EF4444" /></TouchableOpacity>
              </View>
            </View>
            <TextInput value={q.text} onChangeText={(val) => updateQuestionText(val, i)} multiline style={tw`text-gray-800 leading-6 text-base pt-0`} />
          </View>
        ))}
        <TouchableOpacity onPress={addQuestion} style={tw`flex-row justify-center items-center py-6 border-2 border-dashed border-gray-300 rounded-xl mb-24 bg-gray-50`}><PlusCircle size={24} color="#9CA3AF" /><Text style={tw`text-gray-400 font-bold ml-2`}>Add Question</Text></TouchableOpacity>
      </ScrollView>

      {/* FLOATING ACTION BUTTON */}
      <View style={tw`absolute bottom-8 left-6 right-6`}>
        <TouchableOpacity onPress={handleOpenPDFSetup} style={tw`bg-blue-600 h-14 rounded-full flex-row justify-center items-center shadow-lg`}>
          <Text style={tw`text-white font-bold text-lg mr-2`}>Finalize PDF</Text>
          <Layout size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* --- PDF SETTINGS MODAL --- */}
      <Modal visible={showPdfModal} animationType="slide" transparent={true}>
        <View style={tw`flex-1 justify-end bg-black bg-opacity-50`}>
          <View style={tw`bg-white rounded-t-3xl p-6 h-[85%]`}>
            <View style={tw`flex-row justify-between items-center mb-6`}>
              <Text style={tw`text-xl font-bold`}>Paper Settings</Text>
              <TouchableOpacity onPress={() => setShowPdfModal(false)}><X size={24} color="#333" /></TouchableOpacity>
            </View>
            
            <ScrollView>
              {/* Template Selector */}
              <Text style={tw`text-gray-500 mb-3 ml-1 font-bold`}>SELECT TEMPLATE</Text>
              <View style={tw`flex-row mb-6`}>
                <TemplateOption type="simple" label="Simple" icon={<View style={tw`w-8 h-10 border border-gray-400 bg-gray-100 rounded-sm`} />} />
                <TemplateOption type="unit_test" label="Unit Test" icon={<View style={tw`w-8 h-10 border border-gray-800 bg-white rounded-sm items-center justify-center`}><View style={tw`w-6 h-6 border border-gray-300`} /></View>} />
                <TemplateOption type="final_exam" label="Final Exam" icon={<View style={tw`w-8 h-10 border-2 border-double border-black bg-white rounded-sm`} />} />
              </View>

              <Text style={tw`text-gray-500 mb-1 ml-1`}>School Name</Text>
              <TextInput style={tw`bg-gray-100 p-4 rounded-xl mb-4 text-base`} value={pdfHeader.schoolName} onChangeText={t => setPdfHeader({...pdfHeader, schoolName: t})} />
              
              <Text style={tw`text-gray-500 mb-1 ml-1`}>Exam Title (e.g. Final Term)</Text>
              <TextInput style={tw`bg-gray-100 p-4 rounded-xl mb-4 text-base`} value={pdfHeader.examTitle} onChangeText={t => setPdfHeader({...pdfHeader, examTitle: t})} />
              
              <View style={tw`flex-row gap-4`}>
                <View style={tw`flex-1`}><Text style={tw`text-gray-500 mb-1 ml-1`}>Time</Text><TextInput style={tw`bg-gray-100 p-4 rounded-xl mb-4 text-base`} value={pdfHeader.duration} onChangeText={t => setPdfHeader({...pdfHeader, duration: t})} /></View>
                <View style={tw`flex-1`}><Text style={tw`text-gray-500 mb-1 ml-1`}>Marks</Text><TextInput style={tw`bg-gray-100 p-4 rounded-xl mb-4 text-base`} value={pdfHeader.totalMarks} onChangeText={t => setPdfHeader({...pdfHeader, totalMarks: t})} /></View>
              </View>

              <Text style={tw`text-gray-500 mb-1 ml-1`}>Instructions</Text>
              <TextInput style={tw`bg-gray-100 p-4 rounded-xl mb-8 text-base h-24`} multiline textAlignVertical="top" value={pdfHeader.instructions} onChangeText={t => setPdfHeader({...pdfHeader, instructions: t})} />

              <TouchableOpacity onPress={handleGenerateFinalPDF} style={tw`bg-black h-14 rounded-full flex-row justify-center items-center shadow-lg mb-8`}>
                 <Text style={tw`text-white font-bold text-lg`}>Print / Share PDF</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );

  // --- STAGING VIEW (Unchanged) ---
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={tw`flex-1 bg-gray-50`}>
      <View style={tw`bg-white pt-12 pb-4 px-6 border-b border-gray-200`}><Text style={tw`text-2xl font-bold text-gray-900`}>New Test</Text><Text style={tw`text-gray-500`}>Review scans.</Text></View>
      <ScrollView contentContainerStyle={tw`p-6 flex-grow`}>
        {images.length === 0 ? (
          <View style={tw`items-center py-20`}><View style={tw`bg-gray-200 p-6 rounded-full mb-4`}><Camera size={40} color="#9CA3AF" /></View><Text style={tw`text-gray-400 text-center`}>No scans yet.{'\n'}Tap camera to start.</Text></View>
        ) : (
          <View style={tw`flex-row flex-wrap justify-between`}>
            {images.map((uri, index) => {
              const isSelected = selectedIdx === index;
              return (
                <TouchableOpacity key={index} onPress={() => handleImageTap(index)} activeOpacity={0.8} style={[tw`mb-4 rounded-xl overflow-hidden bg-white border-2 shadow-sm`, { width: IMAGE_SIZE, height: IMAGE_SIZE * 1.3, borderColor: isSelected ? '#2563EB' : 'transparent', transform: [{ scale: isSelected ? 0.95 : 1 }] }]}> 
                  <Image source={{ uri }} style={tw`flex-1`} resizeMode="cover" />
                  <View style={tw`bg-gray-100 py-2 border-t border-gray-200 items-center`}><Text style={tw`font-bold text-gray-700 text-xs`}>Page {index + 1}</Text></View>
                  {isSelected && (<View style={tw`absolute inset-0 bg-blue-500 bg-opacity-20 justify-center items-center`}><Text style={tw`text-white font-bold mt-2 shadow-lg`}>Tap to Swap</Text><TouchableOpacity onPress={handleRemoveImage} style={tw`absolute top-2 right-2 bg-red-500 p-2 rounded-full`}><X size={16} color="white" /></TouchableOpacity></View>)}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={() => router.push('/camera')} style={[tw`mb-4 rounded-xl border-2 border-dashed border-gray-300 justify-center items-center bg-gray-50`, { width: IMAGE_SIZE, height: IMAGE_SIZE * 1.3 }]}><PlusCircle size={32} color="#9CA3AF" /><Text style={tw`text-gray-400 font-bold mt-2`}>Add Page</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <View style={tw`bg-white border-t border-gray-200 px-4 py-4`}>
        {images.length > 0 ? (
          <TouchableOpacity onPress={handleTranscribe} style={tw`bg-black h-14 rounded-2xl flex-row justify-center items-center shadow-lg`}><Sparkles size={20} color="#FFD700" style={tw`mr-2`} /><Text style={tw`text-white font-bold text-lg`}>Transcribe</Text></TouchableOpacity>
        ) : (
          <View style={tw`flex-row items-center gap-2`}><View style={tw`flex-1 bg-gray-100 rounded-full px-4 py-3`}><TextInput style={tw`text-base text-gray-900`} placeholder="Type topic..." placeholderTextColor="#9CA3AF" /></View><TouchableOpacity style={tw`bg-gray-200 rounded-full p-3`}><Send size={20} color="#374151" /></TouchableOpacity><TouchableOpacity style={tw`bg-blue-500 rounded-full p-4 shadow-lg`} onPress={() => router.push('/camera')}><Camera size={24} color="#FFFFFF" /></TouchableOpacity></View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}