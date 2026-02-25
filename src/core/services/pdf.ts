import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Section, ExamHeader, Question, getAppSettings } from './storage';

// ============================================================
// LATEX-TO-HTML PRE-PROCESSOR
// ============================================================
// expo-print captures the page IMMEDIATELY — it does NOT wait
// for external JS (MathJax/KaTeX) to load from CDN.
// So we convert all LaTeX to native HTML BEFORE building the PDF.
// This uses <sub>, <sup>, and Unicode symbols — zero JS needed.
// ============================================================

/** Convert a single math expression (content between $...$) to HTML */
const processMathExpression = (math: string): string => {
  let r = math.trim();

  // --- Greek Letters ---
  const greekMap: Record<string, string> = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
    '\\theta': 'θ', '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ',
    '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ',
    '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ',
    '\\psi': 'ψ', '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
    '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Phi': 'Φ',
    '\\Psi': 'Ψ', '\\Omega': 'Ω',
  };
  for (const [latex, unicode] of Object.entries(greekMap)) {
    r = r.replace(new RegExp(latex.replace(/\\/g, '\\\\'), 'g'), unicode);
  }

  // --- Math Operators & Symbols ---
  const symbolMap: Record<string, string> = {
    '\\int': '∫', '\\iint': '∬', '\\iiint': '∭',
    '\\sum': '∑', '\\prod': '∏',
    '\\times': '×', '\\div': '÷', '\\cdot': '·',
    '\\pm': '±', '\\mp': '∓',
    '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥',
    '\\neq': '≠', '\\ne': '≠', '\\approx': '≈', '\\equiv': '≡',
    '\\sim': '∼', '\\propto': '∝',
    '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇',
    '\\forall': '∀', '\\exists': '∃',
    '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃',
    '\\cup': '∪', '\\cap': '∩',
    '\\rightarrow': '→', '\\leftarrow': '←',
    '\\Rightarrow': '⇒', '\\Leftarrow': '⇐',
    '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔',
    '\\therefore': '∴', '\\because': '∵',
    '\\angle': '∠', '\\perp': '⊥', '\\parallel': '∥',
    '\\triangle': '△', '\\degree': '°', '\\circ': '°',
    '\\ldots': '…', '\\cdots': '⋯', '\\dots': '…',
    '\\prime': '′',
    '\\to': '→',
    '\\langle': '⟨', '\\rangle': '⟩',
  };
  for (const [latex, unicode] of Object.entries(symbolMap)) {
    r = r.replace(new RegExp(latex.replace(/\\/g, '\\\\'), 'g'), unicode);
  }

  // --- Fractions: \frac{a}{b} → HTML fraction ---
  r = r.replace(
    /\\frac\{([^}]+)\}\{([^}]+)\}/g,
    (_, num, den) =>
      `<span style="display:inline-block;text-align:center;vertical-align:middle;margin:0 2pt;">`
      + `<span style="display:block;border-bottom:1px solid #333;padding:0 3pt;font-size:0.85em;">${num}</span>`
      + `<span style="display:block;padding:0 3pt;font-size:0.85em;">${den}</span></span>`
  );

  // --- Square root: \sqrt{x} → √(x) ---
  r = r.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
  r = r.replace(/\\sqrt\s/g, '√');

  // --- Overline / bar: \overline{AB} → A̅B̅  ---
  r = r.replace(/\\overline\{([^}]+)\}/g, (_, content) => {
    return content.split('').map((c: string) => c + '\u0305').join('');
  });
  r = r.replace(/\\bar\{([^}]+)\}/g, (_, content) => {
    return content.split('').map((c: string) => c + '\u0305').join('');
  });

  // --- Superscripts: ^{...} or ^x ---
  r = r.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
  r = r.replace(/\^(\w)/g, '<sup>$1</sup>');

  // --- Subscripts: _{...} or _x ---
  r = r.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
  r = r.replace(/_(\w)/g, '<sub>$1</sub>');

  // --- Cleanup wrappers ---
  r = r.replace(/\\text\{([^}]+)\}/g, '$1');
  r = r.replace(/\\textbf\{([^}]+)\}/g, '<b>$1</b>');
  r = r.replace(/\\textit\{([^}]+)\}/g, '<i>$1</i>');
  r = r.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  r = r.replace(/\\mathbf\{([^}]+)\}/g, '<b>$1</b>');
  r = r.replace(/\\left/g, '');
  r = r.replace(/\\right/g, '');
  r = r.replace(/\\,/g, ' '); // thin space
  r = r.replace(/\\;/g, ' '); // medium space
  r = r.replace(/\\quad/g, '  ');
  r = r.replace(/\\\\/g, '<br/>'); // line break

  return r;
};

