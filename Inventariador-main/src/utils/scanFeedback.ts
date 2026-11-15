import { ScanFeedbackMode } from '../types';
import { logger } from './logger';

/**
 * Feedback de leitura do scanner: bip curto (880 Hz) e/ou vibração.
 *
 * Centralizado aqui para que o leitor e o painel de ajustes (botão "Testar")
 * produzam exatamente o mesmo estímulo. Em economia de bateria a vibração é
 * reduzida pela metade.
 *
 * Dois cuidados de plataforma que faziam o estímulo "não funcionar":
 *  - o `AudioContext` nasce SUSPENSO em WebView/iOS e em iframes até haver
 *    gesto; sem `resume()` o oscilador era agendado e nunca soava;
 *  - criar um `AudioContext` por leitura esgota o limite do navegador (depois
 *    de algumas dezenas o áudio morre em silêncio) — por isso ele é único e
 *    reutilizado.
 */
let sharedAudioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  try {
    if (sharedAudioCtx && sharedAudioCtx.state !== 'closed') return sharedAudioCtx;
    const AudioContextClass =
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    sharedAudioCtx = new AudioContextClass();
    return sharedAudioCtx;
  } catch (err) {
    logger.warn('[scanFeedback] AudioContext indisponível:', err);
    return null;
  }
};

const beep = (ctx: AudioContext) => {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
  // Rampa curta evita o "clique" seco e garante que o ganho não fica a zero.
  gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.13);
};

export const playScanFeedback = (
  mode: ScanFeedbackMode = ScanFeedbackMode.BOTH,
  batterySaver = false
): void => {
  try {
    if (mode === ScanFeedbackMode.NONE) return;

    const shouldSound = mode === ScanFeedbackMode.SOUND || mode === ScanFeedbackMode.BOTH;
    const shouldVibrate = mode === ScanFeedbackMode.VIBRATE || mode === ScanFeedbackMode.BOTH;

    if (shouldSound) {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          // Gestos do usuário costumam destravar; se o navegador recusar, o
          // som simplesmente não toca (a vibração, se houver, segue valendo).
          void ctx.resume().then(() => beep(ctx)).catch((err) => {
            logger.warn('[scanFeedback] Áudio bloqueado pelo navegador:', err);
          });
        } else {
          beep(ctx);
        }
      }
    }

    if (shouldVibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      // Sem motor de vibração (desktop, iframe) simplesmente não há o que fazer.
      navigator.vibrate(batterySaver ? 50 : 100);
    }
  } catch (e) {
    logger.error('Feedback failed', e);
  }
};
