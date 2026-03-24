
import { User } from '../types';

/**
 * GBR Security Service - Blindagem Técnica v24.50
 * Responsável por criptografia local, integridade de runtime e MFA.
 */

const ENCRYPTION_KEY_NAME = 'gbr_secure_seed';
const INTEGRITY_CHECK_INTERVAL = 30000; // 30 segundos

// Simulação de detecção de ambiente inseguro (Root/Jailbreak/Debugger)
export const checkRuntimeIntegrity = (): { isSafe: boolean; threats: string[] } => {
  const threats: string[] = [];

  // 1. Verificar se o debugger está aberto (heurística simples)
  const startTime = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  const endTime = performance.now();
  if (endTime - startTime > 100) {
    threats.push('DEBUGGER_DETECTED');
  }

  // 2. Verificar se está rodando em um iframe de origem desconhecida (exceto o ambiente de dev)
  try {
    if (window.self !== window.top && !window.location.hostname.includes('run.app')) {
      threats.push('UNAUTHORIZED_IFRAME');
    }
  } catch {
    threats.push('CROSS_ORIGIN_IFRAME');
  }

  // 3. Verificar extensões suspeitas ou modificações no DOM (exemplo: injeção de scripts)
  if (document.querySelectorAll('script[src*="malicious"]').length > 0) {
    threats.push('SUSPICIOUS_SCRIPTS');
  }

  return {
    isSafe: threats.length === 0,
    threats
  };
};

/**
 * Criptografia AES-GCM para dados sensíveis no IndexedDB
 */
class EncryptionProvider {
  private key: CryptoKey | null = null;

  private async getSeed(): Promise<string> {
    let seed = localStorage.getItem(ENCRYPTION_KEY_NAME);
    if (!seed) {
      seed = crypto.randomUUID();
      localStorage.setItem(ENCRYPTION_KEY_NAME, seed);
    }
    return seed;
  }

  private async generateKey(): Promise<CryptoKey> {
    if (this.key) return this.key;

    const seed = await this.getSeed();
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(seed),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('gbr_salt_2024'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return this.key;
  }

  async encrypt(data: unknown): Promise<Uint8Array> {
    const key = await this.generateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(JSON.stringify(data));

    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );

    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);

    return combined;
  }

  async decrypt(encryptedData: Uint8Array | string): Promise<unknown> {
    try {
      const key = await this.generateKey();
      let combined: Uint8Array;

      if (typeof encryptedData === 'string') {
        // Suporte legado para Base64
        combined = new Uint8Array(
          atob(encryptedData)
            .split('')
            .map(c => c.charCodeAt(0))
        );
      } else {
        combined = encryptedData;
      }

      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decryptedContent = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedContent));
    } catch (err) {
      console.error('Falha na decriptografia de segurança:', err);
      return null;
    }
  }
}

export const encryption = new EncryptionProvider();

/**
 * MFA - Simulação de Segundo Fator (PIN de Segurança)
 */
export const verifySecurityPin = (user: User, pin: string): boolean => {
  // Em uma implementação real, o hash do PIN estaria no Supabase/Auth
  // Aqui simulamos uma validação de PIN "0000" para fins de demonstração da Blindagem
  return pin === '0000';
};

/**
 * Inicia o monitoramento de integridade
 */
export const startSecurityMonitor = (onThreat: (threats: string[]) => void) => {
  return setInterval(() => {
    const { isSafe, threats } = checkRuntimeIntegrity();
    if (!isSafe) {
      onThreat(threats);
    }
  }, INTEGRITY_CHECK_INTERVAL);
};
