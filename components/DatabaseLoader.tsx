
import React, { useState, useRef } from 'react';
import { 
  Loader2, 
  ArrowRight, 
  ArrowLeft, 
  FileSpreadsheet, 
  CheckCircle2, 
  Activity,
  Trash2,
  Filter,
  ShieldCheck,
  Zap
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
    if (upper === "" || upper === "NULL" || upper === "0" || upper.includes("#N/D") || upper.includes("#REF") || upper.includes("#VALOR")) return "";
    return s.toUpperCase();
  };

  const findBestColumnV20 = (headers: string[], dataRows: any[][], keywords: string[]) => {
    let bestIdx = -1;
    let maxScore = -1;
    headers.forEach((h, idx) => {
      const normH = String(h || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      let score = 0;
      keywords.forEach(kw => {
        if (normH === kw.toUpperCase()) score += 1000;
        else if (normH.includes(kw.toUpperCase())) score += 100;
      });
      if (score > maxScore) { maxScore = score; bestIdx = idx; }
    });
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
      for (let i = 0; i < Math.min(rawRows.length, 60); i++) {
        const rowStr = rawRows[i].join('|').toUpperCase();
        if (['PLAQUETA', 'PATRIMONIO', 'ETIQUETA', 'STATUS', 'CONTA', 'SITUACAO'].some(t => rowStr.includes(t))) {
          headerIdx = i; break;
        }
      }

      const rawHeaders = rawRows[headerIdx].map(h => String(h || '').trim());
      const sampleData = rawRows.slice(headerIdx + 1, headerIdx + 301);

      const mapping = {
        PLAQUETA: findBestColumnV20(rawHeaders, sampleData, ['ETIQUETA', 'PLAQUETA', 'PATRIMONIO', 'TAG']),
        EMPRESA: findBestColumnV20(rawHeaders, sampleData, ['EMPRESA', 'UNIDADE', 'ESTAB']),
        LOCAL: findBestColumnV20(rawHeaders, sampleData, ['LOCALIZACAO FISICA', 'ENDERECO FISICO', 'SETOR']),
        DESC: findBestColumnV20(rawHeaders, sampleData, ['DESCRICAO', 'ITEM', 'NOME']),
        STATUS: findBestColumnV20(rawHeaders, sampleData, ['STATUS', 'SITUACAO', 'ESTADO']),
        CONTA: findBestColumnV20(rawHeaders, sampleData, ['CONTA_CONTABIL', 'CONTA', 'CONTABIL', 'COD_CONTA']),
      };

      // 1. SCAN GLOBAL DE VITALIDADE (Mapear etiquetas Ativas)
      const activeTagsGlobal = new Set<string>();
      if (mapping.PLAQUETA !== -1 && mapping.STATUS !== -1) {
        rawRows.slice(headerIdx + 1).forEach(row => {
          const s = cleanDisplayValue(row[mapping.STATUS]);
          const p = cleanDisplayValue(row[mapping.PLAQUETA]);
          if (s.includes('ATIVO') && p && p !== "0") {
            activeTagsGlobal.add(normalizeKey(p));
          }
        });
      }

      let totalPurged = 0;
      const filteredRows = rawRows.slice(headerIdx + 1).filter(row => {
        if (!row.some(c => String(c).trim() !== "")) return false;

        const status = mapping.STATUS !== -1 ? cleanDisplayValue(row[mapping.STATUS]) : '';
        const conta = mapping.CONTA !== -1 ? cleanDisplayValue(row[mapping.CONTA]) : '';
        const plaqueta = mapping.PLAQUETA !== -1 ? cleanDisplayValue(row[mapping.PLAQUETA]) : '';
        const pkNorm = normalizeKey(plaqueta);
        
        const isAtivo = status.includes('ATIVO');
        const isBaixado = status.includes('BAIXADO');

        // REGRA FUNDAMENTAL A: Registro ATIVO nunca é eliminado
        if (isAtivo) return true;

        // REGRA FUNDAMENTAL B: Tratamento de registros BAIXADOS
        if (isBaixado) {
          // b.1: Conta Contábil bloqueada
          if (conta.includes('131105001') || conta.includes('131105002')) {
            totalPurged++; return false;
          }

          // b.2: Sem Etiqueta
          if (!plaqueta || plaqueta === "" || plaqueta === "0") {
            totalPurged++; return false;
          }

          // b.3.1: Existe um ATIVO correspondente para esta etiqueta?
          if (activeTagsGlobal.has(pkNorm)) {
            totalPurged++; return false;
          }

          // b.3.2: NÃO existe nenhum ATIVO para esta etiqueta? -> PRESERVAR (retorna true abaixo)
        }

        return true;
      });

      // 2. MAPEAMENTO FINAL V20
      const finalAssets: Asset[] = filteredRows.map((row, idx) => {
        const item: Asset = { id: `v20_${idx}_${Date.now()}` };
        rawHeaders.forEach((h, i) => { 
          if (h) {
            const val = cleanDisplayValue(row[i]);
            item[h.toUpperCase().replace(/\s/g, '_')] = val;
            // Garantia extra de mapeamento para o Dashboard encontrar os campos dinamicamente
            if (i === mapping.STATUS) item.STATUS = val;
            if (i === mapping.CONTA) item.CONTA_CONTABIL = val;
          }
        });

        const p = mapping.PLAQUETA !== -1 ? cleanDisplayValue(row[mapping.PLAQUETA]) : '';
        const loc = mapping.LOCAL !== -1 ? cleanDisplayValue(row[mapping.LOCAL]) : '';
        const emp = mapping.EMPRESA !== -1 ? cleanDisplayValue(row[mapping.EMPRESA]) : 'GERAL';
        const desc = mapping.DESC !== -1 ? cleanDisplayValue(row[mapping.DESC]) : 'SEM DESCRIÇÃO';

        item.PLAQUETA = p;
        item._plaquetaMaster = p || "S/ PLACA";
        item._hasPlaqueta = p !== "" && p !== "0" && p !== "S/ PLACA";
        item._localMaster = loc || "SETOR NÃO CADASTRADO";
        item._empresaNormalizada = emp;
        item._descricaoMaster = desc;
        item._empresaCleanKey = normalizeKey(emp);
        item._plaquetaCleanKey = normalizeKey(p);
        
        return item;
      });

      // 3. TAGS DE DUPLICIDADE (Dashboard)
      const counts = new Map<string, number>();
      finalAssets.forEach(a => { if(a._hasPlaqueta) counts.set(a._plaquetaCleanKey!, (counts.get(a._plaquetaCleanKey!) || 0) + 1); });
      
      let withPlaquetaCount = 0;
      finalAssets.forEach(a => {
        if (!a._hasPlaqueta) { a.TAG_DUPLICIDADE = 'SEM IDENTIFICAÇÃO'; return; }
        withPlaquetaCount++;
        a.TAG_DUPLICIDADE = (counts.get(a._plaquetaCleanKey!) || 0) > 1 ? 'DUPLICIDADE INTERNA' : 'ÚNICO';
      });

      const stats: Record<string, number> = {};
      finalAssets.forEach(i => { stats[i._empresaNormalizada!] = (stats[i._empresaNormalizada!] || 0) + 1; });

      processedDataRef.current = finalAssets;
      processedCompaniesRef.current = Object.keys(stats).sort();

      setSummary({
        rows: finalAssets.length,
        purgedRows: totalPurged,
        originalRows: rawRows.length - (headerIdx + 1),
        cols: rawHeaders.length,
        companies: stats,
        headers: rawHeaders,
        withPlaqueta: withPlaquetaCount
      });

      setStep('SUMMARY');
      setLoading(false);
    } catch (err: any) {
      setError(`Erro no Motor v20: ${err.message}`);
      setStep('SOURCE');
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
            <h2 className="text-sm font-black text-white uppercase tracking-widest italic">Motor Auditor v20</h2>
            <p className="text-indigo-400 text-[7px] font-black uppercase tracking-[0.2em] mt-0.5">Hygiene & Analytics Active</p>
          </div>
        </div>
        <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-emerald-400 shadow-lg"><Activity size={20} /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        {step === 'SOURCE' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
               <span className="text-[8px] font-black uppercase tracking-[0.3em] text-indigo-500">Regras de Vitalidade v20</span>
               <h3 className="text-lg font-black uppercase text-white tracking-tighter mt-1 mb-2">Higienização Precision</h3>
               <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-widest">
                Preservação 100% de registros ATIVOS. Limpeza cirúrgica de BAIXADOS conforme protocolo Expert GBR.
               </p>
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-slate-900/40 p-10 rounded-3xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center space-y-4 active:scale-[0.98] transition-all">
              <div className="w-14 h-14 bg-slate-800 text-indigo-400 rounded-2xl flex items-center justify-center border border-slate-700 shadow-[0_0_20px_rgba(79,70,229,0.1)]"><FileSpreadsheet size={28} /></div>
              <div className="text-center">
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest">Iniciar Carga Expert</h3>
                <p className="text-[7px] font-black text-slate-600 uppercase mt-1 tracking-widest">Protocolo de Vitalidade Ativa</p>
              </div>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          </div>
        )}

        {step === 'LOADING' && (
          <div className="py-32 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
                <Loader2 className="text-indigo-500 animate-spin" size={64} strokeWidth={2.5} />
                <Filter className="text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Executando Higienização v20...</p>
                <p className="text-[7px] font-bold text-slate-600 uppercase mt-2 tracking-widest italic">Filtrando contas, etiquetas e vitalidade</p>
            </div>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-5 animate-slideUp">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
               <span className="text-[8px] font-black uppercase text-emerald-500 tracking-[0.3em]">Carga Otimizada v20 Concluída</span>
               <div className="flex items-baseline space-x-2 mt-2">
                  <h3 className="text-4xl font-black font-mono tracking-tighter text-white">{summary.rows}</h3>
                  <span className="text-[9px] font-black text-slate-600 uppercase">Patrimônios Reais</span>
               </div>
               
               <div className="mt-6 space-y-3">
                  <div className="bg-emerald-950/20 p-4 rounded-2xl border border-emerald-500/20 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Ativos Preservados</span>
                    </div>
                    <span className="text-[14px] font-black text-emerald-400">100% OK</span>
                  </div>

                  <div className="bg-red-950/20 p-4 rounded-2xl border border-red-500/20 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <Trash2 size={14} className="text-red-500" />
                        <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Baixados Expurgados</span>
                    </div>
                    <span className="text-[14px] font-black text-red-400">-{summary.purgedRows}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-1">C/ Etiqueta</span>
                      <span className="text-[14px] font-black text-indigo-400">{summary.withPlaqueta}</span>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-1">S/ Etiqueta</span>
                      <span className="text-[14px] font-black text-slate-200">{summary.rows - summary.withPlaqueta}</span>
                    </div>
                  </div>
               </div>
            </div>
            <button onClick={() => onDataLoaded(processedDataRef.current, processedCompaniesRef.current)} className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-3">
              <span>EFETIVAR BASE ANALYTICS</span> <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
