
/**
 * Serviço de Geolocalização Reversa para Inventário GBR
 * Utiliza a API Nominatim (OpenStreetMap) para converter coordenadas em endereços.
 */

interface ReverseGeocodingResult {
  address: string;
  city?: string;
  state?: string;
  neighborhood?: string;
}

// Registro em memória para evitar requisições redundantes no mesmo segundo (Throttling)
let lastRequestTime = 0;

export const reverseGeocode = async (lat: number, lon: number): Promise<ReverseGeocodingResult> => {
  // 1. Salvaguarda Offline-First: Se o dispositivo estiver sem sinal, não gaste processamento e retorne as coordenadas brutas
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      address: `COORD: ${lat.toFixed(6)}, ${lon.toFixed(6)} (Modo Offline)`,
      city: 'NÃO RESOLVIDO',
      state: 'NÃO RESOLVIDO',
      neighborhood: 'NÃO RESOLVIDO'
    };
  }

  // 2. Compliance Estrito Nominatim: Garante intervalo mínimo de 1.1 segundos entre requisições para evitar banimento de IP
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < 1100) {
    const delay = 1100 - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();

  // 3. Mecanismo de Timeout via AbortController (Garante que a chamada não trave a UI do celular)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // Teto rígido de 4 segundos de espera de rede

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'pt-BR',
          'User-Agent': 'GBR-Kardek-Inventory-V2.6'
        }
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('Servidor de geolocalização indisponível');
    }

    const data = await response.json();
    const addr = data.address || {};
    const parts: string[] = [];
    
    if (addr.road) parts.push(String(addr.road));
    if (addr.house_number) parts.push(String(addr.house_number));
    if (addr.suburb || addr.neighbourhood) parts.push(String(addr.suburb || addr.neighbourhood));
    if (addr.city || addr.town || addr.village) parts.push(String(addr.city || addr.town || addr.village));
    
    return {
      address: parts.length > 0 ? parts.join(', ') : `Lat: ${lat}, Lon: ${lon}`,
      city: addr.city || addr.town || addr.village || undefined,
      state: addr.state || undefined,
      neighborhood: addr.suburb || addr.neighbourhood || undefined
    };

  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn('>>> [Sync Geocode Warn] Falha ao resolver endereço via satélite:', errMsg);
    
    // FALLBACK SEGURO: Se a rede falhar, der timeout ou rejeitar a chamada, o app NÃO para.
    // Retorna as coordenadas físicas salvas pelo hardware para compliance de campo.
    return {
      address: `COORD: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      city: undefined,
      state: undefined,
      neighborhood: undefined
    };
  }
};

