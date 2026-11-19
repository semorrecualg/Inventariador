import { ScanFeedbackMode } from '../types';
import { logger } from './logger';

/**
 * Um único AudioContext por sessão, suspenso entre bips.
 *
 * Antes cada bip criava um `AudioContext` novo e nunca o fechava. Com o leitor
 * a descodificar o mesmo código várias vezes por segundo, isso acumulava
 * contextos, mantinha o hardware de áudio acordado e consumia CPU — um dos
 * motivos do aquecimento durante o inventário. O contexto é reutilizado e
 * suspenso assim que o tom termina, devolvendo o dispositivo ao repouso.
 */
let sharedAudioContext: AudioContext | null = null;

const getAudioContext = (AudioContextClass: typeof AudioContext): AudioContext | null => {
  try {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContextClass();
    }
    const ctx = sharedAudioContext;
    if (ctx.state === 'suspended') {
      // Retoma antes de agendar o oscilador; sem gesto do utilizador o
      // navegador pode recusar e o bip simplesmente não toca.
      void ctx.resume().catch(() => {});
    }
    return ctx;
  } catch (e) {
    logger.error('AudioContext creation failed', e);
    return null;
  }
};

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
      const audioCtx = AudioContextClass ? getAudioContext(AudioContextClass) : null;

      if (audioCtx) {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

        oscillator.onended = () => {
          if (audioCtx.state === 'running') {
            void audioCtx.suspend().catch(() => {});
          }
        };

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
