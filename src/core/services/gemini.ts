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
      [{ resize: { width: 1600 } }], 
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return { base64: result.base64 || "", width: result.width, height: result.height, uri: result.uri };
  } catch (e) {
    console.error("Compression Error:", e);
    throw e;
  }
};

const cleanText = (text: string): string => {
  if (!text) return "";
  let cleaned = text.replace(/\\+\$/g, '$'); // Un-escapes dollar signs for math
  return cleaned.trim(); 
};

export const transcribeHandwriting = async (pages: ScannedPage[]) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  
  let allSections: any[] = [];

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
                  // CRITICAL FIX: Added 'instruction' to schema
                  type: { type: "STRING", enum: ["standard", "mcq", "instruction"] },
                  options: { type: "ARRAY", items: { type: "STRING" } }, 
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
    const processedImg = await compressImage(page.uri);
    
    // CRITICAL FIX: Aggressive instructions for serialization and subheadings
    const masterPrompt = `
      Task: You are a strict OCR transcription engine processing an exam paper. 

      RULES:
      1. TRANSCRIBE EXACTLY: Read carefully and transcribe what is on the page. Do NOT invent or repeat generic questions.
      2. MATH & CHEM: Use $...$ for inline math and $$...$$ for block math. You MUST use \\ce{...} for chemistry equations.
      3. SUBHEADINGS / INSTRUCTIONS: If a block of text is a direction for the student (e.g., "Fill in the blanks", "Answer any 5:", "SECTION A - 10 MARKS"), set the type to "instruction". Leave "number" and "marks" completely empty.
      4. NESTED SERIALIZATION (CRITICAL): If a question has sub-parts (like i, ii, iii), format their numbers clearly (e.g., "1(a)", "1(b)", or "(i)", "(ii)"). DO NOT merge the instruction text into the first sub-question. Keep them separate.
      5. DIAGRAMS: If a question relies on a drawn figure or graph, set "has_diagram": true.
      6. MCQs: Extract multiple choice options into the "options" list.
    `;

    try {
      const response = await axios.post(url, {
        contents: [{
          parts: [
            { text: masterPrompt }, 
            { inlineData: { mimeType: "image/jpeg", data: processedImg.base64 } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.1 
        }
      });

      let rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      rawText = rawText.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim();
      const data = JSON.parse(rawText);

      if (data.sections) {
        const processedSections = data.sections.map((sec: any) => ({
          id: Date.now().toString() + Math.random(),
          title: sec.title || "Section",
          layout: sec.layout_hint || "1-column",
          questions: sec.questions.map((q: any) => ({
            id: Date.now().toString() + Math.random(),
            number: q.number || "",
            text: cleanText(q.text), 
            marks: q.marks || "",
            type: q.type || 'standard', 
            options: q.options || [],
            diagramUri: q.has_diagram ? "NEEDS_CROP" : undefined, 
            hideText: false, 
            isFullWidth: false
          }))
        }));
        allSections.push(...processedSections);
      }
    } catch (e: any) {
      console.error(`Page ${i + 1} Failed:`, e.message);
    }
    if (i < pages.length - 1) await sleep(500);
  }
  return { sections: allSections };
};