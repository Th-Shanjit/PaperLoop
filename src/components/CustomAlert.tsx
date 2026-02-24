import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons?: AlertButton[];
  onClose: () => void;
}

export default function CustomAlert({ visible, title, message, buttons, onClose }: CustomAlertProps) {
  // If no buttons are provided, default to a single "OK" button
  const activeButtons = buttons && buttons.length > 0 ? buttons : [{ text: "OK", onPress: onClose }];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.alertBox}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonRow}>
            {activeButtons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <TouchableOpacity 
                  key={idx} 
                  onPress={() => {
                    onClose(); // Always close the modal when a button is tapped
                    if (btn.onPress) btn.onPress();
                  }}
                  style={[
                    styles.button,
                    isDestructive ? styles.btnDestructive : isCancel ? styles.btnCancel : styles.btnDefault
                  ]}
                >
                  <Text style={[
                    styles.buttonText,
                    isDestructive ? styles.textDestructive : isCancel ? styles.textCancel : styles.textDefault
                  ]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertBox: { backgroundColor: 'white', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8 },
  message: { fontSize: 15, color: '#4B5563', lineHeight: 22, marginBottom: 24 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, minWidth: 80, alignItems: 'center' },
  btnDefault: { backgroundColor: '#2563EB' },
  btnCancel: { backgroundColor: '#F3F4F6' },
  btnDestructive: { backgroundColor: '#FEE2E2' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  textDefault: { color: 'white' },
  textCancel: { color: '#4B5563' },
  textDestructive: { color: '#DC2626' }
});