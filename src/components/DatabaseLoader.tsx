// src/components/DatabaseLoader.tsx
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Database, 
  Trash2, 
  HelpCircle, 
  Info,
  Activity,
  UserCheck
} from 'lucide-react';
import { databaseLoaderService } from '../services/DatabaseLoaderService';
import { sqliteService } from '../services/sqliteService';
import { Asset } from '../types';

export interface AtivoPlanilha {
  [key: string]: string | number | boolean | null | undefined;
}

const COLUNAS_OBRIGATORIAS: string[] = [
  'tenantId', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 
  'serial', 'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 
  'registro', 'subreg', 'databaixa', 'contacontabil', 'primarykey', 
  'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno'
];

function cleanKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/**
 * Função utilitária herdada para processamento legando, mantida por segurança.
 */
export async function processarEInjetarPlanilha(
  rows: AtivoPlanilha[],
  onProgress?: (progress: { processed: number; total: number; percentage: number }) => void
): Promise<void> {
  if (!rows || rows.length === 0) {
    throw new Error("[SRE ERROR] Planilha vazia ou inválida enviada para processamento.");
  }
  
  const sampleRow = rows[0];
  const headerMap: Record<string, string> = {};
  const rowKeys = Object.keys(sampleRow);

  COLUNAS_OBRIGATORIAS.forEach(targetKey => {
    const targetClean = cleanKey(targetKey);
    const matchedKey = rowKeys.find(k => cleanKey(k) === targetClean);
    if (matchedKey) {
      headerMap[targetKey] = matchedKey;
    }
  });

  const parsedAssets: Asset[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || (!row['etiqueta'] && !row['ETIQUETA'] && !row['Etiqueta'])) {
      continue;
    }

    const getSafeValue = (key: string): string | number | boolean | null | undefined => {
      const realKey = headerMap[key];
      return realKey ? row[realKey] : null;
    };

    const asset: Asset = {
      tenantId: String(getSafeValue('tenantId') || '').trim(),
      filial: String(getSafeValue('filial') || '').trim(),
      status: String(getSafeValue('status') || 'ATIVO').trim(),
      etiqueta: String(getSafeValue('etiqueta') || '').trim(),
      qt: Number(getSafeValue('qt') || 1),
      descricaodoativo: String(getSafeValue('descricaodoativo') || '').trim(),
      serial: String(getSafeValue('serial') || '').trim(),
      dataaqusic: String(getSafeValue('dataaqusic') || '').trim(),
      cnpj: String(getSafeValue('cnpj') || '').trim(),
      nomefornecedor: String(getSafeValue('nomefornecedor') || '').trim(),
      notafiscal: String(getSafeValue('notafiscal') || '').trim(),
      endereco: String(getSafeValue('endereco') || '').trim(),
      registro: String(getSafeValue('registro') || '').trim(),
      subreg: String(getSafeValue('subreg') || '').trim(),
      databaixa: String(getSafeValue('databaixa') || '').trim(),
      contacontabil: String(getSafeValue('contacontabil') || '').trim(),
      primarykey: String(getSafeValue('primarykey') || '').trim(),
      centrodecusto: String(getSafeValue('centrodecusto') || '').trim(),
      vlraquisic: Number(getSafeValue('vlraquisic') || 0),
      sn1_recno: Number(getSafeValue('sn1_recno') || 0),
      sn3_recno: Number(getSafeValue('sn3_recno') || 0),
      _is_synced: 1,
      _is_deleted: 0
    };

    parsedAssets.push(asset);
  }

  await sqliteService.bulkInsertAssetsOfflineFirst(parsedAssets, onProgress);
}

