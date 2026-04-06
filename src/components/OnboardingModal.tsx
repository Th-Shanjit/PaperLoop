import React, { useState, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// --- SLIDE ILLUSTRATIONS ---
// Each one is a small mock-UI built from shapes + icons to visually represent the step.

const WelcomeIllustration = () => (
  <View style={illStyles.container}>
    <View style={[illStyles.bigCircle, { backgroundColor: colors.primary.normal }]}>
      <Ionicons name="document-text" size={56} color="white" />
    </View>
    <View style={illStyles.floatBadge1}>
      <Ionicons name="camera" size={14} color="#2563EB" />
      <Text style={illStyles.floatBadgeText}>Scan</Text>
    </View>
    <View style={illStyles.floatBadge2}>
      <Ionicons name="share" size={14} color="#16A34A" />
      <Text style={[illStyles.floatBadgeText, { color: colors.status.positive }]}>Export</Text>
    </View>
    <View style={illStyles.floatBadge3}>
      <Ionicons name="create" size={14} color="#7C3AED" />
      <Text style={[illStyles.floatBadgeText, { color: '#7C3AED' }]}>Edit</Text>
    </View>
  </View>
);

const ScanIllustration = () => (
  <View style={illStyles.container}>
    {/* Mock dashboard cards */}
    <View style={illStyles.mockCard}>
      <View style={[illStyles.mockCardInner, { backgroundColor: colors.primary.normal, flex: 2 }]}>
        <Ionicons name="camera" size={22} color="white" />
        <Text style={{ color: colors.background.normal, fontWeight: '800', fontSize: 13, marginTop: 6 }}>New Scan</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>AI paper to PDF</Text>
      </View>
      <View style={[illStyles.mockCardInner, { backgroundColor: colors.background.normal, borderWidth: 1, borderColor: colors.line.normal, flex: 1, gap: 4 }]}>
        <Ionicons name="document-text" size={18} color="#4B5563" />
        <Text style={{ color: colors.label.alternative, fontWeight: '700', fontSize: 11 }}>Blank</Text>
      </View>
    </View>
    <View style={illStyles.tipArrow}>
      <Ionicons name="arrow-up" size={20} color="#2563EB" />
    </View>
    <Text style={illStyles.tapHint}>Tap here to start</Text>
  </View>
);

const WorkspaceIllustration = () => (
  <View style={illStyles.container}>
    {/* Mock page cards */}
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
      {[1, 2, 3].map(n => (
        <View key={n} style={illStyles.pageCard}>
          <View style={{ flex: 1, backgroundColor: colors.line.normal, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="document" size={18} color="#9CA3AF" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <View style={{ backgroundColor: colors.primary.normal, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
              <Text style={{ color: colors.background.normal, fontSize: 9, fontWeight: '700' }}>Pg {n}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <View style={illStyles.miniDot} />
              <View style={[illStyles.miniDot, { backgroundColor: colors.status.negative }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
    {/* Mock analyze bar */}
    <View style={illStyles.analyzeBar}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent.blue.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}>
        <Ionicons name="camera" size={14} color="#2563EB" />
        <Text style={{ color: colors.primary.normal, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>Add Page</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.label.normal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 20, marginLeft: 10, gap: 6 }}>
        <Text style={{ color: colors.background.normal, fontSize: 11, fontWeight: '700' }}>Analyze 3 Pages</Text>
        <Ionicons name="arrow-forward" size={13} color="white" />
      </View>
    </View>
  </View>
);

const EditorIllustration = () => (
  <View style={illStyles.container}>
    {/* Mock question card */}
    <View style={illStyles.qCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ backgroundColor: colors.label.normal, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.background.normal, fontSize: 11, fontWeight: '700' }}>1</Text>
        </View>
        <View style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
          <Text style={{ color: colors.background.normal, fontSize: 9, fontWeight: '800' }}>MCQ</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {['↑', '↓', '🗑'].map((t, i) => (
            <View key={i} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i === 2 ? '#FEE2E2' : colors.background.alternative, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 10 }}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ backgroundColor: '#F9FAFB', borderRadius: 6, padding: 8, marginBottom: 8 }}>
        <Text style={{ fontSize: 11, color: colors.label.alternative }}>Which gas is produced during photosynthesis?</Text>
      </View>
      {/* MCQ options */}
      {['A  Oxygen', 'B  Carbon dioxide'].map((opt, i) => (
        <View key={i} style={{ backgroundColor: '#F9FAFB', borderRadius: 6, padding: 6, marginBottom: 4, flexDirection: 'row' }}>
          <Text style={{ fontSize: 10, color: colors.label.alternative }}>{opt}</Text>
        </View>
      ))}
      {/* Format toolbar */}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {['B', 'I', '___', '\\ce{}'].map((btn, i) => (
          <View key={i} style={{ backgroundColor: '#F9FAFB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: colors.line.normal }}>
            <Text style={{ fontSize: 10, color: colors.label.alternative, fontWeight: '700' }}>{btn}</Text>
          </View>
        ))}
      </View>
    </View>
  </View>
);

const ExportIllustration = () => (
  <View style={illStyles.container}>
    {/* Mock export modal */}
    <View style={[illStyles.qCard, { width: '90%', alignItems: 'center' }]}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.label.normal, marginBottom: 4 }}>Export PDF</Text>
      <Text style={{ fontSize: 11, color: colors.label.alternative, marginBottom: 16 }}>Choose how to save your exam</Text>
      <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
        {[
          { icon: 'download', label: 'Download', sub: 'Save to device' },
          { icon: 'share-social', label: 'Share', sub: 'Send via apps' }
        ].map((btn) => (
          <View key={btn.label} style={{ flex: 1, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line.normal }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent.blue.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons name={btn.icon as any} size={18} color="#2563EB" />
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.label.normal }}>{btn.label}</Text>
            <Text style={{ fontSize: 9, color: colors.label.alternative }}>{btn.sub}</Text>
          </View>
        ))}
      </View>
    </View>
    {/* Bottom bar hint */}
    <View style={{ flexDirection: 'row', marginTop: 12, backgroundColor: colors.background.normal, borderRadius: 16, padding: 8, gap: 8, borderWidth: 1, borderColor: colors.line.normal }}>
      <Ionicons name="save-outline" size={18} color="#4B5563" />
      <View style={{ flex: 1, backgroundColor: colors.primary.normal, borderRadius: 14, alignItems: 'center', paddingVertical: 6 }}>
        <Text style={{ color: colors.background.normal, fontSize: 11, fontWeight: '700' }}>Add Question</Text>
      </View>
      <Ionicons name="share-outline" size={18} color="#4B5563" />
    </View>
    <View style={illStyles.tipArrow}>
      <Ionicons name="arrow-up" size={18} color="#2563EB" />
    </View>
    <Text style={illStyles.tapHint}>Tap Export</Text>
  </View>
);

const TokensIllustration = () => (
  <View style={illStyles.container}>
    {/* Token balance card */}
    <View style={[illStyles.qCard, { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FEF3C7', width: '90%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.5 }}>Available Scans</Text>
        <Text style={{ fontSize: 36, fontWeight: '900', color: '#92400E' }}>3</Text>
      </View>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="sparkles" size={24} color="#F59E0B" />
      </View>
    </View>

    <Text style={{ fontSize: 12, color: colors.label.alternative, marginTop: 12, marginBottom: 10, textAlign: 'center' }}>Need more? Buy in Settings:</Text>

    {/* Store buttons */}
    <View style={{ flexDirection: 'row', gap: 10, width: '90%' }}>
      <View style={{ flex: 1, backgroundColor: colors.background.normal, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line.normal }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.label.normal }}>10 Scans</Text>
        <Text style={{ fontSize: 18, fontWeight: '900', color: colors.label.normal, marginTop: 4 }}>₹99</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.primary.normal, borderRadius: 12, padding: 12, alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: -10, backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: '900', color: colors.background.normal }}>BEST VALUE</Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.background.normal, marginTop: 6 }}>50 Scans</Text>
        <Text style={{ fontSize: 18, fontWeight: '900', color: colors.background.normal, marginTop: 4 }}>₹399</Text>
      </View>
    </View>
  </View>
);

// --- SLIDE DATA ---
const SLIDES = [
  {
    bg: colors.accent.blue.bg,
    accentColor: colors.primary.normal,
    stepLabel: '',
    title: 'Welcome to PaperLoop',
    desc: 'Turn messy handwritten question papers into perfectly formatted, printable PDFs in seconds.',
    tip: null,
    Illustration: WelcomeIllustration,
  },
  {
    bg: '#F0F9FF',
    accentColor: '#0369A1',
    stepLabel: 'Step 1 of 4',
    title: 'Scan Your Paper',
    desc: 'Tap "New Scan" on the dashboard, photograph your question pages one by one, then add as many as you need.',
    tip: 'TIP: You can also pick existing photos from your gallery.',
    Illustration: ScanIllustration,
  },
  {
    bg: '#F0FDF4',
    accentColor: '#16A34A',
    stepLabel: 'Step 2 of 4',
    title: 'Review in Workspace',
    desc: 'Check your scanned pages. Reorder them, rotate any that are sideways, then tap Analyze to let the AI read them.',
    tip: 'TIP: Each page uses 1 scan token. You can remove bad pages before analyzing — it\'s free.',
    Illustration: WorkspaceIllustration,
  },
  {
    bg: '#FAF5FF',
    accentColor: '#7C3AED',
    stepLabel: 'Step 3 of 4',
    title: 'Edit in the Editor',
    desc: 'The AI extracts every question automatically. Fix any reading errors, switch between Text/MCQ/Instruction types, and style your layout.',
    tip: 'TIP: Tap the book icon in the editor navbar to see the full formatting guide.',
    Illustration: EditorIllustration,
  },
  {
    bg: '#FFF7ED',
    accentColor: '#EA580C',
    stepLabel: 'Step 4 of 4',
    title: 'Export Your PDF',
    desc: 'Tap Export in the bottom bar to generate a polished PDF. Download it directly to your device or share it via WhatsApp, email, or print.',
    tip: null,
    Illustration: ExportIllustration,
  },
  {
    bg: '#FFFBEB',
    accentColor: '#B45309',
    stepLabel: "You're all set!",
    title: '3 Free Scans Inside',
    desc: 'You start with 3 free scans on us. When you need more, buy scan packs at any time from the Settings screen.',
    tip: null,
    Illustration: TokensIllustration,
  },
];

export default function OnboardingModal({ visible, onFinish }: { visible: boolean; onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const goToNext = () => {
    if (step < SLIDES.length - 1) {
      Animated.sequence([
        Animated.timing(slideAnim, { toValue: -30, duration: 120, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]).start();
      setStep(s => s + 1);
    } else {
      onFinish();
    }
  };

  const goToPrev = () => {
    if (step > 0) {
      setStep(s => s - 1);
    }
  };

  const current = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: current.bg }]}>
        <SafeAreaView style={{ flex: 1 }}>

          {/* Skip button */}
          <View style={styles.topRow}>
            <View style={{ width: 60 }} />
            <View style={styles.dotsRow}>
              {SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === step && styles.dotActive,
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity onPress={onFinish} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Illustration area */}
          <Animated.View style={[styles.illustrationArea, { transform: [{ translateX: slideAnim }] }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: current.accentColor, opacity: 0.06 }]} />
            <current.Illustration />
          </Animated.View>

          {/* Text content */}
          <View style={[styles.textCard, { paddingBottom: insets.bottom + 24 }]}>
            {current.stepLabel ? (
              <Text style={styles.stepLabel}>{current.stepLabel}</Text>
            ) : null}
            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.desc}>{current.desc}</Text>

            {current.tip && (
              <View style={[styles.tipBox, { borderLeftColor: current.accentColor }]}>
                <Text style={[styles.tipText, { color: current.accentColor }]}>{current.tip}</Text>
              </View>
            )}

            {/* Navigation */}
            <View style={styles.navRow}>
              {step > 0 ? (
                <TouchableOpacity onPress={goToPrev} style={styles.prevBtn}>
                  <Ionicons name="arrow-back" size={20} color="#6B7280" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 44 }} />
              )}

              <TouchableOpacity
                onPress={goToNext}
                style={[styles.nextBtn, { backgroundColor: colors.primary.normal }]}
              >
                <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
                {!isLast && <Ionicons name="arrow-forward" size={18} color="white" style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            </View>
          </View>

        </SafeAreaView>
      </View>
    </Modal>
  );
}

const illStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  bigCircle: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center' },
  floatBadge1: {
    position: 'absolute', top: '15%', right: '8%',
    backgroundColor: colors.background.normal, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  floatBadge2: {
    position: 'absolute', bottom: '15%', right: '5%',
    backgroundColor: colors.background.normal, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  floatBadge3: {
    position: 'absolute', bottom: '20%', left: '5%',
    backgroundColor: colors.background.normal, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  floatBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary.normal },
  mockCard: { flexDirection: 'row', gap: 10, width: '85%', marginBottom: 12 },
  mockCardInner: { borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center' },
  tipArrow: { marginTop: 6 },
  tapHint: { fontSize: 11, color: colors.label.alternative, fontWeight: '600', marginTop: 2 },
  pageCard: { width: 70, height: 90, backgroundColor: colors.background.normal, borderRadius: 8, padding: 6, shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  miniDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.label.alternative },
  analyzeBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.normal, padding: 8, borderRadius: 24, width: '85%', shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  qCard: { backgroundColor: colors.background.normal, borderRadius: 14, padding: 14, width: '90%', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  dotsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.line.normal },
  dotActive: { width: 22, height: 7, borderRadius: 3.5, backgroundColor: colors.primary.normal },
  skipBtn: { paddingHorizontal: 8, paddingVertical: 4, width: 60, alignItems: 'flex-end' },
  skipText: { fontSize: 14, fontWeight: '600', color: colors.label.alternative },

  illustrationArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  textCard: {
    backgroundColor: colors.background.normal,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 28,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },
  stepLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, color: colors.primary.normal },
  title: { fontSize: 26, fontWeight: '900', color: colors.label.normal, marginBottom: 10, lineHeight: 32 },
  desc: { fontSize: 15, color: colors.label.alternative, lineHeight: 23, marginBottom: 16 },
  tipBox: {
    borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 6,
    backgroundColor: 'transparent', marginBottom: 20,
  },
  tipText: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
  prevBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fill.normal,
    justifyContent: 'center', alignItems: 'center',
  },
  nextBtn: {
    flex: 1, marginLeft: 12, height: 52, borderRadius: 26,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  nextBtnText: { color: colors.background.normal, fontSize: 16, fontWeight: '800' },
});
