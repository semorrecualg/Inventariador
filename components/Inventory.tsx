
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Asset, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode, User, DatabaseMode, UnitConfig } from '../types';
import Scanner from './Scanner';
import { extractEtiquetaFromQrData } from '../utils/qrUtils';
import { formatMonthYearBR, formatEtiqueta } from '../utils/formatUtils';
import { generateUUID, findAssetGlobally } from '../services/supabaseService';
import { telemetryService, DeviceMetrics } from '../services/telemetryService';
import { assetRepository } from '../services/assetRepository';

import { createWorker } from 'tesseract.js';
import { reverseGeocode } from '../services/geocodingService';
import { determineAssetTag, getTagMetadata } from '../services/tagService';
import { 
  MapPin, 
  Check,
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
  ArrowLeft
} from 'lucide-react';

const formatReadingTime = (isoStr?: string) => {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

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
  asset, selectedLocation, onSelect, onMakeDecision, selectedUnit, isBatchMode, isSelected, onToggleSelect, hasLocalPhoto
}: AssetCardProps) => {
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  
  const isBaixado = useMemo(() => {
    return statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
  }, [statusUpper, asset.DATABAIXA]);

  const visualStatus = useMemo(() => {
    return determineAssetTag(asset, selectedLocation || asset.ENDERECO || "", selectedUnit);
  }, [asset, selectedLocation, selectedUnit]);

  const meta = getTagMetadata(visualStatus);
  const StatusIcon = meta.icon;

  const fullDescription = [
    asset.QT || '1',
    asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO',
    asset.SERIAL || 'S/N',
    formatMonthYearBR(asset.DATAAQUISIC),
    asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'
  ].join('; ');

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.vibrate) navigator.vibrate(10);
    onMakeDecision(String(asset.id), 'YES');
  };

  return (
    <div 
      className={`mb-3 p-4 bg-white rounded-2xl border border-[#F1F5F9] relative transition-all active:scale-[0.99] shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${isSelected ? 'ring-2 ring-accent' : ''}`} 
      onClick={() => {
        if (isBatchMode) {
          if (!isConferido) onToggleSelect(String(asset.id));
        } else {
          onSelect(asset);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 pr-4">
          <div className="flex items-center space-x-2 mb-1">
            <div className="bg-[#F1F5F9] px-1.5 py-0.5 rounded-[4px]">
              <span className="text-[9px] font-extrabold text-[#64748B] uppercase tracking-wider">PATRIMÔNIO</span>
            </div>
            {(asset._photoUrl || hasLocalPhoto) && (
              <Camera size={12} className="text-accent" />
            )}
            {isBaixado && (
              <div className="bg-red-50 px-1.5 py-0.5 rounded-[4px]">
                <span className="text-[9px] font-extrabold text-red-600 uppercase tracking-wider">BAIXA</span>
              </div>
            )}
          </div>
          
          <h3 className="text-xl font-extrabold text-[#1E293B] font-mono tracking-tight mb-1">
            {formatEtiqueta(asset.ETIQUETA)}
          </h3>
          
          <p className="text-sm font-medium text-[#475569] leading-snug line-clamp-2 mb-2">
            {fullDescription}
          </p>
          
          <div className="flex items-center space-x-3">
            <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-md ${meta.color.bg} ${meta.color.border} border`}>
              <StatusIcon size={10} className={meta.color.text} />
              <span className={`text-[10px] font-black uppercase tracking-tight ${meta.color.text}`}>
                {visualStatus}
              </span>
            </div>
            {asset.REGISTRO && (
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-tight">
                REG: {asset.REGISTRO}
              </span>
            )}
            {asset._dataLeitura && (
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-tight">
                {formatReadingTime(asset._dataLeitura)}
              </span>
            )}
          </div>
        </div>

        {/* Ação Integrada */}
        <div className="shrink-0 ml-2">
          {isBatchMode ? (
            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-sm ${isSelected ? 'bg-accent text-white ring-4 ring-accent/20' : 'border-2 border-[#CBD5E1] bg-white'}`}>
              {isSelected && <Check size={22} strokeWidth={4} />}
            </div>
          ) : (
            <button 
              onClick={!isConferido ? handleConfirm : undefined}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md ${isConferido ? meta.color.bg.replace('/30', '') : 'border-2 border-[#CBD5E1] bg-white active:scale-90'} ${isConferido ? 'text-white' : ''}`}
            >
              {isConferido ? (
                <Check size={26} strokeWidth={4} />
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-[#CBD5E1]/50" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
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
  locationsWithStats, 
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
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [duplicateAsset, setDuplicateAsset] = useState<Asset | null>(null);
  const [scannedAsset, setScannedAsset] = useState<Asset | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const normalizeKey = useCallback((s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '', []);

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
    
    // Buscar o ativo no banco local (SQLite-like) para máxima performance
    let foundAsset = await assetRepository.findByEtiqueta(term);
    
    // Se não encontrou localmente e estamos em modo nuvem, tenta busca global no Supabase
    if (!foundAsset && databaseMode.startsWith('SUPABASE') && user?.tenantid) {
      console.log(`>>> [Inventory] Ativo não encontrado localmente. Iniciando busca global na nuvem para: ${term}`);
      const cloudAsset = await findAssetGlobally(term, user.tenantid);
      if (cloudAsset) {
        console.log(`>>> [Inventory] Ativo localizado globalmente na nuvem!`);
        foundAsset = cloudAsset;
      }
    }
    
    // REGRA: Se já foi inventariado, avisa (Sempre mostra modal de duplicidade)
    if (foundAsset && foundAsset._conferido) {
      setDuplicateAsset(foundAsset);
      return;
    }

    if (autoConfirmOnScanRef.current) {
      if (foundAsset) {
        // Se encontrou, confirma automaticamente na localização atual
        const currentCompKey = normalizeKey(selectedUnitRef.current || '');
        const assetCompKey = normalizeKey(foundAsset.UNIDADE_OPERACIONAL || foundAsset._unitid || '');
        const currentLocKey = normalizeKey(selectedLocationRef.current || '');
        const assetLocKey = normalizeKey(foundAsset._localMaster || foundAsset.ENDERECO || '');
        
        if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
          // Caso seja de outra empresa, adota
          onUpdateAssetRef.current({ 
            ...foundAsset, 
            UNIDADE_OPERACIONAL: selectedUnitRef.current || foundAsset.UNIDADE_OPERACIONAL || foundAsset._unitid,
            _conferido: true,
            TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
            _localMaster: selectedLocationRef.current || foundAsset.ENDERECO
          });
        } else if (assetLocKey !== "" && assetLocKey !== currentLocKey) {
          // Caso seja da mesma empresa mas outro endereço, adota como sobra física
          onUpdateAssetRef.current({
            ...foundAsset,
            _conferido: true,
            TAG_INVENTARIO: TagInventario.ADOTADO,
            _localMaster: selectedLocationRef.current || foundAsset.ENDERECO
          });
        } else {
          // Caso seja da mesma empresa e mesmo endereço
          onUpdateAssetRef.current({
            ...foundAsset,
            _conferido: true,
            _localMaster: selectedLocationRef.current || foundAsset.ENDERECO
          });
        }
        
        // Limpa busca para próxima leitura contínua
        setCommittedSearch('');
        setDisplayValue('');
      } else {
        // Se não encontrou e está em auto-confirm, mostra modal de "Não Localizado"
        setScannedResult(result);
      }
    } else {
      // Se NÃO for auto-conferência (NÃO), deve mostrar o item e aguardar confirmação
      if (foundAsset) {
        // REGRA DE OURO: Item ATIVO mas com DATA DE BAIXA na base
        const statusUpper = String(foundAsset.STATUS || '').toUpperCase();
        const isGoldenRuleDivergent = !statusUpper.includes('BAIXA') && !!foundAsset.DATABAIXA;
        const assetWithDivergence = { ...foundAsset, _is_divergent_baixa: isGoldenRuleDivergent };
        
        setScannedAsset(assetWithDivergence);
      } else {
        setScannedResult(result);
      }
    }
  }, [normalizeKey]);

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

  const handleConfirmSearchBatch = () => {
    const pendingInSearch = filteredAssets.filter(a => !a._conferido);
    if (pendingInSearch.length === 0) return;
    
    const ids = pendingInSearch.map(a => String(a.id));
    onBulkUpdateAssets(ids);
    
    setCommittedSearch('');
    setDisplayValue('');
  };

  const handleMakeDecision = useCallback((id: string, decision: 'YES' | 'NO') => {
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
        onBulkUpdateAssets(ids);
        setDisplayValue('');
        return;
      }
    }
    
    onUpdateAsset({
      ...asset,
      _conferido: true,
      _localMaster: selectedLocation || asset.ENDERECO
    });
    setDisplayValue('');
  }, [allAssets, onUpdateAsset, onBulkUpdateAssets, normalizeKey, selectedUnit, selectedLocation]);

  const handleAssetClick = useCallback((asset: Asset) => {
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
      onUpdateAsset({ 
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
        onBulkUpdateAssets(ids);
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

  const handleBatchConfirm = () => {
    if (selectedIds.size === 0) return;
    
    // Filtra apenas os que ainda não foram conferidos para preservar integridade De/Para
    const ids = Array.from(selectedIds).filter(id => {
      const asset = allAssets.find(a => String(a.id) === id);
      return asset && !asset._conferido;
    });

    if (ids.length > 0) {
      onBulkUpdateAssets(ids);
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
        _campaignId: currentCampaignId,
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
                <div className={`${scannedAsset._is_divergent_baixa ? 'bg-red-50 border-red-100' : 'bg-accent-soft border-accent/10'} p-4 rounded-2xl border transition-colors`}>
                  <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Patrimônio</p>
                  <p className={`text-xl font-black font-mono ${scannedAsset._is_divergent_baixa ? 'text-red-700' : 'text-ink'}`}>{scannedAsset.ETIQUETA}</p>
                  <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{scannedAsset.DESCRICAODOATIVO}</p>
                  <div className={`mt-3 pt-3 border-t flex items-center justify-between ${scannedAsset._is_divergent_baixa ? 'border-red-100' : 'border-accent/10'}`}>
                    <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Localização Atual:</span>
                    <span className={`text-[9px] font-black uppercase ${scannedAsset._is_divergent_baixa ? 'text-red-600' : 'text-accent'}`}>{selectedLocation}</span>
                  </div>
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
                <div>
                  <p className="text-[10px] font-black text-red-700 uppercase tracking-widest">GPS Âncora Pendente</p>
                  <p className="text-[9px] text-red-600 font-bold uppercase leading-tight mt-1">
                    Configuração de GPS obrigatória para liberar o inventário.
                  </p>
                </div>
              </div>
            )}

            {Object.keys(locationsWithStats)
              .filter(locKey => normalizeKey(locationsWithStats[locKey].displayName).includes(normalizeKey(locationSearchTerm)))
              .sort((a, b) => locationsWithStats[a].displayName.localeCompare(locationsWithStats[b].displayName))
              .map(locKey => {
                const stats = locationsWithStats[locKey];
                const loc = stats.displayName;
                const progress = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
                const isCompleted = progress === 100;
                
                // Extrair código e nome (assumindo formato "CODIGO NOME")
                const parts = loc.split(' ');
                const code = parts[0];
                const name = parts.slice(1).join(' ') || loc;
              
                return (
                  <button 
                    key={locKey} 
                    disabled={!unitConfig}
                    onClick={() => { 
                      setSelectedLocation(loc); 
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
                          {stats.checked} / {stats.total} ITENS
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
              })}
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
          {/* Top App Bar - Minimalist Dashboard Style */}
          <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => { setIsInventorying(false); setIsBatchMode(false); setSelectedIds(new Set()); setCommittedSearch(''); setIsSearchVisible(false); }}
                className="p-2 -ml-2 text-[#1E293B] hover:bg-slate-50 rounded-full transition-colors active:scale-90"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-[#1E293B] leading-tight tracking-tight">Inventário</h1>
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-[0.15em]">Operação em Campo</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {isBatchMode && (
                <button 
                  onClick={toggleSelectAll} 
                  className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? 'bg-accent text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              )}

              {activeFilter === 'checked' && (
                <button 
                  onClick={onOpenSignature}
                  className="w-10 h-10 flex items-center justify-center text-accent bg-blue-50 rounded-xl transition-colors hover:bg-blue-100"
                >
                  <FileText size={20} />
                </button>
              )}

              <button 
                onClick={onOpenConsultation}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <Database size={20} />
              </button>

              <button 
                onClick={handleScannerClose} 
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${searchMode === InventorySearchMode.MANUAL ? 'bg-accent text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
                title="Busca por Teclado"
              >
                <Keyboard size={20} />
              </button>

              <button 
                onClick={handleScannerOpen} 
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${searchMode === InventorySearchMode.SCANNER ? 'bg-accent text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
                title="Busca por Câmera"
              >
                <Camera size={20} />
              </button>
            </div>
          </div>

          <div className="bg-white px-6 py-4 shadow-sm border-b border-slate-50">
            <div className="space-y-4">
              {/* Sensors Row - Elegant & Thin */}
              <div className="flex items-center justify-between bg-slate-50/50 p-2 rounded-2xl border border-slate-100">
                <div className="flex items-center space-x-2 px-2 flex-1 min-w-0">
                  <MapPin size={14} className="text-accent shrink-0" />
                  <span className="text-[10px] font-bold text-[#1E293B] truncate uppercase tracking-tight">
                    {selectedLocation}
                  </span>
                </div>
                
                <div className="flex items-center space-x-3 pr-2">
                  <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl transition-all ${torch === 'on' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-slate-100/50 border border-slate-100 text-slate-400'}`}>
                    <Flashlight size={12} className={torch === 'on' ? 'animate-pulse' : ''} />
                    <span className="text-[9px] font-black tracking-widest">LUZ</span>
                  </div>
                  <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl transition-all ${deviceMetrics.temp > 42 ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-blue-500/10 border border-blue-100 text-blue-600'}`}>
                    <Activity size={12} className={deviceMetrics.temp > 42 ? 'animate-pulse' : ''} />
                    <span className="text-[9px] font-black tracking-widest">{deviceMetrics.temp.toFixed(0)}°C</span>
                  </div>
                  <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl transition-all ${deviceMetrics.battery < 20 ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-emerald-500/10 border border-emerald-100 text-emerald-600'}`}>
                    <Zap size={12} className={deviceMetrics.battery < 20 ? 'animate-pulse' : ''} />
                    <span className="text-[9px] font-black tracking-widest">{deviceMetrics.battery}%</span>
                  </div>
                </div>
              </div>

              {/* Segmented Control - Modern Pill Style */}
              <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-100">
                <button 
                  onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); setDisplayValue(''); }} 
                  className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeFilter === 'pending' ? 'bg-white text-accent shadow-sm' : 'text-[#64748B]'}`}
                >
                  Pendentes
                </button>
                <button 
                  onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); setDisplayValue(''); }} 
                  className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeFilter === 'checked' ? 'bg-white text-accent shadow-sm' : 'text-[#64748B]'}`}
                >
                  Inventariado
                </button>
              </div>

              {/* Search Bar - Minimalist & Functional */}
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search size={16} className="text-[#94A3B8]" />
                </div>
                <input 
                  ref={searchInputRef} 
                  type="text" 
                  readOnly
                  inputMode="none"
                  onFocus={() => setShowNumericKeypad(true)}
                  value={displayValue} 
                  className="w-full bg-[#F8FAFC] border border-[#F1F5F9] pl-11 pr-24 py-3.5 font-mono text-base font-bold rounded-2xl text-[#1E293B] outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all cursor-pointer placeholder:text-[#94A3B8] placeholder:font-sans placeholder:text-xs placeholder:tracking-widest" 
                  placeholder="DIGITE OU ESCANEIE ETIQUETA..." 
                />
                <div className="absolute inset-y-0 right-2 flex items-center space-x-1">
                  <button 
                    onClick={triggerSmartOCR}
                    className="p-2 text-[#64748B] hover:bg-white rounded-xl transition-all active:scale-90"
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
                
                <input 
                  type="file" 
                  ref={ocrInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  capture="environment"
                  onChange={handleSmartOCR}
                />
              </div>
            </div>
          </div>

        <div 
          className="flex-1 overflow-hidden bg-bg-main relative"
            onPointerDown={() => {
              if (showNumericKeypad) setShowNumericKeypad(false);
            }}
          >
            {isSearchResultBatch && (
              <div className="px-4 pt-3">
                <button 
                  onClick={handleConfirmSearchBatch} 
                  className="w-full mb-3 bg-warning text-white py-3 rounded-xl font-bold uppercase text-[9px] tracking-[0.2em] shadow-md active:scale-95 transition-all flex items-center justify-center space-x-2 border-b-4 border-black/20"
                >
                  <Zap size={16} className="fill-white" />
                  <span>Confirmar Lote Completo ({filteredAssets.filter(a => !a._conferido).length} itens)</span>
                </button>
              </div>
            )}

            {/* BARRA DE AÇÃO LOTE INVENTARIO - TOPO PARA FLUIDEZ */}
            {isBatchMode && selectedIds.size > 0 && (
              <div className="px-4 pb-2 animate-slideDown">
                 <div className="bg-success p-3 rounded-2xl shadow-lg flex items-center justify-between border border-white/20">
                    <div className="flex items-center space-x-3 pl-2">
                       <span className="text-xl font-black text-white tracking-tighter">{selectedIds.size}</span>
                       <span className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Selecionados</span>
                    </div>
                    <div className="flex items-center space-x-2">
                       <button onClick={() => setSelectedIds(new Set())} className="p-2 bg-black/20 text-white rounded-xl"><X size={16} /></button>
                       <button onClick={handleBatchConfirm} className="px-6 py-2 bg-white text-success rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all">Confirmar Lote</button>
                    </div>
                 </div>
              </div>
            )}

            {/* Scanner Integrado (Inline) */}
            {isScannerOpen && searchMode === 'SCANNER' && (
              <div className="px-4 mb-4">
                <div className="relative overflow-hidden rounded-3xl border-4 border-white/10 shadow-2xl">
                  <Scanner 
                    isInline={true}
                    mode={scannerMode}
                    onModeChange={handleUpdateScannerModeLocal}
                    onScan={handleScan}
                    onClose={handleScannerClose}
                    isPaused={isScannerPaused || isThermalBlocked || isCoolingDown || !!(scannedAsset || scannedResult || duplicateAsset)}
                    scanFeedbackMode={scanFeedbackMode}
                    batterySaver={batterySaver}
                    torch={torch}
                    onTorchToggle={handleTorchToggle}
                  >
                    {isThermalBlocked && (
                      <div className="absolute inset-0 bg-red-600/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-[110]">
                        <ShieldAlert size={32} className="text-white mb-2 animate-pulse" />
                        <p className="text-white text-[10px] font-black uppercase tracking-widest">Resfriamento Necessário</p>
                        <p className="text-white/70 text-[8px] font-bold uppercase mt-1">Temp: {deviceMetrics.temp.toFixed(1)}°C</p>
                      </div>
                    )}
                    {isScannerPaused && !isThermalBlocked && (
                      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-[110]">
                        <Zap size={32} className="text-amber-500 mb-2" />
                        <p className="text-white text-[10px] font-black uppercase tracking-widest">Standby Térmico</p>
                        <button onClick={resetActivity} className="mt-2 px-4 py-1.5 bg-white text-black rounded-lg text-[8px] font-black uppercase tracking-widest">Retomar</button>
                      </div>
                    )}
                  </Scanner>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-2 z-50">
                    <div className="px-3 py-1 bg-success/80 backdrop-blur-md rounded-full flex items-center space-x-2 shadow-lg border border-white/20">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Scanner Ativo</span>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {showScrollTop && (
              <button 
                onClick={() => virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' })}
                className="absolute bottom-6 right-6 w-12 h-12 bg-accent text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all z-[90] border-2 border-white/20"
              >
                <ChevronRight size={24} className="-rotate-90" />
              </button>
            )}

            {filteredAssets.length > 0 ? (
              <Virtuoso
                ref={virtuosoRef}
                style={{ height: '100%' }}
                data={filteredAssets}
                increaseViewportBy={300}
                isScrolling={(scrolling) => {
                  if (scrolling && showNumericKeypad) {
                    setShowNumericKeypad(false);
                  }
                }}
                atTopStateChange={(atTop) => setShowScrollTop(!atTop)}
                components={{
                  Footer: () => <div className="h-28" />
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
                    />
                  </div>
                )}
              />
            ) : committedSearch ? (
                <div className="py-20 flex flex-col items-center justify-center text-center animate-fadeIn px-10">
                    <div className="w-24 h-24 bg-warning/5 border border-warning/20 rounded-full flex items-center justify-center text-warning mb-6 shadow-sm">
                        <AlertTriangle size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-ink uppercase tracking-tight">Nenhum Registro</h3>
                    <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-3 leading-relaxed">Etiqueta &quot;{committedSearch}&quot; não localizada na base v24</p>
                    
                    <button onClick={handleCreateNew} className="mt-10 w-full py-5 bg-warning text-white rounded-2xl flex items-center justify-center space-x-3 shadow-lg active:scale-95 transition-all font-bold uppercase text-[10px] tracking-widest">
                        <FilePlus2 size={18} />
                        <span>Incluir Manual</span>
                    </button>
                </div>
            ) : (
                <div className="py-24 flex flex-col items-center justify-center opacity-30 text-center">
                    <Search size={64} className="mb-6 text-ink-muted" />
                    <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-ink-muted">Aguardando Auditoria</p>
                </div>
            )}
          </div>

          {showNumericKeypad && (
            <div className="absolute inset-x-0 bottom-0 z-[100]">
              <NumericKeypad 
                onInput={(val) => setDisplayValue(prev => prev + val)}
                onDelete={() => setDisplayValue(prev => prev.slice(0, -1))}
                onClose={() => setShowNumericKeypad(false)}
              />
            </div>
          )}
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
          isPaused={isScannerPaused || isThermalBlocked || isCoolingDown || !!(scannedAsset || scannedResult || duplicateAsset)}
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

    </div>
  );
};

export default Inventory;
