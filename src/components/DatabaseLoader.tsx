import React, { useState, useEffect, useRef } from 'react';
import { read, utils } from 'xlsx';
import { sqliteService } from '../services/sqliteService';
import { localDb } from '../services/localDbService';
import { Database, Loader2, Link2, RefreshCw, AlertCircle, FileSpreadsheet, ChevronLeft, DownloadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatErrorMessage } from '../utils/errorUtils';
import { Device } from '@capacitor/device';

import { generateUUID } from '../services/supabaseService';
import { Asset, User, ModalConfig, DatabaseMode, DatabaseStatus } from '../types';
import { saveInventory } from '../services/persistenceService';

// GBR v24.50: Campanha de Auditoria Padrão (Static Context)
const DEFAULT_CAMPAIGN_ID = 'CAMP_2025_01';

interface DatabaseLoaderProps {
  onDataLoaded: (assets: Asset[], companies: string[]) => void;
  onBack?: () => void;
  user: User;
  showModal?: (title: string, message: string, type: ModalConfig['type']) => void;
  databaseMode?: DatabaseMode;
  isSyncing?: boolean;
  syncProgress?: { processed: number; total: number; percentage: number } | null;
  onCargaInicial?: () => void;
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ 
  onDataLoaded,
  onBack,
  showModal,
  databaseMode,
  isSyncing = false,
  syncProgress = null,
  onCargaInicial
}) => {
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PERMISSION_NEEDED' | 'ERROR' | 'IMPORTING' | 'EMPTY_STATE' | 'SUMMARY'>('IDLE');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [fileInfo, setFileInfo] = useState<{ fileName: string | null; status: string } | null>(null);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ assets: number; units: number; companies: string[] } | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [showHardResetConfirm, setShowHardResetConfirm] = useState(false);
  const [showCargaPrompt, setShowCargaPrompt] = useState(false);
  
  const loadingAttempted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'EMPTY_STATE' && onCargaInicial && databaseMode === DatabaseMode.INTERNAL && !isSyncing) {
      const alerted = sessionStorage.getItem('carga_inicial_prompted');
      if (!alerted) {
        sessionStorage.setItem('carga_inicial_prompted', 'true');
        setShowCargaPrompt(true);
      }
    }
  }, [status, onCargaInicial, databaseMode, isSyncing]);

  const addLog = (msg: string) => {
    if (msg.includes('Erro') || msg.includes('Falha') || msg.includes('TIMEOUT')) {
      console.error(`[DatabaseLoader] ${msg}`);
    }
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

  const processRowsToDatabaseBatch = async (rows: unknown[]) => {
    // 1. Validação preventiva de Bateria Crítica (Soberania de Energia v26)
    try {
      const batteryInfo = await Device.getBatteryInfo();
      if (batteryInfo.batteryLevel !== undefined && batteryInfo.batteryLevel < 0.05 && !batteryInfo.isCharging) {
        throw new Error("Carga bloqueada: Bateria abaixo de 5% sem fonte de carregamento ativa.");
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message && error.message.includes("Bateria abaixo de 5%")) {
        addLog("ERRO: Bateria abaixo de 5% sem fonte de carregamento ativa.");
        if (showModal) showModal("Bateria Crítica", "Erro de estabilidade: Bateria abaixo de 5% sem carregador.", "error");
        throw err;
      }
      console.warn("Monitor de bateria indisponível ou não suportado na plataforma atual:", error.message);
    }

    const CHUNK_SIZE = 200;
    const totalItems = rows.length;
    
    setProgress({ current: 0, total: totalItems });
    addLog(`Iniciando Carga Expert: ${totalItems} ativos identificados.`);

    const cleanValue = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      const low = s.toLowerCase();
      if (low === 'null' || low === 'undefined' || low === '') return '';
      return s;
    };

    for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      // GBR v26: Define transação atômica única por lote (Bypass do Buffer de 5 registros - sem comandos manuais)
      const sqlStatements: string[] = [];

      for (const row of chunk) {
        let rTenantId = 'CICOPAL';
        let rFilial = 'MATRIZ';
        let rStatus = 'PENDENTE';
        let rEtiqueta = '';
        let rQt = '1';
        let rDescricaodoativo = 'Importado via Expert';
        let rSerial = '';
        let rDataaqusic = '';
        let rCnpj = '';
        let rNomefornecedor = '';
        let rNotafiscal = '';
        let rEndereco = '';
        let rRegistro = '';
        let rSubreg = '';
        let rDatabaixa = '';
        let rContacontabil = '';
        let rPrimarykey = '';
        let rCentrodecusto = '';
        let rVlrAquisic = 0;
        let rSn1Recno = 0;
        let rSn3Recno = 0;

        if (Array.isArray(row)) {
          // Extração posicional com a exata ordem do layout enviado (Carga Expert v2.6)
          rTenantId = cleanValue(row[0]) || 'CICOPAL';
          rFilial = cleanValue(row[1]) || 'MATRIZ';
          rStatus = cleanValue(row[2]) || 'PENDENTE';
          rEtiqueta = cleanValue(row[3]);
          rQt = cleanValue(row[4]) || '1';
          rDescricaodoativo = cleanValue(row[5]) || 'Importado via Expert';
          rSerial = cleanValue(row[6]);
          rDataaqusic = cleanValue(row[7]);
          rCnpj = cleanValue(row[8]);
          rNomefornecedor = cleanValue(row[9]);
          rNotafiscal = cleanValue(row[10]);
          rEndereco = cleanValue(row[11]);
          rRegistro = cleanValue(row[12]) || rEtiqueta;
          rSubreg = cleanValue(row[13]);
          rDatabaixa = cleanValue(row[14]);
          rContacontabil = cleanValue(row[15]);
          rPrimarykey = cleanValue(row[16]);
          rCentrodecusto = cleanValue(row[17]);
          rVlrAquisic = Number(row[18]) || 0;
          rSn1Recno = parseInt(String(row[19] || '0'), 10) || 0;
          rSn3Recno = parseInt(String(row[20] || '0'), 10) || 0;
        } else if (row && typeof row === 'object') {
          // Fallback robusto por nome de coluna se vier como objeto
          const rObj = row as Record<string, unknown>;
          const rowKeys = Object.keys(rObj);
          const findVal = (priorities: string[]) => {
            const key = rowKeys.find(k => priorities.includes(k.toUpperCase().replace(/\s/g, '_').replace(/_/g, '')));
            return key ? rObj[key] : null;
          };

          rTenantId = cleanValue(findVal(['TENANTID', 'EMPRESA', 'TENANT_ID', 'GRUPO_EMPRESARIAL'])) || 'CICOPAL';
          rFilial = cleanValue(findVal(['FILIAL', 'UNIDADE_OPERACIONAL', 'UNIDADE', 'FILIAL_ID'])) || 'MATRIZ';
          rStatus = cleanValue(findVal(['STATUS', 'TAG_INVENTARIO', 'SITUACAO'])) || 'PENDENTE';
          rEtiqueta = cleanValue(findVal(['ETIQUETA', 'CODIGO_ATIVO', 'CODIGO', 'PLAQUETA', 'TAG']));
          rQt = cleanValue(findVal(['QT', 'QUANTIDADE', 'QTD'])) || '1';
          rDescricaodoativo = cleanValue(findVal(['DESCRICAODOATIVO', 'DESCRICAO', 'BEM', 'NOME_BEM'])) || 'Importado via Expert';
          rSerial = cleanValue(findVal(['SERIAL', 'NUMERO_SERIE', 'SERIE']));
          rDataaqusic = cleanValue(findVal(['DATAAQUISIC', 'DATA_AQUISICAO', 'DATA_AQUISIC', 'DATAAQUSIC']));
          rCnpj = cleanValue(findVal(['CNPJ', 'CNPJ_FORNECEDOR']));
          rNomefornecedor = cleanValue(findVal(['NOMEFORNECEDOR', 'FORNECEDOR', 'NOME_FORNECEDOR']));
          rNotafiscal = cleanValue(findVal(['NOTAFISCAL', 'NF', 'NOTA_FISCAL']));
          rEndereco = cleanValue(findVal(['ENDERECO', 'LOCALIZACAO', 'LOCAL']));
          rRegistro = cleanValue(findVal(['REGISTRO', 'PATRIMONIO'])) || rEtiqueta;
          rSubreg = cleanValue(findVal(['SUBREG', 'SUB_REGISTRO', 'SUBREGISTRO']));
          rDatabaixa = cleanValue(findVal(['DATABAIXA', 'DATA_BAIXA']));
          rContacontabil = cleanValue(findVal(['CONTACONTABIL', 'CONTA_CONTABIL', 'CONTA']));
          rPrimarykey = cleanValue(findVal(['PRIMARYKEY', 'PRIMARY_KEY', 'CHAVE_ERP', 'ID']));
          rCentrodecusto = cleanValue(findVal(['CENTRODECUSTO', 'CENTRO_DE_CUSTO', 'CC', 'CCUSTO']));
          rVlrAquisic = Number(findVal(['VLRAQUISIC', 'VALOR_AQUISICAO', 'VALOR', 'PRECO']) || 0) || 0;
          rSn1Recno = parseInt(String(findVal(['SN1_RECNO', 'SN1_REC_NO']) || '0'), 10) || 0;
          rSn3Recno = parseInt(String(findVal(['SN3_RECNO', 'SN3_REC_NO']) || '0'), 10) || 0;
        }

        const id = rPrimarykey || rEtiqueta || generateUUID();
        const cleanId = String(id).replace(/'/g, "''");
        const cleanEtiqueta = String(rEtiqueta).replace(/'/g, "''");
        const cleanRegistro = String(rRegistro || rEtiqueta).replace(/'/g, "''");
        const cleanDesc = String(rDescricaodoativo).replace(/'/g, "''");
        const cleanContacontabil = String(rContacontabil).replace(/'/g, "''");
        const cleanCentrodecusto = String(rCentrodecusto).replace(/'/g, "''");
        const cleanEndereco = String(rEndereco).replace(/'/g, "''");
        const cleanSerial = String(rSerial).replace(/'/g, "''");
        const cleanCnpj = String(rCnpj).replace(/'/g, "''");
        const cleanNomefornecedor = String(rNomefornecedor).replace(/'/g, "''");
        const cleanNotafiscal = String(rNotafiscal).replace(/'/g, "''");
        const cleanSubreg = String(rSubreg).replace(/'/g, "''");
        const cleanPrimarykey = String(rPrimarykey).replace(/'/g, "''");
        const cleanDatabaixa = String(rDatabaixa).replace(/'/g, "''");
        const cleanDataaqusic = String(rDataaqusic).replace(/'/g, "''");
        const cleanQt = String(rQt).replace(/'/g, "''");

        // Normalização das chaves de negócio principais
        const normalTenant = rTenantId.trim().toUpperCase().replace(/'/g, "''");
        const normalFilial = rFilial.trim().toUpperCase().replace(/'/g, "''");

        // Localidade automática se houver endereço
        if (cleanEndereco && cleanEndereco !== '') {
          const locId = `${normalTenant}_${normalFilial}_${cleanEndereco}`.replace(/\s/g, '_').toUpperCase();
          sqlStatements.push(`INSERT OR IGNORE INTO localidades (id, DESCRICAO, CODIGO, _tenantid, _unitid) VALUES ('${locId}', '${cleanEndereco}', '${normalFilial}', '${normalTenant}', '${normalFilial}');`);
        }

        // Estática simulada de Altitude/Andar
        const idAndar = 0;

        // Inserção na tabela de ativos secundária (protheus_sync)
        sqlStatements.push(`INSERT OR REPLACE INTO ativos_imobilizados (Sn1_recno, Sn3_recno, id, codigo_ativo, conta_contabil, _origemTransacao, _status_sinc) VALUES (${rSn1Recno}, ${rSn3Recno}, '${cleanId}', '${cleanEtiqueta}', '${cleanContacontabil}', 200, 0);`);
        
        // Inserção soberana na tabela mestre dos ativos de inventário
        sqlStatements.push(`INSERT OR REPLACE INTO ativos (
          id, ETIQUETA, REGISTRO, DESCRICAODOATIVO, conta_contabil, 
          UNIDADE_OPERACIONAL, CENTRODECUSTO, VLRAQUISIC, DATAAQUISIC, 
          QT, GRUPO_EMPRESARIAL, ENDERECO, _origemTransacao,
          latitude, longitude, _altitude_metros, _id_andar, currentCampaignId,
          _tenantid, _unitid, tenantId, filial, SERIAL, CNPJ, NOMEFORNECEDOR, NOTAFISCAL, SUBREG, PRIMARYKEY, DATABAIXA, TAG_INVENTARIO
        ) VALUES (
          '${cleanId}', '${cleanEtiqueta}', '${cleanRegistro}', '${cleanDesc}', '${cleanContacontabil}', 
          '${normalFilial}', '${cleanCentrodecusto}', ${rVlrAquisic}, '${cleanDataaqusic}', 
          '${cleanQt}', '${normalTenant}', '${cleanEndereco}', 'EXPERT_LOAD',
          NULL, NULL, NULL, ${idAndar}, '${DEFAULT_CAMPAIGN_ID}',
          '${normalTenant}', '${normalFilial}', '${rTenantId.replace(/'/g, "''")}', '${rFilial.replace(/'/g, "''")}',
          '${cleanSerial}', '${cleanCnpj}', '${cleanNomefornecedor}', '${cleanNotafiscal}', '${cleanSubreg}', '${cleanPrimarykey}', '${cleanDatabaixa}', '${rStatus.toUpperCase().trim() || 'PENDENTE'}'
        );`);
      }

      try {
        await sqliteService.executeStatementsBatch(sqlStatements);
        const currentProgress = Math.min(i + CHUNK_SIZE, totalItems);
        setProgress({ current: currentProgress, total: totalItems });
        addLog(`Carregando: ${currentProgress.toLocaleString()} / ${totalItems.toLocaleString()} ativos`);
        
        // Respiro para a Thread do JS atualizar o DOM
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (chunkError: unknown) {
        const err = chunkError as Error;
        addLog(`Erro no lote ${i}: ${err.message}`);
        throw err;
      }
    }

    // 4. Inserção final e sincronização de estado
    addLog("Conciliando índices e persistindo banco físico...");
    await sqliteService.flush();
    // GBR v26: Flush imperativo final para garantir gravação física estável do .db no filesystem nativo
    await sqliteService.saveDatabase();
    
    addLog("Carga concluída com sucesso!");
    if (showModal) showModal('Sucesso', 'Carga realizada com sucesso em Modo Soberano!', 'success');
    
    setTimeout(() => {
      window.location.reload();
    }, 1500);
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
          
          // Leitura posicional via header: 1
          const rawRows: unknown[][] = utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

          if (rawRows.length === 0) throw new Error("Planilha vazia.");

          let finalRows = rawRows;
          const firstRow = rawRows[0];
          if (Array.isArray(firstRow) && firstRow.length > 0) {
            const val = String(firstRow[0]).toLowerCase().trim();
            // Se contiver palavras chaves típicas de cabeçalho, fatiamos a primeira linha
            if (val === 'tenantid' || val === 'tenant_id' || val === 'empresa' || val.includes('tenant') || val === 'grupo') {
              addLog("Cabeçalho detectado e descartado com sucesso.");
              finalRows = rawRows.slice(1);
            }
          }

          await processRowsToDatabaseBatch(finalRows);

        } catch (innerError: unknown) {
          const ie = innerError as Error;
          addLog(`Erro interno: ${ie.message}`);
          if (showModal) showModal('Erro de Processamento', ie.message, 'error');
          setStatus('ERROR');
        }
      };

      reader.readAsArrayBuffer(file);

    } catch (error: unknown) {
      const e = error as Error;
      console.error("Erro fatal ao carregar planilha:", e);
      addLog(`Falha na carga: ${e.message}`);
      setStatus('ERROR');
    }
  };


  const handleExpertLoadClick = async () => {
    if (localStorage.getItem('is_system_locked') === 'true') {
      if (showModal) {
        showModal(
          "Sistema Blindado",
          "Esta operação foi bloqueada. A soberania e integridade da base física foram validadas pelo Administrador, congelando o arquivo 'gbr_kardek.db' contra sobregravação.",
          "warning"
        );
      } else {
        alert("Esta operação foi bloqueada. A base física está blindada.");
      }
      return;
    }

    const fStatus = await sqliteService.getFileStatus();
    if (fStatus.handle && fStatus.status !== 'granted') {
      addLog("Solicitando permissão...");
      const success = await sqliteService.requestFilePermission();
      if (!success) return;
    }
    fileInputRef.current?.click();
  };

  const handleHardResetLocal = async () => {
    if (localStorage.getItem('is_system_locked') === 'true') {
      if (showModal) {
        showModal(
          "Sistema Blindado",
          "O expurgo ou reset foi desativado. O sistema está congelado no modo 'Pronto para Campo' para proteger os inventários locais dos auditores contra apagões acidentais.",
          "warning"
        );
      } else {
        alert("O reset foi bloqueado. A base física está blindada.");
      }
      return;
    }

    setShowHardResetConfirm(true);
  };

  const executeHardReset = async () => {
    setShowHardResetConfirm(false);
    setStatus('LOADING');
    addLog('Executando limpeza de governança e expurgo físico...');

    try {
      // 1. Executa o reset lógico/físico do banco de dados local
      await sqliteService.resetDatabaseLogico();
      
      // 2. Garante que estados de navegação NÃO sejam setados aqui (sem reload ou redirecionamento)
      localStorage.removeItem('app_excluded_accounts');
      
      // 3. Apenas resete os estados locais para refletir o banco limpo
      setFileInfo(null);
      setSummary(null);
      setErrorLog([]);

      alert("Banco de dados limpo com sucesso! Aguardando Carga Expert (Excel).");
      setStatus('EMPTY_STATE');
    } catch (err: unknown) {
      const e = err as Error;
      console.error("Falha ao limpar banco:", e);
      addLog(`Falha ao executar Limpeza: ${e.message}`);
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
        {isSyncing && syncProgress ? (
          <motion.div 
            key="sync_progress"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 text-center w-full max-w-xs animate-fadeIn"
          >
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
              <motion.div 
                className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <DownloadCloud className="w-8 h-8 text-emerald-500 animate-pulse" />
              </div>
            </div>

            <div className="w-full space-y-3">
              <div className="flex justify-between items-end">
                <div className="text-left font-black text-slate-800 text-[10px] uppercase tracking-widest">
                  Sincronizando
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest animate-pulse mt-0.5">
                    Banco SQLite
                  </p>
                </div>
                <div className="text-right font-black text-emerald-600 text-xs">
                  {syncProgress.percentage}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${syncProgress.percentage}%` }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                />
              </div>

              <p className="text-[9px] font-mono text-slate-400 uppercase font-bold tracking-widest">
                {syncProgress.processed.toLocaleString()} / {syncProgress.total.toLocaleString()} ativos
              </p>
            </div>
          </motion.div>
        ) : status === 'LOADING' && (
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
            
            <button
              onClick={() => setStatus('SUMMARY')}
              className="mt-4 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 font-black text-[10px] uppercase tracking-widest rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              Cancelar e Voltar
            </button>
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
              {databaseMode === DatabaseMode.INTERNAL && onCargaInicial && (
                <button
                  type="button"
                  onClick={onCargaInicial}
                  disabled={isSyncing}
                  className="flex items-center justify-center gap-4 bg-emerald-600 text-white p-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all group disabled:opacity-75"
                >
                  <div className="p-2 bg-white/20 rounded-xl group-hover:animate-bounce transition-transform">
                    {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                  </div>
                  <span>{isSyncing ? "Sincronizando Lotes..." : "Carga Inicial da Nuvem"}</span>
                </button>
              )}

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
            className="flex flex-col items-center gap-6 text-center w-full max-w-xs"
          >
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
              <motion.div 
                className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <FileSpreadsheet className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="w-full space-y-3">
              <div className="flex justify-between items-end">
                <div className="text-left">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Importando</h3>
                  <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest animate-pulse">
                    Expert Load v25
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase">
                    {Math.round((progress.current / progress.total) * 100)}%
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                />
              </div>

              <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">
                {progress.current.toLocaleString()} / {progress.total.toLocaleString()} itens
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
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    // GBR v25: Projeção Magra (Mapping Exclusive)
                    // Pega o ID da primeira campanha ativa ou gera um ID genérico
                    const campaignId = DEFAULT_CAMPAIGN_ID; 
                    const assets = await localDb.assets.getMapData(campaignId);
                    
                    addLog(`>>> [Projection] ${assets.length} ativos carregados via shader pipeline.`);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    // Sincroniza o cache do IndexedDB com o novo banco SQL carregado
                    const newState: InventoryState = {
                      assets,
                      companies: summary.companies,
                      databaseMode: DatabaseMode.INTERNAL,
                      status: DatabaseStatus.LOADED,
                      lastUpdated: new Date().toISOString()
                    };
                    
                    addLog("Sincronizando cache de segurança...");
                    await new Promise(resolve => setTimeout(resolve, 100));
                    // skipSqlAssetsInsert = true, pois a carga física já foi inserida no SQLite via chunks.
                    await saveInventory(newState, undefined, false, true);

                    sessionStorage.setItem('app_just_finished_load', 'true');
                    onDataLoaded(assets, summary.companies);
                    setStatus('IDLE');
                  } catch (err: unknown) {
            const innerError = err as Error;
            addLog(`Erro na ativação: ${innerError.message}`);
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

      {/* Local Confirmation Modal for Reset */}
      <AnimatePresence>
        {showHardResetConfirm && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-xs bg-white rounded-[2rem] p-8 shadow-2xl border border-slate-100 flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-4">
                <RefreshCw size={32} className="animate-spin" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Hard Reset</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase leading-relaxed mb-8">
                Deseja realmente limpar todas as tabelas locais e reiniciar o banco em branco?
              </p>
              
              <div className="flex flex-col gap-2 w-full">
                <button 
                  onClick={executeHardReset}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-200 active:scale-95 transition-all"
                >
                  Confirmar Limpeza
                </button>
                <button 
                  onClick={() => setShowHardResetConfirm(false)}
                  className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Carga Inicial Cloud Confirmation Modal */}
      <AnimatePresence>
        {showCargaPrompt && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-xs bg-white rounded-[2rem] p-8 shadow-2xl border border-slate-100 flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 mb-4">
                <RefreshCw size={32} className="animate-pulse" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Base Local Vazia</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase leading-relaxed mb-8">
                Detectamos que seu banco de dados físico local está vazio. Deseja obter a carga inicial da nuvem agora?
              </p>
              
              <div className="flex flex-col gap-2 w-full">
                <button 
                  onClick={() => {
                    setShowCargaPrompt(false);
                    onCargaInicial?.();
                  }}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-200 active:scale-95 transition-all"
                >
                  Baixar Ativos da Nuvem
                </button>
                <button 
                  onClick={() => setShowCargaPrompt(false)}
                  className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
                >
                  Agora Não
                </button>
              </div>
            </motion.div>
          </div>
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
