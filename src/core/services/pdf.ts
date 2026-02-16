import * as FileSystem from 'expo-file-system/legacy';
import { Section, ExamHeader } from './storage';

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
    // Escape the backslash for regex
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
  // Match: letter(s) followed by digit(s), or closing-paren followed by digit(s)
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
    return `<div style="text-align:center;margin:6pt 0;font-style:italic;">${processMathExpression(math)}</div>`;
  });

  // 3. Inline math: $...$
  result = result.replace(/\$([^$]+?)\$/g, (_, math) => {
    return `<span style="font-style:italic;">${processMathExpression(math)}</span>`;
  });

  return result;
};


// ============================================================
// IMAGE PROCESSOR
// ============================================================

const processImages = async (sections: Section[]) => {
  return Promise.all(sections.map(async (sec) => {
    const processedQs = await Promise.all(sec.questions.map(async (q) => {
      if (q.diagramUri && q.diagramUri !== "NEEDS_CROP") {
        try {
          if (q.diagramUri.startsWith('data:image')) return q;

          console.log("📸 Processing image:", q.diagramUri);

          const fileInfo = await FileSystem.getInfoAsync(q.diagramUri);
          if (!fileInfo.exists) {
            console.error("❌ Image file not found:", q.diagramUri);
            return q;
          }

          const lowerUri = q.diagramUri.toLowerCase();
          const ext = (lowerUri.endsWith('.jpg') || lowerUri.endsWith('.jpeg')) ? 'jpeg' : 'png';

          const b64 = await FileSystem.readAsStringAsync(q.diagramUri, { encoding: 'base64' });
          console.log("✅ Base64 encoded, length:", b64.length);

          return { ...q, imageSrc: `data:image/${ext};base64,${b64}` };
        } catch (e) {
          console.error("❌ Image encode failed:", e);
          return q;
        }
      }
      return q;
    }));
    return { ...sec, questions: processedQs };
  }));
};


// ============================================================
// HTML GENERATOR
// ============================================================

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
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          ${fontImport}
          * { box-sizing: border-box; }
          @page { size: A4; margin: 15mm; }
          body { color: #111; background: white; font-size: 12pt; line-height: 1.6; margin: 0; padding: 0; }

          .header { text-align: center; margin-bottom: 20pt; border-bottom: 2pt solid #111; padding-bottom: 15pt; }
          .school-name { font-size: 16pt; font-weight: 800; text-transform: uppercase; margin-bottom: 4pt; letter-spacing: 1px; }
          .exam-title { font-size: 14pt; font-weight: 500; margin-bottom: 10pt; color: #444; }
          .meta-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 11pt; text-transform: uppercase; }

          .instructions { background: #f8f9fa; padding: 10pt; font-size: 11pt; margin-bottom: 20pt; border-left: 3pt solid #111; line-height: 1.6; }

          .section-container { margin-bottom: 20pt; }
          .section-title { font-size: 13pt; font-weight: 800; text-transform: uppercase; margin-bottom: 12pt; padding-bottom: 4pt; border-bottom: 1pt solid #ddd; }

          .q-item { break-inside: avoid; page-break-inside: avoid; display: inline-block; width: 100%; margin-bottom: 15pt; }
          .span-all { column-span: all; display: block; margin-bottom: 15pt; }
          .q-row { display: flex; flex-direction: row; }
          .q-num { width: 25pt; font-weight: 800; font-size: 12pt; flex-shrink: 0; }
          .q-content { flex: 1; padding-right: 5pt; }
          .q-text { white-space: pre-wrap; font-size: 12pt; margin-bottom: 8pt; margin-top: 0; }
          .q-marks { min-width: 50pt; text-align: right; font-weight: 700; font-size: 11pt; white-space: nowrap; flex-shrink: 0; }

          .mcq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-top: 5pt; }
          .mcq-opt { font-size: 12pt; display: flex; align-items: flex-start; }
          .mcq-idx { font-weight: bold; margin-right: 5pt; }

          .diagram-img {
            display: block;
            max-width: 100%;
            max-height: 250px;
            margin-top: 5pt;
            border: 1px solid #eee;
            object-fit: contain;
          }

          sup { font-size: 0.75em; vertical-align: super; }
          sub { font-size: 0.75em; vertical-align: sub; }

          .footer { margin-top: 40pt; text-align: center; font-size: 8pt; color: #aaa; letter-spacing: 1px; clear: both; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="school-name">${latexToHtml(header.schoolName)}</div>
          <div class="exam-title">${latexToHtml(header.title)}</div>
          <div class="meta-row">
            <span>Duration: ${header.duration}</span>
            <span>Max Marks: ${header.totalMarks}</span>
          </div>
        </div>

        ${header.instructions ? `<div class="instructions"><strong>INSTRUCTIONS:</strong><br/>${latexToHtml(header.instructions).replace(/\n/g, '<br/>')}</div>` : ''}

        ${processedSections.map(sec => `
          <div class="section-container">
            <div class="section-title">${latexToHtml(sec.title)}</div>
            <div style="column-count: ${sec.layout === '2-column' ? 2 : 1}; column-gap: 25pt;">
              ${sec.questions.map((q, idx) => `
                <div class="q-item ${q.isFullWidth ? 'span-all' : ''}">
                  <div class="q-row">
                    <div class="q-num">${idx + 1}.</div>
                    <div class="q-content">
                      ${!q.hideText ? `<p class="q-text">${latexToHtml(q.text)}</p>` : ''}

                      ${q.type === 'mcq' && q.options ? `
                        <div class="mcq-grid">
                          ${q.options.map((opt, i) => `<div class="mcq-opt"><span class="mcq-idx">(${String.fromCharCode(97 + i)})</span> <span>${latexToHtml(opt || '')}</span></div>`).join('')}
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

        <div class="footer">GENERATED BY PAPERLOOP</div>
      </body>
    </html>
  `;
};
