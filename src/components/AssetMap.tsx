
import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Popup, Polygon, Tooltip, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { Asset, TransactionOrigin, DatabaseMode } from '../types';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';

// Configuração de ícones customizados para o Leaflet
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = defaultIcon;
import { Layers, Info, X, Activity, Database, Map as MapIcon, Box, Cloud, ArrowLeft, Flame, ShieldCheck, SlidersHorizontal, ChevronDown, CheckCircle2 } from 'lucide-react';

// Extensão necessária para o TypeScript reconhecer o plugin leaflet.heat
declare module 'leaflet' {
  function heatLayer(latlngs: L.LatLngExpression[], options?: unknown): L.Layer;
}

interface AssetMapProps {
  assets: Asset[];
  onBack: () => void;
  databaseMode: DatabaseMode;
  onSelectLocation?: (location: string) => void;
}

// Componente para gerenciar a camada de calor (Heatmap)
const HeatmapLayer: React.FC<{ points: [number, number, number][] }> = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (points.length === 0) {
      return;
    }

    const heatLayer = L.heatLayer(points as L.LatLngExpression[], {
      radius: 15,
      blur: 5,
      maxZoom: 18,
      gradient: {
        0.2: '#3b82f6', // blue-500
        0.4: '#06b6d4', // cyan-500
        0.6: '#10b981', // emerald-500
        0.8: '#f59e0b', // amber-500
        1.0: '#ef4444'  // red-500
      }
    });

    heatLayer.addTo(map);

    if (points.length > 0) {
      try {
        const bounds = L.latLngBounds(points.map(p => [p[0], p[1]]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch (e) {
        console.warn('Error fitting bounds:', e);
      }
    }

    return () => {
      try {
        if (map && map.hasLayer(heatLayer)) {
          map.removeLayer(heatLayer);
        }
      } catch (e) {
        console.warn('Error removing heatLayer:', e);
      }
    };
  }, [map, points]);

  return null;
};

