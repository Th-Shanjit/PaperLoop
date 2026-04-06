/**
 * Web implementation of the PaperLoop scan-session store.
 *
 * Differences from session.ts (native):
 * - No expo-file-system: images arrive as blob: URIs from expo-image-picker
 *   and are held in memory. They are converted to base64 data URIs when
 *   committed to the workspace so they survive page reloads.
 * - clearSession / removePageFromSession just revoke the blob URL (memory GC)
 *   instead of deleting a file.
 */

export interface ScannedPage {
  localUri: string;
  width?: number;
  height?: number;
  rotation: number;
}

export let currentSessionPages: ScannedPage[] = [];

export const addPageToSession = (page: Omit<ScannedPage, 'rotation'>): void => {
  currentSessionPages.push({ ...page, rotation: 0 });
};

export const updatePageInSession = (
  index: number,
  updates: Partial<ScannedPage>,
): void => {
  if (index > -1 && index < currentSessionPages.length) {
    currentSessionPages[index] = { ...currentSessionPages[index], ...updates };
  }
};

export const swapPagesInSession = (indexA: number, indexB: number): void => {
  if (
    indexA >= 0 &&
    indexA < currentSessionPages.length &&
    indexB >= 0 &&
    indexB < currentSessionPages.length
  ) {
    const temp = currentSessionPages[indexA];
    currentSessionPages[indexA] = currentSessionPages[indexB];
    currentSessionPages[indexB] = temp;
  }
};

export const clearSession = async (): Promise<void> => {
  for (const page of currentSessionPages) {
    if (page.localUri.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(page.localUri);
      } catch {}
    }
  }
  currentSessionPages = [];
};

export const getSessionPages = (): ScannedPage[] => currentSessionPages;

export const removePageFromSession = async (index: number): Promise<void> => {
  if (index > -1 && index < currentSessionPages.length) {
    const page = currentSessionPages[index];
    if (page.localUri.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(page.localUri);
      } catch {}
    }
    currentSessionPages.splice(index, 1);
  }
};

/**
 * Convert a blob: URI to a base64 data URI.
 * Call this before persisting an image URI to AsyncStorage so it survives
 * a page reload (blob: URIs are session-scoped and die on reload).
 */
export const blobUriToDataUri = (blobUri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    fetch(blobUri)
      .then((res) => res.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });
};
