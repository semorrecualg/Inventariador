import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Asset, TagInventario, AuditLogEntry, AppScreen } from '../types';
import { safeStringify } from '../services/utils';
import * as XLSX from 'xlsx';
import { db } from '../services/sqliteService';
import { logger } from '../utils/logger';
import { readSessionTenantId } from '../utils/tenantUtils';
import BackButton from './BackButton';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  ShieldAlert,
  Activity,
  Download,
  Info,
  X,
  MapPin,
  History,
  User,
  Building2,
  DollarSign,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

/** StatCard props */
interface StatCardProps {
  label: string;
  value: number;
  total: number;
  colorClass: string;
  icon: React.ElementType;
  onClick: () => void;
  onHintTrigger?: (label: string, text: string) => void;
}

/**
 * Individual stat card used in the Quick Stats grid.
 * Extracted to module level with React.memo to prevent remount on every Dashboard render
 * (Vercel Best Practice: rerender-no-inline-components).
 */
const StatCard = React.memo(function StatCard({
  label,
  value,
  total,
  colorClass,
  icon: Icon,
  onClick,
  onHintTrigger,
}: StatCardProps) {
  const percentage = total > 0
    ? Math.min(100, Math.round((value / total) * 100))
    : 0;

  const handleHintTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (DASHBOARD_HINTS[label]) {
      onHintTrigger?.(label, DASHBOARD_HINTS[label]);
    }
  };

  return (
    <div
      onClick={onClick}
      className="bg-white border border-border rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98] group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${colorClass} bg-opacity-20 flex items-center justify-center`}>
          <Icon size={16} className={colorClass.replace('bg-', 'text-').replace('400', '500')} />
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="flex items-center space-x-1">
            <span className="text-lg font-bold text-ink">{value}</span>
            {DASHBOARD_HINTS[label] && (
              <button onClick={handleHintTrigger} className="p-1 text-ink-muted/30 hover:text-accent transition-colors">
                <Info size={8} />
              </button>
            )}
          </div>
          <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">{percentage}%</p>
        </div>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">{label}</span>
        <Download size={8} className="text-ink-muted/30 group-hover:text-accent transition-colors" />
      </div>
      <div className="h-1 w-full bg-bg-main rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} transition-all duration-1000`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
});

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899'];

// Vercel Best Practice: hoist pure utility functions outside component
// (rerender-no-inline-components) — avoids recreating on every render
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const DASHBOARD_HINTS: Record<string, string> = {
  'Falta Etiquetar': 'Ativos marcados com "ETIQUETAR" na planilha original. Necessário aplicar plaqueta física em campo.',
  'Etiquetado': 'Itens que eram marcados como "ETIQUETAR" e foram conferidos e devidamente plaqueteados durante o inventário.',
  'Registros Ativos': 'Total de itens com status ATIVO na base master selecionada.',
  'Registros Baixados': 'Itens que possuem status de BAIXADO no contábil. Auditoria rigorosa recomendada.',
  'Plaquetas Únicas': 'Registros que possuem um número de etiqueta exclusivo na base carregada.',
  'Etiqueta+1Registro': 'ALERTA DE INTEGRIDADE: Existem registros diferentes compartilhando o mesmo número de etiqueta na planilha.',
  'Com Plaqueta Física': 'Total de itens que possuem alguma identificação numérica (exceto marcadores temporários).',
  'Sem Identificação': 'Ativos carregados sem nenhum número de patrimônio vinculado no sistema de origem.'
};

