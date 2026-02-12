import React, { useState, useCallback } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, StatusBar, FlatList, Alert, RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loadProjects, deleteProject, ExamProject } from '../core/services/storage';

export default function DashboardScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ExamProject[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setRefreshing(true);
    const data = await loadProjects();
    setProjects(data);
    setRefreshing(false);
  };

  const handleOpenProject = (project: ExamProject) => {
    router.push({
      pathname: "/editor",
      params: { projectId: project.id }
    });
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Draft?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => {
          await deleteProject(id);
          loadData();
        }
      }
    ]);
  };

  // --- SAFE COUNT HELPER (The Fix) ---
  const getQuestionCount = (project: ExamProject) => {
    // 1. Check for New "Sections" Format
    if (project.sections && project.sections.length > 0) {
      return project.sections.reduce((total, sec) => total + (sec.questions ? sec.questions.length : 0), 0);
    }
    // 2. Fallback to Old "Flat List" Format
    if (project.questions && project.questions.length > 0) {
      return project.questions.length;
    }
    // 3. Empty Project
    return 0;
  };

  const renderProject = ({ item }: { item: ExamProject }) => (
    <TouchableOpacity onPress={() => handleOpenProject(item)} style={styles.fileCard} activeOpacity={0.7}>
      <View style={styles.fileIcon}>
        <Ionicons name="document-text" size={24} color="#2563EB" />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.title || "Untitled Exam"}</Text>
        <Text style={styles.fileDate}>
          {new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
          {' • '} 
          {/* SAFE COUNT IMPLEMENTATION */}
          {getQuestionCount(item)} Questions
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.moreBtn}>
        <Ionicons name="trash-outline" size={20} color="#9CA3AF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>PaperLoop</Text>
          <Text style={styles.subGreeting}>Digitize & Grade Exams</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionContainer}>
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroTitle}>New Scan</Text>
            <Text style={styles.heroSub}>Convert handwritten paper to PDF</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/camera")} style={styles.fab}>
            <Ionicons name="camera" size={28} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.sectionContainer, { flex: 1 }]}>
        <View style={styles.listCard}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
            <Text style={styles.sectionTitle}>Your Drafts</Text>
          </View>
          
          {projects.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="file-tray-outline" size={48} color="#E5E7EB" />
              <Text style={styles.emptyText}>No drafts yet</Text>
              <Text style={styles.emptySub}>Scan a paper or create a manual exam.</Text>
            </View>
          ) : (
            <FlatList
              data={projects}
              renderItem={renderProject}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
            />
          )}
        </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, marginBottom: 20 },
  greeting: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subGreeting: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  settingsBtn: { padding: 8, backgroundColor: 'white', borderRadius: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  sectionContainer: { paddingHorizontal: 20, marginBottom: 16 },
  heroCard: { backgroundColor: '#2563EB', borderRadius: 24, padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: "#2563EB", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  heroTitle: { fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOpacity: 0.1, elevation: 2 },
  listCard: { flex: 1, backgroundColor: 'white', borderRadius: 24, padding: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#9CA3AF', marginTop: 8 },
  fileCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#F9FAFB', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  fileIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 2 },
  fileDate: { fontSize: 11, color: '#6B7280' },
  moreBtn: { padding: 8 },
});