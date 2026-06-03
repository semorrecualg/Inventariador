import React, { useState, useEffect, useRef } from 'react';
import { read, utils } from 'xlsx';
import { sqliteService } from '../services/sqliteService';
import { localDb } from '../services/localDbService';
import { 
  Database, Loader2, Link2, RefreshCw, AlertCircle, 
  FileSpreadsheet, ChevronLeft, Activity 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatErrorMessage } from '../utils/errorUtils';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';

import { generateUUID } from '../services/supabaseService';
import { Asset, User, ModalConfig, DatabaseMode, DatabaseStatus, InventoryState } from '../types';
import { saveInventory } from '../services/persistenceService';

// GBR v26.0: Campanha de Auditoria Padrão (Static Context)
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
  onOpenHelp?: () => void;
  excludedAccounts?: string[];
  campaigns?: unknown[];
  onRestore?: (state: unknown) => void;
  onClearDatabase?: () => void;
  isDatabaseLoaded?: boolean;
}

interface UnifiedLoaderProps {
  totalAssets: number;
  currentProcessed: number;
  logs: string[];
}

export const UnifiedDatabaseLoader: React.FC<UnifiedLoaderProps> = ({
  totalAssets,
  currentProcessed,
  logs
}) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  const progressPercent = totalAssets > 0 ? Math.min(Math.round((currentProcessed / totalAssets) * 100), 100) : 0;

  // Auto-scroll automático do terminal de logs para dar sensação de movimento contínuo
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col justify-between p-6 z-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      
      {/* SEÇÃO SUPERIOR: Barra Gráfica Unificada */}
      <div className="bg-gray-800/50 backdrop-blur-md rounded-2xl p-4 border border-gray-700/50 w-full max-w-xl mx-auto shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center animate-spin">
            <Loader2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Injetando Carga Expert</h3>
            <p className="text-[10px] text-gray-400">Gravando {currentProcessed.toLocaleString()} de {totalAssets.toLocaleString()} ativos locais</p>
          </div>
        </div>

        {/* Linha de progresso fluida */}
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-[9px] text-gray-500 font-bold uppercase">Motor SQLite Nativo C++</span>
          <span className="text-xs font-black text-blue-400 tabular-nums">{progressPercent}%</span>
        </div>
      </div>

      {/* SEÇÃO CENTRAL: Terminal de Logs Dinâmico com Auto-Scroll */}
      <div className="flex-1 w-full max-w-xl mx-auto my-4 bg-black/40 border border-gray-800 rounded-2xl p-4 overflow-y-auto font-mono text-[10px] text-green-400/90 shadow-inner space-y-1 scrollbar-none">
        {logs.map((log, idx) => (
          <div key={idx} className="leading-relaxed tracking-tight break-all">
            <span className="text-gray-600 mr-1.5">&gt;&gt;&gt;</span>{log}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* SEÇÃO INFERIOR: Selo de Governança Estático */}
      <div className="w-full max-w-xl mx-auto flex items-center justify-between text-gray-500 border-t border-gray-800/60 pt-3 text-[10px]">
        <div className="flex items-center gap-1">
          <Activity className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
          <span className="font-semibold tracking-wider uppercase">Inventariador GBR v2.6</span>
        </div>
        <span className="tabular-nums opacity-60">Fatiamento: Lotes Rígidos de 200 itens</span>
      </div>

    </div>
  );
};

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ 
  onDataLoaded,
  onBack,
  showModal,
  databaseMode,
  isSyncing = false,
  syncProgress = null,
  onCargaInicial,
  isDatabaseLoaded = false
}) => {
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PERMISSION_NEEDED' | 'ERROR' | 'IMPORTING' | 'EMPTY_STATE'>('IDLE');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [fileInfo, setFileInfo] = useState<{ fileName: string | null; status: string } | null>(null);
  const [errorLog, setErrorLog] = useState<string[]>([]);
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
    setErrorLog(prev => [...prev, msg].slice(-200)); // Maintain high limit for terminal fluidity
  };

  // Monitor cloud synchronization updates and map them directly into terminal logs
  useEffect(() => {
    if (isSyncing && syncProgress) {
      addLog(`Sincronizando: ${syncProgress.processed.toLocaleString()} / ${syncProgress.total.toLocaleString()} ativos locais (${syncProgress.percentage}%)`);
    }
  }, [isSyncing, syncProgress]);

  const loadDataFlow = async (forceCache = false) => {
    if (status === 'LOADING' && !forceCache) return;
    
    addLog(forceCache ? "Forçando carga via Cache..." : "Iniciando fluxo de carga...");
    setStatus('LOADING');
    
    const timeoutId = setTimeout(() => {
      if (status === 'LOADING') {
        addLog("TIMEOUT: Carga demorou demais. Liberando interface.");
        setStatus('IDLE');
      }
    }, 25000); // Expanded timeout to handle physical C++ database mounts smoothly
    
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
        
        // Count assets
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

        addLog("Iniciando auto-ativação segura e automatizada...");
        
        try {
          addLog("Ativando sistema...");
          await new Promise(resolve => setTimeout(resolve, 50));
          
          const campaignId = DEFAULT_CAMPAIGN_ID; 
          const assets = await localDb.assets.getMapData(campaignId);
          
          addLog(`>>> [Projection] ${assets.length} ativos carregados via shader pipeline.`);
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Sincroniza o cache do IndexedDB com o novo banco SQL carregado
          const newState: InventoryState = {
            assets,
            companies: companies,
            databaseMode: DatabaseMode.INTERNAL,
            status: DatabaseStatus.LOADED,
            lastUpdated: new Date().toISOString()
          };
          
          addLog("Sincronizando cache de segurança...");
          await new Promise(resolve => setTimeout(resolve, 100));
          await saveInventory(newState, undefined, false, true);

          sessionStorage.setItem('app_just_finished_load', 'true');
          addLog("Ativação executada com sucesso! Liberando operador.");
          await new Promise(resolve => setTimeout(resolve, 200));
          
          clearTimeout(timeoutId);
          onDataLoaded(assets, companies);
        } catch (activationErr) {
          const innerError = activationErr as Error;
          addLog(`Erro na ativação: ${innerError.message}`);
          clearTimeout(timeoutId);
          setStatus('ERROR');
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
    const checkExpertPending = async () => {
      if (sessionStorage.getItem('gbr_pending_expert_load') === 'true') {
        sessionStorage.removeItem('gbr_pending_expert_load'); // Consumir para evitar loop
        console.warn("[GBR v2.6] Forçando contingência local via Carga Expert (Bypass de Bloqueio Imperativo).");
        
        setStatus('LOADING');
        addLog("Conexão para Carga Expert Ativa. Limpando estados prévios de sessão comum...");
        
        // Bloquear concorrências de escrita ativando o modo de importação
        sqliteService.setImportingMode(true);
        sqliteService.isImportingBatch = true;
        if (typeof window !== 'undefined') {
          ((window as unknown) as { __isImportingBatch: boolean }).__isImportingBatch = true;
        }

        try {
          await sqliteService.resetDatabaseLogico();
          localStorage.removeItem('app_excluded_accounts');
          setFileInfo(null);
          setErrorLog([]);
          
          addLog("Banco de dados limpo com sucesso! Aguardando Carga Expert (Excel).");
          setStatus('EMPTY_STATE');
        } catch (err: unknown) {
          const e = err as Error;
          addLog(`Falha na limpeza preparatória: ${e.message}`);
          setStatus('ERROR');
        } finally {
          sqliteService.setImportingMode(false);
          sqliteService.isImportingBatch = false;
          if (typeof window !== 'undefined') {
            ((window as unknown) as { __isImportingBatch: boolean }).__isImportingBatch = false;
          }
        }
      }
    };
    checkExpertPending();
  }, []);

  useEffect(() => {
    const isExpertPending = sessionStorage.getItem('gbr_pending_expert_load') === 'true';
    if (isExpertPending) {
      return; // Será gerenciado pelo effect do checkExpertPending acima
    }
    if (isDatabaseLoaded) {
      addLog("BLOQUEIO IMPERATIVO: Base local SQLite de Soberania Nativa já carregada. Nenhuma carga adicional ou reinicialização é permitida.");
      setStatus('IDLE');
      return;
    }
    if (!loadingAttempted.current) {
      loadingAttempted.current = true;
      loadDataFlow();
    }
  }, [isDatabaseLoaded]);

  const handleReconnect = async () => {
    addLog("Re-operando vínculos sob permissões nítidas...");
    const handle = await sqliteService.linkFile();
    if (handle) {
      loadDataFlow();
    }
  };

  const processRowsToDatabaseBatch = async (rows: unknown[]) => {
    // Validação preventiva de Bateria Crítica (Soberania de Energia v26)
    try {
      const batteryInfo = await Device.getBatteryInfo();
      if (batteryInfo.batteryLevel !== undefined && batteryInfo.batteryLevel < 0.05 && !batteryInfo.isCharging) {
        throw new Error("Carga bloqueada: Bateria abaixo de 5% sem fonte de carregamento activa.");
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
    
    setStatus('IMPORTING');
    setProgress({ current: 0, total: totalItems });
    addLog(`Iniciando Carga Expert: ${totalItems} ativos identificados.`);

    const cleanValue = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      const low = s.toLowerCase();
      if (low === 'null' || low === 'undefined' || low === '') return '';
      return s;
    };

    // ATIVE A TRAVA DE ISOLAMENTO DE SISTEMA
    sqliteService.setImportingMode(true);
    sqliteService.isImportingBatch = true;
    if (typeof window !== 'undefined') {
      ((window as unknown) as { __isImportingBatch: boolean }).__isImportingBatch = true;
    }

    try {
      for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
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
            const etq = cleanValue(row[3]);
            const pkey = cleanValue(row[16]);
            const desc = cleanValue(row[5]);

            if (row.length < 4 || (!etq && !pkey && !desc)) {
              continue; 
            }

            if (etq.toLowerCase() === 'etiqueta' || etq.toLowerCase() === 'plaqueta' || etq.toLowerCase() === 'tag' || desc.toLowerCase() === 'descricaodoativo' || desc.toLowerCase() === 'descricao') {
              continue;
            }

            rTenantId = cleanValue(row[0]) || 'CICOPAL';
            rFilial = cleanValue(row[1]) || 'MATRIZ';
            rStatus = cleanValue(row[2]) || 'PENDENTE';
            rEtiqueta = etq;
            rQt = cleanValue(row[4]) || '1';
            rDescricaodoativo = desc || 'Importado via Expert';
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
            rPrimarykey = pkey;
            rCentrodecusto = cleanValue(row[17]);
            rVlrAquisic = Number(row[18]) || 0;
            rSn1Recno = parseInt(String(row[19] || '0'), 10) || 0;
            rSn3Recno = parseInt(String(row[20] || '0'), 10) || 0;
          } else if (row && typeof row === 'object') {
            const rObj = row as Record<string, unknown>;
            const rowKeys = Object.keys(rObj);
            if (rowKeys.length === 0) continue;

            const findVal = (priorities: string[]) => {
              const key = rowKeys.find(k => priorities.includes(k.toUpperCase().replace(/\s/g, '_').replace(/_/g, '')));
              return key ? rObj[key] : null;
            };

            const etq = cleanValue(findVal(['ETIQUETA', 'CODIGO_ATIVO', 'CODIGO', 'PLAQUETA', 'TAG']));
            const pkey = cleanValue(findVal(['PRIMARYKEY', 'PRIMARY_KEY', 'CHAVE_ERP', 'ID']));
            const desc = cleanValue(findVal(['DESCRICAODOATIVO', 'DESCRICAO', 'BEM', 'NOME_BEM'])) || 'Importado via Expert';

            if (!etq && !pkey && !desc) {
              continue;
            }

            rTenantId = cleanValue(findVal(['TENANTID', 'EMPRESA', 'TENANT_ID', 'GRUPO_EMPRESARIAL'])) || 'CICOPAL';
            rFilial = cleanValue(findVal(['FILIAL', 'UNIDADE_OPERACIONAL', 'UNIDADE', 'FILIAL_ID'])) || 'MATRIZ';
            rStatus = cleanValue(findVal(['STATUS', 'TAG_INVENTARIO', 'SITUACAO'])) || 'PENDENTE';
            rEtiqueta = etq;
            rQt = cleanValue(findVal(['QT', 'QUANTIDADE', 'QTD'])) || '1';
            rDescricaodoativo = desc;
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
            rPrimarykey = pkey;
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

          const normalTenant = rTenantId.trim().toUpperCase().replace(/'/g, "''");
          const normalFilial = rFilial.trim().toUpperCase().replace(/'/g, "''");

          if (cleanEndereco && cleanEndereco !== '') {
            const locId = `${normalTenant}_${normalFilial}_${cleanEndereco}`.replace(/\s/g, '_').toUpperCase();
            sqlStatements.push(`INSERT OR IGNORE INTO localidades (id, DESCRICAO, CODIGO, _tenantid, _unitid) VALUES ('${locId}', '${cleanEndereco}', '${normalFilial}', '${normalTenant}', '${normalFilial}');`);
          }

          sqlStatements.push(`INSERT OR REPLACE INTO ativos_imobilizados (Sn1_recno, Sn3_recno, id, codigo_ativo, conta_contabil, _origemTransacao, _status_sinc) VALUES (${rSn1Recno}, ${rSn3Recno}, '${cleanId}', '${cleanEtiqueta}', '${cleanContacontabil}', 200, 0);`);
          
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
            NULL, NULL, NULL, 0, '${DEFAULT_CAMPAIGN_ID}',
            '${normalTenant}', '${normalFilial}', '${rTenantId.replace(/'/g, "''")}', '${rFilial.replace(/'/g, "''")}',
            '${cleanSerial}', '${cleanCnpj}', '${cleanNomefornecedor}', '${cleanNotafiscal}', '${cleanSubreg}', '${cleanPrimarykey}', '${cleanDatabaixa}', '${rStatus.toUpperCase().trim() || 'PENDENTE'}'
          );`);
        }

        try {
          await sqliteService.executeStatementsBatch(sqlStatements);
          const currentProgress = Math.min(i + CHUNK_SIZE, totalItems);
          setProgress({ current: currentProgress, total: totalItems });
          addLog(`Injetando: ${currentProgress.toLocaleString()} / ${totalItems.toLocaleString()} ativos`);
          
          // Yield CPU to prevent interface freezes on heavier batch pipelines
          await new Promise(resolve => setTimeout(resolve, 0));
        } catch (chunkError: unknown) {
          const err = chunkError as Error;
          addLog(`Erro no lote ${i}: ${err.message}`);
          throw err;
        }
      }

      addLog("Conciliando índices e gerando projeções...");
      await new Promise(resolve => setTimeout(resolve, 300));

      addLog("Gravando banco físico local de forma segura...");
      await new Promise(resolve => setTimeout(resolve, 200));

      sqliteService.mutationCounter = 0;
      await sqliteService.saveDatabase();
      
      addLog("Carga expert concluída!");
      addLog("Iniciando auto-ativação do sistema...");
      await new Promise(resolve => setTimeout(resolve, 300));

      // Trigger automatic activation right after ingestion!
      const campaignId = DEFAULT_CAMPAIGN_ID; 
      const finalCompanies = await sqliteService.getOperationalUnits();
      const assets = await localDb.assets.getMapData(campaignId);
      
      addLog(`>>> [Projection] ${assets.length} ativos carregados no shader pipeline.`);
      
      const newState: InventoryState = {
        assets,
        companies: finalCompanies,
        databaseMode: DatabaseMode.INTERNAL,
        status: DatabaseStatus.LOADED,
        lastUpdated: new Date().toISOString()
      };
      
      addLog("Sincronizando cache local...");
      await saveInventory(newState, undefined, false, true);

      sessionStorage.setItem('app_just_finished_load', 'true');
      addLog("Inicialização concluída! Redirecionando...");
      await new Promise(resolve => setTimeout(resolve, 200));
      
      onDataLoaded(assets, finalCompanies);
      setStatus('IDLE');
    } catch (innerError: unknown) {
      const ie = innerError as Error;
      addLog(`Erro interno no pipeline: ${ie.message}`);
      setStatus('ERROR');
    } finally {
      sqliteService.setImportingMode(false);
      sqliteService.isImportingBatch = false;
      if (typeof window !== 'undefined') {
        ((window as unknown) as { __isImportingBatch: boolean }).__isImportingBatch = false;
      }
      if (Capacitor.isNativePlatform()) {
        await sqliteService.saveDatabase();
      }
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('IMPORTING');
    setProgress({ current: 0, total: 0 });
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
          
          const rawRows: unknown[][] = utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

          if (rawRows.length === 0) throw new Error("Planilha vazia.");

          let finalRows = rawRows;
          const firstRow = rawRows[0];
          if (Array.isArray(firstRow) && firstRow.length > 0) {
            const val = String(firstRow[0]).toLowerCase().trim();
            if (val === 'tenantid' || val === 'tenant_id' || val === 'empresa' || val.includes('tenant') || val === 'grupo') {
              addLog("Cabeçalho detectado e descartado com sucesso.");
              finalRows = rawRows.slice(1);
            }
          }

          await processRowsToDatabaseBatch(finalRows);

        } catch (innerError: unknown) {
          const ie = innerError as Error;
          addLog(`Erro interno: ${ie.message}`);
          setStatus('ERROR');
        }
      };

      reader.readAsArrayBuffer(file);

    } catch (error: unknown) {
      const e = error as Error;
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
      await sqliteService.resetDatabaseLogico();
      localStorage.removeItem('app_excluded_accounts');
      setFileInfo(null);
      setErrorLog([]);

      addLog("Banco de dados limpo com sucesso! Aguardando Carga Expert (Excel).");
      setStatus('EMPTY_STATE');
    } catch (err: unknown) {
      const e = err as Error;
      addLog(`Falha ao executar Limpeza: ${e.message}`);
      setStatus('ERROR');
    }
  };

  const handleCreateEmpty = async () => {
    addLog("Criando nova base de dados vazia...");
    onDataLoaded([], []);
  };

  // Setup props computed for the Unified graphic UI
  const totalAssetsVal = isSyncing && syncProgress ? syncProgress.total : progress.total;
  const currentProcessedVal = isSyncing && syncProgress ? syncProgress.processed : progress.current;

  // Determine which screen is loaded
  const isUnifiedView = status === 'LOADING' || status === 'IMPORTING' || isSyncing;

  if (isDatabaseLoaded) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-8 text-center z-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="w-16 h-16 bg-blue-500/10 flex items-center justify-center rounded-2xl text-blue-400 mb-6 border border-blue-500/20">
          <Database size={32} />
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Base Física Ativa &amp; Soberana</h3>
        <p className="text-[10px] text-slate-400 leading-relaxed font-bold uppercase mb-8 max-w-xs">
          A base local SQLite está carregada e ativa para operação em campo. Novas cargas do Supabase ou planilhas Excel estão bloqueadas de forma preventiva para proteger os dados.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-all bg-gray-900 border border-gray-800 px-6 py-3 rounded-2xl cursor-pointer"
          >
            <ChevronLeft size={14} />
            Voltar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[300px]">
      <AnimatePresence mode="wait">
        {isUnifiedView ? (
          <UnifiedDatabaseLoader 
            key="unified_view"
            totalAssets={totalAssetsVal}
            currentProcessed={currentProcessedVal}
            logs={errorLog}
          />
        ) : status === 'EMPTY_STATE' ? (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-3xl border border-slate-200/50 backdrop-blur-sm min-h-[400px] w-full max-w-xl mx-auto safe-area-p animate-fadeIn">
            <div className="bg-blue-100 p-5 rounded-[2rem] shadow-inner text-blue-600 mb-6">
              <Database size={40} strokeWidth={2.5} />
            </div>
            
            <div className="space-y-2 text-center mb-6">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Base Vazia Detectada</h3>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">O sistema está pronto para receber dados.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 w-full max-w-sm mt-4">
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
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 hover:text-accent transition-colors text-center"
              >
                Pular Carga (Modo Demo)
              </button>
            </div>

            {onBack && (
              <button 
                onClick={onBack}
                className="mt-6 flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all"
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
          </div>
        ) : status === 'PERMISSION_NEEDED' ? (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-3xl border border-slate-200/50 backdrop-blur-sm min-h-[400px] w-full max-w-xl mx-auto safe-area-p animate-fadeIn">
            <div className="bg-amber-100 p-4 rounded-full mb-6">
              <Link2 className="w-10 h-10 text-amber-600" />
            </div>
            <div className="space-y-2 text-center mb-6">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Vínculo Expirado</h3>
              <p className="text-[11px] text-slate-600 font-medium leading-relaxed max-w-xs mx-auto">
                Por segurança, o navegador exige que você re-aponte o arquivo <span className="font-bold text-slate-900">&quot;{fileInfo?.fileName}&quot;</span> para esta sessão.
              </p>
            </div>
            
            <button
              onClick={handleReconnect}
              className="group flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 transition-all active:scale-95 w-full max-w-xs"
            >
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
              Re-vincular Arquivo
            </button>
          </div>
        ) : status === 'ERROR' ? (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-3xl border border-slate-200/50 backdrop-blur-sm min-h-[400px] w-full max-w-xl mx-auto safe-area-p animate-fadeIn">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h3 className="text-sm font-black text-red-800 uppercase tracking-widest mb-2">Falha na Sincronização</h3>
            <p className="text-[10px] text-slate-500 max-w-xs text-center mb-6">{errorLog[errorLog.length - 1] || "Ocorreu um erro desconhecido."}</p>
            <button
              onClick={() => {
                setErrorLog([]);
                loadDataFlow();
              }}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all w-full max-w-xs text-center"
            >
              Tentar Novamente
            </button>
          </div>
        ) : null}
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
    </div>
  );
};

export default DatabaseLoader;
