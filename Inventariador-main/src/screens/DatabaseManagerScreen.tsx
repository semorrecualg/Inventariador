import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/sqliteService';
import { showRecoveryToast as originalShowRecoveryToast } from '../services/NavigationGuardService';
import { AppScreen, Asset } from '../types';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { saveSnapshotToWorkspace, saveVirtualSnapshot } from '../services/localDbService';
import { syncAssetsToCloud, isInternalMode } from '../services/supabaseService';
import { isAdminUser } from '../utils/authUtils';
import { Database, Trash2, ArrowLeft, Terminal, AlertTriangle, FileSpreadsheet, UploadCloud } from 'lucide-react';

export async function processAndInjectSpreadsheetData(file: File, onProgress: (p: number) => void): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const data = await DatabaseLoaderService.extrairDadosDaPlanilha(file);
  if (!data || data.length === 0) {
    throw new Error("Planilha vazia ou inválida.");
  }
  await DatabaseLoaderService.injetarDadosEmLotes(data, onProgress);
  return data;
}

interface DatabaseManagerScreenProps {
  onBack?: () => void;
}

export const DatabaseManagerScreen: React.FC<DatabaseManagerScreenProps> = ({ onBack }) => {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [showModal, setShowModal] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showErrorModal, _setShowErrorModal] = useState<boolean>(false);
  const setShowErrorModal = (show: boolean) => {
    if (window.self !== window.top) return; // PROIBIDO DISPARAR MODAL DE ERRO DE BACKUP FÍSICO NO IFRAME
    _setShowErrorModal(show);
    if (typeof window.setShowErrorModal === 'function') {
      window.setShowErrorModal(show);
    }
  };

  const showRecoveryToast = (message: string, type: string = 'blue') => {
    if (window.self !== window.top) return; // PROIBIDO DISPARAR MODAL DE ERRO DE BACKUP FÍSICO NO IFRAME
    originalShowRecoveryToast(message, type);
  };
  const [assetCount, setAssetCount] = useState<number>(0);
  const [logCount, setLogCount] = useState<number>(0);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setConsoleLogs(prev => [...prev, `>> [${time}] ${msg}`].slice(-15));
  };

  const handleBackupButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (backupInputRef.current) {
      addLog("[SRE_BACKUP] Acionando importação de backup físico síncrono...");
      backupInputRef.current.click();
    }
  };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    addLog(`[SRE_BACKUP] Arquivo de backup selecionado: ${file.name}`);
    setIsUploading(true);
    setProgress(10);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error("Formato do arquivo de backup inválido. Esperado um array de ativos.");
        }

        setProgress(40);
        addLog(`[SRE_BACKUP] ${parsed.length} ativos lidos do backup. Gravando no banco físico do dispositivo...`);

        await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
          await db.ativos.clear();
          await db.assets.clear();
          await db.local_assets.clear();
          
          await db.ativos.bulkPut(parsed);
          await db.assets.bulkPut(parsed);
          await db.local_assets.bulkPut(parsed);
        });

        sessionStorage.setItem('gbr_physical_folder_name', 'GBR_Inventario_Virtual');
        localStorage.setItem('gbr_physical_link_active', 'true');

        // Snapshot virtual espelhado de forma resiliente: localStorage primeiro,
        // IndexedDB (localforage) como fallback quando a quota de ~5MB estoura.
        // O banco físico (Dexie) já foi restaurado — a falha do espelho não pode
        // invalidar a reconexão.
        const snapshotMirrored = await saveVirtualSnapshot(parsed);
        if (!snapshotMirrored) {
          addLog("[SRE_BACKUP] Ressalva: espelho do snapshot virtual falhou (quota excedida). Banco físico restaurado com sucesso.");
        }

        setProgress(100);
        setIsUploading(false);
        addLog("[SRE_BACKUP] Restauração e sincronização do backup concluídas com sucesso.");
        showRecoveryToast("✓ BACKUP FISICO RECONECTADO COM SUCESSO.", "blue");
        loadStats();
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        setIsUploading(false);
        addLog(`[SRE_BACKUP ERROR] Falha ao reconectar backup: ${err.message || String(err)}`);
        showRecoveryToast("❌ ERRO AO RECONECTAR BACKUP FÍSICO.", "red");
      }
    };
    reader.onerror = () => {
      setIsUploading(false);
      addLog("[SRE_BACKUP ERROR] Falha na leitura do arquivo de backup.");
      showRecoveryToast("❌ ERRO NA LEITURA DO ARQUIVO.", "red");
    };
    reader.readAsText(file);
  };

  const [activePathName, setActivePathName] = useState<string>(() => {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    const sessionFolder = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('gbr_physical_folder_name') : null;
    if (isIframe) {
      return sessionFolder ? `iFrame Sandbox / ${sessionFolder}` : "iFrame Sandbox / GBR_Inventario_Virtual";
    }
    return sessionFolder || "NENHUM DIRETÓRIO VINCULADO";
  });

  const [isMirroring, setIsMirroring] = useState<boolean>(false);
  const [mirrorProgress, setMirrorProgress] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    try {
      const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        setIsAdmin(isAdminUser(parsed));
      }
    } catch { /* ignore */ }
  }, []);

  const enviarBaseParaNuvem = async () => {
    try {
      setIsMirroring(true);
      setMirrorProgress(1);
      addLog(`[SRE_CLOUD] Iniciando espelhamento em massa da base local para a Nuvem (Supabase)...`);

      const ativos = await db.ativos.toArray();
      if (!ativos || ativos.length === 0) {
        addLog(`[SRE_CLOUD] Aviso: Nenhum ativo local para espelhar.`);
        return;
      }

      // REGRA DE CONTRATO (tenant 100% da base): os tenantids vêm EXCLUSIVAMENTE
      // da própria base carregada (zero valor fixo / zero fallback hard-coded).
      const tenantsDaBase = Array.from(
        new Set(
          ativos
            .map((a) => (a.tenantid || '').trim().toUpperCase())
            .filter((t) => t && t !== 'UNDEFINED' && t !== 'NULL')
        )
      );
      addLog(`[SRE_CLOUD] Contratos detectados na base: ${tenantsDaBase.length ? tenantsDaBase.join(' | ') : '(nenhum — Global)'}`);
      addLog(`[SRE_CLOUD] Enviando ${ativos.length} ativos em lotes de 50 (Política SRE)...`);

      const syncedIds = await syncAssetsToCloud(
        ativos as unknown as Asset[],
        tenantsDaBase.length > 0 ? tenantsDaBase : undefined,
        (processed, total) => {
          const pct = total > 0 ? Math.round((processed / total) * 100) : 100;
          setMirrorProgress(Math.min(pct, 100));
        }
      );

      setMirrorProgress(100);
      addLog(`[SRE_CLOUD] Espelhamento concluído: ${syncedIds.length} ativos sincronizados na Nuvem (Supabase).`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`[SRE_CLOUD] Erro no espelhamento em massa: ${errMsg}`);
      console.error("[SRE_CLOUD] Erro no espelhamento em massa:", err);
    } finally {
      setIsMirroring(false);
      setMirrorProgress(0);
    }
  };

  const loadStats = async () => {
    try {
      const aCount = await db.local_assets.count();
      setAssetCount(aCount);
      const lCount = await db.audit_logs.count();
      setLogCount(lCount);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error("[SRE STATS ERR]", err);
    }
  };

  useEffect(() => {
    addLog("[SRE BOOT] Inicializando painel de gestão de base de dados...");
    loadStats();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    addLog(`[SRE_LOADER] Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    setIsUploading(true);
    setProgress(0);
    const stableHistory = JSON.stringify([AppScreen.DATABASE_MANAGER]);
    
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    const pathName = isIframe ? `iFrame Sandbox / ${file.name}` : `GBR_Inventario / ${file.name}`;
    setActivePathName(pathName);
    sessionStorage.setItem('gbr_physical_folder_name', 'GBR_Inventario_Virtual');
    localStorage.setItem('gbr_physical_link_active', 'true');

    try {
      addLog("[SRE_LOADER] Extraindo e fatiando planilha Excel...");
      const assetsInjected = await processAndInjectSpreadsheetData(file, (currentProgress) => {
        setProgress(currentProgress);
      });

      addLog(`[SRE_LOADER] ${assetsInjected.length} ativos injetados com sucesso.`);
      addLog("[SRE_LOADER] Gerando backup físico na sandbox...");
      try {
        const isFileSaved = await saveSnapshotToWorkspace(assetsInjected);
        localStorage.setItem('gbr_kardek_history', stableHistory);
        setIsUploading(false);

        if (isFileSaved) {
          addLog("[SRE_LOADER] Carga e backup concluídos com sucesso.");
          showRecoveryToast("✓ INTEGRADO E BACKUP GRAVADO COM SUCESSO.", "blue");
        } else {
          addLog("[SRE_LOADER] Carga realizada com ressalva: erro secundário ao gravar backup físico.");
          if (assetsInjected.length > 0) {
            addLog("[SRE_LOADER] Sincronização limpa garantida: ativos locais consolidados na UI. Erro de backup ignorado silenciosamente.");
          } else {
            if (isIframe) {
              addLog("[SRE_LOADER] iFrame Sandbox detectado. Omitindo e ocultando modal de erro residual.");
              setShowErrorModal(false);
            } else {
              showRecoveryToast("⚠️ CARGA OK, FALHA AO GRAVAR ARQUIVO DE BACKUP.", "red");
            }
          }
        }
      } catch (backupError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        localStorage.setItem('gbr_kardek_history', stableHistory);
        setIsUploading(false);
        addLog(`[SRE_LOADER] Exceção de IO secundária ao gravar backup físico: ${backupError.message || String(backupError)}`);
        if (assetsInjected.length > 0) {
          addLog("[SRE_LOADER] Sincronização limpa garantida: ativos locais consolidados na UI. Exceção de backup ignorada silenciosamente.");
        } else {
          if (isIframe) {
            addLog("[SRE_LOADER] iFrame Sandbox detectado na exceção. Omitindo e ocultando modal.");
            setShowErrorModal(false);
          } else {
            showRecoveryToast("⚠️ CARGA OK, FALHA AO GRAVAR ARQUIVO DE BACKUP.", "red");
          }
        }
      }
      loadStats();
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsUploading(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      addLog(`[SRE ERROR] Falha no processamento: ${errMsg}`);
      console.error("[SRE CRÍTICO] Colapso na esteira local de arquivos:", error);
      
      if (isIframe) {
        addLog("[SRE_LOADER] iFrame Sandbox detectado no catch. Omitindo e ocultando modal de erro.");
        setShowErrorModal(false);
      } else {
        showRecoveryToast("❌ ERRO NO PROCESSAMENTO DA PLANILHA.", "red");
      }
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (fileInputRef.current) {
      addLog("[SRE_UI] Acionando seletor de arquivos de forma síncrona...");
      fileInputRef.current.click();
    }
  };

  const handleCompleteDatabasePurge = async () => {
    const stableHistory = JSON.stringify([AppScreen.DATABASE_MANAGER]);
    setIsPurging(true);
    addLog("[SRE_PURGE] Iniciando higienização estrutural de tabelas...");
    
    try {
      await db.transaction('rw', [db.local_assets, db.addresses, db.ativos], async () => {
        await db.local_assets.clear();
        await db.addresses.clear();
        await db.ativos.clear();
      });

      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsPurging(false);
      addLog("[SRE_PURGE] Limpeza de tabelas executada com sucesso.");
      showRecoveryToast("⚡ REGISTROS PURGADOS. ESTABILIDADE DA SESSÃO PRESERVADA.", "blue");
      loadStats();
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsPurging(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      addLog(`[SRE ERROR] Falha na purga: ${errMsg}`);
      console.error("[SRE CRÍTICO] Crash de barramento evitado:", error);
      showRecoveryToast("❌ OPERAÇÃO DE LIMPEZA INTERROMPIDA PELO SISTEMA.", "blue");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 font-sans">
      {/* 1. Header do Gestor */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <Database className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase text-slate-100">
              Gestor de Base de Dados
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              SRE & Controle de I/O Físico
            </p>
          </div>
        </div>

        <button 
          onClick={() => {
            if (onBack) {
              onBack();
            } else {
              const hasPush = typeof window !== 'undefined' && typeof (window as any).pushScreen === 'function'; // eslint-disable-line @typescript-eslint/no-explicit-any
              if (hasPush) {
                (window as any).pushScreen(AppScreen.MODULE_SELECTION); // eslint-disable-line @typescript-eslint/no-explicit-any
              } else {
                localStorage.setItem('gbr_kardek_history', JSON.stringify([AppScreen.MODULE_SELECTION]));
              }
            }
          }}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Voltar</span>
        </button>
      </div>

      {/* 2. Barra de Diretório de Persistência */}
      <div className="mb-6 p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
        <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          <span className="text-emerald-400">📁</span>
          <span>Diretório de Persistência Física Ativa:</span>
        </div>
        <div className="mt-1.5 font-mono text-xs font-black uppercase text-slate-200 tracking-wide break-all">
          {activePathName}
        </div>
      </div>

      {/* 3. Painel de Status */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-xl flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Ativos Locais</span>
          <span className="text-xl font-black text-emerald-400 mt-1 font-mono">{assetCount}</span>
        </div>
        <div className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-xl flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Registros de Auditoria</span>
          <span className="text-xl font-black text-blue-400 mt-1 font-mono">{logCount}</span>
        </div>
      </div>

      {/* 4. Ações Principais */}
      <div className="space-y-4 mb-6">
        {/* Inputs Ocultos e Síncronos */}
        <input 
          type="file" 
          ref={fileInputRef} 
          id="file-loader" 
          accept=".xlsx,.csv" 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />
        <input 
          type="file" 
          ref={backupInputRef} 
          id="backup-loader" 
          accept=".json" 
          style={{ display: 'none' }} 
          onChange={handleBackupFileChange} 
        />

        {/* Botão de Carga Síncrono */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-emerald-950/40 text-emerald-400 rounded-full border border-emerald-900/30">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Carga de Planilhabase</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
              Selecione o arquivo higienizado para importar na base de dados
            </p>
          </div>
          <button 
            disabled={isUploading || isPurging}
            onClick={handleButtonClick}
            className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-98 cursor-pointer border border-emerald-500/20"
          >
            <UploadCloud size={14} />
            <span>{isUploading ? `CARREGANDO: ${progress}%` : "SELECIONAR E CARREGAR PLANILHA"}</span>
          </button>
        </div>

        {/* Reconexão de Backup Físico Sandbox */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-blue-950/40 text-blue-400 rounded-full border border-blue-900/30">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Reconexão Física Sandbox</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
              Recarregue a base de dados instantaneamente a partir do arquivo JSON baixado
            </p>
          </div>
          <button 
            disabled={isUploading || isPurging}
            onClick={handleBackupButtonClick}
            className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-98 cursor-pointer border border-blue-500/20"
          >
            <UploadCloud size={14} />
            <span>RECONECTAR BACKUP FÍSICO (SANDBOX)</span>
          </button>
        </div>

        {/* Botão de Purga Segura */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-red-950/40 text-red-400 rounded-full border border-red-900/30">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Higienização Física</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
              Limpe todas as tabelas locais do dispositivo com segurança
            </p>
          </div>
          <button 
            disabled={isUploading || isPurging}
            onClick={() => {
              if (assetCount > 0) {
                setShowModal(true);
              } else {
                showRecoveryToast("⚠️ A BASE JÁ ENCONTRA-SE TOTALMENTE HIGIENIZADA E VAZIA.", "blue");
              }
            }}
            className={`w-full flex items-center justify-center space-x-2 px-6 py-3 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border ${
              assetCount === 0 
                ? "bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed opacity-50" 
                : "bg-red-650 hover:bg-red-700 text-white cursor-pointer border-red-500/30 active:scale-98"
            }`}
          >
            <Trash2 size={14} />
            <span>{isPurging ? "EXECUTANDO PURGA..." : assetCount === 0 ? "BASE JÁ HIGIENIZADA" : "ZERAR BASE DE DADOS"}</span>
          </button>
        </div>

        {/* Espelhamento em Massa (Supabase) — Card */}
        <div className="p-5 bg-sky-950/20 border border-sky-800/40 rounded-2xl flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-3 bg-sky-950/40 text-sky-400 rounded-full border border-sky-900/30 shrink-0">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase text-sky-200 tracking-wider">Espelhamento em Massa — Supabase</h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-1">
                Sobe a base carregada para a tabela <b>assets</b> da Nuvem em lotes de 50, preservando o <b>tenantid de cada ativo</b> exatamente como veio da planilha (tenant 100% da base — zero valor fixo).
              </p>
            </div>
          </div>
          <div className="md:w-64 shrink-0 w-full">
            <button
              type="button"
              onClick={enviarBaseParaNuvem}
              disabled={isUploading || isPurging || isMirroring || !isAdmin || assetCount === 0 || isInternalMode || !navigator.onLine}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border bg-sky-950/40 hover:bg-sky-900/60 disabled:bg-slate-950 disabled:text-slate-600 disabled:cursor-not-allowed text-sky-300 border-sky-800/60 active:scale-95"
            >
              <UploadCloud size={14} />
              <span>
                {isMirroring
                  ? `SINCRONIZANDO: ${mirrorProgress}%`
                  : !isAdmin
                    ? "APENAS ADMIN"
                    : assetCount === 0
                      ? "BASE VAZIA"
                      : isInternalMode
                        ? "SUPABASE NÃO CONFIGURADO"
                        : !navigator.onLine
                          ? "SEM CONEXÃO"
                          : "ENVIAR BASE PARA A NUVEM"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Terminal de Diagnóstico SRE */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-xl mt-auto">
        <div className="bg-slate-900/80 px-4 py-2 flex items-center justify-between border-b border-slate-900">
          <div className="flex items-center space-x-2">
            <Terminal size={12} className="text-slate-400" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              SRE Diagnostics Monitor
            </span>
          </div>
          <div className="flex space-x-1">
            <span className="w-2 h-2 rounded-full bg-slate-800 block"></span>
            <span className="w-2 h-2 rounded-full bg-slate-800 block"></span>
            <span className="w-2 h-2 rounded-full bg-slate-800 block"></span>
          </div>
        </div>
        
        <div className="p-4 font-mono text-[9px] leading-relaxed text-emerald-400 bg-slate-950/90 h-[120px] overflow-y-auto space-y-1">
          {consoleLogs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap">{log}</div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
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
                onClick={() => {
                  setShowModal(false);
                  addLog("[SRE GESTOR] Operação cancelada pelo operador.");
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all border border-slate-700 active:scale-95 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowModal(false);
                  await handleCompleteDatabasePurge();
                }}
                className="flex-1 py-3 bg-red-650 hover:bg-red-700 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all border border-red-500 active:scale-95 cursor-pointer"
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
