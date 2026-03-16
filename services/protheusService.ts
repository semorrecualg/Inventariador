
/**
 * Service for Protheus Authentication
 */

const PROTHEUS_API_URL = import.meta.env.VITE_PROTHEUS_API_URL || '';

export interface ProtheusAuthResponse {
  success: boolean;
  message?: string;
  user?: {
    username: string;
    email: string;
    fullName?: string;
  };
}

/**
 * Authenticates a user against Protheus REST API
 */
export const authenticateWithProtheus = async (username: string, password: string): Promise<ProtheusAuthResponse> => {
  if (!PROTHEUS_API_URL) {
    // For development/demo purposes if URL is not set
    console.warn("VITE_PROTHEUS_API_URL not set. Using mock authentication.");
    if (username && password) {
      return {
        success: true,
        user: {
          username: username.toUpperCase(),
          email: `${username.toLowerCase()}@gbr.com.br`
        }
      };
    }
    return { success: false, message: "Credenciais inválidas." };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

    const response = await fetch(`${PROTHEUS_API_URL}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        message: errorData.message || `Erro na autenticação Protheus (${response.status})` 
      };
    }

    const data = await response.json();
    return {
      success: true,
      user: {
        username: data.username || username,
        email: data.email || `${username.toLowerCase()}@gbr.com.br`,
        fullName: data.fullName
      }
    };
  } catch (error) {
    console.error("Protheus Auth Error:", error);
    return { success: false, message: "Erro de conexão com o servidor Protheus." };
  }
};
