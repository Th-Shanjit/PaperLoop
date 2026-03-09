import Purchases, { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { Platform, Alert } from 'react-native';
import { purchaseTokens, getAppSettings, saveAppSettings } from './storage';
import Constants from 'expo-constants';

const API_KEYS = {
  apple: "appl_YOUR_APPLE_KEY_HERE", // Replace when you deploy to iOS
  google: "test_KPNPqclgWpQjiqVJRTbNvnkiUqF"
};

export const configurePurchases = () => {
  if (Constants.appOwnership === 'expo') {
    console.log("Running in Expo Go: Bypassing RevenueCat native setup.");
    return;
  }
  
  if (Platform.OS === 'ios') {
    Purchases.configure({ apiKey: API_KEYS.apple });
  } else if (Platform.OS === 'android') {
    Purchases.configure({ apiKey: API_KEYS.google });
  }
};

/**
 * Entitlement checking for scan_tokens
 */
export const checkScanEntitlement = async (): Promise<boolean> => {
  if (Constants.appOwnership === 'expo') return true;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active['scan_tokens'] !== undefined;
  } catch (e) {
    console.error("Failed to check scan tokens entitlement", e);
    return false;
  }
};

/**
 * Fetch the current offerings (packs)
 */
export const getScanPacks = async (): Promise<PurchasesOffering | null> => {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (e) {
    console.error("Failed to fetch offerings", e);
    return null;
  }
};

/**
 * Handle package purchase
 */
export const purchaseScanPack = async (packageIdentifier: string): Promise<boolean> => {
  try {
    const offerings = await Purchases.getOfferings();
    const pack = offerings.current?.availablePackages.find(p => p.identifier === packageIdentifier);
    
    if (pack) {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      
      // Update local scan tokens based on pack identifier
      if (packageIdentifier === '10_scans_pack') {
        await purchaseTokens(10);
      } else if (packageIdentifier === '50_scans') {
        await purchaseTokens(50);
      }
      
      return true;
    }
    return false;
  } catch (e: any) {
    if (!e.userCancelled) {
      console.error("Purchase failed", e);
    }
    return false;
  }
};

/**
 * Restore purchases and sync with local state
 */
export const restorePurchases = async (): Promise<boolean> => {
  if (Constants.appOwnership === 'expo') return true;

  try {
    const customerInfo = await Purchases.restorePurchases();
    
    const settings = await getAppSettings();
    if (customerInfo.entitlements.active['pro'] || customerInfo.entitlements.active['scan_tokens']) {
      // Sync entitlements to local state
      settings.isPro = customerInfo.entitlements.active['pro'] !== undefined;
      await saveAppSettings(settings);
      return true;
    }
    return false;
  } catch (e) {
    console.error("Failed to restore purchases", e);
    return false;
  }
};

/**
 * Present the RevenueCat Paywall UI
 */
export const presentPaywall = async () => {
  if (Constants.appOwnership === 'expo') {
    Alert.alert("Expo Go Mode", "Paywall is mocked in Expo Go.");
    return;
  }
  
  try {
    const result = await RevenueCatUI.presentPaywall();
    console.log("Paywall result:", result);
  } catch (e) {
    console.error("Failed to present paywall", e);
  }
};

/**
 * Present the Customer Center for subscription management
 */
export const presentCustomerCenter = async () => {
  if (Constants.appOwnership === 'expo') {
    Alert.alert("Expo Go Mode", "Customer Center is mocked in Expo Go.");
    return;
  }
  
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.error("Failed to present customer center", e);
  }
};

/**
 * Handle customer info and synchronize local scan state
 */
export const syncCustomerState = async () => {
  if (Constants.appOwnership === 'expo') return;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const settings = await getAppSettings();
    
    // Check for "pro" entitlement if applicable
    if (customerInfo.entitlements.active['pro']) {
      settings.isPro = true;
    } else {
      settings.isPro = false;
    }
    
    await saveAppSettings(settings);
  } catch (e) {
    console.error("Failed to sync customer state", e);
  }
};
