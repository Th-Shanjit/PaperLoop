import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

const MODEL_ID = 'gemini-2.5-flash'; 

interface ScannedPage {
  uri: string;
  width?: number;  
  height?: number; 
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. IMAGE COMPRESSION ---
const compressImage = async (uri: string): Promise<{ base64: string, width: number, height: number, uri: string }> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }], 
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return { base64: result.base64 || "", width: result.width, height: result.height, uri: result.uri };
  } catch (e) {
    console.error("Compression Error:", e);
    throw e;
  }
};

const cleanText = (text: string): string => {
  if (!text) return "";
  let cleaned = text.replace(/\\+\$/g, '$'); 
  return cleaned.trim(); 
};

// --- 2. BRUTAL RESCUE JSON PARSER ---
const parseJSONSafely = (rawText: string) => {
  let cleaned = rawText.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("JSON Parse failed! Activating Brutal Rescue...");
    
    const lastCompleteObjectIdx = cleaned.lastIndexOf('}');
    if (lastCompleteObjectIdx !== -1) {
      let patched = cleaned.substring(0, lastCompleteObjectIdx + 1);
      
      const closingCombinations = [
        patched + ']}',       
        patched + ']}]}',     
        patched + '}]}',      
        patched + '}]}]}'     
      ];

      for (const attempt of closingCombinations) {
        try {
          const rescuedJSON = JSON.parse(attempt);
          console.log("✅ Brutal Rescue Successful! Salvaged partial page data.");
          return rescuedJSON;
        } catch (e) {}
      }
    }
    
    throw new Error("JSON completely un-rescuable even after brutal truncation");
  }
};

// --- 3. RATE LIMIT ARMOR (Exponential Backoff) ---
const callGeminiWithRetry = async (url: string, payload: any, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(url, payload);
      return response;
    } catch (error: any) {
      const status = error.response?.status;
      if ((status === 503 || status === 429) && attempt < maxRetries - 1) {
        const backoffTime = (2 ** attempt) * 1500;
        console.warn(`[API] ${status} caught. Retrying in ${backoffTime}ms...`);
        await sleep(backoffTime);
        continue;
      }
      throw error;
    }
  }
};

