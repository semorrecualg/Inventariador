
import React, { useState, useRef } from 'react';
import { 
  Loader2, 
  ArrowRight, 
  FileSpreadsheet, 
  Activity,
  CheckSquare,
  Square,
  CheckCircle2,
  Info,
  HelpCircle,
  RefreshCw,
  Download,
  Cloud,
  Calendar,
  ShieldCheck,
  FolderOpen
} from 'lucide-react';
import * as XLSX from 'xlsx';
import localforage from 'localforage';
import { Asset, DatabaseMode } from '../types';
import { APP_LOGO } from '../constants';
import { sqliteService } from '../services/sqliteService';
import { generateUUID, logAuditEvent } from '../services/supabaseService';
import { deduplicateRedundantString } from '../utils/formatUtils';
import BackButton from './BackButton';
import Modal from './Modal';

interface LoadSummary {
  rows: number;
  purgedRows: number;
  originalRows: number;
  divergentBaixaCount: number; // ATIVO com DATABAIXA
  cols: number;
  companies: Record<string, number>;
  headers: string[];
  withPlaqueta: number;
  locationsMasterCount: number;
}

interface DatabaseLoaderProps {
  onBack: () => void;
  onDataLoaded: (assets: Asset[], companies: string[]) => void;
  isSyncing?: boolean;
  syncProgress?: { current: number; total: number } | null;
  excludedAccounts?: string[];
  campaigns?: import('../types').InventoryCampaign[];
  user?: import('../types').User | null;
  databaseMode?: import('../types').DatabaseMode;
  showModal: (title: string, message: string, type: 'success' | 'error' | 'info' | 'confirm' | 'warning') => void;
  onOpenHelp?: () => void;
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ 
  onBack, 
  onDataLoaded, 
  isSyncing, 
  syncProgress,
  excludedAccounts = [],
  campaigns = [],
  user,
  databaseMode,
  showModal,
  onOpenHelp
}) => {
  const [step, setStep] = useState<'SOURCE' | 'LOADING' | 'COMPANY_SELECTION' | 'SUMMARY' | 'IMMOBILIZATION'>('SOURCE');
  const [isActivating, setIsActivating] = useState(false);
  const [hasTriedImmobilization, setHasTriedImmobilization] = useState(false);
  const [summary, setSummary] = useState<LoadSummary | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  React.useEffect(() => {
    const hasSeenHelp = localStorage.getItem('gbr_seen_load_help');
    if (!hasSeenHelp) {
      setIsHelpOpen(true);
      localStorage.setItem('gbr_seen_load_help', 'true');
    }
  }, []);
  
  const [availableCompanies, setAvailableCompanies] = useState<{name: string, count: number}[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [fileStatus, setFileStatus] = useState<{status: string, path: string, folderName?: string, fileName?: string} | null>(null);

  React.useEffect(() => {
    if (step === 'IMMOBILIZATION') {
      sqliteService.getFileStatus().then(status => {
        setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
      });
    }
  }, [step]);

  const rawExtractedAssetsRef = useRef<Asset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizeKey = (s: unknown) => {
    if (s === null || s === undefined) return '';
    return String(s).toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  };

  const cleanDisplayValue = (val: unknown): string => {
    return deduplicateRedundantString(val as string);
  };

  const processFile = async (dataBuffer: ArrayBuffer) => {
    try {
      setStep('LOADING');
      
      const wb = XLSX.read(dataBuffer, { type: 'array' });
      const aws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(aws, { header: 1, defval: "" }) as (string | number)[][];
      
      let headerIdx = 0;
      for (let i = 0; i < Math.min(rawRows.length, 50); i++) {
        const rowStr = rawRows[i].join('|').toUpperCase();
        if (['ETIQUETA', 'STATUS', 'UNIDADE_OPERACIONAL', 'GRUPO_EMPRESARIAL', 'ENDERECO', 'DESCRICAO'].some(t => rowStr.includes(t))) {
          headerIdx = i; break;
        }
      }

      const rawHeaders = rawRows[headerIdx].map(h => String(h || '').trim().toUpperCase());
      
      // Mapeamento v25.00 - Ordem Estrita: GRUPO_EMPRESARIAL;UNIDADE_OPERACIONAL;STATUS;ETIQUETA;QT;DESCRICAO;SERIAL;DATA_AQ;CNPJ;FORNECEDOR;NF;ENDERECO;REGISTRO;SUBREG;DATA_BAIXA;CONTA;PK;CUSTO;VALOR;SN1_RECNO;SN3_RECNO
      const findIdx = (names: string[]) => {
        for (const name of names) {
          const idx = rawHeaders.indexOf(name.toUpperCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const m = {
        GRUPO_EMPRESARIAL: findIdx(['GRUPO_EMPRESARIAL']),
        UNIDADE_OPERACIONAL: findIdx(['UNIDADE_OPERACIONAL']),
        STATUS: findIdx(['STATUS']),
        ETIQUETA: findIdx(['ETIQUETA']),
        QT: findIdx(['QT']),
        DESCRICAO: findIdx(['DESCRICAO', 'DESCRICAODOATIVO']),
        SERIAL: findIdx(['SERIAL']),
        DATA_AQ: findIdx(['DATA_AQ', 'DATAAQUISIC']),
        CNPJ: findIdx(['CNPJ']),
        FORNECEDOR: findIdx(['FORNECEDOR', 'NOMEFORNECEDOR']),
        NF: findIdx(['NF', 'NOTAFISCAL']),
        ENDERECO: findIdx(['ENDERECO']),
        REGISTRO: findIdx(['REGISTRO']),
        SUBREG: findIdx(['SUBREG']),
        DATA_BAIXA: findIdx(['DATA_BAIXA', 'DATABAIXA']),
        CONTA: findIdx(['CONTA', 'CONTACONTABIL']),
        PK: findIdx(['PK', 'PRIMARYKEY']),
        CUSTO: findIdx(['CUSTO', 'CENTRODECUSTO']),
        VALOR: findIdx(['VALOR', 'VLRAQUISIC']),
        RECNO: rawHeaders.indexOf('SN1_RECNO') !== -1 ? rawHeaders.indexOf('SN1_RECNO') : rawHeaders.indexOf('RECNO'),
        RECNO3: rawHeaders.indexOf('SN3_RECNO') !== -1 ? rawHeaders.indexOf('SN3_RECNO') : -1
      };

      // Fallback por índice se os cabeçalhos não forem localizados
      if (m.GRUPO_EMPRESARIAL === -1) m.GRUPO_EMPRESARIAL = 0;
      // Se a UNIDADE_OPERACIONAL não foi encontrada pelo nome, mas o GRUPO_EMPRESARIAL foi encontrado em outro lugar que não o índice 1, usamos o índice 1 como fallback
      if (m.UNIDADE_OPERACIONAL === -1) m.UNIDADE_OPERACIONAL = 1;
      
      // Proteção: Se ambos apontarem para o mesmo índice por erro de detecção, tentamos separar
      if (m.GRUPO_EMPRESARIAL === m.UNIDADE_OPERACIONAL && m.GRUPO_EMPRESARIAL !== -1) {
        if (m.GRUPO_EMPRESARIAL === 0) m.UNIDADE_OPERACIONAL = 1;
        else m.GRUPO_EMPRESARIAL = 0;
      }
      if (m.STATUS === -1) m.STATUS = 2;
      if (m.ETIQUETA === -1) m.ETIQUETA = 3;
      if (m.QT === -1) m.QT = 4;
      if (m.DESCRICAO === -1) m.DESCRICAO = 5;
      if (m.SERIAL === -1) m.SERIAL = 6;
      if (m.DATA_AQ === -1) m.DATA_AQ = 7;
      if (m.CNPJ === -1) m.CNPJ = 8;
      if (m.FORNECEDOR === -1) m.FORNECEDOR = 9;
      if (m.NF === -1) m.NF = 10;
      if (m.ENDERECO === -1) m.ENDERECO = 11;
      if (m.REGISTRO === -1) m.REGISTRO = 12;
      if (m.SUBREG === -1) m.SUBREG = 13;
      if (m.DATA_BAIXA === -1) m.DATA_BAIXA = 14;
      if (m.CONTA === -1) m.CONTA = 15;
      if (m.PK === -1) m.PK = 16;
      if (m.CUSTO === -1) m.CUSTO = 17;
      if (m.VALOR === -1) m.VALOR = 18;
      if (m.RECNO === -1) m.RECNO = 19;
      if (m.RECNO3 === -1) m.RECNO3 = 20;

      const baseSinteticaLoc = new Set<string>();
      const activeTagsGlobal = new Set<string>();

      rawRows.slice(headerIdx + 1).forEach(row => {
        const status = cleanDisplayValue(row[m.STATUS]);
        const etiqueta = cleanDisplayValue(row[m.ETIQUETA]);
        const endereco = cleanDisplayValue(row[m.ENDERECO]);
        if (status.includes('ATIVO') && etiqueta) activeTagsGlobal.add(normalizeKey(etiqueta));
        if (endereco) baseSinteticaLoc.add(endereco.toUpperCase().trim());
      });

      const finalAssets: Asset[] = [];
      const companyCounts: Record<string, number> = {};
      let missingTenantRows = 0;

      rawRows.slice(headerIdx + 1).forEach((row) => {
        if (!row.some(c => String(c).trim() !== "")) return;

        const status = cleanDisplayValue(row[m.STATUS]);
        const isAtivo = status.includes('ATIVO');

        // REGRA DE OURO v25: Somente Importamos ATIVOS
        if (!isAtivo) return;

        const grupoEmpresarial = cleanDisplayValue(row[m.GRUPO_EMPRESARIAL]);
        
        // REGRA DE OURO PARA tenantid: O campo GRUPO_EMPRESARIAL é OBRIGATÓRIO
        if (!grupoEmpresarial || grupoEmpresarial.trim() === "" || grupoEmpresarial.toUpperCase() === "DEFAULT" || grupoEmpresarial.toUpperCase() === "NULL") {
          missingTenantRows++;
          return; // Skip this row for now, but we will fail the whole process below
        }

        const etiqueta = cleanDisplayValue(row[m.ETIQUETA]);
        const conta = cleanDisplayValue(row[m.CONTA]);
        const dataBaixa = cleanDisplayValue(row[m.DATA_BAIXA]);
        
        // Filtro de Contas Excluídas (Parametrizado)
        if (excludedAccounts?.includes(conta)) return;

        const asset: Asset = { id: generateUUID() };
        asset.GRUPO_EMPRESARIAL = grupoEmpresarial;
        asset.UNIDADE_OPERACIONAL = cleanDisplayValue(row[m.UNIDADE_OPERACIONAL]) || "GERAL";
        asset.STATUS = status || "ATIVO";
        asset.ETIQUETA = etiqueta;
        asset.QT = cleanDisplayValue(row[m.QT]) || "1";
        asset.DESCRICAODOATIVO = cleanDisplayValue(row[m.DESCRICAO]);
        asset.SERIAL = cleanDisplayValue(row[m.SERIAL]);
        asset.DATAAQUISIC = cleanDisplayValue(row[m.DATA_AQ]);
        asset.CNPJ = cleanDisplayValue(row[m.CNPJ]);
        asset.NOMEFORNECEDOR = cleanDisplayValue(row[m.FORNECEDOR]);
        asset.NOTAFISCAL = cleanDisplayValue(row[m.NF]);
        asset.ENDERECO = cleanDisplayValue(row[m.ENDERECO]) || "ENDERECO NAO INFORMADO";
        asset.REGISTRO = cleanDisplayValue(row[m.REGISTRO]);
        asset.SUBREG = cleanDisplayValue(row[m.SUBREG]);
        asset.DATABAIXA = dataBaixa;
        asset.CONTACONTABIL = conta;
        asset.PRIMARYKEY = cleanDisplayValue(row[m.PK]);
        asset.CENTRODECUSTO = cleanDisplayValue(row[m.CUSTO]);
        asset.VLRAQUISIC = cleanDisplayValue(row[m.VALOR]);

        // SINALIZAÇÃO DA REGRA DE OURO: ATIVO COM DATA DE BAIXA
        if (dataBaixa && dataBaixa.trim() !== "" && dataBaixa !== "0") {
          asset._is_divergent_baixa = true;
        }
        
        const recnoVal = row[m.RECNO];
        if (recnoVal !== undefined && recnoVal !== null && recnoVal !== "") {
          asset.Sn1_recno = Number(recnoVal);
        }

        const recno3Val = m.RECNO3 !== -1 ? row[m.RECNO3] : undefined;
        if (recno3Val !== undefined && recno3Val !== null && recno3Val !== "") {
          asset.Sn3_recno = Number(recno3Val);
        }

        asset._plaquetaMaster = asset.ETIQUETA || "S/ ETQ";
        asset._localMaster = asset.ENDERECO;
        asset._descricaoMaster = asset.DESCRICAODOATIVO || "SEM DESCRICAO";
        asset._empresaNormalizada = asset.UNIDADE_OPERACIONAL;
        asset._baseSinteticaLoc = Array.from(baseSinteticaLoc);
        asset._tenantid = asset.GRUPO_EMPRESARIAL; // Garantir que o campo interno esteja preenchido
        asset._unitid = asset.UNIDADE_OPERACIONAL; // Garantir que o campo interno esteja preenchido

        finalAssets.push(asset);
        companyCounts[asset.UNIDADE_OPERACIONAL] = (companyCounts[asset.UNIDADE_OPERACIONAL] || 0) + 1;
      });

      // VALIDAÇÃO DA REGRA DE OURO: Se houver linhas sem GRUPO_EMPRESARIAL, abortamos tudo
      if (missingTenantRows > 0) {
        throw new Error(`REGRA DE OURO VIOLADA: Foram encontradas ${missingTenantRows} linhas sem o campo 'GRUPO_EMPRESARIAL' preenchido. O preenchimento deste campo é obrigatório para garantir a segurança e isolamento dos dados entre empresas. Por favor, corrija a planilha e tente novamente.`);
      }

      rawExtractedAssetsRef.current = finalAssets;
      const companiesList = Object.keys(companyCounts).sort().map(name => ({ name, count: companyCounts[name] }));
      setAvailableCompanies(companiesList);
      setSelectedCompanies(new Set(companiesList.map(c => c.name)));
      setStep('COMPANY_SELECTION');
    } catch (err) {
      console.error(`Erro Protocolo v24: ${err instanceof Error ? err.message : String(err)}`);
      setStep('SOURCE'); // Reset on error
    }
  };

  const finalizeLoading = () => {
    // Contagem de duplicidades por UNIDADE_OPERACIONAL e STATUS ATIVO
    const companyTagCounts = new Map<string, number>();
    
    rawExtractedAssetsRef.current.forEach(a => {
      if (a.ETIQUETA) {
        const etqKey = normalizeKey(a.ETIQUETA);
        if (etqKey !== "ETIQUETAR") {
          const statusUpper = String(a.STATUS || '').toUpperCase();
          if (!statusUpper.includes('BAIXADO')) {
            const compKey = normalizeKey(a.UNIDADE_OPERACIONAL || "GERAL");
            const compositeKey = `${compKey}_${etqKey}`;
            companyTagCounts.set(compositeKey, (companyTagCounts.get(compositeKey) || 0) + 1);
          }
        }
      }
    });

    const filteredAssets = rawExtractedAssetsRef.current.filter(a => selectedCompanies.has(a.UNIDADE_OPERACIONAL || "GERAL"));
    
    filteredAssets.forEach(a => {
      const etqKey = a.ETIQUETA ? normalizeKey(a.ETIQUETA) : "";
      const compKey = normalizeKey(a.UNIDADE_OPERACIONAL || "GERAL");
      const compositeKey = `${compKey}_${etqKey}`;

      if (!a.ETIQUETA || etqKey === "ETIQUETAR") {
        a.TAG_DUPLICIDADE = 'SEM IDENTIFICAÇÃO';
      } else {
        const count = companyTagCounts.get(compositeKey) || 0;
        a.TAG_DUPLICIDADE = count > 1 ? 'ETIQUETA+1REGISTRO' : 'ÚNICO';
      }
    });

    const companyStats: Record<string, number> = {};
    const baseSinteticaLoc = new Set<string>();
    filteredAssets.forEach(i => { 
      companyStats[i.UNIDADE_OPERACIONAL!] = (companyStats[i.UNIDADE_OPERACIONAL!] || 0) + 1; 
      if(i.ENDERECO) baseSinteticaLoc.add(i.ENDERECO.toUpperCase().trim());
    });

    setSummary({
      rows: filteredAssets.length,
      purgedRows: rawExtractedAssetsRef.current.length - filteredAssets.length, 
      originalRows: rawExtractedAssetsRef.current.length,
      divergentBaixaCount: filteredAssets.filter(a => a._is_divergent_baixa).length,
      cols: 21, // Atualizado para v25.00
      companies: companyStats,
      headers: [], 
      withPlaqueta: filteredAssets.filter(a => !!a.ETIQUETA && normalizeKey(a.ETIQUETA) !== 'ETIQUETAR').length,
      locationsMasterCount: baseSinteticaLoc.size
    });

    rawExtractedAssetsRef.current = filteredAssets; 
    setStep('SUMMARY');
  };

  const handleActivateSystem = async () => {
    console.log('>>> [DatabaseLoader] Iniciando ativação do sistema...');
    
    // REGRA DE OURO DBA: Em modo INTERNO, a imobilização física é preferencial
    const currentDbMode = databaseMode || (localStorage.getItem('app_database_mode') as DatabaseMode) || DatabaseMode.INTERNAL;
    const isInternal = currentDbMode === DatabaseMode.INTERNAL;
    const isIframe = window.self !== window.top;
    
    // Feature detection para File System Access API
    // @ts-expect-error - feature detection
    const isFileSystemSupported = !!window.showDirectoryPicker;
    
    if (isInternal && isFileSystemSupported && !hasTriedImmobilization) {
      try {
        const dirHandleKey = `gbr_db_dir_handle_${currentDbMode}`;
        const hasHandle = await localforage.getItem(dirHandleKey);
        
        if (!hasHandle && !isIframe) {
          console.log('>>> [DatabaseLoader] Navegador suporta FileSystem mas pasta não está vinculada. Indo para IMMOBILIZATION.');
          setStep('IMMOBILIZATION');
          return;
        }
        
        if (!hasHandle && isIframe) {
          console.warn('>>> [DatabaseLoader] Operando em modo de visualização (Iframe). Imobilização física desativada temporariamente.');
        }
      } catch (err) {
        console.warn('Erro ao verificar handle de arquivo:', err);
      }
    }

    if (isInternal && !isFileSystemSupported) {
      console.log('>>> [DatabaseLoader] Navegador não suporta FileSystem (Mobile?). Prosseguindo com armazenamento virtual.');
    }

    await performActivation();
  };

  const performActivation = async () => {
    if (rawExtractedAssetsRef.current.length > 0) {
      setIsActivating(true);
      try {
        // Log de Auditoria: Carga Expert
        await logAuditEvent({
          user_email: user?.email || 'ADMIN',
          action: 'CARGA_EXPERT',
          details: `Carga de ${rawExtractedAssetsRef.current.length} ativos realizada via planilha.`,
          _tenantid: user?.tenantid || 'GLOBAL'
        });

        await onDataLoaded(rawExtractedAssetsRef.current, Object.keys(summary?.companies || {}).sort());
      } catch (err) {
        console.error('>>> [DatabaseLoader] Erro ao ativar sistema:', err);
        setIsActivating(false);
      }
    } else {
      console.warn('>>> [DatabaseLoader] Tentativa de ativar sistema sem ativos.');
    }
  };

  const handleStartImmobilization = async () => {
    try {
      if (window.self !== window.top) {
        showModal(
          "Restrição de Navegador",
          "O navegador impede a seleção de pastas dentro de janelas de visualização (iframes). Por favor, abra o aplicativo em uma nova aba para vincular sua pasta física permanentemente.",
          "warning"
        );
        return;
      }

      // @ts-expect-error - feature detection
      if (!window.showDirectoryPicker) {
        throw new Error("API_NOT_SUPPORTED");
      }

      await sqliteService.mapLocalFolder();
      
      // Atualiza o status visual
      const status = await sqliteService.getFileStatus();
      setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
      
      setStep('SUMMARY');
      setTimeout(() => handleActivateSystem(), 300);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Falha na imobilização:', err);
      
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      if (errorMessage === "IFRAME_RESTRICTION") {
        showModal(
          "Restrição de Iframe",
          "O navegador bloqueia o acesso a pastas locais quando o app está em modo de visualização. Abra o app em uma nova aba para usar esta função.",
          "info"
        );
        // Fallback silencioso para continuar a experiência básica
        setStep('SUMMARY');
        setTimeout(() => handleActivateSystem(), 300);
      } else if (errorMessage === "API_NOT_SUPPORTED") {
        showModal(
          "Não Suportado",
          "Seu navegador não suporta acesso a pastas locais. Usaremos o armazenamento virtual temporário.",
          "warning"
        );
        setStep('SUMMARY');
        setTimeout(() => handleActivateSystem(), 500);
      } else {
        showModal("Erro de Vínculo", "Não foi possível vincular a pasta: " + errorMessage, "error");
      }
    }
  };

  const toggleCompany = (name: string) => {
    const newSelection = new Set(selectedCompanies);
    if (newSelection.has(name)) newSelection.delete(name);
    else newSelection.add(name);
    setSelectedCompanies(newSelection);
  };

  if (isSyncing) {
    return (
      <div className="flex flex-col h-[100dvh] bg-bg-main items-center justify-center p-8 text-center animate-fadeIn">
        <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-blue-100/50 border border-blue-100">
          <RefreshCw className="text-blue-600 animate-spin" size={48} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-bold text-ink uppercase tracking-tight mb-3">Sincronizando Nuvem</h2>
        <p className="text-ink-muted text-[11px] font-bold uppercase tracking-[0.2em] max-w-xs leading-relaxed mb-8">
          Enviando base de dados para o servidor central (Supabase)
        </p>
        
        {syncProgress && (
          <div className="w-full max-w-xs">
            <div className="flex justify-between items-end mb-3">
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Progresso do Upload</span>
              <span className="text-sm font-black text-ink tracking-tighter">
                {Math.round((syncProgress.current / syncProgress.total) * 100)}%
              </span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5 shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-[9px] text-ink-muted font-bold uppercase tracking-widest mt-4">
              {syncProgress.current.toLocaleString()} de {syncProgress.total.toLocaleString()} ativos
            </p>
          </div>
        )}
      </div>
    );
  }

  const handleCustomBack = () => {
    if (step === 'IMMOBILIZATION') {
      setStep('SUMMARY');
    } else if (step === 'SUMMARY') {
      setStep('COMPANY_SELECTION');
    } else if (step === 'COMPANY_SELECTION') {
      setStep('SOURCE');
    } else {
      onBack();
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn w-full overflow-hidden">
      <div className="px-5 pt-8 pb-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm relative z-20">
        <div className="flex items-center space-x-4">
          <BackButton onClick={handleCustomBack} label="Voltar" subLabel={step === 'SOURCE' ? 'Base de Dados' : 'Etapa Anterior'} />
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => onOpenHelp ? onOpenHelp() : setIsHelpOpen(true)}
            className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 active:scale-90 transition-all"
          >
            <HelpCircle size={20} />
          </button>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md"><Activity size={20} /></div>
        </div>
      </div>

      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Guia de Carga Expert"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-3">
            <div className="flex items-center space-x-2 text-blue-600">
              <Info size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Requisito de Arquivo</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              O sistema exige arquivos <strong>Excel (.xls ou .xlsx)</strong> seguindo o modelo oficial v25.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Estrutura de Colunas (Ordem A-U)</h4>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[9px] text-slate-700 leading-relaxed max-h-40 overflow-y-auto">
              0: GRUPO_EMPRESARIAL<br/>
              1: UNIDADE_OPERACIONAL<br/>
              2: STATUS<br/>
              3: ETIQUETA<br/>
              4: QT<br/>
              5: DESCRICAO<br/>
              6: SERIAL<br/>
              7: DATA_AQ<br/>
              8: CNPJ<br/>
              9: FORNECEDOR<br/>
              10: NF<br/>
              11: ENDERECO<br/>
              12: REGISTRO<br/>
              13: SUBREG<br/>
              14: DATA_BAIXA<br/>
              15: CONTA<br/>
              16: PK<br/>
              17: CUSTO<br/>
              18: VALOR<br/>
              19: SN1_RECNO<br/>
              20: SN3_RECNO
            </div>
          </div>

          <button 
            onClick={() => {
              const headers = ['GRUPO_EMPRESARIAL', 'UNIDADE_OPERACIONAL', 'STATUS', 'ETIQUETA', 'QT', 'DESCRICAO', 'SERIAL', 'DATA_AQ', 'CNPJ', 'FORNECEDOR', 'NF', 'ENDERECO', 'REGISTRO', 'SUBREG', 'DATA_BAIXA', 'CONTA', 'PK', 'CUSTO', 'VALOR', 'SN1_RECNO', 'SN3_RECNO'];
              const ws = XLSX.utils.aoa_to_sheet([headers]);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Template_v25");
              XLSX.writeFile(wb, "Template_Carga_Expert_v25.xlsx");
            }}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2"
          >
            <Download size={16} />
            <span>Baixar Modelo Excel</span>
          </button>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-[9px] font-bold text-amber-700 uppercase leading-tight">
              ⚠️ Importante: A ordem das colunas é utilizada como fallback caso os cabeçalhos não sejam identificados.
            </p>
          </div>

          <button 
            onClick={() => setIsHelpOpen(false)}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px]"
          >
            Entendi
          </button>
        </div>
      </Modal>

      <div className="flex-1 overflow-y-auto p-5 no-scrollbar pb-24">
        {isSyncing && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="relative mb-8">
              <Loader2 className="text-blue-400 animate-spin" size={100} strokeWidth={1.5} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Cloud className="text-blue-400 animate-pulse" size={40} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white uppercase tracking-[0.2em] mb-2">Sincronizando Nuvem</h3>
            <p className="text-blue-200/60 text-[10px] font-bold uppercase tracking-widest mb-8">Enviando Base Mestre em Lotes de 500</p>
            
            {syncProgress && (
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-2">
                  <span>Progresso</span>
                  <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-4">
                  {syncProgress.current} de {syncProgress.total} Ativos Processados
                </p>
              </div>
            )}
            
            <div className="mt-12 p-4 bg-white/5 rounded-2xl border border-white/10 max-w-sm">
              <p className="text-[10px] text-blue-100/80 leading-relaxed italic">
                &quot;Aguarde a finalização. O sistema está unitarizando os dados e validando a integridade referencial no servidor.&quot;
              </p>
            </div>
          </div>
        )}

        {step === 'SOURCE' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm modern-card flex items-center gap-4">
              <div className="w-16 h-16 bg-white border border-slate-100 rounded-full flex items-center justify-center shadow-sm overflow-hidden shrink-0">
                <img 
                  src={APP_LOGO} 
                  alt="GBR Auditoria Logo" 
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-600">Mapeamento v25.00</span>
                <h3 className="text-lg font-bold uppercase text-slate-900 tracking-tight mt-0.5">Reestruturação</h3>
                <p className="text-[10px] font-bold text-slate-400 leading-tight uppercase tracking-widest mt-1">
                  Suporte nativo para C. Custo, Valor e Fornecedor.
                </p>
              </div>
            </div>

            {/* Quick Link to Immobilization - Requested by user to find "Determinar local" easily */}
            <button 
              onClick={() => setStep('IMMOBILIZATION')}
              className="w-full bg-blue-600/5 hover:bg-blue-600/10 text-blue-700 p-6 rounded-2xl border-2 border-blue-600/20 flex items-center gap-4 transition-all group border-dashed"
            >
              <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform shrink-0">
                <FolderOpen size={24} />
              </div>
              <div className="text-left">
                <h3 className="text-[11px] font-black uppercase tracking-tight">Vincular Local de Trabalho</h3>
                <p className="text-[9px] font-bold opacity-70 uppercase mt-1 tracking-widest leading-tight">
                  Apenas determinar o local onde a base de dados (.db) será mantida permanentemente.
                </p>
              </div>
              <div className="ml-auto text-blue-600/30 group-hover:text-blue-600">
                <ArrowRight size={20} />
              </div>
            </button>

            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white p-8 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center space-y-4 active:scale-[0.98] transition-all hover:border-blue-300 hover:bg-blue-50/30 group">
              <div className="w-16 h-16 bg-slate-50 text-blue-600 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:scale-110 transition-transform"><FileSpreadsheet size={32} /></div>
              <div className="text-center">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Carregar Base de Dados</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1.5 tracking-widest">Excel / CSV Autodetect</p>
              </div>
            </button>

            <button 
              onClick={() => {
                const headers = [
                  'GRUPO_EMPRESARIAL', 'UNIDADE_OPERACIONAL', 'STATUS', 'ETIQUETA', 'QT', 
                  'DESCRICAO', 'SERIAL', 'DATA_AQ', 'CNPJ', 'FORNECEDOR', 'NF', 
                  'ENDERECO', 'REGISTRO', 'SUBREG', 'DATA_BAIXA', 'CONTA', 'PK', 
                  'CUSTO', 'VALOR', 'SN1_RECNO', 'SN3_RECNO'
                ];
                const exampleData = [{
                  GRUPO_EMPRESARIAL: 'EXEMPLO_SA',
                  UNIDADE_OPERACIONAL: 'MATRIZ',
                  STATUS: 'ATIVO',
                  ETIQUETA: 'PAT-0001',
                  QT: 1,
                  DESCRICAO: 'NOTEBOOK DELL LATITUDE',
                  SERIAL: 'ABC123XYZ',
                  DATA_AQ: '2023-01-15',
                  CNPJ: '00.000.000/0001-00',
                  FORNECEDOR: 'DELL BRASIL',
                  NF: '12345',
                  ENDERECO: 'SALA 101 - TI',
                  REGISTRO: 'REG-001',
                  SUBREG: '00',
                  DATA_BAIXA: '',
                  CONTA: '1.02.01.01.01',
                  PK: 'ERP-001',
                  CUSTO: '10101',
                  VALOR: 5500.00,
                  SN1_RECNO: 1,
                  SN3_RECNO: 1
                }];
                const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "CargaExpert");
                XLSX.writeFile(wb, "Matriz_Carga_Expert_v25.xls");
              }}
              className="w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl border border-slate-200 flex items-center justify-center space-x-2 transition-all group"
            >
              <Download size={16} className="group-hover:translate-y-0.5 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Baixar Planilha Matriz</span>
            </button>

            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => {
               const f = e.target.files?.[0];
               if (f) {
                 const r = new FileReader();
                 r.onload = (ev) => {
                   const data = ev.target?.result;
                   if (data instanceof ArrayBuffer) {
                     processFile(data);
                   }
                 };
                 r.readAsArrayBuffer(f);
               }
            }} />
          </div>
        )}

        {step === 'LOADING' && (
          <div className="py-40 flex flex-col items-center justify-center space-y-6 text-center">
            <div className="relative">
              <Loader2 className="text-sky-600 animate-spin" size={80} strokeWidth={2.5} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-sky-600 rounded-full animate-pulse" />
              </div>
            </div>
            <div>
                <p className="text-[12px] font-bold text-slate-900 uppercase tracking-[0.4em]">Indexando Ativos v24...</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Calculando Índices de 18 Dimensões</p>
            </div>
          </div>
        )}

        {step === 'COMPANY_SELECTION' && (
          <div className="space-y-6 animate-slideUp">
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm modern-card">
               <div className="flex items-center justify-between mb-4">
                  <span className="text-[9px] font-bold uppercase text-blue-600 tracking-[0.2em]">Seleção de Unidades</span>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setSelectedCompanies(new Set(availableCompanies.map(c => c.name)))} 
                      className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border border-slate-200 px-3 py-1.5 rounded-lg active:bg-blue-600 active:text-white transition-all shadow-sm"
                    >
                      Todos
                    </button>
                    <button 
                      onClick={() => setSelectedCompanies(new Set())} 
                      className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border border-slate-200 px-3 py-1.5 rounded-lg active:bg-red-600 active:text-white transition-all shadow-sm"
                    >
                      Nenhum
                    </button>
                  </div>
               </div>
               <div className="space-y-2.5 max-h-[45vh] overflow-y-auto no-scrollbar pr-1">
                  {availableCompanies.map(comp => (
                    <button key={comp.name} onClick={() => toggleCompany(comp.name)} className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all active:scale-[0.99] ${selectedCompanies.has(comp.name) ? 'bg-blue-50 border-blue-200 text-slate-900 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${selectedCompanies.has(comp.name) ? 'bg-blue-600 text-white border-blue-500 shadow-md' : 'bg-white text-slate-200 border-slate-100'}`}>
                          {selectedCompanies.has(comp.name) ? <CheckSquare size={16} strokeWidth={3} /> : <Square size={16} />}
                        </div>
                        <div className="text-left">
                          <span className="text-[12px] font-bold uppercase tracking-tight block">{comp.name}</span>
                          <span className="text-[9px] font-bold opacity-60 uppercase tracking-widest mt-0.5">{comp.count} Ativos</span>
                        </div>
                      </div>
                    </button>
                  ))}
               </div>
            </div>
            <button disabled={selectedCompanies.size === 0} onClick={finalizeLoading} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] shadow-lg active:scale-95 disabled:opacity-30 transition-all flex items-center justify-center space-x-3">
              <span>EFETIVAR BASE MESTRE</span> <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 'IMMOBILIZATION' && (
          <div className="space-y-3 animate-slideUp">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-9 h-9 bg-slate-50 text-slate-900 rounded-lg flex items-center justify-center border border-slate-100">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Configuração de Diretório</h3>
                  <p className="text-[10px] text-slate-500 font-medium leading-tight">Imobilização de dados permanente.</p>
                </div>
              </div>
              
              <div className="space-y-3 mb-4">
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center space-x-2 mb-2 text-slate-900">
                    <FolderOpen size={14} className="text-blue-600" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Instruções de Configuração</span>
                  </div>
                  
                  <div className="space-y-2.5 text-slate-600">
                    <p className="text-[10px] leading-relaxed">
                      Escolha o destino para processamento e armazenamento seguro dos dados.
                    </p>
                    
                    <ul className="space-y-1">
                      <li className="flex items-start space-x-2 text-[10px]">
                        <span className="flex-shrink-0 w-3.5 h-3.5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-[7px] font-bold text-slate-400">1</span>
                        <span><strong className="text-slate-900 font-bold">Evite Downloads</strong> para prevenir exclusão automática.</span>
                      </li>
                      <li className="flex items-start space-x-2 text-[10px]">
                        <span className="flex-shrink-0 w-3.5 h-3.5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-[7px] font-bold text-slate-400">2</span>
                        <span>Crie a pasta: <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700 font-mono font-bold">Inventariador_App</code></span>
                      </li>
                      <li className="flex items-start space-x-2 text-[10px]">
                        <span className="flex-shrink-0 w-3.5 h-3.5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-[7px] font-bold text-slate-400">3</span>
                        <span>Mantenha sua <strong className="text-slate-900 font-bold">Planilha Excel</strong> nesta pasta.</span>
                      </li>
                    </ul>
                    
                    <p className="text-[9px] text-slate-500 italic mt-2 border-t border-slate-100 pt-2 leading-tight">
                      O app gerará o <strong className="text-slate-700">Banco de Dados SQL</strong> neste local.
                    </p>
                  </div>
                </div>

                {window.self !== window.top && (
                  <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-2">
                    <Info size={12} className="mt-0.5 text-amber-600 shrink-0" />
                    <p className="text-[9px] text-amber-700 leading-tight">
                      Navegador bloqueia acesso a pastas em iframes. Use modo virtual ou nova aba.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={handleStartImmobilization}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold uppercase text-[10px] tracking-[0.15em] shadow-sm active:scale-[0.98] transition-all flex items-center justify-center space-x-2 hover:bg-slate-800"
                >
                  <FolderOpen size={16} />
                  <span>SELECIONAR DIRETÓRIO</span>
                </button>

                <button 
                  onClick={() => {
                    setHasTriedImmobilization(true);
                    setStep('SUMMARY');
                    setTimeout(() => handleActivateSystem(), 300);
                  }}
                  className="w-full px-4 py-1.5 rounded-xl font-bold uppercase text-[8px] tracking-widest text-slate-400 hover:text-slate-500 border border-transparent transition-all flex items-center justify-center"
                >
                  Continuar sem vínculo (Virtual)
                </button>
              </div>

              {fileStatus && fileStatus.status === 'linked' && (
                <div className="mt-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl animate-fadeIn">
                  <div className="flex items-center space-x-2 text-emerald-700 mb-1.5">
                    <CheckCircle2 size={14} />
                    <span className="text-[8px] font-bold uppercase tracking-wider">Diretório Vinculado</span>
                  </div>
                  
                  <div className="bg-white/80 p-1.5 rounded-lg border border-emerald-100">
                    <p className="text-[8px] font-mono text-emerald-800 break-all leading-tight">
                      {fileStatus.path}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-6 animate-slideUp">
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm modern-card">
               <div className="flex justify-between items-start mb-4">
                 <div>
                   <span className="text-[9px] font-bold uppercase text-emerald-600 tracking-[0.2em]">Carga Finalizada</span>
                   <h3 className="text-4xl font-bold tracking-tight text-slate-900 mt-1">{summary.rows}</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens Processados</p>
                 </div>
                 <div className="text-right">
                   <div className="bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                     <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">{Object.keys(summary.companies).length} Unidades</span>
                   </div>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-3 mt-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Colunas</span>
                    <span className="text-lg font-bold text-slate-900">{summary.cols}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Endereços</span>
                    <span className="text-lg font-bold text-slate-900">{summary.locationsMasterCount}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Com Plaqueta</span>
                    <span className="text-lg font-bold text-emerald-600">{summary.withPlaqueta}</span>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-inner">
                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest block mb-1">Divergência Baixa</span>
                    <span className="text-lg font-bold text-red-600">{summary.divergentBaixaCount}</span>
                  </div>
                  <div className="col-span-2 bg-purple-50 p-4 rounded-xl border border-purple-100 shadow-inner flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest block mb-1">Status da Campanha</span>
                      <span className="text-sm font-black text-purple-700 uppercase tracking-tight">
                        {campaigns && campaigns.length > 0 ? 'CAMPANHA ATIVA NO COLETOR' : 'NENHUMA CAMPANHA ATIVA'}
                      </span>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${campaigns && campaigns.length > 0 ? 'bg-purple-600 text-white animate-pulse' : 'bg-purple-200 text-purple-400'}`}>
                      <Calendar size={18} />
                    </div>
                  </div>
               </div>

               <div className="mt-6 pt-6 border-t border-slate-100">
                 <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-[0.2em] mb-4">Distribuição por Unidade</h4>
                 <div className="space-y-2 max-h-[20vh] overflow-y-auto no-scrollbar pr-1">
                   {Object.entries(summary.companies).map(([name, count]) => (
                     <div key={name} className="flex justify-between items-center text-[11px]">
                       <span className="font-medium text-slate-600 truncate mr-4">{name}</span>
                       <span className="font-bold text-slate-900">{count}</span>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start space-x-3">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold text-amber-900 uppercase tracking-tight">Pronto para Ativação</p>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  {databaseMode === DatabaseMode.INTERNAL 
                    ? 'A base foi validada e será ativada localmente (100% Offline).' 
                    : 'A base foi validada e está pronta para ser sincronizada (Modo Nuvem).'}
                </p>
                {databaseMode !== DatabaseMode.INTERNAL && (
                  <div className="mt-3 p-3 bg-blue-600/10 border border-blue-600/20 rounded-lg">
                    <p className="text-[8px] font-bold text-blue-800 uppercase leading-tight tracking-wider">
                      🛡️ Princípio da Redundância: Por segurança, faça backups regulares mesmo no modo nuvem. 
                      Os arquivos receberão o sufixo <span className="underline">.Cloud</span>.
                    </p>
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-amber-200/50 flex items-center justify-between">
                  <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Tenant: {user?._tenantid || user?.tenantid || 'CICOPAL'}</span>
                  <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Modo: {localStorage.getItem('app_database_mode') || 'MOBILE PURO'}</span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleActivateSystem}
              disabled={isActivating}
              className={`w-full py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] shadow-md active:scale-95 transition-all flex items-center justify-center space-x-3 ${isActivating ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {isActivating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>PROCESSANDO...</span>
                </>
              ) : (
                <>
                  <span>ATIVAR SISTEMA</span> <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
