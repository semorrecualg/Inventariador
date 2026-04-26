import React, { useState, useEffect, useRef } from 'react';
import { sqliteService } from '../services/sqliteService';
import { Database, Loader2, Link2, RefreshCw, AlertCircle, FileSpreadsheet, FolderOpen, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';

import { Asset, InventoryCampaign, User, InventoryState, ModalConfig, DatabaseMode, TagInventario } from '../types';

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
    setErrorLog(prev => [...prev.slice(-4), msg]);
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
      const error = err as Error;
      addLog(`Erro: ${error.message}`);
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
      // 0. Pre-flight check: Espaço em Disco (Mobile Reliability)
      if (navigator.storage && navigator.storage.estimate) {
        const { quota, usage } = await navigator.storage.estimate();
        const available = (quota || 0) - (usage || 0);
        const estimatedSizeNeeded = file.size * 10; // Estimativa conservadora (Excel -> SQLite)
        
        if (available < estimatedSizeNeeded) {
          const proceed = window.confirm(
            `Aviso de Armazenamento: O dispositivo possui pouco espaço livre (~${Math.round(available / 1024 / 1024)}MB). ` +
            `A importação de grandes planilhas pode falhar. Deseja continuar mesmo assim?`
          );
          if (!proceed) {
            setStatus('IDLE');
            return;
          }
        }
      }

      // 1. Verificação de Permissão antes de começar
      const hasPermission = await sqliteService.verifyPermission();
      if (!hasPermission) {
        addLog("Erro: Permissão de escrita negada pelo navegador.");
        alert("Para realizar a Carga Expert, o navegador precisa de permissão de escrita no arquivo .db. Por favor, tente novamente e autorize o acesso.");
        setStatus('IDLE');
        return;
      }

      // 2. Inicialização
      await sqliteService.init(); 

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const dataBuffer = evt.target?.result as ArrayBuffer;
          const wb = XLSX.read(dataBuffer, { type: 'array' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawData = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

          addLog(`${rawData.length} registros encontrados.`);
          setImportProgress({ current: 0, total: rawData.length });

          const CHUNK_SIZE = 100; // Reduzido de 200 para 100 (Melhor para 2GB/3GB RAM)
          const total = rawData.length;
          const CHECKPOINT_INTERVAL = 10; // A cada 10 lotes (1000 registros), fazemos um persist() físico
          
          for (let i = 0; i < total; i += CHUNK_SIZE) {
            const chunk = rawData.slice(i, i + CHUNK_SIZE);
            
            // Mapeamento do lote
            const assetsChunk: Asset[] = chunk.map((item) => {
              const normalize = (val: unknown) => val === undefined || val === null ? '' : String(val);
              return {
                id: crypto.randomUUID(),
                ETIQUETA: normalize(item.ETIQUETA || item.Etiqueta || item.Plaqueta).trim(),
                DESCRICAODOATIVO: normalize(item.DESCRICAO || item.Descricao || item.DESCRICAODOBEM || item.N1_DESCRIC),
                GRUPO_EMPRESARIAL: normalize(item.GRUPO_EMPRESARIAL || item.Empresa || item.N1_FILIAL),
                UNIDADE_OPERACIONAL: normalize(item.UNIDADE_OPERACIONAL || item.Unidade || item.Local || item.C1_LOCAL),
                CENTRODECUSTO: normalize(item.CUSTO || item.CC || item.N3_CCUSTO || item.CENTRODECUSTO),
                CONTACONTABIL: normalize(item.CONTA || item.Conta || item.N1_CONTA || item.CONTACONTABIL),
                STATUS: normalize(item.STATUS || item.Status || 'PENDENTE'),
                DATAAQUISIC: normalize(item.DATA_AQ || item.DataAq || item.N1_DTACQUIS || item.DATAAQUISIC),
                VLRAQUISIC: Number(item.VALOR || item.Valor || item.N1_VALOR || item.VLRAQUISIC || 0),
                NOTAFISCAL: normalize(item.NF || item.NotaFiscal || item.N1_NFISCAL || item.NOTAFISCAL),
                NOMEFORNECEDOR: normalize(item.FORNECEDOR || item.Fornecedor || item.NOMEFORNECEDOR),
                CNPJ: normalize(item.CNPJ || item.Cnpj || item.CNPJ),
                SERIAL: normalize(item.SERIAL || item.Serial || item.N1_SERIE || item.SERIAL),
                ENDERECO: normalize(item.ENDERECO || item.Endereco || item.ENDERECO),
                REGISTRO: normalize(item.REGISTRO || item.Registro || item.REGISTRO),
                SUBREG: normalize(item.SUBREG || item.Subreg || item.SUBREG),
                DATABAIXA: normalize(item.DATA_BAIXA || item.DataBaixa || item.N1_DTBAIXA || item.DATABAIXA),
                PRIMARYKEY: normalize(item.PK || item.Pk || item.PRIMARYKEY),
                Sn1_recno: Number(item.SN1_RECNO || item.RECNO || item.Sn1_recno || 0),
                Sn3_recno: Number(item.SN3_RECNO || item.Sn3_recno || 0),
                TAG_INVENTARIO: TagInventario.PENDENTE,
                _conferido: false,
                _lastUpdated: new Date().toISOString()
              };
            });

            // Persistência do lote (pulando gravação física intermediária na maioria das vezes)
            await sqliteService.bulkInsertAssets(assetsChunk, true);
            
            // CHECKPOINT: A cada 1000 registros, garantimos a persistência física para resiliência
            if ((i / CHUNK_SIZE) % CHECKPOINT_INTERVAL === 0 && i > 0) {
              addLog(`Checkpoint de resiliência: Gravando ${i} registros no disco...`);
              await sqliteService.persist();
            }

            // Atualiza UI
            const currentCount = Math.min(i + CHUNK_SIZE, total);
            setImportProgress({ current: currentCount, total });
            addLog(`Processado: ${currentCount} / ${total}`);

            // YIELD: Aumentado para 20ms para garantir que o OS/Browser não bloqueie a thread em low-end
            await new Promise(resolve => setTimeout(resolve, 20));
          }

          addLog("Finalizando gravação física...");
          await sqliteService.persist(); // Faz a gravação final de uma vez
          addLog("Importação finalizada com sucesso!");
          setStatus('IDLE');
          
          if (showModal) {
            showModal('Carga Concluída', `${total} registros foram importados com sucesso.`, 'success');
          }
          
          await loadDataFlow();
        } catch (err) {
          console.error("Erro crítico no processamento:", err);
          addLog(`ERRO: ${(err as Error).message}`);
          alert(`Erro crítico durante a importação: ${(err as Error).message}\n\nTente reduzir o tamanho da planilha ou use um computador se o celular persistir no erro.`);
          setStatus('ERROR');
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
       console.error("Erro ao iniciar importação:", err);
       addLog(`Erro ao iniciar: ${(err as Error).message}`);
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
