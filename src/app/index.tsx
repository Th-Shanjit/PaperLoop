import React, { useState, useCallback } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, StatusBar, FlatList, Alert, RefreshControl, Modal, ActivityIndicator, TextInput 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import { loadProjects, deleteProject, ExamProject, getProject } from '../core/services/storage';
import { generateExamHtml } from '../core/services/pdf';
import * as Print from 'expo-print';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function DashboardScreen() {
  const router = useRouter();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
  const [projects, setProjects] = useState<ExamProject[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // NEW: Search state

  // NEW: Filter the projects based on the search query
  const filteredProjects = projects.filter(p => 
    (p.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (p.header?.className?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

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
    showAlert("Delete Draft?", "This action cannot be undone.", [
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

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    showAlert(`Delete ${count} drafts?`, "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => {
          for (const id of selectedIds) {
            await deleteProject(id);
          }
          setSelectedIds(new Set());
          setSelectionMode(false);
          loadData();
        }
      }
    ]);
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleExportPdf = async (projectId: string) => {
    setContextMenuId(null);
    setIsExporting(true);
    try {
      const project = await getProject(projectId);
      if (!project) {
        showAlert("Error", "Project not found");
        setIsExporting(false);
        return;
      }

      const html = await generateExamHtml(project.header, project.sections || [], project.settings?.fontTheme || 'modern');
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      
      // Try to save to MediaLibrary first
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
          showAlert("Success", "PDF saved to Downloads!");
        } else {
          // Permission denied, use share as fallback
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
      } catch (mediaError) {
        // MediaLibrary failed (e.g., Expo Go limitations), use share as fallback
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (e) {
      showAlert("Export Failed", "Could not generate PDF.");
    } finally {
      setIsExporting(false);
    }
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

  const renderProject = ({ item }: { item: ExamProject }) => {
    const isSelected = selectedIds.has(item.id);
    const qCount = getQuestionCount(item); 

    return (
      <TouchableOpacity 
        onPress={() => selectionMode ? toggleSelection(item.id) : handleOpenProject(item)} 
        style={[styles.fileCard, isSelected && styles.fileCardSelected]} 
        activeOpacity={0.7}
      >
        {selectionMode && (
          <View style={styles.checkbox}>
            <View style={[styles.checkboxInner, isSelected && styles.checkboxChecked]}>
              {isSelected && <Ionicons name="checkmark" size={16} color="white" />}
            </View>
          </View>
        )}
        <View style={styles.fileIcon}>
          <Ionicons name="document-text" size={24} color="#2563EB" />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.title || "Untitled Exam"}</Text>
          {item.header?.className && (
            <Text style={styles.fileClass} numberOfLines={1}>{item.header.className}</Text>
          )}
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4}}>
            <Text style={styles.fileDate}>
              {new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
              {' • '} {qCount} Qs
            </Text>
            {/* THE STATUS BADGE */}
            <View style={{backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6}}>
              <Text style={{fontSize: 10, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5}}>DRAFT</Text>
            </View>
          </View>
        </View>
        {!selectionMode && (
          <TouchableOpacity onPress={() => setContextMenuId(item.id)} style={styles.moreBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      <View style={styles.header}>
        <View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Text style={styles.greeting}>PaperLoop</Text>
            <View style={{backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6}}>
              <Text style={{color: '#2563EB', fontSize: 10, fontWeight: '900', letterSpacing: 0.5}}>BETA</Text>
            </View>
          </View>
          <Text style={styles.subGreeting}>Digitize & Grade Exams</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionContainer}>
        {/* ACTION CARDS ROW */}
        <View style={styles.actionRow}>
          {/* Main Scan Button */}
          <TouchableOpacity onPress={() => router.push("/camera")} style={styles.heroCardMain} activeOpacity={0.8}>
            <View>
              <Text style={styles.heroTitle}>New Scan</Text>
              <Text style={styles.heroSub}>AI paper to PDF</Text>
            </View>
            <View style={styles.fabMain}>
              <Ionicons name="camera" size={24} color="#2563EB" />
            </View>
          </TouchableOpacity>

          {/* Blank Exam Button */}
          <TouchableOpacity onPress={() => router.push("/editor")} style={styles.heroCardSecondary} activeOpacity={0.8}>
            <View style={styles.fabSecondary}>
              <Ionicons name="document-text" size={24} color="#4B5563" />
            </View>
            <Text style={styles.heroTitleSecondary}>Blank</Text>
          </TouchableOpacity>
        </View>

        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search exams or subjects..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.sectionContainer, { flex: 1 }]}>
        <View style={styles.listCard}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
            <Text style={styles.sectionTitle}>Your Drafts</Text>
            {!selectionMode ? (
              <TouchableOpacity onPress={() => setSelectionMode(true)} style={styles.selectBtn}>
                <Text style={styles.selectBtnText}>Select</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={cancelSelection} style={styles.selectBtn}>
                <Text style={styles.selectBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {filteredProjects.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="file-tray-outline" size={48} color="#E5E7EB" />
              <Text style={styles.emptyText}>No drafts yet</Text>
              <Text style={styles.emptySub}>Scan a paper or create a manual exam.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredProjects}
              renderItem={renderProject}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
            />
          )}
        </View>
      </View>

      {selectionMode && selectedIds.size > 0 && (
        <View style={styles.floatingBar}>
          <Text style={styles.floatingBarText}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={handleBulkDelete} style={styles.floatingBarBtn}>
            <Ionicons name="trash" size={20} color="white" />
            <Text style={styles.floatingBarBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={contextMenuId !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setContextMenuId(null)} activeOpacity={1}>
          <View style={styles.contextMenu}>
            <TouchableOpacity 
              onPress={() => { 
                const project = projects.find(p => p.id === contextMenuId);
                if (project) handleOpenProject(project);
                setContextMenuId(null);
              }} 
              style={styles.contextMenuItem}
            >
              <Ionicons name="open-outline" size={20} color="#374151" />
              <Text style={styles.contextMenuText}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => contextMenuId && handleExportPdf(contextMenuId)} 
              style={styles.contextMenuItem}
            >
              <Ionicons name="download-outline" size={20} color="#2563EB" />
              <Text style={[styles.contextMenuText, {color: '#2563EB'}]}>Export PDF</Text>
            </TouchableOpacity>
            <View style={styles.contextMenuDivider} />
            <TouchableOpacity 
              onPress={() => { 
                if (contextMenuId) handleDelete(contextMenuId);
                setContextMenuId(null);
              }} 
              style={styles.contextMenuItem}
            >
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <Text style={[styles.contextMenuText, {color: '#DC2626'}]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {isExporting && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Generating PDF...</Text>
          </View>
        </View>
      )}

      <CustomAlert {...alertState} onClose={closeAlert} />
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
  fileCardSelected: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  checkbox: { marginRight: 12 },
  checkboxInner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  fileIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 2 },
  fileClass: { fontSize: 12, color: '#9CA3AF', marginBottom: 2 },
  fileDate: { fontSize: 11, color: '#6B7280' },
  moreBtn: { padding: 8 },
  selectBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 8 },
  selectBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  floatingBar: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: '#111', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: "#000", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  floatingBarText: { fontSize: 16, fontWeight: '700', color: 'white' },
  floatingBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#DC2626', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  floatingBarBtnText: { fontSize: 15, fontWeight: '700', color: 'white' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  contextMenu: { width: 220, backgroundColor: 'white', borderRadius: 16, padding: 8, shadowColor: "#000", shadowOpacity: 0.2, elevation: 10 },
  contextMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 8 },
  contextMenuText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  contextMenuDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  loadingBox: { backgroundColor: 'white', borderRadius: 16, padding: 24, alignItems: 'center', minWidth: 200 },
  loadingText: { marginTop: 12, fontSize: 16, fontWeight: '600', color: '#374151' },

  // --- Workspace Upgrades ---
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  heroCardMain: { flex: 1, backgroundColor: '#2563EB', borderRadius: 20, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: "#2563EB", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  heroTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 2 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  fabMain: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
  
  heroCardSecondary: { width: '28%', backgroundColor: 'white', borderRadius: 20, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: "#000", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  fabSecondary: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  heroTitleSecondary: { fontSize: 14, fontWeight: 'bold', color: '#4B5563' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: '#E5E7EB' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#111827' },
});