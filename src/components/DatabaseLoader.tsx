import React, { useState, useEffect, useRef } from 'react';
import { read, utils } from 'xlsx';
import { sqliteService } from '../services/sqliteService';
import { assetRepository } from '../services/assetRepository';
import { Database, Loader2, Link2, RefreshCw, AlertCircle, FileSpreadsheet, FolderOpen, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatErrorMessage } from '../utils/errorUtils';

import { Asset, InventoryCampaign, User, InventoryState, ModalConfig, DatabaseMode, DatabaseStatus } from '../types';
import { saveInventory } from '../services/persistenceService';

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
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  
  const loadingAttempted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    console.log(`[DatabaseLoader] ${msg}`);
    setLoadingMessage(msg);
    setErrorLog(prev => [...prev.slice(-10), msg]);
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

  const processRowsToDatabaseBatch = async (rows: any[]) => {
    const CONTA_BAIXA = "131105001";
    const sqlStatements: string[] = [];

    addLog(`Mapeando ${rows.length} ativos. Preparando lote nativo...`);

    for (const row of rows) {
      if (String(row.conta_contabil || row.CONTA || row.CONTACONTABIL || '') === CONTA_BAIXA) continue;

      const id = row.id || row.ID || row.PRIMARYKEY || crypto.randomUUID();
      
      // Robust column finding
      const rowKeys = Object.keys(row);
      const findVal = (priorities: string[]) => {
        const key = rowKeys.find(k => priorities.includes(k.toUpperCase().replace(/\s/g, '_')));
        return key ? row[key] : null;
      };

      const codigoAtivo = String(findVal(['ETIQUETA', 'CODIGO', 'REGISTRO', 'PLAQUETA']) || '').replace(/'/g, "''").trim();
      const contaContabil = String(findVal(['CONTACONTABIL', 'CONTA', 'CONTA_CONTABIL']) || '').replace(/'/g, "''").trim();
      const sn1 = row.Sn1_recno || row.SN1_RECNO || 'NULL';
      const sn3 = row.Sn3_recno || row.SN3_RECNO || 'NULL';
      
      const registro = String(findVal(['REGISTRO', 'RECORD']) || codigoAtivo || '').replace(/'/g, "''").trim();
      const descricao = String(findVal(['DESCRICAODOATIVO', 'DESCRICAO', 'BEM']) || 'Importado via Expert').replace(/'/g, "''").trim();
      
      let unidadeOp = String(findVal(['UNIDADE_OPERACIONAL', 'UNIDADE', 'UNIT', 'FILIAL', 'LOCALIZACAO', 'CENTRO_DE_CUSTO', 'CC']) || 'MATRIZ').replace(/'/g, "''").trim().toUpperCase();
      if (!unidadeOp || unidadeOp === 'NULL') unidadeOp = 'MATRIZ';

      const centroCusto = String(findVal(['CENTRODECUSTO', 'CC', 'CCUSTO']) || '').replace(/'/g, "''").trim();
      const vlrAquisic = Number(findVal(['VLRAQUISIC', 'VALOR', 'PRECO']) || 0);
      const dataAquisic = String(findVal(['DATAAQUISIC', 'DATA']) || '').replace(/'/g, "''").trim();
      const qt = String(findVal(['QT', 'QUANTIDADE']) || '1').replace(/'/g, "''").trim();
      const grupoEmp = String(findVal(['GRUPO_EMPRESARIAL', 'GRUPO', 'EMPRESA']) || '').replace(/'/g, "''").trim();
      const endereco = String(findVal(['ENDERECO', 'LOCAL']) || '').replace(/'/g, "''").trim();
      const subreg = String(findVal(['SUBREG', 'SALA', 'DEP']) || '').replace(/'/g, "''").trim();

      // Inserção na tabela de ativos (espelhamento contábil)
      sqlStatements.push(`INSERT OR REPLACE INTO ativos_imobilizados (Sn1_recno, Sn3_recno, id, codigo_ativo, conta_contabil, _origemTransacao, _status_sinc) VALUES (${sn1}, ${sn3}, '${id}', '${codigoAtivo}', '${contaContabil}', 1000, 0);`);
      
      // Inserção na tabela mestre (inventário)
      sqlStatements.push(`INSERT OR REPLACE INTO inventario_mestre (
        id, ETIQUETA, REGISTRO, DESCRICAODOATIVO, CONTACONTABIL, 
        UNIDADE_OPERACIONAL, CENTRODECUSTO, VLRAQUISIC, DATAAQUISIC, 
        QT, GRUPO_EMPRESARIAL, ENDERECO, SUBREG, _origemTransacao
      ) VALUES (
        '${id}', '${codigoAtivo}', '${registro}', '${descricao}', '${contaContabil}', 
        '${unidadeOp}', '${centroCusto}', ${vlrAquisic}, '${dataAquisic}', 
        '${qt}', '${grupoEmp}', '${endereco}', '${subreg}', 'EXPERT_LOAD'
      );`);
    }

    try {
      addLog(`Injetando dados no SQLite Nativo...`);
      await sqliteService.executeStatementsBatch(sqlStatements);
      addLog("Carga concluída com sucesso!");
      
      if (showModal) showModal('Sucesso', 'Carga realizada com sucesso em Modo Soberano!', 'success');
      
      // Forçamos a limpeza do cache de unidades para garantir que o resumo atualize
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (sqlError: any) {
      alert(`Falha ao salvar no banco local: ${sqlError.message}`);
      setStatus('ERROR');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('IMPORTING');
    addLog(`Lendo planilha (Soberania Nativa): ${file.name}`);

    try {
      const reader = new FileReader();
      
      reader.onload = async (evt) => {
        try {
          const data = evt.target?.result;
          if (!data) throw new Error("Falha ao ler bytes do arquivo.");

          addLog("Parsing binário via XLSX...");
          const workbook = read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const rows: any[] = utils.sheet_to_json(workbook.Sheets[sheetName]);

          if (rows.length === 0) throw new Error("Planilha vazia.");

          await processRowsToDatabaseBatch(rows);

        } catch (innerError: any) {
          addLog(`Erro interno: ${innerError.message}`);
          alert(`Erro no processamento: ${innerError.message}`);
          setStatus('ERROR');
        }
      };

      reader.readAsArrayBuffer(file);

    } catch (error: any) {
      console.error("Erro fatal ao carregar planilha:", error);
      addLog(`Falha na carga: ${error.message}`);
      setStatus('ERROR');
    }
  };


  const handleExpertLoadClick = async () => {
    const fStatus = await sqliteService.getFileStatus();
    if (fStatus.handle && fStatus.status !== 'granted') {
      addLog("Solicitando permissão...");
      const success = await sqliteService.requestFilePermission();
      if (!success) return;
    }
    fileInputRef.current?.click();
  };

  const handleHardResetLocal = async () => {
    const confirmar = window.confirm(
      "ATENÇÃO: Deseja realmente limpar todas as tabelas locais e reiniciar o banco em branco? Esta ação não afetará o arquivo físico nativo."
    );
    if (!confirmar) return;

    setStatus('LOADING');
    addLog('Executando limpeza de governança...');

    try {
      await sqliteService.executeQuery("DROP TABLE IF EXISTS ativos_imobilizados;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS inventario_mestre;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS unit_configs;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS AUDIT_LOG;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS localidades;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS campaigns;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS inventory_config;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS campaign_snapshots;");
      await sqliteService.executeQuery("DROP TABLE IF EXISTS users;");
      
      await sqliteService.initializeDatabase(true);
      
      alert("Banco de dados resetado com sucesso!");
      window.location.reload();
    } catch (err: any) {
      alert(`Falha ao executar Hard Reset: ${err.message}`);
      setStatus('ERROR');
    }
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
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Processando</h3>
            <p className="text-[10px] text-blue-600 font-bold uppercase animate-pulse">{loadingMessage}</p>
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
                onClick={handleHardResetLocal}
                className="flex items-center justify-center gap-4 bg-white border-2 border-red-100 text-red-600 p-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-red-50 active:scale-95 transition-all group"
              >
                <div className="p-2 bg-red-50 rounded-xl">
                  <RefreshCw size={16} />
                </div>
                <span>Limpar e Iniciar em Branco</span>
              </button>

              <button
                onClick={handleCreateEmpty}
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 hover:text-accent transition-colors"
              >
                Pular Carga (Modo Demo)
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
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Injetando Soberania</h3>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest animate-pulse">
                {loadingMessage}
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

            <button
               onClick={async () => {
                if (summary) {
                  try {
                    setStatus('LOADING');
                    addLog("Ativando sistema...");
                    const assets = await sqliteService.getAllAssets();
                    
                    // Sincroniza o cache do IndexedDB com o novo banco SQL carregado
                    const newState: InventoryState = {
                      assets,
                      companies: summary.companies,
                      databaseMode: DatabaseMode.INTERNAL,
                      status: DatabaseStatus.LOADED,
                      lastUpdated: new Date().toISOString()
                    };
                    
                    addLog("Sincronizando cache de segurança...");
                    await saveInventory(newState, assets);

                    sessionStorage.setItem('app_just_finished_load', 'true');
                    onDataLoaded(assets, summary.companies);
                    setStatus('IDLE');
                  } catch (err: any) {
                    addLog(`Erro na ativação: ${err.message}`);
                    setStatus('SUMMARY');
                  }
                }
              }}
              className="w-full bg-emerald-600 text-white p-5 rounded-3xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <RefreshCw size={18} />
              Ativar Sistema
            </button>
            
            <button
                onClick={handleHardResetLocal}
                className="text-[9px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 py-2"
              >
                Limpar dados e carregar novo arquivo
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
            <p className="text-[10px] text-slate-500 max-w-xs">{loadingMessage}</p>
            <button
              onClick={() => loadDataFlow()}
              className="text-[10px] font-black text-blue-600 uppercase hover:underline p-4"
            >
              Tentar Novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 border-t border-slate-200 pt-4 w-full">
        <div className="flex flex-col gap-1">
          {errorLog.slice(-5).map((log, i) => (
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
