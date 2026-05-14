
/**
 * Utility to reliably extract error messages and details from any unknown error object.
 */
export const formatErrorMessage = (err: unknown): { message: string; stack?: string; raw?: string } => {
  if (err instanceof Error) {
    return {
      message: err.message || 'Error sem mensagem',
      stack: err.stack,
      raw: err.toString()
    };
  }
  
  if (typeof err === 'string') {
    return { message: err };
  }
  
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    // Try common properties
    const message = String(obj.message || obj.error || obj.msg || 'Erro desconhecido (object)');
    
    let raw = '';
    try {
      raw = JSON.stringify(err, Object.getOwnPropertyNames(err));
    } catch {
      raw = 'Não foi possível serializar o erro';
    }
    
    return {
      message,
      stack: String(obj.stack || ''),
      raw
    };
  }
  
  return { message: String(err || 'Erro indefinido') };
};
