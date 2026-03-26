
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

export const reverseGeocode = async (lat: number, lon: number): Promise<ReverseGeocodingResult> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        headers: {
          'Accept-Language': 'pt-BR',
          'User-Agent': 'GBR-Inventory-App'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Falha na consulta de geolocalização');
    }

    const data = await response.json();
    
    // Formata o endereço de forma concisa para o campo de localização
    const addr = data.address;
    const parts = [];
    
    if (addr.road) parts.push(addr.road);
    if (addr.house_number) parts.push(addr.house_number);
    if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
    if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
    
    return {
      address: parts.join(', '),
      city: addr.city || addr.town || addr.village,
      state: addr.state,
      neighborhood: addr.suburb || addr.neighbourhood
    };
  } catch (error) {
    console.error('Erro na geolocalização reversa:', error);
    throw error;
  }
};
