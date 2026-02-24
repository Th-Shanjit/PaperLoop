import { useState, useCallback } from 'react';
import { AlertButton } from '../components/CustomAlert';

export function useCustomAlert() {
  const [alertState, setAlertState] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [] as AlertButton[]
  });

  const showAlert = useCallback((title: string, message: string, buttons?: AlertButton[]) => {
    setAlertState({ visible: true, title, message, buttons: buttons || [] });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState(prev => ({ ...prev, visible: false }));
  }, []);

  return { alertState, showAlert, closeAlert };
}