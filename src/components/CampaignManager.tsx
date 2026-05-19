
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
  ShieldCheck
} from 'lucide-react';
import { User, InventoryCampaign, CampaignStatus, AppScreen } from '../types';
import { createCampaign, updateCampaignStatus, fetchCampaignStats, deleteCampaign, getCampaignSnapshot, createCampaignSnapshot } from '../services/supabaseService';

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
  tenantId: propsTenantId,
  unitId: propsUnitId,
  databaseMode
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
  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // Sincronização Local para Resposta Instantânea v25.50
  const [localCampaigns, setLocalCampaigns] = useState<InventoryCampaign[]>(campaigns);

  React.useEffect(() => {
    if (campaigns && !isRefreshing && !isSaving) {
      setLocalCampaigns(campaigns);
    }
  }, [campaigns, isRefreshing, isSaving]);

  // Use props if provided, otherwise fallback to user info
  const handleRefresh = async () => {

    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaignName) return;
    
    const isAdmin = !!(user?.isAdmin || user?.role === 'ADMIN' || user?.role === 'MASTER' || user?.email?.toLowerCase() === 'semorr@gmail.com');
    let tenantId = (propsTenantId || user?._tenantid || user?.tenantid || '').trim();
    if (!tenantId && isAdmin) tenantId = 'CICOPAL';

    if (!tenantId || tenantId === 'N/A') {
      setErrorMessage('ERRO DE GOVERNANÇA: Tenant não identificado. Ação bloqueada.');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    setIsSaving(true);
    try {
      const finalUnit = newCampaignUnit.trim();
      console.log(`>>> [Governance] Preparando criação de campanha. Tenant: ${tenantId}, Unit: ${finalUnit || 'TODAS'}`);
      
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
        // Atualização Otimista: garante que a UI reflita a criação ANTES do refresh terminar
        setLocalCampaigns(prev => [result, ...prev]);
        
        if (onRefresh) await onRefresh();
        setIsCreating(false);
        setNewCampaignName('');
        setNewCampaignDesc('');
        setNewCampaignUnit(''); 
        setSuccessMessage('Campanha criada com sucesso');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage('Erro ao criar campanha');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao criar campanha:', err);
      setErrorMessage('Erro técnico ao criar campanha');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita.')) return;
    
    setIsSaving(true);
    try {
      const success = await deleteCampaign(id);
      if (success) {
        setSuccessMessage('Campanha excluída');
        setTimeout(() => setSuccessMessage(null), 3000);
        setSelectedCampaign(null);
        if (onRefresh) await onRefresh();
      } else {
        setErrorMessage('Erro ao excluir campanha');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao excluir:', err);
      setErrorMessage('Erro técnico ao excluir');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: CampaignStatus) => {
    console.log(`>>> [Governance] Iniciando transição de status para ID: ${id}. Aguardando confirmação do banco...`);
    setUpdatingStatusId(id);
    
    try {
      // Regra: Se estiver fechando, cria o SNAPSHOT antes de mudar o status (Governança GBR)
      if (status === CampaignStatus.CLOSED) {
        const snapSuccess = await createCampaignSnapshot(id, user?.email || 'admin');
        if (!snapSuccess) {
          console.warn('>>> [Governance] Falha ao criar snapshot. Continuando encerramento mas sem histórico imutável.');
        }
      }

      const success = await updateCampaignStatus(id, status, user?.email || 'admin');
      if (success) {
        // REFRESH OBRIGATÓRIO: Buscamos a verdade do banco antes de qualquer mudança visual
        if (onRefresh) await onRefresh();
        
        console.log('>>> [Database] Operação confirmada. Atualizando interface...');
        setSuccessMessage('Operação confirmada no banco');
        setTimeout(() => setSuccessMessage(null), 3000);
        
        // Atualizamos o selecionado apenas após o refresh para garantir consistência
        if (selectedCampaign?.id === id) {
          setSelectedCampaign({ ...selectedCampaign, status });
        }
      } else {
        setErrorMessage('Erro ao persistir alteração no banco');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (err) {
      console.error('>>> [Database] Falha crítica na conexão:', err);
      setErrorMessage('Erro de rede: Banco indisponível');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSelectCampaign = async (campaign: InventoryCampaign) => {
    setSelectedCampaign(campaign);
    let tenantId = user?._tenantid || user?.tenantid;
    const isAdmin = user?.isAdmin || user?.role === 'ADMIN' || user?.role === 'MASTER' || user?.email?.toLowerCase() === 'semorr@gmail.com';
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
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-200 font-sans overflow-hidden safe-area-p">
      {/* Header Compacto */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={selectedCampaign ? () => setSelectedCampaign(null) : onBack}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-slate-400"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              {selectedCampaign ? 'Detalhes' : 'Eventos de Inventário v2.5'}
            </h1>
            {!selectedCampaign && (
              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Gestão de Campanhas (Soberania de Dados Móvel)</p>
            )}
          </div>
        </div>
        <button 
          onClick={handleRefresh}
          className={`p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 transition-all text-emerald-400`}
        >
          <RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={18} strokeWidth={1.5} />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Debug Minimalista */}
        {(user?.isAdmin || user?.role === 'ADMIN') && (
          <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
            <button 
              onClick={() => setIsDebugExpanded(!isDebugExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between text-slate-500 hover:text-slate-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Activity size={14} strokeWidth={1.5} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Debug</span>
              </div>
              <ChevronDown size={14} className={`transition-transform ${isDebugExpanded ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {isDebugExpanded && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4 font-mono text-[9px] text-emerald-500/80 space-y-1"
                >
                  <p>MODE: {databaseMode || 'INTERNAL'}</p>
                  <p>TENANT: {propsTenantId || user?._tenantid || user?.tenantid || 'N/A'}</p>
                  <p>COUNT: {localCampaigns.length}</p>
                  <p>UNIT: {propsUnitId || user?._unitid || user?.unitid || 'N/A'}</p>
                  
                  {errorMessage && <p className="text-rose-400 mt-2">ALERTA: {errorMessage}</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

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

                {(user?.isAdmin || user?.role === 'ADMIN' || user?.email?.toLowerCase() === 'semorr@gmail.com') && (
                  <button 
                    onClick={() => handleDeleteCampaign(selectedCampaign.id)}
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
                    onClick={() => handleSelectCampaign(campaign)}
                    className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex items-center justify-between hover:bg-white/10 transition-all cursor-pointer group shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                        campaign.status === CampaignStatus.ACTIVE ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/5 border-white/10 text-slate-500'
                      }`}>
                        <Calendar size={20} strokeWidth={1.5} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{campaign.name}</h3>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(campaign.status)}
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium uppercase tracking-tight">
                            <Clock size={12} strokeWidth={1.5} />
                            {new Date(campaign.start_date).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-slate-600 group-hover:text-blue-400 transition-all" />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Action */}
      {!selectedCampaign && !isCreating && (
        <div className="p-6 bg-[#0F172A]/80 backdrop-blur-md border-t border-white/5">
          <button 
            onClick={() => setIsCreating(true)}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span className="uppercase tracking-widest font-black">Iniciar Nova Auditoria</span>
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
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nome</label>
                  <input 
                    type="text"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="Ex: Inventário Geral 2024"
                    className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600 appearance-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Descrição</label>
                  <textarea 
                    value={newCampaignDesc}
                    onChange={(e) => setNewCampaignDesc(e.target.value)}
                    placeholder="Objetivo da campanha..."
                    className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/50 h-28 transition-all placeholder:text-slate-600 resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Unidade</label>
                  <select 
                    value={newCampaignUnit}
                    onChange={(e) => setNewCampaignUnit(e.target.value)}
                    className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/50 appearance-none transition-all"
                  >
                    <option value="">Todas as Unidades</option>
                    {availableUnits.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={handleCreateCampaign}
                  disabled={!newCampaignName || isSaving}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <span className="uppercase tracking-widest font-black">Gravar Campanha (Disco Físico)</span>}
                </button>
              </div>
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
