import React, { useState, useCallback } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, 
  RefreshControl, Modal, TextInput 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { loadProjects, deleteProject, renameProject, ExamProject } from '../core/services/storage';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

export default function HistoryScreen() {
  const router = useRouter();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
  const [projects, setProjects] = useState<ExamProject[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  const [renameId, setRenameId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const loadData = async () => {
    setRefreshing(true);
    const data = await loadProjects();
    setProjects(data);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const getQuestionCount = (item: ExamProject): number => {
    return (item.sections || []).reduce((t, s) => t + (s.questions?.length || 0), 0)
      || (item.questions?.length || 0);
  };

  const handleOpen = (project: ExamProject) => {
    router.push({
      pathname: "/editor",
      params: { projectId: project.id }
    });
  };

  const handleDelete = (id: string) => {
    showAlert("Delete Exam?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          await deleteProject(id);
          loadData();
      }}
    ]);
  };

  const initRename = (project: ExamProject) => {
    setRenameId(project.id);
    setNewTitle(project.title || project.header.title);
  };

  const confirmRename = async () => {
    if (renameId && newTitle.trim()) {
      await renameProject(renameId, newTitle.trim());
      setRenameId(null);
      loadData();
    }
  };

  const renderItem = ({ item }: { item: ExamProject }) => (
    <TouchableOpacity onPress={() => handleOpen(item)} style={styles.card} activeOpacity={0.7}>
      <View style={styles.iconBox}>
        <Ionicons name="document-text" size={24} color={colors.primary.normal} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || "Untitled Exam"}
        </Text>
        <Text style={styles.sub}>
          {new Date(item.updatedAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
           {' • '}{getQuestionCount(item)} Questions
        </Text>
      </View>
      
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => initRename(item)} style={styles.actionBtn} accessibilityLabel="Rename exam">
          <Ionicons name="pencil" size={20} color={colors.label.alternative} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn} accessibilityLabel="Delete exam">
          <Ionicons name="trash-outline" size={20} color={colors.status.negative} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background.alternative} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.label.normal} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Exams</Text>
        <View style={{width:40}} />
      </View>

      <FlatList
        data={projects}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.primary.normal} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={64} color={colors.line.normal} />
            <Text style={styles.emptyText}>No saved exams</Text>
            <Text style={styles.emptySub}>Scanned exams will appear here</Text>
          </View>
        }
      />

      {/* RENAME MODAL */}
      <Modal visible={renameId !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Exam</Text>
            <TextInput 
              style={styles.modalInput} 
              value={newTitle} 
              onChangeText={setNewTitle} 
              autoFocus 
              selectTextOnFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRenameId(null)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRename} style={[styles.modalBtn, {backgroundColor: colors.primary.normal}]}>
                <Text style={[styles.modalBtnText, {color: colors.background.normal}]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert {...alertState} onClose={closeAlert} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.alternative },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background.normal, borderBottomWidth: 1, borderColor: colors.line.normal },
  backBtn: { padding: spacing.sm },
  headerTitle: { ...typography.heading3, color: colors.label.normal },
  list: { padding: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.normal, padding: spacing.lg, borderRadius: radii.lg, marginBottom: spacing.md, ...shadows.small },
  iconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent.blue.bg, justifyContent: 'center', alignItems: 'center', marginRight: spacing.lg },
  info: { flex: 1 },
  title: { ...typography.heading4, color: colors.label.normal, marginBottom: spacing.xs },
  sub: { ...typography.bodySmall, color: colors.label.alternative },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { padding: spacing.sm },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { ...typography.heading3, color: colors.label.assistive, marginTop: spacing.lg },
  emptySub: { ...typography.body, color: colors.label.disable, marginTop: spacing.sm },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  modalContent: { backgroundColor: colors.background.normal, borderRadius: radii.xl, padding: spacing.xl },
  modalTitle: { ...typography.heading3, color: colors.label.normal, marginBottom: spacing.lg },
  modalInput: { backgroundColor: colors.background.alternative, padding: spacing.md, borderRadius: radii.sm, ...typography.body, color: colors.label.normal, marginBottom: spacing.xl },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  modalBtn: { paddingVertical: 10, paddingHorizontal: spacing.xl, borderRadius: radii.sm, backgroundColor: colors.line.normal },
  modalBtnText: { ...typography.buttonSmall, color: colors.label.alternative }
});
