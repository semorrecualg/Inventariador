
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import { 
  MapPin, 
  Save, 
  Navigation, 
  Target, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  Info,
  Layers
} from 'lucide-react';
import { UnitConfig, User } from '../types';
import { fetchUnitConfigs, saveUnitConfig } from '../services/supabaseService';
import BackButton from './BackButton';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface UnitConfiguratorProps {
  user: User;
  units: string[];
  onBack: () => void;
  onUpdateConfigs?: (configs: UnitConfig[]) => void;
}

const MapEvents = ({ onClick }: { onClick: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const MapController = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

const UnitConfigurator: React.FC<UnitConfiguratorProps> = ({ user, units, onBack, onUpdateConfigs }) => {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [mapType, setMapType] = useState<'street' | 'satellite'>('street');
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-15.7942, -47.8822]);

  useEffect(() => {
    loadConfigs();
  }, [user.tenantid]);

  const loadConfigs = async () => {
    setLoading(true);
    const data = await fetchUnitConfigs(user.tenantid);
    setConfigs(data);
    if (onUpdateConfigs) onUpdateConfigs(data);
    setLoading(false);
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
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
    } catch (err) {
      console.error('Erro na busca de localização:', err);
      setMessage({ text: 'Erro ao buscar localização.', type: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectUnit = (unit: string) => {
    setSelectedUnit(unit);
    const existing = configs.find(c => 
      c.unit_id?.trim().toUpperCase() === unit?.trim().toUpperCase()
    );
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
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (!selectedUnit) return;
    setCurrentConfig(prev => ({ ...prev, lat, lng }));
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage({ text: 'Geolocalização não suportada pelo navegador.', type: 'error' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentConfig(prev => ({ ...prev, lat: latitude, lng: longitude }));
        setMapCenter([latitude, longitude]);
      },
      (error) => {
        console.error('Erro ao obter localização:', error);
        setMessage({ text: 'Não foi possível obter sua localização atual.', type: 'error' });
      }
    );
  };

  const handleSave = async () => {
    if (!selectedUnit || !currentConfig.lat || !currentConfig.lng) return;

    setSaving(true);
    const configToSave: UnitConfig = {
      id: currentConfig.id, // Preserve ID if it exists
      tenant_id: user.tenantid,
      unit_id: selectedUnit,
      lat: Number(currentConfig.lat),
      lng: Number(currentConfig.lng),
      radius_meters: currentConfig.radius_meters || 500,
      is_active: true,
      updated_by: user.email
    };

    console.log('Saving Unit Config:', configToSave);
    try {
      const result = await saveUnitConfig(configToSave);
      if (result === true) {
        setMessage({ text: 'Configuração salva com sucesso!', type: 'success' });
        await loadConfigs();
      } else {
        const errorMsg = typeof result === 'string' ? result : 'Erro desconhecido ao salvar';
        setMessage({ 
          text: `Falha na Gravação: ${errorMsg}. Verifique se o Schema possui permissões de escrita.`, 
          type: 'error' 
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[UnitConfigurator] Erro ao salvar:', error);
      const errorMsg = error.message || 'Erro inesperado';
      setMessage({ 
        text: `Erro Crítico: ${errorMsg}`, 
        type: 'error' 
      });
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header */}
      <div className="pt-12 pb-4 px-4 bg-white border-b border-border flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-3">
          <BackButton onClick={onBack} label="Voltar" subLabel="Configuração de Unidades" />
        </div>
        <div className="w-10 h-10 bg-accent-soft border border-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm">
          <Navigation size={20} />
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar: Unit List */}
        <div className="w-full md:w-80 bg-white border-r border-border flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border bg-bg-main/50">
            <h2 className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-2">Unidades Operacionais</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={14} />
              <input 
                type="text" 
                placeholder="Buscar unidade..." 
                className="w-full pl-9 pr-4 py-2 bg-white border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <Loader2 className="animate-spin text-accent" size={24} />
                <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">Carregando unidades...</p>
              </div>
            ) : (
              units.map((unit) => {
                const isConfigured = configs.some(c => 
                  c.unit_id?.trim().toUpperCase() === unit?.trim().toUpperCase()
                );
                const isSelected = selectedUnit === unit;
                return (
                  <button
                    key={unit}
                    onClick={() => handleSelectUnit(unit)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                      isSelected 
                        ? 'bg-accent text-white shadow-md' 
                        : 'hover:bg-bg-main text-ink border border-transparent hover:border-border'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20' : 'bg-bg-main border border-border'}`}>
                        <Target size={16} className={isSelected ? 'text-white' : 'text-ink-muted'} />
                      </div>
                      <div className="text-left">
                        <p className={`text-[10px] font-bold uppercase tracking-tight ${isSelected ? 'text-white' : 'text-ink'}`}>{unit}</p>
                        <p className={`text-[8px] font-bold uppercase tracking-widest ${isSelected ? 'text-white/70' : 'text-ink-muted'}`}>
                          {isConfigured ? 'Configurado' : 'Pendente'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={14} className={isSelected ? 'text-white/50' : 'text-ink-muted'} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Main Content: Map & Config */}
        <div className="flex-1 flex flex-col bg-bg-main relative">
          {!selectedUnit ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-white border border-border rounded-3xl flex items-center justify-center text-ink-muted shadow-sm">
                <MapPin size={40} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink uppercase tracking-tight">Selecione uma Unidade</h3>
                <p className="text-[10px] text-ink-muted uppercase tracking-widest mt-2 max-w-xs leading-relaxed">
                  Escolha uma unidade operacional na lista lateral para definir as coordenadas GPS da Âncora de Auditoria.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Map Area */}
              <div className="flex-1 relative z-10">
                <MapContainer 
                  center={mapCenter} 
                  zoom={15} 
                  style={{ height: '100%', width: '100%' }}
                  className="z-0"
                >
                  {mapType === 'street' ? (
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                  ) : (
                    <TileLayer
                      attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                  )}
                  <MapController center={mapCenter} />
                  <MapEvents onClick={handleMapClick} />
                  {currentConfig.lat && currentConfig.lng && (
                    <>
                      <Marker position={[currentConfig.lat, currentConfig.lng]} />
                      <Circle 
                        center={[currentConfig.lat, currentConfig.lng]} 
                        radius={currentConfig.radius_meters || 500}
                        pathOptions={{ color: '#F27D26', fillColor: '#F27D26', fillOpacity: 0.2 }}
                      />
                    </>
                  )}
                </MapContainer>

                {/* Map Overlay Controls */}
                <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col space-y-2 pointer-events-none">
                  <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
                    <form 
                      onSubmit={handleSearchLocation}
                      className="flex-1 flex items-center bg-white border border-border rounded-xl shadow-lg overflow-hidden"
                    >
                      <div className="pl-3 text-ink-muted">
                        <Search size={16} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="Buscar cidade ou endereço..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 px-3 py-2.5 text-xs focus:outline-none"
                      />
                      <button 
                        type="submit"
                        disabled={searching}
                        className="px-4 py-2.5 bg-accent text-white font-bold text-[10px] uppercase tracking-widest hover:bg-accent-dark transition-colors disabled:opacity-50"
                      >
                        {searching ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
                      </button>
                    </form>

                    <button 
                      onClick={handleUseCurrentLocation}
                      className="p-3 bg-white border border-border rounded-xl shadow-lg text-accent active:scale-95 transition-all flex items-center justify-center space-x-2 shrink-0"
                      title="Usar minha localização atual"
                    >
                      <Target size={18} />
                      <span className="text-[10px] font-bold uppercase tracking-widest pr-1">Minha Posição</span>
                    </button>

                    <button 
                      onClick={() => setMapType(mapType === 'street' ? 'satellite' : 'street')}
                      className={`p-3 border rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center space-x-2 shrink-0 ${
                        mapType === 'satellite' ? 'bg-accent text-white border-accent' : 'bg-white text-ink-muted border-border'
                      }`}
                      title="Alternar visão Satélite"
                    >
                      <Layers size={18} />
                      <span className="text-[10px] font-bold uppercase tracking-widest pr-1">
                        {mapType === 'street' ? 'Satélite' : 'Mapa'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Map Legend/Info */}
                <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm border border-border p-3 rounded-xl shadow-lg max-w-[200px]">
                  <div className="flex items-start space-x-2">
                    <Info size={14} className="text-accent mt-0.5 shrink-0" />
                    <p className="text-[8px] font-bold text-ink-muted uppercase tracking-tight leading-relaxed">
                      Clique no mapa para definir o centro da unidade operacional. O círculo laranja representa o raio de tolerância para o auditor.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Config Panel */}
              <div className="bg-white border-t border-border p-4 shadow-2xl z-20">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1">Latitude</label>
                      <input 
                        type="number" 
                        value={currentConfig.lat || ''} 
                        readOnly
                        className="w-full p-3 bg-bg-main border border-border rounded-xl text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1">Longitude</label>
                      <input 
                        type="number" 
                        value={currentConfig.lng || ''} 
                        readOnly
                        className="w-full p-3 bg-bg-main border border-border rounded-xl text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1">Raio de Tolerância (Metros)</label>
                      <div className="flex items-center space-x-3">
                        <input 
                          type="range" 
                          min="50" 
                          max="2000" 
                          step="50"
                          value={currentConfig.radius_meters || 500}
                          onChange={(e) => setCurrentConfig(prev => ({ ...prev, radius_meters: parseInt(e.target.value) }))}
                          className="flex-1 accent-accent"
                        />
                        <span className="text-xs font-bold text-ink w-12 text-right">{currentConfig.radius_meters}m</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleSave}
                    disabled={saving || !currentConfig.lat}
                    className="w-full md:w-auto px-8 py-4 bg-accent text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    <span>Salvar Configuração</span>
                  </button>
                </div>

                {message && (
                  <div className={`mt-4 p-3 rounded-xl flex items-center space-x-3 border ${
                    message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                  }`}>
                    {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <p className="text-[10px] font-bold uppercase tracking-widest">{message.text}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnitConfigurator;
