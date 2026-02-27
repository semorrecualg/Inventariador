
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Asset, TagInventario, ConservationState } from '../types';

import { 
  ArrowLeft, 
  MapPin, 
  Check,
  Zap, 
  ChevronRight,
  Building2,
  Hash,
  AlertOctagon,
  Square,
  CheckSquare,
  ListChecks,
  Plus,
  Search,
  X,
  AlertTriangle,
  FilePlus2,
  RefreshCw,
  Camera,
  QrCode,
  Keyboard,
  Flashlight,
  FlashlightOff,
} from 'lucide-react';

const parseAssetDate = (val: string | number | null | undefined): Date | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return null;
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
  }
  const parts = s.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const formatMonthYearBR = (val: string | number | null | undefined): string => {
  const date = parseAssetDate(val);
  if (date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  }
  return String(val || '').toUpperCase();
};

const formatEtiqueta = (val: string | number | null | undefined): string => {
  const s = String(val || '').trim();
  if (!s || s.toUpperCase() === 'ETIQUETAR') return s.toUpperCase();
  return s.padStart(6, '0');
};

interface AssetCardProps {
  asset: Asset;
  selectedLocation: string | null;
  onSelect: (a: Asset) => void;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  selectedCompany: string | null;
  isBatchMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  confirmButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

const NumericKeypad = ({ onInput, onDelete, onClose }: { onInput: (val: string) => void, onDelete: () => void, onClose: () => void }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  
  return (
    <div className="bg-white/95 backdrop-blur-2xl border-t border-slate-200 p-4 grid grid-cols-3 gap-3 animate-slideUp z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[2rem]">
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => {
            if (key === 'OK') onClose();
            else if (key === '⌫') onDelete();
            else onInput(key);
          }}
          className={`h-12 rounded-xl flex items-center justify-center text-lg font-bold transition-all active:scale-90 ${
            key === 'OK' ? 'bg-blue-600 text-white shadow-md' : 
            key === '⌫' ? 'bg-slate-100 text-slate-500' : 
            'bg-white border border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          {key === 'OK' ? 'PRONTO' : key}
        </button>
      ))}
    </div>
  );
};

const AssetCard = React.memo(({ 
  asset, selectedLocation, onSelect, onMakeDecision, selectedCompany, isBatchMode, isSelected, onToggleSelect, confirmButtonRef
}: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  const normalize = (s: string) => s?.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '';
  
  const companyKey = normalize(selectedCompany || '');
  const assetCompanyKey = normalize(asset.EMPRESA || '');
  const isDifferentCompany = selectedCompany && assetCompanyKey !== "" && assetCompanyKey !== companyKey;
  
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  const isBaixado = statusUpper.includes('BAIXADO');

  const visualStatus = useMemo(() => {
    const statusUpper = String(asset.STATUS || '').toUpperCase();
    const isBaixadoLogic = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;

    if (isBaixadoLogic) return TagInventario.BAIXADO;
    if (isDifferentCompany) return TagInventario.ADOTADO_EXTERNO;

    if (!asset._conferido) {
      const needsLabel = normalize(asset.ETIQUETA || '') === 'ETIQUETAR';
      if (needsLabel) return TagInventario.FALTA_ETIQUETAR;
      return TagInventario.PENDENTE;
    }

    const wasFaltaEtiquetar = normalize(asset._plaquetaMaster || '') === 'ETIQUETAR';
    if (wasFaltaEtiquetar && normalize(asset.ETIQUETA || '') !== 'ETIQUETAR') {
      return TagInventario.ETIQUETADO;
    }

    if (asset._isNew || asset.TAG_INVENTARIO === TagInventario.NOVO_ITEM) return TagInventario.NOVO_ITEM;
    if (asset.TAG_INVENTARIO === TagInventario.RE_ADOTADO) return TagInventario.RE_ADOTADO;

    const currentEtq = normalize(asset.ETIQUETA || "");
    const masterEtq = normalize(asset._plaquetaMaster || "");
    if (masterEtq !== "" && masterEtq !== "ETIQUETAR" && currentEtq !== masterEtq) {
      return TagInventario.DIVERGENCIA;
    }

    const targetLocKey = normalize(selectedLocation || "");
    const originalLocKey = normalize(asset.ENDERECO || ""); 

    if (originalLocKey === targetLocKey) return TagInventario.CONFERIDO;
    return TagInventario.ADOTADO;

  }, [asset, selectedLocation, isDifferentCompany, normalize]);

  const getColors = (tag: TagInventario) => {
    switch (tag) {
      case TagInventario.BAIXADO: 
        return { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-700', badge: 'bg-red-500 text-white', btn: 'bg-red-600', icon: AlertOctagon };
      case TagInventario.ADOTADO_EXTERNO: 
        return { bg: 'bg-sky-50', border: 'border-sky-100', text: 'text-sky-700', badge: 'bg-sky-500 text-white', btn: 'bg-sky-600', icon: Building2 };
      case TagInventario.ADOTADO: 
        return { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', badge: 'bg-indigo-600 text-white', btn: 'bg-indigo-600', icon: MapPin };
      case TagInventario.RE_ADOTADO: 
        return { bg: 'bg-fuchsia-50', border: 'border-fuchsia-100', text: 'text-fuchsia-700', badge: 'bg-fuchsia-600 text-white', btn: 'bg-fuchsia-600', icon: RefreshCw };
      case TagInventario.CONFERIDO: 
        return { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', badge: 'bg-emerald-500 text-white', btn: 'bg-emerald-600', icon: Check };
      case TagInventario.FALTA_ETIQUETAR: 
        return { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', badge: 'bg-amber-600 text-white', btn: 'bg-amber-600', icon: Hash };
      case TagInventario.ETIQUETADO: 
        return { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', badge: 'bg-violet-600 text-white', btn: 'bg-violet-600', icon: Check };
      case TagInventario.NOVO_ITEM: 
        return { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', badge: 'bg-orange-500 text-white', btn: 'bg-orange-600', icon: Plus };
      case TagInventario.DIVERGENCIA:
        return { bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-700', badge: 'bg-rose-600 text-white', btn: 'bg-rose-700', icon: AlertTriangle };
      case TagInventario.PENDENTE:
        return { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-900', badge: 'bg-slate-100 text-slate-600', btn: 'bg-sky-600', icon: Check };
      default: 
        return { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-900', badge: 'bg-slate-100 text-slate-600', btn: 'bg-sky-600', icon: Check };
    }
  };

  const colors = getColors(visualStatus);
  const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';

  const fullDescription = [
    asset.QT || '1',
    asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO',
    asset.SERIAL || 'S/N',
    formatMonthYearBR(asset.DATAAQUSIC),
    asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'
  ].join('; ');

  return (
    <div 
      className={`mb-2 p-3 border rounded-xl relative overflow-hidden transition-all modern-card active:scale-[0.99] ${colors.bg} ${colors.border} ${isSelected ? 'ring-2 ring-blue-500' : ''}`} 
      onClick={() => isBatchMode ? onToggleSelect(String(asset.id)) : onSelect(asset)}
    >
      <div className={`absolute top-0 left-0 px-3 py-1 rounded-br-xl text-[8px] font-bold uppercase flex items-center space-x-1.5 shadow-sm ${colors.badge}`}>
        {isBatchMode ? (
          isSelected ? <CheckSquare size={10} className="text-white" strokeWidth={3} /> : <Square size={10} className="text-white/50" />
        ) : (
          colors.icon && <colors.icon size={10} strokeWidth={3} />
        )}
        <span className="tracking-widest">{asset.REGISTRO || '---'} | {visualStatus}</span>
      </div>
      
      <div className="pt-5 pr-10 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio:</span>
            <span className={`text-lg font-bold font-mono tracking-tight ${colors.text}`}>
              {formatEtiqueta(asset.ETIQUETA)}
            </span>
          </div>
          {isBatch && (
            <div className="px-2 py-1 bg-amber-500 rounded-lg flex items-center space-x-1 shadow-md">
              <Zap size={10} className="text-white fill-white" />
              <span className="text-[8px] font-bold text-white uppercase tracking-widest">LOTE</span>
            </div>
          )}
        </div>

        <p className="text-[11px] font-medium text-slate-600 uppercase leading-tight tracking-tight line-clamp-2">
          {fullDescription}
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {[asset.AUDITOR_STATUS_CONFERENCIA, asset.AUDITOR_TAG_REGRA_OURO, asset.TAG_INVENTARIO].map((tag, index) => tag && (
            <span key={index} className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm ${index === 0 ? 'bg-blue-100 text-blue-600 border border-blue-200' : index === 1 ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-purple-100 text-purple-600 border border-purple-200'}`}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {!isConferido && !isBatchMode && (
        <button 
          ref={confirmButtonRef}
          onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
          className={`absolute bottom-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg active:scale-90 transition-all ${colors.btn} shadow-blue-900/10`}
        >
          <Check size={20} strokeWidth={3} />
        </button>
      )}

      {isConferido && !isBatchMode && (
        <div className={`absolute bottom-3 right-3 w-8 h-8 ${isBaixado ? 'bg-red-500' : 'bg-emerald-500'} text-white rounded-lg flex items-center justify-center shadow-md`}>
          <Check size={16} strokeWidth={3} />
        </div>
      )}
    </div>
  );
});

