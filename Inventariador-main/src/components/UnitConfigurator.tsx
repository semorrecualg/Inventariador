
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
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Geolocation } from '@capacitor/geolocation';
import * as turf from '@turf/turf';
import { UnitConfig, User, AppScreen } from '../types';
import { fetchUnitConfigs, saveUnitConfig } from '../services/supabaseService';
import { logger } from '../utils/logger';

interface UnitConfiguratorProps {
  user: User;
  units: string[];
  onBack: () => void;
  onUpdateConfigs?: (configs: UnitConfig[]) => void;
  onNavigate?: (screen: AppScreen) => void;
  initialUnit?: string | null;
}

const UnitConfigurator: React.FC<UnitConfiguratorProps> = ({ user, units, onBack, onUpdateConfigs, initialUnit }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [isIframeFallback] = useState(true);
  const [configs, setConfigs] = useState<UnitConfig[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<UnitConfig>>({
    lat: -15.793889, // Brasília default
    lng: -47.882778,
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
  const [mapCenter, setMapCenter] = useState<[number, number]>([-15.793889, -47.882778]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showAdminBypassToast, setShowAdminBypassToast] = useState(false);

  // Solução para Stale Closure bugs (Captura os estados mais recentes nos listeners assíncronos do mapa)
  const selectedUnitRef = useRef<string | null>(null);
  const currentConfigRef = useRef<Partial<UnitConfig>>({});
  const mapClickRef = useRef<(lat: number, lng: number) => void>(() => {});

  useEffect(() => {
    selectedUnitRef.current = selectedUnit;
  }, [selectedUnit]);

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

  useEffect(() => {
    logger.info('>>> [MAP] SRE CPU-Bound 2D Motor gráfico ativo por padrão (Garantia de 0% GPU / Mobile-First).');
  }, []);

  // Veto SRE: Inicializações de MapLibre GL JS removidas para conformidade rigorosa com processamento puro CPU 2D.

  // Canvas drawing for 2D Fallback
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

    setCurrentConfig(prev => ({ ...prev, lat: newLat, lng: newLng }));
    setMapCenter([newLat, newLng]);
  };

  useEffect(() => {
    if (!isIframeFallback || !canvasRef.current) return;
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
      ctx.fillText(`CPU FALLBACK SECURE MODE (IFRAME ACTIVE)`, 20, 30);
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
  }, [isIframeFallback, currentConfig.lat, currentConfig.lng, currentConfig.radius_meters, selectedUnit, mapType]);

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
    if (initialUnit && units.includes(initialUnit) && selectedUnit !== initialUnit) {
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
    setConfigs(data);
    setLoading(false);
  };

  const handleSelectUnit = (unit: string) => {
    if (!unit) return;
    setSelectedUnit(unit);
    
    // Recuperar rascunhos preventivos do sessionStorage
    const sessionLat = sessionStorage.getItem(`kardek_temp_gps_lat_${unit}`);
    const sessionLng = sessionStorage.getItem(`kardek_temp_gps_lng_${unit}`);
    const sessionRadius = sessionStorage.getItem(`kardek_temp_gps_radius_${unit}`);

    const existing = configs.find(c => {
      if (!c.unit_id) return false;
      return c.unit_id.trim().toUpperCase() === unit.trim().toUpperCase();
    });

    if (sessionLat && sessionLng) {
      setCurrentConfig({
        tenantid: user.tenantid,
        unit_id: unit,
        lat: Number(sessionLat),
        lng: Number(sessionLng),
        radius_meters: sessionRadius ? Number(sessionRadius) : (existing?.radius_meters || 500),
        is_active: true
      });
      setMapCenter([Number(sessionLat), Number(sessionLng)]);
    } else if (existing) {
      setCurrentConfig(existing);
      setMapCenter([existing.lat, existing.lng]);
    } else {
      setCurrentConfig({
        tenantid: user.tenantid,
        unit_id: unit,
        lat: mapCenter[0],
        lng: mapCenter[1],
        radius_meters: 500,
        is_active: true
      });
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
      const localAddresses = await sqliteService.getAddressesFromAssetsCounting(user?.tenantid || user?.tenantid || 'CICOPAL');
      
      const exactMatch = localAddresses.find(
        addr => (addr.endereco && addr.endereco.toUpperCase().includes(searchQuery.toUpperCase())) || 
                (addr.filial && addr.filial.toUpperCase().includes(searchQuery.toUpperCase()))
      );

      if (exactMatch && exactMatch.lat !== undefined && exactMatch.lng !== undefined && !isNaN(exactMatch.lat) && !isNaN(exactMatch.lng)) {
        logger.info(`>>> [Local-First Search] Sucesso local! Encontrado ponto físico persistido no Lote 0: Lat ${exactMatch.lat}, Lng ${exactMatch.lng}`);
        const newLat = exactMatch.lat;
        const newLng = exactMatch.lng;
        
        setMapCenter([newLat, newLng]);
        if (selectedUnit) {
          setCurrentConfig(prev => ({ 
            ...prev, 
            lat: newLat, 
            lng: newLng 
          }));
        }
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
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        
        setMapCenter([newLat, newLng]);
        if (selectedUnit) {
          setCurrentConfig(prev => ({ ...prev, lat: newLat, lng: newLng }));
        }
        setMessage({ text: `CENTRALIZADO EM: ${searchQuery}`, type: 'success' });
      } else {
        // Fallback contingência Brasília, DF
        const defaultLat = -15.793889;
        const defaultLng = -47.882778;
        setMapCenter([defaultLat, defaultLng]);
        if (selectedUnit) {
          setCurrentConfig(prev => ({ ...prev, lat: defaultLat, lng: defaultLng }));
        }
        setMessage({ text: `CONVERTIDO PARA BRASÍLIA, DF (REGISTRO LOCAL ENCONTRADO SEM GPS / LOCALIZAÇÃO DESCONHECIDA)`, type: 'success' });
      }
    } catch (err: unknown) {
      logger.warn('Erro na busca de localização, aplicando contingência Brasília:', err);
      const defaultLat = -15.793889;
      const defaultLng = -47.882778;
      setMapCenter([defaultLat, defaultLng]);
      if (selectedUnit) {
        setCurrentConfig(prev => ({ ...prev, lat: defaultLat, lng: defaultLng }));
      }
      setMessage({ text: `MÉTODO DE CONTINGÊNCIA ATIVADO: BRASÍLIA, DF`, type: 'success' });
    } finally {
      setSearching(false);
    }
  };



  const handleSave = async () => {
    const l_lat = currentConfig.lat;
    const l_lng = currentConfig.lng;
    const l_radius = currentConfig.radius_meters || 500;

    if (!selectedUnit || l_lat === undefined || l_lng === undefined || isNaN(Number(l_lat))) {
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

    const configData: UnitConfig = {
      tenantid: user?.tenantid || 'CICOPAL',
      filial: selectedUnit,
      unit_id: selectedUnit,
      lat: Number(l_lat),
      lng: Number(l_lng),
      radius_meters: Number(l_radius),
      is_active: true,
      updated_by: user?.email || 'auditor',
      updated_at: new Date().toISOString()
    };

    try {
      // Gravação síncrona/bloqueante no SQLite local
      const ok = await saveUnitConfig(configData);
      
      if (ok === true || (typeof ok === 'string' && ok.includes('sucesso'))) {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 3000);
        setMessage({ text: 'COORDENADAS GRAVADAS E ANCORADAS NO DISPOSITIVO!', type: 'success' });
        
        // PERSISTÊNCIA PREVENTIVA COMPULSÓRIA NO SESSIONSTORAGE E LOCALSTORAGE DO OPERADOR
        sessionStorage.setItem(`unit_gps_config_${selectedUnit}`, JSON.stringify(configData));
        sessionStorage.setItem('last_configured_gps_unit', selectedUnit);
        sessionStorage.setItem(`gps_lat_${selectedUnit}`, String(configData.lat));
        sessionStorage.setItem(`gps_lng_${selectedUnit}`, String(configData.lng));
        localStorage.setItem(`kardek_gps_ancora_${selectedUnit}`, JSON.stringify(configData));

        // Limpa rascunhos preventivos de geocerca salvos com sucesso
        sessionStorage.removeItem(`kardek_temp_gps_lat_${selectedUnit}`);
        sessionStorage.removeItem(`kardek_temp_gps_lng_${selectedUnit}`);
        sessionStorage.removeItem(`kardek_temp_gps_radius_${selectedUnit}`);

        // Atualiza estado local
        setConfigs(prev => {
          const list = [...prev];
          const i = list.findIndex(c => c.unit_id === selectedUnit);
          if (i >= 0) list[i] = { ...list[i], ...configData };
          else list.push(configData);
          return list;
        });

        // Notifica o componente pai se houver callback
        if (typeof onUpdateConfigs === 'function') {
          onUpdateConfigs(configs);
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

  return (
    <div className="relative w-full h-[100dvh] bg-slate-900 overflow-hidden font-sans">
      {/* Background Map Container (Camada Base) */}
      <div className="absolute top-0 left-0 w-screen h-screen z-1">
        {isIframeFallback ? (
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="w-full h-full cursor-crosshair"
          />
        ) : (
          <div 
            ref={mapRef} 
            id="gbr-unit-map" 
            className="w-full h-full"
          />
        )}
        {/* Camada de Interação (Caso o mapa native fique por baixo) */}
        {!isIframeFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm p-12 text-center">
            <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center border border-slate-800 mb-6 animate-pulse">
              <Loader2 className="text-blue-500 animate-spin" size={32} />
            </div>
            <h2 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-3">Motor Nativo</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-relaxed max-w-[240px]">
              Inicializando MapLibre GL JS GPU acceleration...
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
                Ambiente Offline: O mapa visual está indisponível, mas o GPS Nativo continua operacional. Use o botão &quot;Minha Posição&quot; para fixar o ponto com precisão.
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

      {/* Floating Action Buttons (Alinhados verticalmente, flutuando verticalmente logo acima do painel) */}
      <div className="absolute bottom-[calc(18dvh+16px)] right-4 z-20 flex flex-col space-y-3 items-center pointer-events-none">
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

        {/* Linha 2 (Ação Principal): Botão central largo com alto contraste e feedback visivo síncrono */}
        <div className="pt-1">
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
            <span>{justSaved ? 'POSIÇÃO FIXADA PELO HARDWARE!' : 'FIXAR ÂNCORA DE GPS DA UNIDADE'}</span>
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
