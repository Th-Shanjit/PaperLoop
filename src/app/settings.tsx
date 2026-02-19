import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getAppSettings, saveAppSettings, AppSettings, clearImageCache } from '../core/services/storage';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    getAppSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (settings) {
      await saveAppSettings(settings);
      Alert.alert("Saved", "Settings updated successfully.");
      router.back();
    }
  };

  const handleClearCache = async () => {
    Alert.alert("Clear Cache?", "This will delete temporary scan images and free up storage. Your saved exams will not be affected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear Now", style: "destructive", onPress: async () => {
          await clearImageCache();
          Alert.alert("Success", "Cache cleared successfully.");
      }}
    ]);
  };

  const handlePickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square logo
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0] && settings) {
        setSettings({ ...settings, organizationLogo: result.assets[0].uri });
      }
    } catch (e) {
      Alert.alert("Error", "Could not pick image.");
    }
  };

  const contactSupport = () => {
    // In the future, this will open WhatsApp
    Alert.alert("Pro Upgrade", "To upgrade to Pro and enable custom logos, please contact support via WhatsApp at +91 XXXXXXXXXX.");
  };

  if (!settings) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSave} style={styles.navBtn}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* BRANDING SECTION */}
        <Text style={styles.sectionTitle}>Organization Profile</Text>
        <View style={styles.card}>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={contactSupport} style={styles.logoCircle}>
              {settings.organizationLogo ? (
                <Image source={{uri: settings.organizationLogo}} style={styles.logoImage} />
              ) : (
                <Ionicons name="business" size={24} color="#9CA3AF" />
              )}
              <View style={styles.proBadge}><Text style={styles.proText}>PRO</Text></View>
            </TouchableOpacity>
            <View style={{flex: 1}}>
              <Text style={styles.label}>ACADEMY / SCHOOL NAME</Text>
              <TextInput 
                style={styles.input} 
                value={settings.organizationName} 
                onChangeText={(t) => setSettings({...settings, organizationName: t})}
                placeholder="e.g. Aakash Institute"
              />
            </View>
          </View>
        </View>

        {/* EXAM DEFAULTS */}
        <Text style={styles.sectionTitle}>Exam Defaults</Text>
        <View style={styles.card}>
          <Text style={styles.label}>DEFAULT DURATION</Text>
          <TextInput 
            style={styles.input} 
            value={settings.defaultDuration} 
            onChangeText={(t) => setSettings({...settings, defaultDuration: t})}
          />
          
          <Text style={[styles.label, {marginTop: 16}]}>DEFAULT INSTRUCTIONS</Text>
          <TextInput 
            style={[styles.input, {height: 80, textAlignVertical: 'top'}]} 
            multiline 
            value={settings.defaultInstructions} 
            onChangeText={(t) => setSettings({...settings, defaultInstructions: t})}
          />
        </View>

        {/* DATA & STORAGE */}
        <Text style={styles.sectionTitle}>Data & Storage</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
            <View style={styles.actionLeft}>
              <Ionicons name="trash-bin-outline" size={20} color="#DC2626" />
              <Text style={[styles.actionText, {color: '#DC2626'}]}>Clear Temporary Cache</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={contactSupport}>
            <View style={styles.actionLeft}>
              <Ionicons name="cloud-upload-outline" size={20} color="#2563EB" />
              <Text style={[styles.actionText, {color: '#2563EB'}]}>Sync to Google Drive</Text>
            </View>
            <View style={styles.proBadge}><Text style={styles.proText}>PRO</Text></View>
          </TouchableOpacity>
        </View>

        {/* SUPPORT */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={[styles.card, {marginBottom: 40}]}>
          <TouchableOpacity style={styles.actionRow} onPress={contactSupport}>
            <View style={styles.actionLeft}>
              <Ionicons name="star" size={20} color="#D97706" />
              <Text style={styles.actionText}>Upgrade to Pro</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={contactSupport}>
            <View style={styles.actionLeft}>
              <Ionicons name="logo-whatsapp" size={20} color="#16A34A" />
              <Text style={styles.actionText}>Contact Support</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  navBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  saveText: { fontSize: 16, fontWeight: '600', color: '#2563EB' },
  content: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, marginTop: 16 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 5, elevation: 1 },
  label: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, fontSize: 14, color: '#111', fontWeight: '500' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  logoImage: { width: 64, height: 64, borderRadius: 32 },
  proBadge: { position: 'absolute', bottom: -5, backgroundColor: '#111', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'white' },
  proText: { fontSize: 8, color: 'white', fontWeight: '800' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionText: { fontSize: 15, fontWeight: '500', color: '#374151' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 8 }
});