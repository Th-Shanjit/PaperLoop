import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

const MODEL_ID = 'gemini-3-flash-preview'; 

interface ScannedPage {
  uri: string;
  width?: number;  
  height?: number; 
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const compressImage = async (uri: string): Promise<string> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }], 
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.base64 || "";
  } catch (e) {
    console.error("Compression Error:", e);
    return "";
  }
};

const cleanText = (text: string): string => {
  if (!text) return "";
  // Fix LaTeX escaping and Chemistry typos
  return text
    .replace(/\\+\$/g, '$')
    .replace(/(?<=[A-Za-z]\d+)0(?=\d)/g, 'O') 
    .replace(/(?<=[A-Za-z]\d+)0$/g, 'O')
    .replace(/(?<=\d)0(?=_)/g, 'O');
};

export const transcribeHandwriting = async (pages: ScannedPage[]) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  
  let allSections: any[] = [];

  // --- NEW SCHEMA: Sections -> Questions -> Options ---
  const responseSchema = {
    type: "OBJECT",
    properties: {
      sections: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" }, // e.g. "Section A"
            layout_hint: { type: "STRING" }, // "1-column" or "2-column"
            questions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  number: { type: "STRING" },
                  text: { type: "STRING" },
                  marks: { type: "STRING" },
                  type: { type: "STRING", enum: ["standard", "mcq"] },
                  options: { type: "ARRAY", items: { type: "STRING" } }, // For MCQs
                  has_diagram: { type: "BOOLEAN" }
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

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const base64Data = await compressImage(page.uri);
    if (!base64Data) continue;

    const masterPrompt = `
      Analyze this exam page. Structure the output into SECTIONS.
      
      RULES:
      1. **SECTIONS:** If you see headers like "Section A", "Part 1", or distinct topics, create a new Section. If none, use "Default Section".
      2. **MCQs:** If a question has options (A, B, C, D), set "type": "mcq" and extract options into the list.
      3. **MATH:** Use standard LaTeX ($...$). Fix "0" vs "O" typos in Chemistry.
      4. **LAYOUT:** If a section contains mainly short MCQs, set "layout_hint": "2-column". Long answers = "1-column".
    `;

    try {
      const response = await axios.post(url, {
        contents: [{
          parts: [
            { text: masterPrompt }, 
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      });

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const data = JSON.parse(rawText);

      if (data.sections) {
        // Post-Process: Add IDs and clean text
        const processed = data.sections.map((sec: any) => ({
          id: Date.now().toString() + Math.random(),
          title: sec.title || "Section",
          layout: sec.layout_hint || "1-column",
          questions: sec.questions.map((q: any) => ({
            id: Date.now().toString() + Math.random(),
            number: q.number,
            text: cleanText(q.text),
            marks: q.marks,
            type: q.type || 'standard',
            options: q.options || [],
            diagramUri: q.has_diagram ? page.uri : undefined, // Link scan if needed
            hideText: false,
            isFullWidth: false
          }))
        }));
        allSections.push(...processed);
      }
      
    } catch (e: any) {
      console.error(`Page ${i + 1} Failed:`, e.message);
    }
    
    if (i < pages.length - 1) await sleep(500);
  }

  // Flatten logic for the Editor (The Editor expects a Flat List of Questions OR Sections)
  // Since we updated Editor to handle Sections, we return the sections directly.
  return { sections: allSections };
};