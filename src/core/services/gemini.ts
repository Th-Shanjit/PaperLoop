import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

const MODEL_ID = 'gemini-3-flash-preview'; 

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

// Smarter JSON Rescuer with debugging logs
const parseJSONSafely = (rawText: string) => {
  let cleaned = rawText.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("JSON Parse failed! Text likely cut off. Attempting rescue...");
    console.log("--- LAST 200 CHARACTERS OF CUT-OFF TEXT ---");
    console.log(cleaned.substring(cleaned.length - 200));
    
    const rescues = [
      cleaned + '"]}]}', cleaned + ']}', cleaned + ']}]}', 
      cleaned + '}]}', cleaned + '}]}]}'
    ];
    for (const rescue of rescues) {
      try { return JSON.parse(rescue); } catch (e) {}
    }
    throw new Error("JSON parse completely failed after rescue attempts");
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
1. You have ${chunk.length} image(s) of an exam in sequential order (Index 0 to ${chunk.length - 1}).
2. Transcribe exactly.
3. Math: $...$ inline, $$...$$ block. Chem: \\ce{...}.
4. Instructions/Subheadings: type="instruction", no number/marks.
5. Nested numbers: keep separate from text (e.g. "1(a)").
6. Diagram present: has_diagram=true and provide box_2d [ymin, xmin, ymax, xmax] scaled 0-1000.
7. MUST provide 'page_index' (0 to ${chunk.length - 1}) for EVERY question so we know which image it came from.`;

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