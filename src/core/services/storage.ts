import * as FileSystem from 'expo-file-system/legacy';

const PROJECT_DIR = FileSystem.documentDirectory + 'projects/';

// --- DATA MODELS ---

// NEW: Export this so pdf.ts can use it
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
  diagramUri?: string;
  diagramSize?: 'S' | 'M' | 'L';
  hideText?: boolean;
  isFullWidth?: boolean;
  type?: 'standard' | 'mcq' | 'instruction'; // CRITICAL FIX: Added 'instruction' type
  options?: string[]; 
}

export interface Section {
  id: string;
  title: string;
  layout: '1-column' | '2-column' | '3-column';
  showDivider?: boolean;
  questions: Question[];
}

export interface ExamProject {
  id: string;
  title: string;
  updatedAt: number;
  header: ExamHeader; // Use the exported interface
  sections: Section[]; 
  questions?: Question[]; 
  settings: {
    fontTheme: 'modern' | 'classic';
  };
}

// --- FILE SYSTEM LOGIC ---
const ensureDir = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(PROJECT_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(PROJECT_DIR, { intermediates: true });
    }
  } catch (error) {
    console.error("Error creating project directory:", error);
  }
};

export const saveProject = async (project: ExamProject) => {
  try {
    await ensureDir();
    const fileUri = PROJECT_DIR + `${project.id}.json`;
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(project));
    return fileUri;
  } catch (error) {
    console.error("Failed to save project:", error);
    throw error;
  }
};

export const loadProjects = async (): Promise<ExamProject[]> => {
  try {
    await ensureDir();
    const files = await FileSystem.readDirectoryAsync(PROJECT_DIR);
    const projects: ExamProject[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await FileSystem.readAsStringAsync(PROJECT_DIR + file);
          const data = JSON.parse(content);
          
          if (!data.updatedAt) data.updatedAt = Date.now();
          if (!data.title) data.title = data.header?.title || "Untitled";
          
          projects.push(data);
        } catch (e) {
          console.warn("Skipped corrupt file:", file);
        }
      }
    }
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    return [];
  }
};

export const deleteProject = async (id: string) => {
  const fileUri = PROJECT_DIR + `${id}.json`;
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
};

export const getProject = async (id: string): Promise<ExamProject | null> => {
  try {
    const fileUri = PROJECT_DIR + `${id}.json`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(fileUri);
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
};

export const renameProject = async (id: string, newTitle: string) => {
  const project = await getProject(id);
  if (project) {
    project.title = newTitle;
    project.header.title = newTitle;
    project.updatedAt = Date.now();
    await saveProject(project);
  }
};

// ============================================================
// APP SETTINGS & CACHE MANAGEMENT
// ============================================================

export interface AppSettings {
  organizationName: string;
  organizationLogo?: string;
  defaultDuration: string;
  defaultInstructions: string;
  defaultFontTheme: 'modern' | 'classic' | 'typewriter';
  proLicenseKey?: string;
}

const SETTINGS_FILE = FileSystem.documentDirectory + 'app_settings.json';

const DEFAULT_SETTINGS: AppSettings = {
  organizationName: "PaperLoop Academy",
  defaultDuration: "90 Mins",
  defaultInstructions: "1. All questions are compulsory.\n2. Draw diagrams where necessary.",
  defaultFontTheme: 'modern'
};

export const getAppSettings = async (): Promise<AppSettings> => {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE);
    if (!info.exists) return DEFAULT_SETTINGS;
    const content = await FileSystem.readAsStringAsync(SETTINGS_FILE);
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
};

export const saveAppSettings = async (settings: AppSettings) => {
  try {
    await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
};

export const clearImageCache = async () => {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return;
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    for (const file of files) {
      // Clear Expo Image Picker and Image Manipulator temporary files
      if (file.includes('ImagePicker') || file.includes('ImageManipulator') || file.endsWith('.jpg') || file.endsWith('.png')) {
        await FileSystem.deleteAsync(cacheDir + file, { idempotent: true });
      }
    }
  } catch (e) {
    console.error("Failed to clear cache", e);
  }
};