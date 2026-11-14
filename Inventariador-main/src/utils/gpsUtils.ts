import { Geolocation } from '@capacitor/geolocation';
import { logger } from './logger';
import { GPS_ACCURACY, GpsJitterFilter, isPreciseFix, isValidCoordinate, toGpsFix } from './gpsCore';

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

/**
 * Retorna a posição do aparelho para a guarda de conformidade, ou `null` quando
 * não há leitura válida e não há âncora da unidade para o bypass administrativo.
 * Nunca inventa coordenada: a âncora da unidade é a única contingência usada.
 */
export async function getCurrentDeviceLocation(
  userRole: string,
  unitAnchorCoordinates?: { lat: number; lng: number }
): Promise<GeoLocationResult | null> {
  const hasAnchor = isValidCoordinate(unitAnchorCoordinates?.lat, unitAnchorCoordinates?.lng);
  const finalAnchor = hasAnchor
    ? { lat: Number(unitAnchorCoordinates?.lat), lng: Number(unitAnchorCoordinates?.lng) }
    : null;

  const roleUpper = (userRole || '').toUpperCase();
  const isAdmin = ['ADMIN', 'MASTER', 'GESTOR'].includes(roleUpper);

  // 4. Se o usuário possuir perfil administrativo (ADMIN, MASTER, GESTOR), garanta o bypass síncrono definitivo da validação
  if (isAdmin && finalAnchor) {
    logger.info(">>> [SRE GPS Bypass] Perfil administrativo detectado. Aplicando bypass síncrono definitivo.");
    showFloatingBypassToast(finalAnchor.lat, finalAnchor.lng, 'Soberania Admin (Ativa)');
    return {
      latitude: finalAnchor.lat,
      longitude: finalAnchor.lng,
      accuracy: 1.0,
      isBypassed: true,
      source: 'admin_bypass'
    };
  }

  // Se a API navigator.geolocation não existir ou se estivermos em iframe sandbox onde ela pode estar desabilitada
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    logger.warn(">>> [SRE GPS Fallback] API navigator.geolocation inexistente ou desativada no documento.");
    if (!finalAnchor) return null;
    showFloatingBypassToast(finalAnchor.lat, finalAnchor.lng, 'API Inexistente (Bypass Fallback)');
    return {
      latitude: finalAnchor.lat,
      longitude: finalAnchor.lng,
      accuracy: 1.0,
      isBypassed: true,
      source: 'admin_bypass'
    };
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      // Configura um timeout imperativo interno para a Promise para nunca deixar pendurada
      const timer = setTimeout(() => {
        reject(new Error("Timeout síncrono na obtenção do GPS"));
      }, 6000);

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timer);
            resolve(pos);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          },
          {
            enableHighAccuracy: false, // Menos agressivo em termos de segurança
            timeout: 5000,
            maximumAge: 60000,
          }
        );
      } catch (err) {
        clearTimeout(timer);
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
    const errorMsg = errorVal instanceof Error ? errorVal.message : String(errorVal || '');
    logger.warn(">>> [SRE GPS Fallback] Falha de permissão ou política de geolocalização capturada:", errorMsg);
    
    // Tratamento específico de erro de Permissions Policy, sandbox, denied, ou timeout
    // Em caso de falha de permissão (como em ambiente web sandbox/iFrame), aplique um FALLBACK AUTOMÁTICO
    // retornando sucesso de forma simulada para destravar o bootstrap do aplicativo.
    if (!finalAnchor) return null;
    showFloatingBypassToast(finalAnchor.lat, finalAnchor.lng, `Bypass Sandbox (${errorMsg.substring(0, 30)})`);
    return {
      latitude: finalAnchor.lat,
      longitude: finalAnchor.lng,
      accuracy: 1.0,
      isBypassed: true,
      source: 'admin_bypass'
    };
  }
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
/** Filtro anti-jitter compartilhado pelo rastreamento autônomo (ver gpsCore.ts). */
const jitterFilter = new GpsJitterFilter();

/**
 * Inicia o rastreamento autônomo em segundo plano
 */
