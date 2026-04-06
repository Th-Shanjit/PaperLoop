/**
 * Web implementation of the PaperLoop storage service.
 * Uses @react-native-async-storage/async-storage instead of expo-file-system.
 *
 * Key design decisions:
 * - Projects stored as JSON strings under keys "project:<id>"
 * - A "project_index" key holds a JSON array of all project IDs
 * - AppSettings stored under "app_settings"
 * - Diagram images embedded as base64 data URIs in Question.localUri —
 *   no separate file paths needed on web
 * - 10 free scan tokens on first launch (IAP unavailable on web)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Re-export types (identical to storage.ts) ───────────────────────────────

export interface ExamHeader {
  schoolName: string;
  title: string;
  className?: string;
  duration: string;
  totalMarks: string;
  instructions: string;
}

export interface Question {
  id: string;
  number: string;
  text: string;
  marks: string;
  localUri?: string;
  diagramSize?: 'S' | 'M' | 'L';
  hideText?: boolean;
  isFullWidth?: boolean;
  type?: 'standard' | 'mcq' | 'instruction';
  options?: string[];
}

export interface Section {
  id: string;
  title: string;
  layout: '1-column' | '2-column' | '3-column';
  showDivider?: boolean;
  rescanCount?: number;
  sourceImageUri?: string;
  questions: Question[];
}

export interface ExamProject {
  id: string;
  title: string;
  updatedAt: number;
  header: ExamHeader;
  sections: Section[];
  questions?: Question[];
  settings: {
    fontTheme: string;
  };
}

export interface AppSettings {
  organizationName: string;
  organizationLogo?: string;
  defaultDuration: string;
  defaultInstructions: string;
  defaultFontTheme: string;
  proLicenseKey?: string;
  isPro?: boolean;
  scanTokens?: number;
  hasSeenOnboarding?: boolean;
  hasSeenEditorTour?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const PROJECT_KEY = (id: string) => `project:${id}`;
const INDEX_KEY = 'project_index';
const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  organizationName: 'PaperLoop Academy',
  defaultDuration: '90 Mins',
  defaultInstructions:
    '1. All questions are compulsory.\n2. Draw diagrams where necessary.',
  defaultFontTheme: 'calibri',
  isPro: false,
  // Web users get 10 free scans; IAP top-up is not available on the web PWA
  scanTokens: 10,
};

async function getIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setIndex(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export const saveProject = async (project: ExamProject): Promise<string> => {
  try {
    await AsyncStorage.setItem(PROJECT_KEY(project.id), JSON.stringify(project));

    // Keep the index up to date
    const index = await getIndex();
    if (!index.includes(project.id)) {
      index.push(project.id);
      await setIndex(index);
    }

    return PROJECT_KEY(project.id);
  } catch (error) {
    console.error('Failed to save project:', error);
    throw error;
  }
};

export const loadProjects = async (): Promise<ExamProject[]> => {
  try {
    const index = await getIndex();
    const projects: ExamProject[] = [];

    for (const id of index) {
      try {
        const raw = await AsyncStorage.getItem(PROJECT_KEY(id));
        if (!raw) continue;
        const data: ExamProject = JSON.parse(raw);

        if (!data.updatedAt) data.updatedAt = Date.now();
        if (!data.title) data.title = data.header?.title || 'Untitled';

        projects.push(data);
      } catch {
        console.warn('Skipped corrupt project:', id);
      }
    }

    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
};

export const getProject = async (id: string): Promise<ExamProject | null> => {
  try {
    const raw = await AsyncStorage.getItem(PROJECT_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const deleteProject = async (id: string): Promise<void> => {
  await AsyncStorage.removeItem(PROJECT_KEY(id));

  const index = await getIndex();
  await setIndex(index.filter((i) => i !== id));
};

export const renameProject = async (id: string, newTitle: string): Promise<void> => {
  const project = await getProject(id);
  if (project) {
    project.title = newTitle;
    project.header.title = newTitle;
    project.updatedAt = Date.now();
    await saveProject(project);
  }
};

// ─── App Settings ─────────────────────────────────────────────────────────────

export const getAppSettings = async (): Promise<AppSettings> => {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveAppSettings = async (settings: AppSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};

// ─── Cache / image helpers ────────────────────────────────────────────────────

// No-op on web: images are base64 data URIs embedded in projects, so there
// are no temporary files to clear.
export const clearImageCache = async (): Promise<void> => {};

// ─── Token helpers ────────────────────────────────────────────────────────────

export const checkScanEligibility = async (): Promise<boolean> => {
  const settings = await getAppSettings();
  if (settings.isPro) return true;
  return (settings.scanTokens || 0) > 0;
};

export const deductScanToken = async (): Promise<void> => {
  const settings = await getAppSettings();
  if (!settings.isPro && (settings.scanTokens || 0) > 0) {
    settings.scanTokens = (settings.scanTokens || 0) - 1;
    await saveAppSettings(settings);
  }
};

export const purchaseTokens = async (amount: number): Promise<void> => {
  const settings = await getAppSettings();
  settings.scanTokens = (settings.scanTokens || 0) + amount;
  await saveAppSettings(settings);
};