interface DashboardProps {
  assets: Asset[];
  allAssets?: Asset[];
  onBack: () => void;
  onChangeUnit?: () => void;
  onOpenInventory?: () => void;
  onOpenLabeling?: () => void;
  onOpenActiveSearch?: () => void;
  currentCampaignId?: string;
  sqlStats?: {
    totalAtivos: number;
    conferidoAtivos: number;
    baixadosLocalizados: number;
    totalLido: number;
    pendentesAtivos: number;
    avancoPercent: number;
  } | null;
  user: {
    tenantid?: string;
    unitid?: string;
    role?: string;
    is_admin?: boolean;
    isAdmin?: boolean;
  } | null;
  onNavigate?: (screen: AppScreen) => void;
  selectedUnit?: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({ assets, onBack, user, currentCampaignId, onOpenInventory, onOpenLabeling, onChangeUnit, sqlStats, onNavigate, selectedUnit }) => {
  const [hintOverlay, setHintOverlay] = useState<{label: string, text: string} | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'financial' | 'units'>('overview');
  const [filterByCampaign, setFilterByCampaign] = useState(false);
  const [dexieAssets, setDexieAssets] = useState<Asset[] | null>(null);

  // REQUISITO 2.1: ACOPLAMENTO FISICO DEXIE — fallback direto ao IndexedDB
  // Se o array assets (memoria) estiver vazio, busca direto do db.ativos
  useEffect(() => {
    if (!assets || assets.length === 0) {
      const tenantid = readSessionTenantId() || 'DEMO_DEFAULT';
      const filial = selectedUnit || sessionStorage.getItem('filial') || '';
      logger.info('[DASHBOARD_DEXIE] Assets em memoria vazio. Consultando db.ativos diretamente...');
      db.ativos.where('[tenantid+filial]').equals([tenantid, filial]).toArray()
        .then((rows) => {
          logger.info(`[DASHBOARD_DEXIE] ${rows.length} ativos carregados do IndexedDB.`);
          setDexieAssets(rows as unknown as Asset[]);
        })
        .catch((err) => {
          logger.error('[DASHBOARD_DEXIE] Erro ao consultar db.ativos:', err);
          setDexieAssets(null);
        });
    } else {
      setDexieAssets(null);
    }
  }, [assets, selectedUnit]);

  // Vercel Best Practice: stable callback for StatCard hint triggers
  // (rerender-memo) — prevents inline arrow from defeating React.memo
  const handleHint = useCallback(
    (label: string, text: string) => setHintOverlay({ label, text }),
    []
  );

  const handleNavigate = useCallback((screen: AppScreen) => {
    const currentUnit = selectedUnit || user?.unitid || '';
    sessionStorage.setItem('selectedUnit', JSON.stringify(currentUnit));
    if (onNavigate) {
      onNavigate(screen);
    }
  }, [onNavigate, selectedUnit, user]);

  const stats = useMemo(() => {
    const s = {
      totalAtivos: 0,
      conferidoAtivos: 0,
      baixadosLocalizados: 0,
      totalConferidoGeral: 0,
      percConferido: 0,
      comPlaqueta: 0,
      faltaEtiquetar: 0,
      jaEtiquetado: 0,
      divergencia: 0,
      novoItem: 0,
      adotado: 0,
      readotado: 0,
      conferidoOk: 0,
      locChanges: 0,
      unico: 0,
      dupInterna: 0,
      dupExterna: 0,
      semId: 0,
      countAtivos: 0,
      countBaixados: 0,
      criticalDivergence: 0,
      syncConflicts24h: 0,
      totalValue: 0,
      depreciatedValue: 0,
      residualValue: 0,
      statusDistribution: [] as { name: string; value: number }[],
      unitData: [] as { name: string; total: number; conferido: number }[]
    };

    const statusMap: Record<string, number> = {};
    const unitMap: Record<string, { total: number; conferido: number }> = {};
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    // ACOPLAMENTO FISICO DEXIE: usa assets do IndexedDB (dexieAssets) quando o array em memoria estiver vazio
    const source = (dexieAssets && dexieAssets.length > 0) ? dexieAssets : assets;
    const filteredAssets = filterByCampaign && currentCampaignId 
      ? source.filter(a => a.currentCampaignId === currentCampaignId)
      : source;

    for (let i = 0; i < filteredAssets.length; i++) {
      const a = filteredAssets[i];
      
      // Count Sync Conflicts in last 24h
      if (a._history && Array.isArray(a._history)) {
        a._history.forEach(h => {
          if (h.action === 'SYNC_CONFLICT') {
            const logDate = new Date(h.timestamp);
            if (logDate >= oneDayAgo) {
              s.syncConflicts24h++;
            }
          }
        });
      }

      const statusUpper = String(a.status || a.SITUACAO || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXADO');
      const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
      const tag = a.TAG_INVENTARIO || TagInventario.PENDENTE;
      const etq = String(a.etiqueta || '').toUpperCase().trim();
      const plaquetaMaster = String(a._plaquetaMaster || '').toUpperCase().trim();
      const unit = a.filial || a._unitid || 'SEM UNIDADE';

      // Financials
      const valorAquisicao = typeof a._valor_aquisicao === 'number' ? a._valor_aquisicao : parseFloat(String(a.vlraquisic || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      const depreciacao = typeof a._depreciacao_acumulada === 'number' ? a._depreciacao_acumulada : 0;
      const residual = typeof a._valor_residual === 'number' ? a._valor_residual : (valorAquisicao - depreciacao);

      s.totalValue += valorAquisicao;
      s.depreciatedValue += depreciacao;
      s.residualValue += residual;

      if (!isBaixado) {
        s.totalAtivos++;
        if (isConferido) s.conferidoAtivos++;
        
        // Unit Progress
        if (!unitMap[unit]) unitMap[unit] = { total: 0, conferido: 0 };
        unitMap[unit].total++;
        if (isConferido) unitMap[unit].conferido++;
      } else if (isConferido) {
        s.baixadosLocalizados++;
      }

      if (statusUpper.includes('ATIVO')) s.countAtivos++;
      if (isBaixado) s.countBaixados++;

      if (etq && etq !== 'ETIQUETAR') s.comPlaqueta++;

      if (tag === TagInventario.FALTA_ETIQUETAR || (plaquetaMaster === 'ETIQUETAR' && !isConferido)) {
        s.faltaEtiquetar++;
      }
      if (tag === TagInventario.ETIQUETADO || (plaquetaMaster === 'ETIQUETAR' && isConferido)) {
        s.jaEtiquetado++;
      }

      if (tag === TagInventario.DIVERGENCIA) {
        s.divergencia++;
        if (valorAquisicao >= 5000) s.criticalDivergence++;
      }
      if (tag === TagInventario.NOVO_ITEM || a._isNew) s.novoItem++;
      if (tag === TagInventario.ADOTADO || tag === TagInventario.ADOTADO_EXTERNO) s.adotado++;
      if (tag === TagInventario.RE_ADOTADO) s.readotado++;
      if (tag === TagInventario.CONFERIDO) s.conferidoOk++;
      if (a.DE_PARA === 'COM ALTERAÇÃO') s.locChanges++;

      if (a.TAG_DUPLICIDADE === 'ÚNICO') s.unico++;
      if (a.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO') s.dupInterna++;
      if (a.TAG_DUPLICIDADE === 'DUPLICIDADE EXTERNA') s.dupExterna++;

      if (a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' && etq !== 'ETIQUETAR' && !etq) {
        s.semId++;
      }

      // Status Distribution
      statusMap[tag] = (statusMap[tag] || 0) + 1;
    }

    s.totalConferidoGeral = sqlStats ? sqlStats.totalLido : (s.conferidoAtivos + s.baixadosLocalizados);
    s.percConferido = sqlStats ? sqlStats.avancoPercent : (s.totalAtivos > 0 ? Math.round((s.conferidoAtivos / s.totalAtivos) * 100) : 0);

    // Override de métricas se vier via SQL (Performance v24.50)
    if (sqlStats) {
      s.totalAtivos = sqlStats.totalAtivos;
      s.conferidoAtivos = sqlStats.conferidoAtivos;
      s.baixadosLocalizados = sqlStats.baixadosLocalizados;
      s.totalConferidoGeral = sqlStats.totalLido;
      s.percConferido = sqlStats.avancoPercent;
    }

    s.statusDistribution = Object.entries(statusMap).map(([name, value]) => ({ name, value }));
    s.unitData = Object.entries(unitMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return s;
  }, [assets, filterByCampaign, currentCampaignId, sqlStats, dexieAssets]);

  // ACOPLAMENTO FISICO DEXIE: usa source (dexieAssets fallback) em vez de assets puro
  const auditSource = (dexieAssets && dexieAssets.length > 0) ? dexieAssets : assets;

  const auditActivityData = useMemo(() => {
    const userCounts: Record<string, number> = {};
    auditSource.forEach(a => {
      if (a._history && Array.isArray(a._history)) {
        a._history.forEach(h => {
          const userName = h.user || 'Desconhecido';
          userCounts[userName] = (userCounts[userName] || 0) + 1;
        });
      }
    });
    return Object.entries(userCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [auditSource]);

  const recentActivity = useMemo(() => {
    const allHistory: (AuditLogEntry & { assetId: string | number; assetTag?: string; assetDesc?: string })[] = [];
    auditSource.forEach(a => {
      if (a._history && Array.isArray(a._history)) {
        a._history.forEach(h => {
          allHistory.push({
            ...h,
            assetId: a.id,
            assetTag: a.etiqueta,
            assetDesc: a.descricaodoativo
          });
        });
      }
    });
    
    return allHistory
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [auditSource]);

  // Vercel Best Practice: StatCard extracted to module level with React.memo
  // formatCurrency hoisted to module level
  // (rerender-no-inline-components)

  // Vercel Best Practice: memoize callback for stable reference across renders
  // (rerender-memo)
  const handleExport = useCallback(
    (filterFn: (a: Asset) => boolean, fileName: string) => {
      const exportSource = (dexieAssets && dexieAssets.length > 0) ? dexieAssets : assets;
      const filtered = exportSource.filter(filterFn);
      if (filtered.length === 0) return;

      const wsData = filtered.map(a => {
        const res: { [key: string]: string | number | boolean | null | undefined } = {
          'TENANT': a.tenantid || user?.tenantid || user?.tenantid || '',
          'UNIDADE': a._unitid || user?.unitid || '',
        };

        Object.keys(a).forEach(k => {
          if (!k.startsWith('_') && k !== 'id') {
            const val = a[k];
            const colName = `PARA_${k}`;
            if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
              res[colName] = safeStringify(val);
            } else {
              res[colName] = val as string | number | boolean | null | undefined;
            }
            res[k] = res[colName];
          }
        });

        const originalValues = a._valoresOriginais;
        if (originalValues) {
          Object.keys(originalValues).forEach(key => {
            const val = originalValues[key];
            const colName = `DE_${key}`;
            if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
              res[colName] = safeStringify(val);
            } else {
              res[colName] = val as string | number | boolean | null | undefined;
            }
          });
        } else {
          Object.keys(a).forEach(k => {
            if (!k.startsWith('_') && k !== 'id') {
              res[`DE_${k}`] = a[k] as string | number | boolean | null | undefined;
            }
          });
        }

        res['AUDITOR_LOCAL_ORIGINAL'] = a.endereco;
        res['AUDITOR_LOCAL_AUDITADO'] = a._localMaster || a.endereco;
        res['AUDITOR_DE_PARA'] = (a.DE_PARA as string | undefined) || (a._conferido ? (a.endereco === (a._localMaster || a.endereco) ? 'SEM ALTERAÇÃO' : 'COM ALTERAÇÃO') : 'PENDENTE');
        res['AUDITOR_STATUS_CONFERENCIA'] = a._conferido ? 'SIM' : 'NAO';
        res['AUDITOR_TAG_REGRA_OURO'] = (a.TAG_INVENTARIO as string | undefined) || 'PENDENTE';
        res['AUDITOR_DUPLICIDADE'] = (a.TAG_DUPLICIDADE as string | undefined) || 'NAO ANALISADO';
        return res;
      });

      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "GBR_AUDIT");
      XLSX.writeFile(wb, `GBR_${fileName}_${new Date().getTime()}.xlsx`);
    },
    [assets, user, dexieAssets]
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header com layout Flexbox rigoroso */}
      <div 
        className="pt-12 pb-4 px-4 bg-white border-b border-border shadow-sm z-20"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        {/* Lado Esquerdo: Nome da Unidade perfeitamente alinhado */}
        <div className="flex items-center space-x-3">
          <BackButton 
            onClick={onBack} 
            label="Dashboard" 
            subLabel={selectedUnit || localStorage.getItem('filial') || sessionStorage.getItem('filial') || user?.unitid || user?.tenantid || user?.tenantid || 'Sem Unidade'} 
          />
          {currentCampaignId && (
            <div className="flex items-center space-x-1 bg-accent/10 px-2 py-1 rounded-lg border border-accent/20">
              <Activity size={10} className="text-accent animate-pulse" />
              <span className="text-[8px] font-black text-accent uppercase tracking-widest">Evento Ativo</span>
            </div>
          )}
        </div>

        {/* Lado Direito: Badges reativas de status alinhadas de forma horizontal e simétrica */}
        <div className="flex items-center space-x-2.5">
          {/* Badge 1: PENDENTES reativo */}
          <div className="flex items-center space-x-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">
              {stats.totalAtivos - stats.conferidoAtivos} PENDENTES
            </span>
          </div>

          {/* Badge 2: OPERACIONAL fixo */}
          <div className="flex items-center space-x-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">
              OPERACIONAL
            </span>
          </div>

          {onChangeUnit && (
            <button 
              onClick={onChangeUnit}
              className="flex items-center space-x-1.5 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-blue-600 active:scale-95 transition-all group"
            >
              <Building2 size={14} className="group-hover:rotate-12 transition-transform" />
              <span className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap">Unidades</span>
            </button>
          )}

          {stats.syncConflicts24h > 0 && (
            <div className="flex items-center space-x-1 bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/20 animate-pulse">
              <ShieldAlert size={10} className="text-rose-500" />
              <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest">{stats.syncConflicts24h} Conflitos</span>
            </div>
          )}

          <button 
            onClick={() => handleExport(() => true, 'CONSOLIDADO_GERAL')}
            className="p-2 bg-bg-main border border-border rounded-xl text-ink-muted hover:text-accent transition-colors"
          >
            <Download size={18} />
          </button>
          <div className="w-10 h-10 bg-accent-soft border border-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm">
            <BarChart3 size={20} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-4 py-2 bg-white border-b border-border space-x-4 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Visão Geral', icon: Activity },
          { id: 'financial', label: 'Financeiro', icon: DollarSign },
          { id: 'units', label: 'Unidades', icon: Building2 }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'overview' | 'financial' | 'units')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-accent text-white shadow-lg shadow-accent/20' 
                : 'bg-bg-main text-ink-muted hover:bg-border'
            }`}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
        
        {currentCampaignId && (
          <button
            onClick={() => setFilterByCampaign(!filterByCampaign)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border ${
              filterByCampaign 
                ? 'bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-200' 
                : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
            }`}
          >
            <Activity size={14} />
            <span>{filterByCampaign ? 'Filtrado por Evento' : 'Filtrar por Evento'}</span>
          </button>
        )}
      </div>

      {/* Contêiner centralizado com largura máxima controlada e margens automáticas */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-24 w-full"
        style={{ maxWidth: '1200px', margin: '0 auto' }}
      >
        {activeTab === 'overview' && (
          <>
            {/* Distribuição vertical limpa (gap: 20px) entre o card azul de 'INVENTÁRIO' e o card de 'ETIQUETAR' */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* GBR Expert v25: Quick Action - INICIAR INVENTÁRIO (Card Azul) */}
              <div className="relative group cursor-pointer active:scale-[0.98] transition-all" onClick={onOpenInventory}>
                <div className="absolute inset-0 bg-gradient-to-br from-accent to-blue-700 rounded-[2.5rem] shadow-xl shadow-accent/20 border border-white/20 overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-white">
                     <CheckCircle2 size={120} />
                  </div>
                </div>
                <div className="relative p-8 flex items-center justify-between">
                  <div>
                    <h3 className="text-white text-xl font-black uppercase tracking-tight mb-1">INVENTÁRIO</h3>
                    <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Conferência Física de Campo</p>
                  </div>
                  <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/20 group-hover:bg-white/20 transition-colors">
                    <ArrowUpRight size={28} />
                  </div>
                </div>
              </div>

              {/* GBR Expert v25: Quick Action - ETIQUETAR (Card Branco) */}
              <div className="relative group cursor-pointer active:scale-[0.98] transition-all" onClick={onOpenLabeling}>
                <div className="absolute inset-0 bg-white rounded-[2.5rem] shadow-sm border border-border overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform text-accent">
                     <AlertTriangle size={120} />
                  </div>
                </div>
                <div className="relative p-8 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-blue-50 rounded-[1.5rem] flex items-center justify-center text-accent border border-blue-100 shadow-inner">
                      <TrendingUp size={32} />
                    </div>
                    <div>
                      <h3 className="text-ink text-xl font-black uppercase tracking-tight mb-1">ETIQUETAR</h3>
                      <p className="text-ink-muted text-[10px] font-bold uppercase tracking-widest">Itens sem Plaqueta</p>
                    </div>
                  </div>
                  <div className="w-14 h-14 bg-bg-main rounded-2xl flex items-center justify-center text-ink-muted border border-border group-hover:bg-accent group-hover:text-white transition-all duration-300">
                    <ArrowUpRight size={28} />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Painel de Conformidade e Atalhos de Conectividade (Kardek v2.6) */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-[2rem] p-6 shadow-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
                    <Activity size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#94A3B8]">Conectividade e Governança</h3>
                    <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Laudos CPC & Malha de Auditoria</p>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[7px] font-black uppercase text-emerald-400 tracking-widest">
                  Ativo Geral
                </div>
              </div>

              {/* Seção CPC 27 / CPC 01 */}
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1.5 align-middle">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">CPC 01 / CPC 27 (Impairment & Depreciação)</span>
                  </div>
                  <p className="text-[10px] text-slate-300 leading-relaxed font-medium">
                    {stats.divergencia > 0 
                      ? `Conformidade Física: ${stats.divergencia} ativos apresentam divergências de plaqueta ou localidade e precisam de saneamento contábil.` 
                      : 'Nenhuma divergência crítica pendente verificada de forma atômica nesta planta física.'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  {onNavigate && (
                    <button 
                      onClick={() => handleNavigate(AppScreen.ACCOUNT_RECONCILIATION)}
                      className="w-full md:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all text-center cursor-pointer border border-slate-700"
                      id="dashboard-btn-reconciliacao"
                    >
                      CONCILIAÇÃO POR CONTAS
                    </button>
                  )}
                  {onNavigate && (
                    <button 
                      onClick={() => handleNavigate(AppScreen.IMPAIRMENT_REPORT)}
                      className="w-full md:w-auto px-4 py-2.5 bg-accent hover:bg-accent-soft text-white hover:text-accent rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all text-center cursor-pointer"
                      id="dashboard-btn-impairment"
                    >
                      RECONCILIAÇÃO CONTÁBIL (CPC 01 / CPC 27)
                    </button>
                  )}
                </div>
              </div>

              {/* Seção Sincronização Delta e Logs de Auditoria - CSS Grid com repeat(auto-fit, minmax(280px, 1fr)) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {onNavigate && (
                  <button 
                    onClick={() => handleNavigate(AppScreen.SYNC_MANAGER)}
                    className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between text-left active:scale-[0.98] transition-all hover:border-slate-700 cursor-pointer"
                    id="dashboard-btn-sync"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                        <Activity size={14} />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-slate-200 uppercase tracking-widest block">Sincronização Delta</span>
                        <span className="text-[7px] text-slate-500 uppercase font-bold mt-0.5">Fila de nuvem (Supabase)</span>
                      </div>
                    </div>
                    <ArrowUpRight size={14} className="text-slate-500" />
                  </button>
                )}

                {onNavigate && (
                  <button 
                    onClick={() => handleNavigate(AppScreen.AUDIT_LOGS)}
                    className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between text-left active:scale-[0.98] transition-all hover:border-slate-700 cursor-pointer"
                    id="dashboard-btn-logs"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                        <History size={14} />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-slate-200 uppercase tracking-widest block">Trilha de Auditoria</span>
                        <span className="text-[7px] text-slate-500 uppercase font-bold mt-0.5">Logs atômicos de mudanças</span>
                      </div>
                    </div>
                    <ArrowUpRight size={14} className="text-slate-500" />
                  </button>
                )}
              </div>

              {/* Ajuste de Perímetro GPS */}
              {onNavigate && (
                <button 
                  onClick={() => handleNavigate(AppScreen.UNIT_CONFIGURATOR)}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  id="dashboard-btn-gps"
                >
                  <MapPin size={12} className="text-slate-500" />
                  Ajustar Perímetro Virtual (GPS Geofencing)
                </button>
              )}
            </div>

            {/* Main KPI Card */}
            <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[10px] font-bold text-ink uppercase tracking-[0.2em] mb-1">Eficiência de Inventário</h3>
                  <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Progresso da Base Ativa</p>
                </div>
                <div className="w-12 h-12 bg-accent-soft rounded-2xl flex items-center justify-center text-accent">
                  <TrendingUp size={24} />
                </div>
              </div>

              <div className="flex items-center space-x-8">
                <div className="relative w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Conferido', value: stats.conferidoAtivos },
                          { name: 'Pendente', value: stats.totalAtivos - stats.conferidoAtivos }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#3b82f6" />
                        <Cell fill="#f1f5f9" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-ink">{stats.percConferido}%</span>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                      <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Conferidos</span>
                    </div>
                    <span className="text-xs font-bold text-ink">{stats.conferidoAtivos}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-slate-200" />
                      <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Pendentes</span>
                    </div>
                    <span className="text-xs font-bold text-ink">{stats.totalAtivos - stats.conferidoAtivos}</span>
                  </div>
                  <div className="h-1 w-full bg-bg-main rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-accent" style={{ width: `${stats.percConferido}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Status Distribution Chart */}
            <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <PieChartIcon size={18} className="text-accent" />
                  <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest">Distribuição por Status</h3>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.statusDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {stats.statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Audit Activity Chart */}
            <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <History size={18} className="text-accent" />
                  <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest">Atividade por Usuário</h3>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={auditActivityData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 8 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="count" name="Alterações" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Divergência"
                value={stats.divergencia}
                total={stats.totalAtivos}
                colorClass="bg-rose-400"
                icon={ShieldAlert}
                onHintTrigger={handleHint}
                onClick={() => handleExport(a => a.TAG_INVENTARIO === TagInventario.DIVERGENCIA, 'DIVERGENCIAS')}
              />
              <StatCard
                label="Novo Item"
                value={stats.novoItem}
                total={stats.totalAtivos}
                colorClass="bg-emerald-400"
                icon={CheckCircle2}
                onHintTrigger={handleHint}
                onClick={() => handleExport(a => a.TAG_INVENTARIO === TagInventario.NOVO_ITEM, 'NOVOS_ITENS')}
              />
              <StatCard
                label="Falta Etiquetar"
                value={stats.faltaEtiquetar}
                total={stats.totalAtivos}
                colorClass="bg-amber-400"
                icon={AlertTriangle}
                onHintTrigger={handleHint}
                onClick={() => handleExport(a => a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR, 'FALTA_ETIQUETAR')}
              />
              <StatCard
                label="Adotado"
                value={stats.adotado}
                total={stats.totalAtivos}
                colorClass="bg-sky-400"
                icon={MapPin}
                onHintTrigger={handleHint}
                onClick={() => handleExport(a => a.TAG_INVENTARIO === TagInventario.ADOTADO, 'ADOTADOS')}
              />
            </div>
          </>
        )}

        {activeTab === 'financial' && (
          <div className="space-y-6 animate-slideUp">
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <DollarSign size={20} />
                  </div>
                  <div className="flex items-center space-x-1 text-emerald-600">
                    <ArrowUpRight size={14} />
                    <span className="text-[8px] font-bold uppercase tracking-widest">Valor Total</span>
                  </div>
                </div>
                <h4 className="text-3xl font-bold text-ink tracking-tight mb-1">{formatCurrency(stats.totalValue)}</h4>
                <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">Base de Aquisição Consolidada</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                      <ArrowDownRight size={16} />
                    </div>
                  </div>
                  <h4 className="text-lg font-bold text-ink mb-1">{formatCurrency(stats.depreciatedValue)}</h4>
                  <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Depreciação Acumulada</p>
                </div>
                <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                      <TrendingUp size={16} />
                    </div>
                  </div>
                  <h4 className="text-lg font-bold text-ink mb-1">{formatCurrency(stats.residualValue)}</h4>
                  <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Valor Residual Líquido</p>
                </div>
              </div>
            </div>

            {/* Value Composition Chart */}
            <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm">
              <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest mb-6">Composição de Valor</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Aquisição', value: stats.totalValue },
                    { name: 'Depreciação', value: stats.depreciatedValue },
                    { name: 'Residual', value: stats.residualValue }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                    <YAxis hide />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} /* eslint-disable-line @typescript-eslint/no-explicit-any */ />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                      { [0, 1, 2].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : index === 1 ? '#f59e0b' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'units' && (
          <div className="space-y-6 animate-slideUp">
            {/* Unit Progress Chart */}
            <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm">
              <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest mb-6">Progresso por Unidade (Top 10)</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.unitData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 8 }} width={80} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="conferido" name="Conferido" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="total" name="Total" stackId="a" fill="#f1f5f9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed Unit List */}
            <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm space-y-4">
              <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest mb-2">Ranking de Performance</h3>
              {stats.unitData.map((unit, idx) => {
                const perc = Math.round((unit.conferido / unit.total) * 100);
                return (
                  <div key={idx} className="flex items-center justify-between p-3 bg-bg-main rounded-2xl border border-border/50">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-white border border-border rounded-lg flex items-center justify-center text-[10px] font-bold text-ink">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-ink uppercase truncate max-w-[120px]">{unit.name}</p>
                        <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">{unit.conferido} de {unit.total} itens</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold ${perc === 100 ? 'text-emerald-600' : 'text-ink'}`}>{perc}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Activity (Always visible at bottom) */}
        <section className="bg-white border border-border rounded-[2.5rem] p-8 shadow-sm modern-card space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20 shadow-sm">
                <History size={20} />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-ink uppercase tracking-[0.2em]">Atividade Recente</h3>
                <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Últimas 5 alterações</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, idx) => (
                <div key={idx} className="flex items-start space-x-4 group">
                  <div className="w-1 h-12 bg-border group-hover:bg-accent transition-colors rounded-full mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] font-black text-accent uppercase tracking-widest">{activity.action}</span>
                      <span className="text-[7px] font-bold text-ink-muted uppercase">{new Date(activity.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-[10px] font-bold text-ink truncate uppercase tracking-tight">{activity.details}</p>
                    <div className="flex items-center space-x-1.5 mt-1">
                      <User size={8} className="text-ink-muted" />
                      <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">{activity.user}</span>
                      <span className="text-[7px] font-bold text-accent/50 uppercase tracking-widest ml-auto">TAG: {activity.assetTag || '---'}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center">
                <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em]">Nenhuma atividade registrada</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Hint Overlay */}
      {hintOverlay && (
        <div 
          className="fixed inset-0 z-[500] bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-8 animate-fadeIn"
          onClick={() => setHintOverlay(null)}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl animate-slideUp relative overflow-hidden modern-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-2.5 bg-accent" />
            <button 
              onClick={() => setHintOverlay(null)}
              className="absolute top-8 right-8 p-3 bg-accent-soft border border-accent/10 rounded-2xl text-accent active:scale-90 shadow-sm"
            >
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 bg-accent-soft rounded-[2rem] flex items-center justify-center text-accent mb-6 border border-accent/10 shadow-sm">
                <Info size={36} />
              </div>
              <span className="text-[11px] font-bold text-ink-muted uppercase tracking-[0.3em] mb-2">Critério de Auditoria</span>
              <h3 className="text-2xl font-bold text-ink uppercase tracking-tight">{hintOverlay.label}</h3>
            </div>

            <p className="text-sm font-medium text-ink-muted leading-relaxed text-center italic px-2">
              &quot;{hintOverlay.text}&quot;
            </p>

            <div className="mt-10 pt-8 border-t border-accent/10 flex justify-center">
              <button 
                onClick={() => setHintOverlay(null)}
                className="w-full py-5 bg-accent text-white rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] active:scale-95 shadow-lg shadow-accent/20"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
