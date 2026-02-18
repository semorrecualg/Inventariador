
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
  CheckCircle2
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
  const [step, setStep] = useState<'SOURCE' | 'LOADING' | 'SUMMARY'>('SOURCE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LoadSummary | null>(null);
  
  const processedDataRef = useRef<Asset[]>([]);
  const processedCompaniesRef = useRef<string[]>([]);
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

  const findBestColumnV23 = (headers: string[], keywords: string[]) => {
    let bestIdx = -1;
    let maxScore = -1;
    headers.forEach((h, idx) => {
      // Fix: Declare score variable locally for each header
      let score = 0;
      const normH = String(h || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, '').trim();
      keywords.forEach(kw => {
        const normKw = kw.toUpperCase().replace(/[^A-Z]/g, '');
        if (normH === normKw) score += 1000;
        else if (normH.includes(normKw)) score += 100;
      });
      // Fix: Update maxScore and bestIdx if a better match is found
      if (score > maxScore && score > 0) {
        maxScore = score;
        bestIdx = idx;
      }
    });
    // Fallback manual para o schema v23 específico
    return bestIdx;
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
      
      // Mapeamento Estrito Schema v23
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

      // BASE_SINTETICA_LOC
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

      rawRows.slice(headerIdx + 1).forEach((row, idx) => {
        if (!row.some(c => String(c).trim() !== "")) return;

        const status = cleanDisplayValue(row[m.STATUS]);
        const etiqueta = cleanDisplayValue(row[m.ETIQUETA]);
        const conta = cleanDisplayValue(row[m.CONTA]);
        const pkNorm = normalizeKey(etiqueta);
        
        const isAtivo = status.includes('ATIVO');
        const isBaixado = status.includes('BAIXADO');

        // Lógica de Higiene v23
        if (isBaixado) {
          if (conta.includes('131105001') || conta.includes('131105002')) { purgedCount++; return; }
          if (!etiqueta) { purgedCount++; return; }
          if (activeTagsGlobal.has(pkNorm)) { purgedCount++; return; }
        }

        const asset: Asset = { id: `gbr_v23_${idx}_${Date.now()}` };
        
        // Atribuição de Colunas Mestre
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

        // Mapeamento de Controle GBR
        asset._plaquetaMaster = asset.ETIQUETA || "S/ ETQ";
        asset._localMaster = asset.ENDERECO;
        asset._descricaoMaster = asset.DESCRICAODOATIVO || "SEM DESCRICAO";
        asset._empresaNormalizada = asset.EMPRESA;
        asset._baseSinteticaLoc = Array.from(baseSinteticaLoc);

        finalAssets.push(asset);
      });

      const counts = new Map<string, number>();
      finalAssets.forEach(a => { if(a.ETIQUETA) counts.set(normalizeKey(a.ETIQUETA), (counts.get(normalizeKey(a.ETIQUETA)) || 0) + 1); });
      
      finalAssets.forEach(a => {
        if (!a.ETIQUETA) a.TAG_DUPLICIDADE = 'SEM IDENTIFICAÇÃO';
        else a.TAG_DUPLICIDADE = (counts.get(normalizeKey(a.ETIQUETA)) || 0) > 1 ? 'DUPLICIDADE INTERNA' : 'ÚNICO';
      });

      const companyStats: Record<string, number> = {};
      finalAssets.forEach(i => { companyStats[i.EMPRESA!] = (companyStats[i.EMPRESA!] || 0) + 1; });

      processedDataRef.current = finalAssets;
      processedCompaniesRef.current = Object.keys(companyStats).sort();

      setSummary({
        rows: finalAssets.length,
        purgedRows: purgedCount,
        originalRows: rawRows.length - (headerIdx + 1),
        cols: rawHeaders.length,
        companies: companyStats,
        headers: rawHeaders,
        withPlaqueta: finalAssets.filter(a => !!a.ETIQUETA).length,
        locationsMasterCount: baseSinteticaLoc.size
      });

      setStep('SUMMARY');
      setLoading(false);
    } catch (err: any) {
      setError(`Erro Schema v23: ${err.message}`);
      setLoading(false);
    }
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
                <p className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Indexando Ativos v23...</p>
                <p className="text-[7px] font-bold text-slate-600 uppercase mt-2 tracking-widest italic">Construindo BASE_SINTETICA_LOC</p>
            </div>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-5 animate-slideUp">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
               <span className="text-[8px] font-black uppercase text-emerald-500 tracking-[0.3em]">Carga de Dados Finalizada</span>
               <div className="flex items-baseline space-x-2 mt-2">
                  <h3 className="text-4xl font-black font-mono tracking-tighter text-white">{summary.rows}</h3>
                  <span className="text-[9px] font-black text-slate-600 uppercase">Itens Únicos</span>
               </div>
               
               <div className="mt-6 space-y-3">
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
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <Trash2 size={14} className="text-red-500" />
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Registros Expurgados</span>
                    </div>
                    <span className="text-[12px] font-black text-red-500">-{summary.purgedRows}</span>
                  </div>
               </div>
            </div>
            <button onClick={() => onDataLoaded(processedDataRef.current, processedCompaniesRef.current)} className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-3">
              <span>EFETIVAR BASE DE DADOS</span> <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
