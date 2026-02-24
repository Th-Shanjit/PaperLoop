import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import { getAppSettings, saveAppSettings, AppSettings, clearImageCache, purchaseTokens } from '../core/services/storage';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // We refresh this every time the screen loads so the token count is accurate
    const fetchSettings = async () => {
      const data = await getAppSettings();
      setSettings(data);
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (settings) {
      await saveAppSettings(settings);
      Alert.alert("Saved", "Settings updated successfully.");
      router.back();
    }
  };

  // --- THE NEW REVENUECAT STOREFRONT LOGIC ---
  const handlePurchase = async (packId: string, tokensToAdd: number) => {
    if (!settings) return;
    setIsProcessing(true);

    // 1. The Expo Go Bypass
    if (Constants.appOwnership === 'expo') {
      await purchaseTokens(tokensToAdd);
      setSettings({ ...settings, scanTokens: (settings.scanTokens || 0) + tokensToAdd });
      setIsProcessing(false);
      Alert.alert("Expo Go Mode", `Mock payment successful. ${tokensToAdd} tokens added!`);
      return;
    }

    // 2. The Real Transaction
    try {
      const offerings = await Purchases.getOfferings();
      const packageToBuy = offerings.current?.availablePackages.find(p => p.identifier === packId);
      
      if (packageToBuy) {
        await Purchases.purchasePackage(packageToBuy);
        await purchaseTokens(tokensToAdd);
        setSettings({ ...settings, scanTokens: (settings.scanTokens || 0) + tokensToAdd });
        Alert.alert("Payment Successful!", `${tokensToAdd} Scans added to your account.`);
      } else {
        Alert.alert("Store Error", "Product not configured correctly.");
      }
    } catch (e: any) {
      if (!e.userCancelled) Alert.alert("Payment Failed", e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearCache = async () => {
    Alert.alert("Clear Cache?", "This will delete temporary scan images. Your saved exams will not be affected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear Now", style: "destructive", onPress: async () => {
          await clearImageCache();
          Alert.alert("Success", "Cache cleared successfully.");
      }}
    ]);
  };

  const contactSupport = () => {
    // Replace with your actual number and country code (e.g., 919876543210 for India)
    const phoneNumber = "+91 6290739163"; 
    const message = "Hi PaperLoop Support, I need help with...";
    
    // This creates the deep link that forces the phone to open WhatsApp directly
    const url = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;

    Linking.canOpenURL(url)
      .then(supported => {
        if (!supported) {
          Alert.alert("WhatsApp Not Found", "Please install WhatsApp to contact support, or email us directly.");
        } else {
          return Linking.openURL(url);
        }
      })
      .catch(err => console.error('An error occurred', err));
  };

  if (!settings) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & Settings</Text>
        <TouchableOpacity onPress={handleSave} style={styles.navBtn}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* --- THE TOKEN BANK --- */}
        <Text style={styles.sectionTitle}>Your Balance</Text>
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>Available Scans</Text>
            <Text style={styles.balanceCount}>{settings.scanTokens || 0}</Text>
          </View>
          <View style={styles.iconRing}>
            <Ionicons name="sparkles" size={28} color="#F59E0B" />
          </View>
        </View>

        {/* --- THE STOREFRONT --- */}
        <Text style={styles.sectionTitle}>Buy More Scans</Text>
        <View style={styles.storeRow}>
          <TouchableOpacity 
            onPress={() => handlePurchase('10_scans', 10)} 
            disabled={isProcessing}
            style={styles.storeBtn}
          >
            <Text style={styles.storeBtnTitle}>10 Scans</Text>
            <Text style={styles.storeBtnPrice}>₹99</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => handlePurchase('50_scans', 50)} 
            disabled={isProcessing}
            style={[styles.storeBtn, styles.storeBtnPopular]}
          >
            <View style={styles.popularBadge}><Text style={styles.popularText}>BEST VALUE</Text></View>
            <Text style={[styles.storeBtnTitle, {color:'white'}]}>50 Scans</Text>
            <View style={styles.priceContainer}>
              <Text style={[styles.storeBtnPriceStrikethrough, {color:'rgba(255,255,255,0.5)'}]}>₹499</Text>
              <Text style={[styles.storeBtnPrice, {color:'rgba(255,255,255,0.8)'}]}>₹399</Text>
            </View>
          </TouchableOpacity>
        </View>

        {isProcessing && <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 10 }} />}

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
        <Text style={styles.sectionTitle}>System</Text>
        <View style={[styles.card, {marginBottom: 40}]}>
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
              <Ionicons name="logo-whatsapp" size={20} color="#16A34A" />
              <Text style={styles.actionText}>Contact Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
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
  
  // Store UI
  balanceCard: { backgroundColor: '#FFFBEB', borderRadius: 16, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#FEF3C7', shadowColor: "#F59E0B", shadowOpacity: 0.1, elevation: 2 },
  balanceLabel: { fontSize: 13, fontWeight: '700', color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceCount: { fontSize: 40, fontWeight: '900', color: '#92400E' },
  iconRing: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  
  storeRow: { flexDirection: 'row', gap: 12 },
  storeBtn: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: "#000", shadowOpacity: 0.05, elevation: 2 },
  storeBtnPopular: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  storeBtnTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 4 },
  priceContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storeBtnPrice: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  storeBtnPriceStrikethrough: { fontSize: 12, fontWeight: '500', textDecorationLine: 'line-through', color: '#6B7280' },
  popularBadge: { position: 'absolute', top: -10, backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 2, borderColor: '#F3F4F6' },
  popularText: { fontSize: 10, fontWeight: '900', color: 'white' },

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