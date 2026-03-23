
import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { Asset, TransactionOrigin } from '../types';
import BackButton from './BackButton';
import { Layers, Info, X, ShieldAlert, Filter } from 'lucide-react';

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

    // Cria a camada de calor
    const heatLayer = L.heatLayer(points as L.LatLngExpression[], {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1: 'red' }
    });

    heatLayer.addTo(map);

    // Ajusta o zoom para os pontos se houver
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p[0], p[1]]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, points]);

  return null;
};

const AssetMap: React.FC<AssetMapProps> = ({ assets, onBack, databaseMode }) => {
  const [showInfo, setShowInfo] = useState(true);
  const [selectedOrigin, setSelectedOrigin] = useState<TransactionOrigin | 'ALL'>('ALL');

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
    return filteredAssets
      .filter(a => a._lat && a._lng)
      .map(a => [a._lat!, a._lng!, 1] as [number, number, number]);
  }, [filteredAssets]);

  // Calcula o centro do mapa (apenas para inicialização se necessário)
  const initialCenter = useMemo(() => {
    if (heatPoints.length === 0) return [-23.5505, -46.6333] as [number, number]; // São Paulo default
    const sumLat = heatPoints.reduce((acc, p) => acc + p[0], 0);
    const sumLng = heatPoints.reduce((acc, p) => acc + p[1], 0);
    return [sumLat / heatPoints.length, sumLng / heatPoints.length] as [number, number];
  }, [heatPoints]);

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main overflow-hidden relative">
      {/* Header com Filtro */}
      <div className="absolute top-12 left-4 right-4 z-[1000] flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <BackButton onClick={onBack} label="Voltar" subLabel="Mapa de Calor" />
        </div>

        <div className="pointer-events-auto bg-white/90 backdrop-blur-md border border-border p-1 rounded-2xl shadow-xl flex items-center space-x-1">
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
          {/* Provedor de Mapas Gratuito (OpenStreetMap) */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <HeatmapLayer points={heatPoints} />
        </MapContainer>

        {showInfo && (
          <div className="absolute bottom-8 left-4 right-4 z-[1000] animate-slideUp">
            <div className="bg-white/90 backdrop-blur-md border border-white/20 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-accent" />
              <button 
                onClick={() => setShowInfo(false)}
                className="absolute top-4 right-4 p-2 text-ink-muted hover:text-accent transition-colors"
              >
                <X size={16} />
              </button>
              
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-accent-soft rounded-xl flex items-center justify-center text-accent">
                  <Layers size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-ink uppercase tracking-widest">
                    {selectedOrigin === 'ALL' ? 'Mapa de Calor Global' : `Origem: ${selectedOrigin}`}
                  </h3>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">OpenStreetMap Data</p>
                </div>
              </div>
              
              <p className="text-[10px] text-ink-muted leading-relaxed mb-4">
                Visualização de densidade de ativos baseada em geolocalização capturada durante as transações.
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div className="flex flex-col">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Pontos Filtrados</span>
                  <span className="text-lg font-bold text-ink tracking-tighter">{heatPoints.length}</span>
                </div>
                {databaseMode === 'INTERNAL' && (
                  <div className="flex items-center space-x-1 bg-warning/10 px-2 py-1 rounded-lg border border-warning/20">
                    <ShieldAlert size={10} className="text-warning" />
                    <span className="text-[8px] font-black text-warning uppercase tracking-widest">Modo Offline</span>
                  </div>
                )}
                <div className="flex flex-col text-right">
                  <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Total Conferidos</span>
                  <span className="text-lg font-bold text-accent tracking-tighter">
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
