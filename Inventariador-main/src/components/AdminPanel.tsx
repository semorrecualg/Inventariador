import React, { useState } from 'react';
import { AppScreen, NavigationParams } from '../types';
import BackButton from './BackButton';
import { 
  ShieldCheck,
  Settings,
  QrCode,
  Users,
  Activity,
  RefreshCw,
  Calendar,
  Tag
} from 'lucide-react';

export interface AdminPanelProps {
  onClose: () => void;
  onNavigate: (target: AppScreen, params?: NavigationParams) => void;
  mandatoryPhotoOnDivergence: boolean;
  onUpdateMandatoryPhotoOnDivergence: (val: boolean) => void;
  mandatoryPhotoOnNewItem: boolean;
  onUpdateMandatoryPhotoOnNewItem: (val: boolean) => void;
  protheusIntegrationEnabled: boolean;
  onUpdateProtheusIntegration: (val: boolean) => void;
  protheusApiUrl: string;
  onUpdateProtheusApiUrl: (val: string) => void;
  onCheckIntegrity?: () => Promise<{ success: boolean; message: string }>;
  showModal: (title: string, message: string, type: 'success' | 'error' | 'info' | 'confirm' | 'warning') => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({
  onClose,
  onNavigate,
  mandatoryPhotoOnDivergence,
  onUpdateMandatoryPhotoOnDivergence,
  mandatoryPhotoOnNewItem,
  onUpdateMandatoryPhotoOnNewItem,
  protheusIntegrationEnabled,
  onUpdateProtheusIntegration,
  protheusApiUrl,
  onUpdateProtheusApiUrl,
  onCheckIntegrity,
  showModal,
}) => {
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);

  const handleCheckIntegrity = async () => {
    if (!onCheckIntegrity) return;
    setIsCheckingIntegrity(true);
    try {
      const result = await onCheckIntegrity();
      showModal(
        result.success ? "Integridade Confirmada" : "Falha de Integridade",
        result.message,
        result.success ? "success" : "error"
      );
    } catch {
      showModal("Erro", "Falha ao realizar verificação de integridade.", "error");
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-white/95 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
      <div className="fixed top-8 left-6 z-[10001]">
        <BackButton onClick={onClose} label="Voltar" />
      </div>
      <div className="w-full max-w-sm space-y-3">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent/10 shadow-lg overflow-hidden p-1">
            <ShieldCheck className="text-accent" size={32} />
          </div>
          <h2 className="text-xl font-bold text-ink uppercase tracking-tight">Painel Administrativo</h2>
          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.3em] mt-1.5">Protocolo de Segurança</p>
        </div>

        <div className="space-y-2.5 max-h-[65vh] overflow-y-auto no-scrollbar pr-1">
          <button onClick={() => { onClose(); onNavigate(AppScreen.FIELD_CONFIGURATOR); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
            <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Settings size={16} /></div>
            <div className="flex-1">
              <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Configurar Campos</h4>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Controle de Edição</p>
            </div>
          </button>

          <button onClick={() => { onClose(); onNavigate(AppScreen.QR_CODE_CONFIGURATOR); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
            <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><QrCode size={16} /></div>
            <div className="flex-1">
              <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Configurar QR Code</h4>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Definir campos do QR</p>
            </div>
          </button>

          <button onClick={() => { onClose(); onNavigate(AppScreen.USER_MANAGEMENT); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
            <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Users size={16} /></div>
            <div className="flex-1">
              <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Acessos</h4>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Gerir Usuários</p>
            </div>
          </button>

          <button onClick={() => { onClose(); onNavigate(AppScreen.AUDIT_LOGS); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
            <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Activity size={16} /></div>
            <div className="flex-1">
              <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Auditoria</h4>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Trilha de Auditoria</p>
            </div>
          </button>

          <button 
            onClick={handleCheckIntegrity}
            disabled={isCheckingIntegrity}
            className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm disabled:opacity-50"
          >
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100">
              {isCheckingIntegrity ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            </div>
            <div className="flex-1">
              <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Integridade</h4>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Validar Checksum SHA-256</p>
            </div>
          </button>

          <button onClick={() => { onClose(); onNavigate(AppScreen.CAMPAIGN_MANAGEMENT); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
            <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Calendar size={16} /></div>
            <div className="flex-1">
              <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Eventos</h4>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Campanhas de Inventário</p>
            </div>
          </button>

          <div className="w-full p-4 bg-bg-main border border-slate-200 rounded-2xl shadow-sm">
            <div className="flex items-center mb-3">
              <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Tag size={16} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Evidência Fotográfica</h4>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Obrigatoriedade de Foto</p>
              </div>
            </div>
            <div className="space-y-2">
              <button 
                onClick={() => onUpdateMandatoryPhotoOnDivergence(!mandatoryPhotoOnDivergence)}
                className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${mandatoryPhotoOnDivergence ? 'bg-accent-soft border-accent/20 text-accent shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                <span>Obrigatório em Divergência</span>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${mandatoryPhotoOnDivergence ? 'bg-accent' : 'bg-slate-200'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${mandatoryPhotoOnDivergence ? 'left-6' : 'left-1'}`} />
                </div>
              </button>
              <button 
                onClick={() => onUpdateMandatoryPhotoOnNewItem(!mandatoryPhotoOnNewItem)}
                className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${mandatoryPhotoOnNewItem ? 'bg-accent-soft border-accent/20 text-accent shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                <span>Obrigatório em Novo Item</span>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${mandatoryPhotoOnNewItem ? 'bg-accent' : 'bg-slate-200'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${mandatoryPhotoOnNewItem ? 'left-6' : 'left-1'}`} />
                </div>
              </button>
            </div>
          </div>

          {/* CONFIGURAÇÃO PROTHEUS */}
          <div className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
            <div className="flex items-center mb-3">
              <div className="w-8 h-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-md"><ShieldCheck size={16} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-indigo-900 uppercase tracking-tight">Módulo Protheus</h4>
                <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Integração ERP SIGAATF</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-indigo-100">
                <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-widest">Habilitar Módulo</span>
                <button 
                  onClick={() => onUpdateProtheusIntegration(!protheusIntegrationEnabled)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${protheusIntegrationEnabled ? 'bg-indigo-500' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${protheusIntegrationEnabled ? 'left-6' : 'left-1'}`}  />
                </button>
              </div>

              {protheusIntegrationEnabled && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="block text-[8px] font-bold text-indigo-400 uppercase tracking-widest ml-1">VITE_PROTHEUS_API_URL</label>
                  <input 
                    type="text"
                    value={protheusApiUrl}
                    onChange={(e) => onUpdateProtheusApiUrl(e.target.value)}
                    placeholder="https://api.empresa.com.br"
                    className="w-full px-3 py-2 bg-white border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                  />
                </div>
              )}

              <div className="p-2 bg-white/50 border border-indigo-100 rounded-lg">
                <p className="text-[7px] font-bold text-indigo-600 uppercase leading-relaxed tracking-wide">
                  Atenção: A integração exige o campo <span className="text-indigo-900">Sn1_recno</span> na carga de dados.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="pt-4 text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">Security Protocol</div>
      </div>
    </div>
  );
};

export default AdminPanel;
