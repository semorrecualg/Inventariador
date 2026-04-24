import React, { useState, useEffect, useRef } from 'react';
import { sqliteService } from '../services/sqliteService';
import { Database, Loader2, Link2, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { DatabaseStatus, DatabaseMode, User, InventoryCampaign, Asset, InventoryState, ModalConfig } from '../types';

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
  onOpenHelp,
  databaseMode
}) => {
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PERMISSION_NEEDED' | 'ERROR'>('IDLE');
  const [fileInfo, setFileInfo] = useState<{ fileName: string | null; status: string } | null>(null);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const loadingAttempted = useRef(false);

  const addLog = (msg: string) => {
    console.log(`[DatabaseLoader] ${msg}`);
    setErrorLog(prev => [...prev.slice(-4), msg]);
  };

  const loadDataFlow = async () => {
    addLog("Iniciando fluxo de carga...");
    setStatus('LOADING');
    
    try {
      // 1. Checa status do arquivo
      const fileStatus = await sqliteService.getFileStatus();
      setFileInfo({ fileName: fileStatus.fileName, status: fileStatus.status });

      if (fileStatus.status === 'prompt' || fileStatus.status === 'denied' || fileStatus.status === 'expired') {
        addLog(`Atenção: Arquivo detectado mas status é ${fileStatus.status}`);
        setStatus('PERMISSION_NEEDED');
        return;
      }

      // 2. Inicializa o serviço
      const success = await sqliteService.init();
      
      if (success) {
        addLog(`Inicializado via ${sqliteService.getStorageSource()}`);
        const assetsRaw = await sqliteService.query("SELECT * FROM assets WHERE _is_deleted = 0");
        const assets = assetsRaw as unknown as Asset[];
        
        // Extração de empresas
        const companies = [...new Set(assets.map((a: Asset) => 
          (String(a.UNIDADE_OPERACIONAL || a.UNIDADE || a._unitid || 'OUTROS')).toUpperCase()
        ))].filter(Boolean) as string[];

        addLog(`Carga concluída. Ativos: ${assets.length}`);
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
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Vínculo Expuser</h3>
              <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                O navegador protege seus arquivos. Para continuar usando <span className="font-bold text-slate-900">&quot;{fileInfo?.fileName}&quot;</span>, precisamos que você re-apontar o arquivo.
              </p>
            </div>
            
            <button
              onClick={handleReconnect}
              className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 transition-all active:scale-95"
            >
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
              Re-vincular Arquivo
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
