import * as FileSystem from 'expo-file-system/legacy';

const PROJECT_DIR = FileSystem.documentDirectory + 'projects/';

export interface ExamProject {
  id: string;
  title: string;
  updatedAt: number;
  header: {
    schoolName: string;
    title: string;
    duration: string;
    totalMarks: string;
    instructions: string;
  };
  questions: any[];
  settings: {
    columnLayout: '1-column' | '2-column';
    fontTheme: 'modern' | 'classic';
  };
}

// 1. Force Directory Creation (The Fix)
const ensureDir = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(PROJECT_DIR);
    if (!dirInfo.exists) {
      console.log("📁 Creating 'projects' directory...");
      await FileSystem.makeDirectoryAsync(PROJECT_DIR, { intermediates: true });
    }
  } catch (error) {
    console.error("❌ Error creating project directory:", error);
  }
};

export const saveProject = async (project: ExamProject) => {
  try {
    await ensureDir();
    const fileUri = PROJECT_DIR + `${project.id}.json`;
    console.log(`💾 Saving Draft: ${project.title} (${project.id})`);
    
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(project));
    return fileUri;
  } catch (error) {
    console.error("❌ Failed to save project:", error);
    throw error;
  }
};

export const loadProjects = async (): Promise<ExamProject[]> => {
  try {
    await ensureDir();
    console.log("📂 Loading projects from:", PROJECT_DIR);
    
    const files = await FileSystem.readDirectoryAsync(PROJECT_DIR);
    console.log("📄 Files found:", files);

    const projects: ExamProject[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await FileSystem.readAsStringAsync(PROJECT_DIR + file);
          const data = JSON.parse(content);

          // Data Integrity Checks (Fixes "Missing Date/Title" bugs)
          if (!data.updatedAt) data.updatedAt = Date.now();
          if (!data.title) data.title = data.header?.title || "Untitled";

          projects.push(data);
        } catch (e) {
          console.warn("⚠️ Corrupt project file skipped:", file);
        }
      }
    }
    // Sort by Newest Modified
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error("❌ Error loading projects:", error);
    return [];
  }
};

export const deleteProject = async (id: string) => {
  try {
    const fileUri = PROJECT_DIR + `${id}.json`;
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    console.log(`🗑️ Deleted project: ${id}`);
  } catch (error) {
    console.error("❌ Error deleting project:", error);
  }
};

export const getProject = async (id: string): Promise<ExamProject | null> => {
  try {
    const fileUri = PROJECT_DIR + `${id}.json`;
    
    // Check if exists first
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      console.warn(`⚠️ Project ${id} not found.`);
      return null;
    }

    const content = await FileSystem.readAsStringAsync(fileUri);
    return JSON.parse(content);
  } catch (e) {
    console.error("❌ Error getting project:", e);
    return null;
  }
};

export const renameProject = async (id: string, newTitle: string) => {
  try {
    const project = await getProject(id);
    if (project) {
      project.title = newTitle;
      project.header.title = newTitle;
      project.updatedAt = Date.now();
      await saveProject(project);
      console.log(`✏️ Renamed project ${id} to "${newTitle}"`);
    }
  } catch (error) {
    console.error("❌ Error renaming project:", error);
  }
};