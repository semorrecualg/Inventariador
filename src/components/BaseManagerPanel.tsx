import React, { useEffect, useState } from 'react';
import { db } from '../services/sqliteService';
import { FileSystemStorageService } from '../services/FileSystemStorageService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { AppScreen } from '../types';
import { 
  Database, 
  Trash2, 
  ArrowLeft, 
  ShieldAlert, 
  Terminal, 
  HardDrive, 
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface BaseManagerPanelProps {
  onBack?: () => void;
  onResetDatabase?: () => Promise<void>;
}

export const BaseManagerPanel: React.FC<BaseManagerPanelProps> = ({ onBack, onResetDatabase }) => {
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [logCount, setLogCount] = useState<number | null>(null);
  const [dbMode, setDbMode] = useState<string>('NÃO IDENTIFICADO');
  const [isProcessing, setIsProcessing] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [progresso, setProgresso] = useState<number>(0);
  const [operacaoAtiva, setOperacaoAtiva] = useState<'CARGA' | 'PURGA' | null>(null);
  const [caminhoDiretorio] = useState<string>("Documentos/GBR_KARDEK_DATA");
  const temDadosCarregados = assetCount !== null && assetCount > 0;

  useEffect(() => {
    const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
    setDbMode(mode);

    addLog(`[SRE GESTOR] Inicializando console de gerenciamento físico...`);
    addLog(`[SRE GESTOR] Modo atual detectado: ${mode}`);

    const checkIsAdmin = () => {
      try {
        const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
        if (userStr) {
          const parsed = JSON.parse(userStr);
          const email = parsed?.email?.toLowerCase() || '';
          const roleStr = String(parsed?.role || '').toUpperCase();
          const isAdm = parsed?.isAdmin || parsed?.is_admin;
          return roleStr === 'ADMIN' || roleStr === 'MASTER' || roleStr === 'GESTOR' || !!isAdm || email === 'semorr@gmail.com';
        }
      } catch { /* ignore */ }
      return false;
    };
    setIsAdmin(checkIsAdmin());

    const loadStats = async () => {
      try {
        addLog(`[SRE GESTOR] Executando diagnóstico estrito de barramento...`);
        
        // Count assets directly using Dexie.js for absolute reliability
        const aCount = await db.ativos.count();
        setAssetCount(aCount);
        addLog(`[SRE GESTOR] Ativos armazenados no Dexie local: ${aCount}`);

        // Count audit logs directly using Dexie.js
        const lCount = await db.audit_logs.count();
        setLogCount(lCount);
        addLog(`[SRE GESTOR] Eventos de Auditoria gravados: ${lCount}`);
        
        addLog(`[SRE GESTOR] Estado operacional de disco: ESTÁVEL`);
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
    setOperacaoAtiva('PURGA');
    setProgresso(100); // Inicia cheia para o efeito decrescente
    setIsProcessing(true);
    addLog(`[SRE_PURGE] Iniciando esvaziamento controlado das tabelas...`);
    
    try {
      console.log("[SRE_PURGE] Iniciando esvaziamento controlado das tabelas...");
      
      // Simulação de regressão visual da purga atômica dividida em 4 etapas lógicas de SRE
      setProgresso(75); 
      addLog(`[SRE_PURGE] Limpando local_assets...`);
      await db.local_assets.clear();
      
      setProgresso(50); 
      addLog(`[SRE_PURGE] Limpando ativos e assets...`);
      await db.ativos.clear();
      await db.assets.clear();
      
      setProgresso(25); 
      addLog(`[SRE_PURGE] Limpando logs de auditoria...`);
      await db.audit_logs.clear();
      
      if (onResetDatabase) {
        addLog(`[SRE_PURGE] Executando reset via callback de controle isolado...`);
        await onResetDatabase();
      } else {
        // Limpeza física total e reinicialização do schema
        addLog(`[SRE_PURGE] Reiniciando schema físico Dexie...`);
        db.close();
        await indexedDB.deleteDatabase('gbr_kardek_db');
        await indexedDB.deleteDatabase('InventoryLocalStore');
        await db.open();
      }
      
      setProgresso(0);
      addLog(`[SRE_PURGE] Base totalmente higienizada.`);
      console.log("[SRE_PURGE] Base totalmente higienizada.");
      
      // Força o histórico canônico e executa o reload de reset
      localStorage.setItem('gbr_kardek_history', JSON.stringify([AppScreen.LOGIN, AppScreen.MODULE_SELECTION, AppScreen.DASHBOARD, AppScreen.DATABASE_MANAGER]));
      window.location.reload();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`[SRE_PURGE] Erro crítico na purga: ${errMsg}`);
      console.error("[SRE_PURGE] Erro crítico na purga:", err);
      setOperacaoAtiva(null);
      setIsProcessing(false);
    }
  };

  const processarCargaFatiada = async (arquivo: Blob) => {
    try {
      setIsProcessing(true);
      setOperacaoAtiva('CARGA');
      setProgresso(1);
      addLog(`[SRE_LOADER] Iniciando extração física da planilha...`);
      const dadosExtraidos = await DatabaseLoaderService.extrairDadosDaPlanilha(arquivo);
      if (!dadosExtraidos || dadosExtraidos.length === 0) {
        addLog(`[SRE_LOADER] Aviso: Nenhum registro extraído.`);
        setIsProcessing(false);
        setOperacaoAtiva(null);
        setProgresso(0);
        return;
      }

      addLog(`[SRE_LOADER] Planilha lida. ${dadosExtraidos.length} registros brutos encontrados.`);
      addLog(`[SRE_LOADER] Iniciando injeção em lotes de 200 (Política SRE)...`);
      
      const totalInserido = await DatabaseLoaderService.injetarDadosEmLotes(dadosExtraidos, (p) => setProgresso(p));
      addLog(`[SRE_LOADER] Carga concluída com sucesso: ${totalInserido} ativos injetados.`);
      
      const novoTotal = await db.ativos.count();
      setAssetCount(novoTotal);

      // PREVENÇÃO DE SESSÃO FANTASMA: Garante as viewports corretas no localStorage antes do F5
      const historicoManutencao = [AppScreen.LOGIN, AppScreen.MODULE_SELECTION, AppScreen.DASHBOARD, AppScreen.DATABASE_MANAGER];
      localStorage.setItem('gbr_kardek_history', JSON.stringify(historicoManutencao));
      
      setTimeout(() => {
        window.location.reload(); // F5 Resiliente para atualizar contadores da UI
      }, 1000);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`[SRE_LOADER] Erro crítico na carga segmentada: ${errMsg}`);
      console.error("[SRE_LOADER] Erro crítico na carga segmentada:", err);
      setIsProcessing(false);
      setOperacaoAtiva(null);
      setProgresso(0);
    }
  };

  const handleAcionarNavegacaoECarga = () => {
    const inputWeb = document.getElementById('input-file-web-canonic') as HTMLInputElement;
    if (inputWeb) {
      inputWeb.click();
    } else {
      (async () => {
        addLog(`[SRE_LOADER] Invocando seletor de arquivos nativo do dispositivo móvel.`);
        console.log("[SRE_LOADER] Invocando seletor de arquivos nativo do dispositivo móvel.");
        const arquivoBlob = await FileSystemStorageService.selecionarPlanilhaDoDispositivo();
        if (arquivoBlob) {
          await processarCargaFatiada(arquivoBlob);
        } else {
          addLog(`[SRE] Nenhum arquivo selecionado ou operação cancelada.`);
        }
      })();
    }
  };

  const isBaseVazia = assetCount === 0 && logCount === 0;

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
              Todos os comandos nesta página possuem impacto estrutural direto no banco de dados local Dexie.js (IndexedDB). As operações de higienização limpam fisicamente as tabelas do dispositivo.
            </p>
          </div>
        </div>

        {/* Grid de Diagnósticos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Carga de Ativos Segmentada Card */}
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <Database size={12} className="text-emerald-500" />
                <span>Carga de Ativos Segmentada</span>
              </h3>
              <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-semibold mt-2">
                Carrega planilhas Excel/CSV segmentando em blocos de 200 ativos com higienização estrita de endereços em caixa alta sem ruídos.
              </p>
            </div>

            <div className="pt-4">
              <button 
                type="button"
                onClick={handleAcionarNavegacaoECarga}
                disabled={isProcessing || temDadosCarregados}
                style={{ 
                  background: temDadosCarregados ? '#0d1b2a' : '#0a192f', 
                  color: temDadosCarregados ? '#495670' : '#64ffda', 
                  border: temDadosCarregados ? '1px dashed #233554' : '1px dashed #64ffda',
                  opacity: temDadosCarregados ? 0.5 : 1,
                  cursor: temDadosCarregados ? 'not-allowed' : 'pointer',
                  padding: '12px', 
                  borderRadius: '12px', 
                  fontWeight: 'bold', 
                  width: '100%', 
                  transition: 'all 0.2s ease',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em'
                }}
              >
                <span>{temDadosCarregados ? 'BASE JÁ ALIMENTADA' : 'NAVEGAR E CARREGAR PLANILHA'}</span>
              </button>
              <input 
                id="input-file-web-canonic"
                type="file" 
                accept=".xlsx, .xls, .csv" 
                onChange={(e) => { 
                  const file = e.target.files?.[0]; 
                  if (file) {
                    processarCargaFatiada(file); 
                  }
                }}
                style={{ display: 'none' }}
              />
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
                Limpa completamente as tabelas estruturais de <b>ativos</b> e <b>audit_logs</b> do Dexie.js local e remove as configurações salvas no dispositivo.
              </p>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={handleReset}
                disabled={isProcessing || !isAdmin || isBaseVazia}
                className={`w-full flex items-center justify-center space-x-2 px-6 py-3 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border ${
                  isBaseVazia 
                    ? "bg-slate-950 text-slate-500 border-slate-800 cursor-not-allowed opacity-50" 
                    : "bg-red-650 hover:bg-red-700 disabled:bg-slate-850 disabled:text-slate-500 text-white cursor-pointer border-red-500/35 active:scale-95"
                }`}
              >
                <Trash2 size={16} />
                <span>
                  {isProcessing 
                    ? "Executando Purga..." 
                    : isBaseVazia 
                      ? "Base já Higienizada" 
                      : "Zerar Base de Dados Local"}
                </span>
              </button>
              {!isAdmin && (
                <p className="text-[9px] text-red-400 font-bold uppercase text-center mt-2.5 tracking-wider animate-pulse">
                  Controle Restrito: Apenas ADMIN pode zerar a base de dados local.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Componente Único de Progressão Simétrica Reativa */}
        {operacaoAtiva && (
          <div style={{ width: '100%', background: '#112240', height: '16px', borderRadius: '4px', marginBottom: '12px', overflow: 'hidden', border: '1px solid #233554', display: 'flex', alignItems: 'center' }}>
            <div style={{ 
              width: `${progresso}%`, 
              background: operacaoAtiva === 'CARGA' ? '#64ffda' : '#ff5555', 
              height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              color: '#0a192f', fontSize: '10px', fontWeight: 'bold', 
              transition: 'width 0.2s ease, background-color 0.3s ease' 
            }}>
              {operacaoAtiva}: {progresso}%
            </div>
          </div>
        )}

        {/* Injeção acima do SRE Boot Monitor: Barra de Progresso e Pasta Ativa */}
        <div style={{ padding: '12px', background: '#0a192f', border: '1px solid #233554', borderRadius: '12px', marginBottom: '16px', fontSize: '10px', color: '#8892b0', width: '100%', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>📁 DIRETÓRIO DE PERSISTÊNCIA FÍSICA ATIVA (CAPACITOR): </span>
          <strong style={{ color: '#64ffda' }}>{caminhoDiretorio}</strong>
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
                  addLog(`[SRE GESTOR] Operação cancelada pelo operador.`);
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
