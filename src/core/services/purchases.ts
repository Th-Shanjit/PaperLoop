import Purchases, { PurchasesOffering } from 'react-native-purchases';
import { Platform } from 'react-native';
import { purchaseTokens, getAppSettings, saveAppSettings } from './storage';
import Constants from 'expo-constants';

const API_KEYS = {
  apple: "appl_YOUR_APPLE_KEY_HERE", // Replace when you deploy to iOS
  google: "goog_wFYnGCIMqJwlCoUvpUwBPtTtAtG"
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
 * Restore purchases and sync with local state.
 * Computes the token balance directly from RevenueCat's transaction history,
 * making this operation idempotent — calling it multiple times always produces
 * the same correct result. Handles both Pro entitlements and consumable packs
 * including promo codes redeemed via the Play Store.
 */
export const restorePurchases = async (): Promise<boolean> => {
  if (Constants.appOwnership === 'expo') return true;

  try {
    const customerInfo = await Purchases.restorePurchases();
    const settings = await getAppSettings();
    let updated = false;

    // 1. Restore Pro entitlement
    if (customerInfo.entitlements.active['pro']) {
      settings.isPro = true;
      updated = true;
    }

    // 2. Compute the authoritative token balance from RC transaction history.
    // By summing all transactions and setting (not adding) the result, this is
    // fully idempotent — repeated restores always produce the same balance.
    const totalTokensFromRC = customerInfo.nonSubscriptionTransactions.reduce(
      (sum, transaction) => {
        if (transaction.productIdentifier === '10_scans_pack') return sum + 10;
        if (transaction.productIdentifier === '50_scans') return sum + 50;
        return sum;
      },
      0
    );

    if (totalTokensFromRC > 0) {
      settings.scanTokens = totalTokensFromRC;
      updated = true;
    }

    if (updated) {
      await saveAppSettings(settings);
    }

    return updated;
  } catch (e: any) {
    console.error("Failed to restore purchases", e);
    return false;
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
