import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  BarChart3, 
  ChevronRight,
  Loader2,
  Activity,
  RefreshCw,
  ChevronDown,
  X,
  ArrowLeft,
  Trash2,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { User, InventoryCampaign, CampaignStatus, AppScreen } from '../types';
import { isAdminUser } from '../utils/authUtils';
import { createCampaign, updateCampaignStatus, fetchCampaignStats, deleteCampaign, getCampaignSnapshot, createCampaignSnapshot } from '../services/supabaseService';
import { localDb } from '../services/localDbService';
import { Device } from '@capacitor/device';
import { logger } from '../utils/logger';

interface CampaignManagerProps {
  user: User | null;
  onBack: () => void;
  onActivate: (campaignId: string) => void;
  currentCampaignId?: string;
  availableUnits?: string[];
  campaigns?: InventoryCampaign[];
  onRefresh?: () => void;
  initialUnit?: string | null;
  tenantId?: string | null;
  unitId?: string | null;
  databaseMode?: string;
}

const CampaignManager: React.FC<CampaignManagerProps> = ({ 
  user, 
  onBack, 
  onActivate, 
  currentCampaignId, 
  availableUnits = [],
  campaigns = [],
  onRefresh,
  initialUnit,
  tenantId: propsTenantId
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [newCampaignUnit, setNewCampaignUnit] = useState<string>(initialUnit || '');

  // Sincroniza unidade inicial quando o prop muda (ex: após refresh)
  React.useEffect(() => {
    if (initialUnit && !newCampaignUnit) {
      setNewCampaignUnit(initialUnit);
    }
  }, [initialUnit]);

  const [selectedCampaign, setSelectedCampaign] = useState<InventoryCampaign | null>(null);
  const [stats, setStats] = useState<{total: number, inventoried: number, divergences: number} | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [isBatteryAlertOpen, setIsBatteryAlertOpen] = useState(false);

  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Sincronização Local para Resposta Instantânea v25.50
  const [localCampaigns, setLocalCampaigns] = useState<InventoryCampaign[]>(campaigns);

  // CORREÇÃO DA LEITURA LOCAL E RENDERIZAÇÃO CENTRAL:
  // Carrega as campanhas ativas diretamente da tabela local via Dexie/localDb nativo
  // com a tranca de isolamento multidomínio (tenant_id / unit_id)
  const fetchLocalCampaignsOnScreen = async () => {
    setIsRefreshing(true);
    try {
      const currentTenant = (propsTenantId || user?._tenantid || user?.tenantId || user?.tenantid || 'CICOPAL').trim();
      const currentFilial = (initialUnit || '').trim();
      
      logger.info(`>>> [Dexie Native] Lendo campanhas para o Tenant: ${currentTenant}, Filial: ${currentFilial}`);
      
      const parsedCampaigns = await localDb.campaigns.toArray(currentTenant, currentFilial);
      logger.info(`>>> [Dexie Native] Campanhas lidas do banco local:`, parsedCampaigns);
      
      setLocalCampaigns(parsedCampaigns);
      return parsedCampaigns;
    } catch (err) {
      logger.error(`>>> [Dexie Native] Erro na leitura automática:`, err);
      if (campaigns && campaigns.length > 0) {
        setLocalCampaigns(campaigns);
      }
      return campaigns;
    } finally {
      setIsRefreshing(false);
    }
  };

  React.useEffect(() => {
    fetchLocalCampaignsOnScreen();
  }, [initialUnit, propsTenantId]);

  React.useEffect(() => {
    if (campaigns && !isRefreshing && !isSaving) {
      setLocalCampaigns(campaigns);
    }
  }, [campaigns, isRefreshing, isSaving]);

  // OPERACIONALIZAÇÃO DO BOTÃO REFRESH:
  // Dispara nova consulta direta ao SQLite local, atualiza o estado e força a renderização
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      await fetchLocalCampaignsOnScreen();
    } catch (err) {
      logger.error(">>> [Refresh] Erro ao atualizar dados:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaignName) return;
    
    // SISTEMA DE PREVENÇÃO DE CORRUPÇÃO (v2.6 Core): Validação de Bateria do Ecossistema
    interface BatteryManager {
      level: number;
      charging: boolean;
    }
    interface NavigatorWithBattery {
      getBattery?: () => Promise<BatteryManager>;
    }

    let batteryLevel = 1.0;
    let isCharging = true;
    try {
      const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithBattery) : null;
      if (nav && typeof nav.getBattery === 'function') {
        const battery = await nav.getBattery();
        batteryLevel = battery.level ?? 1.0;
        isCharging = battery.charging ?? true;
      }
    } catch (err) {
      logger.warn('>>> [Battery Safety] Erro na leitura de bateria:', err);
    }

    if (batteryLevel < 0.05 && !isCharging) {
      setIsBatteryAlertOpen(true);
      return;
    }
    
    const isAdmin = !!(isAdminUser(user));
    let tenantId = (propsTenantId || user?._tenantid || user?.tenantId || user?.tenantid || '').trim();
    if (!tenantId && isAdmin) tenantId = 'CICOPAL';

    if (!tenantId || tenantId === 'N/A') {
      setErrorMessage('ERRO DE GOVERNANÇA: Tenant não identificado. Ação bloqueada.');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    setIsSaving(true);
    try {
      const finalUnit = newCampaignUnit.trim();
      logger.info(`>>> [Governance] Preparando criação de campanha. Tenant: ${tenantId}, Unit: ${finalUnit || 'TODAS'}`);
      
      const newCampaign: Partial<InventoryCampaign> = {
        name: newCampaignName.trim(),
        description: newCampaignDesc.trim(),
        status: CampaignStatus.CREATED,
        _tenantid: tenantId,
        _unitid: finalUnit,
        tenant_id: tenantId,
        unit_id: finalUnit,
        created_by: (user?.email || 'admin').toLowerCase(),
        start_date: new Date().toISOString()
      };

      const result = await createCampaign(newCampaign);
      if (result) {
        setLocalCampaigns(prev => [result, ...prev]);
        
        if (onRefresh) await onRefresh();
        setIsCreating(false);
        setNewCampaignName('');
        setNewCampaignDesc('');
        setNewCampaignUnit(''); 
        setSuccessMessage('Campanha criada com sucesso');
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchLocalCampaignsOnScreen();
      } else {
        setErrorMessage('Erro ao criar campanha');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (err) {
      logger.error('Erro ao criar campanha:', err);
      setErrorMessage('Erro técnico ao criar campanha');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // ATIVAÇÃO OPERACIONAL E SEGURA DO BOTÃO "EXCLUIR CAMPANHA" (Hardware check e SQL)
  const executeDeleteCampaign = async (campaignId: string) => {
    // 4. RESTRANCA DE HARDWARE DE DISCO (Core v2.6):
    let isLowBattery = false;
    try {
      const batteryInfo = await Device.getBatteryInfo();
      const level = batteryInfo.batteryLevel ?? (batteryInfo as { batteryLevel?: number; level?: number }).level ?? 1.0;
      const isPlugged = batteryInfo.isCharging ?? (batteryInfo as { isCharging?: boolean; isPlugged?: boolean }).isPlugged ?? true;
      if (level < 0.05 && !isPlugged) {
        isLowBattery = true;
      }
    } catch (err) {
      logger.warn(">>> [Hardware Check] Erro na requisição Device.getBatteryInfo():", err);
      try {
        const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { getBattery?: () => Promise<{ level?: number; charging?: boolean }> }) : null;
        if (nav && typeof nav.getBattery === 'function') {
          const battery = await nav.getBattery();
          const level = battery.level ?? 1.0;
          const isPlugged = battery.charging ?? true;
          if (level < 0.05 && !isPlugged) {
            isLowBattery = true;
          }
        }
      } catch (e2) {
        logger.warn(">>> [Hardware Check] Erro de fallback navigator:", e2);
      }
    }

    if (isLowBattery) {
      setIsConfirmDeleteOpen(false);
      setDeletingCampaignId(null);
      setIsBatteryAlertOpen(true);
      return;
    }

    setIsSaving(true);
    try {
      logger.info(`>>> [Dexie] Executando deleção estrita para ID=${campaignId}`);
      
      await localDb.campaigns.delete(campaignId);
      
      // Limpeza de ativos relacionados vinculados a essa campanha
      await localDb.assets.removeCampaignFromAssets(campaignId);
      
      // Também deleta no Supabase em background para continuar funcionando sincronizado se online
      try {
        await deleteCampaign(campaignId);
      } catch (sbErr) {
        logger.warn(">>> [Supabase Sync] Deletar campanha remoto indisponível:", sbErr);
      }

      setSuccessMessage('Campanha excluída com sucesso');
      setTimeout(() => setSuccessMessage(null), 3000);

      // Pós-deleção, limpa states e fecha modais/fichas
      setIsConfirmDeleteOpen(false);
      setDeletingCampaignId(null);
      setSelectedCampaign(null);

      // Re-fetch automático para limpar a tela ou usar navegação se zerar
      const remaining = await fetchLocalCampaignsOnScreen();
      if (remaining.length === 0) {
        logger.info(">>> [Governance] Lista de campanhas zerou. Voltando.");
        onBack();
      }
      
    } catch (err) {
      logger.error('>>> [Dexie] Erro ao excluir campanha:', err);
      setErrorMessage('Erro técnico ao persistir exclusão no Dexie');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: CampaignStatus) => {
    logger.info(`>>> [Governance] Iniciando transição de status para ID: ${id}. Aguardando confirmação do banco...`);
    setUpdatingStatusId(id);
    
    try {
      if (status === CampaignStatus.CLOSED) {
        const snapSuccess = await createCampaignSnapshot(id, user?.email || 'admin');
        if (!snapSuccess) {
          logger.warn('>>> [Governance] Falha ao criar snapshot. Continuando encerramento mas sem histórico imutável.');
        }
      }

      const success = await updateCampaignStatus(id, status, user?.email || 'admin');
      if (success) {
        if (onRefresh) await onRefresh();
        await fetchLocalCampaignsOnScreen();
        
        logger.info('>>> [Database] Operação confirmada. Atualizando interface...');
        setSuccessMessage('Operação confirmada no banco');
        setTimeout(() => setSuccessMessage(null), 3000);
        
        if (selectedCampaign?.id === id) {
          setSelectedCampaign({ ...selectedCampaign, status });
        }
      } else {
        setErrorMessage('Erro ao persistir alteração no banco');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (err) {
      logger.error('>>> [Database] Falha crítica na conexão:', err);
      setErrorMessage('Erro de rede: Banco indisponível');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSelectCampaign = async (campaign: InventoryCampaign) => {
    setSelectedCampaign(campaign);
    let tenantId = user?._tenantid || user?.tenantId || user?.tenantid;
    const isAdmin = isAdminUser(user);
    if (!tenantId && isAdmin) tenantId = 'CICOPAL';

    if (tenantId) {
      setStatsLoading(true);
      const campaignStats = await fetchCampaignStats(campaign.id, tenantId);
      setStats(campaignStats);
      setStatsLoading(false);
    }
  };

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case CampaignStatus.CREATED:
        return <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-bold border border-amber-500/20 uppercase tracking-tight">Criada</span>;
      case CampaignStatus.ACTIVE: 
        return <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20 uppercase tracking-tight">Ativa</span>;
      case CampaignStatus.CLOSED: 
        return <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20 uppercase tracking-tight">Encerrada</span>;
      default: 
        return <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px] font-bold border border-white/10">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-200 font-sans overflow-hidden safe-area-p relative">
      {/* Slim Header GBR v2.6 */}
      <header className="px-4 py-3 flex items-center justify-between border-b border-slate-800/60 bg-[#0F172A]/90 backdrop-blur-md sticky top-0 z-20">
        <button 
          onClick={selectedCampaign ? () => setSelectedCampaign(null) : onBack}
          className="w-10 h-10 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-800 rounded-xl flex items-center justify-center text-white active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        
        <div className="flex-1 text-center px-4 overflow-hidden">
          <h2 className="text-xs font-black text-white uppercase tracking-wider truncate">
            {initialUnit || '010101 - CICOPAL GO'}
          </h2>
          {(user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'MASTER' || user?.isAdmin) && (
            <div className="inline-flex items-center space-x-1 mt-0.5 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest leading-none">Bypass Admin</span>
            </div>
          )}
        </div>

        <button 
          onClick={handleRefresh}
          title="Atualizar"
          className="mr-2 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-800"
        >
          <RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={14} />
        </button>

        <div className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 shrink-0">
          <span className="text-[8px] font-black uppercase tracking-widest">GBR v2.6</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 pb-28 space-y-6">
        {/* Lista ou Detalhes */}
        {selectedCampaign ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-2">
                  {getStatusBadge(selectedCampaign.status)}
                  <h2 className="text-2xl font-bold text-white tracking-tight">{selectedCampaign.name}</h2>
                  <p className="text-sm text-slate-400 leading-relaxed font-medium">
                    {selectedCampaign.description || 'Sem descrição.'}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <BarChart3 size={24} strokeWidth={1.5} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total</p>
                  <p className="text-xl font-bold text-white">{statsLoading ? '...' : stats?.total || 0}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Conferidos</p>
                  <p className="text-xl font-bold text-blue-500">{statsLoading ? '...' : stats?.inventoried || 0}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Divergências</p>
                  <p className="text-xl font-bold text-rose-500">{statsLoading ? '...' : stats?.divergences || 0}</p>
                </div>
              </div>

              <div className="space-y-3">
                {(selectedCampaign.status === CampaignStatus.ACTIVE || selectedCampaign.status === CampaignStatus.CREATED) && (
                  <button 
                    disabled={updatingStatusId === selectedCampaign.id}
                    onClick={async () => {
                      if (selectedCampaign.status === CampaignStatus.CREATED) {
                        await handleUpdateStatus(selectedCampaign.id, CampaignStatus.ACTIVE);
                      } else {
                        onActivate(selectedCampaign.id);
                      }
                    }}
                    className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      updatingStatusId === selectedCampaign.id
                        ? 'bg-slate-700 text-slate-500 cursor-wait'
                        : selectedCampaign.status === CampaignStatus.CREATED
                          ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20 hover:bg-amber-500'
                          : currentCampaignId === selectedCampaign.id 
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                            : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 active:scale-[0.98]'
                    }`}
                  >
                    {updatingStatusId === selectedCampaign.id ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      selectedCampaign.status === CampaignStatus.CREATED ? <ShieldCheck size={18} /> : currentCampaignId === selectedCampaign.id ? <CheckCircle2 size={18} /> : <Activity size={18} />
                    )}
                    {updatingStatusId === selectedCampaign.id 
                      ? 'Processando no Banco...' 
                      : (selectedCampaign.status === CampaignStatus.CREATED ? 'Ativar Campanha' : currentCampaignId === selectedCampaign.id ? 'Campanha Ativa' : 'Ativar para Inventário')
                    }
                  </button>
                )}

                {selectedCampaign.status === CampaignStatus.CLOSED && (
                  <button 
                    onClick={async () => {
                        const snapshot = await getCampaignSnapshot(selectedCampaign.id);
                        if (snapshot && snapshot.assets_data) {
                            if (window.pushScreen) {
                                window.pushScreen(AppScreen.ASSET_REPORT_PRINT, { 
                                    assets: snapshot.assets_data,
                                    campaign: selectedCampaign,
                                    mode: 'FINAL',
                                    unitName: selectedCampaign._unitid || selectedCampaign.unit_id || 'UNIDADE GERAL',
                                    responsibleName: snapshot.closed_by
                                });
                            }
                        } else {
                            alert('Snapshot não encontrado para esta campanha.');
                        }
                    }}
                    className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                  >
                    <BarChart3 size={18} />
                    <span>Gerar Laudo Final (Snapshot)</span>
                  </button>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                  {selectedCampaign.status === CampaignStatus.ACTIVE ? (
                    <button 
                      disabled={updatingStatusId === selectedCampaign.id}
                      onClick={() => {
                        if (window.confirm('ENCERRAMENTO DE CAMPANHA:\n\nAo encerrar, o sistema irá "Congelar" (Snapshot) o estado atual de todos os ativos para auditoria. Nenhuma alteração posterior afetará o Laudo Final.\n\nDeseja prosseguir com o encerramento?')) {
                            handleUpdateStatus(selectedCampaign.id, CampaignStatus.CLOSED);
                        }
                      }}
                      className={`py-3.5 rounded-xl border font-bold text-xs transition-all flex items-center justify-center gap-2 flex-1 ${
                        updatingStatusId === selectedCampaign.id
                          ? 'bg-slate-700/50 border-slate-700 text-slate-500 animate-pulse'
                          : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500/20'
                      }`}
                    >
                      {updatingStatusId === selectedCampaign.id ? <Loader2 className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
                      Encerrar e Congelar
                    </button>
                  ) : (
                    <button 
                      disabled={updatingStatusId === selectedCampaign.id}
                      onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.ACTIVE)}
                      className={`py-3.5 rounded-xl border font-bold text-xs transition-all flex-1 ${
                        updatingStatusId === selectedCampaign.id
                          ? 'bg-slate-700/50 border-slate-700 text-slate-500 animate-pulse'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {updatingStatusId === selectedCampaign.id ? '...' : 'Reabrir'}
                    </button>
                  )}
                  <button 
                    disabled={updatingStatusId === selectedCampaign.id}
                    onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.ARCHIVED)}
                    className={`py-3.5 rounded-xl border font-bold text-xs transition-all flex-1 ${
                      updatingStatusId === selectedCampaign.id
                        ? 'bg-slate-700/50 border-slate-700 text-slate-500 animate-pulse'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {updatingStatusId === selectedCampaign.id ? '...' : 'Arquivar'}
                  </button>
                </div>

                {(isAdminUser(user)) && (
                  <button 
                    onClick={() => {
                      setDeletingCampaignId(selectedCampaign.id);
                      setIsConfirmDeleteOpen(true);
                    }}
                    disabled={isSaving}
                    className="w-full py-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 font-bold text-xs hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                    Excluir Campanha
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.16em] pb-2 border-b border-slate-800/60 mb-4 flex items-center justify-between">
              <span>CAMPANHAS DE AUDITORIA ATIVAS</span>
              {localCampaigns.length > 0 && (
                <span className="text-[9px] bg-blue-500/10 text-blue-400 font-bold px-2 py-0.5 rounded-full border border-blue-500/10">
                  {localCampaigns.length} EVENTO{localCampaigns.length !== 1 ? 'S' : ''}
                </span>
              )}
            </h2>
            {localCampaigns.length === 0 ? (
              <div className="py-20 flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-slate-700">
                  <BarChart3 size={40} strokeWidth={1} />
                </div>
                <div className="space-y-2">
                  <p className="text-xl font-black text-white uppercase tracking-tight">Nenhuma campanha</p>
                  <p className="text-sm text-slate-400 max-w-[280px] font-medium leading-relaxed">
                    Não há campanhas ativas. Crie um novo evento de inventário abaixo para iniciar a coleta de dados.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {localCampaigns.map(campaign => (
                  <motion.div 
                    key={campaign.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-900/50 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-all overflow-hidden relative"
                  >
                    {/* Linha Principal de Dados */}
                    <div 
                      onClick={() => handleSelectCampaign(campaign)}
                      className="flex items-start justify-between cursor-pointer group"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${
                          campaign.id === currentCampaignId 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          <Calendar size={20} strokeWidth={2} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
                            {campaign.name}
                          </h3>
                          <p className="text-xs text-slate-400 leading-normal line-clamp-2 max-w-[240px]">
                            {campaign.description || 'Sem descrição.'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {getStatusBadge(campaign.status)}
                            <span className="text-[9px] bg-slate-800 text-slate-400 font-mono px-1.5 py-0.5 rounded border border-slate-700/50">
                              {campaign._unitid || campaign.unit_id || 'TODAS'}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                              <Clock size={10} />
                              <span>{new Date(campaign.start_date).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Chevron para ver detalhes */}
                      <div className="text-slate-600 group-hover:text-blue-500 p-1 rounded-lg hover:bg-slate-800 transition-all">
                        <ChevronRight size={18} />
                      </div>
                    </div>

                    {/* Botões de Ação na Base do Card */}
                    <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-800/60">
                      {/* Ativar a Campanha */}
                      {campaign.id === currentCampaignId ? (
                        <div className="py-2 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 flex items-center justify-center gap-1.5">
                          <CheckCircle2 size={12} className="shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-wider">Campanha Ativa</span>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            if (campaign.status === CampaignStatus.CREATED) {
                              await handleUpdateStatus(campaign.id, CampaignStatus.ACTIVE);
                            }
                            onActivate(campaign.id);
                          }}
                          className="py-2 px-3 bg-blue-600 hover:bg-blue-500 border border-blue-500/40 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1"
                        >
                          <Activity size={12} />
                          <span>Ativar a Campanha</span>
                        </button>
                      )}

                      {/* Excluir Campanha */}
                      <button
                        onClick={() => {
                          setDeletingCampaignId(campaign.id);
                          setIsConfirmDeleteOpen(true);
                        }}
                        className="py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Action - Sticky absolute base GBR v2.6 */}
      {!selectedCampaign && !isCreating && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <button 
            onClick={() => setIsCreating(true)}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 text-white rounded-2xl font-black text-xs uppercase tracking-[0.18em] shadow-[0_8px_30px_rgba(16,185,129,0.35)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Iniciar Nova Auditoria</span>
          </button>
        </div>
      )}

      {/* Modal de Criação Minimalista */}
      <AnimatePresence>
        {isCreating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0F172A]/90 backdrop-blur-sm flex items-end sm:items-center justify-center"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-lg bg-[#1E293B] rounded-t-[2.5rem] sm:rounded-3xl p-8 shadow-2xl border-t border-white/10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-white tracking-tight">Nova Campanha</h2>
                <button onClick={() => setIsCreating(false)} className="p-2 rounded-full bg-white/5 text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Campanha</label>
                  <input 
                    type="text"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="Ex: INVENTÁRIO GERAL 2026"
                    className="w-full px-5 py-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-600 appearance-none uppercase"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Descrição / Objetivo</label>
                  <textarea 
                    value={newCampaignDesc}
                    onChange={(e) => setNewCampaignDesc(e.target.value)}
                    placeholder="E.g., Auditoria de ativos com etiquetas NFC/QRCode nas linhas..."
                    className="w-full px-5 py-4 bg-slate-950/60 border border-slate-800 rounded-2xl text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 h-28 transition-all placeholder:text-slate-600 resize-none uppercase"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Unidade Relacionada</label>
                  <div className="relative">
                    <select 
                      value={newCampaignUnit}
                      onChange={(e) => setNewCampaignUnit(e.target.value)}
                      className="w-full px-5 py-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 appearance-none transition-all uppercase"
                    >
                      <option value="">Todas as Unidades</option>
                      {availableUnits.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-500">
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleCreateCampaign}
                  disabled={!(newCampaignName.trim() && newCampaignDesc.trim()) || isSaving}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.18em] transition-all flex items-center justify-center gap-2 ${
                    (newCampaignName.trim() && newCampaignDesc.trim())
                      ? 'bg-[#22C55E] text-white hover:bg-[#16A34A] border border-[#4ADE80]/40 shadow-[0_8px_25px_rgba(34,197,94,0.35)] active:scale-[0.98]'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <span className="text-white font-black">Gravar Campanha (Disco Físico)</span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação Crítica para Exclusão de Campanha (Soberania de Ação GBR) */}
      <AnimatePresence>
        {isConfirmDeleteOpen && deletingCampaignId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[101] bg-black/95 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <Trash2 size={32} />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider text-rose-500">ALERTA CRÍTICO</h3>
                <p className="text-xs text-slate-300 font-bold leading-normal">
                  Atenção: Deseja realmente excluir esta campanha? Todos os dados coletados localmente serão apagados permanentemente!
                </p>
                <p className="text-[9px] text-slate-500 italic">
                  Esta ação executará uma instrução SQL DELETE atômica no armazenamento físico SQLite (.db) do dispositivo e não poderá ser desfeita.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => {
                    setIsConfirmDeleteOpen(false);
                    setDeletingCampaignId(null);
                  }}
                  className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs uppercase tracking-widest rounded-xl border border-slate-700 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => executeDeleteCampaign(deletingCampaignId)}
                  disabled={isSaving}
                  className="py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-xl border border-rose-500/40 shadow-[0_4px_15px_rgba(239,68,68,0.25)] transition-all active:scale-95 flex items-center justify-center gap-1"
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                  <span>Confirmar Exclusão</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Alerta de Proteção de Bateria Crítica */}
      <AnimatePresence>
        {isBatteryAlertOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-slate-900 border border-red-500/40 rounded-3xl p-6 shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <AlertCircle size={32} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Gravação Retida por Segurança</h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  A carga de bateria do dispositivo está abaixo de <span className="text-red-400 font-bold">5%</span> sem carregador conectado.
                </p>
                <p className="text-[9px] text-red-400 font-mono bg-red-950/40 border border-red-900/40 p-3 rounded-xl leading-normal text-left">
                  SISTEMA DE PREVENÇÃO DE CORRUPÇÃO (v2.6 Core): A operação de escrita de dados no SQLite local (.db) foi bloqueada preventivamente para salvaguardar a integridade de seus dados de inventário físico. Por favor, carregue o dispositivo.
                </p>
              </div>

              <button 
                onClick={() => setIsBatteryAlertOpen(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl border border-slate-700 active:scale-95 transition-all"
              >
                Ciente e Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast de Sucesso Minimalista */}
      <AnimatePresence>
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-6 right-6 z-50 pointer-events-none"
          >
            <div className="bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-xl flex items-center justify-center gap-3 border border-white/20">
              <CheckCircle2 size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">{successMessage}</span>
            </div>
          </motion.div>
        )}
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-6 right-6 z-50 pointer-events-none"
          >
            <div className="bg-rose-500 text-white px-6 py-3 rounded-xl shadow-xl flex items-center justify-center gap-3 border border-white/20">
              <X size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">{errorMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CampaignManager;
