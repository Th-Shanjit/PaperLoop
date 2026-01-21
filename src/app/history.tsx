import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Trash2, FileText } from 'lucide-react-native';
import tw from 'twrnc';
import { getSavedExams, deleteExam, SavedExam } from '../core/services/storage';
import { generateExamPDF } from '../core/services/pdf';

export default function HistoryScreen() {
  const router = useRouter();
  const [exams, setExams] = useState<SavedExam[]>([]);

  // Reload data every time screen opens
  useFocusEffect(
    useCallback(() => {
      loadExams();
    }, [])
  );

  const loadExams = async () => {
    const data = await getSavedExams();
    setExams(data);
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Delete Exam", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => {
          const updated = await deleteExam(id);
          setExams(updated);
        }
      }
    ]);
  };

  const handleOpenPDF = async (exam: SavedExam) => {
    // Create a temporary header using the saved title
    const tempHeader = {
      schoolName: "Saved History Exam",
      examTitle: exam.title,       // Use the saved title here
      duration: "N/A",
      totalMarks: "N/A",
      instructions: "Reprinted from History"
    };
  
    // Now pass the object, not just the string
    await generateExamPDF(tempHeader, exam.questions, 'simple');
  };

  return (
    <View style={tw`flex-1 bg-gray-50`}>
      {/* Header */}
      <View style={tw`bg-white pt-12 pb-4 px-6 border-b border-gray-200 flex-row items-center gap-4`}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={28} color="#333" />
        </TouchableOpacity>
        <Text style={tw`text-2xl font-bold text-gray-900`}>Saved Exams</Text>
      </View>

      {/* List */}
      <FlatList
        data={exams}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tw`p-6`}
        ListEmptyComponent={
          <View style={tw`items-center py-20`}>
            <Text style={tw`text-gray-400 text-lg`}>No saved exams yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            onPress={() => handleOpenPDF(item)}
            style={tw`bg-white p-4 rounded-xl mb-4 shadow-sm border border-gray-100 flex-row items-center justify-between`}
          >
            <View style={tw`flex-row items-center gap-4 flex-1`}>
              <View style={tw`bg-blue-100 p-3 rounded-lg`}>
                <FileText size={24} color="#2563EB" />
              </View>
              <View>
                <Text style={tw`font-bold text-gray-800 text-lg`}>{item.title}</Text>
                <Text style={tw`text-gray-500`}>{item.date} • {item.questions.length} Questions</Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => handleDelete(item.id)} style={tw`p-3`}>
              <Trash2 size={20} color="#EF4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}