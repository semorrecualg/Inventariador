
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Asset, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode, User, DatabaseMode, UnitConfig } from '../types';
import Scanner from './Scanner';
import { extractEtiquetaFromQrData } from '../utils/qrUtils';
import { generateUUID } from '../services/supabaseService';
import { telemetryService, DeviceMetrics } from '../services/telemetryService';
import { localDb } from '../services/localDbService';
import { normalizeKey } from '../utils/schema';
import { AssetListItem } from './AssetListItem';

import { createWorker } from 'tesseract.js';
import { reverseGeocode } from '../services/geocodingService';
import { 
  MapPin, 
  Check,
  CheckCircle2,
  Zap, 
  ChevronRight,
  Square,
  CheckSquare,
  Plus,
  Search,
  X,
  AlertTriangle,
  FilePlus2,
  FileText,
  Camera,
  Keyboard,
  Loader2,
  Database,
  Mic,
  ShieldAlert,
  Activity,
  WifiOff,
  Flashlight,
  ArrowLeft,
  Target
} from 'lucide-react';

import { QRCodeSVG } from 'qrcode.react';


interface AssetCardProps {
  asset: Asset;
  selectedLocation: string | null;
  onSelect: (a: Asset) => void;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  selectedUnit: string | null;
  isBatchMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  hasLocalPhoto?: boolean;
  onShowQr: (asset: Asset) => void;
}

const NumericKeypad = ({ onInput, onDelete, onClose }: { onInput: (val: string) => void, onDelete: () => void, onClose: () => void }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  
  return (
    <div className="bg-white/95 backdrop-blur-2xl border-t border-border p-1.5 pb-3 grid grid-cols-3 gap-1 animate-slideUp z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[1.25rem]">
      {keys.map((key) => (
        <button
          key={key}
          onClick={(e) => {
            e.stopPropagation();
            if (key === 'OK') onClose();
            else if (key === '⌫') onDelete();
            else onInput(key);
          }}
          className={`h-10 rounded-lg flex items-center justify-center text-base font-bold transition-all active:scale-90 ${
            key === 'OK' ? 'bg-accent text-white shadow-md' : 
            key === '⌫' ? 'bg-bg-main text-ink-muted' : 
            'bg-white border border-border text-ink shadow-sm'
          }`}
        >
          {key === 'OK' ? 'OK' : key}
        </button>
      ))}
    </div>
  );
};

const normalizeKeyFast = (s: string | null | undefined) => {
  if (!s) return '';
  return s.toString().toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, '')
    .trim();
};

const AssetCard = React.memo(({ 
  asset, selectedLocation, onSelect, onMakeDecision, selectedUnit, isBatchMode, isSelected, onToggleSelect, hasLocalPhoto, onShowQr
}: AssetCardProps) => {
  return (
    <AssetListItem 
      asset={asset}
      selectedLocation={selectedLocation}
      onSelect={onSelect}
      onMakeDecision={onMakeDecision}
      selectedUnit={selectedUnit}
      isBatchMode={isBatchMode}
      isSelected={isSelected}
      onToggleSelect={onToggleSelect}
      hasLocalPhoto={hasLocalPhoto}
      onShowQr={onShowQr}
    />
  );
});

AssetCard.displayName = 'AssetCard';

import { getAllLocalPhotoIds } from '../services/photoService';

interface InventoryProps {
  assets: Asset[];
  allAssets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void | Promise<void>;
  onBulkUpdateAssets: (ids: string[], updates?: Partial<Asset>) => void | Promise<void>;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (loc: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (val: boolean) => void;
  selectedUnit: string | null;
  onAddNewLocation: (newLocation: string) => void;
  locationsWithStats: Record<string, { total: number; checked: number; displayName: string }>;
  scannerMode: ScannerMode;
  searchMode: InventorySearchMode;
  onUpdateSearchMode: (mode: InventorySearchMode) => void;
  onUpdateScannerMode: (mode: ScannerMode) => void;
  autoConfirmOnScan: boolean;
  scanFeedbackMode: ScanFeedbackMode;
  onOpenConsultation: () => void;
  onOpenSignature: () => void;
  inventorySearchValue: string | null;
  clearInventorySearchValue: () => void;
  immersiveMode: boolean;
  onToggleFullscreen: () => void;
  batterySaver: boolean;
  databaseMode: DatabaseMode;
  onSyncFromCloud: () => Promise<void>;
  user: User | null;
  currentCampaignId?: string;
  unitConfig?: UnitConfig | null;
}

const Inventory: React.FC<InventoryProps> = ({ 
  assets, 
  allAssets, 
  onBack, 
  onUpdateAsset, 
  onBulkUpdateAssets, 
  onSelectAsset, 
  selectedLocation, 
  setSelectedLocation, 
  isInventorying, 
  setIsInventorying, 
  selectedUnit, 
  onAddNewLocation, 
  scannerMode, 
  searchMode, 
  onUpdateSearchMode, 
  onUpdateScannerMode, 
  autoConfirmOnScan, 
  scanFeedbackMode, 
  onOpenConsultation, 
  onOpenSignature,
  inventorySearchValue, 
  clearInventorySearchValue, 
  immersiveMode, 
  onToggleFullscreen, 
  batterySaver,
  databaseMode,
  user,
  currentCampaignId,
  unitConfig
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localPhotoIds, setLocalPhotoIds] = useState<Set<string>>(new Set());
  const [qrModalAsset, setQrModalAsset] = useState<Asset | null>(null);

  // Telemetria e Hardware
  const [deviceMetrics, setDeviceMetrics] = useState<DeviceMetrics>({ temp: 35, battery: 100 });
  const [torch, setTorch] = useState<'on' | 'off'>('off');
  const [isThermalBlocked, setIsThermalBlocked] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [isScannerPaused, setIsScannerPaused] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);

  // Monitoramento de Telemetria (Native Module Simulation)
  useEffect(() => {
    const interval = setInterval(async () => {
      const metrics = await telemetryService.getDeviceMetrics();
      setDeviceMetrics(metrics);
      
      // Regra Contábil (CPC 27): Bloquear leituras se a temperatura exceder 48°C
      if (metrics.temp > 48) {
        setIsThermalBlocked(true);
      } else if (metrics.temp < 45) {
        setIsThermalBlocked(false);
      }
    }, 5000); // Check every 5s

    return () => clearInterval(interval);
  }, []);

  // Standby Automático (30s de inatividade)
  useEffect(() => {
    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivityTime;
      if (inactiveTime > 30000 && isInventorying && !isScannerPaused) {
        setIsScannerPaused(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastActivityTime, isInventorying, isScannerPaused]);

  // Reset de atividade
  const resetActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    if (isScannerPaused) setIsScannerPaused(false);
  }, [isScannerPaused]);

