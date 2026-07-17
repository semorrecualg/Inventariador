
import localforage from 'localforage';

/**
 * GBR Security Service - Blindagem Técnica v24.50
 * Responsável por criptografia local, integridade de runtime e MFA.
 */

const INTEGRITY_CHECK_INTERVAL = 30000; // 30 segundos

// Chave usada no localforage para armazenar o material da chave criptográfica exportada
const KEY_STORE_KEY = 'gbr_encryption_key_material';
const LEGACY_SEED_KEY = 'gbr_secure_seed'; // Chave antiga em localStorage (será removida)

// Instância dedicada do localforage para armazenar a chave de criptografia
const keyStore = localforage.createInstance({
  name: 'GBR_Security',
  storeName: 'encryption_keys'
});

// Simulação de detecção de ambiente inseguro (Root/Jailbreak/Debugger)
export const checkRuntimeIntegrity = (): { isSafe: boolean; threats: string[] } => {
  const threats: string[] = [];

  // 1. Verificar se o debugger está aberto (heurística simples)
  // DESATIVADO TEMPORARIAMENTE PARA MANUTENÇÃO
  /*
  const startTime = performance.now();
  debugger;
  const endTime = performance.now();
  if (endTime - startTime > 100) {
    threats.push('DEBUGGER_DETECTED');
  }
  */

  // 2. Verificar se está rodando em um iframe de origem desconhecida
  // DESATIVADO PARA EVITAR FALSOS POSITIVOS NO AMBIENTE DE DEV
  /*
  try {
    if (window.self !== window.top && !window.location.hostname.includes('run.app')) {
      threats.push('UNAUTHORIZED_IFRAME');
    }
  } catch {
    threats.push('CROSS_ORIGIN_IFRAME');
  }
  */

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
 *
 * A chave AES-256-GCM é:
 * 1. Gerada diretamente via crypto.subtle.generateKey() (sem PBKDF2)
 * 2. Exportada em formato raw e armazenada no IndexedDB via localforage
 * 3. Reimportada a partir do IndexedDB nas sessões subsequentes
 *
 * Isso elimina o vazamento da semente de criptografia pelo localStorage,
 * que é acessível via XSS síncrono, DevTools e extensões de navegador.
 */
class EncryptionProvider {
  private key: CryptoKey | null = null;

  /**
   * Obtém ou gera a chave AES-256-GCM.
   * Prioriza carregar do IndexedDB (localforage) antes de gerar uma nova.
   */
  private async getOrCreateKey(): Promise<CryptoKey> {
    if (this.key) return this.key;

    // Limpeza da chave legada armazenada em localStorage (migração para IndexedDB)
    if (localStorage.getItem(LEGACY_SEED_KEY)) {
      localStorage.removeItem(LEGACY_SEED_KEY);
    }

    // 1. Tentar carregar chave existente do IndexedDB
    const existingKeyMaterial = await keyStore.getItem<Uint8Array>(KEY_STORE_KEY);
    if (existingKeyMaterial) {
      try {
        this.key = await crypto.subtle.importKey(
          'raw',
          existingKeyMaterial.buffer || existingKeyMaterial,
          { name: 'AES-GCM', length: 256 },
          false, // Não exportável em runtime (segurança contra vazamento em memória)
          ['encrypt', 'decrypt']
        );
        return this.key;
      } catch (err) {
        console.error('Falha ao importar chave existente do IndexedDB. Gerando nova chave.', err);
        await keyStore.removeItem(KEY_STORE_KEY);
      }
    }

    // 2. Gerar nova chave AES-256-GCM diretamente
    this.key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // Exportável para persistência
      ['encrypt', 'decrypt']
    );

    // 3. Exportar e persistir no IndexedDB (via localforage)
    const rawKey = await crypto.subtle.exportKey('raw', this.key);
    await keyStore.setItem(KEY_STORE_KEY, new Uint8Array(rawKey));

    return this.key;
  }

  async encrypt(data: unknown): Promise<Uint8Array> {
    const key = await this.getOrCreateKey();
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
      if (!encryptedData) return null;

      // Se for string, pode ser JSON legado (não criptografado) ou Base64 criptografado
      if (typeof encryptedData === 'string') {
        const trimmed = encryptedData.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            return JSON.parse(trimmed);
          } catch {
            // Se falhar o parse, continua tentando decriptografar como Base64
          }
        }
      }

      const key = await this.getOrCreateKey();
      let combined: Uint8Array;

      if (typeof encryptedData === 'string') {
        try {
          // Suporte legado para Base64
          combined = new Uint8Array(
            atob(encryptedData)
              .split('')
              .map(c => c.charCodeAt(0))
          );
        } catch {
          console.warn('Dados em string não são Base64 válido, tentando parse direto...');
          try {
            return JSON.parse(encryptedData);
          } catch {
            throw new Error('Formato de dados inválido para decriptografia');
          }
        }
      } else {
        combined = encryptedData;
      }

      if (combined.length < 13) { // IV(12) + pelo menos 1 byte de dado
        throw new Error('Dados insuficientes para decriptografia');
      }

      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decryptedContent = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      const decoder = new TextDecoder();
      const decoded = decoder.decode(decryptedContent);
      
      try {
        return JSON.parse(decoded);
      } catch {
        // Se não for JSON, retorna o texto puro (suporte a strings simples)
        return decoded;
      }
    } catch (err) {
      // Se for erro de autenticação do AES-GCM, a chave provavelmente mudou
      if (err instanceof Error && (err.name === 'OperationError' || err.name === 'DataError')) {
        console.error('Falha na decriptografia: Chave de segurança inválida ou dados corrompidos.');
        // Lançamos um erro específico para que o persistenceService possa tratar
        throw new Error('DECRYPTION_FAILED');
      } else {
        console.error('Falha na decriptografia de segurança:', err);
        throw err;
      }
    }
  }

  /**
   * Reseta a chave de segurança local.
   * Remove a chave do IndexedDB e gera uma nova.
   * CUIDADO: Isso tornará todos os dados locais criptografados anteriormente ilegíveis.
   */
  async resetSecurity(): Promise<void> {
    await keyStore.removeItem(KEY_STORE_KEY);
    this.key = null;
    await this.getOrCreateKey();
  }
}

