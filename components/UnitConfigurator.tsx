
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
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
  ChevronUp,
  ChevronDown,
  Map as MapIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UnitConfig, User } from '../types';
import { fetchUnitConfigs, saveUnitConfig } from '../services/supabaseService';
import { getCurrentLocation } from '../utils/gpsUtils';
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
  initialUnit?: string | null;
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

const UnitConfigurator: React.FC<UnitConfiguratorProps> = ({ user, units, onBack, onUpdateConfigs, initialUnit }) => {
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

  useEffect(() => {
    loadConfigs();
  }, [user.tenantid]);

  useEffect(() => {
    if (initialUnit && units.includes(initialUnit) && selectedUnit !== initialUnit) {
      handleSelectUnit(initialUnit);
    }
  }, [initialUnit, units, loading, selectedUnit]);

  useEffect(() => {
    if (onUpdateConfigs && configs.length > 0) {
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
    setIsSheetExpanded(false); // Recolhe o sheet ao selecionar
  };

  useEffect(() => {
    if (currentConfig.lat && currentConfig.lng) {
      const lat = Number(currentConfig.lat);
      const lng = Number(currentConfig.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        setMapCenter(prev => {
          if (prev[0] === lat && prev[1] === lng) return prev;
          return [lat, lng];
        });
      }
    }
  }, [currentConfig.lat, currentConfig.lng]);

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
      const location = await getCurrentLocation(true);
      setCurrentConfig(prev => ({ ...prev, lat: location.lat, lng: location.lng }));
      setMapCenter([location.lat, location.lng]);
      setMessage({ text: 'Localização atual capturada com sucesso.', type: 'success' });
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Erro ao obter localização:', error);
      setMessage({ text: error.message || 'Não foi possível obter sua localização atual.', type: 'error' });
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    const lat = currentConfig.lat !== undefined && currentConfig.lat !== null ? Number(currentConfig.lat) : NaN;
    const lng = currentConfig.lng !== undefined && currentConfig.lng !== null ? Number(currentConfig.lng) : NaN;

    if (!selectedUnit || isNaN(lat) || isNaN(lng)) {
      setMessage({ text: 'COORDENADAS INVÁLIDAS. CLIQUE NO MAPA OU USE "MINHA POSIÇÃO".', type: 'error' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const configToSave: UnitConfig = {
      id: currentConfig.id,
      _tenantid: user._tenantid || user.tenantid || 'CICOPAL',
      _unitid: selectedUnit,
      tenant_id: user._tenantid || user.tenantid || 'CICOPAL',
      unit_id: selectedUnit,
      lat: lat,
      lng: lng,
      radius_meters: currentConfig.radius_meters || 500,
      is_active: true,
      updated_by: user.email,
      updated_at: new Date().toISOString()
    };

    try {
      const result = await saveUnitConfig(configToSave);
      if (result === true) {
        setMessage({ text: 'CONFIGURAÇÃO GRAVADA COM SUCESSO!', type: 'success' });
        setConfigs(prev => {
          const newConfigs = [...prev];
          const idx = newConfigs.findIndex(c => 
            c.unit_id?.trim().toUpperCase() === selectedUnit.trim().toUpperCase()
          );
          if (idx >= 0) {
            newConfigs[idx] = { ...newConfigs[idx], ...configToSave };
          } else {
            newConfigs.push(configToSave);
          }
          return newConfigs;
        });
        setCurrentConfig(prev => ({ ...prev, ...configToSave }));
        if (onUpdateConfigs) onUpdateConfigs([...configs]);
        setTimeout(() => setIsSheetExpanded(false), 2000);
      } else {
        const errorMsg = typeof result === 'string' ? result : 'Falha na comunicação com o banco';
        setMessage({ text: `ERRO AO GRAVAR: ${errorMsg}`, type: 'error' });
      }
    } catch (err: unknown) {
      const error = err as Error;
      setMessage({ text: `ERRO CRÍTICO: ${error.message || 'Falha interna'}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const filteredUnits = units.filter(u => 
    u.toLowerCase().includes(unitSearchTerm.toLowerCase())
  );

  return (
    <div className="relative w-full h-[100dvh] bg-slate-900 overflow-hidden font-sans">
      {/* Background Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={mapCenter} 
          zoom={15} 
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          {mapType === 'street' ? (
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          ) : (
            <TileLayer
              attribution='Tiles &copy; Esri'
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
                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
              />
            </>
          )}
        </MapContainer>
      </div>

      {/* Floating Header */}
      <div className="absolute top-4 left-0 right-0 z-50 px-4 pointer-events-none">
        <div className="max-w-xl mx-auto">
          {/* Navigation & Search Row */}
          <div className="flex items-center space-x-3 pointer-events-auto">
            <button 
              onClick={onBack}
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
                        const isConfigured = configs.some(c => c.unit_id?.trim().toUpperCase() === unit?.trim().toUpperCase());
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
                    {/* Lat/Lng Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitude</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="any"
                            value={currentConfig.lat || ''} 
                            onChange={(e) => setCurrentConfig(prev => ({ ...prev, lat: parseFloat(e.target.value) }))}
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
                            onChange={(e) => setCurrentConfig(prev => ({ ...prev, lng: parseFloat(e.target.value) }))}
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
