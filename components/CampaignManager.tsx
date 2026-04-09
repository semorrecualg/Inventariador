
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
  ArrowLeft
} from 'lucide-react';
import { User, InventoryCampaign, CampaignStatus } from '../types';
import { createCampaign, updateCampaignStatus, fetchCampaignStats } from '../services/supabaseService';

interface CampaignManagerProps {
  user: User | null;
  onBack: () => void;
  onActivate: (campaignId: string) => void;
  currentCampaignId?: string;
  availableUnits?: string[];
  campaigns?: InventoryCampaign[];
  onRefresh?: () => void;
  initialUnit?: string | null;
}

const CampaignManager: React.FC<CampaignManagerProps> = ({ 
  user, 
  onBack, 
  onActivate, 
  currentCampaignId, 
  availableUnits = [],
  campaigns = [],
  onRefresh,
  initialUnit
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [newCampaignUnit, setNewCampaignUnit] = useState<string>(initialUnit || '');
  const [selectedCampaign, setSelectedCampaign] = useState<InventoryCampaign | null>(null);
  const [stats, setStats] = useState<{total: number, inventoried: number, divergences: number} | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    setIsSaving(true);
    try {
      const isAdmin = user?.isAdmin || user?.role === 'ADMIN' || user?.role === 'MASTER' || user?.email?.toLowerCase() === 'semorr@gmail.com';
      let tenantId = (user?._tenantid || user?.tenantid || '').trim();
      if (!tenantId && isAdmin) tenantId = 'CICOPAL';

      const newCampaign: Partial<InventoryCampaign> = {
        name: newCampaignName.trim(),
        description: newCampaignDesc.trim(),
        status: CampaignStatus.ACTIVE,
        _tenantid: tenantId,
        _unitid: (newCampaignUnit || user?._unitid || user?.unitid || 'MATRIZ').trim(),
        tenantid: tenantId,
        unit_id: (newCampaignUnit || user?._unitid || user?.unitid || 'MATRIZ').trim(),
        created_by: (user?.email || 'admin').toLowerCase(),
        start_date: new Date().toISOString()
      };

      const result = await createCampaign(newCampaign);
      if (result) {
        if (onRefresh) await onRefresh();
        setIsCreating(false);
        setNewCampaignName('');
        setNewCampaignDesc('');
        setNewCampaignUnit('');
        setSuccessMessage('Campanha criada com sucesso');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao criar campanha:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: CampaignStatus) => {
    const success = await updateCampaignStatus(id, status);
    if (success) {
      setSuccessMessage('Status atualizado');
      setTimeout(() => setSuccessMessage(null), 3000);
      if (onRefresh) onRefresh();
      if (selectedCampaign?.id === id) {
        setSelectedCampaign({ ...selectedCampaign, status });
      }
    }
  };

  const handleSelectCampaign = async (campaign: InventoryCampaign) => {
    setSelectedCampaign(campaign);
    const tenantId = user?._tenantid || user?.tenantid;
    if (tenantId) {
      setStatsLoading(true);
      const campaignStats = await fetchCampaignStats(campaign.id, tenantId);
      setStats(campaignStats);
      setStatsLoading(false);
    }
  };

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case CampaignStatus.ACTIVE: 
        return <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">Ativa</span>;
      case CampaignStatus.CLOSED: 
        return <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20">Encerrada</span>;
      default: 
        return <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px] font-bold border border-white/10">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-200 font-sans overflow-hidden">
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
              {selectedCampaign ? 'Detalhes' : 'Eventos de Inventário'}
            </h1>
            {!selectedCampaign && (
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Gestão de Campanhas</p>
            )}
          </div>
        </div>
        <button 
          onClick={handleRefresh}
          className={`p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`}
        >
          <RefreshCw size={18} strokeWidth={1.5} />
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
                  <p>TENANT: {user?._tenantid || 'N/A'}</p>
                  <p>COUNT: {campaigns.length}</p>
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
                {selectedCampaign.status === CampaignStatus.ACTIVE && (
                  <button 
                    onClick={() => onActivate(selectedCampaign.id)}
                    className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      currentCampaignId === selectedCampaign.id 
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                        : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 active:scale-[0.98]'
                    }`}
                  >
                    {currentCampaignId === selectedCampaign.id ? <CheckCircle2 size={18} /> : <Activity size={18} />}
                    {currentCampaignId === selectedCampaign.id ? 'Campanha Ativa' : 'Ativar para Inventário'}
                  </button>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                  {selectedCampaign.status === CampaignStatus.ACTIVE ? (
                    <button 
                      onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.CLOSED)}
                      className="py-3.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold text-xs hover:bg-white/10 transition-all"
                    >
                      Encerrar
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.ACTIVE)}
                      className="py-3.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold text-xs hover:bg-white/10 transition-all"
                    >
                      Reabrir
                    </button>
                  )}
                  <button 
                    onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.ARCHIVED)}
                    className="py-3.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold text-xs hover:bg-white/10 transition-all"
                  >
                    Arquivar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {campaigns.length === 0 ? (
              <div className="py-20 flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-slate-700">
                  <BarChart3 size={40} strokeWidth={1} />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-bold text-white">Nenhuma campanha</p>
                  <p className="text-sm text-slate-500 max-w-[240px] font-medium">
                    Inicie um novo evento de inventário para começar a coletar dados.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map(campaign => (
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
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl font-bold text-sm shadow-xl shadow-blue-600/20 hover:from-blue-500 hover:to-blue-400 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Nova Campanha</span>
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
              className="w-full max-w-lg bg-[#1E293B] rounded-t-[2.5rem] sm:rounded-3xl p-8 shadow-2xl border-t border-white/10"
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
                    className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600"
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
                    className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/50 appearance-none transition-all"
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
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-blue-600/20 hover:bg-blue-500 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <span>Criar Campanha</span>}
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
      </AnimatePresence>
    </div>
  );
};

export default CampaignManager;
