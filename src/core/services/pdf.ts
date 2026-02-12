import * as FileSystem from 'expo-file-system/legacy';
import { Section, ExamHeader, ExamProject } from './storage';

// Helper to convert base64 images
const processImages = async (sections: Section[]) => {
  return Promise.all(sections.map(async (sec) => {
    const processedQs = await Promise.all(sec.questions.map(async (q) => {
      if (q.diagramUri) {
        try {
          // If it's already a data URI, skip reading
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
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script>document.addEventListener("DOMContentLoaded",()=>{document.body.innerHTML=document.body.innerHTML.replace(/\\\\\\$/g,'$');});</script>
        <script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$']]},svg:{fontCache:'global'},startup:{pageReady:()=>MathJax.startup.defaultPageReady()}};</script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        <style>
          ${fontImport}
          * { box-sizing: border-box; }
          body { padding: 20px; color: #111; max-width: 800px; margin: 0 auto; background: white; }
          
          /* HEADER */
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #111; padding-bottom: 20px; }
          .school-name { font-size: 24px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 1px; }
          .exam-title { font-size: 16px; font-weight: 500; margin-bottom: 15px; color: #444; }
          .meta-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; text-transform: uppercase; }
          .instructions { background: #f8f9fa; padding: 10px; font-size: 11px; margin-bottom: 30px; border-left: 4px solid #111; line-height: 1.5; }
          
          /* LAYOUT */
          .section-container { margin-bottom: 30px; }
          .section-title { font-size: 14px; font-weight: 800; text-transform: uppercase; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
          
          .q-item { break-inside: avoid; page-break-inside: avoid; display: inline-block; width: 100%; margin-bottom: 15px; } 
          .span-all { column-span: all; display: block; margin-bottom: 20px; }
          
          .q-row { display: flex; flex-direction: row; }
          .q-num { width: 30px; font-weight: 800; font-size: 14px; flex-shrink: 0; }
          .q-content { flex: 1; }
          .q-text { white-space: pre-wrap; line-height: 1.5; font-size: 13px; margin-bottom: 8px; }
          .q-marks { width: 30px; text-align: right; font-weight: 700; font-size: 12px; }
          
          /* COMPONENTS */
          .mcq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; }
          .mcq-opt { font-size: 12px; display: flex; align-items: flex-start; }
          .mcq-idx { font-weight: bold; margin-right: 5px; }
          
          .diagram-img { display: block; max-width: 100%; max-height: 200px; margin-top: 5px; border: 1px solid #eee; }
          mjx-container { display: inline-block !important; margin: 0 !important; }
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
             <div style="column-count: ${sec.layout === '2-column' ? 2 : 1}; column-gap: 30px;">
               ${sec.questions.map((q, idx) => `
                  <div class="q-item ${q.isFullWidth ? 'span-all' : ''}">
                    <div class="q-row">
                      <div class="q-num">${idx+1}.</div>
                      <div class="q-content">
                        ${!q.hideText ? `<div class="q-text">${q.text}</div>` : ''}
                        
                        ${q.type === 'mcq' && q.options ? `
                           <div class="mcq-grid">
                             ${q.options.map((opt, i) => `<div class="mcq-opt"><span class="mcq-idx">(${String.fromCharCode(97+i)})</span> ${opt || ''}</div>`).join('')}
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
        
        <div style="margin-top:60px; text-align:center; font-size:9px; color:#aaa; letter-spacing:1px; clear:both;">GENERATED BY PAPERLOOP</div>
      </body>
    </html>
  `;
};