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

const ensureDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(PROJECT_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(PROJECT_DIR, { intermediates: true });
  }
};

export const saveProject = async (project: ExamProject) => {
  await ensureDir();
  const fileUri = PROJECT_DIR + `${project.id}.json`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(project));
  return fileUri;
};

export const loadProjects = async (): Promise<ExamProject[]> => {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(PROJECT_DIR);
  
  const projects: ExamProject[] = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const content = await FileSystem.readAsStringAsync(PROJECT_DIR + file);
        const data = JSON.parse(content);
        // Fix: Ensure every project has a valid date
        if (!data.updatedAt) data.updatedAt = Date.now();
        // Fix: Ensure header title is synced
        if (!data.title) data.title = data.header?.title || "Untitled";
        
        projects.push(data);
      } catch (e) {
        console.warn("Corrupt project file:", file);
      }
    }
  }
  // Sort by Newest Modified
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const deleteProject = async (id: string) => {
  const fileUri = PROJECT_DIR + `${id}.json`;
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
};

export const getProject = async (id: string): Promise<ExamProject | null> => {
  try {
    const fileUri = PROJECT_DIR + `${id}.json`;
    const content = await FileSystem.readAsStringAsync(fileUri);
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
};

// NEW: Rename function for Dashboard
export const renameProject = async (id: string, newTitle: string) => {
  const project = await getProject(id);
  if (project) {
    project.title = newTitle;
    project.header.title = newTitle; // Sync header title too
    project.updatedAt = Date.now();
    await saveProject(project);
  }
};