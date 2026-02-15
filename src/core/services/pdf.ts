import * as FileSystem from 'expo-file-system/legacy';
import { Section, ExamHeader } from './storage';

const processImages = async (sections: Section[]) => {
  return Promise.all(sections.map(async (sec) => {
    const processedQs = await Promise.all(sec.questions.map(async (q) => {
      if (q.diagramUri && q.diagramUri !== "NEEDS_CROP") {
        try {
          if (q.diagramUri.startsWith('data:image')) return q;
          const b64 = await FileSystem.readAsStringAsync(q.diagramUri, { encoding: 'base64' });
          return { ...q, imageSrc: `data:image/png;base64,${b64}` };
        } catch (e) { return q; }
      }
      return q;
    }));
    return { ...sec, questions: processedQs };
  }));
};

export const generateExamHtml = async (
  header: ExamHeader, 
  sections: Section[], 
  fontTheme: 'modern' | 'classic' | 'typewriter'
) => {
  
  const processedSections = await processImages(sections);

  const fontImport = fontTheme === 'classic' 
    ? "@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;700&display=swap'); body { font-family: 'Merriweather', serif; }"
    : fontTheme === 'typewriter'
    ? "@import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap'); body { font-family: 'Courier Prime', monospace; }"
    : "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'); body { font-family: 'Inter', sans-serif; }";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
        <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/mhchem.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
        
        <script>
          document.addEventListener("DOMContentLoaded", function() {
            if (typeof renderMathInElement !== 'undefined') {
              renderMathInElement(document.body, {
                delimiters: [
                  {left: '$$', right: '$$', display: true},
                  {left: '$', right: '$', display: false}
                ],
                throwOnError: false, // Prevents crashing on typos
                strict: false
              });
            }
          });
        </script>

        <style>
          ${fontImport}
          * { box-sizing: border-box; }
          @page { size: A4; margin: 15mm; }
          body { color: #111; background: white; font-size: 12pt; line-height: 1.5; margin: 0; padding: 0; }
          .header { text-align: center; margin-bottom: 20pt; border-bottom: 2pt solid #111; padding-bottom: 15pt; }
          .school-name { font-size: 16pt; font-weight: 800; text-transform: uppercase; margin-bottom: 4pt; letter-spacing: 1px; }
          .exam-title { font-size: 14pt; font-weight: 500; margin-bottom: 10pt; color: #444; }
          .meta-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 11pt; text-transform: uppercase; }
          .instructions { background: #f8f9fa; padding: 10pt; font-size: 11pt; margin-bottom: 20pt; border-left: 3pt solid #111; }
          .section-container { margin-bottom: 20pt; }
          .section-title { font-size: 13pt; font-weight: 800; text-transform: uppercase; margin-bottom: 12pt; padding-bottom: 4pt; border-bottom: 1pt solid #ddd; }
          .q-item { break-inside: avoid; page-break-inside: avoid; display: inline-block; width: 100%; margin-bottom: 15pt; } 
          .span-all { column-span: all; display: block; margin-bottom: 15pt; }
          .q-row { display: flex; flex-direction: row; justify-content: space-between; }
          .q-num { width: 25pt; font-weight: 800; font-size: 12pt; flex-shrink: 0; }
          .q-content { flex: 1; padding-right: 10pt; }
          .q-text { white-space: pre-wrap; font-size: 12pt; margin-bottom: 8pt; margin-top: 0; }
          .q-marks { width: 35pt; text-align: right; font-weight: 700; font-size: 11pt; white-space: nowrap; }
          .mcq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-top: 5pt; }
          .mcq-opt { font-size: 12pt; display: flex; align-items: flex-start; }
          .mcq-idx { font-weight: bold; margin-right: 5pt; }
          
          /* CamScanner Effect */
          .diagram-img { 
            display: block; 
            max-width: 100%; 
            max-height: 300px; 
            margin-top: 10pt; 
            border: 1px solid #eee; 
            filter: grayscale(100%) contrast(150%) brightness(110%);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="school-name">${header.schoolName}</div>
          <div class="exam-title">${header.title}</div>
          <div class="meta-row"><span>Duration: ${header.duration}</span><span>Max Marks: ${header.totalMarks}</span></div>
        </div>
        ${header.instructions ? `<div class="instructions"><strong>INSTRUCTIONS:</strong><br/>${header.instructions.replace(/\n/g, '<br/>')}</div>` : ''}
        
        ${processedSections.map(sec => `
          <div class="section-container">
             <div class="section-title">${sec.title}</div>
             <div style="column-count: ${sec.layout === '2-column' ? 2 : 1}; column-gap: 25pt;">
               ${sec.questions.map((q, idx) => `
                  <div class="q-item ${q.isFullWidth ? 'span-all' : ''}">
                    <div class="q-row">
                      <div class="q-num">${idx+1}.</div>
                      <div class="q-content">
                        ${!q.hideText ? `<p class="q-text">${q.text}</p>` : ''}
                        
                        ${q.type === 'mcq' && q.options ? `
                           <div class="mcq-grid">
                             ${q.options.map((opt, i) => `<div class="mcq-opt"><span class="mcq-idx">(${String.fromCharCode(97+i)})</span> <span>${opt || ''}</span></div>`).join('')}
                           </div>
                        ` : ''}

                        ${(q as any).imageSrc ? `<img src="${(q as any).imageSrc}" class="diagram-img" />` : ''}
                      </div>
                      <div class="q-marks">[ ${q.marks} ]</div>
                    </div>
                  </div>
               `).join('')}
             </div>
          </div>
        `).join('')}
        
        <div style="margin-top:40pt; text-align:center; font-size:8pt; color:#aaa; letter-spacing:1px; clear:both;">GENERATED BY PAPERLOOP</div>
      </body>
    </html>
  `;
};