import React, { useState, useCallback } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, StatusBar, FlatList, Alert, RefreshControl, Modal, ActivityIndicator, TextInput 
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import { loadProjects, deleteProject, ExamProject, getProject, getAppSettings, saveAppSettings } from '../core/services/storage';
import { generateExamHtml } from '../core/services/pdf';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import OnboardingModal from '../components/OnboardingModal';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
  const [projects, setProjects] = useState<ExamProject[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // NEW: Search state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

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

  // Dedicated onboarding check — runs once on mount, independent of project loading
  React.useEffect(() => {
    getAppSettings().then(settings => {
      if (!settings.hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    });
  }, []);

  const loadData = async () => {
    setRefreshing(true);
    const data = await loadProjects();
    setProjects(data);
    setRefreshing(false);
    setIsInitialLoad(false);
  };

  const finishOnboarding = async () => {
    const settings = await getAppSettings();
    await saveAppSettings({ ...settings, hasSeenOnboarding: true });
    setShowOnboarding(false);
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
      
      const cleanTitle = (project.header.title || 'Exam').trim().replace(/[^a-z0-9 \-]/gi, '');
      const cleanSubject = (project.header.className || 'Subject').trim().replace(/[^a-z0-9 \-]/gi, '');
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `${cleanSubject} - ${cleanTitle} - ${dateStr}.pdf`;

      // --- THE ANDROID PDF FIX ---
      if (Platform.OS === 'android') {
        try {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const createdUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, 'application/pdf');
            await FileSystem.writeAsStringAsync(createdUri, base64, { encoding: FileSystem.EncodingType.Base64 });
            
            showAlert("Success", "PDF saved successfully!");
            setIsExporting(false);
            return;
          }
        } catch (e) {
          console.warn("SAF Error:", e);
        }
      }

      // iOS Fallback (or if Android user canceled the folder selection)
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
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
    const initial = (item.title || 'U').charAt(0).toUpperCase();

    return (
      <TouchableOpacity 
        onPress={() => selectionMode ? toggleSelection(item.id) : handleOpenProject(item)} 
        style={[styles.fileCard, isSelected && styles.fileCardSelected]} 
        activeOpacity={0.7}
      >
        {selectionMode && (
          <View style={styles.checkbox}>
            <View style={[styles.checkboxInner, isSelected && styles.checkboxChecked]}>
              {isSelected && <Ionicons name="checkmark" size={16} color={colors.static.white} />}
            </View>
          </View>
        )}
        <View style={styles.fileIcon}>
          <Text style={styles.fileIconText}>{initial}</Text>
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.title || "Untitled Exam"}</Text>
          {item.header?.className && (
            <Text style={styles.fileClass} numberOfLines={1}>{item.header.className}</Text>
          )}
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4}}>
            <Text style={styles.fileDate}>
              {new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
              {' \u2022 '} {qCount} Qs
            </Text>
            <View style={{backgroundColor: colors.fill.normal, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm}}>
              <Text style={{fontSize: 10, fontWeight: '800', color: colors.label.alternative, letterSpacing: 0.5}}>DRAFT</Text>
            </View>
          </View>
        </View>
        {!selectionMode && (
          <TouchableOpacity onPress={() => setContextMenuId(item.id)} style={styles.moreBtn} accessibilityLabel="More options">
            <Ionicons name="ellipsis-vertical" size={22} color={colors.label.alternative} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background.alternative} />
      
      <View style={styles.header}>
        <View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <Text style={styles.greeting}>PaperLoop</Text>
            <View style={styles.betaPill}>
              <Text style={styles.betaText}>BETA</Text>
            </View>
          </View>
          <Text style={styles.subGreeting}>Digitize & Grade Exams</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={22} color={colors.label.normal} />
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
              <Ionicons name="camera" size={24} color={colors.primary.normal} />
            </View>
          </TouchableOpacity>

          {/* Blank Exam Button */}
          <TouchableOpacity onPress={() => router.push("/editor")} style={styles.heroCardSecondary} activeOpacity={0.8}>
            <View style={styles.fabSecondary}>
              <Ionicons name="document-text" size={24} color={colors.label.alternative} />
            </View>
            <Text style={styles.heroTitleSecondary}>Blank</Text>
          </TouchableOpacity>
        </View>

        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.label.assistive} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search exams or subjects..."
            placeholderTextColor={colors.label.assistive}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.label.assistive} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.sectionContainer, { flex: 1 }]}>
        <View style={styles.listCard}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
            <Text style={styles.sectionTitle}>Your Drafts</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: spacing.md}}>
              <TouchableOpacity onPress={() => router.push('/history')} accessibilityLabel="View all exams">
                <Text style={styles.historyLink}>All Exams</Text>
              </TouchableOpacity>
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
          </View>
          
          {isInitialLoad ? (
            <View style={styles.skeletonContainer}>
              {[0, 1, 2].map(i => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={styles.skeletonCircle} />
                  <View style={styles.skeletonLines}>
                    <View style={[styles.skeletonBar, { width: '60%' }]} />
                    <View style={[styles.skeletonBar, styles.skeletonBarShort]} />
                  </View>
                </View>
              ))}
            </View>
          ) : filteredProjects.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="file-tray-outline" size={48} color={colors.line.normal} />
              <Text style={styles.emptyText}>No drafts yet</Text>
              <Text style={styles.emptySub}>Scan a paper or create a manual exam.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredProjects}
              renderItem={renderProject}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
            />
          )}
        </View>
      </View>

      {selectionMode && selectedIds.size > 0 && (
        <View style={[styles.floatingBar, { bottom: insets.bottom + 20 }]}>
          <Text style={styles.floatingBarText}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={handleBulkDelete} style={styles.floatingBarBtn}>
            <Ionicons name="trash" size={20} color={colors.static.white} />
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
              <Ionicons name="open-outline" size={20} color={colors.label.alternative} />
              <Text style={styles.contextMenuText}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => contextMenuId && handleExportPdf(contextMenuId)} 
              style={styles.contextMenuItem}
            >
              <Ionicons name="download-outline" size={20} color={colors.primary.normal} />
              <Text style={[styles.contextMenuText, {color: colors.primary.normal}]}>Export PDF</Text>
            </TouchableOpacity>
            <View style={styles.contextMenuDivider} />
            <TouchableOpacity 
              onPress={() => { 
                if (contextMenuId) handleDelete(contextMenuId);
                setContextMenuId(null);
              }} 
              style={styles.contextMenuItem}
            >
              <Ionicons name="trash-outline" size={20} color={colors.status.negative} />
              <Text style={[styles.contextMenuText, {color: colors.status.negative}]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {isExporting && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary.normal} />
            <Text style={styles.loadingText}>Generating PDF...</Text>
          </View>
        </View>
      )}

      <CustomAlert {...alertState} onClose={closeAlert} />
      <OnboardingModal visible={showOnboarding} onFinish={finishOnboarding} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.alternative },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.lg, marginBottom: spacing.sm },
  greeting: { ...typography.heading1, color: colors.label.normal },
  subGreeting: { ...typography.bodySmall, color: colors.label.alternative, marginTop: 2 },
  betaPill: { backgroundColor: colors.accent.blue.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm },
  betaText: { color: colors.accent.blue.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  settingsBtn: { padding: 10, backgroundColor: colors.background.normal, borderRadius: radii.full, ...shadows.small },
  sectionContainer: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },

  listCard: { flex: 1, backgroundColor: colors.background.normal, borderRadius: radii.xxl, padding: spacing.xl, ...shadows.small },
  sectionTitle: { ...typography.heading3, color: colors.label.normal },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  emptyText: { ...typography.heading3, color: colors.label.alternative, marginTop: spacing.lg },
  emptySub: { ...typography.bodySmall, color: colors.label.assistive, marginTop: spacing.sm },
  skeletonContainer: { paddingTop: spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, marginBottom: spacing.md },
  skeletonCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fill.normal, marginRight: spacing.lg },
  skeletonLines: { flex: 1, gap: spacing.sm },
  skeletonBar: { height: 12, borderRadius: 6, backgroundColor: colors.fill.normal },
  skeletonBarShort: { width: '40%' },
  fileCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background.normal, borderRadius: radii.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line.alternative },
  fileCardSelected: { backgroundColor: colors.accent.blue.bg, borderColor: colors.accent.blue.bgStrong },
  checkbox: { marginRight: spacing.md },
  checkboxInner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line.normal, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: colors.primary.normal, borderColor: colors.primary.normal },
  fileIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary.normal, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  fileIconText: { color: colors.static.white, fontSize: 18, fontWeight: '800' },
  fileInfo: { flex: 1 },
  fileName: { ...typography.body, fontWeight: '600', color: colors.label.normal, marginBottom: 2 },
  fileClass: { ...typography.caption, color: colors.label.assistive, marginBottom: 2 },
  fileDate: { fontSize: 11, color: colors.label.alternative },
  moreBtn: { padding: spacing.sm },
  selectBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.fill.normal, borderRadius: radii.sm },
  selectBtnText: { ...typography.buttonSmall, color: colors.label.alternative },
  historyLink: { ...typography.buttonSmall, color: colors.primary.normal },
  floatingBar: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: colors.inverse.background, borderRadius: radii.lg, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...shadows.large },
  floatingBarText: { ...typography.heading4, color: colors.static.white },
  floatingBarBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.status.negative, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radii.md },
  floatingBarBtnText: { ...typography.button, color: colors.static.white },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  contextMenu: { width: 240, backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.sm, ...shadows.medium },
  contextMenuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14, borderRadius: radii.sm },
  contextMenuText: { ...typography.body, fontWeight: '600', color: colors.label.alternative },
  contextMenuDivider: { height: 1, backgroundColor: colors.line.alternative, marginVertical: 4 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  loadingBox: { backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.xxl, alignItems: 'center', minWidth: 200, ...shadows.medium },
  loadingText: { marginTop: spacing.md, ...typography.body, fontWeight: '600', color: colors.label.alternative },

  actionRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  heroCardMain: { flex: 1, backgroundColor: colors.primary.normal, borderRadius: radii.xl, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 100, shadowColor: colors.primary.heavy, shadowOpacity: 0.25, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.static.white, marginBottom: 2 },
  heroSub: { ...typography.bodySmall, color: 'rgba(255,255,255,0.8)' },
  fabMain: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  
  heroCardSecondary: { width: '28%', backgroundColor: colors.background.normal, borderRadius: radii.xl, padding: spacing.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line.normal, ...shadows.small },
  fabSecondary: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fill.normal, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm },
  heroTitleSecondary: { ...typography.buttonSmall, color: colors.label.alternative },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.fill.normal, borderRadius: radii.full, paddingHorizontal: spacing.lg, height: 44 },
  searchInput: { flex: 1, marginLeft: spacing.sm, fontSize: 15, color: colors.label.normal },
});