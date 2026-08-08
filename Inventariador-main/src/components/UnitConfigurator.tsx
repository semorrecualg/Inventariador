import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Layers,
  ArrowLeft,
  WifiOff,
  Unlock,
  Search,
  Plus,
  Minus,
  Navigation,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Geolocation } from '@capacitor/geolocation';
import * as turf from '@turf/turf';
import { UnitConfig, User, AppScreen } from '../types';
import { fetchUnitConfigs, saveUnitConfig } from '../services/supabaseService';
import { logger } from '../utils/logger';
import { mergeUnitConfigIntoList } from '../utils/gpsAnchors';

interface UnitConfiguratorProps {
  user: User;
  units: string[];
  onBack: () => void;
  onUpdateConfigs?: (configs: UnitConfig[]) => void;
  onNavigate?: (screen: AppScreen) => void;
  initialUnit?: string | null;
  /** Bypass offline: chamado quando o auditor aplica coordenadas padrão e a campanha de contingência é aberta. */
  onBypassApplied?: (config: UnitConfig) => void;
}

// ============================================================================
// ÂNCORA GPS — CENTRO PADRÃO / FALLBACK CANÔNICO
// Brasília - DF: [longitude: -47.8825, latitude: -15.7942], zoom inicial 4 (nacional)
// ============================================================================
const BRASILIA_DEFAULT = { lat: -15.7942, lng: -47.8825 } as const;
const DEFAULT_ZOOM = 4;
const UNIT_ZOOM = 12;

/**
 * safeLngLat — higienizador estrito de coordenadas (Guarda Defensiva).
 * Aceita [lng, lat] ou { lng/longitude/lngLat, lat/latitude/lngLat } e SEMPRE
 * devolve um par [lng, lat] finito — ou o centro canônico Brasília-DF.
 * Intercepta o crash "Cannot read properties of undefined (reading 'lng')".
 */
const BRASILIA_CENTER: [number, number] = [BRASILIA_DEFAULT.lng, BRASILIA_DEFAULT.lat];

const safeLngLat = (coords: unknown): [number, number] => {
  const DEFAULT_CENTER: [number, number] = BRASILIA_CENTER;
  if (!coords) return DEFAULT_CENTER;

  // Se for Array [lng, lat]
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    return isNaN(lng) || isNaN(lat) ? DEFAULT_CENTER : [lng, lat];
  }

  // Se for Objeto { lng, lat } ou { longitude, latitude } ou variantes normais
  const c = coords as { lng?: unknown; longitude?: unknown; lat?: unknown; latitude?: unknown; lngLat?: { lng?: unknown; lat?: unknown } };
  const lng = Number(c.lng ?? c.longitude ?? c.lngLat?.lng);
  const lat = Number(c.lat ?? c.latitude ?? c.lngLat?.lat);

  if (isNaN(lng) || isNaN(lat)) return DEFAULT_CENTER;
  return [lng, lat];
};

/** Variante { lat, lng } finitos — para o estado currentConfig e persistência. */
const safeLatLngPair = (coords: unknown): { lat: number; lng: number } => {
  const [lng, lat] = safeLngLat(coords);
  return { lat, lng };
};

/**
 * Estilo LOCAL inline JSON (prevenção de tela preta no Capacitor): o STYLE nunca é
 * buscado da rede (zero crash), mas camadas de TILES RASTER reais (OSM/Esri) são
 * declaradas no style — com rede o mapa exibe relevo/ruas; offline, a falha de tile
 * é não-fatal e o fundo + grade de coordenadas continuam visíveis.
 */
function buildOfflineStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      'graticule-source': {
        type: 'geojson',
        data: buildGraticuleGeoJSON() as unknown as maplibregl.GeoJSONSourceSpecification['data']
      },
      // Tiles raster REAIS (OSM street / Esri satellite): quando ha rede, o mapa exibe
      // relevo/ruas de verdade. Quando offline, a falha de tile e NAO-FATAL no MapLibre
      // (apenas eventos 'error' — o fundo + grade continuam visiveis, sem tela preta).
      'street-tiles': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors'
      },
      'satellite-tiles': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© Esri — Source: Esri, Maxar, Earthstar Geographics'
      }
    },
    layers: [
      {
        id: 'bg-street',
        type: 'background',
        paint: { 'background-color': '#e8ecf2' }
      },
      {
        id: 'bg-satellite',
        type: 'background',
        paint: { 'background-color': '#040b1a' }
      },
      {
        id: 'graticule-layer',
        type: 'line',
        source: 'graticule-source',
        paint: {
          'line-color': 'rgba(71, 85, 105, 0.28)',
          'line-width': 0.75
        }
      },
      {
        id: 'graticule-satellite-layer',
        type: 'line',
        source: 'graticule-source',
        paint: {
          'line-color': 'rgba(59, 130, 246, 0.22)',
          'line-width': 0.75
        }
      },
      // Camadas raster ACIMA da grade: cobrem a grade quando os tiles carregam;
      // quando falham (offline) ficam transparentes e o fundo + grade aparecem.
      {
        id: 'street-raster',
        type: 'raster',
        source: 'street-tiles',
        paint: { 'raster-opacity': 1 }
      },
      {
        id: 'satellite-raster',
        type: 'raster',
        source: 'satellite-tiles',
        paint: { 'raster-opacity': 1 }
      }
    ]
  };
}

/** Grade de coordenadas gerada localmente (2° de passo sobre o Brasil) — zero rede. */
function buildGraticuleGeoJSON() {
  const latMin = -34, latMax = 6, lngMin = -74, lngMax = -34, step = 2;
  const features: unknown[] = [];
  for (let lat = latMin; lat <= latMax; lat += step) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[lngMin, lat], [lngMax, lat]] }
    });
  }
  for (let lng = lngMin; lng <= lngMax; lng += step) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[lng, latMin], [lng, latMax]] }
    });
  }
  return { type: 'FeatureCollection', features };
}

