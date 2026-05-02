import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Popup, Polygon, Tooltip, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { Asset, TransactionOrigin, DatabaseMode } from '../types';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import * as turf from '@turf/turf';

// Configuração de ícones customizados para o Leaflet
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = defaultIcon;
import { Info, X, Activity, ArrowLeft, ShieldCheck, SlidersHorizontal, Paintbrush, CheckCircle2, Layers } from 'lucide-react';

interface AssetMapProps {
  assets: Asset[];
  onBack: () => void;
  databaseMode: DatabaseMode;
  onSelectLocation?: (location: string) => void;
}

const AssetMap: React.FC<AssetMapProps> = ({ assets, onBack, onSelectLocation }) => {
  const [showInfo, setShowInfo] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState<TransactionOrigin | 'ALL'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string | 'ALL'>('ALL');
  const [selectedAltitude, setSelectedAltitude] = useState<number | 'ALL'>('ALL');
  const [colorMode, setColorMode] = useState<'STATUS' | 'COSTCENTER'>('STATUS');
  const [zoomLevel, setZoomLevel] = useState(13);

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedOrigin !== 'ALL') count++;
    if (selectedLocation !== 'ALL') count++;
    if (selectedAltitude !== 'ALL') count++;
    return count;
  }, [selectedOrigin, selectedLocation, selectedAltitude]);

  // Lista de localidades únicas para o filtro
  const locations = useMemo(() => {
    const locs = new Set<string>();
    assets.forEach(a => {
      if (a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM') {
        const loc = a._localMaster || a.ENDERECO;
        if (loc) locs.add(loc);
      }
    });
    return Array.from(locs).sort();
  }, [assets]);

  // Lista de altitudes únicas
  const altitudes = useMemo(() => {
    const alts = new Set<number>();
    assets.forEach(a => {
      if (a._altitude_level !== undefined) {
        alts.add(Number(a._altitude_level));
      }
    });
    return Array.from(alts).sort((a, b) => a - b);
  }, [assets]);

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
    let filtered = assets.filter(a => !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM');
    
    if (selectedOrigin !== 'ALL') {
      filtered = filtered.filter(a => a._origemTransacao === selectedOrigin);
    }
    if (selectedLocation !== 'ALL') {
      filtered = filtered.filter(a => (a._localMaster || a.ENDERECO) === selectedLocation);
    }
    if (selectedAltitude !== 'ALL') {
      filtered = filtered.filter(a => Number(a._altitude_level || 0) === selectedAltitude);
    }

    return filtered;
  }, [assets, selectedOrigin, selectedLocation, selectedAltitude]);

  // Agrupamento por Localidade e Altitude para Cartografia de Perímetros (V2.7)
  const cartographyGroups = useMemo(() => {
    // RESET TOTAL: Iniciamos um objeto vazio para garantir que endereços antigos sejam removidos
    const groups: Record<string, { 
      points: turf.Feature<turf.Point>[], 
      hull: [number, number][] | null, 
      areaM2: number,
      totalValue: number, 
      assets: Asset[],
      address: string,
      altitude: number,
      dominantCC: string
    }> = {};
    
    filteredAssets.forEach(a => {
      // APENAS ATIVOS COM COORDENADAS VÁLIDAS ENTRAM NA CARTOGRAFIA
      if (a._lat && a._lng) {
        const addr = (a._localMaster || a.ENDERECO || 'SEM ENDEREÇO').trim().toUpperCase();
        const alt = Number(a._altitude_level || 0);
        const key = `${addr}|${alt}`;
        
        if (!groups[key]) {
          groups[key] = { 
            points: [], 
            hull: null, 
            areaM2: 0,
            totalValue: 0, 
            assets: [],
            address: addr,
            altitude: alt,
            dominantCC: ''
          };
        }
        
        const g = groups[key];
        g.points.push(turf.point([a._lng, a._lat], { id: a.id, cc: a.CENTRODECUSTO }));
        g.assets.push(a);
        
        const val = typeof a.VLRAQUISIC === 'string' 
          ? parseFloat(a.VLRAQUISIC.replace(/[^\d,.-]/g, '').replace(',', '.')) 
          : (Number(a.VLRAQUISIC) || 0);
        g.totalValue += (val || 0);
      }
    });

    // RECALCULO DE GEOMETRIA TURF.JS
    Object.keys(groups).forEach(key => {
      const g = groups[key];
      // Exigimos 3 pontos para formar uma área (polígono). 1 ou 2 pontos são renderizados apenas como marcadores bip.
      if (g.points.length >= 3) {
        try {
          const featureCollection = turf.featureCollection(g.points);
          const hull = turf.convex(featureCollection);
          
          if (hull && hull.geometry.type === 'Polygon') {
            g.hull = hull.geometry.coordinates[0].map(coord => [coord[1], coord[0]]) as [number, number][];
            g.areaM2 = turf.area(hull);
            
            const ccCounts: Record<string, number> = {};
            g.assets.forEach(a => {
              const cc = a.CENTRODECUSTO || 'S/CC';
              ccCounts[cc] = (ccCounts[cc] || 0) + 1;
            });
            g.dominantCC = Object.entries(ccCounts).sort((a, b) => b[1] - a[1])[0][0];
          }
        } catch (err) {
          console.warn(`[CARTOGRAFIA] Falha ao processar perímetro para ${g.address}:`, err);
        }
      }
    });

    return groups;
  }, [filteredAssets]);

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

  // Função para cores baseadas em strings (Centro de Custo)
  const getCCColor = (cc: string) => {
    if (!cc || cc === 'S/CC') return '#64748b';
    const hash = Array.from(cc).reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const colorScale = d3.scaleSequential(d3.interpolateSpectral).domain([0, 100]);
    return colorScale(Math.abs(hash) % 100);
  };

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
          
          <ZoomHandler />
          
          {/* Cartografia de Perímetros (V2.7) */}
          {Object.entries(cartographyGroups).map(([key, data]) => {
            const conferidos = data.assets.filter(a => !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM').length;
            const divergencias = data.assets.filter(a => String(a.TAG_INVENTARIO || '').toUpperCase() === 'DIVERGÊNCIA').length;

            // Define cor do polígono
            const polyColor = colorMode === 'COSTCENTER' ? getCCColor(data.dominantCC) : '#3b82f6';

            return (
              <React.Fragment key={key}>
                {data.hull && (
                  <Polygon 
                    positions={data.hull}
                    pathOptions={{ 
                      color: polyColor, 
                      fillColor: polyColor, 
                      fillOpacity: 0.2,
                      weight: 3,
                      dashArray: '4, 8'
                    }}
                  >
                    <Tooltip sticky direction="top" className="bg-slate-900/90 text-white border-none shadow-2xl rounded-xl px-4 py-3 backdrop-blur-md">
                      <div className="flex flex-col min-w-[200px]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#3B82F6]">{data.address}</span>
                          <span className="bg-blue-500/20 text-blue-400 text-[8px] font-bold px-2 py-0.5 rounded-full border border-blue-500/30">NÍVEL {data.altitude}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-bold text-white/40 uppercase tracking-tighter">Área Estimada</span>
                            <span className="text-xs font-black text-white">{data.areaM2.toFixed(1)} m²</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] font-bold text-white/40 uppercase tracking-tighter">Ativos (Gps)</span>
                            <span className="text-xs font-black text-white">{data.points.length} itens</span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5 font-bold uppercase tracking-widest">
                          <div className="flex justify-between items-center text-[8px]">
                            <span className="text-white/40">Valor do Lote</span>
                            <span className="text-accent">{data.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          </div>
                          <div className="flex justify-between items-center text-[8px]">
                            <span className="text-emerald-400/60">Conferidos</span>
                            <span className="text-emerald-400">{conferidos}</span>
                          </div>
                          {divergencias > 0 && (
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-rose-400/60">Divergências</span>
                              <span className="text-rose-400">{divergencias}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[8px]">
                            <span className="text-white/40">Dominante CC</span>
                            <span className="text-white truncate max-w-[100px]">{data.dominantCC}</span>
                          </div>
                        </div>
                      </div>
                    </Tooltip>
                    
                    <Popup className="custom-popup">
                      <div className="p-3 flex flex-col space-y-3 min-w-[220px]">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">Cartografia V2.7</span>
                          <h4 className="text-xs font-bold text-slate-800 leading-tight">{data.address}</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <div className="flex flex-col">
                              <span className="text-[7px] font-bold text-slate-400 uppercase">Área</span>
                              <span className="text-[10px] font-black text-slate-700">{data.areaM2.toFixed(1)}m²</span>
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[7px] font-bold text-slate-400 uppercase">Nível</span>
                              <span className="text-[10px] font-black text-slate-700">{data.altitude}</span>
                           </div>
                        </div>
                        <button 
                          onClick={() => onSelectLocation?.(data.address)}
                          className="w-full bg-[#0F172A] text-white py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md"
                        >
                          Conferir Setor
                        </button>
                      </div>
                    </Popup>
                  </Polygon>
                )}

                {/* Marcadores dos Ativos Individuais (Bips) */}
                {data.assets.map((a, i) => {
                  const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
                  const markerColor = colorMode === 'COSTCENTER' ? getCCColor(a.CENTRO_DE_CUSTO || a.CENTRODECUSTO) : (isConferido ? '#10b981' : '#3b82f6');
                  
                  return (
                    <CircleMarker
                      key={`bip-${a.id || i}`}
                      center={[a._lat!, a._lng!]}
                      radius={zoomLevel > 18 ? 8 : zoomLevel > 16 ? 5 : 3}
                      pathOptions={{
                        fillColor: markerColor,
                        color: '#ffffff',
                        weight: 1.5,
                        fillOpacity: 0.9,
                        className: 'transition-all duration-300'
                      }}
                    >
                      <Popup className="custom-popup">
                        <div className="p-2 min-w-[200px]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{a.ETIQUETA || 'N/A'}</span>
                            <div className="flex items-center space-x-1">
                               <span className="text-[7px] font-black bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 uppercase">N{a._altitude_level || 0}</span>
                               <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${isConferido ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {isConferido ? 'Capturado' : 'Pendente'}
                               </span>
                            </div>
                          </div>
                          <h4 className="text-[10px] font-bold text-slate-800 leading-tight mb-1">{a.DESCRICAODOATIVO}</h4>
                          <div className="mt-2 flex flex-col space-y-1 text-[8px] font-bold text-slate-500 uppercase tracking-tighter">
                            <span className="flex items-center space-x-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                               <span>CC: {a.CENTRO_DE_CUSTO || a.CENTRODECUSTO || 'S/CC'}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                               <span>Sinc: {a._pos_timestamp ? new Date(a._pos_timestamp).toLocaleTimeString() : 'N/A'}</span>
                            </span>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

      {/* Header & Navegação */}
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
              <h1 className="text-sm font-black text-white uppercase tracking-widest">Mapa Patrimonial</h1>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30">
                  <ShieldCheck size={10} className="text-blue-400" />
                  <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">Cartografia V2.7</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#1E293B]/90 backdrop-blur-md p-2 rounded-2xl shadow-2xl border border-white/5 flex items-center ml-2">
            <Layers size={16} className="text-blue-400 mr-2" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Smart Facility</span>
          </div>
        </div>
      </div>

      {/* Ilha de Filtros e Altitude */}
      <div className="absolute top-28 left-6 right-6 z-[1001] flex items-center space-x-3 pointer-events-none">
        <button 
          onClick={() => setIsFilterModalOpen(true)}
          className="pointer-events-auto bg-[#1E293B]/90 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-3 active:scale-95 transition-all group"
        >
          <div className="relative">
            <SlidersHorizontal size={16} className="text-[#3B82F6] group-hover:rotate-12 transition-transform" />
            {activeFiltersCount > 0 && (
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-[#3B82F6] rounded-full flex items-center justify-center border-2 border-[#0F172A]">
                <span className="text-[8px] font-black text-white">{activeFiltersCount}</span>
              </div>
            )}
          </div>
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Gestão Espacial</span>
        </button>

        <div className="pointer-events-auto flex items-center bg-[#1E293B]/90 backdrop-blur-md border border-white/10 rounded-2xl p-1 shadow-2xl">
          <div className="px-3 border-r border-white/5 mr-1">
            <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter block">Nível/Altitude</span>
            <select 
              value={selectedAltitude}
              onChange={(e) => setSelectedAltitude(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="bg-transparent text-[10px] font-bold text-white uppercase outline-none cursor-pointer pr-4"
            >
              <option value="ALL" className="bg-[#1E293B]">Todos</option>
              {altitudes.map(alt => (
                <option key={alt} value={alt} className="bg-[#1E293B]">Nível {alt}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center px-1">
            {[
              { id: 'STATUS', label: 'Status', icon: CheckCircle2 },
              { id: 'COSTCENTER', label: 'CC', icon: Paintbrush }
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setColorMode(opt.id as 'STATUS' | 'COSTCENTER')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all flex items-center space-x-1.5 ${
                  colorMode === opt.id ? 'bg-[#3B82F6] text-white' : 'text-white/40'
                }`}
                title={`Colorir por ${opt.label}`}
              >
                <opt.icon size={10} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info Panel Toggle (Bottom Right) */}
      <div className="absolute bottom-10 right-6 z-[1001]">
         <button 
           onClick={() => setShowInfo(!showInfo)}
           className={`w-12 h-12 rounded-2xl shadow-2xl flex items-center justify-center transition-all ${
             showInfo ? 'bg-white text-[#0F172A]' : 'bg-[#3B82F6] text-white hover:bg-[#2563EB]'
           }`}
         >
           {showInfo ? <X size={22} /> : <Info size={22} />}
         </button>
      </div>

      {/* Modal de Detalhes dos Filtros */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterModalOpen(false)}
              className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#1E293B] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-widest">Parâmetros Geográficos</h2>
                  <p className="text-[10px] text-white/40 font-medium uppercase mt-1">Configuração de Cartografia</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Origem</label>
                  <div className="grid grid-cols-2 gap-2">
                     {originOptions.map(opt => (
                       <button
                         key={opt.value}
                         onClick={() => setSelectedOrigin(opt.value as TransactionOrigin | 'ALL')}
                         className={`px-3 py-2.5 rounded-xl text-[9px] font-bold uppercase transition-all text-center ${
                           selectedOrigin === opt.value ? 'bg-[#3B82F6] text-white' : 'bg-white/5 text-white/60'
                         }`}
                       >
                         {opt.label.split(' ')[0]}
                       </button>
                     ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Localidade</label>
                  <select 
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest appearance-none outline-none"
                  >
                    <option value="ALL" className="bg-[#1E293B]">TODAS AS LOCALIDADES</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc} className="bg-[#1E293B]">{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-10 flex space-x-3">
                 <button 
                   onClick={() => setIsFilterModalOpen(false)}
                   className="flex-1 py-4 bg-[#3B82F6] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl"
                 >
                   Confirmar
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Info Panel */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-28 left-6 right-6 z-[1001]"
          >
            <div className="bg-[#1E293B]/95 backdrop-blur-xl border border-white/10 p-6 rounded-[2rem] shadow-2xl">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                     <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                        <Activity size={20} />
                     </div>
                     <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Métricas de Ocupação</h3>
                        <p className="text-[10px] text-white/40 uppercase font-medium">Análise de Campo v2.7</p>
                     </div>
                  </div>
               </div>

               <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                     <span className="text-[8px] font-bold text-white/40 uppercase block mb-1">Polígonos</span>
                     <span className="text-lg font-black text-white">{Object.keys(cartographyGroups).length}</span>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                     <span className="text-[8px] font-bold text-white/40 uppercase block mb-1">Posições</span>
                     <span className="text-lg font-black text-blue-400">{filteredAssets.length}</span>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                     <span className="text-[8px] font-bold text-white/40 uppercase block mb-1">Valor Auditado</span>
                     <span className="text-xs font-black text-emerald-400 truncate">
                        {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' })}
                     </span>
                  </div>
               </div>

               <div className="pt-4 border-t border-white/5">
                  <p className="text-[9px] text-white/30 font-medium uppercase leading-relaxed">
                     O Mapa de Perímetros (Geo-Intelligence) desenha formas geométricas que englobam os ativos inventoriedos em cada endereço e nível. Áreas vazias entre polígonos representam zonas com ativos pendentes ou sem cobertura de auditoria.
                  </p>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssetMap;
