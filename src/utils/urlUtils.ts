
/**
 * Retorna a URL base do aplicativo para redirecionamentos.
 * Prioriza a variável de ambiente VITE_APP_URL, caso contrário usa window.location.origin.
 */
export const getAppBaseUrl = (): string => {
  // Prioridade 1: Variáveis de ambiente injetadas pelo AI Studio
  let envUrl = process.env.APP_URL || process.env.SHARED_APP_URL || import.meta.env.VITE_APP_URL;
  
  // Limpeza robusta: remove prefixos comuns se o usuário colou errado (ex: "App url https://...")
  if (envUrl) {
    envUrl = envUrl.replace(/^(App url|Published url|URL|Link)[:\s]*/i, '').trim();
  }
  
  // Se temos uma URL de ambiente válida e não é localhost, usamos ela
  if (envUrl && envUrl.startsWith('http') && !envUrl.includes('localhost')) {
    return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
  }
  
  // Fallback: tenta pegar do navegador
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  
  // Se o origin for localhost, mas estamos acessando via .run.app (detectado via href)
  // tentamos reconstruir a URL correta para evitar o erro de redirecionamento
  if (origin.includes('localhost')) {
    const fullHref = window.location.href;
    if (fullHref.includes('.run.app')) {
      const match = fullHref.match(/(https:\/\/[^/]+\.run\.app)/);
      if (match) {
        console.log('[URL Utils] Localhost detectado, mas reconstruindo URL da nuvem:', match[1]);
        return `${match[1]}/`;
      }
    }
  }
  
  const baseUrl = origin + (pathname.endsWith('/') ? pathname : `${pathname}/`);
  return baseUrl;
};
