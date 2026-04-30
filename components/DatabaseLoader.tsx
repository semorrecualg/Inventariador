import React, { useState, useEffect, useRef } from 'react';
import { sqliteService } from '../services/sqliteService';
import { assetRepository } from '../services/assetRepository';
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
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PERMISSION_NEEDED' | 'ERROR' | 'IMPORTING' | 'EMPTY_STATE' | 'SUMMARY'>('IDLE');
  const [fileInfo, setFileInfo] = useState<{ fileName: string | null; status: string } | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ assets: number; units: number; companies: string[] } | null>(null);
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
    
    // Failsafe: se ficar preso em LOADING por 15s, libera
    const timeoutId = setTimeout(() => {
      if (status === 'LOADING') {
        addLog("TIMEOUT: Carga demorou demais. Liberando interface.");
        setStatus('IDLE');
      }
    }, 15000);
    
    try {
      // 1. Checa status do arquivo
      const fileStatus = await sqliteService.getFileStatus();
      setFileInfo({ fileName: fileStatus.fileName, status: fileStatus.status });

      const isRestricted = fileStatus.status === 'prompt' || fileStatus.status === 'denied' || fileStatus.status === 'expired';

      if (isRestricted && !forceCache) {
        addLog(`Atenção: Arquivo detectado mas status é ${fileStatus.status}`);
        clearTimeout(timeoutId);
        setStatus('PERMISSION_NEEDED');
        return;
      }

      // 2. Inicializa o serviço
      const success = await sqliteService.init();
      
      if (success) {
        const source = sqliteService.getStorageSource();
        const nativePath = sqliteService.getNativePath();
        addLog(`Inicializado via ${source}`);
        if (nativePath) addLog(`Caminho Real: ${nativePath}`);
        
        // OTIMIZAÇÃO: Busca apenas o count em vez de todos os objetos para o resumo
        const assetCount = await sqliteService.getAssetCount();
        addLog(`Contagem de ativos realizada: ${assetCount}`);
        
        if (assetCount === 0 && sqliteService.getStorageSource() !== 'PHYSICAL') {
          addLog("Banco vazio detectado (Cache/Memória).");
          clearTimeout(timeoutId);
          setStatus('EMPTY_STATE');
          return;
        }

        if (assetCount === 0 && sqliteService.getStorageSource() === 'PHYSICAL') {
           addLog("Banco físico vinculado detectado (Vazio). Permanecendo para carga.");
           clearTimeout(timeoutId);
           setStatus('EMPTY_STATE');
           return;
        }

        // Extração de unidades via Query Otimizada
        const companies = await sqliteService.getOperationalUnits();
        addLog(`Extração de unidades concluída: ${companies.length} encontradas.`);

        if (assetCount > 0 && companies.length === 0) {
          addLog("AVISO: Ativos carregados mas nenhuma unidade identificada.");
          // ... (mantém lógica de modal se necessário)
        }

        addLog(`Fluxo de carga finalizado com sucesso. Ativos: ${assetCount}.`);
        
        if (assetCount > 0) {
          setSummary({ assets: assetCount, units: companies.length, companies });
          clearTimeout(timeoutId);
          // Pequeno delay para percepção visual do status concluído
          setTimeout(() => {
            addLog("Transacionando para TELA DE RESUMO.");
            setStatus('SUMMARY');
          }, 500);
        } else {
          clearTimeout(timeoutId);
          onDataLoaded([], companies);
          setStatus('IDLE');
        }
      } else {
        clearTimeout(timeoutId);
        setStatus('ERROR');
        addLog("Falha ao montar banco de dados.");
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
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
    addLog("Mapeando diretório de trabalho exclusivo...");
    const handle = await sqliteService.hardLinkPick(); 
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
              addLog("Exportando banco atualizado e forçando persistência física...");
              if (dbBuffer) {
                const u8Data = new Uint8Array(dbBuffer);
                await sqliteService.importDatabase(u8Data);
                // Garantia Extra: Força o sync físico com commit imediato no disco
                await sqliteService.persist(true);
                addLog("Persistência física confirmada.");

                // POPULAÇÃO DO REPOSITÓRIO DE ALTA PERFORMANCE (DEXIE)
                addLog("Otimizando busca instantânea (Indexação)...");
                const assetsToSync = await sqliteService.getAllAssets();
                if (assetsToSync && assetsToSync.length > 0) {
                  await assetRepository.bulkInsert(assetsToSync);
                  addLog(`${assetsToSync.length} ativos indexados no cache rápido.`);
                }
              }
              addLog("Carga concluída com sucesso!");
              
              // Pequena pausa para garantir que o OS liberou o arquivo
              await new Promise(r => setTimeout(r, 1000));
              
              setStatus('IDLE');
              channel.close();
              worker.terminate();
              if (showModal) showModal('Sucesso', 'Carga finalizada com sucesso e sincronizada no arquivo .db.', 'success');
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
    <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-3xl border border-slate-200/50 backdrop-blur-sm min-h-[300px] safe-area-p">
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

        {status === 'SUMMARY' && summary && (
          <motion.div 
            key="summary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 text-center max-w-sm"
          >
            <div className="bg-emerald-100 p-5 rounded-[2rem] shadow-inner text-emerald-600">
              <RefreshCw size={40} strokeWidth={2.5} className="animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Carga Concluída</h3>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">O sistema identificou os seguintes dados:</p>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Ativos</p>
                <p className="text-xl font-black text-slate-800 tracking-tight">{summary.assets.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Unidades</p>
                <p className="text-xl font-black text-slate-800 tracking-tight">{summary.units}</p>
              </div>
            </div>

            {summary.units === 0 && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-left">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                  <p className="text-[10px] text-amber-800 font-bold leading-tight uppercase">
                    Aviso: Nenhuma unidade organizacional encontrada. O sistema usará uma unidade padrão. Verifique o mapeamento das colunas.
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={async () => {
                if (summary) {
                  try {
                    setStatus('LOADING');
                    addLog("Preparando camada de memória para ativação...");
                    // Pequena pausa para garantir que o loader apareça
                    await new Promise(r => setTimeout(r, 100));
                    
                    const assets = await sqliteService.getAllAssets();
                    sessionStorage.setItem('app_just_finished_load', 'true');
                    onDataLoaded(assets, summary.companies);
                    setStatus('IDLE');
                  } catch {
                    addLog("Erro na ativação final.");
                    setStatus('SUMMARY');
                  }
                }
              }}
              className="w-full bg-emerald-600 text-white p-5 rounded-3xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <RefreshCw size={18} />
              Ativar Sistema
            </button>
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
