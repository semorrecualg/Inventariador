
/**
 * GBR v24.50 KARDEK - REGISTRADOR DE SOBERANIA NATIVA
 * 
 * Query Principal de Alimentação da Unidade Operacional Selecionada (Filtro Estrito SQLite):
 * SELECT * FROM ativos WHERE TRIM(filial) = ? AND _is_deleted = 0;
 * 
 * Assinatura do Componente de Listagem de Ativos (Garantia de Isolamento Total):
 * export const Inventory: React.FC<InventoryProps>
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Asset, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode, User, DatabaseMode, UnitConfig, AppScreen } from '../types';
import Scanner from './Scanner';
import { extractEtiquetaFromQrData, QR_FIELD_ORDER } from '../utils/qrUtils';
import { generateUUID } from '../services/supabaseService';
import { telemetryService } from '../services/telemetryService';
import { useDeviceMetrics } from '../hooks/useDeviceMetrics';
import Marquee from './Marquee';
import { isAdminEmail } from '../utils/authUtils';
import { localDb } from '../services/localDbService';
import { queueAssetBackupMirror } from '../services/persistenceService';
import { sqliteService } from '../services/sqliteService';
import { MemoryGuardService } from '../services/MemoryGuardService';
import { normalizeKey } from '../utils/schema';
import { canonicalKey } from '../utils/normalize';
import { formatDateBR, formatCurrency, formatEtiqueta } from '../utils/formatUtils';
import { findSerialDuplicates } from '../utils/assetDuplicates';
import { findBatchGroup, splitByAddress, batchLabel, addressKey } from '../utils/etiquetaGroup';
import {
  buildCopyForNewItem,
  getDeviceCode,
  radSequenceOf,
  readRadCounter,
  writeRadCounter,
} from '../utils/copyAssetForNewItem';
import { AssetListItem } from './AssetListItem';
import PreferencesPanel from './PreferencesPanel';
import { resolvePersistedTag } from '../services/tagService';
import { BufferIndicator } from './BufferIndicator';
import { assetRepository } from '../services/assetRepository';

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
  Camera,
  Loader2,
  Database,
  Mic,
  ShieldAlert,
  WifiOff,
  ArrowLeft,
  Target,
  Settings2
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

const normalizeKeyFast = (s: string | null | undefined) => {
  if (!s) return '';
  return s.toString().toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, '')
    .trim();
};

/**
 * Endereço efetivo do ativo — MESMA regra de `getLocationsWithStats` (App.tsx) e
 * do `AddressSelector`: o local auditado (`_localMaster`) vence o endereço da base.
 */
const assetAddressKey = (a: Asset): string =>
  normalizeKeyFast(a._localMaster || a.endereco || a.LOCALIZACAO || a.CENTRO_CUSTO || 'SEM LOCAL');

/**
 * Pertence à unidade em auditoria? Tolera divergência de grafia entre `filial`
 * (texto) e `_unitid`/código numérico — mesma tolerância da carga indexada de
 * `fetchUnitAssets` no App.tsx, para a lista não desaparecer por um detalhe de nome.
 */