/** Convert \ce{...} chemistry notation to HTML with proper subscripts */
const processChemistry = (formula: string): string => {
  let r = formula;

  // Charges like ^{2+} or ^{-} or ^{3+}
  r = r.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
  r = r.replace(/\^(\d*[+-])/g, '<sup>$1</sup>');

  // Arrow types used in reactions
  r = r.replace(/->/g, ' → ');
  r = r.replace(/<->/g, ' ⇌ ');
  r = r.replace(/<=>/g, ' ⇌ ');

  // Numbers after element symbols become subscripts
  r = r.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>');

  return r;
};

/**
 * MAIN ENTRY: Convert ALL LaTeX in a text string to native HTML.
 * Handles $...$, $$...$$, and \ce{...} blocks.
 */
const latexToHtml = (text: string): string => {
  if (!text) return '';

  let result = text;

  // 1. Chemistry: $\ce{...}$  or  \ce{...}
  result = result.replace(/\$?\\ce\{([^}]+)\}\$?/g, (_, formula) => {
    return processChemistry(formula);
  });

  // 2. Display math: $$...$$  (must come before inline)
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    return `<div style="text-align:center;margin:4pt 0;font-style:italic;">${processMathExpression(math)}</div>`;
  });

  // 3. Inline math: $...$
  result = result.replace(/\$([^$]+?)\$/g, (_, math) => {
    return `<span style="font-style:italic;">${processMathExpression(math)}</span>`;
  });

  return result;
};


// ============================================================
// IMAGE PROCESSOR (with contrast enhancement)
// ============================================================

const DIAGRAM_HEIGHTS: Record<string, string> = {
  'S': '100px',
  'M': '180px',
  'L': '280px',
};

const processImages = async (sections: Section[]) => {
  const result = await Promise.all(sections.map(async (sec) => {
    const processedQs = await Promise.all(sec.questions.map(async (q) => {
      if (q.diagramUri && q.diagramUri !== "NEEDS_CROP") {
        try {
          // Already base64? Return as-is
          if (q.diagramUri.startsWith('data:image')) {
            return q;
          }

          const fileInfo = await FileSystem.getInfoAsync(q.diagramUri);
          if (!fileInfo.exists) {
            return q;
          }

          // --- CRITICAL FIX: Memory footprint reduction ---
          let enhancedUri = q.diagramUri;
          try {
            const enhanced = await ImageManipulator.manipulateAsync(
              q.diagramUri,
              [{ resize: { width: 800 } }], // Reduced from 1200 to 800 to prevent base64 memory crashes
              { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG } // Switched from PNG to JPEG for massive size reduction
            );
            enhancedUri = enhanced.uri;
          } catch (_) {
            // If enhancement fails, use original
          }

          const lowerUri = enhancedUri.toLowerCase();
          const ext = (lowerUri.endsWith('.jpg') || lowerUri.endsWith('.jpeg')) ? 'jpeg' : 'png';

          const b64 = await FileSystem.readAsStringAsync(enhancedUri, { encoding: 'base64' });
          return { ...q, imageSrc: `data:image/${ext};base64,${b64}` };
        } catch (e: any) {
          return q;
        }
      }
      return q;
    }));
    return { ...sec, questions: processedQs };
  }));

  return result;
};


// ============================================================
// HTML GENERATOR
// ============================================================

