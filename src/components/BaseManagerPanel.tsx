import React, { useEffect, useState } from 'react';
import { localDb } from '../services/localDbService';
import { 
  Database, 
  Trash2, 
  ArrowLeft, 
  ShieldAlert, 
  Terminal, 
  HardDrive, 
  CheckCircle2,
  AlertTriangle,
  DatabaseZap
} from 'lucide-react';

interface BaseManagerPanelProps {
  onBack?: () => void;
  onGoToCargaExpert?: () => void;
  onResetDatabase?: () => Promise<void>;
}

export const BaseManagerPanel: React.FC<BaseManagerPanelProps> = ({ onBack, onGoToCargaExpert, onResetDatabase }) => {
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [logCount, setLogCount] = useState<number | null>(null);
  const [dbMode, setDbMode] = useState<string>('NÃO IDENTIFICADO');
  const [isProcessing, setIsProcessing] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
    setDbMode(mode);

    addLog(`[SRE GESTON] Inicializando console de gerenciamento físico...`);
    addLog(`[SRE GESTON] Modo atual detectado: ${mode}`);

    const loadStats = async () => {
      try {
        addLog(`[SRE GESTON] Executando diagnóstico estrito de barramento...`);
        
        // Count assets
        const aCount = await localDb.assets.count();
        setAssetCount(aCount);
        addLog(`[SRE GESTON] Ativos armazenados no Dexie local: ${aCount}`);

        // Count audit logs
        const lCount = await localDb.auditLogs.count();
        setLogCount(lCount);
        addLog(`[SRE GESTON] Eventos de Auditoria gravados: ${lCount}`);
        
        addLog(`[SRE GESTON] Estado operacional de disco: ESTÁVEL`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        addLog(`[SRE ERR] Falha no auto-diagnóstico: ${errMsg}`);
      }
    };

    loadStats();
  }, []);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setConsoleLogs(prev => [...prev, `>> [${time}] ${msg}`].slice(-20));
  };

  const handleReset = () => {
    setShowModal(true);
  };

  const executeReset = async () => {
    try {
      setIsProcessing(true);
      addLog(`[SRE GESTON] Comando de reset recebido. Iniciando barreira de isolamento...`);
      
      if (onResetDatabase) {
        await onResetDatabase();
      } else {
        // Fallback robusto se a prop não estiver definida
        addLog(`[SRE GESTON] Executando purge completo do banco Dexie local...`);
        await localDb.purgeDatabase();
        addLog(`[SRE GESTON] Tabelas eliminadas fisicamente.`);
        
        localStorage.removeItem('app_database_mode');
        addLog(`[SRE GESTON] Preferências de persistência removidas do localStorage.`);
        addLog(`[SRE GESTON] Reiniciando aplicação para efetivar alterações...`);
        
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`[SRE ERR] Falha ao redefinir base: ${errMsg}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col p-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-red-950 text-red-500 rounded-xl flex items-center justify-center border border-red-900/50">
            <Database size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest text-slate-200 uppercase">Gestor de Base</h1>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">SRE & Governança de I/O v2.6</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onGoToCargaExpert && (
            <button 
              type="button"
              onClick={onGoToCargaExpert}
              className="flex items-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-white font-bold text-xs uppercase tracking-wider transition-all border border-amber-500 cursor-pointer active:scale-95"
            >
              <DatabaseZap size={14} className="animate-pulse" />
              <span>Ir para Carga Expert</span>
            </button>
          )}

          {onBack && (
            <button 
              type="button"
              onClick={onBack}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider transition-all border border-slate-700 cursor-pointer active:scale-95"
            >
              <ArrowLeft size={14} />
              <span>Voltar ao Painel</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Banner de Risco */}
        <div className="flex gap-4 p-4 rounded-2xl bg-red-950/40 border border-red-900/50 text-red-200">
          <ShieldAlert className="w-6 h-6 shrink-0 text-red-400 mt-0.5" />
          <div>
            <h3 className="text-xs font-black tracking-widest uppercase mb-1">Atenção: Acesso de Nível Máximo</h3>
            <p className="text-[10px] text-red-300 leading-relaxed uppercase font-bold">
              Todas os comandos nesta página possuem impacto estrutural direto na integridade física do SQLite. 
              As operações ignoram travas relacionais por barreira sanitária nativa.
            </p>
          </div>
        </div>

        {/* Grid de Diagnósticos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-[10px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <HardDrive size={12} className="text-accent" />
              <span>Diagnóstico de Hardware Local</span>
            </h3>
            
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <p className="text-[9px] text-slate-500 uppercase font-black">Modo Conexão</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <p className="text-xs font-mono font-black text-slate-200">{dbMode}</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] text-slate-500 uppercase font-black">Status Integridade</p>
                <div className="flex items-center gap-1.5 mt-1 text-slate-200">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  <p className="text-xs font-mono font-black">ESTÁVEL</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] text-slate-500 uppercase font-black">Ativos em Tabela</p>
                <p className="text-lg font-mono font-black text-slate-100 mt-1">
                  {assetCount !== null ? assetCount.toLocaleString() : '---'}
                </p>
              </div>

              <div>
                <p className="text-[9px] text-slate-500 uppercase font-black font-semibold">Logs de Auditoria</p>
                <p className="text-lg font-mono font-black text-slate-100 mt-1">
                  {logCount !== null ? logCount.toLocaleString() : '---'}
                </p>
              </div>
            </div>
          </div>

          {/* Dangerous Zone Card */}
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80 space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <AlertTriangle size={12} className="text-red-500 animate-bounce" />
                <span>Higienização / Destruição Controlada</span>
              </h3>
              <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-semibold mt-2">
                Limpa completamente as tabelas estruturais de <b>ativos</b> e <b>AUDIT_LOG</b> do SQLite local e remove as configurações salvas no dispositivo.
              </p>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={handleReset}
                disabled={isProcessing}
                className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-red-650 hover:bg-red-700 disabled:bg-slate-800 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer border border-red-500/35"
              >
                <Trash2 size={16} />
                <span>{isProcessing ? "Executando Purga..." : "Zerar Base de Dados Local"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Terminal */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-800/80">
            <div className="flex items-center space-x-2">
              <Terminal size={14} className="text-slate-400" />
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">SRE Boot Monitor - Logs de Diagnóstico</span>
            </div>
            <div className="flex space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800 block"></span>
            </div>
          </div>
          
          <div className="p-4 font-mono text-[10px] leading-relaxed text-emerald-500 bg-slate-950 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1">
            {consoleLogs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap">{log}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Beautiful SRE Safe Control Modal */}
      {showModal && (
        <div id="reset-confirm-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-950 text-red-500 rounded-xl border border-red-900/50">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black uppercase text-slate-100 tracking-wider">Higienização Física</h3>
                <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest">SRE & Governança de I/O</p>
              </div>
            </div>
            
            <p className="text-[10px] text-slate-300 leading-relaxed font-bold uppercase">
              Esta operação é <span className="text-red-500">IRREVERSÍVEL</span>. Ela irá apagar todos os ativos e registros de auditoria salvos no disco local do dispositivo. Deseja realmente prosseguir com o reset estrutural do banco?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                id="reset-cancel-btn"
                onClick={() => {
                  setShowModal(false);
                  addLog(`[SRE GESTON] Operação cancelada pelo operador.`);
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all border border-slate-700 active:scale-95 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="reset-confirm-btn"
                onClick={async () => {
                  setShowModal(false);
                  await executeReset();
                }}
                className="flex-1 py-1.5 bg-red-650 hover:bg-red-700 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all border border-red-500 active:scale-95 cursor-pointer"
              >
                Confirmar Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BaseManagerPanel;
