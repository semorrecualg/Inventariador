
/**
 * Helper para serialização segura de objetos complexos/circulares
 * Evita erros de "Converting circular structure to JSON"
 * Adicionada ordenação de chaves para garantir estabilidade de Checksum
 */
export const safeStringify = (obj: unknown, indent = 0): string => {
  try {
    const cache = new Set();
    
    // Função para ordenar chaves recursivamente
    const sortKeys = (data: unknown): unknown => {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        return data;
      }
      const obj = data as Record<string, unknown>;
      return Object.keys(obj).sort().reduce((acc: Record<string, unknown>, key: string) => {
        acc[key] = sortKeys(obj[key]);
        return acc;
      }, {});
    };

    const sortedObj = sortKeys(obj);

    return JSON.stringify(sortedObj, (_key, value) => {
      // Evita serializar elementos DOM ou FiberNodes que causam erros circulares
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          return '[Circular Reference]';
        }
        cache.add(value);
        
        if (value instanceof HTMLElement || value instanceof SVGElement) {
          return `[DOM Element: ${value.tagName}]`;
        }
        if (value.constructor && value.constructor.name === 'FiberNode') {
          return '[React FiberNode]';
        }
      }
      return value;
    }, indent);
  } catch {
    return "[Objeto Circular ou Complexo]";
  }
};

/**
 * Sanitiza um objeto para ser enviado ao Supabase, removendo referências circulares
 * e elementos que não podem ser serializados.
 */
export const sanitizeForSupabase = (obj: unknown): unknown => {
  if (!obj) return obj;
  try {
    return JSON.parse(safeStringify(obj));
  } catch (err) {
    return { error: "Failed to sanitize object", details: String(err) };
  }
};

/**
 * Gera um Checksum (Hash SHA-256) de um objeto para validação de integridade.
 */
export const generateChecksum = async (data: unknown): Promise<string> => {
  try {
    const jsonString = safeStringify(data);
    const msgUint8 = new TextEncoder().encode(jsonString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.error('[Integrity] Erro ao gerar checksum:', err);
    return 'checksum_error';
  }
};
