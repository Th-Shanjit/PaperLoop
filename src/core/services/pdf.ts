import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';

export interface ExamHeader {
  schoolName: string;
  examTitle: string;
  duration: string;
  totalMarks: string;
  instructions: string;
}

export type TemplateType = 'simple' | 'unit_test' | 'final_exam';

const processText = (text: string) => {
  if (!text) return "";
  let processed = text;

  // 1. SEMANTIC CHEMISTRY ([CHEM: Name] -> Standard Image)
  processed = processed.replace(/\[CHEM:([\s\S]*?)\]/g, (match, chemName) => {
    const cleanName = chemName.trim(); 
    const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(cleanName)}/image?width=500&format=png`;
    return `<div class="diagram-container"><div class="chem-label">${cleanName}</div><img src="${url}" class="chem-diagram" /></div>`;
  });

  // 2. EXPLICIT STRUCTURES ([SMILES] -> Explicit Image)
  processed = processed.replace(/\[SMILES\]([\s\S]*?)\[\/SMILES\]/g, (match, smileCode) => {
    const cleanSmile = smileCode.trim();
    const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(cleanSmile)}/image?width=500&format=png`;
    return `<div class="diagram-container"><img src="${url}" class="chem-diagram" /></div>`;
  });

  // 3. MATH
  processed = processed.replace(/\$(.*?)\$/g, (match, latexCode) => {
    const cleanCode = latexCode.replace(/\n/g, ' ').trim();
    const encoded = encodeURIComponent(cleanCode);
    return `<img src="https://latex.codecogs.com/png.image?\\dpi{300}&space;${encoded}" class="math-latex" />`;
  });

  return processed;
};

// 1. EXPOSE THE HTML GENERATOR
// This function returns the raw HTML string for the WebView
export const generateExamHTML = (header: ExamHeader, questions: any[], template: TemplateType = 'simple') => {
  
  const sharedStyles = `
    .q-item { margin-bottom: 25px; page-break-inside: avoid; }
    
    .math-latex { 
      height: 1.4em;      
      vertical-align: middle; 
      margin: 0 4px;
    }

    .diagram-container { 
      margin: 15px 0 15px 20px; 
      text-align: left;
    }
    
    /* The molecule image */
    .chem-diagram { 
      max-width: 50%; 
      height: auto; 
      border: 1px solid #eee; 
      padding: 10px; 
      border-radius: 8px; 
      background: #fff;
    }
    
    /* The name label (optional, helps verify correctness) */
    .chem-label {
      font-size: 10px;
      color: #888;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
  `;

  // --- TEMPLATES ---
  const simpleTemplate = `body { font-family: Helvetica; padding: 40px; } .header { border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; } .school { font-size: 24px; font-weight: bold; color: #2563EB; } .q-head { font-weight: bold; margin-bottom: 8px; display: flex; justify-content: space-between; } ${sharedStyles}`;
  const unitTestTemplate = `body { font-family: 'Courier New'; padding: 20px; border: 1px solid #000; margin: 20px; } .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 15px; margin-bottom: 20px; } .school { font-size: 22px; font-weight: bold; } .q-head { font-weight: bold; float: left; margin-right: 10px; } ${sharedStyles}`;
  const finalExamTemplate = `body { font-family: 'Times New Roman'; padding: 50px; } .header { text-align: center; margin-bottom: 30px; } .school { font-size: 28px; font-weight: bold; text-decoration: underline; } .q-head { font-weight: bold; margin-bottom: 8px; } ${sharedStyles}`;

  let selectedCss = simpleTemplate;
  if (template === 'unit_test') selectedCss = unitTestTemplate;
  if (template === 'final_exam') selectedCss = finalExamTemplate;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>${selectedCss}</style>
    </head>
    <body>
      <div class="header">
        <div class="school">${header.schoolName || 'School Name'}</div>
        <div class="meta"><span>${header.examTitle || 'Test'}</span></div>
      </div>
      
      <div class="questions">
        ${questions.map((q) => `
          <div class="q-item">
            <div class="q-head">
              <span>Q${q.id || '?'}.</span>
              <span class="marks">(${q.marks})</span>
            </div>
            <div class="q-text">${processText(q.text)}</div> 
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;
};

// 2. THE FILE SAVER (Wraps the generator)
export const generateExamPDF = async (header: ExamHeader, questions: any[], template: TemplateType = 'simple') => {
  try {
    const html = generateExamHTML(header, questions, template);
    const { uri } = await Print.printToFileAsync({ html });
    await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (error) {
    console.error('PDF Generation Error:', error);
  }
};