
import React, { useState, useRef } from 'react';
import { 
  Loader2, 
  ArrowRight, 
  ArrowLeft, 
  Database, 
  ShieldCheck, 
  FileSpreadsheet, 
  Factory, 
  Warehouse, 
  Landmark, 
  Building, 
  Activity, 
  BarChart3, 
  Layers,
  FilterX,
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface LoadSummary {
  rows: number;
  originalRows: number;
  conflictsResolved: number;
  cols: number;
  companies: Record<string, number>;
  headers: string[];
}

interface DatabaseLoaderProps {
  onBack: () => void;
  onDataLoaded: (assets: any[], companies: string[]) => void;
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ onBack, onDataLoaded }) => {
  const [step, setStep] = useState<'SOURCE' | 'LOADING' | 'SUMMARY'>('SOURCE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LoadSummary | null>(null);
  
  const processedDataRef = useRef<any[]>([]);
  const processedCompaniesRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizeHeader = (h: string) => {
    return h.toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '_')
      .trim();
  };

  const isBaixado = (item: any) => {
    const baixadoTerms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA'];
    for (const term of baixadoTerms) {
      const matchKey = Object.keys(item).find(k => normalizeHeader(k) === term);
      if (matchKey) {
        const val = String(item[matchKey] || '').trim();
        if (val !== "" && val !== "---" && val !== "0" && val.toUpperCase() !== "NULL") return true;
      }
    }
    return false;
  };

  const processFile = async (dataBuffer: any) => {
    try {
      setStep('LOADING');
      setLoading(true);
      setError(null);
      
      const wb = XLSX.read(dataBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

      if (!rawRows || rawRows.length < 2) throw new Error("Planilha vazia ou formato inválido.");

      let headerRowIndex = 0;
      for (let i = 0; i < rawRows.length; i++) {
        if (rawRows[i].some(c => String(c).trim() !== "")) {
          headerRowIndex = i;
          break;
        }
      }

      const rawHeaders = rawRows[headerRowIndex].map(h => String(h).trim());
      const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));

      const mapping = {
        PLAQUETA: normalizedHeaders.findIndex(h => h.match(/PLAQUETA|PATRIMONIO|TAG|COD_BEM|REGISTRO|ETIQUETA/)),
        EMPRESA: normalizedHeaders.findIndex(h => h.match(/EMPRESA|UNIDADE|RAZAO/)),
      };

      const initialAssets = rawRows.slice(headerRowIndex + 1)
        .filter(row => row.some(c => String(c).trim() !== ""))
        .map((row) => {
          const item: any = {};
          normalizedHeaders.forEach((header, colIdx) => {
            item[header] = row[colIdx] !== undefined ? String(row[colIdx]).toUpperCase().trim() : "";
          });
          const empresa = mapping.EMPRESA !== -1 ? item[normalizedHeaders[mapping.EMPRESA]] : "GERAL";
          item._empresaNormalizada = empresa;
          return item;
        });

      const plaquetaHeader = mapping.PLAQUETA !== -1 ? normalizedHeaders[mapping.PLAQUETA] : null;
      let cleanedAssets: any[] = [];
      let conflictsCount = 0;

      if (plaquetaHeader) {
        const groups = new Map<string, any[]>();
        initialAssets.forEach(item => {
          const p = String(item[plaquetaHeader] || '').trim().padStart(6, '0');
          if (!groups.has(p)) groups.set(p, []);
          groups.get(p)!.push(item);
        });

        groups.forEach((items) => {
          const actives = items.filter(i => !isBaixado(i));
          const baixados = items.filter(i => isBaixado(i));

          if (actives.length > 0) {
            cleanedAssets.push(...actives);
            if (baixados.length > 0) conflictsCount += baixados.length;
          } else {
            cleanedAssets.push(...baixados);
          }
        });
      } else {
        cleanedAssets = initialAssets;
      }

      const finalAssets = cleanedAssets
        .sort((a, b) => {
          const pA = String(a[plaquetaHeader!] || '').padStart(6, '0');
          const pB = String(b[plaquetaHeader!] || '').padStart(6, '0');
          return pA.localeCompare(pB, undefined, { numeric: true });
        })
        .map((item, index) => ({
          ...item,
          id: `clean_${index + 1}`
        }));

      const companyStats: Record<string, number> = {};
      finalAssets.forEach(item => {
        const emp = item._empresaNormalizada;
        companyStats[emp] = (companyStats[emp] || 0) + 1;
      });

      processedDataRef.current = finalAssets;
      processedCompaniesRef.current = Object.keys(companyStats).sort();

      setSummary({
        rows: finalAssets.length,
        originalRows: initialAssets.length,
        conflictsResolved: conflictsCount,
        cols: normalizedHeaders.length,
        companies: companyStats,
        headers: normalizedHeaders
      });

      setStep('SUMMARY');
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setStep('SOURCE');
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => processFile(evt.target?.result);
      reader.readAsArrayBuffer(file);
    }
  };

  const getCompanyIcon = (name: string) => {
    const icons = [Factory, Warehouse, Landmark, Building];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const IconComponent = icons[hash % icons.length];
    return <IconComponent size={12} />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn w-full overflow-hidden">
      {/* Header Compacto */}
      <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between relative z-20">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 bg-slate-800 rounded-xl text-slate-500 active:scale-90 transition-all">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest italic">Carga Expert</h2>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
              <p className="text-emerald-500 text-[7px] font-black uppercase tracking-[0.2em]">Depuração v3.0</p>
            </div>
          </div>
        </div>
        <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-indigo-400">
          <Database size={20} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        {error && (
          <div className="mb-6 bg-red-950/20 border border-red-900/50 p-4 rounded-xl flex items-start space-x-3 text-red-500 animate-fadeIn">
            <ShieldAlert className="shrink-0" size={16} />
            <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">{error}</p>
          </div>
        )}

        {step === 'SOURCE' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
               <div className="relative z-10">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-indigo-500">Master Data Import</span>
                  <h3 className="text-lg font-black uppercase text-white tracking-tighter mt-1 mb-2">Sincronização de Base</h3>
                  <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-widest max-w-[200px]">Carregue o Excel mestre para depuração e reindexação total.</p>
               </div>
               <Layers className="absolute -right-4 -bottom-4 opacity-5" size={80} />
            </div>

            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="w-full bg-slate-900/40 p-10 rounded-3xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center space-y-4 active:scale-[0.98] transition-all hover:bg-slate-900"
            >
              <div className="w-14 h-14 bg-slate-800 text-indigo-400 rounded-2xl flex items-center justify-center border border-slate-700">
                <FileSpreadsheet size={28} />
              </div>
              <div className="text-center">
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest">Localizar Arquivo</h3>
                <p className="text-[7px] font-black text-slate-600 uppercase mt-1 tracking-widest">A regra Ativo vs Baixado será aplicada</p>
              </div>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          </div>
        )}

        {step === 'LOADING' && (
          <div className="py-32 flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <Loader2 className="text-indigo-600 animate-spin" size={48} strokeWidth={3} />
            </div>
            <div className="text-center">
              <p className="text-[9px] font-black text-white uppercase tracking-[0.3em] mb-1">Reindexando Dados</p>
              <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">Limpando conflitos de baixas...</p>
            </div>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-5 animate-slideUp">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
               <div className="flex items-center justify-between mb-4">
                 <span className="text-[8px] font-black uppercase text-emerald-500 tracking-[0.3em]">Banco Reindexado</span>
                 <ShieldCheck size={16} className="text-emerald-500" />
               </div>
               <div className="flex items-baseline space-x-2 mb-2">
                  <h3 className="text-4xl font-black font-mono tracking-tighter text-white">{summary.rows}</h3>
                  <span className="text-[9px] font-black text-slate-600 uppercase">Ativos Líquidos</span>
               </div>
               
               <div className="flex items-center space-x-3 bg-slate-950 p-3 rounded-2xl border border-slate-800 mt-4">
                 <div className="w-8 h-8 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center">
                    <FilterX size={16} />
                 </div>
                 <div>
                    <span className="text-[7px] font-black text-slate-500 uppercase block mb-0.5 tracking-widest">Deduplicação Inteligente</span>
                    <span className="text-[9px] font-black text-white uppercase">{summary.conflictsResolved} Conflitos Removidos</span>
                 </div>
               </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center">
                <BarChart3 size={14} className="mr-2 text-indigo-500"/> 
                Distribuição por Unidade
              </h4>
              <div className="space-y-5">
                {Object.entries(summary.companies).map(([name, count]) => {
                  const percentage = Math.round((Number(count) / summary.rows) * 100);
                  return (
                    <div key={name} className="group">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-8 h-8 bg-slate-950 text-slate-600 rounded-xl flex items-center justify-center border border-slate-800 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            {getCompanyIcon(name)}
                          </div>
                          <span className="text-[10px] font-black uppercase text-slate-300 truncate tracking-tight">{name}</span>
                        </div>
                        <span className="text-[12px] font-black text-indigo-400 font-mono tracking-tighter">{count}</span>
                      </div>
                      <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button 
              onClick={() => onDataLoaded(processedDataRef.current, processedCompaniesRef.current)} 
              className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-3 mt-4"
            >
              <span>INICIAR INVENTÁRIO</span> 
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Footer Minimalista */}
      <div className="p-6 text-center">
        <span className="text-[7px] font-black text-slate-800 uppercase tracking-[0.4em]">GBR Intelligence Protocol</span>
      </div>
    </div>
  );
};

export default DatabaseLoader;
