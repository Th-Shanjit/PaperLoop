import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy'; 

// Use Stable 1.5 Flash for reliability
const MODEL_ID = 'gemini-1.5-flash'; 

interface ScannedPage {
  uri: string;
  width?: number;  
  height?: number; 
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const convertUriToBase64 = async (uri: string): Promise<string> => {
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  } catch (e) {
    console.error("File Read Error:", e);
    return "";
  }
};

const extractJSON = (text: string) => {
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
    return { questions: [] };
  }
};

export const transcribeHandwriting = async (pages: ScannedPage[]) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  
  let allQuestions: any[] = [];

  for (let i = 0; i < pages.length; i++) {
    console.log(`Processing Page ${i + 1}...`);
    const page = pages[i];
    const base64Data = await convertUriToBase64(page.uri);
    
    // NEW HYBRID PROMPT: "Don't describe diagrams. Just locate them."
    const masterPrompt = `
      Analyze this handwritten exam page.
      
      TASK 1 (TEXT): Transcribe all text questions normally.
      
      TASK 2 (DIAGRAMS): 
      If a question involves a Graph, Chemical Structure, or Geometry Drawing:
      1. DO NOT try to describe it in text.
      2. Instead, detect its Bounding Box [ymin, xmin, ymax, xmax] (scale 0-1000).
      3. Set 'has_diagram' to true.

      OUTPUT JSON:
      {
        "questions": [
          {
            "question_number": "1",
            "question_text": "Calculate the area...",
            "marks": "5",
            "has_diagram": true, 
            "box_2d": [150, 200, 350, 600] 
          }
        ]
      }
    `;

    try {
      const response = await axios.post(url, {
        contents: [{
          parts: [
            { text: masterPrompt }, 
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }]
      });

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const data = extractJSON(rawText);

      if (data.questions) {
        // Tag each question with the source URI so we can crop it later
        const tagged = data.questions.map((q: any) => ({
            ...q,
            pageUri: page.uri, 
            id: Date.now().toString() + Math.random()
        }));
        allQuestions.push(...tagged);
      }
    } catch (e) {
      console.error(`Page ${i + 1} Failed`, e);
    }
    
    if (i < pages.length - 1) await sleep(1000);
  }

  return { questions: allQuestions };
};