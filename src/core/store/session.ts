import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';

export interface ScannedPage {
  localUri: string;
  width?: number;
  height?: number;
  rotation: number; 
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

export const clearSession = async () => {
  for (const page of currentSessionPages) {
    try {
      await FileSystem.deleteAsync(page.localUri, { idempotent: true });
    } catch (e) {}
  }
  currentSessionPages = [];
};

export const getSessionPages = () => {
  return currentSessionPages;
};

export const removePageFromSession = async (index: number) => {
  if (index > -1 && index < currentSessionPages.length) {
    const page = currentSessionPages[index];
    try {
      await FileSystem.deleteAsync(page.localUri, { idempotent: true });
    } catch (e) {}
    currentSessionPages.splice(index, 1);
  }
};