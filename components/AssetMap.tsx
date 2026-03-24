
import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { Asset, TransactionOrigin } from '../types';
import BackButton from './BackButton';
import { Layers, Info, X, Filter, Activity, WifiOff, Database } from 'lucide-react';

// Extensão necessária para o TypeScript reconhecer o plugin leaflet.heat
declare module 'leaflet' {
  function heatLayer(latlngs: L.LatLngExpression[], options?: unknown): L.Layer;
}

interface AssetMapProps {
  assets: Asset[];
  onBack: () => void;
  databaseMode: 'INTERNAL' | 'SUPABASE';
}

// Componente para gerenciar a camada de calor (Heatmap)
const HeatmapLayer: React.FC<{ points: [number, number, number][] }> = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (points.length === 0) {
      // Se não houver pontos, não faz nada ou remove camadas anteriores se necessário
      return;
    }

    // Cria a camada de calor com gradiente técnico de alto contraste
    const heatLayer = L.heatLayer(points as L.LatLngExpression[], {
      radius: 30,
      blur: 20,
      maxZoom: 18,
      // Gradiente: Azul (Frio/Baixo) -> Ciano -> Verde -> Amarelo -> Laranja -> Vermelho (Quente/Alto)
      gradient: {
        0.2: '#3b82f6', // blue-500
        0.4: '#06b6d4', // cyan-500
        0.6: '#10b981', // emerald-500
        0.8: '#f59e0b', // amber-500
        1.0: '#ef4444'  // red-500
      }
    });

    heatLayer.addTo(map);

    // Ajusta o zoom para os pontos se houver
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

