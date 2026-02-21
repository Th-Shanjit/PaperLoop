import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

const MODEL_ID = 'gemini-2.5-flash'; 

interface ScannedPage {
  uri: string;
  width?: number;  
  height?: number; 
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

const parseJSONSafely = (rawText: string) => {
  let cleaned = rawText.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("JSON Parse failed! Activating Brutal Rescue...");
    
    // THE BRUTAL RESCUE ALGORITHM:
    // If the AI cuts off mid-sentence (e.g. at Question 4), this rewinds the text 
    // to the last complete '}' bracket (saving Questions 1-3), drops the broken data, 
    // and forces the arrays closed.
    
    const lastCompleteObjectIdx = cleaned.lastIndexOf('}');
    if (lastCompleteObjectIdx !== -1) {
      let patched = cleaned.substring(0, lastCompleteObjectIdx + 1);
      
      // Depending on where it cut off, it needs different closing tags. 
      // We try the 4 most likely structural closures for our specific schema.
      const closingCombinations = [
        patched + ']}',       // Closes questions array, section object
        patched + ']}]}',     // Closes questions array, section object, sections array, root object
        patched + '}]}',      // Closes section object, sections array, root object
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

export const transcribeHandwriting = async (pages: ScannedPage[], onProgress?: (msg: string) => void) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  
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
                  },
                  page_index: { 
                    type: "INTEGER",
                    description: "The 0-based index of the image this question was found on."
                  }
                },
                required: ["number", "text", "marks", "type", "page_index"]
              }
            }
          },
          required: ["title", "questions"]
        }
      }
    },
    required: ["sections"]
  };

  let allSections: any[] = [];
  const CHUNK_SIZE = 3; // THE GOLDILOCKS FIX: 3 pages per API call

  for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
    const chunk = pages.slice(i, i + CHUNK_SIZE);
    const isLastChunk = (i + CHUNK_SIZE) >= pages.length;
    
    if (onProgress) {
      onProgress(`Optimizing pages ${i + 1} to ${Math.min(i + CHUNK_SIZE, pages.length)} of ${pages.length}...`);
    }

    try {
      // 1. Compress just this chunk
      const imageParts = await Promise.all(chunk.map(async (page) => {
        const processedImg = await compressImage(page.uri);
        return { inlineData: { mimeType: "image/jpeg", data: processedImg.base64 } };
      }));

      // 2. Instruct the AI on this specific chunk
      const masterPrompt = `Strict OCR. Rules:
1. Transcribe exactly.
2. Math: $...$ inline, $$...$$ block. Chem: \\ce{...}.
3. Instructions/Subheadings: type="instruction", no number/marks.
4. Nested numbers: keep separate from text (e.g. "1(a)").
5. Diagram present: has_diagram=true and provide box_2d [ymin, xmin, ymax, xmax] scaled 0-1000.
6. MCQ options in array.
7. CANCELLATIONS: If a word has a line struck through it, DO NOT delete it. Wrap it in markdown strikethrough tags like ~~crossed out word~~ so the user can review it.`;

      const payload = {
        contents: [{
          parts: [ { text: masterPrompt }, ...imageParts ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.1, // Bumped slightly to 0.1 to prevent hallucination loops in Preview models
          maxOutputTokens: 8192
        }
      };

      // 3. Rate Limit Protection: Wait 2 seconds between chunks to avoid 503 errors
      if (i > 0) {
        if (onProgress) onProgress(`Cooling down API to prevent rate limits...`);
        await sleep(2500); 
      }

      if (onProgress) onProgress(`AI reading pages ${i + 1}-${Math.min(i + CHUNK_SIZE, pages.length)}...`);
      const response = await axios.post(url, payload);

      let rawText = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const data = parseJSONSafely(rawText);
      
      // 4. Map the AI's local chunk index back to the absolute real-world page index
      if (data.sections) {
        data.sections.forEach((sec: any) => {
          const processedQs = sec.questions.map((q: any) => {
            const localIndex = (q.page_index !== undefined && q.page_index < chunk.length) ? q.page_index : 0;
            const absoluteIndex = i + localIndex; // Converts chunk index '0' to real page '3'
            
            return {
              id: Date.now().toString() + Math.random(),
              number: q.number || "",
              text: cleanText(q.text), 
              marks: q.marks || "",
              type: q.type || 'standard', 
              options: q.options || [],
              has_diagram: q.has_diagram, 
              box_2d: q.box_2d,           
              pageUri: pages[absoluteIndex].uri, // Matches back to correct file for the Cropper
              diagramUri: q.has_diagram ? "NEEDS_CROP" : undefined, 
              hideText: false, 
              isFullWidth: false
            };
          });

          allSections.push({
            id: Date.now().toString() + Math.random(),
            title: sec.title || "Section",
            layout: sec.layout_hint || "1-column",
            questions: processedQs
          });
        });
      }
        
    } catch (e: any) {
      console.error(`Chunk starting at page ${i + 1} Failed:`, e.message);
      allSections.push({
        id: Date.now().toString() + Math.random(),
        title: `⚠️ Pages ${i + 1}-${Math.min(i + CHUNK_SIZE, pages.length)} Failed`,
        layout: '1-column',
        questions: [{
          id: Date.now().toString(), number: "!", text: "Scan failed for these pages. Try scanning them individually.", marks: "", type: "standard", hideText: false
        }]
      });
    }
  }

  if (onProgress) onProgress("Formatting final exam...");
  return { sections: allSections };
};