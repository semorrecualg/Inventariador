
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
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Asset } from '../types';
import { generateUUID } from '../services/supabaseService';
import BackButton from './BackButton';
import Modal from './Modal';

interface LoadSummary {
  rows: number;
  purgedRows: number;
  originalRows: number;
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
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ onBack, onDataLoaded, isSyncing, syncProgress }) => {
  const [step, setStep] = useState<'SOURCE' | 'LOADING' | 'COMPANY_SELECTION' | 'SUMMARY'>('SOURCE');
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
    if (val === undefined || val === null) return "";
    const s = String(val).trim().replace(/\s+/g, ' ');
    const upper = s.toUpperCase();
    if (upper === "" || upper === "NULL" || upper === "0" || upper.includes("#N/D") || upper.includes("#REF")) return "";
    return s.toUpperCase();
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
        if (['ETIQUETA', 'STATUS', 'EMPRESA', 'ENDERECO', 'DESCRICAO'].some(t => rowStr.includes(t))) {
          headerIdx = i; break;
        }
      }

      const rawHeaders = rawRows[headerIdx].map(h => String(h || '').trim().toUpperCase());
      
      // Mapeamento v24.50 - Ordem Estrita: EMPRESA;STATUS;ETIQUETA;QT;DESCRICAODOATIVO;SERIAL;DATAAQUSIC;CNPJ;NOMEFORNECEDOR;NOTAFISCAL;ENDERECO;REGISTRO;SUBREG;DATABAIXA;CONTACONTABIL;PRIMARYKEY;CENTRODECUSTO;VLRAQUISIC;SN1_RECNO;SN3_RECNO
      const m = {
        EMPRESA: rawHeaders.indexOf('EMPRESA'),
        STATUS: rawHeaders.indexOf('STATUS'),
        ETIQUETA: rawHeaders.indexOf('ETIQUETA'),
        QT: rawHeaders.indexOf('QT'),
        DESCRICAO: rawHeaders.indexOf('DESCRICAODOATIVO'),
        SERIAL: rawHeaders.indexOf('SERIAL'),
        DATA_AQ: rawHeaders.indexOf('DATAAQUSIC'),
        CNPJ: rawHeaders.indexOf('CNPJ'),
        FORNECEDOR: rawHeaders.indexOf('NOMEFORNECEDOR'),
        NF: rawHeaders.indexOf('NOTAFISCAL'),
        ENDERECO: rawHeaders.indexOf('ENDERECO'),
        REGISTRO: rawHeaders.indexOf('REGISTRO'),
        SUBREG: rawHeaders.indexOf('SUBREG'),
        DATA_BAIXA: rawHeaders.indexOf('DATABAIXA'),
        CONTA: rawHeaders.indexOf('CONTACONTABIL'),
        PK: rawHeaders.indexOf('PRIMARYKEY'),
        CUSTO: rawHeaders.indexOf('CENTRODECUSTO'),
        VALOR: rawHeaders.indexOf('VLRAQUISIC'),
        RECNO: rawHeaders.indexOf('SN1_RECNO') !== -1 ? rawHeaders.indexOf('SN1_RECNO') : rawHeaders.indexOf('RECNO'),
        RECNO3: rawHeaders.indexOf('SN3_RECNO') !== -1 ? rawHeaders.indexOf('SN3_RECNO') : -1
      };

      // Fallback para mapeamento por índice se os cabeçalhos não forem localizados corretamente
      if (m.EMPRESA === -1) m.EMPRESA = 0;
      if (m.STATUS === -1) m.STATUS = 1;
      if (m.ETIQUETA === -1) m.ETIQUETA = 2;
      if (m.QT === -1) m.QT = 3;
      if (m.DESCRICAO === -1) m.DESCRICAO = 4;
      if (m.SERIAL === -1) m.SERIAL = 5;
      if (m.DATA_AQ === -1) m.DATA_AQ = 6;
      if (m.CNPJ === -1) m.CNPJ = 7;
      if (m.FORNECEDOR === -1) m.FORNECEDOR = 8;
      if (m.NF === -1) m.NF = 9;
      if (m.ENDERECO === -1) m.ENDERECO = 10;
      if (m.REGISTRO === -1) m.REGISTRO = 11;
      if (m.SUBREG === -1) m.SUBREG = 12;
      if (m.DATA_BAIXA === -1) m.DATA_BAIXA = 13;
      if (m.CONTA === -1) m.CONTA = 14;
      if (m.PK === -1) m.PK = 15;
      if (m.CUSTO === -1) m.CUSTO = 16;
      if (m.VALOR === -1) m.VALOR = 17;
      if (m.RECNO === -1) m.RECNO = 18;
      if (m.RECNO3 === -1) m.RECNO3 = 19;

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

      rawRows.slice(headerIdx + 1).forEach((row) => {
        if (!row.some(c => String(c).trim() !== "")) return;

        const status = cleanDisplayValue(row[m.STATUS]);
        const etiqueta = cleanDisplayValue(row[m.ETIQUETA]);
        const conta = cleanDisplayValue(row[m.CONTA]);
        const pkNorm = normalizeKey(etiqueta);
        
        const isBaixado = status.includes('BAIXADO');
        const isAtivo = status.includes('ATIVO');

        // REGRA FUNDAMENTAL DE ELIMINAÇÃO (GBR Protocol v24)
        if (isBaixado) {
          // b.1) Eliminar se CONTA_CONTABIL contém 131105001 ou 131105002
          if (conta.includes('131105001') || conta.includes('131105002')) return;
          
          // b.2) Eliminar se ETIQUETA está vazia
          if (!etiqueta || etiqueta.trim() === "") return;
          
          // b.3.1) Eliminar se ETIQUETA existe em algum registro ATIVO
          if (activeTagsGlobal.has(pkNorm)) return;
          
          // b.3.2) Se ETIQUETA preenchida e NÃO existe em registros ATIVO, NÃO ELIMINAR (segue para criação)
        } else if (!isAtivo) {
          // Se não é BAIXADO nem ATIVO, por segurança mantemos (Regra a.1 estendida)
        }
        // Se for ATIVO, nunca elimina (Regra a.1)

        const asset: Asset = { id: generateUUID() };
        asset.EMPRESA = cleanDisplayValue(row[m.EMPRESA]) || "GERAL";
        asset.STATUS = status || "ATIVO";
        asset.ETIQUETA = etiqueta;
        asset.QT = cleanDisplayValue(row[m.QT]) || "1";
        asset.DESCRICAODOATIVO = cleanDisplayValue(row[m.DESCRICAO]);
        asset.SERIAL = cleanDisplayValue(row[m.SERIAL]);
        asset.DATAAQUSIC = cleanDisplayValue(row[m.DATA_AQ]);
        asset.CNPJ = cleanDisplayValue(row[m.CNPJ]);
        asset.NOMEFORNECEDOR = cleanDisplayValue(row[m.FORNECEDOR]);
        asset.NOTAFISCAL = cleanDisplayValue(row[m.NF]);
        asset.ENDERECO = cleanDisplayValue(row[m.ENDERECO]) || "ENDERECO NAO INFORMADO";
        asset.REGISTRO = cleanDisplayValue(row[m.REGISTRO]);
        asset.SUBREG = cleanDisplayValue(row[m.SUBREG]);
        asset.DATABAIXA = cleanDisplayValue(row[m.DATA_BAIXA]);
        asset.CONTACONTABIL = conta;
        asset.PRIMARYKEY = cleanDisplayValue(row[m.PK]);
        asset.CENTRODECUSTO = cleanDisplayValue(row[m.CUSTO]);
        asset.VLRAQUISIC = cleanDisplayValue(row[m.VALOR]);
        
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
        asset._empresaNormalizada = asset.EMPRESA;
        asset._baseSinteticaLoc = Array.from(baseSinteticaLoc);

        finalAssets.push(asset);
        companyCounts[asset.EMPRESA] = (companyCounts[asset.EMPRESA] || 0) + 1;
      });

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
    // Contagem de duplicidades por EMPRESA e STATUS ATIVO
    const companyTagCounts = new Map<string, number>();
    
    rawExtractedAssetsRef.current.forEach(a => {
      if (a.ETIQUETA) {
        const etqKey = normalizeKey(a.ETIQUETA);
        if (etqKey !== "ETIQUETAR") {
          const statusUpper = String(a.STATUS || '').toUpperCase();
          if (!statusUpper.includes('BAIXADO')) {
            const compKey = normalizeKey(a.EMPRESA || "GERAL");
            const compositeKey = `${compKey}_${etqKey}`;
            companyTagCounts.set(compositeKey, (companyTagCounts.get(compositeKey) || 0) + 1);
          }
        }
      }
    });

    const filteredAssets = rawExtractedAssetsRef.current.filter(a => selectedCompanies.has(a.EMPRESA || "GERAL"));
    
    filteredAssets.forEach(a => {
      const etqKey = a.ETIQUETA ? normalizeKey(a.ETIQUETA) : "";
      const compKey = normalizeKey(a.EMPRESA || "GERAL");
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
      companyStats[i.EMPRESA!] = (companyStats[i.EMPRESA!] || 0) + 1; 
      if(i.ENDERECO) baseSinteticaLoc.add(i.ENDERECO.toUpperCase().trim());
    });

    setSummary({
      rows: filteredAssets.length,
      purgedRows: rawExtractedAssetsRef.current.length - filteredAssets.length, 
      originalRows: rawExtractedAssetsRef.current.length,
      cols: 19, // Atualizado para v24.50
      companies: companyStats,
      headers: [], 
      withPlaqueta: filteredAssets.filter(a => !!a.ETIQUETA && normalizeKey(a.ETIQUETA) !== 'ETIQUETAR').length,
      locationsMasterCount: baseSinteticaLoc.size
    });

    rawExtractedAssetsRef.current = filteredAssets; 
    setStep('SUMMARY');
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

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn w-full overflow-hidden">
      <div className="px-5 pt-8 pb-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm relative z-20">
        <div className="flex items-center space-x-4">
          <BackButton onClick={onBack} label="Protocolo v24.50" subLabel="Base de Dados" />
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setIsHelpOpen(true)}
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
              O sistema exige arquivos <strong>Excel (.xls)</strong> para garantir a compatibilidade com o motor de processamento legado do Protheus.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Estrutura de Colunas (Ordem A-R)</h4>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[9px] text-slate-700 leading-relaxed">
              0: EMPRESA<br/>
              1: STATUS<br/>
              2: ETIQUETA<br/>
              3: QT<br/>
              4: DESCRICAODOATIVO<br/>
              5: SERIAL<br/>
              6: DATAAQUSIC<br/>
              7: CNPJ<br/>
              8: NOMEFORNECEDOR<br/>
              9: NOTAFISCAL<br/>
              10: ENDERECO<br/>
              11: REGISTRO<br/>
              12: SUBREG<br/>
              13: DATABAIXA<br/>
              14: CONTACONTABIL<br/>
              15: PRIMARYKEY<br/>
              16: CENTRODECUSTO<br/>
              17: VLRAQUISIC<br/>
              18: SN1_RECNO<br/>
              19: SN3_RECNO
            </div>
          </div>

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
        {step === 'SOURCE' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm modern-card">
               <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-600">Mapeamento v24.50</span>
               <h3 className="text-lg font-bold uppercase text-slate-900 tracking-tight mt-1.5 mb-2">Reestruturação</h3>
               <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-widest">
                Suporte nativo para Centro de Custo, Valor e Fornecedor. Utilize arquivos <strong>.xls</strong> com 18 colunas.
               </p>
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white p-8 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center space-y-4 active:scale-[0.98] transition-all hover:border-blue-300 hover:bg-blue-50/30 group">
              <div className="w-16 h-16 bg-slate-50 text-blue-600 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:scale-110 transition-transform"><FileSpreadsheet size={32} /></div>
              <div className="text-center">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Carregar Base GBR</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1.5 tracking-widest">Excel / CSV Autodetect</p>
              </div>
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
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Descartados</span>
                    <span className="text-lg font-bold text-rose-500">{summary.purgedRows}</span>
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
              <div>
                <p className="text-[11px] font-bold text-amber-900 uppercase tracking-tight">Pronto para Ativação</p>
                <p className="text-[10px] text-amber-700 mt-0.5">A base foi validada e está pronta para ser sincronizada com a nuvem.</p>
              </div>
            </div>

            <button onClick={() => onDataLoaded(rawExtractedAssetsRef.current, Object.keys(summary.companies).sort())} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] shadow-md active:scale-95 transition-all flex items-center justify-center space-x-3">
              <span>ATIVAR SISTEMA</span> <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
