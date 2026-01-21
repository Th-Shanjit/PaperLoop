import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy'; 

// Use your specific model
const MODEL_ID = 'gemini-2.0-flash-lite'; // Updated to 2.0 for better speed/cost if available, or keep 1.5-flash

interface ScannedPage {
  uri: string;
  mode: boolean;
}

const convertUriToBase64 = async (uri: string): Promise<string> => {
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  } catch (e) {
    console.error("File Read Error:", e);
    return "";
  }
};

const extractJSON = (text: string) => {
  // DEBUG LOG: See exactly what Gemini returns
  console.log("---- RAW GEMINI OUTPUT ----");
  console.log(text); 
  console.log("---------------------------");

  try {
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').replace(/\\/g, "\\\\");
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
       const candidate = cleaned.substring(firstBrace, lastBrace + 1).replace(/\\\\"/g, '\\"');
       return JSON.parse(candidate);
    }
    return { questions: [] };
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return { questions: [] };
  }
};

const retryWrapper = async <T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error.response?.status === 429 && retries > 0) {
      console.log(`⚠️ Rate Limit (429). Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return retryWrapper(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const transcribeHandwriting = async (pages: ScannedPage[]) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  
  let allQuestions: any[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const base64Data = await convertUriToBase64(page.uri);
    
    if (!base64Data) {
        console.warn(`Skipping page ${i}: Could not read file.`);
        continue;
    }
    
    const strategyInstruction = page.mode 
      ? `MODE: LAB (CHEMISTRY/MATH). Detect ALL structures. Output detailed boxes.`
      : `MODE: FAST (STANDARD). Prefer naming standard molecules. Only box complex diagrams.`;

    // FIX 1: UPDATED PROMPT TO MATCH EDITOR KEYS
    const surveyPrompt = `
      ${strategyInstruction}
      Analyze Page ${i + 1}.
      1. TRANSCRIBE TEXT/MATH: Use standard LaTeX ($...$).
      2. DETECT DIAGRAMS: Return 'box_2d' [ymin, xmin, ymax, xmax].
      3. OUTPUT JSON STRICTLY: 
      { 
        "questions": [ 
          { 
            "question_number": "1", 
            "question_text": "Full text of question...", 
            "marks": "5",
            "box_2d": [0,0,0,0] 
          } 
        ] 
      }
    `;

    try {
      const surveyResponse = await retryWrapper(() => axios.post(url, {
        contents: [{
          parts: [{ text: surveyPrompt }, { inlineData: { mimeType: "image/jpeg", data: base64Data } }]
        }]
      }));

      const rawText = surveyResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const data = extractJSON(rawText);

      if (data.questions) {
        for (const q of data.questions) {
          // If no complex box, push as is (with correct keys)
          if (!q.box_2d || q.box_2d[0] === 0 || q.box_2d.length < 4) {
             // Ensure defaults if Gemini misses them
             allQuestions.push({
               question_number: q.question_number || q.id || "1",
               question_text: q.question_text || q.text || "",
               marks: q.marks || "5"
             });
             continue;
          }

          // If complex box, call Surgeon
          try {
            const specializedResult = await retryWrapper(() => 
              callSpecialistModel(base64Data, q.box_2d, q.question_number || "1", apiKey, page.mode)
            );
            allQuestions.push(specializedResult);
          } catch (e) {
            allQuestions.push({ ...q, question_text: "[Scan Error in Diagram]" });
          }
          
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    } catch (e) {
      console.error(`Page ${i + 1} Failed:`, e);
    }
    
    await new Promise(r => setTimeout(r, 1000)); 
  }

  return { questions: allQuestions };
};

const callSpecialistModel = async (fullImageB64: string, box: number[], number: string, apiKey: string, isLabMode: boolean) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
    
    const prompt = isLabMode ? `
      TASK: TRACE STRUCTURE (LAB MODE)
      FOCUS REGION: [ymin:${box[0]}, xmin:${box[1]}, ymax:${box[2]}, xmax:${box[3]}] (Scale 0-1000).
      1. Trace exact bonds/atoms to SMILES or LaTeX.
      2. OUTPUT TEXT ONLY.
    ` : `
      TASK: IDENTIFY CONTENT (FAST MODE)
      FOCUS REGION: [ymin:${box[0]}, xmin:${box[1]}, ymax:${box[2]}, xmax:${box[3]}] (Scale 0-1000).
      Identify the object or read the text inside this region.
    `;

    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: fullImageB64 } }]
      }]
    });

    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleanText = result.replace(/```/g, '').trim();
    
    // FIX 2: RETURN OBJECT MATCHES EDITOR KEYS
    return { 
      question_number: number, 
      question_text: cleanText, 
      marks: "5" // Default for diagrams
    };
};