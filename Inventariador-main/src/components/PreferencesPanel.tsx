import React, { useState } from 'react';
import { ScanFeedbackMode } from '../types';
import { 
  ShieldCheck,
  Vibrate,
  Volume2,
  X,
  Battery,
  BookOpen,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import BackButton from './BackButton';

export interface PreferencesPanelProps {
  onClose: () => void;
  autoConfirmOnScan: boolean;
  onUpdateAutoConfirm: (val: boolean) => void;
  scanFeedbackMode: ScanFeedbackMode;
  onUpdateScanFeedbackMode: (mode: ScanFeedbackMode) => void;
  darkMode: boolean;
  onUpdateDarkMode: (val: boolean) => void;
  batterySaver: boolean;
  onUpdateBatterySaver: (val: boolean) => void;
}

const PreferencesPanel: React.FC<PreferencesPanelProps> = ({
  onClose,
  autoConfirmOnScan,
  onUpdateAutoConfirm,
  scanFeedbackMode,
  onUpdateScanFeedbackMode,
  darkMode,
  onUpdateDarkMode,
  batterySaver,
  onUpdateBatterySaver,
}) => {
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  return (
    <>
      {isDocModalOpen && (
        <div className="fixed inset-0 z-[20000] bg-white flex flex-col animate-slideUp">
          <div className="px-6 pt-12 pb-6 bg-emerald-500 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4">
              <BackButton onClick={() => setIsDocModalOpen(false)} label="Voltar" />
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Manual do Sistema</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">Inventariador GBR v2.6</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-bg-main no-scrollbar">
            <div className="max-w-3xl mx-auto prose prose-slate prose-sm prose-emerald">
              <div className="bg-white border border-border rounded-3xl p-6 md:p-10 shadow-sm mb-10 markdown-body">
                <ReactMarkdown>
                  {`# Documentação Técnica e Operacional - Inventariador GBR v2.6

Este documento serve como o manual oficial e registro técnico de todas as funcionalidades operacionais do sistema de Inventário de Ativo Imobilizado.`}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-[10000] bg-slate-50 flex flex-col animate-fadeIn">
        {/* Top App Bar - Material 3 Style */}
        <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center sticky top-0 z-[10001]">
          <button 
            onClick={onClose}
            className="p-2 -ml-2 text-slate-600 active:bg-slate-100 rounded-full transition-colors mr-3"
          >
            <ChevronRight size={24} className="rotate-180" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">Ajustes de Campo</h1>
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Preferências do Auditor</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          <div className="w-full max-w-sm mx-auto space-y-4">
            {/* AUTO CONFERENCIA */}
            <div className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><ShieldCheck size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Auto-Conferência</h4>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Registro Automático no Scan</p>
                </div>
              </div>
              <div className="flex p-1 bg-slate-50 border border-slate-100 rounded-xl">
                <button 
                  onClick={() => onUpdateAutoConfirm(true)}
                  className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${autoConfirmOnScan ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400'}`}
                >
                  LIGADO
                </button>
                <button 
                  onClick={() => onUpdateAutoConfirm(false)}
                  className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${!autoConfirmOnScan ? 'bg-white text-slate-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}
                >
                  DESLIGADO
                </button>
              </div>
            </div>

            {/* FEEDBACK SCANNER */}
            <div className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mr-4 border border-blue-100"><Vibrate size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Feedback do Scanner</h4>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Confirmação de Leitura</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 border border-slate-100 rounded-xl">
                <button 
                  onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.VIBRATE)}
                  className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.VIBRATE ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400'}`}
                >
                  <Vibrate size={12} />
                  <span>Vibrar</span>
                </button>
                <button 
                  onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.SOUND)}
                  className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.SOUND ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400'}`}
                >
                  <Volume2 size={12} />
                  <span>Som (Bip)</span>
                </button>
                <button 
                  onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.BOTH)}
                  className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.BOTH ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400'}`}
                >
                  <div className="flex space-x-1">
                    <Vibrate size={10} />
                    <Volume2 size={10} />
                  </div>
                  <span>Ambos</span>
                </button>
                <button 
                  onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.NONE)}
                  className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.NONE ? 'bg-white text-slate-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}
                >
                  <X size={12} />
                  <span>Nenhum</span>
                </button>
              </div>
            </div>

            {/* ENERGIA E TEMA */}
            <div className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex items-center mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-4 border ${darkMode ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                  <Battery size={16} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Energia e Visibilidade</h4>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Performance e Bateria</p>
                </div>
              </div>
              <div className="space-y-2">
                <button 
                  onClick={() => onUpdateDarkMode(!darkMode)}
                  className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${darkMode ? 'bg-slate-800 border-slate-700 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                >
                  <div className="flex items-center">
                    <span className="mr-3">{darkMode ? '🌙' : '☀️'}</span>
                    <span>Modo Escuro (OLED)</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${darkMode ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${darkMode ? 'left-6' : 'left-1'}`} />
                  </div>
                </button>

                <button 
                  onClick={() => onUpdateBatterySaver(!batterySaver)}
                  className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${batterySaver ? 'bg-amber-50 border-amber-100 text-amber-700 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                >
                  <div className="flex items-center">
                    <Battery size={14} className="mr-3" />
                    <span>Economia de Bateria</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${batterySaver ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${batterySaver ? 'left-6' : 'left-1'}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* DOCUMENTAÇÃO */}
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setIsDocModalOpen(true)}
                className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-2xl active:scale-[0.98] transition-all text-center shadow-sm"
              >
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-2 border border-emerald-100"><BookOpen size={20} /></div>
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight">Manual</h4>
              </button>

              <button 
                onClick={() => window.open('/ajuda_sistema.html', '_blank')}
                className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-2xl active:scale-[0.98] transition-all text-center shadow-sm"
              >
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-2 border border-indigo-100"><ExternalLink size={20} /></div>
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight">Guia POP</h4>
              </button>
            </div>
          </div>
          <div className="pt-4 text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">GBR Personalization</div>
        </div>
      </div>
    </>
  );
};

export default PreferencesPanel;