  // Controle de Lanterna (Auto-off 15s)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (torch === 'on') {
      timer = setTimeout(() => setTorch('off'), 15000);
    }
    return () => clearTimeout(timer);
  }, [torch]);

  useEffect(() => {
    const fetchLocalPhotoIds = async () => {
      const ids = await getAllLocalPhotoIds();
      setLocalPhotoIds(new Set(ids));
    };
    fetchLocalPhotoIds();
    
    // Listener para atualizações de fotos
    const handlePhotoUpdate = () => fetchLocalPhotoIds();
    window.addEventListener('gbr_photo_synced', handlePhotoUpdate);
    return () => window.removeEventListener('gbr_photo_synced', handlePhotoUpdate);
  }, []);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [isListening, setIsListening] = useState<string | null>(null);

  const [manualAsset, setManualAsset] = useState<Partial<Asset>>({});
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [showNumericKeypad, setShowNumericKeypad] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isLocationSearchVisible, setIsLocationSearchVisible] = useState(false);
  const [locationSearchTerm, setLocationSearchTerm] = useState('');
  const [debouncedLocTerm, setDebouncedLocTerm] = useState('');
  const [isLocSearching, setIsLocSearching] = useState(false);
  const [dbLocations, setDbLocations] = useState<{ displayName: string; total: number; checked: number; locKey: string }[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [duplicateAsset, setDuplicateAsset] = useState<Asset | null>(null);
  const [scannedAsset, setScannedAsset] = useState<Asset | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<Asset[]>([]);
  const [showGlobalSearchResolution, setShowGlobalSearchResolution] = useState<string | null>(null);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // v24.50: Restauração de Scroll (UX de Campo)
  useEffect(() => {
    const savedIndex = sessionStorage.getItem(`gbr_scroll_index_${selectedUnit}_${selectedLocation || 'all'}`);
    if (savedIndex && virtuosoRef.current) {
      const index = parseInt(savedIndex, 10);
      if (index > 0) {
        console.log(`>>> [UX] Restaurando posição de scroll para o índice: ${index}`);
        // Pequeno delay para garantir que a renderização do Virtuoso completou
        const timer = setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({ index, align: 'start' });
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedUnit, selectedLocation]);

  // v25.01: Busca de Localidades com Debounce e SQLite
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLocTerm(locationSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [locationSearchTerm]);

  useEffect(() => {
    const performSearch = async () => {
      if (!selectedUnit) return;
      setIsLocSearching(true);
      try {
        const results = await localDb.assets.getLocationsWithStats(selectedUnit, debouncedLocTerm);
        setDbLocations(results || []);
      } catch (err) {
        console.error(">>> [DBA] Erro ao buscar localidades:", err);
      } finally {
        setIsLocSearching(false);
      }
    };

    performSearch();
  }, [debouncedLocTerm, selectedUnit, allAssets.length]);

  const handleRangeChanged = useCallback((range: { startIndex: number }) => {
    if (range.startIndex > 0) {
      sessionStorage.setItem(`gbr_scroll_index_${selectedUnit}_${selectedLocation || 'all'}`, range.startIndex.toString());
    }
  }, [selectedUnit, selectedLocation]);

  // Refs para manter callbacks estáveis e evitar reinício do scanner a cada atualização de estado
  const allAssetsRef = useRef(allAssets);
  const selectedLocationRef = useRef(selectedLocation);
  const selectedUnitRef = useRef(selectedUnit);
  const onUpdateAssetRef = useRef(onUpdateAsset);
  const autoConfirmOnScanRef = useRef(autoConfirmOnScan);
  const scanFeedbackModeRef = useRef(scanFeedbackMode);
  const lastScanTime = useRef<number>(0);
  const lastScanResult = useRef<string>('');
  const isModalOpenRef = useRef(false);

  useEffect(() => { allAssetsRef.current = allAssets; }, [allAssets]);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);
  useEffect(() => { selectedUnitRef.current = selectedUnit; }, [selectedUnit]);
  useEffect(() => { onUpdateAssetRef.current = onUpdateAsset; }, [onUpdateAsset]);
  useEffect(() => { autoConfirmOnScanRef.current = autoConfirmOnScan; }, [autoConfirmOnScan]);
  useEffect(() => { scanFeedbackModeRef.current = scanFeedbackMode; }, [scanFeedbackMode]);
  
  useEffect(() => {
    isModalOpenRef.current = !!(scannedAsset || scannedResult || duplicateAsset || isManualEntryOpen);
  }, [scannedAsset, scannedResult, duplicateAsset, isManualEntryOpen]);

  // Auto-close duplicate asset modal removed per user request to allow manual interaction
  useEffect(() => {
    if (duplicateAsset) {
      // Timer removed to allow user to see the item and decide next action
    }
  }, [duplicateAsset]);

  // Handle returned search value from Consultation
  useEffect(() => {
    if (inventorySearchValue) {
      setDisplayValue(inventorySearchValue);
      setCommittedSearch(inventorySearchValue);
      setIsSearchVisible(true);
      setIsScannerOpen(false);
      onUpdateSearchMode(InventorySearchMode.MANUAL);
      clearInventorySearchValue();
    }
  }, [inventorySearchValue, clearInventorySearchValue, onUpdateSearchMode]);

  const handleScannerClose = useCallback(() => {
    setIsScannerOpen(false);
    onUpdateSearchMode(InventorySearchMode.MANUAL);
    setIsSearchVisible(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [onUpdateSearchMode]);

  const handleTorchToggle = useCallback(() => {
    setTorch(prev => prev === 'on' ? 'off' : 'on');
  }, []);

  const handleUpdateScannerModeLocal = useCallback((m: ScannerMode) => {
    onUpdateScannerMode(m);
  }, [onUpdateScannerMode]);

  const handleScannerOpen = useCallback(() => {
    onUpdateSearchMode(InventorySearchMode.SCANNER);
    setIsSearchVisible(false);
    setIsScannerOpen(true);
  }, [onUpdateSearchMode]);

  const handleScan = useCallback(async (result: string) => {
    // Se estiver em cooldown térmico ou bloqueado, ignora
    if (isCoolingDown || isThermalBlocked || isScannerPaused) return;

    // Se já houver algum modal aberto, ignora novas leituras para evitar sobreposição
    if (isModalOpenRef.current) return;

    // Debounce para evitar múltiplas leituras do mesmo código em sequência rápida (2 segundos)
    const now = Date.now();
    if (result === lastScanResult.current && now - lastScanTime.current < 2000) return;
    
    lastScanTime.current = now;
    lastScanResult.current = result;
    resetActivity();

    // Resfriamento: Pausa de 500ms entre leituras
    setIsCoolingDown(true);
    setTimeout(() => setIsCoolingDown(false), 500);

    const extractedEtiqueta = extractEtiquetaFromQrData(result);
    const term = normalizeKey(extractedEtiqueta);
    setCommittedSearch(extractedEtiqueta);
    setDisplayValue(extractedEtiqueta);

    // Log de Telemetria (Throttle de Log)
    if (user && extractedEtiqueta) {
      telemetryService.logTelemetry(user.id || 'unknown', extractedEtiqueta || null, torch === 'on');
    }
    
    setIsHierarchyLoading(true);
    try {
      // NÍVEL 1 - Busca Local (Automática)
      // Filtra ETIQUETA + UNIDADE_OPERACIONAL atual
      const currentUnit = selectedUnitRef.current || '';
      const foundAsset = await assetRepository.findByEtiquetaInUnit(term, currentUnit);
      
      // Se encontrou localmente, abre o registro diretamente (mantendo lógica de duplicidade)
      if (foundAsset) {
        setIsHierarchyLoading(false);
        if (foundAsset._conferido) {
          setDuplicateAsset(foundAsset);
          return;
        }
        
        if (autoConfirmOnScanRef.current) {
          await onUpdateAssetRef.current({
            ...foundAsset,
            _conferido: true,
            _localMaster: selectedLocationRef.current || foundAsset.ENDERECO
          });
          setCommittedSearch('');
          setDisplayValue('');
        } else {
          const statusUpper = String(foundAsset.STATUS || '').toUpperCase();
          const isGoldenRuleDivergent = !statusUpper.includes('BAIXA') && !!foundAsset.DATABAIXA;
          setScannedAsset({ ...foundAsset, _is_divergent_baixa: isGoldenRuleDivergent });
        }
        return;
      }

      // NÍVEL 2 - Bem não encontrado Localmente (Interação)
      // Se não houver match local, apresenta opções ao auditor
      setIsHierarchyLoading(false);
      setShowGlobalSearchResolution(extractedEtiqueta);
      
    } catch (err) {
      console.error(">>> [Inventory] Erro na busca hierárquica:", err);
      setIsHierarchyLoading(false);
      setScannedResult(result); // Fallback
    }
  }, [normalizeKey]);

  const handlePerformGlobalSearch = async () => {
    if (!showGlobalSearchResolution) return;
    setIsHierarchyLoading(true);
    try {
      const results = await assetRepository.findAllByEtiqueta(showGlobalSearchResolution);
      setGlobalSearchResults(results);
      if (results.length === 0) {
        // Se não achou nada globalmente também, vai para inclusão direta
        handleCreateNewFromHierarchy();
      }
    } catch (err) {
      console.error(">>> [Inventory] Erro na busca global:", err);
    } finally {
      setIsHierarchyLoading(false);
    }
  };

  const handleCreateNewFromHierarchy = () => {
    const etiqueta = showGlobalSearchResolution || '';
    setShowGlobalSearchResolution(null);
    setGlobalSearchResults([]);
    setManualAsset({
      ETIQUETA: etiqueta,
      UNIDADE_OPERACIONAL: selectedUnit || "",
      STATUS: "ATIVO",
      DATAAQUISIC: new Date().toLocaleDateString('pt-BR'),
      AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
      TAG_INVENTARIO: TagInventario.NOVO_ITEM,
      QT: 1,
      DESCRICAODOATIVO: '',
      SERIAL: '',
      ENDERECO: selectedLocation || ""
    });
    setIsManualEntryOpen(true);
  };

  const handleLinkToUnit = async (asset: Asset) => {
    try {
      setIsHierarchyLoading(true);
      const updatedAsset = {
        ...asset,
        UNIDADE_OPERACIONAL: selectedUnit || asset.UNIDADE_OPERACIONAL,
        _unitid: selectedUnit || asset._unitid,
        _conferido: true,
        TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
        _localMaster: selectedLocation || asset.ENDERECO,
        _dataLeitura: new Date().toISOString(),
        _origemTransacao: TransactionOrigin.INVENTORY
      };
      
      await onUpdateAssetRef.current(updatedAsset);
      
      // Limpa estados
      setShowGlobalSearchResolution(null);
      setGlobalSearchResults([]);
      setCommittedSearch('');
      setDisplayValue('');
    } catch (err) {
      console.error(">>> [Inventory] Erro ao vincular ativo:", err);
    } finally {
      setIsHierarchyLoading(false);
    }
  };

  const renderHierarchyResolutionModals = () => {
    if (!showGlobalSearchResolution) return null;

    return createPortal(
      <div className="fixed inset-0 z-[11000] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-fadeIn">
        <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="bg-slate-900 p-8 text-white text-center relative shrink-0">
             <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
               <Database size={32} className="text-white" />
             </div>
             <h3 className="text-xl font-black uppercase italic tracking-tighter leading-none">Bem não localizado</h3>
             <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-2 px-4 italic leading-relaxed">
               A etiqueta <span className="text-amber-400">{showGlobalSearchResolution}</span> não pertence à unidade atual.
             </p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {globalSearchResults.length === 0 ? (
              // NÍVEL 2 - Escolha inicial
              <div className="space-y-3">
                <button 
                  onClick={handlePerformGlobalSearch}
                  disabled={isHierarchyLoading}
                  className="w-full p-6 bg-blue-600 text-white rounded-3xl flex flex-col items-center text-center space-y-2 active:scale-95 transition-all shadow-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {isHierarchyLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Search size={18} />
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest">Pesquisar em outras Unidades</span>
                  <span className="text-[8px] opacity-70 font-bold uppercase">Busca global em todo o banco de dados</span>
                </button>

                <button 
                  onClick={handleCreateNewFromHierarchy}
                  className="w-full p-6 bg-emerald-600 text-white rounded-3xl flex flex-col items-center text-center space-y-2 active:scale-95 transition-all shadow-xl hover:bg-emerald-700"
                >
                  <FilePlus2 size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Item Novo / Não Cadastrado</span>
                  <span className="text-[8px] opacity-70 font-bold uppercase">Incluir novo registro nesta unidade</span>
                </button>

                <div className="pt-4">
                  <button 
                    onClick={() => setShowGlobalSearchResolution(null)}
                    className="w-full py-4 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em] hover:text-slate-600 transition-colors"
                  >
                    Cancelar / Voltar
                  </button>
                </div>
              </div>
            ) : (
              // NÍVEL 3 - Resultados da Busca Global
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Registros Encontrados ({globalSearchResults.length})</p>
                
                <div className="space-y-2">
                  {globalSearchResults.map((asset) => (
                    <div key={String(asset.id)} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest">{asset.UNIDADE_OPERACIONAL || asset._unitid || 'SEM UNIDADE'}</p>
                          <h4 className="text-[11px] font-bold text-slate-800 line-clamp-2 mt-0.5">{asset.DESCRICAODOATIVO}</h4>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 ml-2">#{String(asset.REGISTRO || '').slice(-4)}</span>
                      </div>
                      
                      <div className="flex space-x-2 pt-1">
                        <button 
                          onClick={() => handleLinkToUnit(asset)}
                          className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-md"
                        >
                          Vincular a esta Unidade
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 space-y-2">
                  <button 
                    onClick={handleCreateNewFromHierarchy}
                    className="w-full py-4 bg-emerald-600/10 text-emerald-600 border border-emerald-600/20 rounded-2xl flex items-center justify-center space-x-2 active:scale-95 transition-all font-black uppercase text-[9px] tracking-widest"
                  >
                    <Plus size={14} />
                    <span>Ignorar e Criar Novo</span>
                  </button>
                  <button 
                    onClick={() => { setGlobalSearchResults([]); setShowGlobalSearchResolution(null); }}
                    className="w-full py-3 text-slate-400 font-bold uppercase text-[9px] tracking-widest"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const handleSmartOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOCRProcessing(true);
    try {
      const worker = await createWorker('por+eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      const cleanedText = text.replace(/[\n\r]/g, ' ').trim().toUpperCase();
      
      // Tentar encontrar padrão de plaqueta (6 dígitos)
      const plaquetaMatch = cleanedText.match(/\b\d{6}\b/);
      
      if (plaquetaMatch) {
        const foundTag = plaquetaMatch[0];
        setDisplayValue(foundTag);
        setCommittedSearch(foundTag);
        setIsSearchVisible(true);
        setShowNumericKeypad(false);
      } else {
        // Se não achar plaqueta, tenta qualquer código alfanumérico relevante
        const genericMatch = cleanedText.match(/\b[A-Z0-9]{4,}\b/);
        if (genericMatch) {
          setDisplayValue(genericMatch[0]);
          setCommittedSearch(genericMatch[0]);
          setIsSearchVisible(true);
        }
      }
    } catch (err) {
      console.error('Erro no Smart OCR:', err);
    } finally {
      setIsOCRProcessing(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const handleReverseGeocoding = async () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada.');
      return;
    }

    setIsGeocoding(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const result = await reverseGeocode(latitude, longitude);
          
          setManualAsset(prev => ({
            ...prev,
            ENDERECO: result.address
          }));
        } catch (err) {
          console.error('Erro ao obter endereço:', err);
          alert('Erro ao obter endereço automático.');
        } finally {
          setIsGeocoding(false);
        }
      },
      (err) => {
        console.error('Erro GPS:', err);
        setIsGeocoding(false);
        alert('Erro GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const triggerSmartOCR = () => {
    ocrInputRef.current?.click();
  };

  const handleForceLocation = async () => {
    if (!selectedUnit) return;
    
    // v24.50: Agora sempre abre o mapa interativo para que o auditor defina a âncora
    // Eliminada a tela vermelha de contingência.
    if (onNavigate) {
      onNavigate(AppScreen.UNIT_CONFIGURATOR, { initialUnit: selectedUnit });
    } else {
      console.error('onNavigate não disponível no Inventory.tsx');
      // Fallback para pushScreen global se App.tsx injetar
      if (window.pushScreen) {
        window.pushScreen(AppScreen.UNIT_CONFIGURATOR, { initialUnit: selectedUnit });
      }
    }
  };

  useEffect(() => {
    if (isSearchVisible) {
      setShowNumericKeypad(true);
    } else {
      setShowNumericKeypad(false);
    }
  }, [isSearchVisible]);

  // locationStats removido pois não é mais utilizado na UI de telemetria

  const filteredAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const term = normalizeKeyFast(committedSearch);

    if (!term) {
      const result = [];
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
        const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
        
        if (isBaixado && !isConferido) continue;

        if (activeFilter === 'checked') {
          if (isConferido) result.push(a);
        } else {
          if (!isConferido) result.push(a);
        }
      }

      return result.sort((a, b) => {
        if (activeFilter === 'checked') {
          const dateA = a._dataLeitura ? new Date(a._dataLeitura).getTime() : 0;
          const dateB = b._dataLeitura ? new Date(b._dataLeitura).getTime() : 0;
          if (dateA !== dateB) return dateB - dateA;
        }
        
        const etqA = String(a.ETIQUETA || '').padStart(10, '0');
        const etqB = String(b.ETIQUETA || '').padStart(10, '0');
        return activeFilter === 'checked' 
          ? etqB.localeCompare(etqA, undefined, { numeric: true })
          : etqA.localeCompare(etqB, undefined, { numeric: true });
      });
    }

    const localMatches = [];
    const targetAssets = allAssets && allAssets.length > 0 ? allAssets : assets;
    
    for (let i = 0; i < targetAssets.length; i++) {
        const a = targetAssets[i];
        const etq = normalizeKeyFast(a.ETIQUETA || '');
        if (etq === term || etq.includes(term)) {
            localMatches.push(a);
        }
    }

    return localMatches.sort((a, b) => {
      if (activeFilter === 'checked') {
        const dateA = a._dataLeitura ? new Date(a._dataLeitura).getTime() : 0;
        const dateB = b._dataLeitura ? new Date(b._dataLeitura).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
      }

      const etqA = String(a.ETIQUETA || '').padStart(10, '0');
      const etqB = String(b.ETIQUETA || '').padStart(10, '0');
      return activeFilter === 'checked'
        ? etqB.localeCompare(etqA, undefined, { numeric: true })
        : etqA.localeCompare(etqB, undefined, { numeric: true });
    });
  }, [assets, allAssets, selectedLocation, committedSearch, activeFilter, selectedUnit]);

  const isSearchResultBatch = useMemo(() => {
    if (!committedSearch || filteredAssets.length <= 1) return false;
    const pendingInSearch = filteredAssets.filter(a => !a._conferido);
    if (pendingInSearch.length <= 1) return false;
    
    const firstEtq = normalizeKey(pendingInSearch[0].ETIQUETA || "");
    if (!firstEtq || firstEtq === "ETIQUETAR") return false;
    
    return pendingInSearch.every(a => normalizeKey(a.ETIQUETA || "") === firstEtq);
  }, [committedSearch, filteredAssets, normalizeKey]);

  const handleConfirmSearchBatch = async () => {
    const pendingInSearch = filteredAssets.filter(a => !a._conferido);
    if (pendingInSearch.length === 0) return;
    
    const ids = pendingInSearch.map(a => String(a.id));
    await onBulkUpdateAssets(ids);
    
    setCommittedSearch('');
    setDisplayValue('');
  };

  const handleMakeDecision = useCallback(async (id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;

    const asset = allAssets.find(a => String(a.id) === id);
    if (!asset) return;
    
    const etq = normalizeKey(asset.ETIQUETA || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedUnit || '');
    
    if (isBatch && etq && etq !== "ETIQUETAR") {
      // Restrito à UNIDADE ATUAL e STATUS ATIVO
      const related = allAssets.filter(a => {
        const sameEtq = normalizeKey(a.ETIQUETA || "") === etq;
        const sameComp = normalizeKey(a.UNIDADE_OPERACIONAL || a._unitid || "") === currentCompKey;
        const sUpper = String(a.STATUS || '').toUpperCase();
        const isNotB = !sUpper.includes('BAIXA') && !a.DATABAIXA;
        return sameEtq && sameComp && isNotB && !a._conferido;
      });

      if (related.length > 1) {
        const ids = related.map(a => String(a.id));
        await onBulkUpdateAssets(ids);
        setDisplayValue('');
        return;
      }
    }
    
    await onUpdateAsset({
      ...asset,
      _conferido: true,
      _localMaster: selectedLocation || asset.ENDERECO
    });
    setDisplayValue('');
  }, [allAssets, onUpdateAsset, onBulkUpdateAssets, normalizeKey, selectedUnit, selectedLocation]);

  const handleAssetClick = useCallback(async (asset: Asset) => {
    setShowNumericKeypad(false);
    const etq = normalizeKey(asset.ETIQUETA || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedUnit || '');
    const assetCompKey = normalizeKey(asset.UNIDADE_OPERACIONAL || asset._unitid || '');
    
    // BLOQUEIO DE SEGURANÇA: Se já foi conferido, mostra modal de duplicidade e impede abertura
    if (asset._conferido) {
      setDuplicateAsset(asset);
      return;
    }

    // Regra C: Se for de outra empresa, adotar automaticamente (fluidez sênior)
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      await onUpdateAsset({ 
        ...asset, 
        UNIDADE_OPERACIONAL: selectedUnit || asset.UNIDADE_OPERACIONAL || asset._unitid,
        _conferido: true,
        TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
        _localMaster: selectedLocation || asset.ENDERECO
      });
      return;
    }

    if (isBatch && etq && etq !== "ETIQUETAR" && !asset._conferido) {
      const related = allAssets.filter(a => {
        const sameEtq = normalizeKey(a.ETIQUETA || "") === etq;
        const sameComp = normalizeKey(a.UNIDADE_OPERACIONAL || a._unitid || "") === currentCompKey;
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isNotBaixado = !statusUpper.includes('BAIXA') && !a.DATABAIXA;
        return sameEtq && sameComp && isNotBaixado && !a._conferido;
      });

      if (related.length > 1) {
        const ids = related.map(a => String(a.id));
        await onBulkUpdateAssets(ids);
        return;
      }
    }
    onSelectAsset(asset);
  }, [allAssets, onSelectAsset, onUpdateAsset, onBulkUpdateAssets, normalizeKey, selectedUnit, selectedLocation]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const handleBatchConfirm = async () => {
    if (selectedIds.size === 0) return;
    
    // Filtra apenas os que ainda não foram conferidos para preservar integridade De/Para
    const ids = Array.from(selectedIds).filter(id => {
      const asset = allAssets.find(a => String(a.id) === id);
      return asset && !asset._conferido;
    });

    if (ids.length > 0) {
      await onBulkUpdateAssets(ids);
    }
    
    setSelectedIds(new Set());
    setIsBatchMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = filteredAssets.map(a => String(a.id));
      setSelectedIds(new Set(allIds));
    }
  };

  const handleCreateNew = () => {
    setManualAsset({
        ETIQUETA: committedSearch || "",
        UNIDADE_OPERACIONAL: selectedUnit || "",
        STATUS: "ATIVO",
        DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
        AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
        QT: 1,
        DESCRICAODOATIVO: '',
        SERIAL: ''
    });
    setIsManualEntryOpen(true);
  };

  const handleVoiceTyping = (field: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta reconhecimento de voz.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(field);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setManualAsset(prev => ({
        ...prev,
        [field]: (prev[field as keyof Asset] || '') + transcript.toUpperCase()
      }));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Erro no reconhecimento de voz:', event.error);
      setIsListening(null);
    };

    recognition.onend = () => {
      setIsListening(null);
    };

    recognition.start();
  };

  const saveManualEntry = () => {
    const newAsset: Asset = {
        ...manualAsset,
        id: generateUUID(),
        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
        _conferido: true,
        _isNew: true,
        currentCampaignId: currentCampaignId,
        _localMaster: selectedLocation || "",
        _tenantid: user?.tenantid || '',
        _unitid: selectedUnit || user?.unitid || ''
    } as Asset;
    
    onUpdateAsset(newAsset);
    setIsManualEntryOpen(false);
    setCommittedSearch('');
    setDisplayValue('');
    onSelectAsset(newAsset);
  };

 

  useEffect(() => {
    const checkCameraPermission = async () => {
      if (isInventorying && searchMode === InventorySearchMode.SCANNER) {
        try {
          // Just-in-Time: Solicita permissão apenas no momento do uso
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          // Se chegou aqui, a permissão foi concedida. Paramos o stream imediatamente.
          stream.getTracks().forEach(track => track.stop());
          setIsScannerOpen(true);
        } catch (err) {
          console.error('Erro ao acessar a câmera:', err);
          // Opcional: Mostrar um alerta amigável se a permissão for negada
        }
      }
    };

    checkCameraPermission();
  }, [isInventorying, searchMode]); // Só dispara quando entra no inventário de um local ou muda para scanner

  useEffect(() => {
    const searchTimeout = setTimeout(() => {
      setCommittedSearch(displayValue);
    }, 500);

    return () => clearTimeout(searchTimeout);
  }, [displayValue]);

  useEffect(() => {
    if (filteredAssets.length === 1 && committedSearch && !filteredAssets[0]._conferido) {
      searchInputRef.current?.blur();
    }
  }, [filteredAssets, committedSearch]);

  // Helper para renderizar os modais de confirmação/erro de leitura
  const renderConfirmationModals = () => {
    return (
      <React.Fragment>
        {/* Modal de Item Duplicado */}
        {duplicateAsset && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
            <div className="bg-white w-full max-w-sm rounded-[3rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
              <button 
                onClick={() => setDuplicateAsset(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
              >
                <X size={20} />
              </button>
              {(() => {
                const isSameLocation = normalizeKey(duplicateAsset._localMaster || "") === normalizeKey(selectedLocation || "");
                return (
                  <React.Fragment>
                    <div className={`${isSameLocation ? 'bg-success' : 'bg-warning'} p-8 text-white text-center transition-colors`}>
                      <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                        {isSameLocation ? <Check size={40} className="text-white" /> : <AlertTriangle size={40} className="text-white" />}
                      </div>
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                        {isSameLocation ? 'Item já Conferido' : 'Conflito de Localização'}
                      </h3>
                      <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">
                        {isSameLocation ? 'Registro Confirmado neste Local' : 'Bloqueio: Item em outro endereço'}
                      </p>
                    </div>
                    
                    <div className="p-8 space-y-4">
                      <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10">
                        <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Patrimônio</p>
                        <p className="text-xl font-black text-ink font-mono">{duplicateAsset.ETIQUETA}</p>
                        <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{duplicateAsset.DESCRICAODOATIVO}</p>
                        <div className="mt-3 pt-3 border-t border-accent/10 flex items-center justify-between">
                          <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Local do Registro:</span>
                          <span className={`text-[9px] font-black uppercase ${isSameLocation ? 'text-success' : 'text-warning'}`}>
                            {duplicateAsset._localMaster || duplicateAsset.ENDERECO}
                          </span>
                        </div>
                      </div>

                      <div className={`${isSameLocation ? 'bg-success/5 border-success/20' : 'bg-warning/5 border-warning/20'} p-4 rounded-2xl border`}>
                        <p className={`text-[10px] font-bold uppercase tracking-tight leading-relaxed text-center ${isSameLocation ? 'text-success' : 'text-warning'}`}>
                          {isSameLocation 
                            ? "Este item já foi processado e conferido neste mesmo endereço. O registro está seguro e não precisa de nova ação."
                            : "Este item já foi registrado em OUTRO endereço durante este inventário. Para preservar a integridade do relatório De/Para, o primeiro registro foi mantido."
                          }
                        </p>
                      </div>

                      <div className="pt-2">
                        <button 
                          onClick={() => setDuplicateAsset(null)} 
                          className={`w-full py-4 ${isSameLocation ? 'bg-success' : 'bg-accent'} text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all`}
                        >
                          Entendido
                        </button>
                      </div>
                    </div>
                    
                    {/* Barra de progresso para auto-fechamento removida */}
                  </React.Fragment>
                );
              })()}
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Confirmação de Item Lido */}
        {scannedAsset && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
              <div className={`${scannedAsset._is_divergent_baixa ? 'bg-red-600' : 'bg-accent'} p-8 text-white text-center transition-colors`}>
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30 overflow-hidden p-2">
                  {scannedAsset._is_divergent_baixa ? (
                    <AlertTriangle className="text-red-600" size={40} />
                  ) : (
                    <Check className="text-accent" size={40} />
                  )}
                </div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                  {scannedAsset._is_divergent_baixa ? 'Divergência Crítica' : 'Confirmar Inventário'}
                </h3>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">
                  {scannedAsset._is_divergent_baixa ? 'Item ATIVO com DATA DE BAIXA na base' : 'Verifique os dados antes de registrar'}
                </p>
              </div>
              
        <div className="p-8 space-y-4">
                {/* Info de Local de Origem se for diferente */}
                {(normalizeKey(scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid || '') !== normalizeKey(selectedUnit || '') || 
                  normalizeKey(scannedAsset._localMaster || scannedAsset.ENDERECO || '') !== normalizeKey(selectedLocation || '')) && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center space-x-2 text-amber-700">
                      <MapPin size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Local de Origem (Base)</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-700 uppercase">
                        {scannedAsset.UNIDADE_OPERACIONAL || 'Unidade não informada'}
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium uppercase italic">
                        {scannedAsset.ENDERECO || 'Endereço não informado'}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-amber-200">
                      <div className="flex items-center space-x-2 text-emerald-700">
                        <CheckCircle2 size={14} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Novo Local (Inventariado)</span>
                      </div>
                      <p className="text-[10px] font-bold text-emerald-800 uppercase mt-1">
                        {selectedUnit} / {selectedLocation}
                      </p>
                    </div>
                  </div>
                )}

                <div className={`${scannedAsset._is_divergent_baixa ? 'bg-red-50 border-red-100' : 'bg-accent-soft border-accent/10'} p-4 rounded-2xl border transition-colors`}>
                  <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Patrimônio</p>
                  <p className={`text-xl font-black font-mono ${scannedAsset._is_divergent_baixa ? 'text-red-700' : 'text-ink'}`}>{scannedAsset.ETIQUETA}</p>
                  <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{scannedAsset.DESCRICAODOATIVO}</p>
                </div>

                {scannedAsset._is_divergent_baixa && (
                  <div className="p-3 bg-red-600 text-white rounded-xl flex items-center space-x-3 animate-pulse">
                    <AlertTriangle size={20} />
                    <p className="text-[9px] font-black uppercase tracking-tight leading-tight">
                      Atenção: Este item consta como ATIVO mas possui DATA DE BAIXA ({scannedAsset.DATABAIXA}). Proceda com cautela.
                    </p>
                  </div>
                )}

                <div className="flex space-x-3 pt-2">
                  <button 
                    onClick={() => setScannedAsset(null)} 
                    className="flex-1 py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      const assetCompKey = normalizeKey(scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid || '');
                      const currentCompKey = normalizeKey(selectedUnit || '');
                      const assetLocKey = normalizeKey(scannedAsset._localMaster || scannedAsset.ENDERECO || '');
                      const currentLocKey = normalizeKey(selectedLocation || '');
                      
                      let updatedAsset: Asset;

                      if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
                        updatedAsset = { 
                          ...scannedAsset, 
                          UNIDADE_OPERACIONAL: selectedUnit || scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid,
                          _conferido: true,
                          TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        };
                      } else if (assetLocKey !== "" && assetLocKey !== currentLocKey) {
                        updatedAsset = {
                          ...scannedAsset,
                          _conferido: true,
                          TAG_INVENTARIO: TagInventario.ADOTADO,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        };
                      } else {
                        updatedAsset = {
                          ...scannedAsset,
                          _conferido: true,
                          TAG_INVENTARIO: TagInventario.CONFERIDO,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        };
                      }

                      onUpdateAsset(updatedAsset);
                      setScannedAsset(null);
                      onSelectAsset(updatedAsset); // Abre detalhes para foto
                    }} 
                    className="flex-1 py-4 bg-emerald-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <Camera size={14} className="mb-1" />
                    <span>Confirmar + Foto</span>
                  </button>
                  <button 
                    onClick={() => {
                      const assetCompKey = normalizeKey(scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid || '');
                      const currentCompKey = normalizeKey(selectedUnit || '');
                      const assetLocKey = normalizeKey(scannedAsset._localMaster || scannedAsset.ENDERECO || '');
                      const currentLocKey = normalizeKey(selectedLocation || '');
                      
                      if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
                        // Caso seja de outra empresa, adota como externo
                        onUpdateAsset({ 
                          ...scannedAsset, 
                          UNIDADE_OPERACIONAL: selectedUnit || scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid,
                          _conferido: true,
                          TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        });
                      } else if (assetLocKey !== "" && assetLocKey !== currentLocKey) {
                        // Caso seja da mesma empresa mas outro endereço, adota como sobra física
                        onUpdateAsset({
                          ...scannedAsset,
                          _conferido: true,
                          TAG_INVENTARIO: TagInventario.ADOTADO,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        });
                      } else {
                        // Caso seja do mesmo endereço
                        onUpdateAsset({
                          ...scannedAsset,
                          _conferido: true,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        });
                      }
                      setScannedAsset(null);
                    }} 
                    className="flex-1 py-4 bg-accent text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <Check size={14} className="mb-1" />
                    <span>Confirmar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Item Não Localizado */}
        {scannedResult && !scannedAsset && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
              <div className="bg-warning p-8 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                  <AlertTriangle size={40} className="text-white" />
                </div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Não Localizado</h3>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Patrimônio não encontrado na base</p>
              </div>
              
              <div className="p-8 space-y-4">
                <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10 text-center">
                  <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Código Lido</p>
                  <p className="text-xl font-black text-ink font-mono">{scannedResult}</p>
                </div>

                <div className="flex flex-col space-y-3 pt-2">
                  <button 
                    onClick={() => {
                      setManualAsset({
                        ETIQUETA: scannedResult,
                        UNIDADE_OPERACIONAL: selectedUnit || "",
                        STATUS: "ATIVO",
                        DATAAQUISIC: new Date().toLocaleDateString('pt-BR'),
                        AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
                        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
                        QT: 1,
                        DESCRICAODOATIVO: '',
                        SERIAL: ''
                      });
                      setIsManualEntryOpen(true);
                      setScannedResult(null);
                    }} 
                    className="w-full py-4 bg-accent text-white rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-accent/20"
                  >
                    <FilePlus2 size={16} />
                    <span>Incluir Manual</span>
                  </button>
                  <button 
                    onClick={() => setScannedResult(null)} 
                    className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      {!isInventorying ? (
        <div className="flex flex-col h-full bg-[#F8FAFC] relative">
          {/* Header Minimalista */}
          <div className="px-6 pt-12 pb-6 bg-white border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <button 
                onClick={onBack}
                className="flex items-center space-x-2 text-[#1E293B] active:opacity-60 transition-all"
              >
                <ArrowLeft size={20} />
                <span className="text-lg font-bold tracking-tight">Mapeamento</span>
              </button>
              <button 
                onClick={() => setIsLocationSearchVisible(!isLocationSearchVisible)}
                className={`p-2 rounded-xl transition-all active:scale-95 ${isLocationSearchVisible ? 'bg-accent text-white' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Search size={20} />
              </button>
            </div>
            
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-[0.15em]">Selecione uma localidade para auditoria</p>

            {isLocationSearchVisible && (
              <div className="mt-4 relative animate-fadeIn">
                <input 
                  type="text"
                  value={locationSearchTerm}
                  onChange={(e) => setLocationSearchTerm(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-100 px-4 py-3 font-bold text-sm rounded-xl text-ink outline-none focus:border-accent transition-all"
                  placeholder="PESQUISAR LOCAL..."
                  autoFocus
                />
                {locationSearchTerm && (
                  <button 
                    onClick={() => setLocationSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-32 no-scrollbar">
            {/* Banner Offline Sutil */}
            {databaseMode === 'INTERNAL' && (
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl flex items-center space-x-3 mb-2">
                <WifiOff size={14} className="text-amber-600" />
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Modo Offline Ativo</p>
              </div>
            )}

            {!unitConfig && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start space-x-3 mb-2">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-red-700 uppercase tracking-widest">GPS Âncora Pendente</p>
                    {isGeocoding && <Loader2 size={12} className="animate-spin text-red-600" />}
                  </div>
                  <p className="text-[9px] text-red-600 font-bold uppercase leading-tight mt-1">
                    Configuração de GPS obrigatória para liberar o inventário.
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleForceLocation();
                      }}
                      disabled={isGeocoding}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center space-x-2 shadow-lg shadow-red-500/20 disabled:opacity-50"
                    >
                      <Target size={12} />
                      <span>Reconfigurar Âncora (MAPA)</span>
                    </button>

                  </div>
                </div>
              </div>
            )}

            {isLocSearching && (
              <div className="flex items-center justify-center py-4 space-x-2 animate-pulse">
                <Loader2 size={14} className="animate-spin text-accent" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtrando Banco de Dados...</span>
              </div>
            )}

            {dbLocations.length > 0 ? (
              dbLocations
              .map((loc: { displayName: string; total: number; checked: number; locKey: string }) => {
                const progress = loc.total > 0 ? Math.round((loc.checked / loc.total) * 100) : 0;
                const isCompleted = progress === 100;
                const locStr = String(loc.displayName || '');
                
                // Extrair código e nome (assumindo formato "CODIGO NOME")
                const parts = locStr.split(' ');
                const code = parts[0];
                const name = parts.slice(1).join(' ') || locStr;
              
                return (
                  <button 
                    key={loc.locKey} 
                    disabled={!unitConfig}
                    onClick={() => { 
                      setSelectedLocation(loc.displayName); 
                      setIsInventorying(true); 
                      if (immersiveMode && !document.fullscreenElement) {
                        onToggleFullscreen();
                      }
                    }} 
                    className="w-full bg-white rounded-[16px] p-4 active:scale-[0.98] transition-all flex flex-col shadow-[0_2px_15px_rgba(0,0,0,0.05)] border-none relative overflow-hidden group"
                  >
                    <div className="flex items-start space-x-4 mb-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${isCompleted ? 'bg-[#10B981]/15 text-[#10B981]' : 'bg-[#2563EB]/15 text-[#2563EB]'}`}>
                        <MapPin size={22} strokeWidth={2.5} />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest block mb-1">{code}</span>
                        <h4 className="text-sm font-bold text-[#1E293B] leading-tight line-clamp-2">
                          {name}
                        </h4>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 mt-1" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className={`text-[10px] font-bold uppercase tracking-tight ${isCompleted ? 'text-[#10B981]' : 'text-[#64748B]'}`}>
                          {loc.checked} / {loc.total} ITENS
                        </span>
                        <span className={`text-[10px] font-black ${isCompleted ? 'text-[#10B981]' : 'text-[#2563EB]'}`}>
                          {progress}%
                        </span>
                      </div>
                      <div className="h-[6px] w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-700 ease-out rounded-full ${isCompleted ? 'bg-[#10B981]' : 'bg-[#2563EB]'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
                !isLocSearching && (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                      <Search size={24} className="text-slate-300" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-loose">
                      Nenhuma localidade localizada<br/>
                      <span className="text-[10px] opacity-60">Tente buscar por outro termo ou descrição</span>
                    </p>
                  </div>
                )
            )}
          </div>

          {/* FAB - Criar Nova Localidade */}
          <div className="fixed bottom-8 left-0 right-0 px-6 flex justify-center pointer-events-none">
            <button 
              disabled={!unitConfig}
              onClick={() => setIsNewLocationModalOpen(true)} 
              className={`pointer-events-auto h-14 px-8 rounded-full flex items-center justify-center space-x-3 font-bold uppercase text-xs tracking-widest active:scale-95 transition-all shadow-xl shadow-blue-500/20 ${!unitConfig ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#2563EB] text-white'}`}
            >
              <Plus size={20} strokeWidth={3} />
              <span>Nova Localidade</span>
            </button>
          </div>
        </div>
      ) : (
        <React.Fragment>
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Fixo Blindado */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shrink-0">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onBack}
            className="flex items-center space-x-3 group"
          >
            <div className="p-3 bg-slate-50 text-slate-800 rounded-2xl group-active:scale-90 transition-all border border-slate-100 shadow-sm">
              <ArrowLeft size={20} strokeWidth={3} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Voltar</p>
              <p className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">Inventário</p>
            </div>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* ... botões secundários omitidos para brevidade se necessário, mas vou manter para consistência ... */}
          {isBatchMode && (
            <button 
              onClick={toggleSelectAll} 
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? 'bg-accent text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
            </button>
          )}

          <button 
            onClick={onOpenConsultation}
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <Database size={20} />
          </button>

          <button 
            onClick={handleScannerOpen} 
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${searchMode === InventorySearchMode.SCANNER ? 'bg-accent text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <Camera size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="bg-white px-6 py-4 shadow-sm border-b border-slate-50 shrink-0">
          <div className="space-y-4">
            {/* Sensors Row */}
            <div className="flex items-center justify-between bg-slate-50/50 p-2 rounded-2xl border border-slate-100">
              <div className="flex items-center space-x-2 px-2 flex-1 min-w-0">
                <MapPin size={14} className="text-accent shrink-0" />
                <span className="text-[10px] font-bold text-[#1E293B] truncate uppercase tracking-tight">
                  {selectedLocation || 'SELECIONE O LOCAL'}
                </span>
              </div>
              
              <div className="flex items-center space-x-3 pr-2">
                <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl transition-all ${deviceMetrics.temp > 42 ? 'bg-red-500 text-white shadow-lg' : 'bg-blue-500/10 border border-blue-100 text-blue-600'}`}>
                  <Activity size={12} />
                  <span className="text-[9px] font-black tracking-widest">{deviceMetrics.temp.toFixed(0)}°C</span>
                </div>
                <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl transition-all ${deviceMetrics.battery < 20 ? 'bg-red-500 text-white shadow-lg' : 'bg-emerald-500/10 border border-emerald-100 text-emerald-600'}`}>
                  <Zap size={12} />
                  <span className="text-[9px] font-black tracking-widest">{deviceMetrics.battery}%</span>
                </div>
              </div>
            </div>

            {/* Segmented Control */}
            <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-100">
              <button 
                onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); setDisplayValue(''); }} 
                className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeFilter === 'pending' ? 'bg-white text-accent shadow-sm' : 'text-[#64748B]'}`}
              >
                Ativos
              </button>
              <button 
                onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); setDisplayValue(''); }} 
                className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeFilter === 'checked' ? 'bg-white text-accent shadow-sm' : 'text-[#64748B]'}`}
              >
                Conferidos
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search size={16} className="text-[#94A3B8]" />
              </div>
              <input 
                ref={searchInputRef} 
                type="text" 
                readOnly
                inputMode="none"
                onClick={() => setShowNumericKeypad(true)}
                value={displayValue} 
                className="w-full bg-[#F8FAFC] border border-[#F1F5F9] pl-11 pr-24 py-3.5 font-mono text-lg font-bold rounded-2xl text-[#1E293B] outline-none focus:border-accent transition-all cursor-pointer" 
                placeholder="ESCANEIE OU DIGITE..." 
              />
              <div className="absolute inset-y-0 right-2 flex items-center space-x-1">
                <button 
                  onClick={triggerSmartOCR}
                  className="p-2 text-[#64748B] hover:bg-white rounded-xl transition-all"
                  title="Busca por Foto (OCR)"
                >
                  <Camera size={20} />
                </button>
                {displayValue && (
                  <button 
                    onClick={() => { setDisplayValue(''); setCommittedSearch(''); }} 
                    className="p-2 text-[#64748B] hover:bg-white rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-bg-main relative min-h-0">
          {filteredAssets.length > 0 ? (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              data={filteredAssets}
              increaseViewportBy={300}
              atTopStateChange={(atTop) => setShowScrollTop(!atTop)}
              components={{
                Footer: () => <div className="h-40" />
              }}
              itemContent={(index, asset) => (
                <div className="px-4 pt-1.5">
                  <AssetCard 
                    asset={asset} 
                    selectedLocation={selectedLocation} 
                    onSelect={() => handleAssetClick(asset)} 
                    onMakeDecision={handleMakeDecision} 
                    selectedUnit={selectedUnit} 
                    isBatchMode={isBatchMode} 
                    isSelected={selectedIds.has(String(asset.id))} 
                    onToggleSelect={toggleSelect} 
                    hasLocalPhoto={localPhotoIds.has(String(asset.id))}
                    onShowQr={(a) => setQrModalAsset(a)}
                  />
                </div>
              )}
            />
          ) : (
            <div className="py-24 flex flex-col items-center justify-center opacity-30 text-center">
              <Search size={64} className="mb-6 text-ink-muted" />
              <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-ink-muted">Aguardando Auditoria</p>
            </div>
          )}
        </div>
      </div>

      <footer className="bg-slate-900 px-6 py-4 text-center border-t border-white/5 shrink-0">
        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">GBR KARDEK • MOBILE SOBERANO</p>
      </footer>
      </div>
        </React.Fragment>
      )}

      {/* Modal de Inclusão Manual removido daqui pois estava duplicado */}

      {/* Scanner Full-Screen */}
      {isScannerOpen && searchMode !== 'SCANNER' && (
        <Scanner 
          mode={scannerMode}
          onModeChange={onUpdateScannerMode}
          onScan={handleScan}
          onClose={() => {
            setIsScannerOpen(false);
            onUpdateSearchMode(InventorySearchMode.MANUAL);
            setIsSearchVisible(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
          }}
          isPaused={isScannerPaused || isThermalBlocked || isCoolingDown || !!(scannedAsset || scannedResult || duplicateAsset || showGlobalSearchResolution)}
          scanFeedbackMode={scanFeedbackMode}
          batterySaver={batterySaver}
          torch={torch}
          onTorchToggle={() => setTorch(torch === 'on' ? 'off' : 'on')}
          onManualInput={() => {
            setIsScannerOpen(false);
            setManualAsset({
              ETIQUETA: "",
              UNIDADE_OPERACIONAL: selectedUnit || "",
              STATUS: "ATIVO",
              DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
              AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
              TAG_INVENTARIO: TagInventario.NOVO_ITEM,
              QT: 1,
              DESCRICAODOATIVO: '',
              SERIAL: '',
              ENDERECO: selectedLocation || ""
            });
            setIsManualEntryOpen(true);
          }}
        >
          {isThermalBlocked && (
            <div className="bg-red-600 p-6 rounded-[2rem] text-white text-center animate-pulse border-4 border-white/20 shadow-2xl">
              <ShieldAlert size={48} className="mx-auto mb-4" />
              <h3 className="text-xl font-black uppercase tracking-tighter">Resfriamento Necessário</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-80">
                Temperatura Crítica ({deviceMetrics.temp.toFixed(1)}°C).<br/>
                Aguarde 60 segundos para dissipação de calor.
              </p>
            </div>
          )}
          {isScannerPaused && !isThermalBlocked && (
            <div className="bg-slate-900/90 backdrop-blur-xl p-8 rounded-[2.5rem] text-white text-center border border-white/10 shadow-2xl">
              <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
                <Zap size={32} className="text-amber-500" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tighter">Standby Térmico</h3>
              <p className="text-[9px] font-bold uppercase tracking-widest mt-2 text-slate-400">
                Scanner pausado por inatividade.<br/>
                Toque para retomar a auditoria.
              </p>
              <button 
                onClick={resetActivity}
                className="mt-6 px-8 py-3 bg-white text-black rounded-xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all"
              >
                Retomar
              </button>
            </div>
          )}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center space-x-2 z-50">
            <div className="px-4 py-2 bg-success/80 backdrop-blur-md rounded-full flex items-center space-x-3 shadow-2xl border border-white/20">
              <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
              <span className="text-xs font-black text-white uppercase tracking-[0.2em]">Scanner Ativo</span>
            </div>
          </div>
        </Scanner>
      )}

      {/* Modais de Confirmação e Erro de Leitura */}
      {renderConfirmationModals()}

      {renderHierarchyResolutionModals()}

      {isOCRProcessing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-2xl animate-pulse">
            <Loader2 size={40} className="text-accent animate-spin" />
          </div>
          <h3 className="text-xl font-bold text-white uppercase tracking-tight mb-2">Analisando Imagem</h3>
          <p className="text-sm text-white/70 max-w-xs uppercase font-bold tracking-widest">
            Identificando etiquetas e códigos...
          </p>
        </div>
      )}

      {/* Outros Modais do Sistema */}
      {isNewLocationModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <div className="bg-accent p-8 text-white text-center">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                <MapPin size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Nova Localidade</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Mapeamento de Endereço</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-ink-muted uppercase tracking-widest ml-1">Nome do Local</label>
                <input 
                  type="text" 
                  value={newLocationName} 
                  onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
                  className="w-full bg-bg-main border border-border p-4 rounded-2xl text-sm font-bold text-ink outline-none focus:border-accent transition-all"
                  placeholder="EX: SALA 101, ALMOXARIFADO..."
                  autoFocus
                />
              </div>

              <div className="flex flex-col space-y-3">
                <button 
                  onClick={() => {
                    onAddNewLocation(newLocationName);
                    setNewLocationName('');
                    setIsNewLocationModalOpen(false);
                  }}
                  disabled={!newLocationName.trim()}
                  className="w-full py-4 bg-accent disabled:bg-ink-muted/20 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                >
                  Confirmar Criação
                </button>
                <button 
                  onClick={() => { setIsNewLocationModalOpen(false); setNewLocationName(''); }} 
                  className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {qrModalAsset && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <button 
              onClick={() => setQrModalAsset(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="bg-slate-100 p-8 text-center border-b border-slate-200">
               <div className="bg-white p-6 rounded-3xl shadow-xl inline-block mb-4 border border-slate-200">
                 <QRCodeSVG value={String(qrModalAsset.ETIQUETA || qrModalAsset.id || '')} size={180} />
               </div>
               <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter leading-none mb-1">{qrModalAsset.ETIQUETA}</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{qrModalAsset.DESCRICAODOATIVO}</p>
            </div>
            <div className="p-6 bg-white">
               <button 
                 onClick={() => setQrModalAsset(null)}
                 className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg"
               >
                 Fechar
               </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {scannedAsset && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <button 
              onClick={() => setScannedAsset(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="bg-accent p-8 text-white text-center">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30 overflow-hidden p-2">
                <Check className="text-accent" size={40} />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Confirmar Inventário</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Verifique os dados antes de registrar</p>
            </div>
            
            <div className="p-8 space-y-4">
              <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10 space-y-3">
                <div>
                  <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Patrimônio</p>
                  <p className="text-xl font-black text-ink font-mono">{scannedAsset.ETIQUETA}</p>
                  <p className="text-[10px] font-bold text-ink-muted mt-1 uppercase leading-tight line-clamp-2">{scannedAsset.DESCRICAODOATIVO}</p>
                </div>

                <div className="pt-3 border-t border-accent/10 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="text-[7px] font-black text-ink-muted uppercase tracking-widest">Local de Origem</span>
                      <span className="text-[9px] font-black text-amber-600 uppercase">
                        {scannedAsset._localMaster || scannedAsset.ENDERECO || 'NÃO DEFINIDO'}
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 mt-2" />
                    <div className="flex flex-col items-end">
                      <span className="text-[7px] font-black text-ink-muted uppercase tracking-widest">Local Inventariado</span>
                      <span className="text-[9px] font-black text-emerald-600 uppercase">
                        {selectedLocation}
                      </span>
                    </div>
                  </div>

                  {normalizeKey(scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid || '') !== normalizeKey(selectedUnit || '') && (
                    <div className="p-2 bg-amber-50 rounded-lg border border-amber-100 flex items-center space-x-2">
                      <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                      <span className="text-[8px] font-bold text-amber-700 uppercase leading-none">
                        Divergência de Empresa detectada. O Ativo será adotado por esta unidade.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button 
                  onClick={() => setScannedAsset(null)} 
                  className="flex-1 py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    const assetCompKey = normalizeKey(scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid || '');
                    const currentCompKey = normalizeKey(selectedUnit || '');
                    
                    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
                      onUpdateAsset({ 
                        ...scannedAsset, 
                        UNIDADE_OPERACIONAL: selectedUnit || scannedAsset.UNIDADE_OPERACIONAL || scannedAsset._unitid,
                        _conferido: true,
                        TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
                        _localMaster: selectedLocation || scannedAsset.ENDERECO
                      });
                    } else {
                      onUpdateAsset({
                        ...scannedAsset,
                        _conferido: true,
                        _localMaster: selectedLocation || scannedAsset.ENDERECO
                      });
                    }
                    setScannedAsset(null);
                  }} 
                  className="flex-1 py-4 bg-accent text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {scannedResult && !scannedAsset && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <button 
              onClick={() => setScannedResult(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="bg-warning p-8 text-white text-center">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                <AlertTriangle size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Não Localizado</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Patrimônio não encontrado na base</p>
            </div>
            
            <div className="p-8 space-y-4">
              <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10 text-center">
                <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Código Lido</p>
                <p className="text-xl font-black text-ink font-mono">{scannedResult}</p>
              </div>

              <div className="flex flex-col space-y-3 pt-2">
                <button 
                  onClick={() => {
                    setManualAsset({
                      ETIQUETA: scannedResult,
                      UNIDADE_OPERACIONAL: selectedUnit || "",
                      STATUS: "ATIVO",
                      DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
                      AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
                      TAG_INVENTARIO: TagInventario.NOVO_ITEM,
                      QT: 1,
                      DESCRICAODOATIVO: '',
                      SERIAL: ''
                    });
                    setIsManualEntryOpen(true);
                    setScannedResult(null);
                  }} 
                  className="w-full py-4 bg-accent text-white rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-accent/20"
                >
                  <FilePlus2 size={16} />
                  <span>Incluir Manual</span>
                </button>
                <button 
                  onClick={() => setScannedResult(null)} 
                  className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* REMOVIDO BARRA INFERIOR PARA EVITAR SCROLL */}

      {isManualEntryOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn overflow-y-auto pt-10 sm:pt-20">
          <div className="absolute inset-0" onClick={() => setIsManualEntryOpen(false)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative z-10 animate-scaleIn flex flex-col mb-20">
            <div className="bg-accent px-8 py-6 text-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2 bg-white/20 px-4 py-2 rounded-full border border-white/10">
                  <FilePlus2 size={14} className="fill-white" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Inclusão Manual</span>
                </div>
                <button onClick={() => setIsManualEntryOpen(false)} className="p-2 bg-white/10 rounded-xl active:scale-90"><X size={20} /></button>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic leading-none">Novo Registro</h3>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-1">Preencha os dados do ativo encontrado</p>
            </div>

            <div className="flex-1 p-8 space-y-6 pb-[40vh]">
               <div className="space-y-4">
                  <div>
                    <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Etiqueta / Patrimônio</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={manualAsset.ETIQUETA || ''} 
                        onChange={(e) => setManualAsset({...manualAsset, ETIQUETA: e.target.value.toUpperCase()})}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 pr-12 text-ink font-black font-mono text-lg outline-none focus:border-accent"
                      />
                      <button 
                        onClick={() => handleVoiceTyping('ETIQUETA')}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${isListening === 'ETIQUETA' ? 'bg-danger text-white animate-pulse' : 'bg-white text-accent shadow-sm'}`}
                      >
                        <Mic size={18} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Descrição do Ativo</label>
                    <div className="relative">
                      <textarea 
                        rows={3}
                        value={manualAsset.DESCRICAODOATIVO || ''} 
                        onChange={(e) => setManualAsset({...manualAsset, DESCRICAODOATIVO: e.target.value.toUpperCase()})}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 pr-12 text-ink font-bold text-xs outline-none focus:border-accent uppercase"
                        placeholder="DESCREVA O BEM..."
                      />
                      <button 
                        onClick={() => handleVoiceTyping('DESCRICAODOATIVO')}
                        className={`absolute right-2 top-2 p-2 rounded-lg transition-all ${isListening === 'DESCRICAODOATIVO' ? 'bg-danger text-white animate-pulse' : 'bg-white text-accent shadow-sm'}`}
                      >
                        <Mic size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Nº de Série</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={manualAsset.SERIAL || ''} 
                          onChange={(e) => setManualAsset({...manualAsset, SERIAL: e.target.value.toUpperCase()})}
                          className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 pr-12 text-ink font-bold text-xs outline-none focus:border-accent"
                        />
                        <button 
                          onClick={() => handleVoiceTyping('SERIAL')}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${isListening === 'SERIAL' ? 'bg-danger text-white animate-pulse' : 'bg-white text-accent shadow-sm'}`}
                        >
                          <Mic size={18} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Quantidade</label>
                      <input 
                        type="number" 
                        value={manualAsset.QT || 1} 
                        onChange={(e) => setManualAsset({...manualAsset, QT: e.target.value})}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 text-ink font-bold text-xs outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-accent-soft border border-accent/10 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Unidade Operacional:</span>
                      <span className="text-[9px] font-black text-accent uppercase">{manualAsset.UNIDADE_OPERACIONAL}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Local:</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-black text-accent uppercase">{manualAsset.ENDERECO}</span>
                        <button 
                          onClick={handleReverseGeocoding}
                          disabled={isGeocoding}
                          className="p-1.5 bg-accent/10 text-accent rounded-lg border border-accent/10 active:scale-90 transition-all disabled:opacity-50"
                          title="Capturar endereço via GPS"
                        >
                          {isGeocoding ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Status:</span>
                      <span className="text-[8px] font-black text-accent uppercase text-right leading-tight">NOVO ITEM (MANUAL)</span>
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-8 bg-white border-t border-accent/10 shrink-0 sticky bottom-0">
               <button 
                 onClick={saveManualEntry}
                 className="w-full bg-accent text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all shadow-accent/20"
               >
                 Salvar e Conferir
               </button>
            </div>
          </div>
        </div>,
        document.body
      )}

          {/* Modal de Contingência GPS Removido v24.50 */}


    </div>
  );
};

export default Inventory;
