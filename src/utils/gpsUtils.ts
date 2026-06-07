
import { Geolocation } from '@capacitor/geolocation';

/**
 * Utilitário para captura de geolocalização (GPS)
 */

export interface GeoLocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  isBypassed: boolean;
  source: 'native' | 'admin_bypass';
}

function showFloatingBypassToast(lat: number, lng: number, reason: string) {
  if (typeof document === 'undefined') return;
  
  // Remove qualquer toast flutuante existente para não poluir
  const existing = document.getElementById('gbr-gps-bypass-toast');
  if (existing) {
    existing.remove();
  }
  
  const div = document.createElement('div');
  div.id = 'gbr-gps-bypass-toast';
  div.style.position = 'fixed';
  div.style.top = '16px';
  div.style.left = '50%';
  div.style.transform = 'translateX(-50%)';
  div.style.zIndex = '10000';
  div.style.backgroundColor = '#0f172a'; // slate-900
  div.style.color = '#34d399'; // emerald-400
  div.style.border = '1px solid rgba(52, 211, 153, 0.3)';
  div.style.padding = '12px 18px';
  div.style.borderRadius = '16px';
  div.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  div.style.gap = '2px';
  div.style.fontFamily = 'monospace';
  div.style.fontSize = '10px';
  div.style.fontWeight = 'bold';
  div.style.textTransform = 'uppercase';
  div.style.letterSpacing = '0.05em';
  div.style.maxWidth = '300px';
  div.style.width = 'max-content';
  div.style.transition = 'opacity 0.3s ease-in-out';
  
  div.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px; font-weight: 900; color: #10b981;">
      <span style="display: inline-block; width: 6px; height: 6px; background-color: #10b981; border-radius: 50%; animation: pulse 1.5s infinite;"></span>
      BYPASS GPS GBR ATIVO
    </div>
    <div style="color: #cbd5e1; margin-top: 4px;">Lat: ${lat.toFixed(6)}</div>
    <div style="color: #cbd5e1;">Lng: ${lng.toFixed(6)}</div>
    <div style="color: #94a3b8; font-size: 8px; margin-top: 3px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 3px;">Motivo: ${reason}</div>
  `;
  
  if (!document.getElementById('gbr-toast-keyframes')) {
    const style = document.createElement('style');
    style.id = 'gbr-toast-keyframes';
    style.innerHTML = `
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(1.2); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(div);
  
  setTimeout(() => {
    if (div.parentNode) {
      div.style.opacity = '0';
      setTimeout(() => div.remove(), 300);
    }
  }, 4000);
}

export async function getCurrentDeviceLocation(
  userRole: string,
  unitAnchorCoordinates?: { lat: number; lng: number }
): Promise<GeoLocationResult> {
  const isAdmin = ['ADMIN', 'MASTER', 'GESTOR'].includes((userRole || '').toUpperCase());

  // Se o perfil logado for administrativo, aplica bypass síncrono imediatamente
  if (isAdmin && unitAnchorCoordinates && unitAnchorCoordinates.lat && unitAnchorCoordinates.lng) {
    showFloatingBypassToast(unitAnchorCoordinates.lat, unitAnchorCoordinates.lng, 'Soberania Admin (Ativa)');
    return getAdminFallback(unitAnchorCoordinates);
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    if (unitAnchorCoordinates && unitAnchorCoordinates.lat && unitAnchorCoordinates.lng) {
      showFloatingBypassToast(unitAnchorCoordinates.lat, unitAnchorCoordinates.lng, 'API Inexistente (Bypass)');
      return getAdminFallback(unitAnchorCoordinates);
    }
    throw new Error("Geolocalização indisponível.");
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      try {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        });
      } catch (err) {
        reject(err);
      }
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      isBypassed: false,
      source: 'native',
    };
  } catch (errorVal: unknown) {
    const error = errorVal as { code?: string | number; message?: string; name?: string } | null;
    
    // Se a permissão for negada/bloqueada, ou houver erro/timeout, aplica o bypass se tivermos as coordenadas da filial
    if (unitAnchorCoordinates && unitAnchorCoordinates.lat && unitAnchorCoordinates.lng) {
      console.warn("[GBR v2.6] Falha ou bloqueio de geolocalização detectado. Ativando bypass administrativo de conformidade.");
      showFloatingBypassToast(
        unitAnchorCoordinates.lat,
        unitAnchorCoordinates.lng,
        error?.message || 'Permissão de GPS bloqueada'
      );
      return getAdminFallback(unitAnchorCoordinates);
    }

    throw new Error(`Falha de Geocerca: ${error && typeof error.message === 'string' ? error.message : 'Acesso negado à localização'}`);
  }
}

function getAdminFallback(anchor: { lat: number; lng: number }): GeoLocationResult {
  return {
    latitude: anchor.lat,
    longitude: anchor.lng,
    accuracy: 1.0,
    isBypassed: true,
    source: 'admin_bypass',
  };
}

export interface GpsLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
}

let lastLocation: GpsLocation | null = null;
let lastTimestamp: number = 0;
let watchId: string | null = null;
let isReconnectingGps = false;

/**
 * Inicia o rastreamento autônomo em segundo plano
 */
