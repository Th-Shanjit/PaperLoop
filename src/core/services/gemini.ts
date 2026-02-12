import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

// Use 'gemini-2.0-flash-exp' if available, otherwise 'gemini-1.5-flash'
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
      { 
        compress: 0.7, 
        format: ImageManipulator.SaveFormat.JPEG, 
        base64: true 
      }
    );
    return result.base64 || "";
  } catch (e) {
    console.error("Compression Error:", e);
    return "";
  }
};

// --- THE JANITOR: Brute Force fixes for common AI mistakes ---
const cleanQuestionText = (text: string): string => {
  if (!text) return "";
  let clean = text;

  // 1. SCORCHED EARTH DOLLAR FIX
  // Removes ANY number of backslashes before a dollar sign.
  // matches "\$" or "\\$" or "\\\$" -> replaces with "$"
  clean = clean.replace(/\\+\$/g, '$');
  
  // 2. CHEMISTRY FIX (0 vs O)
  // Fixes "C4H802" -> "C4H8O2" (Zero between digits)
  clean = clean.replace(/(?<=[A-Za-z]\d+)0(?=\d)/g, 'O'); 
  // Fixes "H20" -> "H2O" (Zero at end of formula)
  clean = clean.replace(/(?<=[A-Za-z]\d+)0$/g, 'O');
  // Fixes "H_80_2" -> "H_8O_2" (Zero before underscore)
  clean = clean.replace(/(?<=\d)0(?=_)/g, 'O');

  // 3. FORCE LATEX WRAPPING (Safety Net)
  // If we see a formula like C2H4O2 that is NOT wrapped in $, wrap it.
  clean = clean.replace(/(?<!\$)\b([C][0-9]+[H][0-9A-Z]*)\b(?!\$)/g, '$$$1$$');

  return clean;
};

export const transcribeHandwriting = async (pages: ScannedPage[]) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  
  let allQuestions: any[] = [];

  const responseSchema = {
    type: "OBJECT",
    properties: {
      questions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            question_number: { type: "STRING" },
            question_text: { type: "STRING" },
            marks: { type: "STRING" },
            has_diagram: { type: "BOOLEAN" },
            box_2d: {
              type: "ARRAY",
              items: { type: "NUMBER" }
            }
          },
          required: ["question_number", "question_text", "marks", "has_diagram"]
        }
      }
    },
    required: ["questions"]
  };

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const base64Data = await compressImage(page.uri);
    
    if (!base64Data) continue;

    const masterPrompt = `
      Analyze this exam page.
      
      INSTRUCTIONS:
      1. Extract all questions, marks, and diagrams.
      2. **MATH/CHEMISTRY:** - Use LaTeX formatting ($...$).
         - Write "$x^2$" or "$C_4H_8O_2$".
         - NEVER escape the dollar sign.
      3. **DIAGRAMS:** - If a visual exists, set "has_diagram": true and "box_2d": [ymin, xmin, ymax, xmax] (0-1000).

      Return valid JSON matching the schema.
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

      if (data.questions) {
        const tagged = data.questions.map((q: any) => ({
            ...q,
            question_text: cleanQuestionText(q.question_text),
            pageUri: page.uri, 
            id: Date.now().toString() + Math.random()
        }));
        allQuestions.push(...tagged);
      }
      
    } catch (e: any) {
      console.error(`Page ${i + 1} Failed:`, e.message);
    }
    
    if (i < pages.length - 1) await sleep(500);
  }

  return { questions: allQuestions };
};