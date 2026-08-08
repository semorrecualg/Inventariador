
import React, { useMemo, useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { Asset, TransactionOrigin, DatabaseMode } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Info, X, Activity, Database, Map as MapIcon, Box, Cloud, ArrowLeft, Flame, ShieldCheck, SlidersHorizontal, ChevronDown, CheckCircle2, WifiOff, Loader2 } from 'lucide-react';
import { db } from '../services/sqliteService';
import { logger } from '../utils/logger';

interface AssetMapProps {
  assets: Asset[];
  tenantid?: string;
  filial?: string;
  onBack: () => void;
  databaseMode: DatabaseMode;
  onSelectLocation?: (location: string) => void;
}

/** Guarda Defensiva: converte para numero finito ou NaN (para descartar). */
const asFiniteCoord = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Guarda Defensiva: so aceita pontos com coordenadas finitas validas (evita NaN/undefined no MapLibre). */
const hasValidCoords = (lat: unknown, lng: unknown): boolean => {
  const la = asFiniteCoord(lat);
  const lo = asFiniteCoord(lng);
  return !isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
};

const AssetMap: React.FC<AssetMapProps> = ({ assets, onBack, databaseMode, tenantid, filial }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  
  const [showInfo, setShowInfo] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState<TransactionOrigin | 'ALL'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string | 'ALL'>('ALL');
  const [selectedFloor, setSelectedFloor] = useState<number>(0);
  const [heatmapMode, setHeatmapMode] = useState<'DENSITY' | 'VALUE' | 'AREA' | 'GRID'>('AREA');
  const [mapReady, setMapReady] = useState(false);
  
  // Dexie fallback: carrega ativos do IndexedDB se a prop estiver vazia
  const [dexieAssets, setDexieAssets] = useState<Asset[]>([]);
  const [isDexieLoading, setIsDexieLoading] = useState(false);
  
  useEffect(() => {
    if (assets.length === 0 && tenantid && filial) {
      setIsDexieLoading(true);
      db.ativos.where('[tenantid+filial]').equals([tenantid, filial]).toArray()
        .then((result) => { setDexieAssets(result as unknown as Asset[]); })
        .catch(() => { /* fallback silencioso */ })
        .finally(() => setIsDexieLoading(false));
    } else {
      if (dexieAssets.length > 0) setDexieAssets([]);
      setIsDexieLoading(false);
    }
  }, [assets, tenantid, filial]);
  
  const sourceAssets = dexieAssets.length > 0 ? dexieAssets : assets;

  useEffect(() => {
    initMap();
    return () => {
      if (mapInstance.current) mapInstance.current.remove();
    };
  }, []);

  const initMap = () => {
    if (!mapRef.current || mapInstance.current) return;
    try {
      // Guarda Defensiva: centro canonico finito (nunca NaN/undefined no MapLibre)
      const [latC, lngC] = initialCenter;
      const safeCenter: [number, number] = [
        asFiniteCoord(lngC) || -46.6333,
        asFiniteCoord(latC) || -23.5505
      ];

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
        center: safeCenter,
        zoom: 13
      });

      // Erros de estilo/tile/geojson sao nao-fatais: loga e segue (previne crash da esteira)
      map.on('error', (evt) => {
        logger.warn('>>> [MAP] Evento de erro nao-fatal do MapLibre (AssetMap):', evt?.error?.message);
      });

      map.on('load', () => {
        mapInstance.current = map;
        setMapReady(true);
        logger.info('>>> [MAP] Asset Map LibLibre Inicializado (Offline Sovereignty).');
        renderMapData();
      });
    } catch (err) {
      logger.error('>>> [MAP] Falha ao inicializar Asset Map:', err);
    }
  };







  const filteredAssets = useMemo(() => {
    // REGRA: O mapa de calor/área deve ler somente os itens INVENTARIADOS (_conferido)
    let filtered = sourceAssets.filter(a => !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM');
    
    // Filtragem de andar movida para o motor do mapa via ['get', 'id_andar']
    // Porém para cálculos de BI e grid aqui, ainda filtramos
    filtered = filtered.filter(a => (a._id_andar || 0) === selectedFloor);
    
    if (selectedOrigin !== 'ALL') {
      filtered = filtered.filter(a => a._origemTransacao === selectedOrigin);
    }
    if (selectedLocation !== 'ALL') {
      filtered = filtered.filter(a => (a._localMaster || a.endereco) === selectedLocation);
    }

    return filtered;
  }, [sourceAssets, selectedOrigin, selectedLocation, selectedFloor]);

  const gridData = useMemo(() => {
    if (heatmapMode !== 'GRID' || filteredAssets.length === 0) return [];

    const validAssets = filteredAssets.filter(a => hasValidCoords(a.latitude, a.longitude));
    if (validAssets.length === 0) return [];

    // Otimização: Binning por coordenadas em vez de interseção de polígonos Turf (O(N) vs O(N*M))
    // 0.0002 graus é aproximadamente 20 metros
    const cellSizeDegrees = 0.0002;
    const bins: Record<string, { count: number, value: number, assets: Asset[], lat: number, lng: number }> = {};

    validAssets.forEach(a => {
      const latBin = Math.floor(asFiniteCoord(a.latitude) / cellSizeDegrees) * cellSizeDegrees;
      const lngBin = Math.floor(asFiniteCoord(a.longitude) / cellSizeDegrees) * cellSizeDegrees;
      const key = `${latBin.toFixed(6)}|${lngBin.toFixed(6)}`;

      if (!bins[key]) {
        bins[key] = { count: 0, value: 0, assets: [], lat: latBin, lng: lngBin };
      }
      
      const bin = bins[key];
      bin.count++;
      bin.assets.push(a);
      
      const rawVlr = (a as unknown as Record<string, unknown>).vlraquisic;
      const val = typeof rawVlr === 'string' 
        ? parseFloat((rawVlr as string).replace(/[^\d,.-]/g, '').replace(',', '.')) 
        : (Number(rawVlr) || 0);
      bin.value += (val || 0);
    });

    return Object.values(bins).map(bin => ({
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [bin.lng, bin.lat],
          [bin.lng + cellSizeDegrees, bin.lat],
          [bin.lng + cellSizeDegrees, bin.lat + cellSizeDegrees],
          [bin.lng, bin.lat + cellSizeDegrees],
          [bin.lng, bin.lat]
        ]]
      },
      count: bin.count,
      value: bin.value,
      assets: bin.assets
    }));
  }, [filteredAssets, heatmapMode]);

  const geojsonAssets = useMemo(() => {
    // GBR v25: Delegação para GPU. Enviamos todos os ativos (leves) e deixamos o shader filtrar.
    const features = sourceAssets
      .filter(a => hasValidCoords(a.latitude, a.longitude))
      .map(a => {
        const val = Number(a.vlraquisic) || 0;
        const lat = asFiniteCoord(a.latitude);
        const lng = asFiniteCoord(a.longitude);
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: {
            id: a.id || a.etiqueta,
            label: a.etiqueta,
            value: val,
            intensity: val > 0 ? Math.log10(val) : 1,
            id_andar: a._id_andar || 0,
            origin: a._origemTransacao || 'ALL',
            location: a._localMaster || a.endereco || 'SEM LOCAL'
          }
        };
      });

    return { type: 'FeatureCollection', features };
  }, [sourceAssets]);

  // Perímetros de Auditoria (Turf.js) Otimizados via Reduce e Cache por Piso
  const geojsonArea = useMemo(() => {
    // Agrupamento Otimizado via Reduce (GBR v25 Pipeline)
    const groups = filteredAssets.reduce((acc, a) => {
      if (!hasValidCoords(a.latitude, a.longitude)) return acc;
      const loc = a._localMaster || a.endereco || 'SEM LOCAL';
      if (!acc[loc]) acc[loc] = { points: [], totalValue: 0 };
      acc[loc].points.push([asFiniteCoord(a.longitude), asFiniteCoord(a.latitude)]);
      acc[loc].totalValue += (Number(a.vlraquisic) || 0);
      return acc;
    }, {} as Record<string, { points: [number, number][], totalValue: number }>);

    const features = Object.entries(groups)
      .filter(([, data]) => data.points.length >= 3)
      .map(([loc, data]) => {
        try {
          const ptFeatures = data.points.map(p => turf.point(p));
          const hull = turf.convex(turf.featureCollection(ptFeatures));
          if (hull) {
            return {
              ...hull,
              properties: {
                location: loc,
                value: data.totalValue,
                id_andar: selectedFloor
              }
            };
          }
        } catch (e) {
          logger.warn(`[Turf] Erro no Convex Hull de ${loc}`, e);
        }
        return null;
      })
      .filter(f => f !== null);

    return { type: 'FeatureCollection', features: features as unknown as maplibregl.GeoJSONFeature[] };
  }, [filteredAssets, selectedFloor]);

  const geojsonGrid = useMemo(() => {
    if (heatmapMode !== 'GRID') return { type: 'FeatureCollection', features: [] };
    const features = gridData.map(cell => ({
      type: 'Feature',
      geometry: cell.geometry,
      properties: {
        count: cell.count,
        value: cell.value
      }
    }));

    return {
      type: 'FeatureCollection',
      features
    };
  }, [gridData, heatmapMode]);



  useEffect(() => {
    if (mapReady) {
      renderMapData();
    }
  }, [mapReady, heatmapMode, geojsonAssets, geojsonArea, geojsonGrid]);

  const renderMapData = () => {
    if (!mapInstance.current || !mapReady) return;
    const map = mapInstance.current;

    try {
      // 1. Gerenciar Fontes (Sources)
      if (map.getSource('assets-source')) {
        (map.getSource('assets-source') as maplibregl.GeoJSONSource).setData(geojsonAssets as unknown as maplibregl.GeoJSONSourceSpecification['data']);
      } else {
        map.addSource('assets-source', { type: 'geojson', data: geojsonAssets as unknown as maplibregl.GeoJSONSourceSpecification['data'] });
      }

      if (map.getSource('area-source')) {
        (map.getSource('area-source') as maplibregl.GeoJSONSource).setData(geojsonArea as unknown as maplibregl.GeoJSONSourceSpecification['data']);
      } else {
        map.addSource('area-source', { type: 'geojson', data: geojsonArea as unknown as maplibregl.GeoJSONSourceSpecification['data'] });
      }

      if (map.getSource('grid-source')) {
        (map.getSource('grid-source') as maplibregl.GeoJSONSource).setData(geojsonGrid as unknown as maplibregl.GeoJSONSourceSpecification['data']);
      } else {
        map.addSource('grid-source', { type: 'geojson', data: geojsonGrid as unknown as maplibregl.GeoJSONSourceSpecification['data'] });
      }

      // 2. Gerenciar Camada de Perímetros (Retalhos de Auditoria - BASE)
      // Visível se houver dados de área, independente do modo, para coexistência conforme solicitado
      if (!map.getLayer('area-layer')) {
        map.addLayer({
          id: 'area-layer',
          type: 'fill',
          source: 'area-source',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.3,
            'fill-outline-color': '#3b82f6'
          }
        });
      }
      map.setLayoutProperty('area-layer', 'visibility', geojsonArea.features.length > 0 ? 'visible' : 'none');

      // 3. Gerenciar Camadas de Calor / Grade (SOBREPOSIÇÃO)
      const overlayLayers = ['heatmap-layer', 'grid-layer'];
      overlayLayers.forEach(lyr => {
        if (map.getLayer(lyr)) map.setLayoutProperty(lyr, 'visibility', 'none');
      });

      if (heatmapMode === 'DENSITY' || heatmapMode === 'VALUE') {
        const gpuFilter: maplibregl.FilterSpecification = [
          'all',
          ['==', ['get', 'id_andar'], selectedFloor],
          selectedOrigin !== 'ALL' ? ['==', ['get', 'origin'], selectedOrigin] : true,
          selectedLocation !== 'ALL' ? ['==', ['get', 'location'], selectedLocation] : true
        ] as maplibregl.FilterSpecification;

        if (!map.getLayer('heatmap-layer')) {
          map.addLayer({
            id: 'heatmap-layer',
            type: 'heatmap',
            source: 'assets-source',
            maxzoom: 15,
            filter: gpuFilter,
            paint: {
              'heatmap-weight': heatmapMode === 'VALUE' ? ['get', 'intensity'] : 1,
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(33,102,172,0)',
                0.2, 'rgb(103,169,207)',
                0.4, 'rgb(209,229,240)',
                0.6, 'rgb(253,219,199)',
                0.8, 'rgb(239,138,98)',
                1, 'rgb(178,24,43)'
              ],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 15, 20],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 14, 1, 15, 0]
            }
          });
        } else {
          map.setPaintProperty('heatmap-layer', 'heatmap-weight', heatmapMode === 'VALUE' ? ['get', 'intensity'] : 1);
          map.setFilter('heatmap-layer', gpuFilter);
          map.setLayoutProperty('heatmap-layer', 'visibility', 'visible');
          map.moveLayer('heatmap-layer');
        }
      } else if (heatmapMode === 'GRID') {
        const gpuFilter: maplibregl.FilterSpecification = [
          'all',
          ['==', ['get', 'id_andar'], selectedFloor]
        ] as maplibregl.FilterSpecification;

        if (!map.getLayer('grid-layer')) {
          const maxCount = gridData.length > 0 ? Math.max(1, ...gridData.map(c => c.count)) : 1;
          map.addLayer({
            id: 'grid-layer',
            type: 'fill',
            source: 'grid-source',
            filter: gpuFilter,
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['get', 'count'],
                0, '#ffffb2',
                maxCount * 0.25, '#fecc5c',
                maxCount * 0.5, '#fd8d3c',
                maxCount * 0.75, '#f03b20',
                maxCount, '#bd0026'
              ],
              'fill-opacity': 0.6,
              'fill-outline-color': '#ffffff'
            }
          });
        } else {
          map.setFilter('grid-layer', ['==', ['get', 'id_andar'], selectedFloor]);
          map.setLayoutProperty('grid-layer', 'visibility', 'visible');
          map.moveLayer('grid-layer');
        }
      }
    } catch (err) {
      logger.warn('>>> [MAP] Erro ao renderizar dados no MapLibre:', err);
    }
  };

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedOrigin !== 'ALL') count++;
    if (selectedLocation !== 'ALL') count++;
    return count;
  }, [selectedOrigin, selectedLocation]);

  // Lista de localidades únicas para o filtro (Baseado no local onde foi INVENTARIADO)
  const locations = useMemo(() => {
    const locs = new Set<string>();      sourceAssets.forEach(a => {
      // REGRA: Apenas localidades que possuem itens INVENTARIADOS
      if (a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM') {
        const loc = a._localMaster || a.endereco;
        if (loc) locs.add(loc);
      }
    });
    return Array.from(locs).sort();
  }, [sourceAssets]);

  const originOptions = [
    { label: 'TODAS AS ORIGENS', value: 'ALL' },
    { label: 'INVENTÁRIO (200)', value: TransactionOrigin.INVENTORY },
    { label: 'ETIQUETAR (400)', value: TransactionOrigin.LABELING },
    { label: 'CONCILIAÇÃO (600)', value: TransactionOrigin.ACCOUNT_RECONCILIATION },
  ];

  // Lista de andares únicos presentes nos ativos
  const availableFloors = useMemo(() => {
    const floors = new Set<number>();
    sourceAssets.forEach(a => {
      if (a._id_andar !== undefined) {
        floors.add(a._id_andar);
      } else {
        floors.add(0); // Padrão Térreo
      }
    });
    return Array.from(floors).sort((a, b) => b - a); // Ordem decrescente (topo para base)
  }, [sourceAssets]);



  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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



  const totalValue = useMemo(() => {
    return filteredAssets.reduce((acc, a) => {
      const rawVlr = (a as unknown as Record<string, unknown>).vlraquisic;
      const val = typeof rawVlr === 'string' 
        ? parseFloat((rawVlr as string).replace(/[^\d,.-]/g, '').replace(',', '.')) 
        : (Number(rawVlr) || 0);
      return acc + (val || 0);
    }, 0);
  }, [filteredAssets]);

  const initialCenter = useMemo(() => {
    const validPoints = filteredAssets.filter(a => hasValidCoords(a.latitude, a.longitude));
    if (validPoints.length === 0) return [-23.5505, -46.6333] as [number, number];
    const sumLat = validPoints.reduce((acc, p) => acc + asFiniteCoord(p.latitude), 0);
    const sumLng = validPoints.reduce((acc, p) => acc + asFiniteCoord(p.longitude), 0);
    return [sumLat / validPoints.length, sumLng / validPoints.length] as [number, number];
  }, [filteredAssets]);

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0F172A] overflow-hidden relative font-sans text-white">
      {/* Mapa Fullscreen Container */}
      <div className="absolute inset-0 z-0">
        <div 
          ref={mapRef} 
          id="gbr-asset-map" 
          className="w-full h-full"
        />
        {!mapReady ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-12 text-center">
            <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center border border-slate-800 mb-6 animate-pulse">
              <Loader2 className="text-blue-500 animate-spin" size={32} />
            </div>
            <h2 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-3">Motor Nativo</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-relaxed max-w-[240px]">
              Carregando Ambiente Cartográfico MapLibre GPU...
            </p>
          </div>
        ) : isDexieLoading && sourceAssets.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm p-12 text-center z-10">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 mb-5 animate-pulse">
              <Loader2 className="text-blue-400 animate-spin" size={28} />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest max-w-[220px] leading-relaxed">
              Carregando ativos do banco local...
            </p>
          </div>
        ) : null}
      </div>

      {/* Seletor de Andar Flutuante (Vertical) */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[1001] flex flex-col space-y-2 pointer-events-auto">
        {availableFloors.map(floor => (
          <button
            key={floor}
            onClick={() => setSelectedFloor(floor)}
            className={`w-10 h-10 rounded-xl font-bold text-[10px] shadow-2xl border transition-all ${
              selectedFloor === floor
                ? 'bg-[#3B82F6] text-white border-[#3B82F6] scale-110'
                : 'bg-white/10 backdrop-blur-md text-white/40 border-white/10 hover:bg-white/20'
            }`}
          >
            {floor === 0 ? 'T' : `${floor}º`}
          </button>
        ))}
        <div className="h-4" /> {/* Spacer */}
        <div className="text-[8px] font-black text-white/30 uppercase text-center rotate-90 origin-center whitespace-nowrap">
          Nível Vertical
        </div>
      </div>

      {/* Banner de Orientação Offline */}
      <AnimatePresence>
        {isOffline && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-[1002] w-[90%] max-w-md"
          >
            <div className="bg-amber-500/90 backdrop-blur-md border border-amber-400 p-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-white">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <WifiOff size={16} className="text-white" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-tight leading-tight">
                Ambiente Offline: O mapa visual está indisponível, mas o GPS Nativo continua operacional. Sua auditoria está protegida localmente.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Navegação (Stripe Style) */}
      <div className="absolute top-0 left-0 right-0 z-[1001] px-6 pt-6 pb-6 bg-gradient-to-b from-[#0F172A]/80 to-transparent pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center space-x-4">
            <button 
              onClick={onBack}
              className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all shadow-lg"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm font-medium text-white/90 tracking-tight">Auditoria</h1>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <ShieldCheck size={10} className="text-emerald-400" />
                  <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Safe</span>
                </div>
                <span className="text-[8px] font-medium text-white/40 uppercase tracking-widest">v24.50.2</span>
              </div>
            </div>
          </div>

          {/* Segmented Control (CALOR, GRADE, ÁREA, VALOR) */}
          <div className="bg-[#1E293B]/90 backdrop-blur-md p-1 rounded-xl shadow-2xl border border-white/5 flex items-center ml-2">
            {[
              { id: 'DENSITY', label: 'Calor', icon: Flame },
              { id: 'GRID', label: 'Grade', icon: Box },
              { id: 'AREA', label: 'Área', icon: MapIcon },
              { id: 'VALUE', label: 'Valor', icon: Activity }
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setHeatmapMode(mode.id as 'DENSITY' | 'VALUE' | 'AREA' | 'GRID')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center space-x-2 ${
                  heatmapMode === mode.id 
                    ? 'bg-white text-[#0F172A] shadow-md scale-[1.02]' 
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <mode.icon size={12} strokeWidth={1.5} />
                <span className="hidden md:inline">{mode.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Botão de Filtros Flutuante (Ilha) */}
      <div className="absolute top-32 left-6 z-[1001]">
        <button 
          onClick={() => setIsFilterModalOpen(true)}
          className="bg-white/10 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-3 active:scale-95 transition-all group"
        >
          <div className="relative">
            <SlidersHorizontal size={16} className="text-[#3B82F6] group-hover:rotate-12 transition-transform" />
            {activeFiltersCount > 0 && (
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-[#3B82F6] rounded-full flex items-center justify-center border-2 border-[#0F172A]">
                <span className="text-[8px] font-black text-white">{activeFiltersCount}</span>
              </div>
            )}
          </div>
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Filtros</span>
          <ChevronDown size={12} className="text-white/40" />
        </button>
      </div>

      {/* Botão de Informações (Canto Inferior Direito) */}
      <div className="absolute bottom-10 right-6 z-[1001] flex flex-col space-y-3">
        {!showInfo && (
          <button 
            onClick={() => setShowInfo(true)}
            className="w-12 h-12 bg-[#3B82F6] rounded-2xl shadow-2xl flex items-center justify-center text-white active:scale-90 transition-all hover:bg-[#2563EB]"
          >
            <Info size={22} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Modal de Filtros (Glassmorphism) */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterModalOpen(false)}
              className="absolute inset-0 bg-[#0F172A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#1E293B]/95 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-[#3B82F6]" />
              
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-[#3B82F6]/10 rounded-xl flex items-center justify-center text-[#3B82F6]">
                    <SlidersHorizontal size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">Filtros de Mapa</h2>
                    <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest">Refine sua auditoria</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsFilterModalOpen(false)}
                  className="p-2 text-white/20 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Origem da Transação</label>
                  <div className="grid grid-cols-1 gap-2">
                    {originOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedOrigin(opt.value as TransactionOrigin | 'ALL')}
                        className={`px-4 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all text-left flex items-center justify-between ${
                          selectedOrigin === opt.value 
                            ? 'bg-[#3B82F6] text-white shadow-lg' 
                            : 'bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedOrigin === opt.value && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Localidade Específica</label>
                  <div className="relative">
                    <select 
                      value={selectedLocation}
                      onChange={(e) => setSelectedLocation(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-[10px] font-bold text-white uppercase tracking-widest focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value="ALL" className="bg-[#1E293B]">TODAS AS LOCALIDADES</option>
                      {locations.map(loc => (
                        <option key={loc} value={loc} className="bg-[#1E293B]">{loc}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="mt-10 flex items-center space-x-3">
                <button 
                  onClick={() => {
                    setSelectedOrigin('ALL');
                    setSelectedLocation('ALL');
                  }}
                  className="flex-1 py-4 bg-white/5 text-white/60 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Limpar
                </button>
                <button 
                  onClick={() => setIsFilterModalOpen(false)}
                  className="flex-[2] py-4 bg-[#3B82F6] text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-[#3B82F6]/20 active:scale-95 transition-all"
                >
                  Aplicar Filtros
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Painel de Informações (Bottom Sheet Style) */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="absolute bottom-0 left-0 right-0 z-[1002] p-4 pointer-events-none"
          >
            <div className="pointer-events-auto bg-[#0F172A] backdrop-blur-xl border border-slate-800 rounded-xl p-6 pb-10 shadow-2xl relative overflow-hidden">
              {/* Glow Effect sutil */}
              <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#3B82F6]/5 blur-[60px] rounded-full" />
              
              <div className={`absolute top-0 left-0 w-full h-1 ${
                heatmapMode === 'VALUE' ? 'bg-[#3B82F6]' : 
                heatmapMode === 'AREA' ? 'bg-emerald-500' : 
                heatmapMode === 'DENSITY' ? 'bg-orange-500' :
                'bg-blue-500'
              }`} />
              
              <button 
                onClick={() => setShowInfo(false)}
                className="absolute top-4 right-4 p-1.5 text-slate-600 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center space-x-3 mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  heatmapMode === 'VALUE' ? 'bg-[#3B82F6]/20 text-[#3B82F6]' : 
                  heatmapMode === 'AREA' ? 'bg-emerald-500/20 text-emerald-400' :
                  heatmapMode === 'DENSITY' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {heatmapMode === 'VALUE' ? <Activity size={20} strokeWidth={2} /> : 
                   heatmapMode === 'AREA' ? <MapIcon size={20} strokeWidth={2} /> :
                   heatmapMode === 'DENSITY' ? <Flame size={20} strokeWidth={2} /> :
                   <Layers size={20} strokeWidth={2} />}
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold text-white tracking-tight leading-none">
                    {heatmapMode === 'VALUE' ? 'Concentração Financeira' : 
                     heatmapMode === 'AREA' ? 'Área Ocupada por Localidade' :
                     heatmapMode === 'DENSITY' ? 'Mapa de Calor (Densidade)' :
                     'Densidade de Ativos'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Visão Global de Auditoria</p>
                </div>
              </div>

              <div className="flex flex-row gap-3 mb-6">
                <div className="bg-slate-800/40 border border-slate-700 p-3 rounded-xl flex-1 flex flex-col">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Ativos</span>
                  <span className="text-xl font-bold text-white">
                    {filteredAssets.filter(a => a.latitude && a.longitude).length}
                  </span>
                </div>
                <div className="bg-slate-800/40 border border-slate-700 p-3 rounded-xl flex-[1.5] flex flex-col">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Valor Total</span>
                  <span className="text-xl font-bold text-[#3B82F6]">
                    {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="bg-slate-800/40 border border-slate-700 p-3 rounded-xl flex-1 flex flex-col">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Locais</span>
                  <span className="text-xl font-bold text-emerald-400">
                    {geojsonArea.features.length}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-500 leading-tight opacity-70 max-w-[70%]">
                  {heatmapMode === 'VALUE' 
                    ? 'Calor representa o valor acumulado. Áreas vermelhas indicam concentração de capital.'
                    : heatmapMode === 'AREA'
                    ? 'Polígonos de ocupação baseados na dispersão física dos ativos.'
                    : heatmapMode === 'DENSITY'
                    ? 'Densidade física de ativos por m². Áreas quentes indicam maior volume.'
                    : 'Quantidade de ativos por m².'}
                </p>
                <div className="flex items-center space-x-2">
                  {databaseMode === DatabaseMode.INTERNAL ? (
                    <div className="flex items-center space-x-1.5 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                      <Database size={12} className="text-amber-500" />
                      <span className="text-[9px] font-bold text-amber-500 uppercase">Local</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                      <Cloud size={12} className="text-emerald-500" />
                      <span className="text-[9px] font-bold text-emerald-500 uppercase">Nuvem</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssetMap;
