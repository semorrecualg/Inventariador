
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Plus, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Archive, 
  BarChart3, 
  ChevronRight,
  AlertTriangle,
  Loader2,
  Activity,
  Trash2,
  RefreshCw,
  Tag,
  MapPin,
  ChevronDown
} from 'lucide-react';
import BackButton from './BackButton';
import { User, InventoryCampaign, CampaignStatus } from '../types';
import { createCampaign, updateCampaignStatus, fetchCampaignStats, deleteCampaign } from '../services/supabaseService';

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

    // Tenta resolver o tenantId de várias formas
    const isAdmin = user?.isAdmin || user?.role === 'ADMIN' || user?.role === 'MASTER' || user?.email?.toLowerCase() === 'semorr@gmail.com';
    let tenantId = (user?._tenantid || user?.tenantid || '').trim();
    
    // Se for admin e não tiver tenantId direto, tenta pegar do array de tenants
    if (!tenantId && isAdmin && user?.tenants && user.tenants.length > 0) {
      tenantId = user.tenants[0];
    }

    // Se ainda estiver vazio e for admin, tenta o primeiro tenant do array ou CICOPAL como fallback seguro para este projeto
    if (!tenantId && isAdmin) {
      tenantId = 'CICOPAL'; 
    }

    if (!tenantId && !isAdmin) {
      console.error('Erro: Tenant ID não encontrado. Sua sessão pode ter expirado. Por favor, saia e entre novamente.');
      return;
    }

    setIsSaving(true);
    try {
      console.log('[CampaignManager] Criando campanha com User:', { 
        email: user?.email, 
        tenantId, 
        _tenantid: user?._tenantid, 
        tenantid: user?.tenantid 
      });
      
      const newCampaign: Partial<InventoryCampaign> = {
        name: newCampaignName.trim(),
        description: newCampaignDesc.trim(),
        status: CampaignStatus.ACTIVE,
        _tenantid: tenantId,
        _unitid: (newCampaignUnit || user?._unitid || user?.unitid || 'MATRIZ').trim(),
        tenantid: tenantId, // Legado
        unit_id: (newCampaignUnit || user?._unitid || user?.unitid || 'MATRIZ').trim(), // Legado
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
        setSuccessMessage('CAMPANHA CRIADA COM SUCESSO!');
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (err: unknown) {
      console.error('Erro ao criar campanha:', err);
      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error(`Erro ao criar campanha: ${errorMsg}\n\nO sistema tentou corrigir o erro automaticamente, mas falhou. Verifique se a tabela inventory_campaigns possui a coluna _tenantid.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    // Removido window.confirm para compatibilidade com iframe
    const success = await deleteCampaign(id);
    if (success) {
      setSuccessMessage('Campanha excluída com sucesso!');
      setTimeout(() => setSuccessMessage(null), 3000);
      setSelectedCampaign(null);
      if (onRefresh) onRefresh();
    } else {
      console.error('Erro ao excluir campanha.');
    }
  };

  const handleUpdateStatus = async (id: string, status: CampaignStatus) => {
    const success = await updateCampaignStatus(id, status);
    if (success) {
      setSuccessMessage('Status atualizado com sucesso!');
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

  const getStatusColor = (status: CampaignStatus) => {
    switch (status) {
      case CampaignStatus.ACTIVE: return 'bg-green-100 text-green-700 border-green-200';
      case CampaignStatus.CLOSED: return 'bg-blue-100 text-blue-700 border-blue-200';
      case CampaignStatus.ARCHIVED: return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg text-ink font-sans overflow-hidden">
      {/* Feedback de Sucesso */}
      {successMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border-2 border-emerald-400/50 backdrop-blur-md">
            <CheckCircle2 size={20} className="text-emerald-100" />
            <span className="font-black uppercase tracking-widest text-[10px]">{successMessage}</span>
          </div>
        </div>
      )}

      {/* Header Modernizado */}
      <header className="bg-slate-950 text-white px-6 pt-8 pb-10 flex flex-col gap-8 shadow-2xl z-10 relative overflow-hidden border-b border-white/5">
        {/* Decoração de Fundo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl -ml-24 -mb-24"></div>
        
        <div className="flex items-center justify-between relative z-10">
          <BackButton onClick={onBack} />
          {!isCreating && !selectedCampaign && (
            <button 
              onClick={() => setIsCreating(true)}
              className="bg-accent hover:bg-accent/90 text-white px-5 py-3 rounded-2xl transition-all shadow-xl shadow-accent/20 flex items-center gap-2 active:scale-95 group"
            >
              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center group-hover:rotate-90 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Nova Campanha</span>
            </button>
          )}
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-6 bg-accent rounded-full"></div>
            <p className="text-[10px] opacity-50 font-bold tracking-[0.3em] uppercase">
              Campaign Management System
            </p>
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">
            Eventos de <br />
            <span className="text-accent">Inventário</span>
          </h1>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Debug Info para Admin */}
        {(user?.isAdmin || user?.role === 'ADMIN' || user?.role === 'MASTER') && (
          <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[8px] border border-slate-800 shadow-inner mb-2">
            <div className="flex justify-between border-b border-slate-800 pb-1 mb-1">
              <span>DEBUG_INFO (ADMIN)</span>
              <span className="text-slate-500">v1.2</span>
            </div>
            <p>TENANT: {user?._tenantid || user?.tenantid || 'N/A'}</p>
            <p>CAMPAIGNS_COUNT: {campaigns.length}</p>
            <p>UNIT_ID_MAPPING: {campaigns.map(c => `${c.name.substring(0,5)}:${c._unitid || c.unit_id || 'N/A'}`).join(' | ')}</p>
          </div>
        )}

        {isCreating ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-line rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1.5 bg-accent"></div>
            
            <div className="space-y-1">
              <h2 className="text-2xl font-black uppercase tracking-tighter text-ink">Nova Campanha</h2>
              <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">Configuração de Evento de Inventário</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-ink uppercase tracking-widest ml-1">Nome da Campanha</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-accent">
                    <Tag size={16} />
                  </div>
                  <input 
                    type="text"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="EX: INVENTÁRIO GERAL 2024"
                    className="w-full pl-12 pr-4 py-4 bg-bg border border-line rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all placeholder:opacity-30"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-ink uppercase tracking-widest ml-1">Descrição / Objetivo</label>
                <textarea 
                  value={newCampaignDesc}
                  onChange={(e) => setNewCampaignDesc(e.target.value)}
                  placeholder="DESCREVA O ESCOPO DESTA CAMPANHA..."
                  className="w-full p-4 bg-bg border border-line rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/20 h-32 transition-all placeholder:opacity-30 resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-ink uppercase tracking-widest ml-1">Unidade Operacional</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-accent">
                    <MapPin size={16} />
                  </div>
                  <select 
                    value={newCampaignUnit}
                    onChange={(e) => setNewCampaignUnit(e.target.value)}
                    className="w-full pl-12 pr-10 py-4 bg-bg border border-line rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none transition-all"
                  >
                    <option value="">TODAS AS UNIDADES (GLOBAL)</option>
                    {availableUnits.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-4 border border-line rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-bg transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCreateCampaign}
                  disabled={!newCampaignName || isSaving}
                  className="flex-1 py-4 bg-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-xl shadow-accent/20 active:scale-95"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Criar Campanha</span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        ) : selectedCampaign ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4 mb-2">
              <BackButton onClick={() => setSelectedCampaign(null)} />
              <div className="h-px flex-1 bg-line/50"></div>
              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Detalhes da Campanha</span>
            </div>

            <div className="bg-white border border-line rounded-3xl p-6 shadow-sm space-y-8">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getStatusColor(selectedCampaign.status)}`}>
                      {selectedCampaign.status}
                    </span>
                    <span className="text-[10px] text-ink-muted font-mono">
                      Início: {new Date(selectedCampaign.start_date).toLocaleDateString()}
                    </span>
                  </div>
                  <h2 className="text-3xl font-black tracking-tighter uppercase leading-tight text-ink">{selectedCampaign.name}</h2>
                  <p className="text-xs text-ink-muted mt-2 font-medium leading-relaxed">{selectedCampaign.description || 'Sem descrição detalhada para esta campanha.'}</p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-bg border border-line flex items-center justify-center text-accent shadow-inner">
                  <BarChart3 className="w-8 h-8" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-bg p-4 rounded-xl border border-line">
                  <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1">Total Ativos</p>
                  <p className="text-2xl font-mono font-bold">{statsLoading ? '...' : stats?.total || 0}</p>
                </div>
                <div className="bg-bg p-4 rounded-xl border border-line">
                  <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1">Inventoried</p>
                  <p className="text-2xl font-mono font-bold text-blue-600">{statsLoading ? '...' : stats?.inventoried || 0}</p>
                </div>
                <div className="bg-bg p-4 rounded-xl border border-line">
                  <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1">Divergências</p>
                  <p className="text-2xl font-mono font-bold text-red-600">{statsLoading ? '...' : stats?.divergences || 0}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-ink-muted border-b border-line pb-2">Ações de Controle</h3>
                <div className="grid grid-cols-2 gap-3">
                  {selectedCampaign.status === CampaignStatus.ACTIVE && (
                    <>
                      {currentCampaignId === selectedCampaign.id ? (
                        <div className="col-span-2 flex items-center justify-center gap-2 py-4 bg-accent/10 text-accent border border-accent/20 rounded-xl text-xs font-black uppercase tracking-widest">
                          <CheckCircle2 className="w-5 h-5" /> Campanha Ativa no Coletor
                        </div>
                      ) : (
                        <button 
                          onClick={() => onActivate(selectedCampaign.id)}
                          className="col-span-2 flex items-center justify-center gap-3 py-4 bg-accent text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-accent/90 shadow-xl shadow-accent/30 transition-all active:scale-95 border-2 border-white/20"
                        >
                          <Activity className="w-5 h-5" /> Ativar para Inventário
                        </button>
                      )}
                      <button 
                        onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.CLOSED)}
                        className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Encerrar
                      </button>
                    </>
                  )}
                  {selectedCampaign.status === CampaignStatus.CLOSED && (
                    <button 
                      onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.ACTIVE)}
                      className="flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-green-700 transition-all"
                    >
                      <Clock className="w-4 h-4" /> Reabrir
                    </button>
                  )}
                  <button 
                    onClick={() => handleUpdateStatus(selectedCampaign.id, CampaignStatus.ARCHIVED)}
                    className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-gray-200 transition-all"
                  >
                    <Archive className="w-4 h-4" /> Arquivar
                  </button>
                  {user?.is_admin && (
                    <button 
                      onClick={() => handleDeleteCampaign(selectedCampaign.id)}
                      className="flex items-center justify-center gap-2 py-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-rose-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 px-8 text-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-accent/10 rounded-full blur-2xl animate-pulse"></div>
                  <div className="relative w-24 h-24 bg-white border border-line rounded-3xl flex items-center justify-center text-ink-muted shadow-sm">
                    <BarChart3 className="w-12 h-12 opacity-20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-black uppercase tracking-tighter text-ink">Nenhuma campanha ativa</p>
                  <p className="text-[10px] text-ink-muted uppercase tracking-widest leading-relaxed max-w-[200px] mx-auto">
                    Inicie um novo evento de inventário para começar a coletar dados.
                  </p>
                </div>
                <div className="flex flex-col items-center gap-4 w-full max-w-[240px]">
                  <button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-white text-ink rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-bg transition-all border border-line shadow-sm disabled:opacity-50 active:scale-95"
                  >
                    <RefreshCw className={`w-4 h-4 text-accent ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Sincronizando...' : 'Atualizar Lista'}</span>
                  </button>
                  <button 
                    onClick={() => setIsCreating(true)}
                    className="w-full py-4 bg-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all shadow-xl shadow-accent/20 active:scale-95"
                  >
                    Criar Primeira Campanha
                  </button>
                </div>
                <div className="pt-8 text-[8px] text-ink-muted uppercase tracking-widest opacity-50 flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-accent"></div>
                    <span>Tenant: {user?._tenantid || user?.tenantid || 'NÃO IDENTIFICADO'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {campaigns.map(campaign => (
                  <motion.div 
                    key={campaign.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => handleSelectCampaign(campaign)}
                    className="bg-white border border-line rounded-3xl p-5 flex items-center justify-between hover:shadow-xl hover:border-accent/20 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    
                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${
                        campaign.status === CampaignStatus.ACTIVE ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                        campaign.status === CampaignStatus.CLOSED ? 'bg-blue-50 border-blue-100 text-blue-600' :
                        'bg-slate-50 border-slate-100 text-slate-400'
                      }`}>
                        <Calendar className="w-7 h-7" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-black uppercase tracking-tighter text-base text-ink group-hover:text-accent transition-colors">{campaign.name}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border ${getStatusColor(campaign.status)}`}>
                            {campaign.status}
                          </span>
                          {(campaign._unitid || campaign.unit_id) && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-amber-50 text-amber-700 border-amber-100 text-[8px] font-black uppercase">
                              <MapPin size={8} />
                              {campaign._unitid || campaign.unit_id}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-[9px] text-ink-muted font-bold uppercase tracking-tighter ml-1">
                            <Clock size={10} />
                            {new Date(campaign.start_date).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-bg flex items-center justify-center text-ink-muted group-hover:bg-accent group-hover:text-white transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="p-4 bg-white border-t border-line flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <p className="text-[9px] text-ink-muted leading-tight uppercase font-bold tracking-tighter">
          Campanhas ativas permitem vincular leituras de campo a um evento específico de auditoria. 
          Encerre campanhas concluídas para gerar relatórios de fechamento.
        </p>
      </div>
    </div>
  );
};

export default CampaignManager;
