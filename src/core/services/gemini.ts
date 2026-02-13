import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

const MODEL_ID = 'gemini-2.5-flash-lite'; 

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

const cropAndEnhanceDiagram = async (originalUri: string, box: number[], imgWidth: number, imgHeight: number) => {
  try {
    const [ymin, xmin, ymax, xmax] = box;
    
    const originX = Math.round((xmin / 1000) * imgWidth);
    const originY = Math.round((ymin / 1000) * imgHeight);
    const width = Math.round(((xmax - xmin) / 1000) * imgWidth);
    const height = Math.round(((ymax - ymin) / 1000) * imgHeight);

    if (width <= 0 || height <= 0) throw new Error("Invalid crop dimensions");

    // CRITICAL FIX: Increased padding from 10 to 40 pixels for a safer, wider crop margin
    const PADDING = 40;
    const safeX = Math.max(0, originX - PADDING);
    const safeY = Math.max(0, originY - PADDING);
    const safeW = Math.round(Math.min(imgWidth - safeX, width + (PADDING * 2)));
    const safeH = Math.round(Math.min(imgHeight - safeY, height + (PADDING * 2)));

    const result = await ImageManipulator.manipulateAsync(
      originalUri,
      [
        { crop: { originX: safeX, originY: safeY, width: safeW, height: safeH } },
        { resize: { width: Math.min(safeW, 800) } }, 
      ],
      { compress: 0.8, format: ImageManipulator.SaveFormat.PNG }
    );
    return result.uri;
  } catch (e) {
    console.warn("Auto-Crop Failed, returning original image:", e);
    return originalUri; 
  }
};

const cleanText = (text: string): string => {
  if (!text) return "";
  // Safely escape backslashes so they survive the JS -> HTML transition
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`'); 
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
                  type: { type: "STRING", enum: ["standard", "mcq"] },
                  options: { type: "ARRAY", items: { type: "STRING" } }, 
                  has_diagram: { type: "BOOLEAN" },
                  diagram_box_2d: { type: "ARRAY", items: { type: "NUMBER" } } 
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
    
    const masterPrompt = `
      Analyze this exam page. Structure into SECTIONS.
      
      RULES:
      1. **DIAGRAMS:** If a question has a drawing/graph, set "has_diagram": true and provide "diagram_box_2d": [ymin, xmin, ymax, xmax] (Scale 0-1000). Tight box around the drawing only.
      2. **MCQs:** Extract options into the list.
      3. **MATH & CHEM:** You MUST use strictly $...$ for inline math and $$...$$ for block math. DO NOT use \\( or \\[. For chemistry formulas, use $\\ce{...}$ strictly inside dollar signs.
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
          responseSchema: responseSchema
        }
      });

      let rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      rawText = rawText.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim();
      const data = JSON.parse(rawText);

      if (data.sections) {
        const processedSections = await Promise.all(data.sections.map(async (sec: any) => ({
          id: Date.now().toString() + Math.random(),
          title: sec.title || "Section",
          layout: sec.layout_hint || "1-column",
          questions: await Promise.all(sec.questions.map(async (q: any) => {
            let finalDiagramUri = undefined;
            if (q.has_diagram && q.diagram_box_2d && q.diagram_box_2d.length === 4) {
               finalDiagramUri = await cropAndEnhanceDiagram(
                 processedImg.uri, q.diagram_box_2d, processedImg.width, processedImg.height
               );
            } else if (q.has_diagram) {
               finalDiagramUri = processedImg.uri; 
            }

            return {
              id: Date.now().toString() + Math.random(),
              number: q.number, text: cleanText(q.text), marks: q.marks,
              type: q.type || 'standard', options: q.options || [],
              diagramUri: finalDiagramUri, hideText: false, isFullWidth: false
            };
          }))
        })));
        allSections.push(...processedSections);
      }
    } catch (e: any) {
      console.error(`Page ${i + 1} Failed:`, e.message);
    }
    if (i < pages.length - 1) await sleep(500);
  }
  return { sections: allSections };
};