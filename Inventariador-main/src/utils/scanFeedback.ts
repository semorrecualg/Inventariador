import { ScanFeedbackMode } from '../types';
import { logger } from './logger';

/**
 * Feedback de leitura do scanner: bip curto (880 Hz) e/ou vibração.
 *
 * Centralizado aqui para que o leitor e o painel de ajustes (botão "Testar")
 * produzam exatamente o mesmo estímulo. Em economia de bateria a vibração é
 * reduzida pela metade.
 */
export const playScanFeedback = (
  mode: ScanFeedbackMode = ScanFeedbackMode.BOTH,
  batterySaver = false
): void => {
  try {
    if (mode === ScanFeedbackMode.NONE) return;

    const shouldSound = mode === ScanFeedbackMode.SOUND || mode === ScanFeedbackMode.BOTH;
    const shouldVibrate = mode === ScanFeedbackMode.VIBRATE || mode === ScanFeedbackMode.BOTH;

    if (shouldSound) {
      const AudioContextClass =
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
      }
    }

    if (shouldVibrate && navigator.vibrate) {
      navigator.vibrate(batterySaver ? 50 : 100);
    }
  } catch (e) {
    logger.error('Feedback failed', e);
  }
};
