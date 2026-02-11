import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface SavedExam {
  id: string;
  name: string;
  date: Date;
  uri: string;
}

export default function DashboardScreen() {
  const router = useRouter();
  const [recentExams, setRecentExams] = useState<SavedExam[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadRecentFiles();
    }, [])
  );

  const loadRecentFiles = async () => {
    try {
      const docDir = FileSystem.documentDirectory + 'exams/';
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      }

      const files = await FileSystem.readDirectoryAsync(docDir);
      
      const exams = await Promise.all(files
        .filter(f => f.endsWith('.pdf'))
        .map(async (f) => {
          const uri = docDir + f;
          const info = await FileSystem.getInfoAsync(uri);
          return {
            id: f,
            name: f.replace('.pdf', '').replace(/_/g, ' '),
            date: new Date(info.modificationTime || Date.now() * 1000),
            uri: uri
          };
        })
      );

      setRecentExams(exams.sort((a, b) => b.date.getTime() - a.date.getTime()));

    } catch (e) {
      console.log("Error loading files:", e);
    }
  };

  const handleOpenPdf = async (uri: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    } else {
      Alert.alert("Error", "Sharing is not available on this device");
    }
  };

  const handleDelete = (exam: SavedExam) => {
    Alert.alert("Delete Exam?", `Are you sure you want to delete "${exam.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => {
          await FileSystem.deleteAsync(exam.uri);
          loadRecentFiles();
        }
      }
    ]);
  };

  const renderExam = ({ item }: { item: SavedExam }) => (
    <TouchableOpacity onPress={() => handleOpenPdf(item.uri)} style={styles.fileCard}>
      <View style={styles.fileIcon}>
        <Ionicons name="document-text" size={24} color="#2563EB" />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileDate}>{item.date.toLocaleDateString()} • {item.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item)} style={styles.moreBtn}>
        <Ionicons name="trash-outline" size={20} color="#9CA3AF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>PaperLoop</Text>
          <Text style={styles.subGreeting}>Digitize & Grade Exams</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* HERO ACTION (New Scan) */}
      <View style={styles.sectionContainer}>
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroTitle}>New Scan</Text>
            <Text style={styles.heroSub}>Convert handwritten paper to PDF</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/camera")} style={styles.fab}>
            {/* ADDED CAMERA ICON HERE */}
            <Ionicons name="camera" size={28} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* RECENT FILES LIST (Your Exams) */}
      <View style={[styles.sectionContainer, { flex: 1 }]}>
        <View style={styles.listCard}>
          <Text style={styles.sectionTitle}>Your Exams</Text>
          
          {recentExams.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="documents-outline" size={48} color="#E5E7EB" />
              <Text style={styles.emptyText}>No exams yet</Text>
              <Text style={styles.emptySub}>Tap the camera above to start.</Text>
            </View>
          ) : (
            <FlatList
              data={recentExams}
              renderItem={renderExam}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, marginBottom: 20 },
  greeting: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subGreeting: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  settingsBtn: { padding: 8, backgroundColor: 'white', borderRadius: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },

  // Shared Container for Alignment
  sectionContainer: { paddingHorizontal: 20, marginBottom: 16 },

  // Hero Card
  heroCard: { backgroundColor: '#2563EB', borderRadius: 24, padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: "#2563EB", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  heroTitle: { fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOpacity: 0.1, elevation: 2 },

  // List Card (Now matches Hero width)
  listCard: { flex: 1, backgroundColor: 'white', borderRadius: 24, padding: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 16 },
  
  // Empty State
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#9CA3AF', marginTop: 8 },

  // File Item
  fileCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#F9FAFB', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  fileIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 2 },
  fileDate: { fontSize: 11, color: '#6B7280' },
  moreBtn: { padding: 8 },
});