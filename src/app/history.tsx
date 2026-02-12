import React, { useState, useCallback } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, StatusBar, 
  RefreshControl, Modal, TextInput 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { loadProjects, deleteProject, renameProject, ExamProject } from '../core/services/storage';

export default function HistoryScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ExamProject[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Rename State
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

  const handleOpen = (project: ExamProject) => {
    router.push({
      pathname: "/editor",
      params: { projectId: project.id }
    });
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Exam?", "This action cannot be undone.", [
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
      loadData(); // Refresh list to show new name
    }
  };

  const renderItem = ({ item }: { item: ExamProject }) => (
    <TouchableOpacity onPress={() => handleOpen(item)} style={styles.card} activeOpacity={0.7}>
      <View style={styles.iconBox}>
        <Ionicons name="document-text" size={24} color="#2563EB" />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || "Untitled Exam"}
        </Text>
        <Text style={styles.sub}>
          {/* Fix: Correct Date Formatting */}
          {new Date(item.updatedAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
           {' • '}{item.questions.length} Questions
        </Text>
      </View>
      
      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => initRename(item)} style={styles.actionBtn}>
          <Ionicons name="pencil" size={20} color="#64748B" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Exams</Text>
        <View style={{width:40}} />
      </View>

      <FlatList
        data={projects}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={64} color="#CBD5E1" />
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
              <TouchableOpacity onPress={confirmRename} style={[styles.modalBtn, {backgroundColor:'#2563EB'}]}>
                <Text style={[styles.modalBtnText, {color:'white'}]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  list: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.05, elevation: 1 },
  iconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  sub: { fontSize: 12, color: '#64748B' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8 },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#94A3B8', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#CBD5E1', marginTop: 8 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  modalInput: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#E5E7EB' },
  modalBtnText: { fontWeight: '600', color: '#374151' }
});