import React, { useState, useEffect, useRef } from 'react';
import { sqliteService } from '../services/sqliteService';
import { Database, Loader2, Link2, RefreshCw, AlertCircle, FileSpreadsheet, FolderOpen, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatErrorMessage } from '../utils/errorUtils';

import { Asset, InventoryCampaign, User, InventoryState, ModalConfig, DatabaseMode } from '../types';

interface DatabaseLoaderProps {
  onDataLoaded: (assets: Asset[], companies: string[]) => void;
  onBack?: () => void;
  onOpenHelp?: () => void;
  isSyncing?: boolean;
  syncProgress?: { current: number; total: number } | null;
  excludedAccounts?: string[];
  campaigns?: InventoryCampaign[];
  user?: User | null;
  databaseMode?: DatabaseMode;
  showModal?: (title: string, message: string, type: ModalConfig['type']) => void;
  onRestore?: (state: InventoryState) => void;
  onClearDatabase?: () => void;
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ 
  onDataLoaded,
  onBack,
  showModal
}) => {
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PERMISSION_NEEDED' | 'ERROR' | 'IMPORTING' | 'EMPTY_STATE'>('IDLE');
  const [fileInfo, setFileInfo] = useState<{ fileName: string | null; status: string } | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const loadingAttempted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    console.log(`[DatabaseLoader] ${msg}`);
    setErrorLog(prev => [...prev.slice(-20), msg]);
  };

  const loadDataFlow = async (forceCache = false) => {
    if (status === 'LOADING' && !forceCache) return;
    
    addLog(forceCache ? "Forçando carga via Cache..." : "Iniciando fluxo de carga...");
    setStatus('LOADING');
    
    try {
      // 1. Checa status do arquivo
      const fileStatus = await sqliteService.getFileStatus();
      setFileInfo({ fileName: fileStatus.fileName, status: fileStatus.status });

      const isRestricted = fileStatus.status === 'prompt' || fileStatus.status === 'denied' || fileStatus.status === 'expired';

      if (isRestricted && !forceCache) {
        addLog(`Atenção: Arquivo detectado mas status é ${fileStatus.status}`);
        setStatus('PERMISSION_NEEDED');
        return;
      }

      // 2. Inicializa o serviço (se forceCache for true, ele tentará o cache mesmo com status prompt)
      // Passamos um flag interno no sqliteService se necessário, mas o init() já tem fallback.
      // Vamos garantir que se forceCache for true, ele não tente o físico se soubermos que falhará.
      const success = await sqliteService.init();
      
      if (success) {
        addLog(`Inicializado via ${sqliteService.getStorageSource()}`);
        const assetsRaw = await sqliteService.query("SELECT * FROM assets WHERE _is_deleted = 0");
        const assets = assetsRaw as unknown as Asset[];
        
        if (assets.length === 0 && sqliteService.getStorageSource() !== 'PHYSICAL') {
          addLog("Banco vazio detectado (Cache/Memória).");
          setStatus('EMPTY_STATE');
          return;
        }

        if (assets.length === 0 && sqliteService.getStorageSource() === 'PHYSICAL') {
           addLog("Banco físico vinculado detectado (Vazio). Permanecendo para carga.");
           // Não mostramos EMPTY_STATE se já temos um arquivo vinculado, 
           // apenas permitimos que o usuário use o botão de carga na UnitSelector ou continue aqui.
           // No entanto, para melhor UX, vamos mostrar o EMPTY_STATE mas salvar o status de carregado.
           setStatus('EMPTY_STATE');
           return;
        }

        // Extração de empresas
        const companies = [...new Set(assets.map((a: Asset) => 
          (String(a.UNIDADE_OPERACIONAL || a.UNIDADE || a._unitid || 'OUTROS')).toUpperCase()
        ))].filter(Boolean) as string[];

        addLog(`Carga concluída. Ativos: ${assets.length}`);
        sessionStorage.setItem('app_just_finished_load', 'true');
        onDataLoaded(assets, companies);
        setStatus('IDLE');
      } else {
        setStatus('ERROR');
        addLog("Falha ao montar banco de dados.");
      }
    } catch (err: unknown) {
      const { message } = formatErrorMessage(err);
      addLog(`Erro: ${message}`);
      setStatus('ERROR');
    }
  };

  useEffect(() => {
    if (!loadingAttempted.current) {
      loadingAttempted.current = true;
      loadDataFlow();
    }
  }, []);

  const handleReconnect = async () => {
    addLog("Re-vincuando arquivo solicitado...");
    const handle = await sqliteService.linkFile();
    if (handle) {
      loadDataFlow();
    }
  };

  const handleMapFolder = async () => {
    addLog("Mapeando diretório de trabalho...");
    const handle = await sqliteService.linkFile(); // Note: sqliteService.mapLocalFolder maps to linkFile in v25
    if (handle) {
      loadDataFlow();
    }
  };

  const handleCreateNewPhysical = async () => {
    addLog("Criando novo arquivo de banco físico...");
    const handle = await sqliteService.createPhysicalFile();
    if (handle) {
      loadDataFlow();
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)) {
      addLog(`Erro: O arquivo "${file.name}" não é uma planilha válida.`);
      alert("Por favor, selecione um arquivo Excel (.xlsx, .xls) ou CSV.");
      return;
    }

    setStatus('IMPORTING');
    addLog(`Lendo planilha: ${file.name}`);

    try {
      // 0. Espaço em Disco
      if (navigator.storage && navigator.storage.estimate) {
        const { quota, usage } = await navigator.storage.estimate();
        const available = (quota || 0) - (usage || 0);
        if (available < file.size * 5) {
          const proceed = window.confirm(`Espaço em disco baixo (~${Math.round(available/1024/1024)}MB). Continuar?`);
          if (!proceed) { setStatus('IDLE'); return; }
        }
      }

      // 1. Verificação de Permissão
      const hasPermission = await sqliteService.verifyPermission();
      if (!hasPermission) {
        addLog("Erro: Permissão negada.");
        setStatus('IDLE');
        return;
      }

      await sqliteService.init(); 

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataBuffer = evt.target?.result as ArrayBuffer;
        
        addLog("Iniciando Worker de Processamento...");
        
        try {
          // Utiliza o Worker estático no-bundle para evitar erros de minificação
          // Cache bust com timestamp para garantir que pegamos a versão corrigida
          const worker = new Worker(`/workers/assetProcessor.js?v=${Date.now()}`);
          
          // BroadcastChannel para comunicação de dados pesados
          const channel = new BroadcastChannel('asset_worker_channel');
          
          worker.addEventListener('message', async (e) => {
            const data = e.data;
            const type = data.type;
            const current = data.current;
            const total = data.total;
            const msg = data.msg;
            const stack = data.stack;
            const raw = data.raw;
            const dbBuffer = data.dbBuffer;
            
            if (type === 'STATUS') {
              addLog(msg);
            } else if (type === 'PROGRESS') {
              setImportProgress({ current, total });
              addLog(`Gravando no SQLite Local: ${current} / ${total}`);
              
              // @ts-expect-error performance.memory is experimental
              const memory = window.performance.memory;
              if (memory) {
                const used = Math.round(memory.usedJSHeapSize / 1024 / 1024);
                addLog(`Heap: ${used}MB`);
              }
            } else if (type === 'COMPLETE') {
              addLog("Exportando banco atualizado...");
              if (dbBuffer) {
                await sqliteService.importDatabase(new Uint8Array(dbBuffer));
              }
              addLog("Sucesso!");
              setStatus('IDLE');
              channel.close();
              worker.terminate();
              if (showModal) showModal('Sucesso', 'Carga finalizada com persistência direta.', 'success');
              await loadDataFlow();
            } else if (type === 'ERROR') {
              console.error("Worker Critical Failure:", { msg, stack, raw });
              const { message, raw: formattedRaw } = formatErrorMessage({ message: msg, stack, raw });
              addLog(`ERRO CRÍTICO: ${message}`);
              
              // Log stack and raw separately for deep debug
              console.log("Full Stack:", stack);
              console.log("Full Raw Error:", raw);

              alert(`DEBUG CRÍTICO (Worker):\n\nMensagem: ${message}\n\nRaw Data (primeiros 200 chars): ${String(formattedRaw).substring(0, 200)}...`);
              setStatus('ERROR');
              channel.close();
              worker.terminate();
            }
          });

          worker.addEventListener('error', (err) => {
            console.error("Worker Global Error:", err);
            addLog(`Worker Error: ${err.message}`);
            setStatus('ERROR');
            worker.terminate();
          });

          const db = await sqliteService.getDb();
          const dbData = db ? db.export() : null;

          if (dbData) {
            // Enviamos apenas buffers puros para evitar problemas de serialização de objetos complexos
            const dataBuf = dataBuffer;
            const dbBuf = dbData.buffer;
            
            const payload = { 
              dataBuffer: dataBuf, 
              dbBuffer: dbBuf 
            };
            
            // Tenta postMessage (Transferable)
            worker.postMessage(payload, [dataBuf, dbBuf]);
            
            // E também via Channel (não suporta Transferable da mesma forma em todos os browsers, mas serve como fallback)
            // Nota: Se o postMessage falhar por conflito de constante, o channel pode salvar.
            try {
               channel.postMessage(payload);
            } catch (chanErr) {
               console.warn("BroadcastChannel postMessage failed:", chanErr);
            }
          } else {
            const payload = { 
              dataBuffer, 
              dbBuffer: null 
            };
            worker.postMessage(payload, [dataBuffer]);
            try {
               channel.postMessage(payload);
            } catch (chanErr) {
               console.warn("BroadcastChannel postMessage failed:", chanErr);
            }
          }

        } catch (err) {
          const { message, stack, raw } = formatErrorMessage(err);
          console.error("Falha na Carga:", { message, stack, raw });
          addLog(`ERRO: ${message}`);
          alert(`Falha na importação: ${message}\n\nDebug: ${raw?.substring(0, 500)}`);
          setStatus('ERROR');
        }
      };
      
      reader.onerror = (err) => {
        addLog(`Erro na leitura: ${err}`);
        setStatus('ERROR');
      };

      reader.readAsArrayBuffer(file);
    } catch (err) {
       const { message } = formatErrorMessage(err);
       addLog(`Erro ao iniciar: ${message}`);
       setStatus('ERROR');
    }
  };


  const handleExpertLoadClick = async () => {
    // Se temos um arquivo físico vinculado mas está sem permissão, pedimos primeiro
    const fStatus = await sqliteService.getFileStatus();
    if (fStatus.handle && fStatus.status !== 'granted') {
      addLog("Solicitando permissão para gravar no arquivo vinculado...");
      const success = await sqliteService.requestFilePermission();
      if (!success) {
        alert("Atenção: Para carregar dados no arquivo físico você precisa conceder permissão de escrita.");
        return;
      }
    }
    
    fileInputRef.current?.click();
  };

  const handleCreateEmpty = async () => {
    addLog("Criando nova base de dados vazia...");
    onDataLoaded([], []);
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-3xl border border-slate-200/50 backdrop-blur-sm min-h-[300px]">
      <AnimatePresence mode="wait">
        {status === 'LOADING' && (
          <motion.div 
            key="loading"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 text-center"
          >
            <div className="relative">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <Database className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Acessando Camada de Dados</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Verificando integridade física...</p>
          </motion.div>
        )}

        {status === 'EMPTY_STATE' && (
          <motion.div 
            key="empty"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-6 text-center max-w-sm"
          >
            <div className="bg-blue-100 p-5 rounded-[2rem] shadow-inner text-blue-600">
              <Database size={40} strokeWidth={2.5} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Base Vazia Detectada</h3>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">O sistema está pronto para receber dados.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 w-full mt-4">
              <button
                onClick={handleExpertLoadClick}
                className="flex items-center justify-center gap-4 bg-accent text-white p-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-accent/20 active:scale-95 transition-all group"
              >
                <div className="p-2 bg-white/20 rounded-xl group-hover:rotate-12 transition-transform">
                  <FileSpreadsheet size={18} />
                </div>
                <span>Carga Expert (Excel)</span>
              </button>

              <button
                onClick={handleCreateNewPhysical}
                className="flex items-center justify-center gap-4 bg-white border-2 border-slate-200 text-slate-600 p-5 rounded-3xl font-black text-xs uppercase tracking-widest hover:border-emerald-200 hover:text-emerald-600 active:scale-95 transition-all group"
              >
                <div className="p-2 bg-emerald-50 rounded-xl group-hover:rotate-12 transition-transform">
                  <Database size={18} className="text-emerald-600" />
                </div>
                <span>Criar Novo Arquivo SQL</span>
              </button>

              <button
                onClick={handleMapFolder}
                className="flex items-center justify-center gap-4 bg-white border-2 border-slate-200 text-slate-600 p-5 rounded-3xl font-black text-xs uppercase tracking-widest hover:border-blue-200 hover:text-blue-600 active:scale-95 transition-all group"
              >
                <div className="p-2 bg-slate-100 rounded-xl group-hover:scale-110 transition-transform">
                  <FolderOpen size={18} />
                </div>
                <span>Vincular Arquivo .DB Existente</span>
              </button>

              <button
                onClick={handleCreateEmpty}
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 hover:text-accent transition-colors"
              >
                Iniciar com Base em Branco
              </button>
            </div>

            {onBack && (
              <button 
                onClick={onBack}
                className="mt-6 flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all"
              >
                <ChevronLeft size={14} />
                Voltar
              </button>
            )}

            <input 
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportExcel}
            />
          </motion.div>
        )}

        {status === 'IMPORTING' && (
          <motion.div 
            key="importing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-6 text-center"
          >
            <div className="w-16 h-16 bg-blue-50 border-4 border-blue-500 border-t-transparent rounded-full animate-spin flex items-center justify-center" />
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Processando Ativos</h3>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">
                {importProgress.current} / {importProgress.total} Registros
              </p>
            </div>
          </motion.div>
        )}

        {status === 'PERMISSION_NEEDED' && (
          <motion.div 
            key="permission"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 text-center max-w-xs"
          >
            <div className="bg-amber-100 p-4 rounded-full">
              <Link2 className="w-10 h-10 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Vínculo Expirado</h3>
              <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                Por segurança, o navegador exige que você re-aponte o arquivo <span className="font-bold text-slate-900">&quot;{fileInfo?.fileName}&quot;</span> para esta sessão.
              </p>
            </div>
            
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={handleReconnect}
                className="group flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                Re-vincular Arquivo
              </button>

              <button
                onClick={() => loadDataFlow(true)}
                className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all py-2"
              >
                Tentar carregar via Cache local
              </button>
            </div>
          </motion.div>
        )}

        {status === 'ERROR' && (
          <motion.div 
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 text-center"
          >
            <AlertCircle className="w-12 h-12 text-red-500" />
            <h3 className="text-sm font-black text-red-800 uppercase tracking-widest">Falha na Sincronização</h3>
            <button
              onClick={() => loadDataFlow()}
              className="text-[10px] font-black text-blue-600 uppercase hover:underline"
            >
              Tentar Novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 border-t border-slate-200 pt-4 w-full">
        <div className="flex flex-col gap-1">
          {errorLog.map((log, i) => (
            <p key={i} className="text-[8px] font-mono text-slate-400 truncate text-center">
              {log}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DatabaseLoader;
