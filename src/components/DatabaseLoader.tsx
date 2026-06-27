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
  UserCheck,
  BatteryWarning,
  Loader2
} from 'lucide-react';
import { sqliteService, db } from '../services/sqliteService';
import { Asset } from '../types';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import * as XLSX from 'xlsx';
import { bulkInsertAssetsOfflineFirst } from '../services/dexieService';

export interface AtivoPlanilha {
  [key: string]: string | number | boolean | null | undefined;
}

const COLUNAS_OBRIGATORIAS: string[] = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 
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
  rawExcelData: AtivoPlanilha[],
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  if (!rawExcelData || rawExcelData?.length === 0) {
    throw new Error("[SRE ERROR] Planilha vazia ou inválida enviada para processamento.");
  }
  
  const sampleRow = rawExcelData[0];
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
  const rowsLength = rawExcelData?.length ?? 0;

  for (let i = 0; i < rowsLength; i++) {
    const row = rawExcelData[i];
    if (!row || (!row['etiqueta'] && !row['ETIQUETA'] && !row['Etiqueta'])) {
      continue;
    }

    const getSafeValue = (key: string): string | number | boolean | null | undefined => {
      const realKey = headerMap[key];
      return realKey ? row[realKey] : null;
    };

    const asset: Asset = {
      tenantid: String(getSafeValue('tenantid') || '').trim(),
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
      _is_synced: 0,
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
  onExecutarSincroniaNuvem?: () => Promise<void>;
  onDataLoaded: (assets?: Asset[], companies?: string[]) => void;
  onConfirmSuccess?: () => void;
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
  onExecutarSincroniaNuvem,
  onDataLoaded,
  onConfirmSuccess
}) => {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [errorType, setErrorType] = useState<'generic' | 'battery' | 'connection'>('generic');
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ('showDirectoryPicker' in window && !(window as any).globalSreDirectoryHandle) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).globalSreDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      }
    } catch (err) {
      console.warn(">>> [SRE] DirectoryPicker ignorado via Drop.", err);
    }

    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target?.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    fileInputRef.current?.click();
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    // Debounce e cooldown de hardware antes de liberar a tela novamente
    await new Promise(res => setTimeout(res, 1500));
    setUploadStatus('idle');
    setErrorMsg('');
    setErrorType('generic');
    setIsRetrying(false);
  };

  // Processador Central do Arquivo em Lotes
  const processFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
      setUploadStatus('error');
      setErrorType('generic');
      setErrorMsg('Extensão inválida. Por favor, envie apenas arquivos Excel (.xlsx, .xls) ou CSV.');
      return;
    }

    setUploadStatus('processing');
    setErrorMsg('');
    setErrorType('generic');
    setProcessedDetails({ processed: 0, total: 0, percentage: 0 });

    // SRE Requirement: Cede o controle para a Main Thread renderizar o Loading antes de congelar no XLSX
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // 1. BYPASS DE BATERIA: Impeça se < 5% de carga, exceto se for semorr@gmail.com
      let currentBatteryLevel = 1.0;
      let isDeviceCharging = true;
      try {
        if (Capacitor.isNativePlatform()) {
          const info = await Device.getBatteryInfo();
          currentBatteryLevel = info.batteryLevel !== undefined ? info.batteryLevel : 1.0;
          isDeviceCharging = info.isCharging === true;
        } else {
          const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
          if (nav?.getBattery) {
            const battery = await nav.getBattery();
            currentBatteryLevel = battery?.level ?? 1.0;
            isDeviceCharging = battery?.charging ?? true;
          }
        }
      } catch (energyErr) {
        console.warn(">>> [Hardware Check] Falha ao consultar subsistema de energia:", energyErr);
      }

      const activeEmail = (user?.email || 'semorr@gmail.com').toString().trim().toLowerCase();
      const isSuperEmail = activeEmail === 'semorr@gmail.com';

      if (currentBatteryLevel < 0.05 && !isDeviceCharging && !isSuperEmail) {
        throw new Error('Dispositivo com bateria crítica (< 5%). Conecte o carregador para liberar a operação massiva de disco e tente novamente.');
      }

      // 2. PARSE INDUSTRIAL DA PLANILHA NO CLIENTE VIA XLSX
      const dataBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result instanceof ArrayBuffer) {
            resolve(e.target.result);
          } else {
            reject(new Error("Falha ao ler o arquivo como ArrayBuffer."));
          }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
      });

      const workbook = XLSX.read(dataBuffer, { type: "array" });
      
      // Respiro para não travar a tela na descompressão
      await new Promise(resolve => setTimeout(resolve, 50));

      const firstSheetName = workbook?.SheetNames?.[0];
      if (!firstSheetName) {
        throw new Error("Planilha vazia ou inválida.");
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const dadosBrutos = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      // Respiro após o parse para não estressar o garbage collector abruptamente
      await new Promise(resolve => setTimeout(resolve, 50));

      if (!dadosBrutos || dadosBrutos.length === 0) {
        throw new Error("A planilha fornecida está vazia ou corrompida.");
      }

      console.log(`>>> [SRE Ingestão UI] Iniciando gravação física via Dexie.js para ${dadosBrutos.length} registros.`);

      // 3. DISPARO DO LAÇO REAL DE GRAVAÇÃO DEXIE EM LOTES DE 200 REGISTROS
      await bulkInsertAssetsOfflineFirst(dadosBrutos, user?.email || 'semorr@gmail.com', (progresso) => {
        setProcessedDetails({
          processed: Math.round((progresso / 100) * dadosBrutos.length),
          total: dadosBrutos.length,
          percentage: progresso
        });
      });

      // Garante a estabilização visual em 100% apenas após o término físico da transação
      setProcessedDetails({
        processed: dadosBrutos.length,
        total: dadosBrutos.length,
        percentage: 100
      });
      
      setUploadStatus('success');

      // 4. LEITURA FÍSICA PARA PROPAGAÇÃO DE ESTADO
      const rawAssets = await db.local_assets.toArray();
      const loadedAssets: Asset[] = Array.isArray(rawAssets) ? rawAssets : [];
      
      // Filtro sanitário estrito para expurgar qualquer linha residual nula
      const validAssets = loadedAssets.filter(asset => asset && (asset.etiqueta || asset.id));
      const loadedUnits = Array.from(new Set(validAssets.map(a => a.filial).filter(Boolean)));

      console.log(`[SRE Audit] Carga consolidada em RAM operacional via Dexie: ${validAssets.length} ativos.`);
      onDataLoaded(validAssets, loadedUnits);

    } catch (err: unknown) {
      console.error("[SRE Loader Component] Erro crítico de Ingestão de Lote:", err);
      setUploadStatus('error');
      
      let rawMsg = '';
      if (err instanceof Error) {
        rawMsg = err.message;
      } else if (typeof err === 'string') {
        rawMsg = err;
      } else {
        try {
          rawMsg = JSON.stringify(err);
        } catch {
          rawMsg = 'Erro desconhecido ao processar planilha de ativos.';
        }
      }

      if (rawMsg?.includes('bateria') || rawMsg?.includes('Bateria') || rawMsg?.includes('bateria crítica')) {
        setErrorType('battery');
        setErrorMsg('Dispositivo com bateria crítica (< 5%). Conecte o carregador para liberar a operação massiva de disco e tente novamente.');
      } else if (rawMsg?.includes('[FATAL_IMPORT_CRASH]')) {
        setErrorType('generic');
        setErrorMsg(rawMsg);
      } else {
        setErrorType('generic');
        setErrorMsg(rawMsg || 'Ocorreu um erro estrutural durante a ingestão do Excel.');
      }
    }
  };

  // Ações Auxiliares
  const handleDownloadCloud = async () => {
    try {
      if (onExecutarSincroniaNuvem) {
        await onExecutarSincroniaNuvem();
      } else {
        await onCargaInicial();
      }
    } catch (err: unknown) {
      console.error("[SRE Cloud Load] Cloud sync load failed:", err);
    }
  };

  const renderTreadmill = () => {
    let processed = 0;
    let total = 0;
    
    if (uploadStatus === 'processing' && processedDetails) {
      processed = processedDetails?.processed || 0;
      total = processedDetails?.total || 0;
    } else if (isSyncing && syncProgress) {
      processed = Number(syncProgress?.processed) || 0;
      total = Number(syncProgress?.total) || 0;
    }
    
    if (total <= 0) return null;
    
    // Divide em fatias de até 1000 registros para o painel visual
    const BATCH_UI_SIZE = 1000;
    const numBatches = Math.ceil(total / BATCH_UI_SIZE);
    const rows = [];
    
    for (let i = 0; i < numBatches; i++) {
      const start = i * BATCH_UI_SIZE + 1;
      const end = Math.min((i + 1) * BATCH_UI_SIZE, total);
      
      const isCompleted = processed >= end;
      const isProcessing = processed >= start && processed < end;
      
      const rowClass = isCompleted 
        ? 'bg-green-200 text-green-900' 
        : isProcessing 
          ? 'bg-blue-200 text-blue-900 animate-pulse' 
          : 'text-gray-400 bg-white';
          
      let progressPct = 0;
      if (isCompleted) {
        progressPct = 100;
      } else if (isProcessing) {
        progressPct = ((processed - (start - 1)) / (end - (start - 1))) * 100;
      }
      
      rows.push(
        <tr key={i} className={`text-xs font-mono font-medium ${rowClass} border-b border-gray-100 last:border-0 transition-colors duration-300`}>
          <td className="p-2 text-center py-2.5">LOTE {i + 1}</td>
          <td className="p-2 text-center py-2.5">{start.toString().padStart(4, '0')}</td>
          <td className="p-2 w-full align-middle py-2.5">
            <div className={`w-full h-2.5 ${isCompleted ? 'bg-green-300/50' : isProcessing ? 'bg-blue-300/50' : 'bg-gray-100'} rounded-full overflow-hidden`}>
              <div 
                className={`h-full ${isCompleted ? 'bg-green-600' : isProcessing ? 'bg-blue-600' : 'bg-transparent'} transition-all duration-[400ms] ease-out`} 
                style={{ width: `${progressPct}%` }} 
              />
            </div>
          </td>
          <td className="p-2 text-center py-2.5">{end.toString().padStart(4, '0')}</td>
        </tr>
      );
    }
    
    return (
      <div className="w-full mt-2 flex flex-col gap-2">
        <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">
          <span>Esteira Operacional</span>
          <span>{processed} / {total} Processados</span>
        </div>
        <div className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-inner bg-white max-h-[220px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-900 text-white text-[10px] uppercase tracking-widest font-black text-center shadow-sm">
                <th className="p-2 py-2.5">Lote</th>
                <th className="p-2 py-2.5">Início</th>
                <th className="p-2 py-2.5 w-1/2">Progressão Visual</th>
                <th className="p-2 py-2.5">Fim</th>
              </tr>
            </thead>
            <tbody>
              {rows}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div id="database-loader-screen" className="flex flex-col h-full bg-gray-50 text-gray-900 font-sans antialiased">
      {/* 🚀 Top Header Industrial */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button 
            id="back-loader-btn"
            onClick={onBack}
            className="p-2 rounded-xl transition duration-200 hover:bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={uploadStatus === 'processing' || isSyncing || isRetrying}
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
          <AnimatePresence mode="popLayout">
            
            {/* 📥 1. Drag & Drop Master Ingestion Card */}
            {uploadStatus !== 'processing' && uploadStatus !== 'error' && uploadStatus !== 'success' && !isSyncing && (
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
                    onClick={(e) => e.stopPropagation()}
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

                  {renderTreadmill()}
                </div>
              </motion.div>
            )}

            {/* 🌟 3. Operational Feedback Panel (Success) */}
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
                  <span className="font-bold text-gray-900">{processedDetails?.processed || 0} Ativos</span>
                </div>

                <button 
                  id="success-ok-btn"
                  onClick={() => {
                    setUploadStatus('idle');
                    if (onConfirmSuccess) {
                      onConfirmSuccess();
                    }
                  }}
                  className="w-full py-3 bg-gray-950 hover:bg-gray-900 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition duration-200"
                >
                  Confirmar e Voltar
                </button>
              </motion.div>
            )}

            {/* 🚨 4. Operational Feedback Panel (Error) */}
            {uploadStatus === 'error' && (
              <motion.div 
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col items-center text-center gap-6"
              >
                {errorType === 'battery' ? (
                  <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center shadow-inner animate-pulse">
                    <BatteryWarning className="w-8 h-8" />
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center shadow-inner animate-pulse">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                )}

                <div className="flex flex-col gap-1.5 items-center">
                  <h3 className={`text-base font-black uppercase tracking-tight ${errorType === 'battery' ? 'text-amber-600' : 'text-red-600'}`}>
                    {errorType === 'battery' ? 'ALERTA DE HARDWARE: BATERIA CRÍTICA' : 'FALHA CRÍTICA NA PERSISTÊNCIA'}
                  </h3>
                  <p className="text-xs text-gray-500 max-w-sm mt-1">{errorMsg}</p>
                </div>

                <button 
                  id="error-retry-btn"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className={`w-full py-3 ${isRetrying ? 'bg-gray-400 cursor-not-allowed' : errorType === 'battery' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'} text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition duration-200 flex items-center justify-center gap-2`}
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      PREPARANDO AMBIENTE...
                    </>
                  ) : (
                    errorMsg.includes('[FATAL_IMPORT_CRASH]') ? 'RECURSAR / TENTAR NOVAMENTE' : 'TENTAR NOVAMENTE'
                  )}
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
                  className="p-4 border border-gray-200 rounded-2xl hover:bg-blue-50/20 hover:border-blue-300 transition duration-200 text-left flex flex-col gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={uploadStatus === 'error' || isRetrying}
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
                  className="p-4 border border-gray-200 rounded-2xl hover:bg-red-50/20 hover:border-red-300 transition duration-200 text-left flex flex-col gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={uploadStatus === 'error' || isRetrying}
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
