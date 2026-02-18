
import React, { useState, useRef } from 'react';
import { 
  Loader2, 
  ArrowRight, 
  ArrowLeft, 
  FileSpreadsheet, 
  Activity,
  Trash2,
  ShieldCheck,
  MapPin,
  CheckCircle2,
  Building2,
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Asset } from '../types';

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
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ onBack, onDataLoaded }) => {
  const [step, setStep] = useState<'SOURCE' | 'LOADING' | 'COMPANY_SELECTION' | 'SUMMARY'>('SOURCE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LoadSummary | null>(null);
  
  // States para seleção de empresas
  const [availableCompanies, setAvailableCompanies] = useState<{name: string, count: number}[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());

  const rawExtractedAssetsRef = useRef<Asset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizeKey = (s: string) => {
    return s.toString().toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  };

  const cleanDisplayValue = (val: any): string => {
    if (val === undefined || val === null) return "";
    let s = String(val).trim().replace(/\s+/g, ' '); 
    const upper = s.toUpperCase();
    if (upper === "" || upper === "NULL" || upper === "0" || upper.includes("#N/D") || upper.includes("#REF")) return "";
    return s.toUpperCase();
  };

  const processFile = async (dataBuffer: any) => {
    try {
      setStep('LOADING');
      setLoading(true);
      setError(null);
      
      const wb = XLSX.read(dataBuffer, { type: 'array' });
      const aws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(aws, { header: 1, defval: "" }) as any[][];
      
      let headerIdx = 0;
      for (let i = 0; i < Math.min(rawRows.length, 50); i++) {
        const rowStr = rawRows[i].join('|').toUpperCase();
        if (['ETIQUETA', 'STATUS', 'EMPRESA', 'ENDERECO', 'DESCRICAO'].some(t => rowStr.includes(t))) {
          headerIdx = i; break;
        }
      }

      const rawHeaders = rawRows[headerIdx].map(h => String(h || '').trim().toUpperCase());
      
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
        PK: rawHeaders.indexOf('PRIMARYKEY')
      };

      const baseSinteticaLoc = new Set<string>();
      const activeTagsGlobal = new Set<string>();

      rawRows.slice(headerIdx + 1).forEach(row => {
        const status = cleanDisplayValue(row[m.STATUS]);
        const etiqueta = cleanDisplayValue(row[m.ETIQUETA]);
        const endereco = cleanDisplayValue(row[m.ENDERECO]);
        if (status.includes('ATIVO') && etiqueta) activeTagsGlobal.add(normalizeKey(etiqueta));
        if (endereco) baseSinteticaLoc.add(endereco.toUpperCase().trim());
      });

      let purgedCount = 0;
      const finalAssets: Asset[] = [];
      const companyCounts: Record<string, number> = {};

      rawRows.slice(headerIdx + 1).forEach((row, idx) => {
        if (!row.some(c => String(c).trim() !== "")) return;

        const status = cleanDisplayValue(row[m.STATUS]);
        const etiqueta = cleanDisplayValue(row[m.ETIQUETA]);
        const conta = cleanDisplayValue(row[m.CONTA]);
        const pkNorm = normalizeKey(etiqueta);
        
        const isAtivo = status.includes('ATIVO');
        const isBaixado = status.includes('BAIXADO');

        if (isBaixado) {
          if (conta.includes('131105001') || conta.includes('131105002')) { purgedCount++; return; }
          if (!etiqueta) { purgedCount++; return; }
          if (activeTagsGlobal.has(pkNorm)) { purgedCount++; return; }
        }

        const asset: Asset = { id: `gbr_v23_${idx}_${Date.now()}` };
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

        asset._plaquetaMaster = asset.ETIQUETA || "S/ ETQ";
        asset._localMaster = asset.ENDERECO;
        asset._descricaoMaster = asset.DESCRICAODOATIVO || "SEM DESCRICAO";
        asset._empresaNormalizada = asset.EMPRESA;
        asset._baseSinteticaLoc = Array.from(baseSinteticaLoc);

        finalAssets.push(asset);
        companyCounts[asset.EMPRESA] = (companyCounts[asset.EMPRESA] || 0) + 1;
      });

      rawExtractedAssetsRef.current = finalAssets;
      
      const companiesList = Object.keys(companyCounts).sort().map(name => ({
        name,
        count: companyCounts[name]
      }));
      
      setAvailableCompanies(companiesList);
      setSelectedCompanies(new Set(companiesList.map(c => c.name))); // Default: seleciona tudo
      setStep('COMPANY_SELECTION');
      setLoading(false);
    } catch (err: any) {
      setError(`Erro Schema v23: ${err.message}`);
      setLoading(false);
    }
  };

  const finalizeLoading = () => {
    const filteredAssets = rawExtractedAssetsRef.current.filter(a => selectedCompanies.has(a.EMPRESA || "GERAL"));
    
    // Calcula estatísticas finais para o summary
    const counts = new Map<string, number>();
    filteredAssets.forEach(a => { if(a.ETIQUETA) counts.set(normalizeKey(a.ETIQUETA), (counts.get(normalizeKey(a.ETIQUETA)) || 0) + 1); });
    
    filteredAssets.forEach(a => {
      if (!a.ETIQUETA) a.TAG_DUPLICIDADE = 'SEM IDENTIFICAÇÃO';
      else a.TAG_DUPLICIDADE = (counts.get(normalizeKey(a.ETIQUETA)) || 0) > 1 ? 'DUPLICIDADE INTERNA' : 'ÚNICO';
    });

    const companyStats: Record<string, number> = {};
    filteredAssets.forEach(i => { companyStats[i.EMPRESA!] = (companyStats[i.EMPRESA!] || 0) + 1; });

    const baseSinteticaLoc = new Set<string>();
    filteredAssets.forEach(a => { if(a.ENDERECO) baseSinteticaLoc.add(a.ENDERECO.toUpperCase().trim()); });

    setSummary({
      rows: filteredAssets.length,
      purgedRows: rawExtractedAssetsRef.current.length - filteredAssets.length, // Agora purga também as não selecionadas
      originalRows: rawExtractedAssetsRef.current.length,
      cols: 16, // Padrão GBR v23
      companies: companyStats,
      headers: [], 
      withPlaqueta: filteredAssets.filter(a => !!a.ETIQUETA).length,
      locationsMasterCount: baseSinteticaLoc.size
    });

    rawExtractedAssetsRef.current = filteredAssets; // Mantém apenas o que foi filtrado
    setStep('SUMMARY');
  };

  const toggleCompany = (name: string) => {
    const newSelection = new Set(selectedCompanies);
    if (newSelection.has(name)) newSelection.delete(name);
    else newSelection.add(name);
    setSelectedCompanies(newSelection);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onload = (ev) => processFile(ev.target?.result);
      r.readAsArrayBuffer(f);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn w-full overflow-hidden">
      <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 bg-slate-800 rounded-xl text-slate-500 active:scale-90"><ArrowLeft size={18} /></button>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest italic">Protocolo v23</h2>
            <p className="text-indigo-400 text-[7px] font-black uppercase tracking-[0.2em] mt-0.5">High-Density Asset Mapping</p>
          </div>
        </div>
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Activity size={20} /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar pb-24">
        {step === 'SOURCE' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
               <span className="text-[8px] font-black uppercase tracking-[0.3em] text-indigo-500">Configuração de Tabela v23</span>
               <h3 className="text-lg font-black uppercase text-white tracking-tighter mt-1 mb-2">Mapeamento Dinâmico</h3>
               <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-widest">
                Importação otimizada para campos: Empresa, Status, Etiqueta, QT, Descrição, Endereço e Auditoria.
               </p>
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-slate-900/40 p-10 rounded-3xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center space-y-4 active:scale-[0.98] transition-all">
              <div className="w-14 h-14 bg-slate-800 text-indigo-400 rounded-2xl flex items-center justify-center border border-slate-700 shadow-xl"><FileSpreadsheet size={28} /></div>
              <div className="text-center">
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest">Carregar Base GBR v23</h3>
                <p className="text-[7px] font-black text-slate-600 uppercase mt-1 tracking-widest">Excel / CSV Autodetect</p>
              </div>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          </div>
        )}

        {step === 'LOADING' && (
          <div className="py-32 flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="text-indigo-500 animate-spin" size={64} strokeWidth={2.5} />
            <div>
                <p className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Analisando Metadados...</p>
                <p className="text-[7px] font-bold text-slate-600 uppercase mt-2 tracking-widest italic">Construindo Hierarquia de Unidades</p>
            </div>
          </div>
        )}

        {step === 'COMPANY_SELECTION' && (
          <div className="space-y-6 animate-slideUp">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
               <div className="flex items-center justify-between mb-4">
                  <span className="text-[8px] font-black uppercase text-indigo-500 tracking-[0.3em]">Seleção de Unidades</span>
                  <div className="flex space-x-2">
                    <button onClick={() => setSelectedCompanies(new Set(availableCompanies.map(c => c.name)))} className="text-[8px] font-black text-slate-400 uppercase tracking-widest border border-slate-800 px-2 py-1 rounded-lg">Todos</button>
                    <button onClick={() => setSelectedCompanies(new Set())} className="text-[8px] font-black text-slate-400 uppercase tracking-widest border border-slate-800 px-2 py-1 rounded-lg">Nenhum</button>
                  </div>
               </div>
               <h3 className="text-lg font-black uppercase text-white tracking-tighter mb-4">Quais empresas carregar?</h3>
               
               <div className="space-y-2 max-h-[40vh] overflow-y-auto no-scrollbar pr-1">
                  {availableCompanies.map(comp => {
                    const isSelected = selectedCompanies.has(comp.name);
                    return (
                      <button 
                        key={comp.name} 
                        onClick={() => toggleCompany(comp.name)}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${isSelected ? 'bg-indigo-600/10 border-indigo-500/50 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}
                      >
                        <div className="flex items-center space-x-3">
                          {isSelected ? <CheckSquare size={18} className="text-indigo-500" /> : <Square size={18} />}
                          <div className="text-left">
                            <span className="text-[10px] font-black uppercase tracking-tight block">{comp.name}</span>
                            <span className="text-[8px] font-bold opacity-50 uppercase tracking-widest">{comp.count} Ativos</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
               </div>
            </div>

            <div className="bg-indigo-950/20 border border-indigo-500/10 p-4 rounded-2xl flex items-center space-x-3">
               <Filter size={16} className="text-indigo-400" />
               <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                Selecionado: <span className="text-white font-black">{selectedCompanies.size}</span> Unidades. Ativos das demais unidades serão ignorados para otimizar o sistema.
               </p>
            </div>

            <button 
              disabled={selectedCompanies.size === 0}
              onClick={finalizeLoading} 
              className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 disabled:opacity-30 transition-all flex items-center justify-center space-x-3"
            >
              <span>PROCESSAR SELEÇÃO</span> <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-5 animate-slideUp">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
               <span className="text-[8px] font-black uppercase text-emerald-500 tracking-[0.3em]">Carga de Dados Finalizada</span>
               <div className="flex items-baseline space-x-2 mt-2">
                  <h3 className="text-4xl font-black font-mono tracking-tighter text-white">{summary.rows}</h3>
                  <span className="text-[9px] font-black text-slate-600 uppercase">Itens Carregados</span>
               </div>
               
               <div className="mt-6 space-y-3">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <Building2 size={14} className="text-indigo-400" />
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Unidades Ativas</span>
                    </div>
                    <span className="text-[12px] font-black text-indigo-400">{Object.keys(summary.companies).length}</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <MapPin size={14} className="text-indigo-400" />
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Endereços (LOC_SINT)</span>
                    </div>
                    <span className="text-[12px] font-black text-indigo-400">{summary.locationsMasterCount}</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Etiquetas Válidas</span>
                    </div>
                    <span className="text-[12px] font-black text-emerald-400">{summary.withPlaqueta}</span>
                  </div>
               </div>
            </div>
            <button onClick={() => onDataLoaded(rawExtractedAssetsRef.current, Object.keys(summary.companies).sort())} className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-3">
              <span>EFETIVAR BASE DE DADOS</span> <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