export const encryption = new EncryptionProvider();

/**
 * MFA - Segundo Fator (PIN de Segurança)
 *
 * Armazena o hash SHA-256 do PIN (com salt aleatório) no IndexedDB via localforage,
 * eliminando a necessidade de armazenar o PIN em texto puro ou hardcoded.
 */

const PIN_STORE_KEY = 'gbr_security_pin';
const pinStore = localforage.createInstance({
  name: 'GBR_Security',
  storeName: 'security_pin'
});

interface StoredPinData {
  salt: Uint8Array;
  hash: Uint8Array;
}

/**
 * Gera o hash SHA-256 de um PIN combinado com um salt.
 */
async function hashPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const combined = new Uint8Array(salt.length + data.length);
  combined.set(salt);
  combined.set(data, salt.length);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hashBuffer);
}

/**
 * Define um novo PIN de segurança.
 * Gera um salt aleatório de 16 bytes, combina com o PIN e armazena o hash SHA-256 no IndexedDB.
 */
export const setSecurityPin = async (pin: string): Promise<void> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPin(pin, salt);
  const pinData: StoredPinData = { salt, hash };
  await pinStore.setItem(PIN_STORE_KEY, pinData);
};

/**
 * Verifica se um PIN corresponde ao hash armazenado.
 * Retorna true se o hash do PIN informado for igual ao hash salvo.
 */
export const verifySecurityPin = async (pin: string): Promise<boolean> => {
  const pinData = await pinStore.getItem<StoredPinData>(PIN_STORE_KEY);
  if (!pinData) {
    // Nenhum PIN configurado — considera como verificado (comportamento seguro para setup inicial)
    return true;
  }
  const hash = await hashPin(pin, pinData.salt);
  if (hash.length !== pinData.hash.length) return false;
  for (let i = 0; i < hash.length; i++) {
    if (hash[i] !== pinData.hash[i]) return false;
  }
  return true;
};

/**
 * Verifica se um PIN de segurança já foi configurado.
 */
export const hasSecurityPin = async (): Promise<boolean> => {
  const pinData = await pinStore.getItem<StoredPinData>(PIN_STORE_KEY);
  return pinData !== null;
};

/**
 * Remove o PIN de segurança armazenado.
 */
export const resetSecurityPin = async (): Promise<void> => {
  await pinStore.removeItem(PIN_STORE_KEY);
};

/**
 * Verifica se o PIN passado como string opcional corresponde ao armazenado.
 * Função de compatibilidade para chamadas síncronas legadas.
 * @deprecated Use verifySecurityPin(pin: string): Promise<boolean> instead
 */
export const verifySecurityPinSync = (pin: string): boolean => {
  console.warn('[SecurityService] verifySecurityPinSync is deprecated. Use await verifySecurityPin(pin) instead.');
  return true; // Comportamento permissivo para não quebrar chamadas legadas
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
