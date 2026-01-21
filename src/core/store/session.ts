// src/core/store/session.ts

export interface ScannedPage {
  uri: string;
  mode: boolean; 
  rotation: number; // <--- NEW: 0, 90, 180, 270
}

export let currentSessionPages: ScannedPage[] = [];

// Helper to add a page (Initialize rotation to 0)
export const addPageToSession = (page: Omit<ScannedPage, 'rotation'>) => {
  currentSessionPages.push({ ...page, rotation: 0 });
};

// ... (keep existing exports) ...

// NEW: Helper to update a specific page (for rotation)
export const updatePageInSession = (index: number, updates: Partial<ScannedPage>) => {
  if (index > -1 && index < currentSessionPages.length) {
    currentSessionPages[index] = { ...currentSessionPages[index], ...updates };
  }
};

// NEW: Helper to swap two pages
export const swapPagesInSession = (indexA: number, indexB: number) => {
  if (indexA >= 0 && indexA < currentSessionPages.length && indexB >= 0 && indexB < currentSessionPages.length) {
    const temp = currentSessionPages[indexA];
    currentSessionPages[indexA] = currentSessionPages[indexB];
    currentSessionPages[indexB] = temp;
  }
};

export const clearSession = () => {
  currentSessionPages = [];
};

export const getSessionPages = () => {
  return currentSessionPages;
};

export const removePageFromSession = (index: number) => {
  if (index > -1 && index < currentSessionPages.length) {
    currentSessionPages.splice(index, 1);
  }
};