import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

// Use 'gemini-2.0-flash-exp' if available for better vision, otherwise 'gemini-1.5-flash'
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
      [{ resize: { width: 1600 } }], // High res is critical for Chemistry
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

  // 1. UN-ESCAPE DOLLAR SIGNS
  // The AI often writes "\$x^2\$" to be "safe" for JSON. 
  // We strip the backslash so MathJax sees "$x^2$".
  clean = clean.replace(/\\\$/g, '$');
  
  // 2. FIX CHEMISTRY TYPOS (0 vs O)
  // Replaces "C4H802" -> "C4H8O2"
  // Looks for a Letter followed by '0' followed by a number or end of word
  clean = clean.replace(/([A-Za-z])0(?=\d)/g, '$1O'); // e.g. H02 -> HO2
  clean = clean.replace(/([A-Za-z])0$/g, '$1O');      // e.g. H20 -> H2O

  // 3. FORCE LATEX WRAPPING (Heuristic)
  // If we see something that looks like a formula (e.g. C2H4) but isn't wrapped in $, wrap it.
  // This is a safety net for when the AI forgets the dollars entirely.
  // Regex: Word boundary, C followed by numbers/letters, length > 2
  clean = clean.replace(/(?<!\$)\b([C][0-9]+[H][0-9A-Z]*)\b(?!\$)/g, '$$$1$$');

  return clean;
};

export const transcribeHandwriting = async (pages: ScannedPage[]) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  
  let allQuestions: any[] = [];

  // SIMPLE SCHEMA: Guarantees structure so the app never crashes
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
         - Be careful: "O" is Oxygen, "0" is Zero.
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
            // RUN THE CLEANER
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