const belongsToUnit = (a: Asset, activeFilial: string): boolean => {
  const target = normalizeKeyFast(activeFilial);
  if (!target) return true;
  const keys = [normalizeKeyFast(String(a.filial || '')), normalizeKeyFast(String(a._unitid || ''))].filter(Boolean);
  if (keys.some(k => k === target)) return true;
  const targetCode = target.match(/^\d+/)?.[0];
  return !!targetCode && keys.some(k => k.match(/^\d+/)?.[0] === targetCode);
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
import { logger } from '../utils/logger';

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
  onUpdateAutoConfirm: (val: boolean) => void;
  scanFeedbackMode: ScanFeedbackMode;
  onUpdateScanFeedbackMode: (mode: ScanFeedbackMode) => void;
  darkMode: boolean;
  onUpdateDarkMode: (val: boolean) => void;
  onUpdateBatterySaver: (val: boolean) => void;
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
  /** Campos escolhidos em PAINEL COMPLETO → Configurar QR Code. */
  qrCodeFields?: string[];
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
  onUpdateAutoConfirm,
  scanFeedbackMode, 
  onUpdateScanFeedbackMode,
  darkMode,
  onUpdateDarkMode,
  onUpdateBatterySaver,
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
  unitConfig,
  qrCodeFields = ['ETIQUETA']
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [dbLocations, setDbLocations] = useState<{ displayName: string; total: number; checked: number; locKey: string }[]>([]);
  const [globalSearchResults, setGlobalSearchResults] = useState<Asset[]>([]);
  const [sreNotification, setSreNotification] = useState<{ type: 'success' | 'warning' | 'error' | 'info'; message: string; subText?: string } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Auto-dismiss SRE notification after 4 seconds
  useEffect(() => {
    if (sreNotification) {
      const timer = setTimeout(() => {
        setSreNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [sreNotification]);

  // 3. ISOLAMENTO DE CONCORRÊNCIA E MEMÓRIA (MUTEX & MEMGUARD)
  // No evento de desmonte do componente (useEffect cleanup), invoque MemoryGuardService.releaseMassiveArray
  useEffect(() => {
    return () => {
      logger.info(">>> [MemoryGuard] Componente Inventory desmontado. Limpando arrays massivos de cache...");
      MemoryGuardService.releaseMassiveArray(globalSearchResults);
      MemoryGuardService.releaseMassiveArray(dbLocations);
    };
  }, [globalSearchResults, dbLocations]);
  const [currentSelectedAddress] = useState<string | null>(() => sessionStorage.getItem('current_selected_address'));

  const cleanAndCapitalizeAsset = useCallback((rawAsset: Asset): Asset => {
    const cleanTenantid = String(rawAsset.tenantid || user?.tenantid || '').trim().toUpperCase();
    const cleanFilial = String(rawAsset.filial || selectedUnit || user?.filial || '').trim().toUpperCase();
    
    if (!cleanTenantid || cleanTenantid === 'NULL' || cleanTenantid === 'UNDEFINED' || cleanTenantid === '') {
      alert("Erro de Governança: tenantid inválido ou não autenticado.");
      throw new Error("tenantid inválido ou não autenticado para gravação.");
    }

    if (!cleanFilial || cleanFilial === 'NULL' || cleanFilial === 'UNDEFINED' || cleanFilial === '') {
      alert("Erro de Governança: filial inválido.");
      throw new Error("Filial inválido para gravação.");
    }

    const trimmedAsset = { ...rawAsset } as unknown as Record<string, unknown>;
    delete trimmedAsset.tenantid;
    delete trimmedAsset.tenantid;
    delete trimmedAsset.tenantid;
    delete trimmedAsset._unitid;
    delete trimmedAsset.unitid;

    return {
      ...trimmedAsset,
      tenantid: cleanTenantid,
      filial: cleanFilial
    } as Asset;
  }, [user, selectedUnit]);

  // MECANISMO DE PERSISTÊNCIA ESPELHADA (DUPLO GRAVADOR)
  const handleUpdateAssetWithBackup = useCallback(async (cleanAsset: Asset) => {
    // O resguardo em localStorage é coalescido (uma escrita por janela em vez de
    // um parse/stringify de todo o array a cada conferência). A gravação local
    // (Dexie) e o estado visual correm imediatamente, sem esperar a rede.
    try {
      const activeTenantid = String(cleanAsset.tenantid || user?.tenantid || '').trim().toUpperCase();
      const activeFilial = String(cleanAsset.filial || selectedUnit || user?.filial || 'MATRIZ').trim().toUpperCase();
      queueAssetBackupMirror(cleanAsset, activeTenantid, activeFilial);
    } catch (e) {
      logger.warn(">>> [Persistência Espelhada] Erro ao agendar backup de contingência:", e);
    }
    
    await onUpdateAsset(cleanAsset);
  }, [onUpdateAsset, user, selectedUnit]);

  const hasRecoveredRef = useRef(false);

  // ROTINA AUTÔNOMA DE RETOMADA (RECOVERY BOOT)
  useEffect(() => {
    const runRecoveryBoot = async () => {
      if (hasRecoveredRef.current) return;
      hasRecoveredRef.current = true;
      
      const activeTenantid = String(user?.tenantid || '').trim().toUpperCase();
      const activeFilial = String(selectedUnit || user?.filial || 'MATRIZ').trim().toUpperCase();
      const backupKey = `gbr_backup_${activeTenantid}_${activeFilial}`;
      
      const rawBackup = localStorage.getItem(backupKey);
      if (!rawBackup) return;
      
      try {
        const backupArray: Asset[] = JSON.parse(rawBackup);
        if (!Array.isArray(backupArray) || backupArray.length === 0) return;
        
        logger.info(`>>> [Recovery Boot] Encontrados ${backupArray.length} registros remanescentes de contingência no localStorage.`);
        
        let recoveredCount = 0;
        for (const backedAsset of backupArray) {
          const currentLocalObj = allAssetsRef.current.find(a => String(a.id) === String(backedAsset.id));
          const isAlreadyConferido = currentLocalObj && (currentLocalObj._conferido || String(currentLocalObj.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM');
          
          if (!isAlreadyConferido) {
            logger.info(`>>> [Recovery Boot] Recuperando ativo órfão/pendente de gravação local: ${backedAsset.id} (Etiqueta: ${backedAsset.etiqueta})`);
            await onUpdateAsset(backedAsset);
            recoveredCount++;
          }
        }
        
        logger.info(`>>> [Recovery Boot] Rotina concluída. ${recoveredCount} ativos recuperados e reinseridos.`);
        localStorage.removeItem(backupKey);
      } catch (err) {
        logger.warn('>>> [Recovery Boot] Erro durante processamento da rotina autônoma de retomada:', err);
        hasRecoveredRef.current = false;
      }
    };
    
    if (isInventorying && allAssets.length > 0) {
      runRecoveryBoot();
    }
  }, [isInventorying, allAssets.length, onUpdateAsset, user, selectedUnit]);
  
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localPhotoIds, setLocalPhotoIds] = useState<Set<string>>(new Set());
  const [qrModalAsset, setQrModalAsset] = useState<Asset | null>(null);

  // QR DO ATIVO = ETIQUETA + os campos definidos em "Configurar QR Code".
  // A etiqueta vem SEMPRE primeiro (é o que o leitor usa para localizar o
  // ativo); os demais seguem a ordem oficial de `QR_FIELD_ORDER`.
  const qrFieldKeys = useMemo(() => {
    const keys: string[] = ['ETIQUETA'];
    for (const raw of qrCodeFields || []) {
      const field = String(raw || '').trim();
      if (!field) continue;
      if (!keys.some(k => k.toUpperCase() === field.toUpperCase())) keys.push(field);
    }
    const rank = (field: string) => {
      const index = QR_FIELD_ORDER.findIndex(o => o.toUpperCase() === field.toUpperCase());
      return index === -1 ? QR_FIELD_ORDER.length : index;
    };
    return keys.sort((a, b) => rank(a) - rank(b));
  }, [qrCodeFields]);

  // Valores já formatados (data/moeda) na mesma ordem do QR — o modal mostra
  // exatamente o que foi codificado, campo a campo.
  const qrModalFieldValues = useMemo(() => {
    if (!qrModalAsset) return [] as Array<{ field: string; value: string }>;
    const record = qrModalAsset as unknown as Record<string, unknown>;
    const out: Array<{ field: string; value: string }> = [];
    for (const field of qrFieldKeys) {
      const key = canonicalKey(field);
      const raw = record[key] ?? record[field] ?? record[field.toUpperCase()];
      let value = String(raw ?? '').trim();
      if (!value) continue;
      const upper = field.toUpperCase();
      if (upper === 'DATAAQUISIC' || upper === 'DATABAIXA') value = formatDateBR(value);
      if (upper === 'VLRAQUISIC') value = formatCurrency(value);
      out.push({ field, value });
    }
    return out;
  }, [qrModalAsset, qrFieldKeys]);

  const qrModalData = useMemo(
    () => qrModalFieldValues.map(item => item.value).join('\n'),
    [qrModalFieldValues]
  );

  // BARREIRA DE PROTEÇÃO CONTRA REFRESH (F5 SEGURO)
  // AUTO-REPARO SRE: além de observar o flag, tenta inicializar o motor Dexie
  // quando ele não estiver pronto (init() é idempotente e db.open() em banco já
  // aberto é no-op). Isso impede o congelamento eterno em "RE-INICIALIZANDO
  // SISTEMA GBR" quando isInitialized estiver false por qualquer motivo.
  const [isDbReady, setIsDbReady] = useState(sqliteService.getIsInitialized());

  useEffect(() => {
    let isMounted = true;
    let checkTimer: NodeJS.Timeout | null = null;
    const verifyDatabaseInit = async () => {
      if (!isMounted) return;
      if (!sqliteService.getIsInitialized()) {
        try {
          await sqliteService.init(true);
        } catch (err) {
          logger.warn('>>> [Inventory] Falha na inicialização de emergência do motor Dexie:', err);
        }
      }
      if (!isMounted) return;
      const initialized = sqliteService.getIsInitialized();
      if (initialized) {
        setIsDbReady(true);
      } else {
        checkTimer = setTimeout(verifyDatabaseInit, 100);
      }
    };
    verifyDatabaseInit();
    return () => {
      isMounted = false;
      if (checkTimer) clearTimeout(checkTimer);
    };
  }, []);

  // Telemetria e Hardware — métricas vêm do poller partilhado (5 s), que também
  // alimenta o cabeçalho. Aqui só interessa a regra térmica.
  const deviceMetrics = useDeviceMetrics();
  const [torch, setTorch] = useState<'on' | 'off'>('off');
  const [isThermalBlocked, setIsThermalBlocked] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [isScannerPaused, setIsScannerPaused] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [isPersistingScan, setIsPersistingScan] = useState(false);

  // Regra Contábil (CPC 27): Bloquear leituras se a temperatura exceder 48°C
  useEffect(() => {
    if (deviceMetrics.temp > 48) {
      setIsThermalBlocked(true);
    } else if (deviceMetrics.temp < 45) {
      setIsThermalBlocked(false);
    }
  }, [deviceMetrics.temp]);

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
  // FICHA DO ATIVO em modo LEITURA, aberta a partir de "não localizado" ou da
  // busca em outras unidades. Nada aqui altera o registo de origem: só existe
  // para o auditor ver o bem e, se quiser, copiar os dados para o item novo
  // desta unidade/endereço. ADOTADO EXTERNO deixa de ser criado por padrão.
  const [fichaPreview, setFichaPreview] = useState<Asset | null>(null);
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [isLocationSearchVisible, setIsLocationSearchVisible] = useState(false);
  const [locationSearchTerm, setLocationSearchTerm] = useState('');
  const [debouncedLocTerm, setDebouncedLocTerm] = useState('');
  const [isLocSearching, setIsLocSearching] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [duplicateAsset, setDuplicateAsset] = useState<Asset | null>(null);

  // Conferência em lote disparada pelo clique no item (plaqueta repetida).
  const [batchGroup, setBatchGroup] = useState<Asset[]>([]);
  const [batchCheckedIds, setBatchCheckedIds] = useState<Set<string>>(new Set());
  const [isBatchGroupSaving, setIsBatchGroupSaving] = useState(false);
  const [scannedAsset, setScannedAsset] = useState<Asset | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);

  // ALERTA DE DUPLICIDADE DE SERIAL: o cadastro manual de NOVO ITEM não pode
  // criar um segundo registro com o mesmo número de série de outro ativo.
  const manualSerialConflicts = useMemo(
    () => (isManualEntryOpen ? findSerialDuplicates(manualAsset.serial, allAssets, manualAsset.id) : []),
    [isManualEntryOpen, manualAsset.serial, manualAsset.id, allAssets]
  );
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showGlobalSearchResolution, setShowGlobalSearchResolution] = useState<string | null>(null);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // v24.50: Restauração de Scroll (UX de Campo)
  useEffect(() => {
    const savedIndex = sessionStorage.getItem(`gbr_scroll_index_${selectedUnit}_${selectedLocation || 'all'}`);
    if (savedIndex && virtuosoRef.current) {
      const index = parseInt(savedIndex, 10);
      if (index > 0) {
        logger.info(`>>> [UX] Restaurando posição de scroll para o índice: ${index}`);
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
      if (!isDbReady || !selectedUnit) return;
      setIsLocSearching(true);
      try {
        const results = await localDb.assets.getLocationsWithStats(selectedUnit, debouncedLocTerm);
        setDbLocations(results || []);
      } catch (err) {
        logger.error(">>> [DBA] Erro ao buscar localidades:", err);
      } finally {
        setIsLocSearching(false);
      }
    };

    performSearch();
  }, [debouncedLocTerm, selectedUnit, allAssets.length, isDbReady]);

  const handleRangeChanged = useCallback((range: { startIndex: number }) => {
    if (range.startIndex > 0) {
      sessionStorage.setItem(`gbr_scroll_index_${selectedUnit}_${selectedLocation || 'all'}`, range.startIndex.toString());
    }
  }, [selectedUnit, selectedLocation]);

  // Refs para manter callbacks estáveis e evitar reinício do scanner a cada atualização de estado
  const allAssetsRef = useRef(allAssets);
  const selectedLocationRef = useRef(selectedLocation);
  const selectedUnitRef = useRef(selectedUnit);
  const onUpdateAssetRef = useRef(handleUpdateAssetWithBackup);
  const autoConfirmOnScanRef = useRef(autoConfirmOnScan);
  const scanFeedbackModeRef = useRef(scanFeedbackMode);
  const lastScanTime = useRef<number>(0);
  const lastScanResult = useRef<string>('');
  const isModalOpenRef = useRef(false);

  useEffect(() => { allAssetsRef.current = allAssets; }, [allAssets]);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);
  useEffect(() => { selectedUnitRef.current = selectedUnit; }, [selectedUnit]);
  useEffect(() => { onUpdateAssetRef.current = handleUpdateAssetWithBackup; }, [handleUpdateAssetWithBackup]);
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
      setIsScannerOpen(false);
      onUpdateSearchMode(InventorySearchMode.MANUAL);
      clearInventorySearchValue();
    }
  }, [inventorySearchValue, clearInventorySearchValue, onUpdateSearchMode]);

  const handleScannerOpen = useCallback(() => {
    onUpdateSearchMode(InventorySearchMode.SCANNER);
    setIsScannerOpen(true);
  }, [onUpdateSearchMode]);

  // Saída da leitura para digitação: fecha a câmera e devolve o foco ao campo
  // de busca. "Digitar Código Manualmente" NÃO cria ativo — quem cria é
  // "Incluir novo registro" no estado vazio/resultado não localizado.
  const closeScannerForTyping = useCallback(() => {
    setIsScannerOpen(false);
    onUpdateSearchMode(InventorySearchMode.MANUAL);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [onUpdateSearchMode]);

  const handleScan = useCallback(async (result: string) => {
    // Se estiver em cooldown térmico, bloqueado ou persistindo uma leitura anterior, ignora
    if (isCoolingDown || isThermalBlocked || isScannerPaused || isPersistingScan) return;

    // Se já houver algum modal aberto, ignora novas leituras para evitar sobreposição
    if (isModalOpenRef.current) return;

    // Debounce para evitar múltiplas leituras do mesmo código em sequência rápida (2 segundos)
    const now = Date.now();
    if (result === lastScanResult.current && now - lastScanTime.current < 2000) return;
    
    lastScanTime.current = now;
    lastScanResult.current = result;
    resetActivity();

    // Trava imediatamente contra cliques duplos e concorrência de hardware
    setIsPersistingScan(true);

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
      const currentUnit = selectedUnitRef.current || '';

      // 1. COMPORTAMENTO E CAPTURA DE LEITURA (SCANNER CONTRATO)
      // Executa consulta parametrizada de forma fluente e nativa no IndexedDB
      let foundAsset = await localDb.assets.scanAsset(term, currentUnit);

      // Se não encontrou na local_assets, fazemos a busca nas tabelas normais para máxima tolerância e segurança
      if (!foundAsset) {
        const foundAssetRepo = await assetRepository.findByEtiquetaInUnit(term, currentUnit);
        if (foundAssetRepo) {
          foundAsset = foundAssetRepo;
        }
      }

      if (foundAsset) {
        // AUTO-CONFERÊNCIA DESLIGADA (Ajustes de Campo): a leitura abre a ficha
        // de confirmação e só grava depois do toque do auditor. A persistência
        // fica a cargo do modal, que reutiliza o mesmo fluxo de atualização.
        if (!autoConfirmOnScanRef.current) {
          setIsHierarchyLoading(false);
          setScannedAsset(foundAsset);
          return;
        }

        // 2. REGRAS DE VALIDAÇÃO E ATUALIZAÇÃO SRE & 3. ISOLAMENTO DE CONCORRÊNCIA (DEXIE)
        // Ativo localizado: update atômico usando o serviço de banco local
        const id = String(foundAsset.id || foundAsset.primarykey);

        // REGRA DE OURO: BAIXADO é permanente e imutável — localizar o bem não
        // apaga a baixa; apenas registra a conferência física.
        const isBaixado = String(foundAsset.status || '').toUpperCase().includes('BAIXA') || !!foundAsset.databaixa;
        const auditLocation = selectedLocationRef.current || foundAsset.endereco || '';
        // TAG de auditoria calculada no ato e PERSISTIDA (coluna do arquivo de retorno).
        // Avaliada sobre o estado ANTERIOR (com o `_localMaster` antigo) para detectar
        // a movimentação em tempo real e marcar RE-ADOTADO corretamente.
        const auditTag = resolvePersistedTag(
          { ...foundAsset, _conferido: true },
          auditLocation,
          currentUnit
        );

        await localDb.assets.update(id, {
          _conferido: true,
          ...(isBaixado ? {} : { status: 'CONFERIDO' }),
          TAG_INVENTARIO: auditTag,
          _localMaster: auditLocation,
          _is_synced: 0
        }, user?.email || 'operador');

        // Adiciona um log de auditoria de conferência
        await localDb.auditLogs.add({
          timestamp: new Date().toISOString(),
          user: user?.email || 'operador',
          action: 'CONFERENCIA',
          table_name: 'local_assets',
          record_id: String(id),
          details: `Ativo conferido via scanner: ${extractedEtiqueta}`,
          tenantid: user?.tenantid || ''
        });

        setIsHierarchyLoading(false);

        // Se tiver o callback onUpdateAsset da prop, notificamos o React para atualizar o state global do app
        const cleanAsset = cleanAndCapitalizeAsset({
          ...foundAsset,
          _conferido: true,
          ...(isBaixado ? {} : { status: 'CONFERIDO' }),
          TAG_INVENTARIO: auditTag,
          _is_synced: 0,
          _localMaster: auditLocation
        });
        await onUpdateAssetRef.current(cleanAsset);

        setSreNotification({
          type: isBaixado ? 'warning' : 'success',
          message: isBaixado ? 'BAIXADO Registrado' : 'Ativo Conferido com Sucesso',
          subText: `Etiqueta: ${extractedEtiqueta} | Status: ${isBaixado ? 'BAIXADO (permanente)' : auditTag}`
        });

        // SEMPRE auto-confirma ativos conhecidos — sem modal, agilidade total
        setCommittedSearch('');
        setDisplayValue('');
        return;
      }

      // Se o ativo NÃO for localizado (Item sem plaqueta/Divergente):
      // Grave um registro de aviso imediatamente na tabela local 'audit_logs' via transação protegida para auditoria futura
      await localDb.auditLogs.add({
        timestamp: new Date().toISOString(),
        user: user?.email || 'operador',
        action: 'DIVERGENCIA',
        table_name: 'local_assets',
        record_id: extractedEtiqueta,
        details: `Ativo divergente isolado via scanner: ${extractedEtiqueta}`,
        tenantid: user?.tenantid || ''
      });

      setIsHierarchyLoading(false);

      // Atualize o estado de UI informando 'Ativo Divergente Isolado'
      setSreNotification({
        type: 'warning',
        message: 'Ativo Divergente Isolado',
        subText: `Etiqueta ${extractedEtiqueta} não foi localizada na base local.`
      });

      // Abre opções de busca global ou cadastro de divergência
      setShowGlobalSearchResolution(extractedEtiqueta);

    } catch (err) {
      logger.error(">>> [Inventory SRE] Erro físico ou de consulta Dexie:", err);
      setIsHierarchyLoading(false);
      
      // 4. BANIMENTO DE RECHARGES E ALERTS:
      // Capture qualquer exceção física no bloco 'catch', grave silenciosamente o erro na tabela local de auditoria
      // e exiba uma notificação estilizada em HTML dentro da própria UI para manter a viewport do operador estável.
      try {
        await localDb.auditLogs.add({
          timestamp: new Date().toISOString(),
          user: user?.email || 'SRE_SYSTEM',
          action: 'SQL_ERROR',
          table_name: 'local_assets',
          record_id: term,
          details: `Exception in scan query: ${err instanceof Error ? err.message : String(err)}`,
          tenantid: user?.tenantid || ''
        });
      } catch (innerErr) {
        logger.error(">>> [Inventory SRE] Falha ao gravar log de erro físico:", innerErr);
      }

      setSreNotification({
        type: 'error',
        message: 'Falha no Motor Dexie',
        subText: `Ocorreu uma exceção física: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsPersistingScan(false);
    }
  }, [isCoolingDown, isThermalBlocked, isScannerPaused, isPersistingScan, torch, user, cleanAndCapitalizeAsset, resetActivity]);

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
      logger.error(">>> [Inventory] Erro na busca global:", err);
      alert(`Falha ao realizar a busca global de ativos: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsHierarchyLoading(false);
    }
  };

  const handleCreateNewFromHierarchy = () => {
    const etiqueta = showGlobalSearchResolution || '';
    setShowGlobalSearchResolution(null);
    setGlobalSearchResults([]);
    setManualAsset({
      etiqueta: etiqueta,
      filial: selectedUnit || "",
      status: "ATIVO",
      dataaqusic: new Date().toLocaleDateString('pt-BR'),
      AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
      TAG_INVENTARIO: TagInventario.NOVO_ITEM,
      qt: 1,
      descricaodoativo: '',
      serial: '',
      endereco: selectedLocation || ""
    });
    setIsManualEntryOpen(true);
  };

  /**
   * COPIA os dados de um bem de outra unidade para o formulário do item novo.
   * O registo de origem NÃO é alterado (nada de mudar filial/endereço dele):
   * o que este bem tem de identidade e de auditoria fica de fora da cópia.
   */
  const handleCopyToNewItem = (origem: Asset) => {
    // LISTA BRANCA (utils/copyAssetForNewItem): só campos descritivos viajam.
    // `primarykey`, `_is_synced` e `sn1_recno` não — o registo novo tem de ser
    // um registo novo. O recno da origem fica em `rad_recno` (REGISTRO ADOTADO)
    // e o registro original só em `_copiadoDeRegistro`, para não colidir.
    // Código curto desta instalação: sem ele dois aparelhos na mesma unidade
    // emitiam o mesmo `rad_..._000001`.
    const dispositivo = getDeviceCode();
    const copia = buildCopyForNewItem(
      origem,
      {
        unidade: selectedUnit,
        endereco: selectedLocation,
        etiqueta: showGlobalSearchResolution || origem.etiqueta,
        dispositivo,
        // Contador persistido: a série continua mesmo que o item anterior
        // tenha sido apagado ou a gravação falhado.
        ultimoContador: readRadCounter(selectedUnit, dispositivo),
        hoje: new Date().toLocaleDateString('pt-BR'),
      },
      // Base carregada: a sequência continua a partir dos rótulos já gravados.
      allAssets,
    );
    const sequenciaRad = radSequenceOf(copia.rad_recno);
    if (sequenciaRad !== null) writeRadCounter(selectedUnit, dispositivo, sequenciaRad);

    setManualAsset({
      ...copia,
      TAG_INVENTARIO: TagInventario.NOVO_ITEM,
    });
    setIsManualEntryOpen(true);
    setFichaPreview(null);
    setShowGlobalSearchResolution(null);
    setGlobalSearchResults([]);
    setCommittedSearch('');
    setDisplayValue('');
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
               A etiqueta <span className="text-amber-400">{showGlobalSearchResolution}</span> não foi localizada nesta unidade. Nada é movido de outra unidade: você só copia os dados se confirmar.
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
                          <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest">{asset.filial || asset._unitid || 'SEM UNIDADE'}</p>
                          <h4 className="text-[11px] font-bold text-slate-800 line-clamp-2 mt-0.5">{asset.descricaodoativo}</h4>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 ml-2">#{String(asset.registro || '').slice(-4)}</span>
                      </div>
                      
                      <div className="flex space-x-2 pt-1">
                        <button 
                          onClick={() => setFichaPreview(asset)}
                          className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-md"
                        >
                          Ver Ficha do Ativo
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
                    <span>Incluir Manualmente</span>
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

  /**
   * FICHA DO ATIVO em modo LEITURA para um bem que não está nesta unidade.
   * Fecha o ciclo do "não localizado": o auditor vê os dados completos e
   * escolhe copiar para um item novo desta unidade/endereço ou voltar ao
   * formulário de origem. O registo consultado nunca é alterado.
   */
  const renderFichaPreview = () => {
    if (!fichaPreview) return null;
    const a = fichaPreview;
    const campos: Array<[string, string]> = [
      ['Registro', String(a.registro || '—')],
      ['Descrição', String(a.descricaodoativo || '—')],
      ['Série', String(a.serial || '—')],
      ['Quantidade', String(a.qt ?? 1)],
      ['Endereço (origem)', String(a.endereco || a._localMaster || '—')],
      ['Fornecedor', String(a.nomefornecedor || '—')],
      ['Nota fiscal', String(a.notafiscal || '—')],
      ['Data de aquisição', String(a.dataaqusic || '—')],
      ['Valor de aquisição', a.vlraquisic != null ? String(a.vlraquisic) : '—'],
    ];

    return createPortal(
      <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
        <div className="bg-white w-full max-w-md rounded-[2rem] border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="bg-slate-900 p-5 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Database size={16} />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Ficha do Ativo · somente leitura</span>
            </div>
            <h3 className="text-lg font-black uppercase italic tracking-tighter leading-none mt-1 font-mono">
              {a.etiqueta || 'SEM PLAQUETA'}
            </h3>
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">
              Unidade de origem: {a.filial || a._unitid || 'NÃO INFORMADA'}
            </p>
          </div>

          <div className="p-4 overflow-y-auto space-y-1.5">
            {campos.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl bg-bg-main border border-border">
                <span className="text-[8px] font-black uppercase tracking-wider text-ink-muted shrink-0 pt-0.5">{rotulo}</span>
                <span className="text-[11px] font-bold text-ink text-right break-words min-w-0">{valor}</span>
              </div>
            ))}
            <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wide leading-relaxed px-1 pt-2">
              Copiar cria um item NOVO em {selectedUnit || 'esta unidade'} / {selectedLocation || 'este endereço'}. O registo de {a.filial || 'origem'} não é alterado nem movido.
            </p>
          </div>

          <div className="p-4 pt-2 space-y-2 shrink-0">
            <button
              onClick={() => handleCopyToNewItem(a)}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <FilePlus2 size={16} />
              <span>Copiar dados para novo item</span>
            </button>
            <button
              onClick={() => setFichaPreview(null)}
              className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              <span>Voltar</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
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
            endereco: result.address
          }));
        } catch (err) {
          logger.error('Erro ao obter endereço:', err);
          alert('Erro ao obter endereço automático.');
        } finally {
          setIsGeocoding(false);
        }
      },
      (err) => {
        logger.error('Erro GPS:', err);
        setIsGeocoding(false);
        alert('Erro GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleForceLocation = async () => {
    if (!selectedUnit) return;
    
    // v24.50: Agora sempre abre o mapa interativo para que o auditor defina a âncora
    // Eliminada a tela vermelha de contingência.
    if (window.pushScreen) {
      window.pushScreen(AppScreen.UNIT_CONFIGURATOR, { unitName: selectedUnit });
    } else {
      logger.error('pushScreen não disponível no Inventory.tsx');
    }
  };

  // SOBERANIA DE FILIAL: filial recuperada da session/local ou do prop.
  const activeFilialKey = useMemo(() => (
    localStorage.getItem('filial') || sessionStorage.getItem('filial') || selectedUnit || user?.filial || ''
  ).trim().toUpperCase(), [selectedUnit, user?.filial]);

  /**
   * Universo da tela: os ativos DO ENDEREÇO selecionado.
   * `assets` é o subconjunto indexado da unidade (pode vir vazio por campanha/sync);
   * `allAssets` é a base completa carregada — usada para completar, sem duplicar.
   * A chave de endereço é a mesma do AddressSelector (`_localMaster` vence `endereco`).
   */
  const addressAssets = useMemo(() => {
    if (!selectedLocation) return [] as Asset[];
    const target = normalizeKeyFast(selectedLocation);
    const seen = new Set<string>();
    const out: Asset[] = [];
    const push = (a: Asset) => {
      if (assetAddressKey(a) !== target) return;
      const id = String(a.id || a.primarykey || '');
      if (id) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      out.push(a);
    };
    for (const a of assets) push(a);
    for (const a of allAssets) push(a);
    return out;
  }, [assets, allAssets, selectedLocation]);

  const filteredAssets = useMemo(() => {
    if (!selectedLocation) return [];

    const term = normalizeKeyFast(committedSearch);
    const searchUpper = committedSearch.toUpperCase().trim();
    // Busca manual continua varrendo a unidade inteira (necessário para adoção e
    // busca global); sem termo, a lista é estritamente o endereço selecionado.
    const source = term ? (allAssets.length > 0 ? allAssets : assets) : addressAssets;
    const result: Asset[] = [];

    for (const a of source) {
      if (!belongsToUnit(a, activeFilialKey)) continue;

      const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';

      if (term) {
        const etq = normalizeKeyFast(a.etiqueta || '');
        const reg = normalizeKeyFast(a.registro || '');
        const descText = String(a.descricaodoativo || '').toUpperCase();
        if (!(etq === term || etq.includes(term) || reg === term || reg.includes(term) || descText.includes(searchUpper))) continue;
      } else {
        // Baixado não conferido não entra no giro (o hub só o conta quando localizado).
        const isBaixado = String(a.status || '').toUpperCase().includes('BAIXA') || !!a.databaixa;
        if (isBaixado && !isConferido) continue;
      }

      if (activeFilter === 'checked' ? isConferido : !isConferido) result.push(a);
    }

    return result.sort((a, b) => {
      if (activeFilter === 'checked') {
        const dateA = a._dataLeitura ? new Date(a._dataLeitura).getTime() : 0;
        const dateB = b._dataLeitura ? new Date(b._dataLeitura).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
      }

      const etqA = String(a.etiqueta || '').padStart(10, '0');
      const etqB = String(b.etiqueta || '').padStart(10, '0');
      return activeFilter === 'checked'
        ? etqB.localeCompare(etqA, undefined, { numeric: true })
        : etqA.localeCompare(etqB, undefined, { numeric: true });
    });
  }, [addressAssets, assets, allAssets, selectedLocation, committedSearch, activeFilter, activeFilialKey]);

  const isSearchResultBatch = useMemo(() => {
    if (!committedSearch || filteredAssets.length <= 1) return false;
    const pendingInSearch = filteredAssets.filter(a => !a._conferido);
    if (pendingInSearch.length <= 1) return false;
    
    const firstEtq = normalizeKey(pendingInSearch[0].etiqueta || "");
    if (!firstEtq || firstEtq === "ETIQUETAR") return false;
    
    return pendingInSearch.every(a => normalizeKey(a.etiqueta || "") === firstEtq);
  }, [committedSearch, filteredAssets]);

  // Progresso da localidade aberta (mesma regra do hub: baixados só contam se conferidos).
  const locationStats = useMemo(() => {
    if (!selectedLocation) return { total: 0, checked: 0 };
    let total = 0;
    let checked = 0;
    for (const a of addressAssets) {
      if (!belongsToUnit(a, activeFilialKey)) continue;
      const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
      const isBaixado = String(a.status || '').toUpperCase().includes('BAIXA') || !!a.databaixa;
      if (isBaixado && !isConferido) continue;
      if (!isBaixado) total++;
      if (isConferido) {
        checked++;
        if (isBaixado) total++;
      }
    }
    return { total, checked };
  }, [addressAssets, activeFilialKey, selectedLocation]);

  const locationProgress = locationStats.total > 0
    ? Math.round((locationStats.checked / locationStats.total) * 100)
    : 0;
  const pendingSearchCount = filteredAssets.filter(a => !a._conferido).length;

  /**
   * Leitura digitada e clique no item usam o MESMO modal de conferência em
   * lote (`batchGroup`): a barra do resultado da busca só monta o grupo e abre
   * a lista para o auditor ver e confirmar, em vez de conferir às cegas.
   */
  const handleConfirmSearchBatch = () => {
    const pendingInSearch = filteredAssets.filter(a => !a._conferido);
    if (pendingInSearch.length === 0) return;
    const grupo = findBatchGroup(pendingInSearch[0], allAssets, selectedUnit || activeFilialKey);
    const alvo = grupo.length >= 2 ? grupo : pendingInSearch;
    setBatchGroup(alvo);
    setBatchCheckedIds(new Set(alvo.map(a => String(a.id)).filter(Boolean)));
    setCommittedSearch('');
    setDisplayValue('');
  };

  /**
   * Leitura digitada: quando o código digitado forma lote (plaqueta ou registro
   * repetido), abre o modal automaticamente — antes o resultado só aparecia
   * como lista filtrada e o auditor tinha de conferir um a um.
   */
  useEffect(() => {
    const term = normalizeKeyFast(committedSearch || '');
    if (!term) return;
    const daUnidade = allAssets.filter(a => belongsToUnit(a, activeFilialKey));
    const alvo = daUnidade.find(a => {
      if (a._conferido) return false;
      const etq = normalizeKeyFast(a.etiqueta || '');
      const reg = normalizeKeyFast(a.registro || '');
      return etq === term || reg === term;
    });
    if (!alvo) return;
    const grupo = findBatchGroup(alvo, allAssets, selectedUnit || activeFilialKey);
    if (grupo.length < 2) return;
    setBatchGroup(grupo);
    setBatchCheckedIds(new Set(grupo.map(a => String(a.id)).filter(Boolean)));
  }, [committedSearch, allAssets, activeFilialKey, selectedUnit]);


  const handleMakeDecision = useCallback(async (id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;

    const asset = allAssets.find(a => String(a.id) === id);
    if (!asset) return;
    
    const etq = normalizeKey(asset.etiqueta || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedUnit || '');
    
    if (isBatch && etq && etq !== "ETIQUETAR") {
      // Restrito à UNIDADE ATUAL e STATUS ATIVO
      const related = allAssets.filter(a => {
        const sameEtq = normalizeKey(a.etiqueta || "") === etq;
        const sameComp = normalizeKey(a.filial || a._unitid || "") === currentCompKey;
        const sUpper = String(a.status || '').toUpperCase();
        const isNotB = !sUpper.includes('BAIXA') && !a.databaixa;
        return sameEtq && sameComp && isNotB && !a._conferido;
      });

      if (related.length > 1) {
        const ids = related.map(a => String(a.id));
        await onBulkUpdateAssets(ids);
        setDisplayValue('');
        return;
      }
    }
    
    // TAG de auditoria calculada e PERSISTIDA na conferência (Regras de Ouro).
    const auditLocation = selectedLocation || asset.endereco || '';
    const preservedTag = resolvePersistedTag(
      { ...asset, _conferido: true },
      auditLocation,
      selectedUnit
    );

    await handleUpdateAssetWithBackup({
      ...asset,
      _conferido: true,
      TAG_INVENTARIO: preservedTag,
      _localMaster: auditLocation
    });
    setDisplayValue('');
  }, [allAssets, handleUpdateAssetWithBackup, onBulkUpdateAssets, selectedUnit, selectedLocation]);

  const handleAssetClick = useCallback(async (asset: Asset) => {
    const currentCompKey = normalizeKey(selectedUnit || '');
    const assetCompKey = normalizeKey(asset.filial || asset._unitid || '');

    // BLOQUEIO DE SEGURANÇA: Se já foi conferido, mostra modal de duplicidade e impede abertura
    if (asset._conferido) {
      setDuplicateAsset(asset);
      return;
    }

    // CONFERÊNCIA EM LOTE PELA PLAQUETA (mesma regra da leitura digitada).
    // Antes dependia da coluna `TAG_DUPLICIDADE = 'ETIQUETA+1REGISTRO'` — que a
    // maioria das bases não traz — e exigia a mesma filial, então clicar nos
    // itens conferia um a um e os irmãos da plaqueta ficavam pendentes.
    // Agora: 2+ registros pendentes com a mesma plaqueta, em QUALQUER unidade,
    // abrem a lista para o auditor ver e confirmar. Agrupa também o item de
    // outra filial (antes ele era adotado direto, sem mostrar os irmãos).
    const grupoLote = findBatchGroup(asset, allAssets, selectedUnit || activeFilialKey);
    if (grupoLote.length >= 2) {
      setBatchGroup(grupoLote);
      setBatchCheckedIds(new Set(grupoLote.map(a => String(a.id)).filter(Boolean)));
      setCommittedSearch('');
      return;
    }

    // Regra C: bem de outra unidade NÃO é adotado automaticamente (ADOTADO
    // EXTERNO deixa de existir por padrão). Só se mostra a ficha em leitura,
    // de onde o auditor pode copiar os dados para um item novo desta unidade.
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      setFichaPreview(asset);
      return;
    }

    onSelectAsset(asset);
  }, [allAssets, onSelectAsset, selectedUnit, activeFilialKey]);

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
      try {
        await onBulkUpdateAssets(ids);
      } catch (err) {
        logger.error(">>> [Inventory] Erro na gravação de lote em massa:", err);
        alert(`Falha na atualização em lote de ativos selecionados: ${err instanceof Error ? err.message : String(err)}`);
      }
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

  const handleConfirmBatchGroup = async () => {
    // Sem endereço de inventário o App calcula a TAG contra o endereço de cada
    // item e o lote cairia como CONFERIDO no endereço de origem, em vez de
    // ADOTADO no endereço aberto. Melhor recusar do que gravar errado.
    if (!selectedLocation) {
      alert('Selecione o endereço do inventário antes de confirmar em lote.');
      return;
    }

    const selecionados = batchGroup.filter(a => batchCheckedIds.has(String(a.id)));
    if (selecionados.length === 0) {
      setBatchGroup([]);
      setBatchCheckedIds(new Set());
      return;
    }

    // O App (bulkUpdateAssets) grava a conferência no ENDEREÇO DO INVENTÁRIO
    // (`_localMaster`) e resolve a TAG: mesmo endereço → CONFERIDO; endereço
    // diferente → ADOTADO; outra unidade → ADOTADO EXTERNO. Aqui só se envia a
    // lista — nada de mexer no endereço de origem (senão o ADOTADO se perde).
    const ids = selecionados.map(a => String(a.id)).filter(Boolean);
    setIsBatchGroupSaving(true);
    try {
      await onBulkUpdateAssets(ids);
      setDisplayValue('');
      setCommittedSearch('');
    } catch (err) {
      logger.error(">>> [Inventory] Erro na conferência em lote da plaqueta:", err);
      alert(`Falha na conferência em lote: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBatchGroupSaving(false);
      setBatchGroup([]);
      setBatchCheckedIds(new Set());
    }
  };

  const handleCreateNew = () => {
    setManualAsset({
        etiqueta: committedSearch || "",
        filial: selectedUnit || "",
        status: "ATIVO",
        dataaqusic: new Date().toLocaleDateString('pt-BR'),
        AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
        qt: 1,
        descricaodoativo: '',
        serial: '',
        endereco: selectedLocation || ''
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
      logger.error('Erro no reconhecimento de voz:', event.error);
      setIsListening(null);
    };

    recognition.onend = () => {
      setIsListening(null);
    };

    recognition.start();
  };

  const saveManualEntry = () => {
    if (manualSerialConflicts.length > 0) return;
    const rawAsset: Asset = {
        ...manualAsset,
        id: generateUUID(),
        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
        _conferido: true,
        _isNew: true,
        // Item criado no aparelho: tem de subir, então nasce pendente.
        _is_synced: 0,
        currentCampaignId: currentCampaignId,
        _localMaster: selectedLocation || ""
    } as Asset;
    
    const newAsset = cleanAndCapitalizeAsset(rawAsset);
    
    handleUpdateAssetWithBackup(newAsset);
    setIsManualEntryOpen(false);
    setCommittedSearch('');
    setDisplayValue('');
    onSelectAsset(newAsset);
  };

 

  useEffect(() => {
    // Modo scanner persistido (reentrada no inventário): reabre a leitura.
    // A permissão da câmera é pedida pelo próprio Scanner — a pré-checagem com
    // getUserMedia abria um segundo stream e podia derrubar o start real.
    if (isInventorying && searchMode === InventorySearchMode.SCANNER) {
      setIsScannerOpen(true);
    }
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
                        <p className="text-xl font-black text-ink font-mono">{duplicateAsset.etiqueta}</p>
                        <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{duplicateAsset.descricaodoativo}</p>
                        <div className="mt-3 pt-3 border-t border-accent/10 flex items-center justify-between">
                          <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Local do Registro:</span>
                          <span className={`text-[9px] font-black uppercase ${isSameLocation ? 'text-success' : 'text-warning'}`}>
                            {duplicateAsset._localMaster || duplicateAsset.endereco}
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

      {/* Modal de Conferência em Lote — plaqueta OU registro repetido (clique e leitura) */}
      {batchGroup.length > 0 && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[2rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn flex flex-col max-h-[90vh]">
            <button
              onClick={() => { setBatchGroup([]); setBatchCheckedIds(new Set()); }}
              className="absolute top-3 right-3 z-10 p-2 rounded-full text-ink-muted hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="bg-accent p-5 text-white">
              <div className="flex items-center gap-2">
                <CheckSquare size={18} />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/70">{batchLabel(batchGroup).titulo} — conferência em lote</span>
              </div>
              <h3 className="text-xl font-black uppercase italic tracking-tighter leading-none mt-1">
                {batchLabel(batchGroup).subtitulo || 'Lote'}
              </h3>
              <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mt-2">
                {batchGroup.length} registros · {splitByAddress(batchGroup, selectedLocation).outroEndereco.length} de outro endereço
              </p>
            </div>

            <div className="p-4 overflow-y-auto space-y-2">
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wide leading-relaxed px-1">
                Marque só os itens fisicamente conferidos. O item de outro endereço é registado no endereço do inventário ao confirmar (ADOTADO).
              </p>
              {batchGroup.map(item => {
                const id = String(item.id);
                const enderecoInventario = normalizeKey(selectedLocation || '');
                const outroEndereco = !!enderecoInventario && addressKey(item) !== enderecoInventario;
                return (
                  <label
                    key={id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border bg-bg-main cursor-pointer active:scale-[0.995] transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={batchCheckedIds.has(id)}
                      onChange={() => setBatchCheckedIds(prev => {
                        const novo = new Set(prev);
                        if (novo.has(id)) novo.delete(id); else novo.add(id);
                        return novo;
                      })}
                      className="mt-1 w-4 h-4 accent-[color:var(--accent,#0f766e)] shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] font-black text-ink font-mono truncate">{item.etiqueta || '—'} · {String(item.registro || id)}</span>
                      <span className="block text-[10px] font-bold text-ink-muted leading-snug line-clamp-2">{item.descricaodoativo || 'Sem descrição'}</span>
                      <span className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[8px] font-black uppercase tracking-wider text-ink-muted">{item.filial || 'SEM UNIDADE'}</span>
                        {item.endereco && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-ink-muted">· {item.endereco}</span>
                        )}
                        {outroEndereco && (
                          <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">Outro endereço · ADOTADO</span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="p-4 border-t border-border flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setBatchGroup([]); setBatchCheckedIds(new Set()); }}
                className="flex-1 py-3.5 rounded-xl border border-border text-ink-muted font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchGroup}
                disabled={isBatchGroupSaving || batchCheckedIds.size === 0}
                className="flex-1 py-3.5 rounded-xl bg-success text-white font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isBatchGroupSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
                Conferir {batchCheckedIds.size}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isSettingsOpen && (
        <PreferencesPanel
          onClose={() => setIsSettingsOpen(false)}
          autoConfirmOnScan={autoConfirmOnScan}
          onUpdateAutoConfirm={onUpdateAutoConfirm}
          scanFeedbackMode={scanFeedbackMode}
          onUpdateScanFeedbackMode={onUpdateScanFeedbackMode}
          scannerMode={scannerMode}
          onUpdateScannerMode={onUpdateScannerMode}
          darkMode={darkMode}
          onUpdateDarkMode={onUpdateDarkMode}
          batterySaver={batterySaver}
          onUpdateBatterySaver={onUpdateBatterySaver}
          contextLabel={selectedLocation || selectedUnit || undefined}
        />
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
                {(normalizeKey(scannedAsset.filial || scannedAsset._unitid || '') !== normalizeKey(selectedUnit || '') || 
                  normalizeKey(scannedAsset._localMaster || scannedAsset.endereco || '') !== normalizeKey(selectedLocation || '')) && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center space-x-2 text-amber-700">
                      <MapPin size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Local de Origem (Base)</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-700 uppercase">
                        {scannedAsset.filial || 'Unidade não informada'}
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium uppercase italic">
                        {scannedAsset.endereco || 'Endereço não informado'}
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
                  <p className={`text-xl font-black font-mono ${scannedAsset._is_divergent_baixa ? 'text-red-700' : 'text-ink'}`}>{scannedAsset.etiqueta}</p>
                  <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{scannedAsset.descricaodoativo}</p>
                </div>

                {scannedAsset._is_divergent_baixa && (
                  <div className="p-3 bg-red-600 text-white rounded-xl flex items-center space-x-3 animate-pulse">
                    <AlertTriangle size={20} />
                    <p className="text-[9px] font-black uppercase tracking-tight leading-tight">
                      Atenção: Este item consta como ATIVO mas possui DATA DE BAIXA ({scannedAsset.databaixa}). Proceda com cautela.
                    </p>
                  </div>
                )}

                <div className="flex space-x-3 pt-2">
                  <button 
                    disabled={isPersistingScan}
                    onClick={() => setScannedAsset(null)} 
                    className="flex-1 py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                  <button 
                    disabled={isPersistingScan}
                    onClick={async () => {
                      if (isPersistingScan) return;
                      setIsPersistingScan(true);
                      try {
                        const assetCompKey = normalizeKey(scannedAsset.filial || scannedAsset._unitid || '');
                        const currentCompKey = normalizeKey(selectedUnit || '');

                        const auditLoc = selectedLocation || scannedAsset.endereco || '';
                        const auditTag = resolvePersistedTag(
                          { ...scannedAsset, _conferido: true },
                          auditLoc,
                          selectedUnit
                        );
                        const updatedAsset: Asset = {
                          ...scannedAsset,
                          ...(assetCompKey !== "" && assetCompKey !== currentCompKey
                            ? { filial: selectedUnit || scannedAsset.filial }
                            : {}),
                          _conferido: true,
                          ...(String(scannedAsset.status || '').toUpperCase().includes('BAIXA') || scannedAsset.databaixa
                            ? {}
                            : { status: 'CONFERIDO' }),
                          TAG_INVENTARIO: auditTag,
                          _localMaster: auditLoc,
                          _is_synced: 0
                        };

                        const cleanAsset = cleanAndCapitalizeAsset(updatedAsset);
                        await handleUpdateAssetWithBackup(cleanAsset);
                        setScannedAsset(null);
                        setCommittedSearch('');
                        setDisplayValue('');
                        onSelectAsset(cleanAsset); // Abre detalhes para foto
                      } catch (err) {
                        logger.error('>>> Erro na persistência de ativo com foto:', err);
                        alert('Falha crítica na persistência: ' + (err instanceof Error ? err.message : String(err)));
                      } finally {
                        setIsPersistingScan(false);
                      }
                    }} 
                    className="flex-1 py-4 bg-emerald-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex flex-col items-center justify-center leading-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Camera size={14} className="mb-1" />
                    <span>Confirmar + Foto</span>
                  </button>
                  <button 
                    disabled={isPersistingScan}
                    onClick={async () => {
                      if (isPersistingScan) return;
                      setIsPersistingScan(true);
                      try {
                        const assetCompKey = normalizeKey(scannedAsset.filial || scannedAsset._unitid || '');
                        const currentCompKey = normalizeKey(selectedUnit || '');

                        const auditLoc = selectedLocation || scannedAsset.endereco || '';
                        const auditTag = resolvePersistedTag(
                          { ...scannedAsset, _conferido: true },
                          auditLoc,
                          selectedUnit
                        );
                        const updatedAsset: Asset = {
                          ...scannedAsset,
                          ...(assetCompKey !== "" && assetCompKey !== currentCompKey
                            ? { filial: selectedUnit || scannedAsset.filial }
                            : {}),
                          _conferido: true,
                          ...(String(scannedAsset.status || '').toUpperCase().includes('BAIXA') || scannedAsset.databaixa
                            ? {}
                            : { status: 'CONFERIDO' }),
                          TAG_INVENTARIO: auditTag,
                          _localMaster: auditLoc,
                          _is_synced: 0
                        };
                        
                        const cleanAsset = cleanAndCapitalizeAsset(updatedAsset);
                        await handleUpdateAssetWithBackup(cleanAsset);
                        setScannedAsset(null);
                        setCommittedSearch('');
                        setDisplayValue('');
                      } catch (err) {
                        logger.error('>>> Erro na persistência síncrona de ativo:', err);
                        alert('Falha crítica na persistência: ' + (err instanceof Error ? err.message : String(err)));
                      } finally {
                        setIsPersistingScan(false);
                      }
                    }} 
                    className="flex-1 py-4 bg-accent text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all flex flex-col items-center justify-center leading-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                        etiqueta: scannedResult,
                        filial: selectedUnit || "",
                        status: "ATIVO",
                        dataaqusic: new Date().toLocaleDateString('pt-BR'),
                        AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
                        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
                        qt: 1,
                        descricaodoativo: '',
                        serial: '',
                        endereco: selectedLocation || ''
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

  if (!isDbReady) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-900 text-emerald-400 font-mono p-6">
        <div className="text-center space-y-4">
          <div className="text-2xl font-black uppercase tracking-tight animate-pulse">⚙️ RE-INICIALIZANDO SISTEMA GBR</div>
          <p className="text-xs text-slate-400 max-w-xs uppercase tracking-widest leading-relaxed">
            Soberania Nativa Ativa: Aguardando reestabelecimento seguro do motor primordial SQLite MemoryDb-Engine...
          </p>
          <div className="w-16 h-1 mx-auto bg-emerald-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      {sreNotification && (
        <div className={`mx-6 mt-4 p-4 rounded-2xl border flex items-start space-x-3 shadow-lg transition-all animate-slideDown z-[11000] relative shrink-0 ${
          sreNotification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          sreNotification.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
          sreNotification.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="shrink-0 mt-0.5">
            {sreNotification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            {sreNotification.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
            {sreNotification.type === 'error' && <ShieldAlert className="w-5 h-5 text-rose-600" />}
            {sreNotification.type === 'info' && <Database className="w-5 h-5 text-blue-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight">{sreNotification.message}</p>
            {sreNotification.subText && <p className="text-xs text-slate-500 mt-1 font-mono leading-tight">{sreNotification.subText}</p>}
          </div>
          <button onClick={() => setSreNotification(null)} className="shrink-0 p-1 hover:bg-black/5 rounded-lg active:scale-90">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}
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
            {/* Banner Offline Sutil e Buffer Atômico */}
            {databaseMode === 'INTERNAL' && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl flex items-center space-x-3 mb-2">
                  <WifiOff size={14} className="text-amber-600" />
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Modo Offline Ativo</p>
                </div>
                <BufferIndicator />
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
              
                const isBypass = isAdminEmail(user?.email);
                const isDisabled = !unitConfig && !isBypass;
              
                return (
                  <button 
                    key={loc.locKey} 
                    disabled={isDisabled}
                    onClick={() => { 
                      setSelectedLocation(loc.displayName); 
                      setIsInventorying(true); 
                      if (immersiveMode && !document.fullscreenElement) {
                        onToggleFullscreen();
                      }
                    }} 
                    className={`w-full bg-white rounded-[16px] p-4 active:scale-[0.98] transition-all flex flex-col shadow-[0_2px_15px_rgba(0,0,0,0.05)] border-none relative overflow-hidden group ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
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
            {(() => {
              const isBypass = isAdminEmail(user?.email);
              const isDisabled = !unitConfig && !isBypass;
              return (
                <button 
                  disabled={isDisabled}
                  onClick={() => setIsNewLocationModalOpen(true)} 
                  className={`pointer-events-auto h-14 px-8 rounded-full flex items-center justify-center space-x-3 font-bold uppercase text-xs tracking-widest active:scale-95 transition-all shadow-xl shadow-blue-500/20 ${isDisabled ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#2563EB] text-white'}`}
                >
                  <Plus size={20} strokeWidth={3} />
                  <span>Nova Localidade</span>
                </button>
              );
            })()}
          </div>
        </div>
      ) : (
        <React.Fragment>
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Endereço e progresso sobem para cima da barra de comandos: bypass →
          endereço → progresso → busca, que fecha a seção do topo. */}
      <div className="bg-white px-6 pt-3 pb-2 shrink-0 space-y-2.5">
        {/* Endereço — uma única linha: o texto completo rola em marquee
            em vez de ser truncado (antes repetia-se em duas linhas). */}
        <div className="flex items-center bg-slate-50/50 p-2 rounded-2xl border border-slate-100">
          <div className="flex-1 min-w-0 px-2 flex items-center space-x-2">
            <MapPin size={12} className={currentSelectedAddress ? "text-accent shrink-0" : "text-slate-400 shrink-0"} />
            <span className="text-[7.5px] font-black text-accent uppercase tracking-widest leading-none shrink-0 select-none">Endereço:</span>
            <Marquee className="flex-1 min-w-0" speed={38}>
              <span className="text-[9px] font-extrabold text-slate-700 uppercase tracking-tight whitespace-nowrap">
                {currentSelectedAddress || selectedLocation || 'TODAS AS LOCALIDADES'}
              </span>
            </Marquee>
          </div>
        </div>

        {/* Progresso da localidade */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#64748B]">Conferidos</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#1E293B]">
              {locationStats.checked} / {locationStats.total} · {locationProgress}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${locationProgress === 100 ? 'bg-emerald-500' : 'bg-accent'}`}
              style={{ width: `${locationProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Header Fixo Blindado */}
      <div className="bg-white border-b border-slate-100 px-3 py-3 sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center shrink-0 group"
            title="Voltar ao inventário"
          >
            <div className="p-2.5 bg-slate-50 text-slate-800 rounded-xl group-active:scale-90 transition-all border border-slate-100 shadow-sm">
              <ArrowLeft size={18} strokeWidth={3} />
            </div>
            {/* Texto só em telas largas: no telemóvel o espaço é da consulta. */}
            <div className="hidden sm:block text-left ml-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Voltar</p>
              <p className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">Inventário</p>
            </div>
          </button>

          {/* CONSULTA POR ETIQUETA — na mesma linha dos ícones */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
              <Search size={14} className="text-[#94A3B8]" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              disabled={isPersistingScan}
              onChange={(e) => setDisplayValue(e.target.value.toUpperCase())}
              value={displayValue}
              className="w-full bg-[#F8FAFC] border border-[#F1F5F9] pl-8 pr-9 py-2.5 font-mono text-[13px] font-bold rounded-xl text-[#1E293B] outline-none focus:border-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={isPersistingScan ? "GRAVANDO..." : "ETIQUETA"}
              aria-label="Consultar por etiqueta"
            />
            <div className="absolute inset-y-0 right-1 flex items-center">
              {displayValue && (
                <button
                  onClick={() => { setDisplayValue(''); setCommittedSearch(''); }}
                  className="p-1.5 text-[#64748B] hover:bg-white rounded-lg transition-all"
                  title="Limpar consulta"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {isBatchMode && (
              <button
                onClick={toggleSelectAll}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? 'bg-accent text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                title="Selecionar todos"
              >
                {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
            )}

            <button
              onClick={() => {
                const next = !isBatchMode;
                setIsBatchMode(next);
                if (!next) setSelectedIds(new Set());
              }}
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${isBatchMode ? 'bg-accent text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
              title={isBatchMode ? 'Sair do modo lote' : 'Modo lote'}
            >
              <CheckSquare size={18} />
            </button>

            <button
              onClick={onOpenConsultation}
              className="w-9 h-9 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
              title="Consulta de ativos"
            >
              <Database size={18} />
            </button>

            <button
              onClick={handleScannerOpen}
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${searchMode === InventorySearchMode.SCANNER ? 'bg-accent text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Leitor de código de barras / QR"
            >
              <Camera size={18} />
            </button>

            {/* Ajustes de campo: preferências de leitura, conferência e energia */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 transition-colors"
              title="Ajustes de campo"
              aria-label="Abrir ajustes de campo"
            >
              <Settings2 size={18} />
              {!autoConfirmOnScan && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="bg-white px-6 py-3 border-b border-slate-50 shrink-0">
          <div className="space-y-3">
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

            {isSearchResultBatch && (
              <button
                type="button"
                onClick={handleConfirmSearchBatch}
                className="w-full py-3 rounded-xl bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <CheckSquare size={14} />
                Conferir os {pendingSearchCount} registros do resultado
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 bg-bg-main relative min-h-0">
          {filteredAssets.length > 0 ? (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              data={filteredAssets}
              increaseViewportBy={300}
              rangeChanged={handleRangeChanged}
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
            <div className="py-24 flex flex-col items-center justify-center text-center px-8">
              <Search size={64} className="mb-6 text-ink-muted opacity-30" />
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-muted opacity-60 text-center">
                {activeFilter === 'checked'
                  ? 'Nenhum ativo conferido neste endereço'
                  : 'Nenhum ativo pendente neste endereço'}
              </p>
              {selectedLocation && (
                <p className="mt-2 mb-1 max-w-[16rem] truncate text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {selectedLocation}
                </p>
              )}
              {committedSearch && (
                <div className="mt-6 w-full max-w-xs space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">
                    Nenhum ativo para “{committedSearch}”
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    className="w-full py-3.5 rounded-xl bg-accent text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <FilePlus2 size={14} />
                    Incluir novo registro
                  </button>
                  {/* NÃO LOCALIZADO: nada é adotado de outra unidade. A busca só
                      abre a Ficha do Ativo em leitura, de onde o auditor copia os
                      dados para um item novo DESTA unidade — ou volta ao formulário. */}
                  <button
                    type="button"
                    onClick={() => setShowGlobalSearchResolution(committedSearch)}
                    className="w-full py-3.5 rounded-xl bg-slate-950 text-amber-300 border border-amber-400 font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Database size={14} />
                    Pesquisar em outras Unidades
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barra de ação: progresso + encerramento (ou confirmação em lote) */}
      {!isBatchMode ? (
        <div className="bg-white border-t border-slate-100 px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-[#64748B]">Conferidos no local</p>
            <p className="text-sm font-black text-[#1E293B] leading-tight">
              {locationStats.checked}
              <span className="text-slate-400"> / {locationStats.total}</span>
              <span className="ml-2 text-[10px] font-black text-accent">{locationProgress}%</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSignature}
            className="px-5 py-3 rounded-xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <CheckCircle2 size={14} />
            Finalizar lote
          </button>
        </div>
      ) : (
        <div className="bg-slate-900 px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Modo lote</p>
            <p className="text-sm font-black text-white leading-tight">
              {selectedIds.size} <span className="text-white/40">selecionado(s)</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setIsBatchMode(false); setSelectedIds(new Set()); }}
            className="px-4 py-3 rounded-xl bg-white/10 text-white font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleBatchConfirm}
            disabled={selectedIds.size === 0}
            className="px-5 py-3 rounded-xl bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} />
            Conferir
          </button>
        </div>
      )}

      <footer className="bg-slate-900 px-6 py-2 text-center border-t border-white/5 shrink-0">
        <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">Inventariador GBR v2.6 • MOBILE SOBERANO</p>
      </footer>

      </div>
        </React.Fragment>
      )}

      {/* Modal de Inclusão Manual removido daqui pois estava duplicado */}

      {/* Scanner Full-Screen */}
      {isScannerOpen && (
        <Scanner 
          mode={scannerMode}
          onModeChange={onUpdateScannerMode}
          onScan={handleScan}
          onClose={closeScannerForTyping}
          isPaused={isScannerPaused || isThermalBlocked || isCoolingDown || !!(scannedAsset || scannedResult || duplicateAsset || showGlobalSearchResolution)}
          scanFeedbackMode={scanFeedbackMode}
          batterySaver={batterySaver}
          torch={torch}
          onTorchToggle={() => setTorch(torch === 'on' ? 'off' : 'on')}
          onManualInput={closeScannerForTyping}
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
            // O contêiner de children do Scanner é pointer-events-none para não
            // bloquear os controles da câmera; sem pointer-events-auto aqui o
            // botão RETOMAR não recebia o clique e a tela ficava travada em
            // standby (o scanner pausado nunca reseta sozinho).
            <div
              onClick={resetActivity}
              className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl p-8 rounded-[2.5rem] text-white text-center border border-white/10 shadow-2xl"
            >
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
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center space-x-2 z-50">              <div className={`px-4 py-2 backdrop-blur-md rounded-full flex items-center space-x-3 shadow-2xl border border-white/20 ${isScannerPaused ? 'bg-amber-500/80' : 'bg-success/80'}`}>
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
                <span className="text-xs font-black text-white uppercase tracking-[0.2em]">
                  {isScannerPaused ? 'Scanner Pausado' : 'Scanner Ativo'}
                </span>
              </div>
          </div>
        </Scanner>
      )}

      {/* Modais de Confirmação e Erro de Leitura */}
      {renderConfirmationModals()}

      {renderHierarchyResolutionModals()}
      {renderFichaPreview()}

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
                  list="locais-cadastrados"
                  className="w-full bg-bg-main border border-border p-4 rounded-2xl text-sm font-bold text-ink outline-none focus:border-accent transition-all"
                  placeholder="EX: SALA 101, ALMOXARIFADO..."
                  autoFocus
                />
                {/* Inteligência de sugestão: reaproveitar endereços já existentes
                    evita variações de escrita ("ADM" × "ADMINISTRACAO"). */}
                <datalist id="locais-cadastrados">
                  {dbLocations.map(loc => (
                    <option key={loc.locKey} value={loc.displayName} />
                  ))}
                </datalist>
                {dbLocations.length > 0 && (
                  <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wide ml-1">
                    {dbLocations.length} endereço(s) já cadastrado(s) — toque para reaproveitar.
                  </p>
                )}
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
                 <QRCodeSVG value={qrModalData || String(qrModalAsset.etiqueta || qrModalAsset.id || '')} size={180} />
               </div>
               <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter leading-none mb-1">{qrModalAsset.etiqueta}</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{qrModalAsset.descricaodoativo}</p>
               {/* Campos definidos em "Configurar QR Code" — o que está no QR. */}
               {qrModalFieldValues.some(item => item.field.toUpperCase() !== 'ETIQUETA') && (
                 <div className="mt-4 w-full space-y-1.5 text-left">
                   {qrModalFieldValues
                     .filter(item => item.field.toUpperCase() !== 'ETIQUETA')
                     .map(item => (
                       <div key={item.field} className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-1">
                         <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 shrink-0">{item.field}</span>
                         <span className="text-[10px] font-bold text-slate-700 text-right break-words min-w-0">{item.value}</span>
                       </div>
                     ))}
                 </div>
               )}
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
                  <p className="text-xl font-black text-ink font-mono">{scannedAsset.etiqueta}</p>
                  <p className="text-[10px] font-bold text-ink-muted mt-1 uppercase leading-tight line-clamp-2">{scannedAsset.descricaodoativo}</p>
                </div>

                <div className="pt-3 border-t border-accent/10 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="text-[7px] font-black text-ink-muted uppercase tracking-widest">Local de Origem</span>
                      <span className="text-[9px] font-black text-amber-600 uppercase">
                        {scannedAsset._localMaster || scannedAsset.endereco || 'NÃO DEFINIDO'}
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

                  {normalizeKey(scannedAsset.filial || scannedAsset._unitid || '') !== normalizeKey(selectedUnit || '') && (
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
                    const assetCompKey = normalizeKey(scannedAsset.filial || scannedAsset._unitid || '');
                    const currentCompKey = normalizeKey(selectedUnit || '');
                    
                    const auditLoc = selectedLocation || scannedAsset.endereco || '';
                    const auditTag = resolvePersistedTag(
                      { ...scannedAsset, _conferido: true },
                      auditLoc,
                      selectedUnit
                    );
                    const updatedAsset: Asset = {
                      ...scannedAsset,
                      ...(assetCompKey !== "" && assetCompKey !== currentCompKey
                        ? { filial: selectedUnit || scannedAsset.filial }
                        : {}),
                      _conferido: true,
                      TAG_INVENTARIO: auditTag,
                      _localMaster: auditLoc
                    };
                    
                    const cleanAsset = cleanAndCapitalizeAsset(updatedAsset);
                    handleUpdateAssetWithBackup(cleanAsset);
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
                      etiqueta: scannedResult,
                      filial: selectedUnit || "",
                      status: "ATIVO",
                      dataaqusic: new Date().toLocaleDateString('pt-BR'),
                      AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
                      TAG_INVENTARIO: TagInventario.NOVO_ITEM,
                      qt: 1,
                      descricaodoativo: '',
                      serial: ''
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
                  onClick={() => {
                    const codigo = scannedResult;
                    setScannedResult(null);
                    setCommittedSearch('');
                    setDisplayValue('');
                    if (codigo) setShowGlobalSearchResolution(codigo);
                  }}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20"
                >
                  <Search size={16} />
                  <span>Pesquisar em outras Unidades</span>
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
                        value={manualAsset.etiqueta || ''} 
                        onChange={(e) => setManualAsset(prev => ({...prev, etiqueta: e.target.value.toUpperCase()}))}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 pr-12 text-ink font-black font-mono text-lg outline-none focus:border-accent"
                      />
                      <button 
                        onClick={() => handleVoiceTyping('etiqueta')}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${isListening === 'etiqueta' ? 'bg-danger text-white animate-pulse' : 'bg-white text-accent shadow-sm'}`}
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
                        value={manualAsset.descricaodoativo || ''} 
                        onChange={(e) => setManualAsset(prev => ({...prev, descricaodoativo: e.target.value.toUpperCase()}))}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 pr-12 text-ink font-bold text-xs outline-none focus:border-accent uppercase"
                        placeholder="DESCREVA O BEM..."
                      />
                      <button 
                        onClick={() => handleVoiceTyping('descricaodoativo')}
                        className={`absolute right-2 top-2 p-2 rounded-lg transition-all ${isListening === 'descricaodoativo' ? 'bg-danger text-white animate-pulse' : 'bg-white text-accent shadow-sm'}`}
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
                          value={manualAsset.serial || ''} 
                          onChange={(e) => setManualAsset(prev => ({...prev, serial: e.target.value.toUpperCase()}))}
                          className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 pr-12 text-ink font-bold text-xs outline-none focus:border-accent"
                        />
                        <button 
                          onClick={() => handleVoiceTyping('serial')}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${isListening === 'serial' ? 'bg-danger text-white animate-pulse' : 'bg-white text-accent shadow-sm'}`}
                        >
                          <Mic size={18} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Quantidade</label>
                      <input 
                        type="number" 
                        value={manualAsset.qt || 1} 
                        onChange={(e) => setManualAsset(prev => ({...prev, qt: Number(e.target.value) || 1}))}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 text-ink font-bold text-xs outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  {manualSerialConflicts.length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl animate-fadeIn">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={12} className="text-red-600 shrink-0" />
                        <span className="text-[9px] font-black text-red-700 uppercase tracking-widest">Serial duplicado na base</span>
                      </div>
                      <p className="text-[10px] font-bold text-red-600 leading-snug break-words">
                        {manualSerialConflicts.slice(0, 3).map(a =>
                          `${formatEtiqueta(a.etiqueta)}${a.filial ? ` · ${a.filial}` : ''}`
                        ).join(' | ')}
                        {manualSerialConflicts.length > 3 && ` +${manualSerialConflicts.length - 3}`}
                      </p>
                      <p className="text-[9px] text-red-500 font-bold uppercase mt-1">
                        Corrija o serial ou confira o registro existente antes de salvar.
                      </p>
                    </div>
                  )}
                  <div className="p-4 bg-accent-soft border border-accent/10 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Unidade Operacional:</span>
                      <span className="text-[9px] font-black text-accent uppercase">{manualAsset.filial}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Local:</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-black text-accent uppercase">{manualAsset.endereco}</span>
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
                  {manualAsset._copiadoDe && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                      <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
                        Dados copiados de {manualAsset._copiadoDe}
                      </p>
                      <p className="text-[9px] font-bold text-blue-600 leading-snug mt-1">
                        {manualAsset._copiadoDeEtiqueta ? `Plaqueta ${manualAsset._copiadoDeEtiqueta}. ` : ''}
                        O registo de origem não foi alterado. Confira descrição, série e quantidade antes de salvar.
                      </p>
                      {manualAsset.rad_recno && (
                        <p className="text-[8px] font-bold text-blue-500 uppercase tracking-wider mt-1">
                          Registro adotado {String(manualAsset.rad_recno)} · sub {String(manualAsset.subreg || '0001')}
                          {manualAsset._copiadoDeRegistro ? ` · origem ${manualAsset._copiadoDeRegistro}` : ''}
                        </p>
                      )}
                    </div>
                  )}
               </div>
            </div>

            <div className="p-8 bg-white border-t border-accent/10 shrink-0 sticky bottom-0">
               <button 
                 onClick={saveManualEntry}
                 disabled={manualSerialConflicts.length > 0}
                 className="w-full bg-accent text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all shadow-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
               >
                 {manualSerialConflicts.length > 0 ? 'Serial duplicado — corrija para salvar' : 'Salvar e Conferir'}
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
