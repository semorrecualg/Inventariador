import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Search, 
  LayoutGrid, 
  Factory, 
  Landmark, 
  Warehouse, 
  Building, 
  RefreshCw, 
  Cloud, 
  Navigation as NavigationIcon,
  Database,
  Calendar,
  ChevronRight,
  SlidersHorizontal,
  DatabaseZap,
  Settings,
  ListChecks
} from 'lucide-react';
import BackButton from './BackButton';
import { AppScreen, DatabaseMode, NavigationParams, UnitConfig } from '../types';
import * as turf from '@turf/turf';
import { localDb, readVirtualSnapshot } from '../services/localDbService';
import { resolveTenantId } from '../utils/tenantUtils';
import { findHomonymUnits } from '../utils/unitContextUtils';
import { isAdminEmail } from '../utils/authUtils';
import { db } from '../services/sqliteService';
import { logger } from '../utils/logger';
import type { DexieAsset } from '../services/sqliteService';

interface UnitSelectorProps {
  units: Array<{ 
    filial: string; // Unified GBR v2.6 filial field
    tenantid?: string; // Muro multi-tenant: contrato da unidade (chave composta)
    hasData: boolean; 
    isDownloaded?: boolean; 
    hasCampaign?: boolean;
    hasGps?: boolean;
    assetCount?: number;
  }>;
  onSelect: (unit: string, tenantid?: string) => void;
  onBack: () => void;
  onSync?: () => void;
  onConfigGPS?: (unit: string) => void;
  onCampaigns?: (unit: string) => void;
  onLoadDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string | null;
  isAdmin?: boolean;
  isAuditor?: boolean;
  databaseMode?: DatabaseMode;
  isImportingBatch?: boolean; // UX v2.6 Isolated state
  onForceToggleView?: () => void;
  /** Navegação para o MainMenu com painel pré-aberto (tool grid da Unidade Operacional). */
  onNavigate?: (target: AppScreen, params?: NavigationParams) => void;
}

interface SqliteUnitStats {
  filial: string;
  displayName: string;
  tenantid: string;
  total: number;
  checked: number;
}