export const startAutonomousTracking = async () => {
  if (watchId !== null || isReconnectingGps) return;

  logger.info('Iniciando Rastreamento Autônomo (Capacitor/Web)...');
  
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    logger.warn('Autônomo: Geolocation desativado ou indisponível.');
    return;
  }

  try {
    watchId = await Geolocation.watchPosition(
      {
        // Bateria: precisão baixa (rede/Wi-Fi), leitura no máximo a cada 60 s
        // (maximumAge) e timeout de 15 s. Com o filtro, ruído parado não grava nada.
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
      },
      (position, err) => {
        if (err) {
          logger.warn('Autônomo: Erro no rastreio', err.message);
          
          const isPermissionDenied = err.message && (
            err.message.toLowerCase().includes('permission') || 
            err.message.toLowerCase().includes('disabled') || 
            err.message.toLowerCase().includes('policy')
          );
          
          if (isPermissionDenied) {
            logger.warn('Autônomo: Permissão negada ou desabilitada por política. Desativando rastreamento autônomo definitivo para evitar loops.');
            if (watchId !== null) {
              Geolocation.clearWatch({ id: watchId }).catch(() => {});
              watchId = null;
            }
            return;
          }

          const isTimeout = (err as { code?: number }).code === 3 || 
                            (err.message && (err.message.toLowerCase().includes('timeout') || err.message.toLowerCase().includes('expired')));
          
          if (isTimeout) {
            logger.warn('Autônomo: Erro por timeout/expired capturado na WebView. Decoplando e limpando watch de rede...');
            
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
              logger.warn("Falha ao recuperar chave ou perfil de usuário:", e);
            }

            if (isAdmin) {
              // Só a âncora real da unidade; sem ela, nenhuma coordenada é inventada.
              let anchor: { lat: number; lng: number } | null = null;
              try {
                const cStr = localStorage.getItem('gbr_current_unit_config');
                if (cStr) {
                  const cObj = JSON.parse(cStr);
                  if (isValidCoordinate(Number(cObj.lat), Number(cObj.lng))) {
                    anchor = { lat: Number(cObj.lat), lng: Number(cObj.lng) };
                  }
                }
              } catch (e) {
                logger.warn("Falha ao ler gbr_current_unit_config:", e);
              }
              lastLocation = anchor ? { lat: anchor.lat, lng: anchor.lng, accuracy: 1.0 } : null;
              lastTimestamp = Date.now();
              logger.warn('[Bypass Admin Ativo] Timeout de GPS; usando somente a âncora da unidade, se houver.');
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
          const fix = toGpsFix(position.coords);
          if (fix && jitterFilter.accept(fix)) {
            lastLocation = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, altitude: fix.altitude };
            lastTimestamp = Date.now();
          } else {
            logger.info('Autônomo: leitura descartada pelo filtro anti-jitter/precisão.');
          }
        }
      }
    ).catch((e: unknown) => {
      logger.warn('Autônomo [Promise Catch]: erro ao registrar watchPosition (silenciado):', e);
      return null;
    });
  } catch (e) {
    logger.error('Falha ao iniciar watchPosition:', e);
  }
};

/**
 * Para o rastreamento autônomo
 */
export const stopAutonomousTracking = async () => {
  if (watchId !== null) {
    await Geolocation.clearWatch({ id: watchId });
    watchId = null;
    logger.info('Rastreamento Autônomo Finalizado.');
  }
};

/**
 * Posição atual para gravar em ativo/lote. Retorna `null` quando não há leitura
 * válida e precisa (ou seja, não há coordenada a gravar). Nunca inventa ponto.
 */
export const getCurrentLocation = async (forceRefresh = false): Promise<GpsLocation | null> => {
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

    const fix = toGpsFix(coordinates?.coords);
    if (fix && isPreciseFix(fix, GPS_ACCURACY.COLLECT)) {
      const newLoc: GpsLocation = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, altitude: fix.altitude };
      lastLocation = newLoc;
      lastTimestamp = Date.now();
      return newLoc;
    }
    logger.warn('>>> [GPS] Leitura nativa descartada (imprecisa ou inválida).');
  } catch (err) {
    logger.warn('>>> [GPS] Falha no Geolocation.getCurrentPosition Nativo, tentando Web API...', err);
  }

  // Fallback para Web Geolocation API com Try/Catch robusto
  return new Promise((resolve) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        logger.info('>>> [GPS] Geolocalização não suportada ou indisponível.');
        resolve(lastLocation);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const fix = toGpsFix(position.coords);
          if (fix && isPreciseFix(fix, GPS_ACCURACY.COLLECT)) {
            const newLoc: GpsLocation = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, altitude: fix.altitude };
            lastLocation = newLoc;
            lastTimestamp = Date.now();
            resolve(newLoc);
          } else {
            resolve(lastLocation);
          }
        },
        (err) => {
          // Captura silenciosa de erros de permissão ou política
          logger.warn('>>> [GPS] Fallback Web Geolocation erro (silenciado):', err.message);
          resolve(lastLocation);
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    } catch (e) {
      logger.warn('>>> [GPS] Geolocation Web API lançou exceção (silenciada):', e);
      resolve(lastLocation);
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
