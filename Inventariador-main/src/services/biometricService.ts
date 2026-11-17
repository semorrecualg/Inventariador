import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import {
  BiometricAuth,
  BiometryError,
  BiometryType
} from '@aparajita/capacitor-biometric-auth';
import { logger } from '../utils/logger';
import type { BiometryStatus } from '../utils/biometricPolicy';

const BIOMETRIC_STORE = 'gbr_biometric_credentials';

// Configura o store local para biometria
const bioStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: BIOMETRIC_STORE
});

/**
 * Credencial guardada neste aparelho. `method` distingue as duas origens:
 * `native` (plugin no casco Capacitor) e `webauthn` (navegador). Credenciais
 * antigas não têm `method` e contam como WebAuthn.
 */
interface StoredCredential {
  method?: 'native' | 'webauthn';
  biometryType?: string;
  registeredAt?: string;
  id?: string;
  rawId?: number[];
  type?: string;
}

/**
 * Casco nativo (Capacitor/WebView). Desde a Fase 2b a biometria de plataforma
 * é verificada pelo plugin nativo; fora do casco continua a ser o WebAuthn.
 */
export const isNativeAppShell = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch (err) {
    logger.warn('[Biometric] Falha ao detetar o casco nativo:', err);
    return false;
  }
};

/** Resultado do `checkBiometry()` do plugin, já normalizado para a política. */
export interface NativeBiometryFacts {
  status: BiometryStatus;
  biometryType?: string;
  detail?: string;
}

const describeError = (err: unknown): string => {
  if (err instanceof BiometryError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
};

/**
 * Pergunta ao plugin nativo o que o aparelho pode verificar.
 *
 * `available`   — há biometria registada (o cadastro/login nativo é possível);
 * `unavailable` — o sistema respondeu que não há biometria utilizável;
 * `unknown`     — fora do casco ou o plugin falhou: a política cai no fallback
 *                 declarado (`webview-without-webauthn`) em vez de arriscar.
 */
export const checkNativeBiometry = async (): Promise<NativeBiometryFacts> => {
  if (!isNativeAppShell()) {
    return { status: 'unknown', detail: 'fora do casco nativo' };
  }

  try {
    const info = await BiometricAuth.checkBiometry();
    const biometryType =
      BiometryType[info?.biometryType as BiometryType] ?? String(info?.biometryType ?? '');

    if (info?.isAvailable) {
      return { status: 'available', biometryType };
    }

    return {
      status: 'unavailable',
      biometryType,
      detail: info?.reason || info?.code || 'biometria indisponível'
    };
  } catch (err) {
    logger.warn('[Biometric] Plugin nativo indisponível:', err);
    return { status: 'unknown', detail: describeError(err) };
  }
};

export const isBiometricSupported = async (): Promise<boolean> => {
  if (isNativeAppShell()) {
    const facts = await checkNativeBiometry();
    return facts.status === 'available';
  }

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

  // Casco nativo (Fase 2b): o WebView não expõe o autenticador ao WebAuthn, por
  // isso o cadastro passa pelo plugin — que apresenta o prompt do sistema e só
  // deixa gravar a marca local depois da confirmação do utilizador.
  if (isNativeAppShell()) {
    const facts = await checkNativeBiometry();
    if (facts.status !== 'available') {
      logger.warn('[Biometric] Plugin nativo sem biometria disponível:', facts.detail ?? facts.status);
      return false;
    }

    try {
      await BiometricAuth.authenticate({
        reason: 'Confirme a sua biometria para concluir o cadastro',
        cancelTitle: 'Cancelar',
        androidTitle: 'GBR KARDEK',
        androidSubtitle: 'Cadastro de biometria',
        allowDeviceCredential: false
      });

      await bioStore.setItem(username, {
        method: 'native',
        biometryType: facts.biometryType ?? '',
        registeredAt: new Date().toISOString()
      } satisfies StoredCredential);
      return true;
    } catch (err) {
      logger.error('[Biometric] Erro ao registrar (plugin nativo):', err);
      return false;
    }
  }

  if (!(await isBiometricSupported())) {
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
        method: 'webauthn',
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
      } satisfies StoredCredential);
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
  if (isNativeAppShell()) {
    const saved = (await bioStore.getItem(username)) as StoredCredential | null;
    // O prompt nativo só vale para credencial registada pelo plugin; uma marca
    // WebAuthn (ou inexistente) não autentica neste casco.
    if (!saved || saved.method !== 'native') return false;

    const facts = await checkNativeBiometry();
    if (facts.status !== 'available') {
      logger.warn('[Biometric] Biometria nativa deixou de estar disponível:', facts.detail ?? facts.status);
      return false;
    }

    try {
      await BiometricAuth.authenticate({
        reason: 'Confirme a sua biometria para entrar',
        cancelTitle: 'Usar senha',
        androidTitle: 'GBR KARDEK',
        androidSubtitle: 'Entrar com biometria',
        allowDeviceCredential: false
      });
      return true;
    } catch (err) {
      logger.warn('[Biometric] Autenticação nativa recusada:', describeError(err));
      return false;
    }
  }

  if (!(await isBiometricSupported())) return false;

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
  const cred = (await bioStore.getItem(username)) as StoredCredential | null;
  if (!cred) return false;

  // Cada casco só reconhece o seu próprio registo: no app nativo a marca tem
  // de vir do plugin; no navegador, do WebAuthn (credenciais antigas não têm
  // `method` e continuam válidas).
  return isNativeAppShell() ? cred.method === 'native' : cred.method !== 'native';
};

/**
 * Remove a biometria do usuário
 */
export const removeBiometric = async (username: string): Promise<void> => {
  await bioStore.removeItem(username);
};
