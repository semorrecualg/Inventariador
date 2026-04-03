
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
  Trash2
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
}

const CampaignManager: React.FC<CampaignManagerProps> = ({ 
  user, 
  onBack, 
  onActivate, 
  currentCampaignId, 
  availableUnits = [],
  campaigns = [],
  onRefresh
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [newCampaignUnit, setNewCampaignUnit] = useState<string>('');
  const [selectedCampaign, setSelectedCampaign] = useState<InventoryCampaign | null>(null);
  const [stats, setStats] = useState<{total: number, inventoried: number, divergences: number} | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const handleCreateCampaign = async () => {
    if (!newCampaignName) return;

    if (!user?._tenantid && !user?.tenantid) {
      console.error('Erro: Tenant ID não encontrado. Sua sessão pode ter expirado. Por favor, saia e entre novamente.');
      return;
    }

    setIsSaving(true);
    try {
      const tenantId = user._tenantid || user.tenantid;
      const newCampaign: Partial<InventoryCampaign> = {
        name: newCampaignName,
        description: newCampaignDesc,
        status: CampaignStatus.ACTIVE,
        _tenantid: tenantId,
        _unitid: newCampaignUnit || undefined,
        tenantid: tenantId, // Legado
        unit_id: newCampaignUnit || undefined, // Legado
        created_by: user.email,
        start_date: new Date().toISOString()
      };

      const result = await createCampaign(newCampaign);
      if (result) {
        if (onRefresh) onRefresh();
        setIsCreating(false);
        setNewCampaignName('');
        setNewCampaignDesc('');
        setNewCampaignUnit('');
        console.log('Campanha criada com sucesso!');
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
      console.log('Campanha excluída com sucesso!');
      setSelectedCampaign(null);
      if (onRefresh) onRefresh();
    } else {
      console.error('Erro ao excluir campanha.');
    }
  };

  const handleUpdateStatus = async (id: string, status: CampaignStatus) => {
    const success = await updateCampaignStatus(id, status);
    if (success) {
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
      {/* Header */}
      <header className="bg-ink text-white px-6 py-4 flex items-center justify-between shadow-lg z-10">
        <div className="flex items-center gap-4">
          <BackButton onClick={onBack} label="Voltar" subLabel="Eventos de Inventário" />
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">Eventos de Inventário</h1>
            <p className="text-xs opacity-60 font-mono tracking-widest uppercase">Campaign Management System</p>
          </div>
        </div>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl transition-all shadow-lg shadow-accent/20 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Nova Campanha</span>
          </button>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isCreating ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-line rounded-2xl p-6 shadow-xl space-y-4"
          >
            <h2 className="text-lg font-bold uppercase tracking-tight">Nova Campanha</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 block">Nome da Campanha</label>
                <input 
                  type="text"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="EX: INVENTÁRIO GERAL 2024 - FASE 1"
                  className="w-full p-3 bg-bg border border-line rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 block">Descrição / Objetivo</label>
                <textarea 
                  value={newCampaignDesc}
                  onChange={(e) => setNewCampaignDesc(e.target.value)}
                  placeholder="DESCREVA O ESCOPO DESTA CAMPANHA..."
                  className="w-full p-3 bg-bg border border-line rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/20 h-24"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 block">Unidade Operacional (Opcional)</label>
                <select 
                  value={newCampaignUnit}
                  onChange={(e) => setNewCampaignUnit(e.target.value)}
                  className="w-full p-3 bg-bg border border-line rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none"
                >
                  <option value="">TODAS AS UNIDADES (GLOBAL)</option>
                  {availableUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-3 border border-line rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-bg transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCreateCampaign}
                  disabled={!newCampaignName || !user?.tenantid || isSaving}
                  className="flex-1 py-3 bg-ink text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-ink/20"
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
            className="space-y-4"
          >
            <BackButton onClick={() => setSelectedCampaign(null)} label="Voltar" subLabel="Lista de Campanhas" />

            <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight uppercase">{selectedCampaign.name}</h2>
                  <p className="text-sm text-ink-muted mt-1">{selectedCampaign.description || 'Sem descrição'}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${getStatusColor(selectedCampaign.status)}`}>
                  {selectedCampaign.status}
                </span>
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
          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-40">
                <BarChart3 className="w-16 h-16" />
                <p className="text-xs font-bold uppercase tracking-widest">Nenhuma campanha ativa</p>
                <button 
                  onClick={() => setIsCreating(true)}
                  className="text-[10px] font-bold text-accent underline uppercase tracking-widest"
                >
                  Criar minha primeira campanha
                </button>
              </div>
            ) : (
              campaigns.map(campaign => (
                <motion.div 
                  key={campaign.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleSelectCampaign(campaign)}
                  className="bg-white border border-line rounded-2xl p-4 flex items-center justify-between hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      campaign.status === CampaignStatus.ACTIVE ? 'bg-green-50 text-green-600' :
                      campaign.status === CampaignStatus.CLOSED ? 'bg-blue-50 text-blue-600' :
                      'bg-gray-50 text-gray-400'
                    }`}>
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold uppercase tracking-tight text-sm">{campaign.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${getStatusColor(campaign.status)}`}>
                          {campaign.status}
                        </span>
                        {campaign.unit_id && (
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                            {campaign.unit_id}
                          </span>
                        )}
                        <span className="text-[10px] text-ink-muted font-mono">
                          {new Date(campaign.start_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-ink-muted group-hover:text-ink transition-colors" />
                </motion.div>
              ))
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
