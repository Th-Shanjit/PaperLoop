import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SLIDES = [
  {
    icon: 'document-text',
    title: 'Welcome to PaperLoop',
    desc: 'Turn messy handwritten question papers into perfectly formatted, printable PDFs in seconds.'
  },
  {
    icon: 'scan',
    title: 'AI-Powered Scanning',
    desc: 'Our AI reads handwriting, auto-crops diagrams, and automatically formats multiple-choice questions.'
  },
  {
    icon: 'gift',
    title: 'Here are 3 Free Scans!',
    desc: 'Try it out completely free. Hit the camera button on the dashboard to start your first scan.'
  }
];

export default function OnboardingModal({ visible, onFinish }: { visible: boolean, onFinish: () => void }) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < SLIDES.length - 1) {
      setStep(step + 1);
    } else {
      onFinish();
    }
  };

  const currentSlide = SLIDES[step];

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconRing}>
            <Ionicons name={currentSlide.icon as any} size={64} color="#2563EB" />
          </View>
          <Text style={styles.title}>{currentSlide.title}</Text>
          <Text style={styles.desc}>{currentSlide.desc}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, step === i && styles.activeDot]} />
            ))}
          </View>
          <TouchableOpacity onPress={handleNext} style={styles.button}>
            <Text style={styles.buttonText}>{step === SLIDES.length - 1 ? "Get Started" : "Next"}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  iconRing: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 16 },
  desc: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24 },
  footer: { padding: 32, paddingBottom: 48 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5E7EB' },
  activeDot: { backgroundColor: '#2563EB', width: 24 },
  button: { backgroundColor: '#2563EB', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: '700' }
});