const AssetMap: React.FC<AssetMapProps> = ({ assets, onBack, databaseMode, onSelectLocation }) => {
  const [showInfo, setShowInfo] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState<TransactionOrigin | 'ALL'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string | 'ALL'>('ALL');
  const [heatmapMode, setHeatmapMode] = useState<'DENSITY' | 'VALUE' | 'AREA' | 'GRID'>('AREA');
  const [zoomLevel, setZoomLevel] = useState(13);

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedOrigin !== 'ALL') count++;
    if (selectedLocation !== 'ALL') count++;
    return count;
  }, [selectedOrigin, selectedLocation]);

  // Lista de localidades únicas para o filtro (Baseado no local onde foi INVENTARIADO)
  const locations = useMemo(() => {
    const locs = new Set<string>();
    assets.forEach(a => {
      // REGRA: Apenas localidades que possuem itens INVENTARIADOS
      if (a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM') {
        const loc = a._localMaster || a.ENDERECO;
        if (loc) locs.add(loc);
      }
    });
    return Array.from(locs).sort();
  }, [assets]);

  useEffect(() => {
    // Monitoramento de status online/offline removido pois não está sendo usado no novo design
  }, []);

  const ZoomHandler = () => {
    const map = useMap();
    
    useEffect(() => {
      if (!map) return;
      const onZoom = () => setZoomLevel(map.getZoom());
      map.on('zoomend', onZoom);
      return () => {
        map.off('zoomend', onZoom);
      };
    }, [map]);

    // Efeito para auto-zoom ao trocar de localidade
    useEffect(() => {
      if (!map || selectedLocation === 'ALL' || filteredAssets.length === 0) return;
      
      const points = filteredAssets
        .filter(a => a._lat && a._lng)
        .map(a => [a._lat!, a._lng!] as [number, number]);
        
      if (points.length > 0) {
        const bounds = L.latLngBounds(points);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [100, 100], maxZoom: 18 });
        }
      }
    }, [map, selectedLocation, filteredAssets]);

    return null;
  };

  const originOptions = [
    { label: 'TODAS AS ORIGENS', value: 'ALL' },
    { label: 'INVENTÁRIO (1000)', value: TransactionOrigin.INVENTORY },
    { label: 'ETIQUETAR (2000)', value: TransactionOrigin.LABELING },
    { label: 'CONCILIAÇÃO (3000)', value: TransactionOrigin.ACCOUNT_RECONCILIATION },
  ];

  const filteredAssets = useMemo(() => {
    // REGRA: O mapa de calor/área deve ler somente os itens INVENTARIADOS (_conferido)
    let filtered = assets.filter(a => !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM');
    
    if (selectedOrigin !== 'ALL') {
      filtered = filtered.filter(a => a._origemTransacao === selectedOrigin);
    }
    if (selectedLocation !== 'ALL') {
      filtered = filtered.filter(a => (a._localMaster || a.ENDERECO) === selectedLocation);
    }

    const withGps = filtered.filter(a => a._lat && a._lng).length;
    console.log(`>>> [AssetMap] Ativos conferidos: ${filtered.length}, Com GPS: ${withGps}`);

    return filtered;
  }, [assets, selectedOrigin, selectedLocation]);

  // Agrupamento por Localidade para cálculo de Área Ocupada (Usando local de inventário)
  const locationGroups = useMemo(() => {
    const groups: Record<string, { points: [number, number][], hull: [number, number][] | null, totalValue: number, assets: Asset[] }> = {};
    
    filteredAssets.forEach(a => {
      if (a._lat && a._lng) {
        const loc = a._localMaster || a.ENDERECO || 'SEM LOCALIZAÇÃO';
        if (!groups[loc]) {
          groups[loc] = { points: [], hull: null, totalValue: 0, assets: [] };
        }
        groups[loc].points.push([a._lat, a._lng]);
        groups[loc].assets.push(a);
        
        const val = typeof a.VLRAQUISIC === 'string' 
          ? parseFloat(a.VLRAQUISIC.replace(/[^\d,.-]/g, '').replace(',', '.')) 
          : (Number(a.VLRAQUISIC) || 0);
        groups[loc].totalValue += (val || 0);
      }
    });

    // Calcular Convex Hull para cada grupo
    Object.keys(groups).forEach(loc => {
      const group = groups[loc];
      if (group.points.length >= 3) {
        // d3.polygonHull espera [[x, y], ...]
        const hull = d3.polygonHull(group.points);
        if (hull) {
          group.hull = hull as [number, number][];
        }
      }
    });

    return groups;
  }, [filteredAssets]);

  const heatPoints = useMemo(() => {
    const validAssets = filteredAssets.filter(a => a._lat && a._lng);
    
    if (heatmapMode === 'DENSITY') {
      return validAssets.map(a => [a._lat!, a._lng!, 1] as [number, number, number]);
    } else if (heatmapMode === 'VALUE') {
      return validAssets.map(a => {
        const rawVal = typeof a.VLRAQUISIC === 'string' 
          ? parseFloat(a.VLRAQUISIC.replace(/[^\d,.-]/g, '').replace(',', '.')) 
          : (Number(a.VLRAQUISIC) || 0);
        
        const val = Math.max(1, rawVal);
        const intensity = Math.log10(val);
        return [a._lat!, a._lng!, intensity] as [number, number, number];
      });
    }
    return [];
  }, [filteredAssets, heatmapMode]);

  const gridData = useMemo(() => {
    if (heatmapMode !== 'GRID' || filteredAssets.length === 0) return [];

    const validAssets = filteredAssets.filter(a => a._lat && a._lng);
    if (validAssets.length === 0) return [];

    // Otimização: Binning por coordenadas em vez de interseção de polígonos Turf (O(N) vs O(N*M))
    // 0.0002 graus é aproximadamente 20 metros
    const cellSizeDegrees = 0.0002;
    const bins: Record<string, { count: number, value: number, assets: Asset[], lat: number, lng: number }> = {};

    validAssets.forEach(a => {
      const latBin = Math.floor(a._lat! / cellSizeDegrees) * cellSizeDegrees;
      const lngBin = Math.floor(a._lng! / cellSizeDegrees) * cellSizeDegrees;
      const key = `${latBin.toFixed(6)}|${lngBin.toFixed(6)}`;

      if (!bins[key]) {
        bins[key] = { count: 0, value: 0, assets: [], lat: latBin, lng: lngBin };
      }
      
      const bin = bins[key];
      bin.count++;
      bin.assets.push(a);
      
      const val = typeof a.VLRAQUISIC === 'string' 
        ? parseFloat(a.VLRAQUISIC.replace(/[^\d,.-]/g, '').replace(',', '.')) 
        : (Number(a.VLRAQUISIC) || 0);
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

  const totalValue = useMemo(() => {
    return filteredAssets.reduce((acc, a) => {
      const val = typeof a.VLRAQUISIC === 'string' 
        ? parseFloat(a.VLRAQUISIC.replace(/[^\d,.-]/g, '').replace(',', '.')) 
        : (Number(a.VLRAQUISIC) || 0);
      return acc + (val || 0);
    }, 0);
  }, [filteredAssets]);

  const initialCenter = useMemo(() => {
    const validPoints = filteredAssets.filter(a => a._lat && a._lng);
    if (validPoints.length === 0) return [-23.5505, -46.6333] as [number, number];
    const sumLat = validPoints.reduce((acc, p) => acc + p._lat!, 0);
    const sumLng = validPoints.reduce((acc, p) => acc + p._lng!, 0);
    return [sumLat / validPoints.length, sumLng / validPoints.length] as [number, number];
  }, [filteredAssets]);

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0F172A] overflow-hidden relative font-sans">
      {/* Mapa Fullscreen (Camada 0) */}
      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={initialCenter} 
          zoom={13} 
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {heatmapMode !== 'AREA' && heatmapMode !== 'GRID' && <HeatmapLayer points={heatPoints} />}
          <ZoomHandler />

          {/* Visualização em Grade */}
          {heatmapMode === 'GRID' && gridData.map((cell, i) => {
            if (!cell) return null;
            const maxCount = Math.max(...gridData.map(c => c?.count || 1));
            const intensity = cell.count / maxCount;
            const color = d3.interpolateYlOrRd(intensity);
            const conferidos = cell.assets.filter(a => !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM').length;
            const divergencias = cell.assets.filter(a => String(a.TAG_INVENTARIO || '').toUpperCase() === 'DIVERGÊNCIA').length;

            return (
              <Polygon
                key={`grid-${i}`}
                positions={cell.geometry.coordinates[0].map(coord => [coord[1], coord[0]] as [number, number])}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.6,
                  weight: 1
                }}
              >
                <Tooltip sticky direction="top" className="bg-slate-900 text-white border-none shadow-xl rounded-xl px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest mb-1">Quadrante Técnico</span>
                    <div className="flex flex-col space-y-1">
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-white/60 uppercase">Ativos:</span>
                        <span className="text-[8px] font-bold text-white uppercase">{cell.count}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-emerald-400/60 uppercase">Conferidos:</span>
                        <span className="text-[8px] font-bold text-emerald-400 uppercase">{conferidos}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-rose-400/60 uppercase">Divergências:</span>
                        <span className="text-[8px] font-bold text-rose-400 uppercase">{divergencias}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-white/60 uppercase">Valor Total:</span>
                        <span className="text-[8px] font-bold text-accent uppercase">
                          {cell.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Tooltip>
              </Polygon>
            );
          })}
          
          {/* Visualização de Área Ocupada */}
          {heatmapMode === 'AREA' && Object.entries(locationGroups).map(([loc, data]) => {
            const conferidos = data.assets.filter(a => !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM').length;
            const divergencias = data.assets.filter(a => String(a.TAG_INVENTARIO || '').toUpperCase() === 'DIVERGÊNCIA').length;

            const polygon = (data.hull && data.hull.length >= 3) ? (
              <Polygon 
                key={`poly-${loc}`}
                positions={data.hull}
                pathOptions={{ 
                  color: '#3b82f6', 
                  fillColor: '#3b82f6', 
                  fillOpacity: 0.15,
                  weight: 3,
                  dashArray: 'none'
                }}
              >
                <Tooltip sticky direction="top" className="bg-slate-900 text-white border-none shadow-xl rounded-xl px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest mb-1">{loc}</span>
                    <div className="flex flex-col space-y-1">
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-white/60 uppercase">Ativos:</span>
                        <span className="text-[8px] font-bold text-white uppercase">{data.assets.length}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-emerald-400/60 uppercase">Conferidos:</span>
                        <span className="text-[8px] font-bold text-emerald-400 uppercase">{conferidos}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-rose-400/60 uppercase">Divergências:</span>
                        <span className="text-[8px] font-bold text-rose-400 uppercase">{divergencias}</span>
                      </div>
                      <div className="flex justify-between space-x-4">
                        <span className="text-[8px] font-bold text-white/60 uppercase">Valor:</span>
                        <span className="text-[8px] font-bold text-accent uppercase">
                          {data.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Tooltip>
                <Popup className="custom-popup">
                  <div className="p-2 flex flex-col space-y-2">
                    <span className="text-[10px] font-bold uppercase text-slate-900">{loc}</span>
                    <div className="flex items-center justify-between text-[8px] font-bold text-slate-500 uppercase mb-1">
                      <span>Ativos: {data.assets.length}</span>
                      <span className="text-accent">{data.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <button 
                      onClick={() => onSelectLocation?.(loc)}
                      className="bg-accent text-white px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-accent/80 transition-all"
                    >
                      Iniciar Inventário
                    </button>
                  </div>
                </Popup>
              </Polygon>
            ) : null;

            const points = data.assets.map((a, i) => {
              const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
              return (
                <CircleMarker
                  key={`point-${loc}-${a.id || i}`}
                  center={[a._lat!, a._lng!]}
                  radius={zoomLevel > 15 ? 6 : 4}
                  pathOptions={{
                    fillColor: isConferido ? '#10b981' : '#3b82f6',
                    color: '#ffffff',
                    weight: 2,
                    fillOpacity: 0.9
                  }}
                >
                  <Popup className="custom-popup">
                    <div className="p-2 min-w-[180px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-accent uppercase tracking-widest">{a.ETIQUETA || 'S/E'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${isConferido ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isConferido ? 'Conferido' : 'Pendente'}
                        </span>
                      </div>
                      <h4 className="text-[11px] font-bold text-ink leading-tight mb-1">{a.DESCRICAODOATIVO}</h4>
                      <p className="text-[9px] text-ink-muted uppercase font-bold tracking-tight">{a._localMaster || a.ENDERECO || a.LOCALIZACAO || 'Sem Endereço'}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            });

            return (
              <React.Fragment key={loc}>
                {polygon}
                {points}
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

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
                    {filteredAssets.filter(a => a._lat && a._lng).length}
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
                    {Object.keys(locationGroups).length}
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
