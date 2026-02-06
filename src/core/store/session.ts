import { create } from 'zustand';

export interface ScannedPage {
  uri: string;
  width?: number;
  height?: number;
  rotation: number; 
  // REMOVED: mode
}

export let currentSessionPages: ScannedPage[] = [];

export const addPageToSession = (page: Omit<ScannedPage, 'rotation'>) => {
  currentSessionPages.push({ ...page, rotation: 0 });
};

export const updatePageInSession = (index: number, updates: Partial<ScannedPage>) => {
  if (index > -1 && index < currentSessionPages.length) {
    currentSessionPages[index] = { ...currentSessionPages[index], ...updates };
  }
};

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