
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, Database, CheckCircle2, ChevronRight, Info, Eye, ShieldAlert, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { logger } from '../utils/logger';

interface TrustOnboardingProps {
  onAccept: () => void;
  onOpenPrivacyCenter: () => void;
}

const TrustOnboarding: React.FC<TrustOnboardingProps> = ({ onAccept, onOpenPrivacyCenter }) => {
  const [step, setStep] = useState(1);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const downloadTemplate = () => {
    const headers = [
      'tenantid', 'filial', 'status', 'etiqueta', 'qt', 
      'descricaodoativo', 'serial', 'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 
      'endereco', 'registro', 'subreg', 'databaixa', 'contacontabil', 'primarykey', 
      'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno'
    ];
    
    const exampleData = [
      {
        tenantid: 'EXEMPLO_SA',
        filial: 'MATRIZ',
        status: 'ATIVO',
        etiqueta: 'PAT-0001',
        qt: 1,
        descricaodoativo: 'NOTEBOOK DELL LATITUDE',
        serial: 'ABC123XYZ',
        dataaqusic: '2023-01-15',
        cnpj: '00.000.000/0001-00',
        nomefornecedor: 'DELL BRASIL',
        notafiscal: '12345',
        endereco: 'SALA 101 - TI',
        registro: 'REG-001',
        subreg: '00',
        databaixa: '',
        contacontabil: '1.02.01.01.01',
        primarykey: 'ERP-001',
        centrodecusto: '10101',
        vlraquisic: 5500.00,
        sn1_recno: 1,
        sn3_recno: 1
      }
    ];

    const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CargaExpert");
    XLSX.writeFile(wb, "Matriz_Carga_Expert_v25.xls");
  };

  const steps = [
    {
      id: 1,
      title: "Bem-vindo à Auditoria Patrimonial",
      subtitle: "Sua plataforma de governança e controle de ativos imobilizados.",
      icon: <ShieldCheck className="w-16 h-16 text-accent" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted leading-relaxed">
            O sistema foi projetado com foco em <strong>segurança máxima</strong> e 
            <strong>transparência de dados</strong>. Antes de começar, queremos que você saiba 
            como protegemos sua operação.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start space-x-3 p-3 bg-accent-soft rounded-2xl border border-accent/10">
              <Lock className="w-5 h-5 text-accent mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-ink uppercase tracking-tight">Criptografia de Ponta</h4>
                <p className="text-[10px] text-ink-muted">Seus dados são criptografados em repouso e em trânsito.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-accent-soft rounded-2xl border border-accent/10">
              <Database className="w-5 h-5 text-accent mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-ink uppercase tracking-tight">Governança Offline-First</h4>
                <p className="text-[10px] text-ink-muted">Controle total sobre o que é sincronizado com a nuvem.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "Privacidade e LGPD",
      subtitle: "Transparência total sobre o uso de seus dados corporativos.",
      icon: <Eye className="w-16 h-16 text-accent" />,
      content: (
        <div className="space-y-4">
          <div className="bg-bg-main p-4 rounded-2xl border border-border space-y-3">
            <div className="flex items-center space-x-2 text-accent">
              <Info size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">O que coletamos?</span>
            </div>
            <ul className="text-[11px] text-ink-muted space-y-2">
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 bg-accent rounded-full" />
                <span><strong>Geolocalização:</strong> Apenas para prova de vida do ativo no campo.</span>
              </li>
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 bg-accent rounded-full" />
                <span><strong>Fotos:</strong> Evidências técnicas de auditoria e divergências.</span>
              </li>
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 bg-accent rounded-full" />
                <span><strong>Logs de Auditoria:</strong> Rastreabilidade total de quem alterou o quê.</span>
              </li>
            </ul>
          </div>
          <p className="text-[10px] text-ink-muted italic text-center">
            &quot;Não compartilhamos dados com terceiros. Seus dados pertencem à sua organização.&quot;
          </p>
          <button 
            onClick={onOpenPrivacyCenter}
            className="w-full py-2 text-[9px] font-bold text-accent uppercase tracking-widest hover:underline"
          >
            Ver Detalhes da Política (LGPD)
          </button>
        </div>
      )
    },
    {
      id: 3,
      title: "Termos de Uso e Segurança",
      subtitle: "Finalize a configuração de confiança para acessar o painel.",
      icon: <ShieldAlert className="w-16 h-16 text-accent" />,
      content: (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="flex items-start space-x-3 cursor-pointer group">
              <div 
                onClick={() => setAcceptedTerms(!acceptedTerms)}
                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${acceptedTerms ? 'bg-accent border-accent text-white' : 'border-border bg-white group-hover:border-accent/50'}`}
              >
                {acceptedTerms && <CheckCircle2 size={16} />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-ink leading-tight">
                  Eu li e concordo com os Termos de Uso e Política de Privacidade.
                </p>
                <p className="text-[10px] text-ink-muted mt-1">
                  Estou ciente de que o app utiliza geolocalização e câmera para fins de auditoria técnica.
                </p>
              </div>
            </label>
          </div>

          <div className="p-4 bg-warning/5 border border-warning/20 rounded-2xl">
            <p className="text-[10px] font-bold text-warning uppercase tracking-widest text-center">
              ⚠️ Alerta de Segurança
            </p>
            <p className="text-[9px] text-warning/80 text-center mt-1">
              O uso de dispositivos com Root ou Jailbreak é detectado e pode limitar funções sensíveis.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "Carga de Dados Expert",
      subtitle: "Prepare sua base de dados para o Protocolo v25.00.",
      icon: <Database className="w-16 h-16 text-accent" />,
      content: (
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-3">
            <div className="flex items-center space-x-2 text-blue-600">
              <Info size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Requisitos de Arquivo</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Para garantir a integridade da carga, utilize arquivos <strong>Excel (.xls)</strong> com a estrutura de colunas do <strong>Carga Expert</strong>.
            </p>
            <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
              <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ordem das Colunas (A-R)</h4>
              <p className="text-[9px] text-slate-700 leading-tight font-mono">
                tenantid; filial; status; etiqueta; qt; descricaodoativo; serial; dataaqusic; cnpj; nomefornecedor; notafiscal; endereco; registro; subreg; databaixa; contacontabil; primarykey; centrodecusto; vlraquisic; sn1_recno; sn3_recno
              </p>
            </div>
            <button 
              onClick={downloadTemplate}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md group"
            >
              <Download size={14} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Baixar Planilha Matriz</span>
            </button>
          </div>
          <p className="text-[9px] text-ink-muted italic text-center">
            &quot;A ordem das colunas é vital para o fallback automático do sistema.&quot;
          </p>
        </div>
      )
    }
  ];

  const currentStep = steps[step - 1];

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950 flex items-center justify-center p-6 overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh] border border-white/10"
      >
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 flex z-20">
          {steps.map((s) => (
            <div 
              key={s.id} 
              className={`flex-1 transition-all duration-500 ${s.id <= step ? 'bg-accent' : 'bg-bg-main'}`}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar p-6 pt-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col items-center text-center"
            >
              <div className="mb-4 bg-accent-soft p-4 rounded-[2rem] shadow-inner border border-accent/5">
                {currentStep.icon}
              </div>
              
              <h2 className="text-xl font-black text-ink tracking-tighter uppercase italic leading-none mb-1">
                {currentStep.title}
              </h2>
              <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em] mb-6 max-w-[80%]">
                {currentStep.subtitle}
              </p>

              <div className="w-full text-left">
                {currentStep.content}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="p-6 bg-bg-main border-t border-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-6 py-4 bg-white border border-border text-ink rounded-2xl font-bold uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm"
              >
                Voltar
              </button>
            )}
          </div>

          <button
            onClick={() => {
              logger.info("TrustOnboarding click - step:", step, "acceptedTerms:", acceptedTerms);
              if (step < steps.length) {
                setStep(step + 1);
              } else if (acceptedTerms) {
                logger.info("TrustOnboarding calling onAccept()");
                onAccept();
              } else {
                logger.info("TrustOnboarding cannot call onAccept - terms not accepted");
              }
            }}
            disabled={step === steps.length && !acceptedTerms}
            className={`px-8 py-4 rounded-2xl font-bold uppercase tracking-widest text-[10px] flex items-center space-x-2 transition-all shadow-lg active:scale-95 ${step === steps.length && !acceptedTerms ? 'bg-border text-ink-muted cursor-not-allowed' : 'bg-accent text-white shadow-accent/20'}`}
          >
            <span>{step === steps.length ? "Começar Agora" : "Avançar"}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default TrustOnboarding;
