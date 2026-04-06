import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * Custom HTML shell for the Expo Router web build.
 * Adds iOS PWA meta tags so users can install PaperLoop to their
 * iPhone home screen from Safari ("Add to Home Screen") and get a
 * full-screen, native-feeling experience — no App Store required.
 *
 * This file is only used during `expo export -p web` and has no
 * effect on the iOS / Android native builds.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* PWA / iOS home-screen install */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PaperLoop" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0066FF" />

        {/* iOS touch icon shown on the home screen */}
        <link rel="apple-touch-icon" href="/assets/icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/assets/icon.png" />

        <meta
          name="description"
          content="Build, scan, and export professional exam papers"
        />

        {/* Expo Router recommended style reset */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
