#!/usr/bin/env node
/**
 * Post-export script: injects iOS PWA meta tags into dist/index.html.
 *
 * Run automatically after `expo export -p web` via the `build:web` script.
 * These tags make Safari on iPhone offer "Add to Home Screen" and then
 * launch the app full-screen with no browser chrome.
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('dist/index.html not found. Run `expo export -p web` first.');
  process.exit(1);
}

const appleTags = `
    <!-- iOS PWA: Add to Home Screen support -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="PaperLoop" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="apple-touch-icon" href="/assets/icon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/icon.png" />`;

// Fix viewport to include viewport-fit=cover (safe area insets on iPhone X+)
const viewportFix = 'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover';

let html = fs.readFileSync(htmlPath, 'utf8');

// Only patch once (idempotent)
if (html.includes('apple-mobile-web-app-capable')) {
  console.log('PWA tags already present — skipping.');
  process.exit(0);
}

// Insert Apple tags just before </head>
html = html.replace('</head>', `${appleTags}\n  </head>`);

// Fix viewport
html = html.replace(
  /width=device-width,\s*initial-scale=1,\s*shrink-to-fit=no/,
  viewportFix,
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✓ PWA meta tags injected into dist/index.html');
