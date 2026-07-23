
import localforage from 'localforage';
import { logger } from '../utils/logger';

const BIOMETRIC_STORE = 'gbr_biometric_credentials';

// Configura o store local para biometria
const bioStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: BIOMETRIC_STORE
});

export const isBiometricSupported = async (): Promise<boolean> => {
  if (!(window.PublicKeyCredential && 
        window.crypto && 
        window.crypto.subtle)) {
    return false;
  }
  
  try {
    // Verifica se o autenticador de plataforma (biometria do dispositivo) está disponível
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    logger.error('[Biometric] Erro ao verificar suporte:', err);
    return false;
  }
};

/**
 * Registra a biometria para um usuário específico (Offline/Internal)
 */
export const registerBiometric = async (username: string): Promise<boolean> => {
  logger.info('[Biometric] Iniciando registro para:', username);
  if (!isBiometricSupported()) {
    logger.warn('[Biometric] Não suportado pelo navegador');
    return false;
  }

  try {
    const challenge = window.crypto.getRandomValues(new Uint8Array(32));
    const userId = window.crypto.getRandomValues(new Uint8Array(16));

    const createOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: "GBR Auditoria",
        id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
      },
      user: {
        id: userId,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      timeout: 60000,
      attestation: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Força Biometria do dispositivo (TouchID/FaceID)
        userVerification: "required",
        residentKey: "required",
      },
    };

    const credential = await navigator.credentials.create({
      publicKey: createOptions,
    }) as PublicKeyCredential;

    if (credential) {
      // Salva a referência da credencial localmente vinculada ao usuário
      await bioStore.setItem(username, {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
      });
      return true;
    }
    return false;
  } catch (err) {
    logger.error('[Biometric] Erro ao registrar:', err);
    return false;
  }
};

/**
 * Autentica o usuário via biometria
 */
export const authenticateBiometric = async (username: string): Promise<boolean> => {
  if (!isBiometricSupported()) return false;

  try {
    const savedCred = await bioStore.getItem(username) as { rawId: number[] } | null;
    if (!savedCred) return false;

    const challenge = window.crypto.getRandomValues(new Uint8Array(32));

    const getOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: [
        {
          id: new Uint8Array(savedCred.rawId).buffer,
          type: "public-key",
        },
      ],
    };

    const assertion = await navigator.credentials.get({
      publicKey: getOptions,
    });

    return !!assertion;
  } catch (err) {
    logger.error('[Biometric] Erro ao autenticar:', err);
    return false;
  }
};

/**
 * Verifica se o usuário já tem biometria cadastrada neste dispositivo
 */
export const hasBiometricRegistered = async (username: string): Promise<boolean> => {
  const cred = await bioStore.getItem(username);
  return !!cred;
};

/**
 * Remove a biometria do usuário
 */
export const removeBiometric = async (username: string): Promise<void> => {
  await bioStore.removeItem(username);
};
