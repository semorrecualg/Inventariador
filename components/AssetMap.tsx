
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
import { Layers, Info, X, Filter, Activity, Database, Map as MapIcon, Box, Cloud, ArrowLeft } from 'lucide-react';

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
  const [showInfo, setShowInfo] = useState(true);
  const [selectedOrigin, setSelectedOrigin] = useState<TransactionOrigin | 'ALL'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string | 'ALL'>('ALL');
  const [heatmapMode, setHeatmapMode] = useState<'DENSITY' | 'VALUE' | 'AREA' | 'GRID'>('AREA');
  const [zoomLevel, setZoomLevel] = useState(13);

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
    <div className="flex flex-col h-[100dvh] bg-white overflow-hidden relative">
      {/* Mapa Fullscreen */}
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

      {/* Botão Voltar Flutuante */}
      <div className="absolute top-16 left-6 z-[1001]">
        <button 
          onClick={onBack}
          className="w-12 h-12 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-slate-900 border border-slate-100 active:scale-90 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Seletor de Modo Flutuante (Topo Direita) */}
      <div className="absolute top-16 right-6 z-[1001] flex items-center bg-slate-900/90 backdrop-blur-md p-1 rounded-2xl shadow-2xl border border-white/10">
        <button
          onClick={() => setHeatmapMode('GRID')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
            heatmapMode === 'GRID' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white'
          }`}
        >
          <Box size={14} />
          <span>Grade</span>
        </button>
        <button
          onClick={() => setHeatmapMode('AREA')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
            heatmapMode === 'AREA' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white'
          }`}
        >
          <MapIcon size={14} />
          <span>Área</span>
        </button>
        <button
          onClick={() => setHeatmapMode('VALUE')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
            heatmapMode === 'VALUE' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white'
          }`}
        >
          <Activity size={14} />
          <span>Valor</span>
        </button>
      </div>

      {/* Filtros Flutuantes (Abaixo do Back) */}
      <div className="absolute top-32 left-6 right-6 z-[1001] flex flex-col space-y-2 pointer-events-none">
        <div className="pointer-events-auto bg-white/90 backdrop-blur-md border border-slate-100 p-1.5 rounded-2xl shadow-xl flex items-center justify-between">
          <div className="flex items-center space-x-2 px-3 border-r border-slate-100">
            <Filter size={16} className="text-blue-600" />
            <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Filtros</span>
          </div>
          <div className="flex-1 flex items-center px-3 space-x-4">
            <select 
              value={selectedOrigin}
              onChange={(e) => setSelectedOrigin(e.target.value as TransactionOrigin | 'ALL')}
              className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase tracking-widest focus:ring-0 cursor-pointer"
            >
              {originOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="h-4 w-px bg-slate-100" />
            <select 
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase tracking-widest focus:ring-0 cursor-pointer max-w-[150px]"
            >
              <option value="ALL">TODAS AS LOCALIDADES</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Painel de Informações (Bottom Sheet Style) */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="absolute bottom-0 left-0 right-0 z-[1002] p-4 pointer-events-none"
          >
            <div className="pointer-events-auto bg-white/95 backdrop-blur-xl border-t border-slate-100 rounded-t-[2.5rem] p-8 shadow-[0_-20px_50px_rgba(0,0,0,0.1)] relative">
              <div className={`absolute top-0 left-0 w-full h-1.5 rounded-t-full ${
                heatmapMode === 'VALUE' ? 'bg-blue-600' : 
                heatmapMode === 'AREA' ? 'bg-emerald-500' : 
                'bg-blue-500'
              }`} />
              
              <button 
                onClick={() => setShowInfo(false)}
                className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-900 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center space-x-4 mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  heatmapMode === 'VALUE' ? 'bg-blue-50 text-blue-600' : 
                  heatmapMode === 'AREA' ? 'bg-emerald-50 text-emerald-600' :
                  'bg-blue-50 text-blue-600'
                }`}>
                  {heatmapMode === 'VALUE' ? <Activity size={24} /> : 
                   heatmapMode === 'AREA' ? <MapIcon size={24} /> :
                   <Layers size={24} />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                    {heatmapMode === 'VALUE' ? 'Concentração Financeira' : 
                     heatmapMode === 'AREA' ? 'Área Ocupada por Localidade' :
                     'Densidade de Ativos'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visão Global de Auditoria</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed mb-8 font-medium">
                {heatmapMode === 'VALUE' 
                  ? 'O calor representa o valor acumulado dos ativos. Áreas vermelhas indicam maior concentração de capital imobilizado.'
                  : heatmapMode === 'AREA'
                  ? 'Visualização dos polígonos de ocupação baseados na dispersão física dos ativos inventariados por endereço.'
                  : 'O calor representa a quantidade de ativos por m². Áreas vermelhas indicam maior volume de itens físicos.'}
              </p>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-50">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Ativos</span>
                  <span className="text-2xl font-black text-slate-900 tracking-tighter">
                    {filteredAssets.filter(a => a._lat && a._lng).length}
                  </span>
                </div>
                <div className="flex flex-col text-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Total</span>
                  <span className="text-2xl font-black text-blue-600 tracking-tighter">
                    {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Locais</span>
                  <span className="text-2xl font-black text-emerald-600 tracking-tighter">
                    {Object.keys(locationGroups).length}
                  </span>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-center">
                {databaseMode === DatabaseMode.INTERNAL ? (
                  <div className="flex items-center space-x-2 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
                    <Database size={14} className="text-amber-600" />
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Banco Local Ativo</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                    <Cloud size={14} className="text-emerald-600" />
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Nuvem Real-time</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showInfo && (
        <button 
          onClick={() => setShowInfo(true)}
          className="absolute bottom-8 right-6 z-[1001] w-14 h-14 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 border border-slate-100 active:scale-90 transition-all"
        >
          <Info size={24} />
        </button>
      )}
    </div>
  );
};

export default AssetMap;
