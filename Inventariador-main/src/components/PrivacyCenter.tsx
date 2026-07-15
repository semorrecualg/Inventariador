
import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Eye, Trash2, FileText, X, ChevronRight, Info } from 'lucide-react';

interface PrivacyCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyCenter: React.FC<PrivacyCenterProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const sections = [
    {
      title: "Seus Direitos (LGPD)",
      icon: <ShieldCheck className="text-success" size={20} />,
      items: [
        "Acesso aos seus dados coletados.",
        "Correção de dados incompletos ou inexatos.",
        "Anonimização ou bloqueio de dados desnecessários.",
        "Portabilidade dos dados para outro fornecedor."
      ]
    },
    {
      title: "Segurança de Dados",
      icon: <Lock className="text-accent" size={20} />,
      items: [
        "Criptografia AES-256 em repouso.",
        "Protocolo TLS 1.3 para tráfego de rede.",
        "Autenticação de dois fatores (MFA) disponível.",
        "Detecção de Root/Jailbreak para proteção do app."
      ]
    },
    {
      title: "Uso de Informações",
      icon: <Eye className="text-warning" size={20} />,
      items: [
        "Geolocalização: Apenas para auditoria de ativos.",
        "Câmera: Apenas para leitura de etiquetas e fotos.",
        "Logs: Para rastreabilidade de alterações (Compliance).",
        "Não vendemos ou compartilhamos seus dados."
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-[30000] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-fadeIn">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-white/10"
      >
        {/* Header */}
        <div className="p-6 bg-accent text-white shrink-0 relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
          <div className="flex items-center space-x-3 mb-2">
            <ShieldCheck size={24} />
            <h2 className="text-xl font-black uppercase italic tracking-tighter">Centro de Privacidade</h2>
          </div>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Governança e Transparência GBR v24.50</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
          <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10 flex items-start space-x-3">
            <Info className="text-accent shrink-0" size={18} />
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Este painel resume como o GBR Auditoria trata suas informações em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD)</strong>.
            </p>
          </div>

          {sections.map((section, idx) => (
            <div key={idx} className="space-y-4">
              <div className="flex items-center space-x-2">
                {section.icon}
                <h3 className="text-[11px] font-black text-ink uppercase tracking-widest">{section.title}</h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center space-x-3 p-3 bg-bg-main rounded-xl border border-border/50">
                    <ChevronRight size={12} className="text-accent/40" />
                    <span className="text-[10px] font-medium text-ink-muted">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="pt-4 border-t border-border">
            <h3 className="text-[11px] font-black text-ink uppercase tracking-widest mb-4 flex items-center space-x-2">
              <Trash2 className="text-danger" size={16} />
              <span>Gestão de Dados Locais</span>
            </h3>
            <p className="text-[10px] text-ink-muted mb-4 leading-relaxed">
              Você pode limpar os dados armazenados localmente neste dispositivo (cache, sessões expiradas e configurações). Isso não afetará os dados sincronizados na nuvem.
            </p>
            <button 
              onClick={() => {
                if(window.confirm("Deseja realmente limpar os dados locais? Você será deslogado.")) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="w-full py-3 bg-danger/10 text-danger border border-danger/20 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-danger hover:text-white transition-all"
            >
              Limpar Cache e Dados Locais
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-bg-main border-t border-border shrink-0 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText size={14} className="text-ink-muted" />
            <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Versão da Política: 24.50.1</span>
          </div>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-accent text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
          >
            Voltar
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default PrivacyCenter;
