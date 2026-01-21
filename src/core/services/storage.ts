import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'paperloop_exams';

export interface SavedExam {
  id: string;
  title: string;
  date: string;
  questions: any[];
}

// 1. SAVE AN EXAM
export const saveExam = async (title: string, questions: any[]) => {
  try {
    const newExam: SavedExam = {
      id: Date.now().toString(), // Simple unique ID
      title: title || "Untitled Exam",
      date: new Date().toLocaleDateString(),
      questions: questions
    };

    // Get existing exams
    const existing = await getSavedExams();
    const updated = [newExam, ...existing]; // Add new one to the top

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (e) {
    console.error("Failed to save exam", e);
    return false;
  }
};

// 2. GET ALL EXAMS
export const getSavedExams = async (): Promise<SavedExam[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error("Failed to load exams", e);
    return [];
  }
};

// 3. DELETE AN EXAM
export const deleteExam = async (id: string) => {
  try {
    const existing = await getSavedExams();
    const filtered = existing.filter(exam => exam.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (e) {
    console.error("Failed to delete exam", e);
    return [];
  }
};