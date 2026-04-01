
/**
 * Helper para serialização segura de objetos complexos/circulares
 * Evita erros de "Converting circular structure to JSON"
 */
export const safeStringify = (obj: unknown, indent = 0): string => {
  try {
    const cache = new Set();
    return JSON.stringify(obj, (_key, value) => {
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
