
import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, 
  Target, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  Layers,
  ArrowLeft,
  Calendar,
  ChevronUp,
  ChevronDown,
  Map as MapIcon,
  WifiOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Geolocation } from '@capacitor/geolocation';
import maplibregl from 'maplibre-gl';
import { UnitConfig, User, AppScreen } from '../types';
import { fetchUnitConfigs, saveUnitConfig } from '../services/supabaseService';
import { getCurrentLocation } from '../utils/gpsUtils';

interface UnitConfiguratorProps {
  user: User;
  units: string[];
  onBack: () => void;
  onUpdateConfigs?: (configs: UnitConfig[]) => void;
  onNavigate?: (screen: AppScreen) => void;
  initialUnit?: string | null;
}

const UnitConfigurator: React.FC<UnitConfiguratorProps> = ({ user, units, onBack, onUpdateConfigs, onNavigate, initialUnit }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  
  const [configs, setConfigs] = useState<UnitConfig[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<UnitConfig>>({
    lat: -15.7942, // Brasília default
    lng: -47.8822,
    radius_meters: 500,
    is_active: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapType, setMapType] = useState<'street' | 'satellite'>('street');
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-15.7942, -47.8822]);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [unitSearchTerm, setUnitSearchTerm] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    initMap();
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
      }
    };
  }, []);

  const initMap = () => {
    if (!mapRef.current || mapInstance.current) return;
    
    try {
      const map = new maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            'osm-raster': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors'
            }
          },
          layers: [
            {
              id: 'osm-layer',
              type: 'raster',
              source: 'osm-raster',
              minzoom: 0,
              maxzoom: 19
            }
          ]
        },
        center: [mapCenter[1], mapCenter[0]], // MapLibre uses [lng, lat]
        zoom: 15
      });

      map.on('load', () => {
        mapInstance.current = map;
        console.log('>>> [MAP] MapLibre GL JS Inicializado (Soberania Offline).');
        updateMapDisplay();
      });

      map.on('click', (e) => {
        handleMapClick(e.lngLat.lat, e.lngLat.lng);
      });
      
    } catch (err) {
      console.error('>>> [MAP] Falha ao inicializar MapLibre:', err);
    }
  };

  const createGeoJSONCircle = (center: [number, number], radiusInMeters: number, points: number = 64) => {
    const coords = { lat: center[0], lng: center[1] };
    const kgRadius = radiusInMeters / 1000; // converter para km
    const coordinates = [];
    const distanceX = kgRadius / (111.32 * Math.cos((coords.lat * Math.PI) / 180));
    const distanceY = kgRadius / 110.574;

    for (let i = 0; i < points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      coordinates.push([coords.lng + x, coords.lat + y]);
    }
    coordinates.push(coordinates[0]);

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates]
      }
    } as maplibregl.GeoJSONFeatureSelection;
  };

  const updateMapDisplay = () => {
    if (!mapInstance.current || !currentConfig.lat || !currentConfig.lng) return;

    try {
      const map = mapInstance.current;
      const center: [number, number] = [currentConfig.lng, currentConfig.lat];

      // 1. Atualizar Marcador
      if (markerRef.current) {
        markerRef.current.setLngLat(center);
      } else {
        markerRef.current = new maplibregl.Marker({ draggable: true })
          .setLngLat(center)
          .addTo(map);
        
        markerRef.current.on('dragend', () => {
          const lngLat = markerRef.current!.getLngLat();
          handleMapClick(lngLat.lat, lngLat.lng);
        });
      }

      // 2. Atualizar Geofence (Círculo)
      const radius = currentConfig.radius_meters || 500;
      const geojson = createGeoJSONCircle([currentConfig.lat, currentConfig.lng], radius);

      if (map.getSource('geofence')) {
        (map.getSource('geofence') as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource('geofence', {
          type: 'geojson',
          data: geojson
        });

        map.addLayer({
          id: 'geofence-fill',
          type: 'fill',
          source: 'geofence',
          layout: {},
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.2
          }
        });

        map.addLayer({
          id: 'geofence-outline',
          type: 'line',
          source: 'geofence',
          layout: {},
          paint: {
            'line-color': '#3b82f6',
            'line-width': 2,
            'line-dasharray': [2, 1]
          }
        });
      }

      // 3. Centralizar Câmera
      map.easeTo({ center, duration: 500 });
      
    } catch (err) {
      console.warn('>>> [MAP] Erro ao atualizar display do mapa:', err);
    }
  };

  useEffect(() => {
    if (mapInstance.current) {
      // MapLibre switch logic if satellite was supported via another raster source
      // For now we keep it simple with OSM
    }
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

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();

      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        
        setMapCenter([newLat, newLng]);
        if (selectedUnit) {
          setCurrentConfig(prev => ({ ...prev, lat: newLat, lng: newLng }));
        }
      } else {
        setMessage({ text: 'Localização não encontrada.', type: 'error' });
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Erro na busca de localização:', error);
      const errorMsg = error.name === 'AbortError' ? 'Tempo esgotado na busca.' : 'Erro ao buscar localização.';
      setMessage({ text: errorMsg, type: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectUnit = (unit: string) => {
    if (!unit) return;
    setSelectedUnit(unit);
    const existing = configs.find(c => {
      if (!c.unit_id) return false;
      return c.unit_id.trim().toUpperCase() === unit.trim().toUpperCase();
    });
    if (existing) {
      setCurrentConfig(existing);
      setMapCenter([existing.lat, existing.lng]);
    } else {
      setCurrentConfig({
        tenant_id: user.tenantid,
        unit_id: unit,
        lat: mapCenter[0],
        lng: mapCenter[1],
        radius_meters: 500,
        is_active: true
      });
    }
    setMessage(null);
    setIsSheetExpanded(false); // Recolhe o sheet ao selecionar
  };

  useEffect(() => {
    if (mapInstance.current) {
      updateMapDisplay();
    }
  }, [currentConfig.lat, currentConfig.lng, currentConfig.radius_meters]);

  const handleMapClick = (lat: number, lng: number) => {
    if (!selectedUnit) {
      setIsSheetExpanded(true); // Se não houver unidade, abre o sheet para selecionar
      return;
    }
    setCurrentConfig(prev => ({ ...prev, lat, lng }));
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setMessage(null);
    try {
      console.log('>>> [GPS] Iniciando captura nativa (Capacitor/Soberano)...');
      
      // 1. Verificação de Permissão Explícita
      const status = await Geolocation.checkPermissions();
      if (status.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          setMessage({ text: 'PERMISSÃO GPS NEGADA NO SISTEMA.', type: 'error' });
          setLocating(false);
          return;
        }
      }

      // 2. Captura Direta
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });

      if (pos && pos.coords) {
        const { latitude, longitude } = pos.coords;
        setCurrentConfig(prev => ({ ...prev, lat: latitude, lng: longitude }));
        setMapCenter([latitude, longitude]);
        setMessage({ text: 'POSIÇÃO FIXADA PELO HARDWARE!', type: 'success' });
      } else {
        throw new Error('Hardware retornou objeto vazio');
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.warn('>>> [GPS] Falha nativa, tentando Web API:', err.message || 'Desconhecido');
      
      try {
        const webLoc = await getCurrentLocation(true);
        setCurrentConfig(prev => ({ ...prev, lat: webLoc.lat, lng: webLoc.lng }));
        setMapCenter([webLoc.lat, webLoc.lng]);
        setMessage({ text: 'POSIÇÃO FIXADA (WEB FALLBACK).', type: 'success' });
      } catch (fallbackError: unknown) {
        const fe = fallbackError as Error;
        setMessage({ text: `ERRO GPS: ${fe.message || 'Sinal indisponível'}`, type: 'error' });
      }
    } finally {
      setLocating(false);
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

    const configData: UnitConfig = {
      _tenantid: user?._tenantid || user?.tenantid || 'CICOPAL',
      _unitid: selectedUnit,
      tenant_id: user?._tenantid || user?.tenantid || 'CICOPAL',
      unit_id: selectedUnit,
      lat: Number(l_lat),
      lng: Number(l_lng),
      radius_meters: Number(l_radius),
      is_active: true,
      updated_by: user?.email || 'auditor',
      updated_at: new Date().toISOString()
    };

    try {
      // O método saveUnitConfig (em supabaseService) agora está roteado para SQLite no modo INTERNO
      const ok = await saveUnitConfig(configData);
      
      if (ok === true || (typeof ok === 'string' && ok.includes('sucesso'))) {
        setMessage({ text: 'ÂNCORA CONFIGURADA E REGISTRADA NO DISPOSITIVO!', type: 'success' });
        
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

        setTimeout(() => setIsSheetExpanded(false), 2000);
      } else {
        setMessage({ text: `NAO FOI POSSÍVEL GRAVAR: ${ok}`, type: 'error' });
      }
    } catch (saveErr: unknown) {
      const se = saveErr as Error;
      setMessage({ text: `ERRO DE PERSISTÊNCIA: ${se.message || 'Falha no banco local'}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const filteredUnits = units.filter(u => {
    if (!u || typeof u !== 'string') return false;
    return u.toLowerCase().includes(unitSearchTerm.toLowerCase());
  });

  return (
    <div className="relative w-full h-[100dvh] bg-slate-900 overflow-hidden font-sans">
      {/* Background Map Container */}
      <div className="absolute inset-0 z-0">
        <div 
          ref={mapRef} 
          id="gbr-unit-map" 
          className="w-full h-full"
        />
        {/* Camada de Interação (Caso o mapa native fique por baixo) */}
        {!mapInstance.current && (
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

      {/* Floating Header */}
      <div className="absolute top-4 left-0 right-0 z-50 px-4 pointer-events-none">
        <div className="max-w-xl mx-auto">
          {/* Navigation & Search Row */}
          <div className="flex items-center space-x-3 pointer-events-auto">
            <button 
              onClick={() => {
                if (typeof onBack === 'function') {
                  onBack();
                } else {
                  console.warn('onBack prop is not a function');
                }
              }}
              className="w-12 h-12 bg-white/90 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center text-slate-800 shadow-xl active:scale-95 transition-all"
            >
              <ArrowLeft size={22} />
            </button>
            <form 
              onSubmit={handleSearchLocation}
              className="flex-1 flex items-center bg-white/90 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl overflow-hidden h-12"
            >
              <div className="pl-4 text-slate-400">
                <Search size={18} />
              </div>
              <input 
                type="text" 
                placeholder="BUSCAR CIDADE OU ENDEREÇO..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                className="flex-1 px-3 bg-transparent text-[11px] font-bold uppercase tracking-tight text-slate-800 focus:outline-none placeholder:text-slate-400"
              />
              <button 
                type="submit"
                disabled={searching}
                className="h-full px-5 bg-blue-600 text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : 'BUSCAR'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Floating Action Buttons (Bottom Right) */}
      <div className="absolute bottom-32 right-4 z-40 flex flex-col space-y-3">
        <button 
          onClick={() => {
            if (typeof onNavigate === 'function') {
              onNavigate(AppScreen.CAMPAIGN_MANAGEMENT);
            } else {
              console.warn('onNavigate not provided or is not a function');
            }
          }}
          className="w-12 h-12 bg-amber-500 text-black rounded-2xl shadow-2xl flex flex-col items-center justify-center transition-all active:scale-90 border border-amber-400 group relative pointer-events-auto"
          title="Gestão de Campanhas"
        >
          <Calendar size={20} className="shrink-0" />
          <div className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[8px] font-bold rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity uppercase tracking-widest">
            Campanhas
          </div>
        </button>
        <button 
          onClick={() => setMapType(mapType === 'street' ? 'satellite' : 'street')}
          className={`w-12 h-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center transition-all active:scale-90 border ${
            mapType === 'satellite' 
              ? 'bg-blue-600 text-white border-blue-400' 
              : 'bg-white/90 backdrop-blur-md text-slate-700 border-white/20'
          }`}
        >
          <Layers size={20} />
        </button>
        <button 
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="w-12 h-12 bg-white/90 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-blue-600 active:scale-90 transition-all disabled:opacity-50"
        >
          {locating ? <Loader2 size={20} className="animate-spin" /> : <Target size={20} />}
        </button>
      </div>

      {/* Bottom Sheet Panel */}
      <motion.div 
        initial={false}
        animate={{ height: isSheetExpanded ? 'auto' : '100px' }}
        className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] border-t border-slate-100 flex flex-col overflow-hidden"
      >
        {/* Handle Bar */}
        <div 
          className="w-full py-3 flex justify-center cursor-pointer active:bg-slate-50 transition-colors"
          onClick={() => setIsSheetExpanded(!isSheetExpanded)}
        >
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        <div className="px-6 pb-8">
          {/* Collapsed View Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${selectedUnit ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`} />
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                  {selectedUnit ? selectedUnit : 'SELECIONE UMA UNIDADE'}
                </h3>
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-1 truncate max-w-[200px]">
                {selectedUnit ? 'ÂNCORA DE AUDITORIA CONFIGURADA' : 'AGUARDANDO SELEÇÃO NA LISTA'}
              </p>
            </div>
            <button 
              onClick={() => setIsSheetExpanded(!isSheetExpanded)}
              className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400"
            >
              {isSheetExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>
          </div>

          {/* Expanded Content */}
          <AnimatePresence>
            {isSheetExpanded && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="space-y-6"
              >
                {!selectedUnit ? (
                  /* Unit Selection List */
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="text" 
                        placeholder="BUSCAR UNIDADE..." 
                        value={unitSearchTerm}
                        onChange={(e) => setUnitSearchTerm(e.target.value.toUpperCase())}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-bold uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 no-scrollbar">
                      {filteredUnits.map((unit) => {
                        const isConfigured = configs.some(c => {
                          if (!c.unit_id || !unit) return false;
                          return c.unit_id.trim().toUpperCase() === unit.trim().toUpperCase();
                        });
                        return (
                          <button
                            key={unit}
                            onClick={() => handleSelectUnit(unit)}
                            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-blue-50 rounded-2xl transition-all border border-transparent hover:border-blue-100 group"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 shadow-sm">
                                <MapIcon size={18} />
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{unit}</p>
                                <p className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${isConfigured ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {isConfigured ? '✓ CONFIGURADO' : 'PENDENTE'}
                                </p>
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Configuration Form */
                  <div className="space-y-6">
                    {/* Lat/Lng Grid - Always Available Fallback */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitude</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="any"
                            value={currentConfig.lat || ''} 
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val)) setCurrentConfig(prev => ({ ...prev, lat: val }));
                            }}
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 outline-none"
                            placeholder="-0.0000"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Longitude</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="any"
                            value={currentConfig.lng || ''} 
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val)) setCurrentConfig(prev => ({ ...prev, lng: val }));
                            }}
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 outline-none"
                            placeholder="-0.0000"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Radius Slider */}
                    <div className="space-y-3 bg-slate-50 p-5 rounded-[24px] border border-slate-100">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Raio de Tolerância</label>
                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                          {currentConfig.radius_meters}m
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="50" 
                        max="2000" 
                        step="50"
                        value={currentConfig.radius_meters || 500}
                        onChange={(e) => setCurrentConfig(prev => ({ ...prev, radius_meters: parseInt(e.target.value) }))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                        <span>50m</span>
                        <span>1000m</span>
                        <span>2000m</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col space-y-3">
                      <button 
                        onClick={handleSave}
                        disabled={saving || currentConfig.lat === undefined || currentConfig.lat === null}
                        className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center space-x-3"
                      >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        <span>Salvar Configuração</span>
                      </button>
                      
                      <button 
                        onClick={() => setSelectedUnit(null)}
                        className="w-full py-4 bg-white text-slate-400 rounded-[20px] font-bold uppercase text-[9px] tracking-widest border border-slate-100 active:scale-[0.98] transition-all"
                      >
                        Trocar Unidade
                      </button>
                    </div>

                    {message && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`p-4 rounded-2xl flex items-center space-x-3 border ${
                          message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                        }`}
                      >
                        {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <p className="text-[10px] font-black uppercase tracking-tight">{message.text}</p>
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collapsed View Footer Button (Only when collapsed and unit selected) */}
          {!isSheetExpanded && selectedUnit && (
            <button 
              onClick={handleSave}
              disabled={saving}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg active:scale-95 transition-all flex items-center justify-center space-x-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              <span>Confirmar Local</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default React.memo(UnitConfigurator);
