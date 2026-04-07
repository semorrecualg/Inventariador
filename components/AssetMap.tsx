
import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup, Polygon, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { Asset, TransactionOrigin, DatabaseMode } from '../types';
import * as d3 from 'd3';

// Configuração de ícones customizados para o Leaflet
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const conferidoIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const pendenteIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = defaultIcon;
import BackButton from './BackButton';
import { Layers, Info, X, Filter, Activity, WifiOff, Database, Map as MapIcon, Box, Cloud } from 'lucide-react';

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
      radius: 30,
      blur: 20,
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
  const [heatmapMode, setHeatmapMode] = useState<'DENSITY' | 'VALUE' | 'AREA'>('AREA');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [zoomLevel, setZoomLevel] = useState(13);

  useEffect(() => {
    const handleStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
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
    return null;
  };

  const originOptions = [
    { label: 'TODAS AS ORIGENS', value: 'ALL' },
    { label: 'INVENTÁRIO (1000)', value: TransactionOrigin.INVENTORY },
    { label: 'ETIQUETAR (2000)', value: TransactionOrigin.LABELING },
    { label: 'CONCILIAÇÃO (3000)', value: TransactionOrigin.ACCOUNT_RECONCILIATION },
  ];

  const filteredAssets = useMemo(() => {
    if (selectedOrigin === 'ALL') return assets;
    return assets.filter(a => a._origemTransacao === selectedOrigin);
  }, [assets, selectedOrigin]);

  // Agrupamento por Localidade para cálculo de Área Ocupada
  const locationGroups = useMemo(() => {
    const groups: Record<string, { points: [number, number][], hull: [number, number][] | null, totalValue: number, assets: Asset[] }> = {};
    
    filteredAssets.forEach(a => {
      if (a._lat && a._lng) {
        const loc = a.ENDERECO || 'SEM LOCALIZAÇÃO';
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
    <div className="flex flex-col h-[100dvh] bg-bg-main overflow-hidden relative">
      {/* Header com Filtros */}
      <div className="absolute top-12 left-4 right-4 z-[1000] flex flex-col space-y-3 pointer-events-none">
        <div className="flex items-center justify-between">
          <div className="pointer-events-auto">
            <BackButton onClick={onBack} label="Voltar" subLabel="Mapeamento Geográfico" />
          </div>

          {isOffline && (
            <div className="pointer-events-auto bg-amber-500/90 backdrop-blur-md border border-amber-400/50 px-4 py-2 rounded-2xl shadow-xl flex items-center space-x-2 animate-pulse">
              <WifiOff size={14} className="text-white" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-white uppercase tracking-widest leading-none">Modo Offline</span>
                <span className="text-[7px] font-bold text-white/80 uppercase tracking-widest leading-none">Dados Locais Ativos</span>
              </div>
            </div>
          )}

          {/* Seletor de Métrica */}
          <div className="pointer-events-auto bg-slate-900 border border-white/10 p-1 rounded-2xl shadow-2xl flex items-center">
            <button
              onClick={() => setHeatmapMode('AREA')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
                heatmapMode === 'AREA' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white'
              }`}
            >
              <Box size={12} />
              <span>Área</span>
            </button>
            <button
              onClick={() => setHeatmapMode('DENSITY')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
                heatmapMode === 'DENSITY' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white'
              }`}
            >
              <Layers size={12} />
              <span>Calor</span>
            </button>
            <button
              onClick={() => setHeatmapMode('VALUE')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
                heatmapMode === 'VALUE' ? 'bg-accent text-white shadow-lg' : 'text-white/60 hover:text-white'
              }`}
            >
              <Activity size={12} />
              <span>Valor</span>
            </button>
          </div>
        </div>

        <div className="pointer-events-auto self-end bg-white/90 backdrop-blur-md border border-border p-1 rounded-2xl shadow-xl flex items-center space-x-1">
          <div className="px-3 py-1.5 flex items-center space-x-2 border-r border-border mr-1">
            <Filter size={14} className="text-accent" />
            <span className="text-[10px] font-bold text-ink uppercase tracking-widest">Origem</span>
          </div>
          <div className="flex items-center space-x-1 pr-1">
            {originOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedOrigin(opt.value as TransactionOrigin | 'ALL')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${
                  selectedOrigin === opt.value 
                    ? 'bg-accent text-white shadow-md' 
                    : 'text-ink-muted hover:bg-bg-main'
                }`}
              >
                {opt.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 relative z-0">
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
          
          {heatmapMode !== 'AREA' && <HeatmapLayer points={heatPoints} />}
          <ZoomHandler />
          
          {/* Visualização de Área Ocupada (Polígonos - Envoltória Convexa) */}
          {heatmapMode === 'AREA' && Object.entries(locationGroups).map(([loc, data]) => {
            if (!data.hull || data.hull.length < 3) {
              // Se não houver envoltória ou tiver menos de 3 pontos, desenha marcadores individuais
              return data.points.map((p, i) => (
                <Marker key={`${loc}-${i}`} position={p} icon={pendenteIcon}>
                  <Tooltip permanent direction="top" offset={[0, -20]} className="bg-white/90 border-none shadow-lg rounded-lg px-2 py-1">
                    <span className="text-[8px] font-black text-slate-900 uppercase">{loc}</span>
                  </Tooltip>
                  <Popup className="custom-popup">
                    <div className="p-2 flex flex-col space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-900">{loc}</span>
                      <button 
                        onClick={() => onSelectLocation?.(loc)}
                        className="bg-accent text-white px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-accent/80 transition-all"
                      >
                        Iniciar Inventário
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ));
            }

            return (
              <Polygon 
                key={loc}
                positions={data.hull}
                pathOptions={{ 
                  color: '#f27d26', 
                  fillColor: '#f27d26', 
                  fillOpacity: 0.25,
                  weight: 3,
                  dashArray: 'none'
                }}
              >
                <Tooltip sticky direction="top" className="bg-slate-900 text-white border-none shadow-xl rounded-xl px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest mb-1">{loc}</span>
                    <div className="flex items-center justify-between space-x-4">
                      <span className="text-[8px] font-bold text-white/60 uppercase">Ativos: {data.assets.length}</span>
                      <span className="text-[8px] font-bold text-accent uppercase">
                        {data.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
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
            );
          })}

          {/* Marcadores Individuais */}
          {zoomLevel >= 16 && filteredAssets.filter(a => a._lat && a._lng).map(a => {
            const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
            const icon = isConferido ? conferidoIcon : pendenteIcon;
            
            return (
              <Marker 
                key={a.id} 
                position={[a._lat!, a._lng!]} 
                icon={icon}
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
                    <p className="text-[9px] text-ink-muted uppercase font-bold tracking-tight">{a.ENDERECO || a.LOCALIZACAO || 'Sem Endereço'}</p>
                    <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
                      <span className="text-[8px] text-ink-muted uppercase font-bold">Patrimônio</span>
                      <span className="text-[10px] font-black text-ink">{a.REGISTRO}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {showInfo && (
          <div className="absolute bottom-8 left-4 right-4 z-[1000] animate-slideUp">
            <div className="bg-white/90 backdrop-blur-md border border-white/20 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-1.5 ${
                heatmapMode === 'VALUE' ? 'bg-accent' : heatmapMode === 'AREA' ? 'bg-emerald-500' : 'bg-blue-500'
              }`} />
              <button 
                onClick={() => setShowInfo(false)}
                className="absolute top-4 right-4 p-2 text-ink-muted hover:text-accent transition-colors"
              >
                <X size={16} />
              </button>
              
              <div className="flex items-center space-x-3 mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  heatmapMode === 'VALUE' ? 'bg-accent-soft text-accent' : 
                  heatmapMode === 'AREA' ? 'bg-emerald-100 text-emerald-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {heatmapMode === 'VALUE' ? <Activity size={16} /> : 
                   heatmapMode === 'AREA' ? <MapIcon size={16} /> :
                   <Layers size={16} />}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-ink uppercase tracking-widest">
                    {heatmapMode === 'VALUE' ? 'Concentração Financeira' : 
                     heatmapMode === 'AREA' ? 'Área Ocupada por Localidade' :
                     'Densidade de Ativos'}
                  </h3>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">
                    {selectedOrigin === 'ALL' ? 'Visão Global' : `Origem: ${selectedOrigin}`}
                  </p>
                </div>
              </div>
              
              <p className="text-[10px] text-ink-muted leading-relaxed mb-4">
                {heatmapMode === 'VALUE' 
                  ? 'O calor representa o valor acumulado dos ativos. Áreas vermelhas indicam maior concentração de capital imobilizado.'
                  : heatmapMode === 'AREA'
                  ? 'Visualização dos polígonos de ocupação baseados na dispersão física dos ativos inventariados por endereço.'
                  : 'O calor representa a quantidade de ativos por m². Áreas vermelhas indicam maior volume de itens físicos.'}
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div className="flex flex-col">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Ativos no Mapa</span>
                  <span className="text-lg font-bold text-ink tracking-tighter">{filteredAssets.filter(a => a._lat && a._lng).length}</span>
                </div>
                
                {databaseMode === DatabaseMode.INTERNAL ? (
                  <div className="flex items-center space-x-1 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                    <Database size={10} className="text-amber-600" />
                    <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Banco Local</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                    <Cloud size={10} className="text-emerald-600" />
                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Nuvem Real-time</span>
                  </div>
                )}

                <div className="flex flex-col text-center">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Valor Total</span>
                  <span className="text-lg font-bold text-accent tracking-tighter">
                    {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Localidades</span>
                  <span className="text-lg font-bold text-emerald-600 tracking-tighter">
                    {Object.keys(locationGroups).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!showInfo && (
          <button 
            onClick={() => setShowInfo(true)}
            className="absolute bottom-8 right-4 z-[1000] w-12 h-12 bg-white border border-border rounded-2xl flex items-center justify-center text-accent shadow-lg active:scale-90 transition-all"
          >
            <Info size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default AssetMap;