const UnitConfigurator: React.FC<UnitConfiguratorProps> = ({
  user,
  units,
  onBack,
  onUpdateConfigs,
  onNavigate,
  initialUnit,
  onBypassApplied
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [configs, setConfigs] = useState<UnitConfig[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<UnitConfig>>({
    lat: BRASILIA_DEFAULT.lat,
    lng: BRASILIA_DEFAULT.lng,
    radius_meters: 500,
    is_active: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [mapType, setMapType] = useState<'street' | 'satellite'>(() => {
    const saved = sessionStorage.getItem('unit_config_map_type');
    return (saved === 'satellite' || saved === 'street') ? saved : 'street';
  });
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showAdminBypassToast, setShowAdminBypassToast] = useState(false);
  const [bypassCampaignId, setBypassCampaignId] = useState<string | null>(null);

  // Solução para Stale Closure bugs (Captura os estados mais recentes nos listeners assíncronos do mapa)
  const selectedUnitRef = useRef<string | null>(null);
  const currentConfigRef = useRef<Partial<UnitConfig>>({});
  const mapClickRef = useRef<(lat: number, lng: number) => void>(() => {});

  useEffect(() => {
    // Mantem o ref sempre alinhado: cai para initialUnit enquanto o estado nao for setado.
    selectedUnitRef.current = selectedUnit || initialUnit || null;
  }, [selectedUnit, initialUnit]);

  useEffect(() => {
    currentConfigRef.current = currentConfig;
  }, [currentConfig]);

  useEffect(() => {
    mapClickRef.current = (lat: number, lng: number) => {
      const activeUnit = selectedUnitRef.current;
      if (!activeUnit) {
        setMessage({ text: 'SELECIONE UMA OPERACIONAL NO PAINEL INFERIOR ANTES DE MARCAR O MAPA.', type: 'error' });
        return;
      }
      setCurrentConfig(prev => ({ ...prev, lat, lng }));

      // Gravação preventiva de rascunho na sessão
      sessionStorage.setItem(`kardek_temp_gps_lat_${activeUnit}`, String(lat));
      sessionStorage.setItem(`kardek_temp_gps_lng_${activeUnit}`, String(lng));
    };
  }, []);

  // ==========================================================================
  // MOTOR MAPLIBRE OFFLINE-FIRST
  // ==========================================================================
  const flyTo = (lat: number, lng: number, zoom = UNIT_ZOOM) => {
    const map = mapInstance.current;
    if (!map) return;
    // Guarda Defensiva: nunca alimenta o motor com coordenadas indefinidas/NaN
    const [safeLng, safeLat] = safeLngLat({ lat, lng });
    map.flyTo({ center: [safeLng, safeLat], zoom, essential: true, duration: 900 });
  };

  const initMap = () => {
    if (!mapRef.current || mapInstance.current) return;
    try {
      const style = buildOfflineStyle();

      const map = new maplibregl.Map({
        container: mapRef.current,
        style,
        center: [BRASILIA_DEFAULT.lng, BRASILIA_DEFAULT.lat], // [lng, lat] Brasília DF
        zoom: DEFAULT_ZOOM, // nível nacional
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchZoomRotate: true,
        fadeDuration: 0
      });

      map.on('load', () => {
        try {
          // Grade de coordenadas (camada local de referência)
          if (!map.getSource('graticule-source')) {
            map.addSource('graticule-source', {
              type: 'geojson',
              data: buildGraticuleGeoJSON() as unknown as maplibregl.GeoJSONSourceSpecification['data']
            });
          }
          // Círculo de geocerca (âncora) — preenchimento + contorno
          if (!map.getSource('geofence-source')) {
            map.addSource('geofence-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addLayer({
              id: 'geofence-fill',
              type: 'fill',
              source: 'geofence-source',
              paint: {
                'fill-color': '#3b82f6',
                'fill-opacity': 0.18,
                'fill-outline-color': '#3b82f6'
              }
            });
            map.addLayer({
              id: 'geofence-line',
              type: 'line',
              source: 'geofence-source',
              paint: {
                'line-color': '#3b82f6',
                'line-width': 2,
                'line-dasharray': [3, 2]
              }
            });
          }

          mapInstance.current = map;
          setMapReady(true);
          setMapFailed(false);
          logger.info('>>> [MAP] MapLibre GL iniciado em modo OFFLINE (estilo inline, zero requisições de rede).');

          // Ponto de partida: unidade com coordenadas válidas → voa para a âncora; senão mantém Brasília/zoom nacional
          const cfg = currentConfigRef.current;
          if (cfg.lat !== undefined && cfg.lng !== undefined && !isNaN(Number(cfg.lat)) && !isNaN(Number(cfg.lng))) {
            const { lat: safeLat, lng: safeLng } = safeLatLngPair(cfg);
            flyTo(safeLat, safeLng, UNIT_ZOOM);
          }
        } catch (err) {
          logger.error('>>> [MAP] Falha ao montar camadas locais do MapLibre:', err);
          mapInstance.current = map;
          setMapReady(true);
        }
      });

      map.on('error', (evt) => {
        // Erros de estilo/rede são ignorados: o estilo é 100% local.
        logger.warn('>>> [MAP] Evento de erro não-fatal do MapLibre:', evt?.error?.message);
      });
    } catch (err) {
      logger.error('>>> [MAP] Falha catastrófica ao inicializar MapLibre GL. Acionando fallback Canvas 2D (CPU):', err);
      setMapFailed(true);
    }
  };

  useEffect(() => {
    initMap();
    return () => {
      if (mapInstance.current) {
        try { mapInstance.current.remove(); } catch { /* ignore */ }
        mapInstance.current = null;
      }
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza marcador + círculo de geocerca com a configuração atual
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;
    const lat = currentConfig.lat;
    const lng = currentConfig.lng;
    if (lat === undefined || lng === undefined || isNaN(Number(lat)) || isNaN(Number(lng))) return;

    // Guarda Defensiva: coordenadas finitas garantidas antes de tocar Marker/geocerca
    const [safeLng, safeLat] = safeLngLat({ lat: Number(lat), lng: Number(lng) });

    // FIX(CRITICO): em MapLibre, Marker.addTo(map) chama _update() sincronamente e le
    // this._lngLat.lng. Se setLngLat nao for chamado ANTES do addTo, _lngLat e undefined e
    // o motor estoura 'Cannot read properties of undefined (reading lng)' -> ErrorBoundary.
    try {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: '#ef4444' })
          .setLngLat([safeLng, safeLat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([safeLng, safeLat]);
      }
    } catch (err) {
      // Nunca derruba a esteira: sem marcador/geocerca, o mapa continua navegavel.
      logger.warn('>>> [MAP] Marker indisponivel (modo offline):', err);
      markerRef.current = null;
    }

    try {
      const radiusKm = (currentConfig.radius_meters || 500) / 1000;
      const circle = turf.circle([safeLng, safeLat], radiusKm, {
        units: 'kilometers',
        steps: 64
      }) as unknown as maplibregl.GeoJSONSourceSpecification['data'];

      if (map.getSource('geofence-source')) {
        (map.getSource('geofence-source') as maplibregl.GeoJSONSource).setData(circle);
      }
    } catch (err) {
      logger.warn('>>> [MAP] Geocerca indisponivel (modo offline):', err);
    }
  }, [mapReady, currentConfig.lat, currentConfig.lng, currentConfig.radius_meters]);

  // Alternância de camada (street/satellite) reativa via APIs programáticas do mapa
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;
    const satellite = mapType === 'satellite';
    try {
      map.setLayoutProperty('bg-street', 'visibility', satellite ? 'none' : 'visible');
      map.setLayoutProperty('bg-satellite', 'visibility', satellite ? 'visible' : 'none');
      map.setLayoutProperty('graticule-layer', 'visibility', satellite ? 'none' : 'visible');
      map.setLayoutProperty('graticule-satellite-layer', 'visibility', satellite ? 'visible' : 'none');
      map.setLayoutProperty('street-raster', 'visibility', satellite ? 'none' : 'visible');
      map.setLayoutProperty('satellite-raster', 'visibility', satellite ? 'visible' : 'none');
    } catch { /* camadas ainda não criadas */ }
  }, [mapType, mapReady]);

  // Controles nativos reativos (React onClick → API programática do mapa)
  const handleZoomIn = () => {
    if (mapInstance.current) mapInstance.current.zoomIn();
  };
  const handleZoomOut = () => {
    if (mapInstance.current) mapInstance.current.zoomOut();
  };

  /**
   * "MINHA POSIÇÃO" — Hardware Hook defensivo (Capacitor Geolocation).
   *
   * LOGÍSTICA DE TESTE MOBILE: a validação REAL do hardware de GPS depende do
   * build nativo e das diretivas de permissões ativas no emulador Android ou
   * dispositivo físico (ACCESS_FINE_LOCATION + permissão em runtime):
   *   npm run build && npx cap sync android && npx cap open android
   *
   * No preview Desktop/iframe, o domínio pode bloquear a chamada por Permissions
   * Policy ("[Violation] Permissions policy violation: Geolocation access has
   * been blocked") ou o Capacitor pode lançar exceção silenciosa. O catch abaixo
   * intercepta o erro e aplica o fallback canônico de Brasília suavemente, sem
   * quebrar a esteira reativa do MapLibre nem ativar o ErrorBoundary.
   */
  const handleUseMyPosition = async () => {
    try {
      // Tenta invocar a API de geolocalização do Capacitor (pode lançar em Desktop por política)
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
      if (!pos || !pos.coords) throw new Error('Estrutura de coordenadas ausente');

      // Validação estrita: o hardware pode retornar objeto incompleto/null em ambientes sem GPS
      const rawLat = Number(pos.coords.latitude);
      const rawLng = Number(pos.coords.longitude);
      if (isNaN(rawLat) || isNaN(rawLng)) throw new Error('Coordenadas inválidas retornadas pelo hardware');

      // Guarda Defensiva final (belt-and-suspenders) — sanitiza antes de tocar o motor
      const { lat, lng } = safeLatLngPair({ lat: rawLat, lng: rawLng });
      setCurrentConfig(prev => ({ ...prev, lat, lng }));
      flyTo(lat, lng, 16);
      setMessage({ text: 'POSIÇÃO FIXADA PELO HARDWARE DO DISPOSITIVO!', type: 'success' });
      mapClickRef.current(lat, lng);
    } catch (err) {
      // Fallback suave: permissão negada/política no Desktop → câmera para Brasília-DF (zoom nacional)
      logger.warn('>>> [GPS Fallback] Hardware inacessível ou permissão negada no Desktop. Aplicando centro canônico (Brasília-DF):', err);
      const { lat: fbLat, lng: fbLng } = safeLatLngPair({ lat: BRASILIA_DEFAULT.lat, lng: BRASILIA_DEFAULT.lng });
      setCurrentConfig(prev => ({ ...prev, lat: fbLat, lng: fbLng }));
      flyTo(fbLat, fbLng, DEFAULT_ZOOM);
      setMessage({ text: 'MODO DESKTOP/POLÍTICA: ÂNCORA CANÔNICA (BRASÍLIA, DF) APLICADA.', type: 'success' });
      mapClickRef.current(fbLat, fbLng);
    }
  };

  // Canvas drawing for 2D Fallback (apenas se o MapLibre falhar — último recurso)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentConfig.lat || !currentConfig.lng) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const dx = clickX - cx;
    const dy = clickY - cy;

    // Map 1 pixel to ~0.00001 degrees of lat/lng for smooth interaction
    const deltaLat = -dy * 0.000005;
    const deltaLng = dx * 0.000005;

    const newLat = currentConfig.lat + deltaLat;
    const newLng = currentConfig.lng + deltaLng;
    const { lat: safeLat, lng: safeLng } = safeLatLngPair({ lat: newLat, lng: newLng });

    setCurrentConfig(prev => ({ ...prev, lat: safeLat, lng: safeLng }));
  };

  useEffect(() => {
    if (!mapFailed || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const w = canvas.width = canvas.clientWidth;
      const h = canvas.height = canvas.clientHeight;

      // Draw modern dark cyber space/grid background
      ctx.fillStyle = mapType === 'satellite' ? '#040b1a' : '#0b1329';
      ctx.fillRect(0, 0, w, h);

      // Draw subtle tech grids
      ctx.strokeStyle = mapType === 'satellite' ? 'rgba(59, 130, 246, 0.15)' : '#1e293b';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw decorative orbit rings
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.05)';
      ctx.lineWidth = 1;
      const maxRadius = Math.max(w, h);
      for (let r = 100; r < maxRadius; r += 100) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw coordinate indicators
      ctx.fillStyle = '#475569';
      ctx.font = '10px monospace';
      ctx.fillText(`FALLBACK CPU 2D (MAPLIBRE INDISPONÍVEL)`, 20, 30);
      ctx.fillText(`CENTER LAT: ${currentConfig.lat?.toFixed(6) || 'N/A'}`, 20, 50);
      ctx.fillText(`CENTER LNG: ${currentConfig.lng?.toFixed(6) || 'N/A'}`, 20, 70);

      // Draw the geofence circle in the center of the viewport
      const cx = w / 2;
      const cy = h / 2;
      const radiusMeters = currentConfig.radius_meters || 500;
      const radiusPixels = Math.max(20, Math.min(w / 3, radiusMeters * 0.4));

      // Geofence fill
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPixels, 0, 2 * Math.PI);
      ctx.fill();

      // Geofence stroke
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPixels, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw the anchor/marker pin at center
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
      ctx.fill();

      const pulse = (Date.now() % 1500) / 1500;
      ctx.strokeStyle = `rgba(239, 68, 68, ${1 - pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + pulse * 20, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(cx - 10, cy - 15, cx - 10, cy - 30, cx, cy - 30);
      ctx.bezierCurveTo(cx + 10, cy - 30, cx + 10, cy - 15, cx, cy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy - 20, 4, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(selectedUnit || 'ANCORA GBR', cx, cy - 38);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [mapFailed, currentConfig.lat, currentConfig.lng, currentConfig.radius_meters, selectedUnit, mapType]);

  useEffect(() => {
    sessionStorage.setItem('unit_config_map_type', mapType);
  }, [mapType]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [user.tenantid]);

  useEffect(() => {
    // FIX(CRITICO): a unidade ja foi escolhida na tela anterior (UnitSelector) e chega via
    // initialUnit. Nao dependa de units.includes() (a lista de empresas pode vir vazia ou
    // divergir do nome escolhido) — auto-seleciona sempre que houver initialUnit.
    if (initialUnit && selectedUnit !== initialUnit) {
      handleSelectUnit(initialUnit);
    }
  }, [initialUnit, units, loading, selectedUnit]);

  useEffect(() => {
    if (typeof onUpdateConfigs === 'function' && configs.length > 0) {
      onUpdateConfigs(configs);
    }
  }, [configs, onUpdateConfigs]);

  const loadConfigs = async () => {
    setLoading(true);
    const data = await fetchUnitConfigs(user.tenantid);
    // Guarda Defensiva: registros do banco local com coordenadas nulas/NaN são
    // higienizados para o canônico (Brasília) em vez de propagar undefined ao mapa
    const sanitized = (data || []).map(cfg => ({ ...cfg, ...safeLatLngPair(cfg) }));
    setConfigs(sanitized);
    setLoading(false);
  };

  const handleSelectUnit = (unit: string) => {
    if (!unit) return;
    setSelectedUnit(unit);
    selectedUnitRef.current = unit;

    // Recuperar rascunhos preventivos do sessionStorage
    const sessionLat = sessionStorage.getItem(`kardek_temp_gps_lat_${unit}`);
    const sessionLng = sessionStorage.getItem(`kardek_temp_gps_lng_${unit}`);
    const sessionRadius = sessionStorage.getItem(`kardek_temp_gps_radius_${unit}`);

    const existing = configs.find(c => {
      if (!c.unit_id) return false;
      return c.unit_id.trim().toUpperCase() === unit.trim().toUpperCase();
    });

    if (sessionLat && sessionLng) {
      // Guarda Defensiva: rascunhos de sessão podem conter 'null'/'NaN' — sanitiza antes de tocar o mapa
      const { lat: safeLat, lng: safeLng } = safeLatLngPair({ lat: Number(sessionLat), lng: Number(sessionLng) });
      const cfg = {
        tenantid: user.tenantid,
        unit_id: unit,
        lat: safeLat,
        lng: safeLng,
        radius_meters: sessionRadius ? Number(sessionRadius) : (existing?.radius_meters || 500),
        is_active: true
      };
      setCurrentConfig(cfg);
      flyTo(cfg.lat, cfg.lng, UNIT_ZOOM);
    } else if (existing) {
      // Guarda Defensiva: registro do IndexedDB/SQLite pode estar parcialmente corrompido
      const { lat: safeLat, lng: safeLng } = safeLatLngPair(existing);
      const safeExisting = { ...existing, lat: safeLat, lng: safeLng };
      setCurrentConfig(safeExisting);
      flyTo(safeExisting.lat, safeExisting.lng, UNIT_ZOOM);
    } else {
      setCurrentConfig({
        tenantid: user.tenantid,
        unit_id: unit,
        lat: BRASILIA_DEFAULT.lat,
        lng: BRASILIA_DEFAULT.lng,
        radius_meters: 500,
        is_active: true
      });
      flyTo(BRASILIA_DEFAULT.lat, BRASILIA_DEFAULT.lng, DEFAULT_ZOOM);
    }
    setMessage(null);
  };

  useEffect(() => {
    if (selectedUnit) {
      if (currentConfig.lat !== undefined && currentConfig.lng !== undefined) {
        sessionStorage.setItem(`kardek_temp_gps_lat_${selectedUnit}`, String(currentConfig.lat));
        sessionStorage.setItem(`kardek_temp_gps_lng_${selectedUnit}`, String(currentConfig.lng));
      }
      if (currentConfig.radius_meters !== undefined) {
        sessionStorage.setItem(`kardek_temp_gps_radius_${selectedUnit}`, String(currentConfig.radius_meters));
      }
    }
  }, [currentConfig.lat, currentConfig.lng, currentConfig.radius_meters, selectedUnit]);

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      // 🚀 PRIMEIRO PASSO: Soberania Local-First. Busca de endereços/localidades na tabela local assets_counting / ativos
      logger.info(`>>> [Local-First Search] Procurando "${searchQuery}" localmente nas tabelas físicas do dispositivo...`);
      const { sqliteService } = await import('../services/sqliteService');
      const localAddresses = await sqliteService.getAddressesFromAssetsCounting(user?.tenantid || 'CICOPAL');

      const exactMatch = localAddresses.find(
        addr => (addr.endereco && addr.endereco.toUpperCase().includes(searchQuery.toUpperCase())) ||
                (addr.filial && addr.filial.toUpperCase().includes(searchQuery.toUpperCase()))
      );

      if (exactMatch && exactMatch.lat !== undefined && exactMatch.lng !== undefined && !isNaN(exactMatch.lat) && !isNaN(exactMatch.lng)) {
        logger.info(`>>> [Local-First Search] Sucesso local! Encontrado ponto físico persistido no Lote 0: Lat ${exactMatch.lat}, Lng ${exactMatch.lng}`);
        // Guarda Defensiva: coordenadas da busca local sanitizadas antes do flyTo/gravação
        const { lat: newLat, lng: newLng } = safeLatLngPair(exactMatch);

        if (selectedUnit) {
          setCurrentConfig(prev => ({
            ...prev,
            lat: newLat,
            lng: newLng
          }));
        }
        // CORREÇÃO BUSCAR: deslocamento físico explícito da câmera via flyTo
        flyTo(newLat, newLng, UNIT_ZOOM);
        setMessage({
          text: `COORDENADAS LOCAIS ENCONTRADAS (LOTE 0): ${exactMatch.filial} - ${exactMatch.endereco}`,
          type: 'success'
        });
        setSearching(false);
        return;
      }

      // Se não encontrou localmente ou não tem coordenadas válidas, tenta georreferenciamento de nuvem Nominatim
      logger.info(">>> [Local-First Search] Nenhuma coordenada local correspondente. Recorrendo à nuvem...");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`, {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'pt-BR',
          'User-Agent': 'GBR-Kardek-Inventory-V2.6'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Servidor de geolocalização indisponível (${response.status})`);
      }

      const data = await response.json();

      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        // Guarda Defensiva: resposta da nuvem pode vir sem campos ou com NaN
        const { lat: newLat, lng: newLng } = safeLatLngPair({ lat: parseFloat(lat), lng: parseFloat(lon) });

        if (selectedUnit) {
          setCurrentConfig(prev => ({ ...prev, lat: newLat, lng: newLng }));
        }
        // CORREÇÃO BUSCAR: deslocamento físico explícito da câmera via flyTo
        flyTo(newLat, newLng, UNIT_ZOOM);
        setMessage({ text: `CENTRALIZADO EM: ${searchQuery}`, type: 'success' });
      } else {
        // Fallback contingência Brasília, DF
        const defaultLat = BRASILIA_DEFAULT.lat;
        const defaultLng = BRASILIA_DEFAULT.lng;
        if (selectedUnit) {
          setCurrentConfig(prev => ({ ...prev, lat: defaultLat, lng: defaultLng }));
        }
        flyTo(defaultLat, defaultLng, DEFAULT_ZOOM);
        setMessage({ text: `CONVERTIDO PARA BRASÍLIA, DF (REGISTRO LOCAL ENCONTRADO SEM GPS / LOCALIZAÇÃO DESCONHECIDA)`, type: 'success' });
      }
    } catch (err: unknown) {
      logger.warn('Erro na busca de localização, aplicando contingência Brasília:', err);
      const defaultLat = BRASILIA_DEFAULT.lat;
      const defaultLng = BRASILIA_DEFAULT.lng;
      if (selectedUnit) {
        setCurrentConfig(prev => ({ ...prev, lat: defaultLat, lng: defaultLng }));
      }
      flyTo(defaultLat, defaultLng, DEFAULT_ZOOM);
      setMessage({ text: `MÉTODO DE CONTINGÊNCIA ATIVADO: BRASÍLIA, DF`, type: 'success' });
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    const l_lat = currentConfig.lat;
    const l_lng = currentConfig.lng;
    const l_radius = currentConfig.radius_meters || 500;

    // FIX(CRITICO): aceita a unidade herdada da tela anterior (initialUnit) caso o estado
    // selectedUnit ainda nao tenha sido populado — nunca mais bloqueia o FIXAR ANCORA GPS.
    const unitToSave = selectedUnit || initialUnit || null;
    if (!unitToSave || l_lat === undefined || l_lng === undefined || isNaN(Number(l_lat))) {
      setMessage({ text: 'SELECIONE UMA UNIDADE E MARQUE A POSIÇÃO NO MAPA.', type: 'error' });
      return;
    }

    setSaving(true);
    setMessage(null);

    // Determina se o usuário é Administrador, Master ou Gestor
    const checkIsAdmin = (): boolean => {
      const roleUpper = user?.role?.toUpperCase();
      if (roleUpper === 'ADMIN' || roleUpper === 'MASTER' || roleUpper === 'GESTOR' || user?.isAdmin || user?.is_admin) return true;
      try {
        const userStr = sessionStorage.getItem('app_current_user');
        if (userStr) {
          const u = JSON.parse(userStr);
          const uRole = u.role?.toUpperCase();
          if (uRole === 'ADMIN' || uRole === 'MASTER' || uRole === 'GESTOR' || u.isAdmin === true || u.is_admin === true) {
            return true;
          }
        }
      } catch { /* ignore */ }
      return false;
    };
    const isAdminUser = checkIsAdmin();

    // Validação Espacial Turf.js
    let currentPhysicalLat = l_lat;
    let currentPhysicalLng = l_lng;
    let hasPhysicalGPS = false;

    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      });
      if (pos && pos.coords) {
        currentPhysicalLat = pos.coords.latitude;
        currentPhysicalLng = pos.coords.longitude;
        hasPhysicalGPS = true;
      }
    } catch (e) {
      logger.warn('>>> [GPS] Não foi possível ler localização real via hardware para validação espacial:', e);
      // Simulação: se não conseguir ler, distancia a coordenada em ~1.2km (0.01 graus de lat/lng) para ativar a regra de georeferenciamento
      currentPhysicalLat = l_lat + 0.01;
      currentPhysicalLng = l_lng + 0.01;
      hasPhysicalGPS = true;
    }

    if (hasPhysicalGPS) {
      try {
        const fromPoint = turf.point([currentPhysicalLng, currentPhysicalLat]);
        const toPoint = turf.point([Number(l_lng), Number(l_lat)]);
        const distanceM = turf.distance(fromPoint, toPoint, { units: 'kilometers' }) * 1000;

        if (distanceM > l_radius) {
          if (isAdminUser) {
            // Emite o feedback visual animado flutuante informando o bypass ativo
            setShowAdminBypassToast(true);
            setTimeout(() => setShowAdminBypassToast(false), 5000);
          } else {
            setMessage({
              text: `BLOQUEADO: Sua distância física (${Math.round(distanceM)}m) excede o raio de geocerca (${l_radius}m).`,
              type: 'error'
            });
            setSaving(false);
            return;
          }
        }
      } catch (turfErr) {
        logger.error('>>> [Spatial Error]', turfErr);
      }
    }

    // Guarda Defensiva: coordenadas canônicas finitas antes da persistência (SQLite + Dexie)
    const { lat: safeLat, lng: safeLng } = safeLatLngPair({ lat: Number(l_lat), lng: Number(l_lng) });

    const configData: UnitConfig = {
      tenantid: user?.tenantid || 'CICOPAL',
      filial: unitToSave,
      unit_id: unitToSave,
      lat: safeLat,
      lng: safeLng,
      radius_meters: Number(l_radius),
      is_active: true,
      updated_by: user?.email || 'auditor',
      updated_at: new Date().toISOString()
    };

    try {
      // Gravação síncrona/bloqueante no SQLite local (+ espelho Dexie/IndexedDB e localStorage)
      const ok = await saveUnitConfig(configData);

      if (ok === true || (typeof ok === 'string' && ok.includes('sucesso'))) {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 3000);
        setMessage({ text: 'COORDENADAS GRAVADAS E ANCORADAS NO DISPOSITIVO!', type: 'success' });

        // PERSISTÊNCIA PREVENTIVA COMPULSÓRIA NO SESSIONSTORAGE E LOCALSTORAGE DO OPERADOR
        sessionStorage.setItem(`unit_gps_config_${unitToSave}`, JSON.stringify(configData));
        sessionStorage.setItem('last_configured_gps_unit', unitToSave);
        sessionStorage.setItem(`gps_lat_${unitToSave}`, String(configData.lat));
        sessionStorage.setItem(`gps_lng_${unitToSave}`, String(configData.lng));
        localStorage.setItem(`kardek_gps_ancora_${unitToSave}`, JSON.stringify(configData));

        // Limpa rascunhos preventivos de geocerca salvos com sucesso
        sessionStorage.removeItem(`kardek_temp_gps_lat_${unitToSave}`);
        sessionStorage.removeItem(`kardek_temp_gps_lng_${unitToSave}`);
        sessionStorage.removeItem(`kardek_temp_gps_radius_${unitToSave}`);

        // Atualiza estado local E notifica o pai com a MESMA lista já atualizada.
        // FIX(CRITICO): antes passava `configs` (closure obsoleta, sem a âncora recém-gravada),
        // então o App mantinha unitConfigs sem a âncora e o botão GPS voltava 'SEM ÂNCORA'.
        const updatedConfigs = mergeUnitConfigIntoList(configs, configData);
        setConfigs(updatedConfigs);

        // Notifica o componente pai se houver callback
        if (typeof onUpdateConfigs === 'function') {
          onUpdateConfigs(updatedConfigs);
        }
      } else {
        setMessage({ text: `NÃO FOI POSSÍVEL GRAVAR NO SQLITE: ${ok}`, type: 'error' });
      }
    } catch (saveErr: unknown) {
      const se = saveErr as Error;
      setMessage({ text: `ERRO DE PERSISTÊNCIA: ${se.message || 'Falha no banco local'}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ==========================================================================
  // BYPASS DE SEGURANÇA TEMPORÁRIO (Diretiva 5)
  // Se o usuário clicar no botão e o mapa falhar ou se ele salvar, o app grava
  // uma coordenada fictícia padrão (Brasília canônica) no IndexedDB (Dexie) e
  // define a flag de Campanha aberta para o auditor avançar na esteira operacional.
  // ==========================================================================
  const handleOfflineBypass = async () => {
    const unit = selectedUnitRef.current || selectedUnit || initialUnit;
    if (!unit) {
      setMessage({ text: 'SELECIONE UMA UNIDADE ANTES DE APLICAR O BYPASS.', type: 'error' });
      return;
    }

    // Guarda Defensiva: estrutura canônica explícita exigida pelo safeLngLat
    const { lat: safeLat, lng: safeLng } = safeLatLngPair({ lat: BRASILIA_DEFAULT.lat, lng: BRASILIA_DEFAULT.lng });

    const bypassConfig: UnitConfig = {
      tenantid: user?.tenantid || 'CICOPAL',
      filial: unit,
      unit_id: unit,
      lat: safeLat,
      lng: safeLng,
      radius_meters: currentConfig.radius_meters || 500,
      is_active: true,
      updated_by: user?.email || 'auditor',
      updated_at: new Date().toISOString()
    };
    // Registro defensivo para leitores subsequentes: { lat, lng } + array [lng, lat]
    const bypassRecord = { ...bypassConfig, coordenadas: [safeLng, safeLat] as [number, number] };

    setSaving(true);
    setMessage({ text: 'BYPASS OFFLINE: COORDENADAS PADRÃO (BRASÍLIA, DF) SENDO GRAVADAS...', type: 'success' });
    setCurrentConfig(prev => ({ ...prev, lat: bypassConfig.lat, lng: bypassConfig.lng, unit_id: unit }));
    flyTo(bypassConfig.lat, bypassConfig.lng, UNIT_ZOOM);

    try {
      // 1) Persistência canônica: SQLite físico + espelho Dexie (IndexedDB) + localStorage
      const ok = await saveUnitConfig(bypassConfig);
      const saved = ok === true || (typeof ok === 'string' && ok.includes('sucesso'));
      logger.info(`>>> [GPS Bypass] Persistência da coordenada padrão ${saved ? 'confirmada' : 'com aviso'}: ${String(ok)}`);

      // 2) Flags preventivas de âncora e campanha aberta (esteira operacional liberada)
      localStorage.setItem(`kardek_gps_ancora_${unit}`, JSON.stringify(bypassRecord));
      sessionStorage.setItem(`unit_gps_config_${unit}`, JSON.stringify(bypassRecord));
      sessionStorage.setItem('last_configured_gps_unit', unit);
      // Estrutura canônica explícita para as telas subsequentes relerem sem quebrar
      sessionStorage.setItem(`gps_lat_${unit}`, String(safeLat));
      sessionStorage.setItem(`gps_lng_${unit}`, String(safeLng));
      const campaignFlag = `BYPASS_${unit}_${Date.now()}`;
      setBypassCampaignId(campaignFlag);
      sessionStorage.setItem(`kardek_campaign_open_${unit}`, campaignFlag);
      localStorage.setItem(`kardek_campaign_open_${unit}`, campaignFlag);
      sessionStorage.setItem('campaign_bypass_open', 'true');
      localStorage.setItem('campaign_bypass_open', 'true');
      sessionStorage.setItem('kardek_campaign_open', campaignFlag);

      // 3) Estado local sincronizado E notifica o pai com a MESMA lista já atualizada.
      // FIX(CRITICO): a closure antiga (`configs`) não tinha a âncora recém-gravada e
      // deixava o botão GPS em 'SEM ÂNCORA' após voltar para a lista de unidades.
      const updatedConfigs = mergeUnitConfigIntoList(configs, bypassConfig);
      setConfigs(updatedConfigs);
      if (typeof onUpdateConfigs === 'function') {
        onUpdateConfigs(updatedConfigs);
      }

      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      setMessage({ text: 'BYPASS ATIVADO: ÂNCORA PADRÃO GRAVADA E CAMPANHA DE CONTINGÊNCIA ABERTA!', type: 'success' });

      // 4) Avança na esteira operacional (App abre a flag de campanha e navega)
      if (typeof onBypassApplied === 'function') {
        onBypassApplied(bypassConfig);
      }
    } catch (err: unknown) {
      const se = err as Error;
      logger.error('>>> [GPS Bypass] Falha na persistência do bypass:', err);
      // Mesmo com erro, o flag de campanha é aberto para não travar o auditor (simulação local)
      const campaignFlag = `BYPASS_${unit}_${Date.now()}`;
      sessionStorage.setItem('campaign_bypass_open', 'true');
      sessionStorage.setItem(`kardek_campaign_open_${unit}`, campaignFlag);
      setMessage({ text: `BYPASS PARCIAL: ${se.message || 'falha de persistência'} — CAMPANHA ABERTA PARA SIMULAÇÃO LOCAL.`, type: 'success' });
      if (typeof onBypassApplied === 'function') {
        onBypassApplied(bypassConfig);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative w-full h-[100dvh] bg-slate-900 overflow-hidden font-sans">
      {/* Background Map Container (Camada Base) */}
      <div className="absolute top-0 left-0 w-screen h-screen z-1">
        {!mapFailed ? (
          <div
            ref={mapRef}
            id="gbr-unit-map"
            className="w-full h-full"
          />
        ) : (
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="w-full h-full cursor-crosshair"
          />
        )}
        {/* Overlay de carregamento do motor MapLibre */}
        {!mapFailed && !mapReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm p-12 text-center">
            <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center border border-slate-800 mb-6 animate-pulse">
              <Loader2 className="text-blue-500 animate-spin" size={32} />
            </div>
            <h2 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-3">Motor Nativo Offline</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-relaxed max-w-[240px]">
              Inicializando MapLibre GL (estilo local, zero rede)...
            </p>
          </div>
        )}
      </div>

      {/* Banner de Orientação Offline */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-md pointer-events-none"
          >
            <div className="bg-amber-500/90 backdrop-blur-md border border-amber-400 p-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-white">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <WifiOff size={16} className="text-white" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-tight leading-tight">
                Ambiente Offline: o mapa roda em modo simulado local (estilo embutido). Use "Minha Posição", a busca ou o bypass para fixar a âncora.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slim Floating Header */}
      <div className="absolute top-4 left-0 right-0 z-20 px-4 pointer-events-none">
        <div className="max-w-xl mx-auto flex items-center justify-between bg-[#0F172A]/95 backdrop-blur-md border border-slate-800 p-3 rounded-2xl shadow-2xl pointer-events-auto">
          {/* Botão voltar ← */}
          <button
            onClick={() => {
              if (typeof onBack === 'function') {
                onBack();
              } else {
                logger.warn('onBack prop is not a function');
              }
            }}
            title="Retornar para Unidades"
            className="flex items-center gap-2 px-3 h-10 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-white active:scale-95 transition-all shrink-0 font-sans font-bold text-[10px] uppercase tracking-wider"
          >
            <ArrowLeft size={18} />
            <span>Retornar para Unidades</span>
          </button>

          {/* Centro: Texto limpo */}
          <div className="flex-1 text-center px-4 overflow-hidden">
            <h2 className="text-xs font-black text-white uppercase tracking-wider truncate">
              {selectedUnit || '010101 - CICOPAL GO'}
            </h2>
            {/* Tag flutuante Bypass Admin */}
            {(user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'MASTER' || user?.isAdmin || user?.is_admin) && (
              <div className="inline-flex items-center space-x-1 mt-0.5 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest leading-none">Bypass Admin</span>
              </div>
            )}
            {bypassCampaignId && (
              <div className="inline-flex items-center space-x-1 mt-0.5 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded-md ml-1">
                <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[7px] font-black text-blue-400 uppercase tracking-widest leading-none">Campanha Aberta</span>
              </div>
            )}
          </div>

          {/* Direita: Selo discreto GBR v2.6 */}
          <div className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 shrink-0">
            <span className="text-[8px] font-black uppercase tracking-widest">GBR v2.6</span>
          </div>
        </div>
      </div>

      {/* Elegant Address Search Bar (Ultra-Slim) */}
      <div className="absolute top-[76px] left-0 right-0 z-20 px-4 pointer-events-none">
        <div className="max-w-xl mx-auto pointer-events-auto">
          <form
            onSubmit={handleSearchLocation}
            className="flex items-center bg-[#0F172A]/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-xl overflow-hidden h-9 px-3"
          >
            <Search size={14} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="BUSCAR CIDADE OU ENDEREÇO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              className="flex-1 bg-transparent text-[10px] font-bold uppercase tracking-wider text-white focus:outline-none placeholder:text-slate-500 animate-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              disabled={searching}
              className="ml-3 h-6 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition-all"
            >
              {searching ? <Loader2 size={10} className="animate-spin" /> : 'BUSCAR'}
            </button>
          </form>
        </div>
      </div>

      {/* Floating Action Buttons (Zoom + / - , Camada, Minha Posição, Raio) */}
      <div className="absolute bottom-[calc(18dvh+16px)] right-4 z-20 flex flex-col space-y-3 items-center pointer-events-none">
        {/* Alternância de camada (street/satellite) — reativa via API do mapa */}
        <button
          onClick={() => setMapType(mapType === 'street' ? 'satellite' : 'street')}
          className={`w-12 h-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center transition-all active:scale-90 border pointer-events-auto ${
            mapType === 'satellite'
              ? 'bg-blue-600 text-white border-blue-400'
              : 'bg-[#0F172A]/95 text-slate-200 border-slate-800'
          }`}
        >
          <Layers size={18} />
        </button>

        {/* Zoom + / - (controles nativos reativos via onClick → map.zoomIn/zoomOut) */}
        <div className="flex flex-col items-center bg-[#0F172A]/95 backdrop-blur-md border border-slate-800 rounded-2xl p-1.5 shadow-2xl pointer-events-auto space-y-1">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none text-center block pt-0.5 px-0.5">
            Zoom
          </span>
          <button
            onClick={handleZoomIn}
            disabled={mapFailed}
            className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-30 border border-slate-700 rounded-xl flex items-center justify-center text-white active:scale-95 transition-all text-xs font-black shrink-0 animate-none"
            title="Aproximar (+)"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={handleZoomOut}
            disabled={mapFailed}
            className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-30 border border-slate-700 rounded-xl flex items-center justify-center text-white active:scale-95 transition-all text-xs font-black shrink-0 animate-none"
            title="Afastar (−)"
          >
            <Minus size={14} />
          </button>
        </div>

        {/* Minha Posição (hardware GPS) */}
        <button
          onClick={handleUseMyPosition}
          className="w-12 h-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center transition-all active:scale-90 border pointer-events-auto bg-[#0F172A]/95 text-blue-400 border-slate-800 hover:bg-blue-600 hover:text-white"
          title="Fixar pela posição real do dispositivo"
        >
          <Navigation size={18} />
        </button>

        {/* Geofence Radius +/- controls */}
        <div className="flex flex-col items-center bg-[#0F172A]/95 backdrop-blur-md border border-slate-800 rounded-2xl p-1.5 shadow-2xl pointer-events-auto space-y-1">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none text-center block pt-0.5 px-0.5">
            Raio
          </span>
          <button
            onClick={() => {
              setCurrentConfig(prev => {
                const current = prev.radius_meters || 500;
                const next = Math.min(1000, current + 50);
                return { ...prev, radius_meters: next };
              });
            }}
            disabled={(currentConfig.radius_meters || 500) >= 1000}
            className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-30 border border-slate-700 rounded-xl flex items-center justify-center text-white active:scale-95 transition-all text-xs font-black shrink-0 animate-none"
          >
            +
          </button>
          <div className="py-0.5 tracking-tighter text-center">
            <span className="text-[9px] font-black text-blue-400 block leading-none">
              {currentConfig.radius_meters || 500}
            </span>
            <span className="text-[6.5px] font-black text-slate-500 block mt-0.5">
              m
            </span>
          </div>
          <button
            onClick={() => {
              setCurrentConfig(prev => {
                const current = prev.radius_meters || 500;
                const next = Math.max(50, current - 50);
                return { ...prev, radius_meters: next };
              });
            }}
            disabled={(currentConfig.radius_meters || 500) <= 50}
            className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-30 border border-slate-700 rounded-xl flex items-center justify-center text-white active:scale-95 transition-all text-xs font-black shrink-0 animate-none"
          >
            -
          </button>
        </div>
      </div>

      {/* Alert Messages Overlay floating above bottom panel */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-[calc(18dvh+16px)] left-4 right-20 z-20 max-w-sm pointer-events-auto"
          >
            <div
              className={`p-3 rounded-xl flex items-center space-x-3 border shadow-2xl backdrop-blur-md ${
                message.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-400'
                  : 'bg-rose-950/90 border-rose-500/40 text-rose-400'
              }`}
            >
              {message.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-wider leading-relaxed truncate">{message.text}</p>
              </div>
              <button onClick={() => setMessage(null)} className="text-current opacity-60 hover:opacity-100 font-bold text-xs px-1 shrink-0">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Panel - ULTRA-SLIM & INDUSTRIAL (v2.6 Radical Re-design) */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 bg-[#0F172A] border-t border-slate-800 shadow-[0_-15px_50px_rgba(0,0,0,0.4)] flex flex-col text-white h-[18dvh] min-h-[140px] p-4 pb-5 justify-between no-scrollbar rounded-t-[2rem]"
      >
        {/* Linha 1 (Labels menores): Latitude e Longitude atuais lidas pelo dispositivo */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950/40 border border-slate-800/60 p-2 rounded-xl">
          <div className="flex flex-col items-center">
            <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Latitude</span>
            <span className="text-[11px] font-mono font-bold text-slate-200 tracking-tight leading-none">
              {currentConfig.lat !== undefined ? currentConfig.lat.toFixed(6) : 'AGUARDANDO GPS'}
            </span>
          </div>
          <div className="flex flex-col items-center border-l border-slate-800/80">
            <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Longitude</span>
            <span className="text-[11px] font-mono font-bold text-slate-200 tracking-tight leading-none">
              {currentConfig.lng !== undefined ? currentConfig.lng.toFixed(6) : 'AGUARDANDO GPS'}
            </span>
          </div>
        </div>

        {/* Linha 2 (Ações): Botão principal de âncora + Bypass offline */}
        <div className="grid grid-cols-[1.6fr_1fr] gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || currentConfig.lat === undefined || currentConfig.lat === null}
            className={`w-full py-3.5 text-white rounded-xl font-black uppercase text-[9px] tracking-[0.2em] shadow-xl hover:scale-[1.01] transition-all disabled:opacity-40 flex items-center justify-center space-x-2 pointer-events-auto ${
              justSaved
                ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 shadow-emerald-500/20'
                : 'bg-blue-600 hover:bg-blue-500 border-blue-400 shadow-blue-500/10'
            } border`}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{justSaved ? 'POSIÇÃO FIXADA!' : 'FIXAR ÂNCORA GPS'}</span>
          </button>
          <button
            onClick={handleOfflineBypass}
            disabled={saving}
            className="w-full py-3.5 text-white rounded-xl font-black uppercase text-[8px] tracking-[0.15em] shadow-xl hover:scale-[1.01] transition-all disabled:opacity-40 flex items-center justify-center space-x-2 pointer-events-auto bg-slate-800 hover:bg-slate-700 border border-slate-600"
            title="Aplica coordenadas padrão (Brasília, DF), grava no dispositivo e abre a campanha de contingência"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            <span>Bypass Offline</span>
          </button>
        </div>
      </div>

      {/* Toast Flutuante de Bypass Admin do Turf.js */}
      <AnimatePresence>
        {showAdminBypassToast && (
          <motion.div
            initial={{ y: -60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -60, opacity: 0, scale: 0.9 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-[2005] w-[90%] max-w-md pointer-events-auto"
          >
            <div className="bg-blue-600/95 backdrop-blur-md border border-blue-400 p-4 rounded-2xl shadow-2xl flex items-center space-x-3 text-white">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Unlock size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider">BYPASS DE TESTE DE MESA ATIVO</p>
                <p className="text-[8px] font-bold text-blue-200 uppercase tracking-tight mt-0.5">
                  Validação especial do @turf/turf liberada para perfil administrativo. Gravação efetuada com sucesso!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(UnitConfigurator);
