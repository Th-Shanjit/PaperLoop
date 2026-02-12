import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';

const MODEL_ID = 'gemini-3-flash-preview'; 

interface ScannedPage {
  uri: string;
  width?: number;  
  height?: number; 
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Pre-process main scan (Resize for speed)
const compressImage = async (uri: string): Promise<{ base64: string, width: number, height: number, uri: string }> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }], // Standardize width
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return { 
      base64: result.base64 || "", 
      width: result.width, 
      height: result.height,
      uri: result.uri 
    };
  } catch (e) {
    console.error("Compression Error:", e);
    throw e;
  }
};

// Helper: Crop & Apply "CamScanner" Filter
const cropAndEnhanceDiagram = async (originalUri: string, box: number[], imgWidth: number, imgHeight: number) => {
  try {
    // Gemini returns [ymin, xmin, ymax, xmax] (0-1000 scale)
    const [ymin, xmin, ymax, xmax] = box;
    
    // Convert to Pixels
    const originX = (xmin / 1000) * imgWidth;
    const originY = (ymin / 1000) * imgHeight;
    const width = ((xmax - xmin) / 1000) * imgWidth;
    const height = ((ymax - ymin) / 1000) * imgHeight;

    // Safety padding (expand box by 10px)
    const safeX = Math.max(0, originX - 10);
    const safeY = Math.max(0, originY - 10);
    const safeW = Math.min(imgWidth - safeX, width + 20);
    const safeH = Math.min(imgHeight - safeY, height + 20);

    const result = await ImageManipulator.manipulateAsync(
      originalUri,
      [
        { crop: { originX: safeX, originY: safeY, width: safeW, height: safeH } },
        // "CamScanner Effect" Simulation
        // 1. Resize to save space
        { resize: { width: Math.min(safeW, 800) } },
      ],
      { compress: 0.8, format: ImageManipulator.SaveFormat.PNG } // PNG for crisp lines
    );
    return result.uri;
  } catch (e) {
    console.warn("Auto-Crop Failed:", e);
    return originalUri; // Fallback to full page
  }
};

const cleanText = (text: string): string => {
  if (!text) return "";
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

  // --- SCHEMA: Added 'diagram_box_2d' ---
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
                  // [ymin, xmin, ymax, xmax] in 0-1000 scale
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
    
    // Process image once
    const processedImg = await compressImage(page.uri);
    
    const masterPrompt = `
      Analyze this exam page. Structure into SECTIONS.
      
      RULES:
      1. **DIAGRAMS:** If a question has a drawing/graph, set "has_diagram": true.
         CRITICAL: You MUST provide "diagram_box_2d": [ymin, xmin, ymax, xmax] for the diagram area. Scale 0-1000. 
         Tight box around the drawing only.
      2. **MCQs:** Extract options into the list.
      3. **MATH:** Use standard LaTeX ($...$).
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

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const data = JSON.parse(rawText);

      if (data.sections) {
        // Process Sections
        const processedSections = await Promise.all(data.sections.map(async (sec: any) => ({
          id: Date.now().toString() + Math.random(),
          title: sec.title || "Section",
          layout: sec.layout_hint || "1-column",
          questions: await Promise.all(sec.questions.map(async (q: any) => {
            
            // INTELLIGENT CROPPER
            let finalDiagramUri = undefined;
            if (q.has_diagram && q.diagram_box_2d && q.diagram_box_2d.length === 4) {
               finalDiagramUri = await cropAndEnhanceDiagram(
                 processedImg.uri, 
                 q.diagram_box_2d, 
                 processedImg.width, 
                 processedImg.height
               );
            } else if (q.has_diagram) {
               // Fallback if no box returned
               finalDiagramUri = processedImg.uri; 
            }

            return {
              id: Date.now().toString() + Math.random(),
              number: q.number,
              text: cleanText(q.text),
              marks: q.marks,
              type: q.type || 'standard',
              options: q.options || [],
              diagramUri: finalDiagramUri,
              hideText: false,
              isFullWidth: false
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