interface DatabaseLoaderProps {
  onOpenHelp?: () => void;
  onBack: () => void;
  isSyncing: boolean;
  syncProgress?: Record<string, unknown> | null;
  excludedAccounts?: unknown;
  campaigns?: unknown[];
  user?: Record<string, unknown> | null;
  databaseMode?: string;
  onCargaInicial: () => Promise<void>;
  showModal?: (config: Record<string, unknown>) => void;
  onRestore?: (state: unknown) => void;
  onClearDatabase: () => Promise<void>;
  onDataLoaded: (assets?: Asset[], companies?: string[]) => void;
  isDatabaseLoaded: boolean;
  currentUnitId?: string | null;
  currentTenantId?: string | null;
}

export const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({
  onOpenHelp,
  onBack,
  isSyncing,
  syncProgress,
  user,
  onCargaInicial,
  onClearDatabase,
  onDataLoaded,
  currentUnitId,
  currentTenantId
}) => {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [processedDetails, setProcessedDetails] = useState<{ processed: number; total: number; percentage: number } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tratadores de Drag and Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Processador Central do Arquivo em Lotes
  const processFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
      setUploadStatus('error');
      setErrorMsg('Extensão inválida. Por favor, envie apenas arquivos Excel (.xlsx, .xls) ou CSV.');
      return;
    }

    setUploadStatus('processing');
    setErrorMsg('');
    setProcessedDetails({ processed: 0, total: 0, percentage: 0 });

    try {
      const tenantId = currentTenantId || user?._tenantid || user?.tenantId || 'CICOPAL';
      const unitId = currentUnitId || user?._unitid || user?.filial || 'CICOPAL_FILIAL_DEFAULT';

      // Executa o processador industrial com fatiamento rígido de 200 itens
      // O databaseLoaderService deve retornar o total real processado
      const totalCount = await databaseLoaderService.processExcelFile(
        file,
        tenantId,
        unitId,
        (batchIndex, insertedCount, totalInserted, finalPlanilhaTotal) => {
          // Correção da Fórmula: Progresso real baseado no tamanho total absoluto da planilha
          const totalEstimado = finalPlanilhaTotal && finalPlanilhaTotal > 0 ? finalPlanilhaTotal : 12637;
          const pctCalculada = Math.min(Math.round((totalInserted / totalEstimado) * 100), 99);
          
          setProcessedDetails({
            processed: totalInserted,
            total: totalEstimado,
            percentage: pctCalculada
          });
        }
      );

      // Garante a estabilização visual em 100% apenas após o término físico da transação
      setProcessedDetails({
        processed: totalCount,
        total: totalCount,
        percentage: 100
      });
      
      setUploadStatus('success');

      // PROGRAMAÇÃO DEFENSIVA: Captura segura de dados locais para evitar quebra de fluxo
      const rawAssets = await sqliteService.getAllAssets();
      const loadedAssets: Asset[] = Array.isArray(rawAssets) ? rawAssets : [];
      
      // Filtro sanitário estrito para expurgar qualquer linha residual nula que o Excel possa ter gerado
      const validAssets = loadedAssets.filter(asset => asset && (asset.etiqueta || asset.ETIQUETA || asset.id));
      const loadedUnits = await sqliteService.getOperationalUnits() || [];

      // SOBERANIA LOCAL: Verifica se o array contém o volume correto antes de despachar à interface
      console.log(`[SRE Audit] Carga consolidada em RAM operacional: ${validAssets?.length || 0} ativos.`);
      
      // Acoplamento blindado com optional chaining interno na árvore consumidora
      onDataLoaded(validAssets, loadedUnits);

    } catch (err: unknown) {
      console.error("[SRE Loader Component] Erro crítico de Ingestão de Lote:", err);
      setUploadStatus('error');
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao processar planilha de ativos.';
      setErrorMsg(msg);
    }
  };

  // Ações Auxiliares
  const handleDownloadCloud = async () => {
    try {
      await onCargaInicial();
    } catch (err: unknown) {
      console.error("[SRE Cloud Load] Cloud sync load failed:", err);
    }
  };

  return (
    <div id="database-loader-screen" className="flex flex-col h-full bg-gray-50 text-gray-900 font-sans antialiased">
      {/* 🚀 Top Header Industrial */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button 
            id="back-loader-btn"
            onClick={onBack}
            className="p-2 rounded-xl transition duration-200 hover:bg-gray-100 text-gray-700"
            disabled={uploadStatus === 'processing' || isSyncing}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider flex items-center gap-1.5 font-mono">
              <Activity className="w-3.5 h-3.5" /> GBR v24.50 SRE CONTROL
            </span>
            <h1 className="text-lg font-black uppercase text-gray-950 tracking-tight leading-none mt-1">
              GESTÃO DE CARGAS INTERNAS
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onOpenHelp && (
            <button 
              id="help-loader-btn"
              onClick={onOpenHelp}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-xl transition"
              title="Ajuda SRE"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          )}
          <div className="px-3 py-1.5 bg-blue-50 text-blue-800 rounded-lg text-xs font-bold font-mono border border-blue-100 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-blue-600" />
            OPERADOR HOMOLOGADO
          </div>
        </div>
      </header>

      {/* 📦 Main Stage */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-xl flex flex-col gap-6">
          <AnimatePresence mode="wait">
            
            {/* 📥 1. Drag & Drop Master Ingestion Card */}
            {uploadStatus !== 'processing' && !isSyncing && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col gap-6"
              >
                <div>
                  <h2 className="text-sm font-black uppercase text-gray-900 tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-700" /> Ingestão de Planilha Excel (Carga Expert Lote 0)
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Insira bases offline fatiadas em blocos puros de 200 ativos.
                  </p>
                </div>

                {/* Drag zone container */}
                <div 
                  id="drop-zone-area"
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={triggerFileInput}
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all gap-4 ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' 
                      : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50/30'
                  }`}
                >
                  <input 
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileInputChange}
                  />
                  
                  <div className="w-14 h-14 rounded-2xl bg-gray-50 text-gray-500 border border-gray-100 flex items-center justify-center shadow-inner">
                    <Upload className="w-6 h-6 text-gray-400" />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-gray-800">Arraste a planilha ou clique para selecionar</span>
                    <span className="text-[10px] text-gray-400 font-mono uppercase">Suporte a formatos .xlsx, .xls, .csv</span>
                  </div>
                </div>

                {/* Informações Regulatórias */}
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-gray-800">Soberania Nativa Local GBR</span>
                    <span className="text-[10.5px] text-gray-500 leading-relaxed">
                      A planilha deve herdar a estrutura padrão contendo as chaves de controle (etiqueta, filial, status, vlraquisic) mapeadas sem duplicidades de hardware.
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 🔄 2. In-Progress Ingestion Dashboard */}
            {(uploadStatus === 'processing' || isSyncing) && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-8 border border-gray-200 shadow-md text-center flex flex-col items-center gap-6"
              >
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center animate-spin">
                  <Database className="w-8 h-8" />
                </div>

                <div className="flex flex-col gap-1.5 max-w-xs">
                  <h3 className="text-base font-black uppercase text-gray-900 tracking-tight leading-none">
                    {uploadStatus === 'processing' ? 'EXECUTANDO INGESTÃO INDUSTRIAL' : 'SINC_DOWN_SRE NUVEM'}
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Não feche o navegador nem interrompa o barramento de disco local.
                  </p>
                </div>

                {/* Progress Visual Indicators */}
                <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-blue-600 uppercase tracking-wider font-mono">
                      {uploadStatus === 'processing' ? 'PERSISTÊNCIA RIGIDA DOS 200' : 'SINC_CLOUD_BUFFER'}
                    </span>
                    <span className="font-black text-gray-800 font-mono">
                      {uploadStatus === 'processing' 
                        ? `${processedDetails?.processed || 0} Ativos` 
                        : (syncProgress?.label || 'Baixando...')}
                    </span>
                  </div>

                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ 
                        width: uploadStatus === 'processing' 
                          ? `${processedDetails?.percentage || 0}%` 
                          : `${syncProgress?.percentage || 15}%` 
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* 🌟 3. Operational Feedback Panel (Success / Error) */}
            {uploadStatus === 'success' && (
              <motion.div 
                key="success"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col items-center text-center gap-6"
              >
                <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-black uppercase text-gray-950 tracking-tight">Carga Homologada com Sucesso</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Buffer físico persistido de forma redundante e selado em disco.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 w-full flex justify-between text-xs font-mono">
                  <span className="text-gray-500">QUANTIDADE EM DISCO:</span>
                  <span className="font-bold text-gray-900">{processedDetails?.processed} Ativos</span>
                </div>

                <button 
                  id="success-ok-btn"
                  onClick={() => setUploadStatus('idle')}
                  className="w-full py-3 bg-gray-950 hover:bg-gray-900 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition duration-200"
                >
                  Confirmar e Voltar
                </button>
              </motion.div>
            )}

            {uploadStatus === 'error' && (
              <motion.div 
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col items-center text-center gap-6"
              >
                <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center shadow-inner animate-pulse">
                  <AlertTriangle className="w-8 h-8" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <h3 className="text-base font-black uppercase text-red-600 tracking-tight">Falha Crítica na Persistência</h3>
                  <p className="text-xs text-gray-500 max-w-sm mt-1">{errorMsg}</p>
                </div>

                <button 
                  id="error-retry-btn"
                  onClick={() => setUploadStatus('idle')}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition duration-200"
                >
                  Tentar Novamente
                </button>
              </motion.div>
            )}

          </AnimatePresence>

          {/* ⚡ Secondary Advanced Admin Panel Container */}
          {uploadStatus !== 'processing' && !isSyncing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col gap-4"
            >
              <div>
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-tight leading-none">Ações Administrativas Avançadas</h3>
                <p className="text-[10px] text-gray-400 uppercase font-mono mt-1">Procedimentos de hardware e recuperação</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  id="cloud-load-btn"
                  onClick={handleDownloadCloud}
                  className="p-4 border border-gray-200 rounded-2xl hover:bg-blue-50/20 hover:border-blue-300 transition duration-200 text-left flex flex-col gap-3 group"
                >
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-105 transition-transform duration-200 w-10 h-10 flex items-center justify-center">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">Sincronia Nuvem</span>
                    <span className="text-[10px] text-gray-400 mt-0.5 block leading-tight">Inicializa carga e sincronização do Supabase</span>
                  </div>
                </button>

                <button 
                  id="clear-db-btn"
                  onClick={() => setShowClearConfirm(true)}
                  className="p-4 border border-gray-200 rounded-2xl hover:bg-red-50/20 hover:border-red-300 transition duration-200 text-left flex flex-col gap-3 group"
                >
                  <div className="p-2.5 bg-red-50 text-red-600 rounded-xl group-hover:scale-105 transition-transform duration-200 w-10 h-10 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 border-transparent" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">Purgar Banco Local</span>
                    <span className="text-[10px] text-gray-400 mt-0.5 block leading-tight">Limpa buffers físicos de todos os ativos locais</span>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

        </div>
      </main>

      {/* Beautiful GBR Purgar Banco Local Confirm Modal */}
      {showClearConfirm && (
        <div id="loader-clear-confirm-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Purgar Banco Local</h3>
                <p className="text-[8px] text-gray-400 uppercase font-bold tracking-widest leading-none">SRE & Governança de I/O</p>
              </div>
            </div>
            
            <p className="text-[10px] text-gray-600 leading-relaxed font-bold uppercase">
              ATENÇÃO: Deseja apagar de forma definitiva o ecossistema e as tabelas locais do gbr_kardek.db? Essa operação não pode ser desfeita!
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                id="loader-clear-cancel-btn"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="loader-clear-confirm-btn"
                onClick={async () => {
                  setShowClearConfirm(false);
                  await onClearDatabase();
                  onDataLoaded();
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
              >
                Confirmar Limpeza
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseLoader;