const AssetMap: React.FC<AssetMapProps> = ({ assets, onBack }) => {
  const [showInfo, setShowInfo] = useState(true);
  const [selectedOrigin, setSelectedOrigin] = useState<TransactionOrigin | 'ALL'>('ALL');
  const [heatmapMode, setHeatmapMode] = useState<'DENSITY' | 'VALUE'>('DENSITY');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  // Opções de filtro de origem
  const originOptions = [
    { label: 'TODAS AS ORIGENS', value: 'ALL' },
    { label: 'INVENTÁRIO (1000)', value: TransactionOrigin.INVENTORY },
    { label: 'ETIQUETAR (2000)', value: TransactionOrigin.LABELING },
    { label: 'CONCILIAÇÃO (3000)', value: TransactionOrigin.ACCOUNT_RECONCILIATION },
  ];

  // Filtra os ativos pela origem selecionada
  const filteredAssets = useMemo(() => {
    if (selectedOrigin === 'ALL') return assets;
    return assets.filter(a => a._origemTransacao === selectedOrigin);
  }, [assets, selectedOrigin]);

  // Prepara os pontos para o mapa de calor [lat, lng, intensidade]
  const heatPoints = useMemo(() => {
    const validAssets = filteredAssets.filter(a => a._lat && a._lng);
    
    if (heatmapMode === 'DENSITY') {
      // Modo Densidade: Cada item vale 1
      return validAssets.map(a => [a._lat!, a._lng!, 1] as [number, number, number]);
    } else {
      // Modo Valor: Intensidade baseada no Valor de Aquisição (Logarítmico)
      // Usamos Log10 para normalizar a escala entre ativos de R$ 100 e R$ 1.000.000
      return validAssets.map(a => {
        const rawVal = typeof a.VLRAQUISIC === 'string' 
          ? parseFloat(a.VLRAQUISIC.replace(/[^\d,.-]/g, '').replace(',', '.')) 
          : (Number(a.VLRAQUISIC) || 0);
        
        const val = Math.max(1, rawVal);
        // Fórmula: log10(valor) -> R$ 100 = 2, R$ 1000 = 3, R$ 1M = 6
        const intensity = Math.log10(val);
        return [a._lat!, a._lng!, intensity] as [number, number, number];
      });
    }
  }, [filteredAssets, heatmapMode]);

  // Calcula o valor total dos ativos filtrados
  const totalValue = useMemo(() => {
    return filteredAssets.reduce((acc, a) => {
      const val = typeof a.VLRAQUISIC === 'string' 
        ? parseFloat(a.VLRAQUISIC.replace(/[^\d,.-]/g, '').replace(',', '.')) 
        : (Number(a.VLRAQUISIC) || 0);
      return acc + (val || 0);
    }, 0);
  }, [filteredAssets]);

  // Calcula o centro do mapa
  const initialCenter = useMemo(() => {
    if (heatPoints.length === 0) return [-23.5505, -46.6333] as [number, number];
    const sumLat = heatPoints.reduce((acc, p) => acc + p[0], 0);
    const sumLng = heatPoints.reduce((acc, p) => acc + p[1], 0);
    return [sumLat / heatPoints.length, sumLng / heatPoints.length] as [number, number];
  }, [heatPoints]);

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main overflow-hidden relative">
      {/* Header com Filtros */}
      <div className="absolute top-12 left-4 right-4 z-[1000] flex flex-col space-y-3 pointer-events-none">
        <div className="flex items-center justify-between">
          <div className="pointer-events-auto">
            <BackButton onClick={onBack} label="Voltar" subLabel="Mapa de Calor" />
          </div>

          {/* Indicador de Dados Locais (Offline) */}
          {isOffline && (
            <div className="pointer-events-auto bg-amber-500/90 backdrop-blur-md border border-amber-400/50 px-4 py-2 rounded-2xl shadow-xl flex items-center space-x-2 animate-pulse">
              <WifiOff size={14} className="text-white" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-white uppercase tracking-widest leading-none">Modo Offline</span>
                <span className="text-[7px] font-bold text-white/80 uppercase tracking-widest leading-none">Dados Locais Ativos</span>
              </div>
            </div>
          )}

          {/* Seletor de Métrica (Densidade vs Valor) */}
          <div className="pointer-events-auto bg-slate-900 border border-white/10 p-1 rounded-2xl shadow-2xl flex items-center">
            <button
              onClick={() => setHeatmapMode('DENSITY')}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
                heatmapMode === 'DENSITY' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white'
              }`}
            >
              <Layers size={12} />
              <span>Densidade</span>
            </button>
            <button
              onClick={() => setHeatmapMode('VALUE')}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${
                heatmapMode === 'VALUE' ? 'bg-accent text-white shadow-lg' : 'text-white/60 hover:text-white'
              }`}
            >
              <Activity size={12} />
              <span>Valor R$</span>
            </button>
          </div>
        </div>

        {/* Filtro de Origem */}
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
          
          <HeatmapLayer points={heatPoints} />
        </MapContainer>

        {showInfo && (
          <div className="absolute bottom-8 left-4 right-4 z-[1000] animate-slideUp">
            <div className="bg-white/90 backdrop-blur-md border border-white/20 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-1.5 ${heatmapMode === 'VALUE' ? 'bg-accent' : 'bg-blue-500'}`} />
              <button 
                onClick={() => setShowInfo(false)}
                className="absolute top-4 right-4 p-2 text-ink-muted hover:text-accent transition-colors"
              >
                <X size={16} />
              </button>
              
              <div className="flex items-center space-x-3 mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${heatmapMode === 'VALUE' ? 'bg-accent-soft text-accent' : 'bg-blue-100 text-blue-600'}`}>
                  {heatmapMode === 'VALUE' ? <Activity size={16} /> : <Layers size={16} />}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-ink uppercase tracking-widest">
                    {heatmapMode === 'VALUE' ? 'Concentração Financeira' : 'Densidade de Ativos'}
                  </h3>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">
                    {selectedOrigin === 'ALL' ? 'Visão Global' : `Origem: ${selectedOrigin}`}
                  </p>
                </div>
              </div>
              
              <p className="text-[10px] text-ink-muted leading-relaxed mb-4">
                {heatmapMode === 'VALUE' 
                  ? 'O calor representa o valor acumulado dos ativos. Áreas vermelhas indicam maior concentração de capital imobilizado.'
                  : 'O calor representa a quantidade de ativos por m². Áreas vermelhas indicam maior volume de itens físicos.'}
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div className="flex flex-col">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Ativos no Mapa</span>
                  <span className="text-lg font-bold text-ink tracking-tighter">{heatPoints.length}</span>
                </div>
                
                {isOffline && (
                  <div className="flex items-center space-x-1 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                    <Database size={10} className="text-amber-600" />
                    <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Banco Local</span>
                  </div>
                )}

                <div className="flex flex-col text-center">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Valor Total</span>
                  <span className="text-lg font-bold text-accent tracking-tighter">
                    {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Conferidos</span>
                  <span className="text-lg font-bold text-emerald-600 tracking-tighter">
                    {filteredAssets.filter(a => a._conferido).length}
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