AssetCard.displayName = 'AssetCard';

interface InventoryProps {
  assets: Asset[];
  allAssets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (ids: string[]) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (loc: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (val: boolean) => void;
  selectedCompany: string | null;
  onAddNewLocation: (newLocation: string) => void;
  locationsWithStats: Record<string, { total: number; checked: number }>;
}

const Inventory: React.FC<InventoryProps> = ({ assets, allAssets, onBack, onUpdateAsset, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany, onAddNewLocation, locationsWithStats }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchModalData, setBatchModalData] = useState<Asset[] | null>(null);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualAsset, setManualAsset] = useState<Partial<Asset>>({});
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [showNumericKeypad, setShowNumericKeypad] = useState(false);
  
  // Novos estados para o fluxo de entrada de 3 vias
  const [entryMode, setEntryMode] = useState<'LIST' | 'MENU' | 'BARCODE' | 'QR' | 'MANUAL'>('LIST');
  const [scannedAsset, setScannedAsset] = useState<Asset | null>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isScannerStarting, setIsScannerStarting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "scanner-container";

  const normalizeKey = useCallback((s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '', []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error("Erro ao parar scanner:", err);
      }
      scannerRef.current = null;
    }
    setIsFlashOn(false);
  }, []);

  const handleScannedData = useCallback((data: string, mode: 'BARCODE' | 'QR') => {
    let processedData = data;
    if (mode === 'QR') {
      try {
        if (data.startsWith('{')) {
          const json = JSON.parse(data);
          processedData = json.ID_Patrimonio || json.id || data;
        } else if (data.startsWith('http')) {
          const url = new URL(data);
          processedData = url.searchParams.get('ID_Patrimonio') || url.pathname.split('/').pop() || data;
        }
      } catch (e) {
        console.error("Erro ao processar QR Code:", e);
      }
    }

    const term = normalizeKey(processedData);
    const asset = allAssets.find(a => normalizeKey(a.ETIQUETA || '') === term);
    
    if (asset) {
      setScannedAsset(asset);
      stopScanner();
      setEntryMode('LIST');
    } else {
      alert(`Ativo ${processedData} não encontrado no banco de dados.`);
    }
  }, [allAssets, normalizeKey, stopScanner]);

  const startScanner = useCallback(async (mode: 'BARCODE' | 'QR') => {
    console.log(`[Scanner] Iniciando modo: ${mode}`);
    await stopScanner();
    setScannerError(null);
    setIsScannerStarting(true);

    // Aguarda o DOM estabilizar
    await new Promise(resolve => setTimeout(resolve, 400));

    const element = document.getElementById(scannerContainerId);
    if (!element) {
      setScannerError("Erro: Container de vídeo não encontrado.");
      setIsScannerStarting(false);
      return;
    }

    try {
      // 1. Tenta obter as câmeras disponíveis para garantir permissão e escolher a melhor
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        throw new Error("Nenhuma câmera encontrada.");
      }

      // Tenta encontrar a câmera traseira (back/environment)
      const backCamera = devices.find(device => 
        device.label.toLowerCase().includes('back') || 
        device.label.toLowerCase().includes('traseira') ||
        device.label.toLowerCase().includes('rear')
      ) || devices[0];

      const scanner = new Html5Qrcode(scannerContainerId, { 
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.ITF
        ],
        verbose: false 
      });
      scannerRef.current = scanner;

      // 2. Configurações de ALTA PERFORMANCE
      const config = {
        fps: 25, // Aumentado para maior fluidez
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          if (mode === 'BARCODE') {
            // Caixa larga e fina para códigos de barras lineares
            return { width: Math.floor(viewfinderWidth * 0.85), height: Math.floor(viewfinderHeight * 0.25) };
          }
          // Caixa quadrada para QR Code
          const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.65;
          return { width: Math.floor(size), height: Math.floor(size) };
        },
        // Solicita resolução mais alta para ler etiquetas pequenas
        videoConstraints: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true // Usa API nativa do Chrome/Android se disponível (MUITO mais rápido)
        }
      };

      await scanner.start(
        backCamera.id,
        config,
        (decodedText, decodedResult) => {
          const detectedFormat = decodedResult.result.format?.format;
          
          // Lógica de troca de modo inteligente
          if (mode === 'BARCODE' && detectedFormat === Html5QrcodeSupportedFormats.QR_CODE) {
            if (confirm("QR Code detectado. Alternar modo?")) {
              setEntryMode('QR');
              return;
            }
          }
          
          if (mode === 'QR' && detectedFormat !== Html5QrcodeSupportedFormats.QR_CODE) {
            if (confirm("Código de barras detectado. Alternar modo?")) {
              setEntryMode('BARCODE');
              return;
            }
          }

          handleScannedData(decodedText, mode);
        },
        () => {} // Ignora erros de frame (comum)
      );

      console.log("[Scanner] Iniciado com sucesso");
      setIsScannerStarting(false);
    } catch (err: unknown) {
      console.error("[Scanner] Erro fatal:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission denied")) {
        setScannerError("Permissão de câmera negada pelo navegador.");
      } else if (msg.includes("NotFound") || msg.includes("Nenhuma câmera")) {
        setScannerError("Câmera não encontrada no dispositivo.");
      } else {
        setScannerError("Falha ao acessar câmera. Tente recarregar a página.");
      }
      setIsScannerStarting(false);
    }
  }, [stopScanner, handleScannedData]);

  useEffect(() => {
    if (entryMode === 'MANUAL') {
      setShowNumericKeypad(true);
    }
  }, [entryMode]);

  useEffect(() => {
    let isMounted = true;
    if (entryMode === 'BARCODE' || entryMode === 'QR') {
      const timer = setTimeout(() => {
        if (isMounted) {
          startScanner(entryMode as 'BARCODE' | 'QR');
        }
      }, 500); // Aumentado para 500ms para garantir renderização
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    } else {
      stopScanner();
    }
  }, [entryMode, startScanner, stopScanner]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const toggleFlash = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        const newState = !isFlashOn;
        // Tenta aplicar a restrição de lanterna (torch)
        // Alguns navegadores/dispositivos lançarão um erro se não for suportado
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: newState } as MediaTrackConstraintSet]
        } as MediaTrackConstraints);
        setIsFlashOn(newState);
      } catch (err: unknown) {
        console.error("Erro ao alternar flash:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorName = err instanceof Error ? err.name : "";
        
        // Se o erro for relacionado a restrições não suportadas
        if (errorName === 'OverconstrainedError' || errorMessage.includes('constraint') || errorMessage.includes('torch')) {
          alert("Lanterna não suportada ou não pôde ser ativada neste dispositivo.");
        } else {
          alert("Erro ao tentar usar a lanterna.");
        }
      }
    }
  };

  const handleConfirmAsset = (state: ConservationState) => {
    if (scannedAsset) {
      const originalLoc = normalizeKey(scannedAsset.ENDERECO || "");
      const targetLoc = normalizeKey(selectedLocation || "");
      
      let tag: TagInventario = TagInventario.CONFERIDO;
      if (originalLoc !== targetLoc) {
        tag = TagInventario.ADOTADO;
      }

      onUpdateAsset({
        ...scannedAsset,
        _conferido: true,
        ESTADO_CONSERVACAO: state,
        TAG_INVENTARIO: tag,
        _localMaster: selectedLocation || scannedAsset.ENDERECO,
        AUDITOR_STATUS_CONFERENCIA: tag
      });
      setScannedAsset(null);
      setCommittedSearch('');
      setDisplayValue('');
    }
  };

  const filteredAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const term = normalizeKey(committedSearch);
    const currentLocKey = normalizeKey(selectedLocation);
    const currentCompKey = normalizeKey(selectedCompany || '');

    // Se NÃO tem termo de busca, aplicamos Regra A: Esconde Baixados
    if (!term) {
      return assets.filter(a => {
        const locKey = normalizeKey(a.ENDERECO || "");
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isBaixado = statusUpper.includes('BAIXADO');
        
        if (isBaixado) return false; // REGRA A: Baixado não aparece na listagem um clique

        if (activeFilter === 'checked') return !!a._conferido && locKey === currentLocKey;
        return !a._conferido && locKey === currentLocKey;
      }).sort((a, b) => {
        const etqA = String(a.ETIQUETA || '').padStart(10, '0');
        const etqB = String(b.ETIQUETA || '').padStart(10, '0');
        return etqA.localeCompare(etqB, undefined, { numeric: true });
      });
    }

    // REGRA B e C: Quando há termo de busca
    // 1. Tentar buscar na empresa atual (incluindo baixados agora que houve busca manual)
    const companyMatches = assets.filter(a => 
      normalizeKey(a.ETIQUETA || '') === term || // Busca exata por etiqueta tem prioridade
      normalizeKey(a.ETIQUETA || '').includes(term)
    );

    // 2. REGRA C: Buscar em outras empresas se o número de ETIQUETA for idêntico
    // Mesmo que tenha encontrado na empresa atual, se o usuário digitou uma etiqueta, 
    // devemos mostrar se ela existe em outro lugar para análise de duplicidade/transferência.
    let globalMatches: Asset[] = [];
    if (term.length >= 3) {
      globalMatches = allAssets.filter(a => {
        const etq = normalizeKey(a.ETIQUETA || '');
        const assetCompKey = normalizeKey(a.EMPRESA || '');
        
        // Se for a mesma empresa, já tratamos em companyMatches
        if (assetCompKey === currentCompKey) return false;

        // Busca exata por etiqueta em outras empresas
        return etq === term;
      });
    }

    // Combinar resultados, removendo duplicatas por ID (caso ocorra)
    const combined = [...companyMatches];
    globalMatches.forEach(gm => {
      if (!combined.find(c => String(c.id) === String(gm.id))) {
        combined.push(gm);
      }
    });

    return combined.sort((a, b) => {
      const etqA = String(a.ETIQUETA || '').padStart(10, '0');
      const etqB = String(b.ETIQUETA || '').padStart(10, '0');
      return etqA.localeCompare(etqB, undefined, { numeric: true });
    });
  }, [assets, allAssets, selectedLocation, committedSearch, activeFilter, selectedCompany, normalizeKey]);

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
    setBatchModalData(pendingInSearch);
  };

  const handleMakeDecision = useCallback((id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;

    const asset = allAssets.find(a => String(a.id) === id);
    if (!asset) return;
    
    const etq = normalizeKey(asset.ETIQUETA || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedCompany || '');
    
    // Determinar a TAG_INVENTARIO correta
    const originalLoc = normalizeKey(asset.ENDERECO || "");
    const targetLoc = normalizeKey(selectedLocation || "");
    const statusUpper = String(asset.STATUS || '').toUpperCase();
    const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
    let tag: TagInventario;

    if (isBaixado) {
      tag = TagInventario.BAIXADO;
    } else if (asset._conferido) {
      tag = TagInventario.RE_ADOTADO;
    } else {
      if (originalLoc !== targetLoc) {
        tag = TagInventario.ADOTADO;
      } else {
        tag = TagInventario.CONFERIDO;
      }
    }

    if (isBatch && etq && etq !== "ETIQUETAR") {
      // Restrito à EMPRESA ATUAL e STATUS ATIVO
      const related = allAssets.filter(a => {
        const sameEtq = normalizeKey(a.ETIQUETA || "") === etq;
        const sameComp = normalizeKey(a.EMPRESA || "") === currentCompKey;
        const sUpper = String(a.STATUS || '').toUpperCase();
        const isNotB = !sUpper.includes('BAIXA') && !a.DATABAIXA;
        return sameEtq && sameComp && isNotB && !a._conferido;
      });

      if (related.length > 1) {
        setBatchModalData(related);
        return;
      }
    }
    
    onUpdateAsset({
      ...asset,
      _conferido: true,
      TAG_INVENTARIO: tag,
      _localMaster: selectedLocation || asset.ENDERECO,
      AUDITOR_STATUS_CONFERENCIA: tag
    });
    setDisplayValue('');
    // searchInputRef.current?.focus(); // Removido para evitar que o teclado apareça ao confirmar itens na lista
  }, [allAssets, onUpdateAsset, normalizeKey, selectedCompany, selectedLocation]);

  const handleAssetClick = useCallback((asset: Asset) => {
    const etq = normalizeKey(asset.ETIQUETA || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedCompany || '');
    const assetCompKey = normalizeKey(asset.EMPRESA || '');
    
    // Regra C: Se for de outra empresa, pedir confirmação extra
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      if (!confirm(`Este item pertence à empresa "${asset.EMPRESA}".\n\nDeseja ADOTAR este registro para a empresa "${selectedCompany}" no local "${selectedLocation}"?`)) {
        return;
      }
      // Se confirmou, vamos atualizar a empresa do item para a atual e marcar como ADOTADO EXTERNO
      onUpdateAsset({ 
        ...asset, 
        EMPRESA: selectedCompany || asset.EMPRESA,
        _conferido: true,
        TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
        _localMaster: selectedLocation || asset.ENDERECO
      });
      return;
    }

    if (isBatch && etq && etq !== "ETIQUETAR") {
      // Restrito à EMPRESA ATUAL e STATUS ATIVO
      const related = allAssets.filter(a => {
        const sameEtq = normalizeKey(a.ETIQUETA || "") === etq;
        const sameComp = normalizeKey(a.EMPRESA || "") === currentCompKey;
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isNotBaixado = !statusUpper.includes('BAIXA') && !a.DATABAIXA;
        return sameEtq && sameComp && isNotBaixado;
      });

      if (related.length > 1) {
        setBatchModalData(related);
        return;
      }
    }
    onSelectAsset(asset);
  }, [allAssets, onSelectAsset, onUpdateAsset, normalizeKey, selectedCompany, selectedLocation]);

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
    if (confirm(`Confirmar auditoria em lote para ${selectedIds.size} itens?`)) {
      const ids = Array.from(selectedIds);
      ids.forEach(id => {
        const asset = allAssets.find(a => String(a.id) === id);
        if (asset) {
          let tag: TagInventario = TagInventario.CONFERIDO;
          const originalLoc = normalizeKey(asset.ENDERECO || "");
          const targetLoc = normalizeKey(selectedLocation || "");
          const statusUpper = String(asset.STATUS || '').toUpperCase();
          const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;

          if (isBaixado) {
            tag = TagInventario.BAIXADO;
          } else if (asset._conferido) {
            tag = TagInventario.RE_ADOTADO;
          } else if (originalLoc !== targetLoc) {
            tag = TagInventario.ADOTADO;
          }

          onUpdateAsset({
            ...asset,
            _conferido: true,
            TAG_INVENTARIO: tag,
            _localMaster: selectedLocation || asset.ENDERECO,
            AUDITOR_STATUS_CONFERENCIA: tag
          });
        }
      });
      setSelectedIds(new Set());
      setIsBatchMode(false);
    }
  };

  const handleCreateNew = () => {
    setManualAsset({
        ETIQUETA: committedSearch || "",
        EMPRESA: selectedCompany || "",
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

  const saveManualEntry = () => {
    const newAsset: Asset = {
        ...manualAsset,
        id: `manual_${Date.now()}`,
        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
        _conferido: true,
        _isNew: true,
        _localMaster: selectedLocation || ""
    } as Asset;
    
    onUpdateAsset(newAsset);
    setIsManualEntryOpen(false);
    setCommittedSearch('');
    setDisplayValue('');
    onSelectAsset(newAsset);
  };

 

  // Removido auto-focus automático ao entrar na tela para atender solicitação do usuário
  // useEffect(() => {
  //   if (isInventorying) {
  //     searchInputRef.current?.focus();
  //   }
  // }, [isInventorying]);

  useEffect(() => {
    const searchTimeout = setTimeout(() => {
      setCommittedSearch(displayValue);
    }, 500);

    return () => clearTimeout(searchTimeout);
  }, [displayValue]);

  useEffect(() => {
    if (filteredAssets.length === 1 && committedSearch && !filteredAssets[0]._conferido) {
      searchInputRef.current?.blur();
      confirmButtonRef.current?.focus();
    }
  }, [filteredAssets, committedSearch]);

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      {!isInventorying ? (
        <>
          <div className="px-6 pt-12 pb-6 bg-white border-b border-slate-200">
            <button onClick={onBack} className="flex items-center space-x-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-4">
              <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
            </button>
            <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Mapeamento Geográfico</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Selecione uma localidade para auditoria</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-32 no-scrollbar">
            <button onClick={() => setIsNewLocationModalOpen(true)} className="w-full bg-sky-600 text-white p-5 rounded-2xl flex items-center justify-center space-x-3 font-bold uppercase text-sm tracking-widest active:scale-[0.98] transition-all shadow-md">
              <Plus size={20} />
              <span>Criar Nova Localidade</span>
            </button>
            {Object.keys(locationsWithStats).sort().map(loc => {
              const stats = locationsWithStats[loc];
              const progress = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
              const isStarted = stats.checked > 0;
              
              return (
                <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className="w-full bg-white border border-slate-200 rounded-3xl p-5 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden modern-card">
                  <div className={`absolute top-0 left-0 bottom-0 transition-all duration-700 ease-out ${isStarted ? 'bg-emerald-50' : 'bg-transparent'}`} style={{ width: `${progress}%` }} />
                  <div className="flex items-center space-x-4 relative z-10">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${isStarted ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                      <MapPin size={20} />
                    </div>
                    <div className="text-left">
                      <span className="text-[13px] font-bold uppercase block leading-none text-slate-900">{loc}</span>
                      <span className={`text-[9px] font-bold uppercase mt-2 block ${isStarted ? 'text-emerald-600' : 'text-slate-400'}`}>{stats.checked} / {stats.total} ITENS ({progress}%)</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 relative z-10" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="px-5 pt-8 pb-3 bg-white border-b border-slate-200 shadow-sm z-20">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => { setIsInventorying(false); setIsBatchMode(false); setSelectedIds(new Set()); setCommittedSearch(''); setEntryMode('LIST'); }} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center space-x-2 text-slate-600">
                <MapPin size={10} className="text-blue-500" />
                <span className="text-[9px] font-bold uppercase truncate italic tracking-wide">{selectedLocation}</span>
              </button>
              <div className="flex space-x-2">
                <button 
                  onClick={() => setEntryMode(entryMode === 'MENU' ? 'LIST' : 'MENU')} 
                  className={`p-2 rounded-lg border transition-all ${entryMode === 'MENU' ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'border-slate-200 text-slate-400'}`}
                >
                  <Plus size={16} />
                </button>
                <button onClick={() => setIsBatchMode(!isBatchMode)} className={`p-2 rounded-lg border transition-all ${isBatchMode ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'border-slate-200 text-slate-400'}`}>
                  <ListChecks size={16} />
                </button>
              </div>
            </div>

            {entryMode === 'MENU' && (
              <div className="grid grid-cols-3 gap-2 mb-3 animate-fadeIn">
                <button 
                  onClick={() => setEntryMode('MANUAL')}
                  className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl space-y-1 active:bg-slate-50"
                >
                  <Keyboard size={18} className="text-blue-600" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-600">Digitação</span>
                </button>
                <button 
                  onClick={() => setEntryMode('BARCODE')}
                  className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl space-y-1 active:bg-slate-50"
                >
                  <Camera size={18} className="text-blue-600" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-600">Barras 125</span>
                </button>
                <button 
                  onClick={() => setEntryMode('QR')}
                  className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl space-y-1 active:bg-slate-50"
                >
                  <QrCode size={18} className="text-blue-600" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-600">QR Code</span>
                </button>
              </div>
            )}

            {entryMode === 'MANUAL' && (
              <div className="relative mb-3 animate-fadeIn">
                <input 
                  ref={searchInputRef} 
                  type="text" 
                  readOnly
                  inputMode="none"
                  onFocus={() => setShowNumericKeypad(true)}
                  value={displayValue} 
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-bold font-mono text-xl text-center rounded-xl text-slate-900 outline-none focus:border-blue-500 transition-all cursor-pointer" 
                  placeholder="DIGITE ETIQUETA..." 
                />
                <button onClick={() => { setEntryMode('LIST'); setShowNumericKeypad(false); setDisplayValue(''); setCommittedSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-900"><X size={20} /></button>
              </div>
            )}

            {(entryMode === 'BARCODE' || entryMode === 'QR') && (
              <div className="relative mb-3 animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-black aspect-video">
                <div id={scannerContainerId} className="w-full h-full" />
                
                {/* Overlay Visual */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className={`border-2 border-blue-500/50 relative transition-all duration-300 ${entryMode === 'BARCODE' ? 'w-4/5 h-1/3' : 'w-2/3 h-2/3'}`}>
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-blue-500" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-blue-500" />
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-blue-500" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-blue-500" />
                    <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
                  </div>
                </div>

                {/* Controles do Scanner */}
                <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center z-20">
                  <button onClick={toggleFlash} className="p-2 bg-black/50 rounded-lg text-white backdrop-blur-sm">
                    {isFlashOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
                  </button>
                  <button onClick={() => { stopScanner(); setEntryMode('LIST'); }} className="p-2 bg-red-600 rounded-lg text-white shadow-lg">
                    <X size={18} />
                  </button>
                </div>

                {isScannerStarting && (
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center space-y-3 z-30">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Iniciando Câmera...</span>
                  </div>
                )}

                {scannerError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center z-40">
                    <AlertTriangle className="text-amber-500 mb-2" size={32} />
                    <p className="text-[10px] font-bold text-white uppercase tracking-widest">{scannerError}</p>
                    <button onClick={() => startScanner(entryMode as 'BARCODE' | 'QR')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest">Tentar Novamente</button>
                  </div>
                )}
              </div>
            )}

            <div className="flex space-x-2">
              <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase border transition-all ${activeFilter === 'pending' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'text-slate-400 border-slate-200'}`}>Pendentes</button>
              <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase border transition-all ${activeFilter === 'checked' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'text-slate-400 border-slate-200'}`}>Inventariado</button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden bg-bg-main relative">
            {isSearchResultBatch && (
              <div className="px-6 pt-5">
                <button 
                  onClick={handleConfirmSearchBatch} 
                  className="w-full mb-4 bg-amber-500 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-[0.2em] shadow-md active:scale-95 transition-all flex items-center justify-center space-x-3 border-b-4 border-amber-700"
                >
                  <Zap size={16} className="fill-white" />
                  <span>Confirmar Lote Completo ({filteredAssets.filter(a => !a._conferido).length} itens)</span>
                </button>
              </div>
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
                itemContent={(index, asset) => (
                  <div className="px-6 pt-2">
                    <AssetCard 
                      asset={asset} 
                      selectedLocation={selectedLocation} 
                      onSelect={() => handleAssetClick(asset)} 
                      onMakeDecision={handleMakeDecision} 
                      selectedCompany={selectedCompany} 
                      isBatchMode={isBatchMode} 
                      isSelected={selectedIds.has(String(asset.id))} 
                      onToggleSelect={toggleSelect} 
                      confirmButtonRef={confirmButtonRef}
                    />
                  </div>
                )}
              />
            ) : committedSearch ? (
                <div className="py-20 flex flex-col items-center justify-center text-center animate-fadeIn px-10">
                    <div className="w-24 h-24 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center text-orange-500 mb-6 shadow-sm">
                        <AlertTriangle size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Nenhum Registro</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3 leading-relaxed">Etiqueta &quot;{committedSearch}&quot; não localizada na base v24</p>
                    
                    <button onClick={handleCreateNew} className="mt-10 w-full py-5 bg-orange-500 text-white rounded-2xl flex items-center justify-center space-x-3 shadow-lg active:scale-95 transition-all font-bold uppercase text-[10px] tracking-widest">
                        <FilePlus2 size={18} />
                        <span>Incluir Manual</span>
                    </button>
                </div>
            ) : (
                <div className="py-24 flex flex-col items-center justify-center opacity-30 text-center">
                    <Search size={64} className="mb-6 text-slate-300" />
                    <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-slate-400">Aguardando Auditoria</p>
                </div>
            )}

            {showNumericKeypad && (
              <div className="absolute inset-x-0 bottom-0 z-[100]">
                <NumericKeypad 
                  onInput={(val) => setDisplayValue(prev => prev + val)}
                  onDelete={() => setDisplayValue(prev => prev.slice(0, -1))}
                  onClose={() => setShowNumericKeypad(false)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {isManualEntryOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-orange-500/30 shadow-2xl p-8">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Incluir Novo Item Manual</h3>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6">Preencha os dados do novo ativo.</p>
            
            <div className="space-y-4 max-h-60 overflow-y-auto pr-2 no-scrollbar">
              <div>
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">DESCRIÇÃO DO ATIVO</label>
                <input 
                  type="text"
                  value={manualAsset.DESCRICAODOATIVO || ''}
                  onChange={(e) => setManualAsset(prev => ({ ...prev, DESCRICAODOATIVO: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded-lg px-4 py-2 font-mono text-sm text-white outline-none focus:border-orange-500 transition-all mt-1"
                />
              </div>
              <div>
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">SERIAL</label>
                <input 
                  type="text"
                  value={manualAsset.SERIAL || ''}
                  onChange={(e) => setManualAsset(prev => ({ ...prev, SERIAL: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded-lg px-4 py-2 font-mono text-sm text-white outline-none focus:border-orange-500 transition-all mt-1"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button onClick={() => setIsManualEntryOpen(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-xl font-black uppercase text-xs tracking-widest">Cancelar</button>
              <button onClick={saveManualEntry} className="flex-1 py-4 bg-orange-600 text-white rounded-xl font-black uppercase text-xs tracking-widest">Salvar Item</button>
            </div>
          </div>
        </div>
      )}

       {isNewLocationModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-sky-500/30 shadow-2xl p-8">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Criar Nova Localidade</h3>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6">Insira o nome para o novo local de auditoria.</p>
            <input 
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl px-5 py-4 font-black text-lg text-center text-white outline-none focus:border-sky-500 transition-all mb-6"
              placeholder="NOME DO LOCAL"
            />
            <div className="flex space-x-3">
              <button onClick={() => setIsNewLocationModalOpen(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-xl font-black uppercase text-xs tracking-widest">Cancelar</button>
              <button 
                onClick={() => {
                  onAddNewLocation(newLocationName);
                  setNewLocationName('');
                  setIsNewLocationModalOpen(false);
                }}
                disabled={!newLocationName.trim()}
                className="flex-1 py-4 bg-sky-600 text-white rounded-xl font-black uppercase text-xs tracking-widest disabled:opacity-30"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {isBatchMode && selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-6 right-6 z-50 animate-slideUp">
           <div className="bg-emerald-600 p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between border-t border-white/20">
              <div className="flex items-center space-x-3">
                 <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white font-data font-black">{selectedIds.size}</div>
                 <div className="text-white">
                   <p className="text-[10px] font-black uppercase tracking-widest leading-none">Conferência em Lote</p>
                 </div>
              </div>
              <div className="flex space-x-2">
                 <button onClick={() => setSelectedIds(new Set())} className="p-3 bg-black/20 text-white rounded-xl active:scale-90"><X size={20} /></button>
                 <button onClick={handleBatchConfirm} className="px-6 py-3 bg-white text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95">Conferir</button>
              </div>
           </div>
        </div>
      )}

      {batchModalData && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-fadeIn">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setBatchModalData(null)} />
          <div className="bg-slate-900 w-full max-w-md rounded-[2.5rem] border border-amber-500/30 shadow-[0_0_100px_rgba(245,158,11,0.15)] overflow-hidden relative z-10 animate-scaleIn">
            <div className="bg-amber-600 px-8 py-10 text-white relative">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2 bg-black/20 px-4 py-2 rounded-full border border-white/10">
                  <Zap size={14} className="fill-white" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Inventário em Lote</span>
                </div>
                <button onClick={() => setBatchModalData(null)} className="p-2 bg-white/10 rounded-xl active:scale-90"><X size={20} /></button>
              </div>
              <h3 className="text-3xl font-black uppercase tracking-tighter italic leading-none mb-2">LOTE: {batchModalData[0]?.ETIQUETA}</h3>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Detectamos {batchModalData.length} registros vinculados</p>
            </div>

            <div className="p-8 space-y-4">
              <div className="bg-black/20 border border-white/5 p-5 rounded-3xl">
                <div className="flex items-center space-x-3 mb-4">
                  <MapPin size={16} className="text-amber-500" />
                  <div>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Destino da Auditoria</p>
                    <p className="text-[11px] font-black text-white uppercase italic">{selectedLocation}</p>
                  </div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-[9px] font-bold text-amber-500 leading-tight">
                    Atenção: Todos os registros serão realocados para este local no ato da confirmação.
                  </p>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto no-scrollbar space-y-2 pr-1">
                {batchModalData.map((a, idx) => (
                  <div key={a.id} className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-white truncate uppercase">{a.DESCRICAODOATIVO}</p>
                      <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-1">Reg: {a.REGISTRO} / Sub: {a.SUBREG}</p>
                    </div>
                    <span className="text-[10px] font-black text-amber-500 font-mono ml-4">#{idx + 1}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => {
                  const updates = batchModalData.map(asset => {
                    let tag: TagInventario = TagInventario.CONFERIDO;
                    const originalLoc = normalizeKey(asset.ENDERECO || "");
                    const targetLoc = normalizeKey(selectedLocation || "");
                    const statusUpper = String(asset.STATUS || '').toUpperCase();
                    const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;

                    if (isBaixado) {
                      tag = TagInventario.BAIXADO;
                    } else if (asset._conferido) {
                      tag = TagInventario.RE_ADOTADO;
                    } else if (originalLoc !== targetLoc) {
                      tag = TagInventario.ADOTADO;
                    }

                    return {
                      ...asset,
                      _conferido: true,
                      TAG_INVENTARIO: tag,
                      _localMaster: selectedLocation || asset.ENDERECO
                    };
                  });
                  
                  updates.forEach(u => onUpdateAsset(u));
                  setBatchModalData(null);
                  setCommittedSearch('');
                  setDisplayValue('');
                }}
                className="w-full bg-amber-600 text-white py-6 rounded-[2rem] text-sm font-black uppercase tracking-widest shadow-2xl shadow-amber-900/40 active:scale-95 transition-all border-b-4 border-amber-800"
              >
                Confirmar Tudo
              </button>
            </div>
          </div>
        </div>
      )}


      {scannedAsset && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-scaleIn">
            <div className="bg-blue-600 p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Ativo Identificado</span>
                <button onClick={() => setScannedAsset(null)} className="p-2 bg-white/10 rounded-lg"><X size={18} /></button>
              </div>
              <h3 className="text-2xl font-bold tracking-tight uppercase leading-none">{scannedAsset.ETIQUETA}</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-80">{scannedAsset.REGISTRO} | {scannedAsset.EMPRESA}</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Descrição do Item</label>
                <p className="text-sm font-bold text-slate-900 uppercase leading-tight">{scannedAsset.DESCRICAODOATIVO}</p>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Estado de Conservação</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(ConservationState).map((state) => (
                    <button 
                      key={state}
                      onClick={() => handleConfirmAsset(state)}
                      className="py-3 px-4 border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all active:scale-95"
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setScannedAsset(null)}
                className="w-full py-4 bg-slate-200 text-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-widest"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isManualEntryOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-fadeIn">
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md" onClick={() => setIsManualEntryOpen(false)} />
          <div className="bg-slate-900 w-full max-w-md rounded-[2.5rem] border border-orange-500/30 shadow-2xl overflow-hidden relative z-10 animate-scaleIn flex flex-col max-h-[90vh]">
            <div className="bg-orange-600 px-8 py-8 text-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2 bg-black/20 px-4 py-2 rounded-full border border-white/10">
                  <FilePlus2 size={14} className="fill-white" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Inclusão Manual</span>
                </div>
                <button onClick={() => setIsManualEntryOpen(false)} className="p-2 bg-white/10 rounded-xl active:scale-90"><X size={20} /></button>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic leading-none">Novo Registro</h3>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-1">Preencha os dados do ativo encontrado</p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">
               <div className="space-y-4">
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Etiqueta / Patrimônio</label>
                    <input 
                      type="text" 
                      value={manualAsset.ETIQUETA || ''} 
                      onChange={(e) => setManualAsset({...manualAsset, ETIQUETA: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-black font-mono text-lg outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Descrição do Ativo</label>
                    <textarea 
                      rows={3}
                      value={manualAsset.DESCRICAODOATIVO || ''} 
                      onChange={(e) => setManualAsset({...manualAsset, DESCRICAODOATIVO: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold text-xs outline-none focus:border-orange-500 uppercase"
                      placeholder="DESCREVA O BEM..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Nº de Série</label>
                      <input 
                        type="text" 
                        value={manualAsset.SERIAL || ''} 
                        onChange={(e) => setManualAsset({...manualAsset, SERIAL: e.target.value.toUpperCase()})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold text-xs outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Quantidade</label>
                      <input 
                        type="number" 
                        value={manualAsset.QT || 1} 
                        onChange={(e) => setManualAsset({...manualAsset, QT: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold text-xs outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Empresa:</span>
                      <span className="text-[9px] font-black text-orange-500 uppercase">{manualAsset.EMPRESA}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Local:</span>
                      <span className="text-[9px] font-black text-orange-500 uppercase">{manualAsset.ENDERECO}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Status:</span>
                      <span className="text-[8px] font-black text-orange-500 uppercase text-right leading-tight">NOVO ITEM (MANUAL)</span>
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-8 bg-slate-900 border-t border-slate-800 shrink-0">
               <button 
                 onClick={saveManualEntry}
                 className="w-full bg-orange-600 text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all border-b-4 border-orange-800"
               >
                 Salvar e Conferir
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
