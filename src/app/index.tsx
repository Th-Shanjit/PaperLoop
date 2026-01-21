import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearSession } from '../core/store/session';

export default function HomeScreen() {
  const router = useRouter();

  const handleNewExam = () => {
    clearSession();
    // Start fresh -> Camera -> Workspace
    router.push("/camera");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2563EB" />
      
      {/* BLUE HEADER (HQ Style) */}
      <View style={styles.header}>
        <SafeAreaView edges={['top', 'left', 'right']}>
          
          {/* Top Row: Brand + Settings */}
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.welcomeSub}>DASHBOARD</Text>
              <Text style={styles.welcomeTitle}>PaperLoop</Text>
            </View>
            
            {/* Settings Button (Placeholder for future) */}
            <TouchableOpacity style={styles.settingsBtn}>
              <Ionicons name="settings-outline" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Replaced "Stats" with a Cleaner Message or Search Bar placeholder */}
          <View style={styles.headerMessage}>
             <Ionicons name="sparkles" size={16} color="#93C5FD" style={{marginRight: 6}} />
             <Text style={styles.headerMessageText}>Ready to grade assignments?</Text>
          </View>

        </SafeAreaView>
      </View>

      {/* BODY */}
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* PRIMARY ACTION (Hero) */}
        <Text style={styles.sectionTitle}>Start</Text>
        <TouchableOpacity onPress={handleNewExam} style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <View style={styles.heroIconCircle}>
              <Ionicons name="camera" size={32} color="white" />
            </View>
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>New Scan</Text>
            <Text style={styles.heroSub}>Digitize & Analyze Papers</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color="#2563EB" />
        </TouchableOpacity>

        {/* SECONDARY ACTIONS */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCard}>
            <Ionicons name="folder-open-outline" size={24} color="#4B5563" />
            <Text style={styles.actionTitle}>History</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionCard}>
            <Ionicons name="school-outline" size={24} color="#4B5563" />
            <Text style={styles.actionTitle}>Grading</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionCard}>
            <Ionicons name="people-outline" size={24} color="#4B5563" />
            <Text style={styles.actionTitle}>Students</Text>
          </TouchableOpacity>
        </View>

        {/* RECENT FILES (Filesystem View) */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>Recent Files</Text>
          <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
        </View>

        {/* Placeholder Item 1 */}
        <TouchableOpacity style={styles.fileItem}>
          <View style={[styles.fileIcon, { backgroundColor: '#DBEAFE' }]}>
            <Text style={{color: '#2563EB', fontWeight: 'bold'}}>M</Text>
          </View>
          <View style={styles.fileInfo}>
            <Text style={styles.fileTitle}>Math Final_v2.pdf</Text>
            <Text style={styles.fileSub}>Edited 2h ago</Text>
          </View>
          <Ionicons name="ellipsis-vertical" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Placeholder Item 2 */}
        <TouchableOpacity style={styles.fileItem}>
          <View style={[styles.fileIcon, { backgroundColor: '#F3E8FF' }]}>
            <Text style={{color: '#9333EA', fontWeight: 'bold'}}>S</Text>
          </View>
          <View style={styles.fileInfo}>
            <Text style={styles.fileTitle}>Science Lab 4.pdf</Text>
            <Text style={styles.fileSub}>Edited Yesterday</Text>
          </View>
          <Ionicons name="ellipsis-vertical" size={20} color="#9CA3AF" />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  
  // HEADER
  header: { 
    backgroundColor: '#2563EB', 
    paddingHorizontal: 24, 
    paddingBottom: 40, 
    borderBottomLeftRadius: 32, 
    borderBottomRightRadius: 32 
  },
  headerTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginTop: 10, 
    marginBottom: 20 
  },
  welcomeSub: { color: '#93C5FD', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  welcomeTitle: { color: 'white', fontSize: 32, fontWeight: '800' },
  settingsBtn: { 
    padding: 8, 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderRadius: 12 
  },
  headerMessage: { flexDirection: 'row', alignItems: 'center', opacity: 0.8 },
  headerMessageText: { color: '#DBEAFE', fontSize: 14 },

  // BODY
  body: { padding: 24, marginTop: -20 }, // Pull up to overlap header slightly if desired, or keep flat
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },

  // HERO CARD
  heroCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'white', 
    padding: 20, 
    borderRadius: 24, 
    marginBottom: 30,
    elevation: 4,
    shadowColor: '#2563EB', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
  },
  heroLeft: { marginRight: 16 },
  heroIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  heroContent: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  heroSub: { fontSize: 14, color: '#6B7280' },

  // SECONDARY ACTIONS
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, gap: 12 },
  actionCard: { 
    flex: 1, 
    backgroundColor: 'white', 
    paddingVertical: 16, 
    alignItems: 'center', 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#E5E7EB' 
  },
  actionTitle: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 8 },

  // FILE LIST
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  seeAll: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
  
  fileItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'white', 
    padding: 16, 
    borderRadius: 16, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  fileIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  fileInfo: { flex: 1 },
  fileTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  fileSub: { fontSize: 12, color: '#9CA3AF' },
});