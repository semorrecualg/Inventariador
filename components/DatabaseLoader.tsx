
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
  FolderOpen,
  Trash2,
  Upload,
  Database,
  FileJson,
  FileCode
} from 'lucide-react';
import * as XLSX from 'xlsx';
import localforage from 'localforage';
import { Asset, DatabaseMode, InventoryState } from '../types';
import { sqliteService } from '../services/sqliteService';
import { requestPersistentStorage, isStoragePersisted } from '../services/localDbService';
import { backupInventory, restoreInventory } from '../services/persistenceService';
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
  onRestore: (state: InventoryState) => void;
  onClearDatabase: () => void;
  isSyncing?: boolean;
  syncProgress?: { current: number; total: number } | null;
  excludedAccounts?: string[];
  campaigns?: import('../types').InventoryCampaign[];
  user?: import('../types').User | null;
  databaseMode: import('../types').DatabaseMode;
  showModal: (title: string, message: string, type: 'success' | 'error' | 'info' | 'confirm' | 'warning') => void;
  onOpenHelp?: () => void;
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ 
  onBack, 
  onDataLoaded, 
  onRestore,
  onClearDatabase,
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
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [hasTriedImmobilization, setHasTriedImmobilization] = useState(false);
  const [isPersisted, setIsPersisted] = useState(false);
  const [summary, setSummary] = useState<LoadSummary | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  React.useEffect(() => {
    isStoragePersisted().then(setIsPersisted);
    sqliteService.getFileStatus().then(status => {
      setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
    });

    const handleInitFailed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      showModal("Erro de Conectividade", detail.error, "error");
    };

    const handleWriteBlocked = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.warn(">>> [UI] Gravação bloqueada detectada:", detail);
      sqliteService.getFileStatus().then(status => {
         setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
      });
    };

    const handlePersisted = () => {
      sqliteService.getFileStatus().then(status => {
         setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
      });
    };

    window.addEventListener('gbr_db_init_failed', handleInitFailed);
    window.addEventListener('gbr_db_write_blocked', handleWriteBlocked);
    window.addEventListener('gbr_db_persisted', handlePersisted);
    
    return () => {
      window.removeEventListener('gbr_db_init_failed', handleInitFailed);
      window.removeEventListener('gbr_db_write_blocked', handleWriteBlocked);
      window.removeEventListener('gbr_db_persisted', handlePersisted);
    };
  }, []);

  const handleLinkSpecificFile = async () => {
    try {
      if (window.self !== window.top) {
        showModal(
          "Restrição de Navegador",
          "O navegador impede a seleção de arquivos dentro de iframes. Abra o app em uma nova aba para blindar seu banco de dados.",
          "warning"
        );
        return;
      }
      
      const success = await sqliteService.mapSpecificFile();
      if (success) {
        const status = await sqliteService.getFileStatus();
        setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
        showModal("Banco Blindado", "O aplicativo agora está trabalhando exclusivamente com o arquivo físico selecionado.", "success");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      showModal("Erro de Vínculo", "Não foi possível vincular o arquivo: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };
  
  React.useEffect(() => {
    const hasSeenHelp = localStorage.getItem('gbr_seen_load_help');
    if (!hasSeenHelp) {
      setIsHelpOpen(true);
      localStorage.setItem('gbr_seen_load_help', 'true');
    }
  }, []);
  
  const [availableCompanies, setAvailableCompanies] = useState<{name: string, count: number}[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [fileStatus, setFileStatus] = useState<{status: string, path: string, folderName?: string, fileName?: string, linkType?: string} | null>(null);

  React.useEffect(() => {
    if (step === 'IMMOBILIZATION' || step === 'SOURCE') {
      sqliteService.getFileStatus().then(status => {
        setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
      });
    }
  }, [step]);

  const rawExtractedAssetsRef = useRef<Asset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleExportDB = async () => {
    setIsLoadingTools(true);
    try {
      const dbBlob = await sqliteService.exportDatabaseFile();
      if (!dbBlob) throw new Error("Falha ao gerar blob do banco.");
      
      const url = window.URL.createObjectURL(dbBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory_${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showModal("Sucesso", "Arquivo .DB exportado com sucesso. Este arquivo pode ser aberto em qualquer gestor SQLite.", "success");
    } catch (err) {
      showModal("Erro", "Falha ao exportar .DB: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsLoadingTools(false);
    }
  };

  const handleBackup = async () => {
    setIsLoadingTools(true);
    try {
      await backupInventory(databaseMode);
      showModal("Sucesso", "Backup JSON gerado e salvo nos downloads.", "success");
    } catch (err) {
      showModal("Erro", "Falha ao gerar backup: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsLoadingTools(false);
    }
  };

  const handleJsonRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsLoadingTools(true);
    try {
      const state = await restoreInventory(file, databaseMode);
      if (state) {
        onRestore(state);
        showModal("Sucesso", "Backup restaurado com sucesso.", "success");
      } else {
        throw new Error("Falha ao descriptografar ou processar o arquivo de backup.");
      }
    } catch (err) {
      showModal("Erro", "Falha ao restaurar backup: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsLoadingTools(false);
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

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
        // REGRA DE OURO v24.51: Garante que todos os ativos importados herdem o tenant do usuário logado
        // se estiverem vazios. Isso evita que fiquem órfãos em buscas por tenant.
        const activeTenant = (user?._tenantid || user?.tenantid || 'CICOPAL').trim().toUpperCase();
        console.log(`>>> [DatabaseLoader] Normalizando ${rawExtractedAssetsRef.current.length} ativos para o tenant: ${activeTenant}`);
        
        rawExtractedAssetsRef.current = rawExtractedAssetsRef.current.map(a => ({
          ...a,
          _tenantid: a._tenantid || activeTenant,
          GRUPO_EMPRESARIAL: a.GRUPO_EMPRESARIAL || activeTenant
        }));

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

  const [isMapping, setIsMapping] = useState(false);

  const handleStartImmobilization = async () => {
    if (isMapping) return;
    setIsMapping(true);
    
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

      const success = await sqliteService.mapLocalFolder();
      
      if (success) {
        // Atualiza o status visual
        const status = await sqliteService.getFileStatus();
        setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
        
        setStep('SUMMARY');
        setTimeout(() => handleActivateSystem(), 300);
      }
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
        setTimeout(() => handleActivateSystem(), 300);
      } else {
        showModal("Erro de Vínculo", "Não foi possível vincular a pasta: " + errorMessage, "error");
      }
    } finally {
      setIsMapping(false);
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
          <div className="space-y-4">
            {/* 1. STATUS DE DIRETÓRIO (Painel de Soberania Unificado) */}
            <div className={`rounded-2xl shadow-xl border p-5 relative overflow-hidden group transition-all duration-500 ${fileStatus?.status === 'linked' ? 'bg-blue-600 border-blue-400' : 'bg-slate-900 border-slate-700'}`}>
               <div className="absolute top-0 right-0 p-4 opacity-10">
                  <FolderOpen size={64} className="text-white" />
               </div>

               <div className="flex items-center space-x-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white backdrop-blur-sm border border-white/30 ${fileStatus?.status === 'linked' ? 'bg-white/20' : 'bg-slate-800'}`}>
                    {fileStatus?.folderName === 'Arquivo Individual' ? <ShieldCheck size={20} /> : <Database size={20} />}
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-white uppercase tracking-tight">
                      {fileStatus?.folderName === 'Arquivo Individual' ? 'Base Blindada Individual' : 'Status da Base Local'}
                    </h4>
                    <div className="flex items-center space-x-2">
                      <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Soberania de Dados Permanente</p>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-black border ${sqliteService.getDbStatus() === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-white/50 border-white/20'}`}>
                        {sqliteService.getDbStatus() === 'ACTIVE' ? 'ATIVO' : 'EM DESUSO'}
                      </span>
                    </div>
                  </div>
               </div>

               {fileStatus?.status === 'none' && (
                 <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 mb-4">
                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-widest leading-relaxed">
                      ⚠️ ATENÇÃO: Nenhum diretório físico vinculado. 
                      Os dados serão salvos apenas na memória do navegador. 
                      <strong className="text-white underline ml-1">VINCULE UMA PASTA PARA SEGURANÇA TOTAL.</strong>
                    </p>
                 </div>
               )}

               {fileStatus?.status === 'prompt' && (
                 <div className="bg-amber-500/20 backdrop-blur-md rounded-2xl p-4 border border-amber-500/30 mb-4 animate-pulse">
                    <p className="text-[10px] text-amber-200 font-bold uppercase tracking-widest leading-relaxed">
                       ⚠️ PERMISSÃO EXPIRADA: Clique no botão de atualizar (laranja) para retomar o vínculo com a pasta. Sem isso, os dados ficam apenas na memória.
                    </p>
                 </div>
               )}

                {fileStatus?.status === 'denied' && (
                  <div className="bg-red-500/20 backdrop-blur-md rounded-2xl p-4 border border-red-500/30 mb-4">
                     <p className="text-[10px] text-red-200 font-bold uppercase tracking-widest leading-relaxed">
                        ❌ ACESSO NEGADO: O navegador bloqueou a escrita nesta pasta. Tente &quot;Alterar Pasta&quot; e selecione novamente para restaurar a gravação.
                     </p>
                  </div>
                )}

               {fileStatus?.status === 'linked' && (
                 <div className="bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/10 mb-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">
                        {fileStatus.linkType === 'DIRECTORY' ? 'Pasta Vinculada:' : 'Arquivo Vinculado:'}
                      </span>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm">
                        {fileStatus.linkType === 'DIRECTORY' ? 'DIRETÓRIO ATIVO' : 'ARQUIVO ATIVO'}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono font-bold text-white break-all leading-tight mb-2">
                       {fileStatus.path}
                    </p>
                    
                    {fileStatus.linkType === 'DIRECTORY' && (
                      <div className="mb-2 p-1.5 bg-white/5 rounded border border-white/10">
                        <p className="text-[8px] text-white/60 font-medium">
                          Buscando arquivo: <span className="text-blue-300">{fileStatus.fileName}</span>
                        </p>
                      </div>
                    )}

                    <div className="p-2 bg-slate-900/50 rounded-lg mb-2">
                       <p className="text-[7px] text-white/40 leading-tight">
                         <span className="text-blue-300 font-black">NOTA DBA:</span> Por segurança do navegador (Sandbox), o caminho completo (Ex: C:\Users\...) não é exposto. O sistema garante o vínculo persistente com a pasta selecionada.
                       </p>
                    </div>

                    {/* @ts-expect-error - size added in service */}
                    {fileStatus.size !== undefined && (
                      <div className="flex items-center space-x-3 text-[8px] font-bold text-white/50 uppercase tracking-widest mt-2 pt-2 border-t border-white/5">
                        {/* @ts-expect-error - size added in service */}
                        <span>Tamanho: {(fileStatus.size / 1024).toFixed(1)} KB</span>
                        {/* @ts-expect-error - lastModified added in service */}
                        <span>Modificado: {new Date(fileStatus.lastModified || '').toLocaleTimeString()}</span>
                      </div>
                    )}
                 </div>
               )}

               <div className="flex flex-col space-y-2">
                 <div className="flex space-x-2">
                   <button 
                    onClick={handleLinkSpecificFile}
                    className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-black/10 flex items-center justify-center space-x-2 active:scale-95 ${fileStatus?.status === 'linked' && fileStatus?.folderName === 'Arquivo Individual' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'}`}
                   >
                     <ShieldCheck size={16} />
                     <span>{fileStatus?.status === 'linked' && fileStatus?.folderName === 'Arquivo Individual' ? 'ALTERAR ARQUIVO .DB' : 'VINCULAR ARQUIVO .DB'}</span>
                   </button>

                   <button 
                    onClick={handleStartImmobilization}
                    className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-black/10 flex items-center justify-center space-x-2 active:scale-95 ${fileStatus?.status === 'linked' && fileStatus?.folderName !== 'Arquivo Individual' ? 'bg-white text-blue-600 hover:bg-blue-50' : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'}`}
                   >
                     <FolderOpen size={16} />
                     <span>{fileStatus?.status === 'linked' && fileStatus?.folderName !== 'Arquivo Individual' ? 'ALTERAR PASTA' : 'VINCULAR PASTA'}</span>
                   </button>
                   
                   {fileStatus?.status === 'prompt' && (
                      <button 
                        onClick={async () => {
                          const success = await sqliteService.requestFilePermission();
                          if (success) {
                            const status = await sqliteService.getFileStatus();
                            setFileStatus(status as { status: string; path: string; folderName?: string; fileName?: string });
                            // Forçar carregamento imediato dos ativos do banco reabilitado
                            const items = await sqliteService.query("SELECT * FROM assets") as Asset[];
                            if (items && items.length > 0) {
                              onDataLoaded(items, [...new Set(items.map(a => {
                                const val = (a.UNIDADE_OPERACIONAL || a.UNIDADE || '').toString().trim().toUpperCase();
                                return val;
                              }))].filter(Boolean));
                            }
                          }
                        }}
                        className="w-14 py-3 bg-amber-500 text-white rounded-xl flex items-center justify-center hover:bg-amber-600 transition-all shadow-lg active:scale-95"
                      >
                        <RefreshCw size={20} />
                      </button>
                   )}
                 </div>
                 
                 {fileStatus?.status === 'none' && (
                   <p className="text-[7px] text-white/40 font-bold uppercase tracking-widest text-center">
                     Recomendado: Vincule um arquivo .db específico para trabalhar em modo Expert &quot;Blindado&quot;
                   </p>
                 )}
               </div>
            </div>

            {/* 2. CARGA DE NOVOS DADOS */}
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white p-6 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center space-y-3 active:scale-[0.98] transition-all hover:border-blue-300 hover:bg-blue-50/30 group">
                <div className="w-14 h-14 bg-slate-50 text-blue-600 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:scale-110 transition-transform"><FileSpreadsheet size={28} /></div>
                <div className="text-center">
                  <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Carregar Nova Base</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">Excel v25 ou CSV Master</p>
                </div>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleBackup}
                  disabled={isLoadingTools}
                  className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-2"><FileJson size={20} /></div>
                  <span className="text-[9px] font-bold text-slate-900 uppercase tracking-tight">Gerar Backup</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">JSON Local</span>
                </button>

                <button 
                  onClick={() => jsonInputRef.current?.click()}
                  disabled={isLoadingTools}
                  className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-2"><Upload size={20} /></div>
                  <span className="text-[9px] font-bold text-slate-900 uppercase tracking-tight">Restaurar</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Importar JSON</span>
                </button>
              </div>
            </div>

            {/* 3. UTILITÁRIOS AVANÇADOS */}
            <div className="bg-slate-100/50 p-4 rounded-2xl border border-slate-200 space-y-3">
               <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Utilitários Avançados</h4>
               
               <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={handleExportDB}
                    disabled={isLoadingTools}
                    className="flex items-center space-x-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                      <FileCode size={16} />
                    </div>
                    <div className="text-left overflow-hidden">
                      <p className="text-[9px] font-black text-slate-900 uppercase truncate">Exportar .DB</p>
                      <p className="text-[7px] font-bold text-slate-400 uppercase">SQLite Nativo</p>
                    </div>
                  </button>

                  <button 
                    onClick={onClearDatabase}
                    disabled={isLoadingTools}
                    className="flex items-center space-x-2 p-3 bg-red-50 border border-red-100 rounded-xl shadow-sm hover:bg-red-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <div className="w-8 h-8 bg-white text-red-600 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                      <Trash2 size={16} />
                    </div>
                    <div className="text-left overflow-hidden">
                      <p className="text-[9px] font-black text-red-600 uppercase truncate">Limpar Tudo</p>
                      <p className="text-[7px] font-bold text-red-400 uppercase tracking-tighter">Reset Fábrica</p>
                    </div>
                  </button>
               </div>

               <div className="flex items-center justify-between px-2 pt-1">
                 <div className="flex items-center space-x-2">
                   <div className={`w-2 h-2 rounded-full ${isPersisted ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`} />
                   <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Reforço de Persistência Browser</span>
                 </div>
                 {!isPersisted && (
                   <button 
                    onClick={() => requestPersistentStorage().then(setIsPersisted)}
                    className="text-[8px] font-black text-blue-600 uppercase hover:underline"
                   >
                     Solicitar
                   </button>
                 )}
               </div>
            </div>

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
            
            <input 
              ref={jsonInputRef} 
              type="file" 
              className="hidden" 
              accept=".json" 
              onChange={handleJsonRestore} 
            />
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