export const generateExamHtml = async (
  header: ExamHeader,
  sections: Section[],
  fontTheme: 'inter' | 'times' | 'bookman' | 'calibri' | 'arial' | 'garamond' | string
) => {
  // --- ADD THIS BLOCK TO FETCH THE LOGO ---
  const settings = await getAppSettings();
  let logoBase64 = '';
  if (settings?.organizationLogo) {
    try {
      const b64 = await FileSystem.readAsStringAsync(settings.organizationLogo, { encoding: 'base64' });
      // Identify if it's a png or jpeg based on the uri extension
      const ext = settings.organizationLogo.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
      logoBase64 = `data:image/${ext};base64,${b64}`;
    } catch (e) {
      console.warn("Could not load organization logo for PDF");
    }
  }
  // ----------------------------------------

  // Replace your existing formatter with this:
  const formatRichText = (text: string) => {
    if (!text) return "";
    
    // 1. Fix markdown strikethroughs, bolds, and italics (Like WhatsApp!)
    let formatted = text.replace(/~~(.*?)~~/g, '<del>$1</del>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); // **Bold**
    formatted = formatted.replace(/\*(.*?)\*/g, '<i>$1</i>');     // *Italic*
    
    // 2. The LaTeX Rescuer
    formatted = formatted.replace(/\$?\\?ce\\?\{([^}]+)\\?\}\$?/g, '$\\ce{$1}$');
    formatted = formatted.replace(/\\wedge/g, '^');
    formatted = formatted.replace(/\\Lambda/g, '^');

    // ADD THIS: 3. Convert explicit "Enters" (new lines) into HTML line breaks
    formatted = formatted.replace(/\n/g, '<br/>');

    return formatted;
  };

  const processedSections = await processImages(sections);

  const fontImport = 
    fontTheme === 'times' 
    ? "body { font-family: 'Times New Roman', Times, serif; }"
    : fontTheme === 'typewriter'
    ? "body { font-family: 'Courier New', Courier, monospace; }"
    : "body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }"; // The 'Modern' default

  const getColumnCount = (layout: string) => {
    if (layout === '3-column') return 3;
    if (layout === '2-column') return 2;
    return 1;
  };

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          ${fontImport}
          * { box-sizing: border-box; margin: 0; padding: 0; }
          
          /* 1. WIDER MARGINS: Increased from 10mm to 15mm for a professional, framed look */
          @page { size: A4; margin: 15mm; } 
          
          /* 2. BASE TYPOGRAPHY: Better line-height for readability */
          body { color: #111; background: white; font-size: 11pt; line-height: 1.45; }

          /* --- REPLACE .header WITH THIS: --- */
          .header-wrapper { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16pt; border-bottom: 2pt solid #111; padding-bottom: 12pt; }
          .header-logo { width: 60px; max-height: 60px; object-fit: contain; }
          .header-spacer { width: 60px; } /* Balances the flexbox so text stays perfectly centered */
          .header-content { flex: 1; text-align: center; padding: 0 10px; }
          .school-name { font-size: 16pt; font-weight: 800; text-transform: uppercase; margin-bottom: 4pt; letter-spacing: 1px; }
          .exam-title { font-size: 13pt; font-weight: 500; margin-bottom: 6pt; color: #444; }
          .exam-class { font-size: 12pt; font-weight: 600; text-transform: uppercase; margin-bottom: 8pt; color: #555; }
          .meta-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 10.5pt; text-transform: uppercase; }

          .instructions { background: #f8f9fa; padding: 12pt; font-size: 10pt; margin-bottom: 18pt; border-left: 3pt solid #111; line-height: 1.5; }

          .section-container { margin-bottom: 24pt; }
          .section-title { font-size: 13pt; font-weight: 800; text-transform: uppercase; margin-bottom: 10pt; padding-bottom: 4pt; }
          .section-title-divider { border-top: 2pt solid #111; padding-top: 16pt; margin-top: 16pt; }

          /* 3. QUESTION SPACING: Doubled the bottom margin from 8pt to 16pt so questions are clearly separated */
          .q-item { break-inside: avoid; page-break-inside: avoid; display: inline-block; width: 100%; margin-bottom: 16pt; }
          .span-all { column-span: all; display: block; margin-bottom: 16pt; }
          .q-row { display: flex; flex-direction: row; }
          
          /* 4. NUMBER COLUMN FIX: Remove fixed width so long sub-numbers like 1(b)(i) don't break margins */
          .q-num { min-width: 38pt; width: auto; padding-right: 8pt; font-weight: 800; font-size: 11.5pt; flex-shrink: 0; }
          
          .q-content { flex: 1; padding-right: 10pt; }
          .q-text { white-space: pre-wrap; font-size: 11.5pt; margin-bottom: 6pt; margin-top: 0; }
          .q-marks { min-width: 40pt; text-align: right; font-weight: 700; font-size: 10.5pt; white-space: nowrap; flex-shrink: 0; }

          /* 5. MCQ SPACING: Added more gap between grid items so options don't clump together */
          .mcq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 14pt; margin-top: 6pt; }
          .mcq-opt { font-size: 11pt; display: flex; align-items: flex-start; }
          .mcq-idx { font-weight: bold; margin-right: 6pt; }

          .diagram-wrapper { background: white; padding: 2pt; margin-top: 8pt; margin-bottom: 4pt; }
          .diagram-img { display: block; max-width: 100%; max-height: 200px; object-fit: contain; /* THE CAMSCANNER EFFECT: Black & White, High Contrast, Brighter Background */ filter: grayscale(100%) contrast(160%) brightness(110%); }

          sup { font-size: 0.75em; vertical-align: super; }
          sub { font-size: 0.75em; vertical-align: sub; }
          del { text-decoration: line-through; }

          .footer { margin-top: 30pt; text-align: center; font-size: 8pt; color: #aaa; letter-spacing: 1px; clear: both; }
        </style>
      </head>
      <body>
        <div class="header-wrapper">
          ${logoBase64 ? `<img src="${logoBase64}" class="header-logo" />` : `<div class="header-spacer"></div>`}
          
          <div class="header-content">
            <div class="school-name">${latexToHtml(header.schoolName)}</div>
            <div class="exam-title">${latexToHtml(header.title)}</div>
            ${header.className ? `<div class="exam-class">${latexToHtml(header.className)}</div>` : ''}
            <div class="meta-row">
              <span>Duration: ${header.duration}</span>
              <span>Max Marks: ${header.totalMarks}</span>
            </div>
          </div>
          
          <div class="header-spacer"></div> 
        </div>

        ${header.instructions ? `<div class="instructions"><strong>INSTRUCTIONS:</strong><br/>${latexToHtml(header.instructions).replace(/\n/g, '<br/>')}</div>` : ''}

        ${processedSections.map(sec => {
          // Filter out empty questions (no text, no diagram)
          const visibleQs = sec.questions.filter(q => 
            (q.text && q.text.trim() !== '' && q.text !== 'New Question...') || 
            (q as any).imageSrc || 
            (q.diagramUri && q.diagramUri !== 'NEEDS_CROP')
          );
          if (visibleQs.length === 0) return '';
          return `
          <div class="section-container">
            <div class="section-title ${sec.showDivider ? 'section-title-divider' : ''}">${latexToHtml(sec.title)}</div>
            <div style="column-count: ${getColumnCount(sec.layout)}; column-gap: 20pt;">
              ${visibleQs.map((q, idx) => {
                const sizeKey = (q as any).diagramSize || 'M';
                const imgHeight = DIAGRAM_HEIGHTS[sizeKey] || '180px';
                const marksStr = q.marks && q.marks.trim() !== '' && q.marks !== '0' ? `[ ${q.marks} ]` : '';
                const qNum = q.number && q.number.trim() !== '' ? q.number : (idx + 1).toString();
                
                // CRITICAL FIX: Render 'instruction' types as subheadings without numbers or marks
                if (q.type === 'instruction') {
                  return `
                    <div class="span-all" style="font-weight: 800; font-size: 11.5pt; margin-top: 12pt; margin-bottom: 8pt; color: #111;">
                      ${latexToHtml(formatRichText(q.text))}
                    </div>
                  `;
                }

                return `
                <div class="q-item ${q.isFullWidth ? 'span-all' : ''}">
                  <div class="q-row">
                    <div class="q-num">${qNum}.</div>
                    <div class="q-content">
                      ${!q.hideText && q.text && q.text.trim() !== '' ? `<p class="q-text">${latexToHtml(formatRichText(q.text))}</p>` : ''}

                      ${q.type === 'mcq' && q.options ? `
                        <div class="mcq-grid">
                         ${q.options.filter(o => o && o.trim() !== '').map((opt, i) => `<div class="mcq-opt"><span class="mcq-idx">(${String.fromCharCode(97 + i)})</span> <span>${latexToHtml(formatRichText(opt))}</span></div>`).join('')}
                        </div>
                      ` : ''}

                      ${(q as any).imageSrc ? `<div class="diagram-wrapper"><img src="${(q as any).imageSrc}" class="diagram-img" style="max-height:${imgHeight};" /></div>` : ''}
                    </div>
                    ${marksStr ? `<div class="q-marks">${marksStr}</div>` : ''}
                  </div>
                </div>
              `}).join('')}
            </div>
          </div>
        `}).join('')}

        <div class="footer">GENERATED BY PAPERLOOP</div>
      </body>
    </html>
  `;
};