const UnitSelector: React.FC<UnitSelectorProps> = ({ 
  units, 
  onSelect, 
  onBack, 
  onSync, 
  onConfigGPS, 
  onCampaigns, 
  onLoadDatabase, 
  isSyncing, 
  isAdmin, 
  isAuditor = false, 
  databaseMode,
  isImportingBatch = false,
  onForceToggleView,
  onNavigate
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  // Total de ativos das unidades listadas (fallback do indicador da tool grid).
  const totalAssets = units.reduce((acc, u) => acc + (Number(u.assetCount) || 0), 0);
  // Total GERAL da base local (modo INTERNAL/SQLite): soma de todas as filiais
  // reais encontradas no banco local (escopadas ao contrato ativo), em vez de
  // apenas as unidades listadas na tela.
  const [localTotalAssets, setLocalTotalAssets] = useState<number | null>(null);
  const displayTotalAssets = localTotalAssets ?? totalAssets;
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activeUnitConfigs, setActiveUnitConfigs] = useState<UnitConfig[]>([]);
  const [sqliteUnits, setSqliteUnits] = useState<SqliteUnitStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // 1. Carrega as configurações de geocerca salvas no IndexedDB (SQLite configs extraídas)
  useEffect(() => {
    let active = true;
    const loadConfigs = async () => {
      try {
        const configs = await localDb.unitConfigs.toArray();
        if (active) {
          setActiveUnitConfigs(configs || []);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(">>> [UnitSelector] Erro ao carregar configurações de GPS do banco:", errMsg);
      }
    };
    loadConfigs();
    return () => { active = false; };
  }, []);

  // 2. Carrega as estatísticas do SQLite local e funde com as unidades recebidas por prop
  useEffect(() => {
    let active = true;
    const fetchSqliteUnits = async () => {
      setLocalTotalAssets(null);
      setStatsLoading(databaseMode === DatabaseMode.INTERNAL);
      try {
        if (databaseMode === DatabaseMode.INTERNAL) {
          let tenantid: string | undefined;
          try {
            const storedUser = sessionStorage.getItem('app_current_user');
            if (storedUser) {
              const parsedUser = JSON.parse(storedUser) as { tenantid?: string };
              tenantid = resolveTenantId(parsedUser) || undefined;
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.warn('[UnitSelector] Falha ao ler tenantid do sessionStorage:', errMsg);
          }
          
          const currentTenantid = tenantid? tenantid.trim().toUpperCase() : '';
          
          // Fallback Seguro: Usa .filter() na fluent API do Dexie pois tenantid isolado não é um índice no schema atual v2.
          // Isso garante a extração limpa para o currentTenantid e atende o requisito SRE.
          let allAssets = await db.local_assets
            .filter(item => {
              const tId = String(resolveTenantId(item) || '').trim().toUpperCase();
              return !currentTenantid || tId === currentTenantid;
            })
            .toArray();
            
          const isIframe = typeof window !== 'undefined' && window.self !== window.top;
          if (allAssets.length === 0 && isIframe) {
            const virtualData = await readVirtualSnapshot();
            if (virtualData && virtualData.length > 0) {
              allAssets = virtualData.map((row: unknown) => {
                const r = row as Record<string, unknown>;
                return {
                  id: String(r.primarykey || r.id || ''),
                  primarykey: String(r.primarykey || r.id || ''),
                  tenantid: String(resolveTenantId(r) || 'GBR_DEFAULT'),
                  filial: String(r.filial || r._unitid || 'FILIAL_DEFAULT'),
                  status: String(r.status || 'Pendente'),
                  _conferido: Number(r._conferido ?? 0),
                  _is_deleted: Number(r._is_deleted ?? 0)
                } as unknown as DexieAsset;
              });
            }
          }
            
          const nonDeleted = allAssets.filter(a => a._is_deleted === 0);
          const filiaisAssets = Array.from(new Set(nonDeleted.map(a => String(a.filial)).filter(f => f && f.trim() !== '')));
          
          const configList = await db.unit_configs.toArray();
          const filiaisConfigs = configList.map(c => String(c.filial || c.nome)).filter(f => f && f.trim() !== '');
          
          // A regra de ouro (Soberania da Filial): Inclui todas as filiais vindas via props (que vieram do cloud/sessão),
          // mais as que possuem ativos locais, mais as que possuem GPS configurado.
          const propsFiliais = units.map(u => String(u.filial).toUpperCase().trim()).filter(f => f !== '');
          
          const allFiliais = Array.from(new Set([
            ...propsFiliais,
            ...filiaisAssets.map(f => f.toUpperCase().trim()), 
            ...filiaisConfigs.map(f => f.toUpperCase().trim())
          ]));
          
          const mapped: SqliteUnitStats[] = allFiliais.map(f => {
            const filialAssets = nonDeleted.filter(a => String(a.filial || '').toUpperCase().trim() === f);
            const checkedAssets = filialAssets.filter(a => a._conferido === 1);
            return {
              filial: f,
              displayName: f,
              tenantid: currentTenantid,
              total: Math.max(0, filialAssets.length),
              checked: Math.max(0, checkedAssets.length)
            };
          });

          if (active) {
            setSqliteUnits(mapped);
            // Total geral da base local (todas as filiais reais do contrato ativo).
            setLocalTotalAssets(mapped.reduce((acc, m) => acc + m.total, 0));
            setStatsLoading(false);
          }
        } else if (active) {
          setStatsLoading(false);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('>>> [UnitSelector] Erro ao carregar unidades com estatísticas do SQLite:', errMsg);
        if (active) setStatsLoading(false);
      }
    };

    fetchSqliteUnits();
    return () => {
      active = false;
    };
  }, [databaseMode, units]);

  // Refs para estabilizar as funções callbacks externas e evitar loops infinitos de render
  const onSelectRef = React.useRef(onSelect);
  const onForceToggleViewRef = React.useRef(onForceToggleView);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onForceToggleViewRef.current = onForceToggleView;
  }, [onForceToggleView]);

  // 4. Coleta a coordenada geográfica real do terminal móvel via GPS de alta precisão (Depende apenas da contagem de configs)
  useEffect(() => {
    // 🚀 ISOLAMENTO DE SANDBOX (Se estiver em iframe, aborta GPS de hardware real)
    if (typeof window !== 'undefined' && (window.self !== window.top || window.location.hostname.includes('aistudio'))) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    
    const applyGpsFallback = () => {
      try {
        if (activeUnitConfigs.length > 0) {
          const firstValid = activeUnitConfigs.find(c => c.lat && c.lng);
          if (firstValid) {
            logger.info('>>> [UnitSelector GPS Fallback] Aplicando Ponto Zero de Calibração:', firstValid.lat, firstValid.lng);
            setDeviceCoords({ lat: Number(firstValid.lat), lng: Number(firstValid.lng) });
          }
        }
      } catch {
        // Safe bypass
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn('[UnitSelector GPS] getCurrentPosition falhou:', errMsg);
          applyGpsFallback();
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('[UnitSelector GPS] getCurrentPosition Exception caught silently:', errMsg);
      applyGpsFallback();
    }

    let watchId: number | undefined;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn('[UnitSelector GPS/Watch] watchPosition falhou:', errMsg);
          applyGpsFallback();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('[UnitSelector GPS/Watch] watchPosition Exception caught silently:', errMsg);
      applyGpsFallback();
    }

    return () => {
      if (watchId) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn('[UnitSelector] clearWatch error:', errMsg);
        }
      }
    };
  }, [activeUnitConfigs]);

  // Normalização estrita para mapear chave da unidade com âncora
  const getUnitConfigForFilial = (filialName: string) => {
    const key = filialName.toUpperCase().trim();
    return activeUnitConfigs.find(c => {
      const uId = (c._unitid || c.unit_id || '').toUpperCase().trim();
      return uId === key || uId.replace(/_/g, ' ') === key.replace(/_/g, ' ');
    }) || null;
  };

  // Cálculo de geocerca real em metros do ponto âncora com Turf.js
  const getGeofenceStatus = (filialName: string) => {
    // 1. Verificação de Bypass Administrativo (admin email ou roles ADMIN/MASTER/GESTOR)
    let isBypass = false;
    try {
      const storedUser = sessionStorage.getItem('app_current_user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser) as { email?: string; role?: string };
        const email = (parsedUser.email || '').toLowerCase().trim();
        const role = (parsedUser.role || '').toUpperCase().trim();
        if (isAdminEmail(email) || role === 'ADMIN' || role === 'MASTER' || role === 'GESTOR') {
          isBypass = true;
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('[UnitSelector] Erro ao decodificar usuário para bypass de geocerca', errMsg);
    }

    const config = getUnitConfigForFilial(filialName);
    if (!config || !config.lat || !config.lng) {
      if (isBypass) {
        return { hasGps: false, message: 'BYPASS: SRE HOMOLOGAÇÃO (SEM GPS)', isInside: true, distance: null };
      }
      return { hasGps: false, message: 'GPS SEM MODELO', isInside: false, distance: null };
    }

    if (isBypass) {
      return { hasGps: true, message: 'BYPASS: SRE HOMOLOGAÇÃO (LIVRE)', isInside: true, distance: 0, allowedRadius: Number(config.radius_meters || 500) };
    }

    if (!deviceCoords) {
      if (config.lat && config.lng) {
        return { 
          hasGps: true, 
          message: `DENTRO DO PERÍMETRO (Ponto Zero de Calibração)`, 
          isInside: true, 
          distance: 0,
          allowedRadius: Number(config.radius_meters || 500)
        };
      }
      return { hasGps: true, message: 'SINCRONIZANDO GPS...', isInside: false, distance: null };
    }

    try {
      const configLng = Number(config.lng || 0);
      const configLat = Number(config.lat || 0);
      
      const fromPoint = turf.point([deviceCoords.lng, deviceCoords.lat]);
      const toPoint = turf.point([configLng, configLat]);
      const distanceM = turf.distance(fromPoint, toPoint, { units: 'kilometers' }) * 1000;
      const roundedDist = Math.round(distanceM);
      const allowedRadius = Number(config.radius_meters || 500);

      const isInside = roundedDist <= allowedRadius;
      
      const distStr = roundedDist >= 1000 
        ? `${(roundedDist / 1000).toFixed(1)}km` 
        : `${roundedDist}m`;

      if (isInside) {
        return { 
          hasGps: true, 
          message: `DENTRO DO PERÍMETRO (${distStr})`, 
          isInside: true, 
          distance: roundedDist,
          allowedRadius
        };
      } else {
        return { 
          hasGps: true, 
          message: `FORA DO PERÍMETRO SRE (${distStr}/max ${allowedRadius}m)`, 
          isInside: false, 
          distance: roundedDist,
          allowedRadius
        };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('[Geofence Turf status err]', errMsg);
      return { hasGps: true, message: 'ERRO DE COORDENADA', isInside: false, distance: null };
    }
  };

  const purifiedUnits = units.filter(u => {
    const unitName = u && u.filial;
    return unitName && unitName.trim() !== '';
  });

  // Se for DatabaseMode.INTERNAL, a fonte de dados das filiais e contagens é o sqliteService.getOperationalUnitsWithStats()
  const displayUnitsList = databaseMode === DatabaseMode.INTERNAL
    ? sqliteUnits.map(su => {
        const propUnit = units.find(u => u.filial.toUpperCase().trim() === su.filial.toUpperCase().trim());
        return {
          filial: su.filial,
          tenantid: su.tenantid,
          hasData: su.total > 0,
          isDownloaded: propUnit?.isDownloaded ?? true,
          hasCampaign: propUnit?.hasCampaign ?? false,
          hasGps: propUnit?.hasGps ?? false,
          assetCount: su.total,
          checkedCount: su.checked
        };
      })
    : purifiedUnits.map(pu => ({
        ...pu,
        checkedCount: 0
      }));

  // Muro multi-tenant: nomes de filial que existem em MAIS DE UM contrato
  // (homônimos) ganham o badge do contrato para o usuário distinguir.
  const homonymSet = useMemo(() => findHomonymUnits(displayUnitsList), [displayUnitsList]);

  const filteredUnits = displayUnitsList.filter(u => {
    const unitName = u.filial || '';
    return unitName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Log para depuração de unidades
  if (displayUnitsList.length === 0) {
    logger.warn('>>> [UnitSelector] Recebeu 0 unidades purificadas para exibir.');
  } else {
    logger.info(`>>> [UnitSelector] Exibindo ${filteredUnits.length} de ${displayUnitsList.length} unidades de exibição.`);
  }

  // Helper para gerar ícone e cor consistente baseada no nome
  const getUnitIdentity = (name: string, hasData: boolean) => {
    if (!hasData) {
      return {
        style: 'bg-slate-50 text-slate-300 border-slate-100 grayscale',
        Icon: Building2
      };
    }
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      'bg-blue-50 text-blue-600 border-blue-100',
      'bg-indigo-50 text-indigo-600 border-indigo-100',
      'bg-emerald-50 text-emerald-600 border-emerald-100',
      'bg-purple-50 text-purple-600 border-purple-100',
      'bg-amber-50 text-amber-600 border-amber-100',
      'bg-rose-50 text-rose-600 border-rose-100'
    ];
    const icons = [Building2, Factory, Landmark, Warehouse, Building];
    
    return {
      style: colors[hash % colors.length],
      Icon: icons[hash % icons.length]
    };
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Slim Fixo - Respiro do Cabeçalho e Altura Recomendados */}
      <div className="pt-7 pb-4 px-4 bg-white border-b border-gray-100 flex flex-col gap-3.5 shadow-sm shrink-0 min-h-20">
        <div className="flex items-center justify-between w-full h-12">
          {/* Back Button Alinhado à Esquerda */}
          <div className="flex-shrink-0 flex items-center">
            <BackButton 
              onClick={() => {
                if (onForceToggleView) {
                  onForceToggleView();
                } else {
                  onBack();
                }
              }} 
              label="Voltar" 
              subLabel={isAdmin ? "Módulos" : "Sair"} 
            />
          </div>
          
          {/* Bloco de Texto Centralizado Verticalmente com Altura Mínima Comprimida */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
            <h2 className="text-[13px] sm:text-sm font-black text-ink uppercase tracking-[0.1em] leading-tight select-none">
              Unidade Operacional
            </h2>
            <p className="text-accent text-[8px] font-extrabold uppercase tracking-widest mt-0.5 leading-none select-none">
              Selecione o Foco do Inventário
            </p>
          </div>

          {/* Ícones de Ação/Status Alinhados à Direita */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            {onSync && databaseMode !== DatabaseMode.INTERNAL && (
              <button 
                onClick={onSync}
                disabled={isSyncing}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm cursor-pointer ${
                  isSyncing ? 'bg-blue-50 text-blue-500' : 'bg-white text-accent border border-accent/10 active:scale-95 hover:bg-accent-soft'
                }`}
                title="Sincronizar com a Nuvem"
              >
                <div className={isSyncing ? 'animate-spin' : ''}>
                  {isSyncing ? <RefreshCw size={16} /> : <Cloud size={16} />}
                </div>
              </button>
            )}
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-md">
              <LayoutGrid size={16} />
            </div>
          </div>
        </div>

        {/* Input Buscador */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={16} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-11 pr-5 py-2.5 bg-bg-main rounded-xl text-[10px] font-bold uppercase border border-border focus:border-accent outline-none transition-all shadow-inner placeholder:text-ink-muted/30"
          />
        </div>

        {/* TOOL GRID — transferida do MainMenu (fig. 1): AJUSTES · DADOS · PAINEL · AUDITORIA */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 md:space-x-4 font-sans">
            <button 
              onClick={() => onNavigate?.(AppScreen.MAIN_MENU, { openPanel: 'PREFERENCES' })} 
              className="flex flex-col items-center space-y-1 group"
              title="Ajustes de Campo"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 group-active:scale-90 transition-all group-hover:bg-accent-soft group-hover:text-accent">
                <SlidersHorizontal size={20} />
              </div>
              <span className="text-[8px] md:text-[9px] font-bold text-ink-muted uppercase tracking-widest">Ajustes</span>
            </button>

            {isAdmin && (
              <button 
                onClick={() => onNavigate?.(AppScreen.MAIN_MENU, { openPanel: 'DATA' })} 
                className="flex flex-col items-center space-y-1 group"
                title="Gestão de Dados"
              >
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 group-active:scale-90 transition-all group-hover:bg-accent-soft group-hover:text-accent">
                  <DatabaseZap size={20} />
                </div>
                <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Dados</span>
              </button>
            )}

            {isAdmin && (
              <button 
                onClick={() => onNavigate?.(AppScreen.MAIN_MENU, { openPanel: 'ADMIN' })} 
                className="flex flex-col items-center space-y-1 group"
                title="Painel Administrativo"
              >
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 group-active:scale-90 transition-all group-hover:bg-accent-soft group-hover:text-accent">
                  <Settings size={20} />
                </div>
                <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Painel</span>
              </button>
            )}

            {isAuditor && (
              <button 
                onClick={() => onNavigate?.(AppScreen.MAIN_MENU, { openPanel: 'AUDIT' })} 
                className="flex flex-col items-center space-y-1 group"
                title="Trilha de Auditoria"
              >
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 group-active:scale-90 transition-all group-hover:bg-emerald-600 group-hover:text-white">
                  <ListChecks size={20} />
                </div>
                <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Auditoria</span>
              </button>
            )}
          </div>

          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-ink uppercase tracking-widest">
              {displayTotalAssets > 0 ? `${displayTotalAssets.toLocaleString('pt-BR')} Ativos` : 'Vazio'}
            </span>
            <div className="flex items-center space-x-1 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${displayTotalAssets > 0 ? 'bg-success' : 'bg-slate-300'}`} />
              <span className="text-[8px] font-medium text-ink-muted uppercase">Base Local</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo com scroll de alta reatividade e respiração inferior proporcional */}
      <div className="flex-1 overflow-hidden bg-bg-main relative">
        {isImportingBatch ? (
          /* Estado Premium de Bloqueio de Leitura Suja */
          <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center animate-pulse-slow">
            <RefreshCw size={44} className="text-accent animate-spin mb-4" />
            <h3 className="font-extrabold uppercase tracking-[0.15em] text-xs text-slate-700">MODO IMPORTAÇÃO ATIVO</h3>
            <p className="text-[9px] text-slate-400 mt-2 max-w-[260px] leading-relaxed uppercase tracking-wider font-semibold">
              Persistindo transação limpa no disco local do dispositivo. Aguarde o fim do isolamento.
            </p>
          </div>
        ) : filteredUnits.length > 0 ? (
          <div className="h-full overflow-y-auto pb-24 px-5 pt-3 space-y-3.5">
            {filteredUnits.map((unit) => {
              const rawName = unit ? unit.filial : '';
              if (!unit || !rawName || rawName.trim() === '') {
                return null;
              }

              const displayName = rawName.trim().toUpperCase();
              const unitTenant = (unit.tenantid || '').trim().toUpperCase();
              const { style, Icon } = getUnitIdentity(displayName, unit.hasData);
              const showTenantBadge = homonymSet.has(displayName);

              return (
                <div
                  key={unitTenant ? `${unitTenant}::${displayName}` : displayName}
                  onClick={() => unit.hasData && onSelect(displayName, unitTenant || undefined)}
                  className={`w-full bg-white p-4 rounded-2xl flex items-center justify-between shadow-sm border transition-all duration-200 group overflow-hidden relative modern-card ${
                    unit.hasData 
                      ? 'hover:border-accent hover:shadow-md active:scale-[0.99] border-gray-100 cursor-pointer' 
                      : 'opacity-60 cursor-not-allowed border-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-4 relative z-10 w-full min-w-0 pr-2">
                    <div className={`w-12 h-12 ${style} rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm border flex-shrink-0`}>
                      <Icon size={24} strokeWidth={2.5} />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="unit-row-item flex items-center flex-wrap">
                        <span style={{ fontSize: '14px', color: '#0a192f', fontWeight: '500' }}>{displayName}</span>
                        {showTenantBadge && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[8px] font-black uppercase tracking-wider border border-slate-200">
                            {unitTenant || 'SEM CONTRATO'}
                          </span>
                        )}
                        {typeof unit.assetCount === 'number' && (
                          <>
                            <span style={{ margin: '0 8px', color: '#8892b0' }}>•</span>
                            <span style={{ fontSize: '12px', color: '#64ffda', fontFamily: 'monospace' }}>
                              {Math.max(0, unit.assetCount)} ATIVOS
                              {databaseMode === DatabaseMode.INTERNAL && typeof unit.checkedCount === 'number' && ` (${Math.max(0, unit.checkedCount)} CONF.)`}
                            </span>
                          </>
                        )}
                      </div>
                      
                      {/* Barra de conformidade geométrica real (SRE) */}
                      {(() => {
                        const geo = getGeofenceStatus(displayName);
                        if (!geo.hasGps) return null;
                        return (
                          <div className="mt-1 flex items-center space-x-1 select-none">
                            <span className={`w-1.5 h-1.5 rounded-full ${geo.isInside ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                            <span className={`text-[9.2px] font-black uppercase tracking-wider ${geo.isInside ? 'text-emerald-600' : 'text-amber-600 animate-pulse-soft'}`}>
                              {geo.message}
                            </span>
                          </div>
                        );
                      })()}
                      
                      {/* Botões e Badges das Ações */}
                      <div className="flex items-center space-x-3 mt-2">
                        {/* Status de Dados */}
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                            unit.hasData ? 'bg-blue-50 text-blue-600 border-blue-100 shadow-sm' : 'bg-gray-50 text-gray-300 border-gray-100'
                          }`}>
                            <Database size={13} />
                          </div>
                          <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasData ? 'text-blue-600' : 'text-gray-300'}`}>
                            Dados
                          </span>
                        </div>

                        {/* Status de GPS — 2 ESTADOS POR UNIDADE:
                            1) SEM ÂNCORA: visual desabilitado (cinza); clicável APENAS para admin
                               definir a posição (não-admin: bloqueado).
                            2) COM ÂNCORA: verde + 'GPS'; clicável (edição restrita pelas
                               regras de admin do configurador). */}
                        <button 
                          type="button"
                          disabled={!unit.hasGps && !isAdmin}
                          title={
                            unit.hasGps
                              ? 'Âncora GPS configurada — clique para editar (restrito)'
                              : isAdmin
                                ? 'Sem âncora GPS — clique para definir a posição desta unidade'
                                : 'Sem âncora GPS — apenas o admin pode definir'
                          }
                          aria-label={unit.hasGps ? 'GPS configurado' : 'Definir âncora GPS'}
                          className={`flex flex-col items-center gap-1 group/icon p-2 -m-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center bg-transparent border-0 ${
                            unit.hasGps || isAdmin
                              ? 'cursor-pointer active:scale-90'
                              : 'cursor-not-allowed opacity-60 grayscale'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Não-admin não pode definir âncora de unidade SEM GPS
                            if (!unit.hasGps && !isAdmin) return;
                            if (onConfigGPS) { 
                              e.preventDefault(); 
                              try { 
                                Promise.resolve(onConfigGPS(displayName)).catch((err: unknown) => {
                                  const errMsg = err instanceof Error ? err.message : String(err);
                                  logger.error("[GPS MODAL CRASH PREVENTED]", errMsg);
                                }); 
                              } catch (err: unknown) { 
                                const errMsg = err instanceof Error ? err.message : String(err);
                                logger.error("[GPS MODAL CRASH PREVENTED]", errMsg); 
                              } 
                            }
                          }}
                        >
                          <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-all ${
                            unit.hasGps 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm hover:bg-emerald-100 hover:scale-105' 
                              : 'bg-gray-100 text-gray-400 border-gray-200'
                          }`}>
                            <NavigationIcon size={14} />
                          </div>
                          <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasGps ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {unit.hasGps ? 'GPS' : 'SEM ÂNCORA'}
                          </span>
                        </button>

                        {/* Status de Campanha */}
                        <button 
                          type="button"
                          className="flex flex-col items-center gap-1 group/icon p-2 -m-2 rounded-xl active:scale-90 transition-all cursor-pointer min-w-[44px] min-h-[44px] justify-center bg-transparent border-0 font-sans"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onCampaigns) onCampaigns(displayName);
                          }}
                        >
                          <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-all ${
                            unit.hasCampaign 
                              ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm hover:bg-amber-100 hover:scale-105' 
                              : 'bg-gray-50 text-gray-300 border-gray-100 hover:bg-gray-100 hover:scale-105'
                          }`}>
                            <Calendar size={13} />
                          </div>
                          <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasCampaign ? 'text-amber-600' : 'text-gray-400'}`}>
                            Campanha
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Seta indicativa de Navegação */}
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    <div className="w-8 h-8 flex items-center justify-center text-ink-muted/15 group-hover:text-accent/40 group-hover:translate-x-0.5 transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : statsLoading ? (
          <div className="flex flex-col items-center justify-center h-full py-16">
            <RefreshCw size={44} className="text-accent animate-spin mb-4" />
            <p className="font-bold uppercase tracking-[0.2em] text-[9px] text-accent">
              Carregando Unidades...
            </p>
          </div>
        ) : isSyncing ? (
          <div className="flex flex-col items-center justify-center h-full py-16">
            <RefreshCw size={44} className="text-accent animate-spin mb-4" />
            <p className="font-bold uppercase tracking-[0.2em] text-[9px] text-accent">
              Sincronizando Unidades...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-16 px-8 text-center">
            <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center text-red-500 mb-5 shadow-inner">
              <Building2 size={32} className="animate-pulse" />
            </div>
            <p className="font-extrabold uppercase tracking-[0.1em] text-[10px] text-red-600 mb-6 max-w-sm leading-relaxed">
              ⚠️ Nenhum dado importado
            </p>
            
            {isAdmin && onLoadDatabase && (
              <button
                onClick={onLoadDatabase}
                className="w-full max-w-xs py-3.5 bg-accent text-white rounded-xl font-extrabold uppercase text-[9px] tracking-[0.15em] shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Database size={15} />
                Iniciar Carga de Dados (Expert)
              </button>
            )}

            {!isAdmin && databaseMode !== DatabaseMode.INTERNAL && onSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="w-full max-w-xs py-3.5 bg-white border border-accent/20 text-accent rounded-xl font-extrabold uppercase text-[9px] tracking-[0.15em] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
                Tentar Sincronizar da Nuvem
              </button>
            )}
            
            {!isAdmin && (databaseMode === DatabaseMode.INTERNAL || !onSync) && (
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest max-w-[200px] leading-relaxed">
                Solicite ao administrador a carga da base de dados para iniciar o inventário.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Info Bar Técnica Inferior de Segurança */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-border flex justify-between items-center z-50 shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-accent rounded-full shadow-sm shadow-accent/50 animate-pulse"></div>
          <p className="text-[9px] text-ink font-bold uppercase tracking-widest leading-none">Pipeline Ativo</p>
        </div>
        <p className="text-[9px] text-ink-muted font-bold uppercase tracking-widest leading-none">
          {displayUnitsList.length} {displayUnitsList.length === 1 ? 'Entidade' : 'Entidades'}
        </p>
      </div>
    </div>
  );
};

export default UnitSelector;
