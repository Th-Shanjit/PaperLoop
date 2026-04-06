import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import { getAppSettings, saveAppSettings, AppSettings, clearImageCache, purchaseTokens } from '../core/services/storage';
import { purchaseScanPack, restorePurchases } from '../core/services/purchases';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const initialSettingsRef = useRef<string>('');

  useEffect(() => {
    const fetchSettings = async () => {
      const data = await getAppSettings();
      setSettings(data);
      initialSettingsRef.current = JSON.stringify({
        organizationName: data.organizationName,
        organizationLogo: data.organizationLogo,
        defaultDuration: data.defaultDuration,
        defaultInstructions: data.defaultInstructions,
        defaultFontTheme: data.defaultFontTheme,
      });
    };
    fetchSettings();
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    setSettings(updated);
    const comparable = JSON.stringify({
      organizationName: updated.organizationName,
      organizationLogo: updated.organizationLogo,
      defaultDuration: updated.defaultDuration,
      defaultInstructions: updated.defaultInstructions,
      defaultFontTheme: updated.defaultFontTheme,
    });
    setIsDirty(comparable !== initialSettingsRef.current);
  }, [settings]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isDirty) return;
      e.preventDefault();
      showAlert(
        "Unsaved Changes",
        "You have unsaved changes. What would you like to do?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
          {
            text: "Save",
            onPress: async () => {
              if (settings) {
                await saveAppSettings(settings);
              }
              navigation.dispatch(e.data.action);
            }
          }
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty, settings, showAlert]);

  const handleSave = async () => {
    if (settings) {
      await saveAppSettings(settings);
      setIsDirty(false);
      initialSettingsRef.current = JSON.stringify({
        organizationName: settings.organizationName,
        organizationLogo: settings.organizationLogo,
        defaultDuration: settings.defaultDuration,
        defaultInstructions: settings.defaultInstructions,
        defaultFontTheme: settings.defaultFontTheme,
      });
      showAlert("Saved", "Settings updated successfully.");
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
      showAlert("Expo Go Mode", `Mock payment successful. ${tokensToAdd} tokens added!`);
      return;
    }

    // 2. The Real Transaction
    try {
      const success = await purchaseScanPack(packId);
      if (success) {
        const data = await getAppSettings();
        setSettings(data);
        showAlert("Payment Successful!", `${tokensToAdd} Scans added to your account.`);
      } else {
        showAlert("Payment Failed", "Please try again later.");
      }
    } catch (e: any) {
      if (!e.userCancelled) showAlert("Payment Failed", e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    setIsProcessing(true);
    try {
      const success = await restorePurchases();
      if (success) {
        const data = await getAppSettings();
        setSettings(data);
        showAlert("Restored", "Your purchases have been successfully restored.");
      } else {
        showAlert("Restore Failed", "No previous purchases found to restore.");
      }
    } catch (e) {
      showAlert("Error", "Could not restore purchases at this time.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearCache = async () => {
    showAlert("Clear Cache?", "This will delete temporary scan images. Your saved exams will not be affected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear Now", style: "destructive", onPress: async () => {
          await clearImageCache();
          showAlert("Success", "Cache cleared successfully.");
      }}
    ]);
  };

  const contactSupport = () => {
    // THE FIX: Only raw digits. No plus signs, no spaces, no brackets.
    const phoneNumber = "916290739163"; 
    const message = "Hi PaperLoop Support, I need help with...";
    
    // This creates the deep link that forces the phone to open WhatsApp directly
    const url = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;

    Linking.canOpenURL(url)
      .then(supported => {
        if (!supported) {
          showAlert("WhatsApp Not Found", "Please install WhatsApp to contact support.");
        } else {
          return Linking.openURL(url);
        }
      })
      .catch(err => console.error('An error occurred', err));
  };

  const handleLogoUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Forces a square crop for a clean logo
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0] && settings) {
        // THE FIX: Move it to permanent storage
        const sourceUri = result.assets[0].uri;
        const filename = sourceUri.split('/').pop();
        if (!FileSystem.documentDirectory || !filename) {
          showAlert("Error", "Could not process the image.");
          return;
        }
        const permanentUri = FileSystem.documentDirectory + filename;
        
        await FileSystem.copyAsync({
          from: sourceUri,
          to: permanentUri
        });

        updateSettings({ organizationLogo: permanentUri });
      }
    } catch (error) {
      showAlert("Error", "Could not select the image.");
    }
  };

  if (!settings) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.label.normal} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & Settings</Text>
        <TouchableOpacity onPress={handleSave} style={styles.navBtn}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        
        {/* --- THE TOKEN BANK --- */}
        <Text style={styles.sectionTitle}>Your Balance</Text>
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>Available Scans</Text>
            <Text style={styles.balanceCount}>{settings.scanTokens || 0}</Text>
          </View>
          <View style={styles.iconRing}>
            <Ionicons name="sparkles" size={28} color={colors.primary.normal} />
          </View>
        </View>

        {/* --- THE STOREFRONT --- */}
        <Text style={styles.sectionTitle}>Buy More Scans</Text>
        <View style={styles.storeRow}>
          {/* THE UPDATED 10 SCANS BUTTON */}
          <TouchableOpacity 
            onPress={() => handlePurchase('10_scans_pack', 10)} 
            disabled={isProcessing}
            style={styles.storeBtn}
          >
            <Text style={styles.storeBtnTitle}>10 Scans</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', textDecorationLine: 'line-through', color: colors.label.assistive }}>₹149</Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: colors.label.normal }}>₹99</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => handlePurchase('50_scans', 50)} 
            disabled={isProcessing}
            style={[styles.storeBtn, styles.storeBtnPopular]}
          >
            <View style={styles.popularBadge}><Text style={styles.popularText}>BEST VALUE</Text></View>
            <Text style={[styles.storeBtnTitle, { color: colors.background.normal }]}>50 Scans</Text>
            
            {/* THE NEW ANCHOR PRICING LAYOUT */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.6)' }}>₹499</Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: colors.background.normal }}>₹399</Text>
            </View>
          </TouchableOpacity>
        </View>

        {isProcessing && <ActivityIndicator size="large" color={colors.primary.normal} style={{ marginTop: 10 }} />}

        {/* BRANDING SECTION */}
        <Text style={styles.sectionTitle}>Organization Profile</Text>
        <View style={styles.card}>
          <View style={styles.logoRow}>
            {/* THE NEW UPLOAD TRIGGER */}
            <TouchableOpacity onPress={handleLogoUpload} style={styles.logoCircle}>
              {settings.organizationLogo ? (
                <Image source={{uri: settings.organizationLogo}} style={styles.logoImage} />
              ) : (
                <Ionicons name="camera" size={24} color={colors.interaction.inactive} />
              )}
            </TouchableOpacity>
            
            <View style={{flex: 1}}>
              <Text style={styles.label}>ACADEMY / SCHOOL NAME</Text>
              <TextInput 
                style={styles.input} 
                value={settings.organizationName} 
                onChangeText={(t) => updateSettings({ organizationName: t })}
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
            onChangeText={(t) => updateSettings({ defaultDuration: t })}
          />
          
          <Text style={[styles.label, {marginTop: 16}]}>DEFAULT INSTRUCTIONS</Text>
          <TextInput 
            style={[styles.input, {height: 80, textAlignVertical: 'top'}]} 
            multiline 
            value={settings.defaultInstructions} 
            onChangeText={(t) => updateSettings({ defaultInstructions: t })}
          />
        </View>

        {/* HELP & TOURS */}
        <Text style={styles.sectionTitle}>Help & Tours</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={async () => {
            if (!settings) return;
            await saveAppSettings({ ...settings, hasSeenOnboarding: false });
            showAlert("Done", "The app walkthrough will show next time you open the app.");
          }}>
            <View style={styles.actionLeft}>
              <Ionicons name="play-circle-outline" size={20} color={colors.primary.normal} />
              <Text style={styles.actionText}>Replay App Walkthrough</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.interaction.inactive} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={async () => {
            if (!settings) return;
            await saveAppSettings({ ...settings, hasSeenEditorTour: false });
            showAlert("Done", "Open any exam in the editor and the feature tour will start automatically.");
          }}>
            <View style={styles.actionLeft}>
              <Ionicons name="compass-outline" size={20} color={colors.primary.normal} />
              <Text style={styles.actionText}>Replay Editor Feature Tour</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.interaction.inactive} />
          </TouchableOpacity>
        </View>

        {/* DATA & STORAGE */}
        <Text style={styles.sectionTitle}>System</Text>
        <View style={[styles.card, {marginBottom: 40}]}>

          <TouchableOpacity style={styles.actionRow} onPress={handleRestore}>
            <View style={styles.actionLeft}>
              <Ionicons name="refresh-circle-outline" size={20} color={colors.label.alternative} />
              <Text style={styles.actionText}>Restore Purchases</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.interaction.inactive} />
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
            <View style={styles.actionLeft}>
              <Ionicons name="trash-bin-outline" size={20} color={colors.status.negative} />
              <Text style={[styles.actionText, {color: colors.status.negative}]}>Clear Temporary Cache</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.interaction.inactive} />
          </TouchableOpacity>
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.actionRow} onPress={contactSupport}>
            <View style={styles.actionLeft}>
              <Ionicons name="logo-whatsapp" size={20} color={colors.status.positive} />
              <Text style={styles.actionText}>Contact Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.interaction.inactive} />
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.actionRow} onPress={() => Linking.openURL('https://www.shanjitthokchom.xyz/docs/paperloopprivacy')}>
            <View style={styles.actionLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.label.alternative} />
              <Text style={styles.actionText}>Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.interaction.inactive} />
          </TouchableOpacity>
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.actionRow} onPress={() => Linking.openURL('https://www.shanjitthokchom.xyz/docs/termspaperloop')}>
            <View style={styles.actionLeft}>
              <Ionicons name="document-text-outline" size={20} color={colors.label.alternative} />
              <Text style={styles.actionText}>Terms of Service</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.interaction.inactive} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      <CustomAlert {...alertState} onClose={closeAlert} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.alternative },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.background.normal, borderBottomWidth: 1, borderColor: colors.line.normal },
  navBtn: { padding: spacing.xs },
  headerTitle: { ...typography.heading3, color: colors.label.normal },
  saveText: { ...typography.button, color: colors.primary.normal },
  content: { flex: 1, padding: spacing.xl },
  sectionTitle: { ...typography.label, color: colors.label.alternative, marginBottom: spacing.sm, marginLeft: spacing.xs, marginTop: spacing.lg },
  
  balanceCard: { backgroundColor: colors.accent.blue.bg, borderRadius: radii.lg, padding: spacing.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.accent.blue.bgStrong, ...shadows.small },
  balanceLabel: { ...typography.label, color: colors.primary.strong },
  balanceCount: { ...typography.heading1, fontSize: 40, color: colors.primary.normal },
  iconRing: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent.blue.bgStrong, justifyContent: 'center', alignItems: 'center' },
  
  storeRow: { flexDirection: 'row', gap: spacing.md },
  storeBtn: { flex: 1, backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.line.normal, ...shadows.small },
  storeBtnPopular: { backgroundColor: colors.primary.normal, borderColor: colors.primary.normal },
  storeBtnTitle: { ...typography.heading3, color: colors.label.normal, marginBottom: 4 },
  priceContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storeBtnPrice: { fontSize: 14, fontWeight: '600', color: colors.label.alternative },
  storeBtnPriceStrikethrough: { fontSize: 12, fontWeight: '500', textDecorationLine: 'line-through', color: colors.label.alternative },
  popularBadge: { position: 'absolute', top: -10, backgroundColor: colors.status.cautionary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.sm, borderWidth: 2, borderColor: colors.background.alternative },
  popularText: { fontSize: 10, fontWeight: '900', color: colors.background.normal },

  card: { backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.lg, ...shadows.small },
  label: { ...typography.label, color: colors.label.assistive, marginBottom: 6 },
  input: { backgroundColor: colors.fill.alternative, borderWidth: 1, borderColor: colors.line.normal, borderRadius: radii.sm, padding: spacing.md, ...typography.body, color: colors.label.normal },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.fill.normal, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.line.normal, borderStyle: 'dashed' },
  logoImage: { width: 64, height: 64, borderRadius: 32 },
  proBadge: { position: 'absolute', bottom: -5, backgroundColor: colors.label.normal, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.background.normal },
  proText: { fontSize: 8, color: colors.background.normal, fontWeight: '800' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionText: { ...typography.body, color: colors.label.alternative },
  divider: { height: 1, backgroundColor: colors.line.alternative, marginVertical: spacing.xs }
});