// --- THE MAGIC AUTO-CROPPER ---
const autoCropDiagram = async (imageUri: string, box2d: number[], imgWidth: number, imgHeight: number): Promise<string | null> => {
  try {
    const [ymin, xmin, ymax, xmax] = box2d;
    
    // Add a 5% safe padding so we don't accidentally chop off the edges of the drawing
    const padY = (ymax - ymin) * 0.05;
    const padX = (xmax - xmin) * 0.05;

    const safeYmin = Math.max(0, ymin - padY);
    const safeXmin = Math.max(0, xmin - padX);
    const safeYmax = Math.min(1000, ymax + padY);
    const safeXmax = Math.min(1000, xmax + padX);

    // Convert the AI's 0-1000 scale into actual pixels
    const originX = (safeXmin / 1000) * imgWidth;
    const originY = (safeYmin / 1000) * imgHeight;
    const width = ((safeXmax - safeXmin) / 1000) * imgWidth;
    const height = ((safeYmax - safeYmin) / 1000) * imgHeight;

    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ crop: { originX, originY, width, height } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (e) {
    console.error("Auto-crop failed:", e);
    return null;
  }
};

// --- 4. MAIN SCANNING ENGINE (Staggered Parallel) ---
export const transcribeHandwriting = async (pages: ScannedPage[], onProgress?: (msg: string) => void) => {
  const PROXY_URL = "https://paperloop-proxy.th-shanjit.workers.dev";
  const url = `${PROXY_URL}?model=${MODEL_ID}`;
  
  const responseSchema = {
    type: "OBJECT",
    properties: {
      sections: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" }, 
            layout_hint: { type: "STRING" },
            questions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  number: { type: "STRING" },
                  text: { type: "STRING" },
                  marks: { type: "STRING" },
                  type: { type: "STRING", enum: ["standard", "mcq", "instruction"] },
                  options: { type: "ARRAY", items: { type: "STRING" } }, 
                  has_diagram: { type: "BOOLEAN" },
                  box_2d: {
                    type: "ARRAY",
                    description: "If diagram exists, return [ymin, xmin, ymax, xmax] scaled 0-1000.",
                    items: { type: "INTEGER" }
                  }
                },
                required: ["number", "text", "marks", "type"]
              }
            }
          },
          required: ["title", "questions"]
        }
      }
    },
    required: ["sections"]
  };

  const masterPrompt = `Strict OCR. Rules:
1. Transcribe exactly.
2. Math: $...$ inline, $$...$$ block. 
3. Chem: Write chemical formulas strictly as ce{H2O}. NO backslashes!
4. Instructions/Subheadings: type="instruction", no number/marks.
5. SERIALIZATION: DO NOT combine parent numbers with sub-numbers. If a question is '2' and its sub-question is '(i)', the number field should ONLY be '(i)'. NEVER output '2(i)'.
6. Diagram present: has_diagram=true and provide box_2d [ymin, xmin, ymax, xmax] scaled 0-1000.
7. MCQ options in array.
8. CANCELLATIONS: Wrap crossed out words in ~~tags~~.`;

  if (onProgress) onProgress(`Starting high-speed scan of ${pages.length} pages...`);

  // Fire all pages at once, staggered by 1.2 seconds to bypass 503 limits
  const scanPromises = pages.map(async (page, index) => {
    
    if (index > 0) {
      await sleep(index * 1200); 
    }

    try {
      const processedImg = await compressImage(page.uri);
      
      const payload = {
        contents: [{
          parts: [ 
            { text: masterPrompt }, 
            { inlineData: { mimeType: "image/jpeg", data: processedImg.base64 } } 
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.1, 
          maxOutputTokens: 4096 
        }
      };

      const response = await callGeminiWithRetry(url, payload);
      let rawText = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const data = parseJSONSafely(rawText);
      
      let sections = data.sections || [];
      
      // Attach the correct UI data and AUTO-CROP
      for (const sec of sections) {
        if (sec.questions) {
          for (const q of sec.questions) {
            q.pageUri = page.uri; 
            q.id = Date.now().toString() + Math.random();
            q.number = q.number || "";
            q.text = cleanText(q.text);
            q.marks = q.marks || "";
            q.type = q.type || 'standard';
            q.options = q.options || [];
            
            // --- FIRE THE AUTO-CROPPER ---
            if (q.has_diagram && q.box_2d && q.box_2d.length === 4) {
              const croppedUri = await autoCropDiagram(processedImg.uri, q.box_2d, processedImg.width, processedImg.height);
              // If successful, bypass "NEEDS_CROP" and instantly display the image!
              q.diagramUri = croppedUri || "NEEDS_CROP";
            } else {
              q.diagramUri = q.has_diagram ? "NEEDS_CROP" : undefined;
            }
            
            q.hideText = false;
            q.isFullWidth = false;
          }
        }
      }

      if (onProgress && pages.length > 1) onProgress(`Page ${index + 1} processed...`);
      return sections;

    } catch (e: any) {
      console.error(`Page ${index + 1} Failed:`, e.message);
      return [{
        id: Date.now().toString() + Math.random(),
        title: `⚠️ Page ${index + 1} Failed`,
        layout: '1-column',
        questions: [{
          id: Date.now().toString(), number: "!", text: "Scan failed. Try scanning individually.", marks: "", type: "standard", hideText: false
        }]
      }];
    }
  });

  // Wait for all staggered requests to finish
  const allResults = await Promise.all(scanPromises);

  if (onProgress) onProgress("Formatting final exam...");
  
  let allSections: any[] = [];
  allResults.forEach((pageSections) => {
    allSections.push(...pageSections);
  });

  return { sections: allSections };
};

// --- 5. THE SNIPPET ENGINE ---
export const transcribeFormulaSnippet = async (uri: string): Promise<string> => {
  const PROXY_URL = "https://paperloop-proxy.th-shanjit.workers.dev";
  const url = `${PROXY_URL}?model=${MODEL_ID}`;

  try {
    const processedImg = await compressImage(uri);
    
    const payload = {
      contents: [{
        parts: [
          { text: "Output ONLY raw LaTeX or \\ce{} code. NO JSON." }, 
          { inlineData: { mimeType: "image/jpeg", data: processedImg.base64 } }
        ]
      }],
      generationConfig: { temperature: 0.0, maxOutputTokens: 500 }
    };

    const response = await callGeminiWithRetry(url, payload);
    let rawText = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    return rawText.trim();
  } catch (e) {
    console.error("Snippet transcription failed:", e);
    return "";
  }
};