export const startAutonomousTracking = async () => {
  if (watchId !== null || isReconnectingGps) return;

  console.log('Iniciando Rastreamento Autônomo (Capacitor/Web)...');
  
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    console.warn('Autônomo: Geolocation desativado ou indisponível.');
    return;
  }

  try {
    watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
      },
      (position, err) => {
        if (err) {
          console.warn('Autônomo: Erro no rastreio', err.message);
          
          const isTimeout = (err as { code?: number }).code === 3 || 
                            (err.message && (err.message.toLowerCase().includes('timeout') || err.message.toLowerCase().includes('expired')));
          
          if (isTimeout) {
            console.warn('Autônomo: Erro por timeout/expired capturado na WebView. Decoplando e limpando watch de rede...');
            
            // Limpa imperativamente o listener ativo para evitar vazamento de WebView
            if (watchId !== null) {
              Geolocation.clearWatch({ id: watchId }).catch(() => {});
              watchId = null;
            }

            // Tenta resgatar perfil administrativo [Bypass Admin Ativo] para evitar interrupções de rotina
            let isAdmin = false;
            try {
              const savedUserStr = sessionStorage.getItem('app_current_user');
              if (savedUserStr) {
                const u = JSON.parse(savedUserStr);
                const r = (u.role || '').toUpperCase();
                if (r === 'ADMIN' || r === 'MASTER' || r === 'GESTOR' || u.is_admin === true || u.isAdmin === true) {
                  isAdmin = true;
                }
              }
            } catch (e) {
              console.warn("Falha ao recuperar chave ou perfil de usuário:", e);
            }

            if (isAdmin) {
              let anchor = { lat: -16.6869, lng: -49.2648 };
              try {
                const cStr = localStorage.getItem('gbr_current_unit_config');
                if (cStr) {
                  const cObj = JSON.parse(cStr);
                  if (cObj.lat && cObj.lng) {
                    anchor = { lat: Number(cObj.lat), lng: Number(cObj.lng) };
                  }
                }
              } catch (e) {
                console.warn("Falha ao ler gbr_current_unit_config:", e);
              }
              lastLocation = { lat: anchor.lat, lng: anchor.lng, accuracy: 1.0 };
              lastTimestamp = Date.now();
              console.warn('[Bypass Admin Ativo] Aplicando coordenadas de ancoragem admin síncronas de conformidade por timeout.');
            } else {
              // Envia coordenada nula controlada
              lastLocation = null;
            }

            // Aplica um mecanismo de recuo (debounce/backoff) de pelo menos 5000ms antes de reiniciar a escuta do sensor
            if (!isReconnectingGps) {
              isReconnectingGps = true;
              setTimeout(() => {
                isReconnectingGps = false;
                startAutonomousTracking().catch(console.error);
              }, 5000);
            }
          }
          return;
        }
        if (position) {
          lastLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude
          };
          lastTimestamp = Date.now();
        }
      }
    ).catch((e: unknown) => {
      console.warn('Autônomo [Promise Catch]: erro ao registrar watchPosition (silenciado):', e);
      return null;
    });
  } catch (e) {
    console.error('Falha ao iniciar watchPosition:', e);
  }
};

/**
 * Para o rastreamento autônomo
 */
export const stopAutonomousTracking = async () => {
  if (watchId !== null) {
    await Geolocation.clearWatch({ id: watchId });
    watchId = null;
    console.log('Rastreamento Autônomo Finalizado.');
  }
};

export const getCurrentLocation = async (forceRefresh = false): Promise<GpsLocation> => {
  const now = Date.now();
  
  // Retorna cache se for recente (30 segundos) e não for forçado
  if (!forceRefresh && lastLocation && (now - lastTimestamp < 30000)) {
    return lastLocation;
  }

  try {
    // Tenta Capacitor (Nativo) primeiro
    const coordinates = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000
    });

    if (coordinates && coordinates.coords) {
      const newLoc = {
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
        accuracy: coordinates.coords.accuracy,
        altitude: coordinates.coords.altitude
      };
      lastLocation = newLoc;
      lastTimestamp = Date.now();
      return newLoc;
    }
  } catch (err) {
    console.warn('>>> [GPS] Falha no Geolocation.getCurrentPosition Nativo, tentando Web API...', err);
  }

  // Fallback para Web Geolocation API
  return new Promise((resolve) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        console.log('>>> [GPS] Geolocalização não suportada ou indisponível.');
        resolve(lastLocation || { lat: -16.6869, lng: -49.2648 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude
          };
          lastLocation = newLoc;
          lastTimestamp = Date.now();
          resolve(newLoc);
        },
        (err) => {
          // Captura silenciosa de erros de permissão ou política
          console.warn('>>> [GPS] Fallback Web Geolocation erro (silenciado):', err.message);
          resolve(lastLocation || { lat: -16.6869, lng: -49.2648 });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
      );
    } catch (e) {
      console.warn('>>> [GPS] Geolocation Web API lançou exceção (silenciada):', e);
      resolve(lastLocation || { lat: -16.6869, lng: -49.2648 });
    }
  });
};

/**
 * Calcula a distância entre dois pontos em metros usando a fórmula de Haversine
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Converte altitude bruta em andar (Lógica GBR v25)
 * Assume 3.0 metros por pavimento
 */
export const convertAltitudeToFloor = (altitude: number | null | undefined): number => {
  if (altitude === null || altitude === undefined) return 0;
  // Se altitude for negativa (subsolo), arredonda pra baixo
  if (altitude < 0) return Math.floor(altitude / 3.0);
  return Math.floor(altitude / 3.0);
};
