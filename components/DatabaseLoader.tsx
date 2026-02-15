
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
  ShieldAlert
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
      // Procura a chave ignorando case e normalizando
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

      // 1. Extração Inicial de todos os registros
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

      // 2. Lógica de Depuração Expert (Integrity Rules)
      const plaquetaHeader = mapping.PLAQUETA !== -1 ? normalizedHeaders[mapping.PLAQUETA] : null;
      let cleanedAssets: any[] = [];
      let conflictsCount = 0;

      if (plaquetaHeader) {
        const groups = new Map<string, any[]>();
        initialAssets.forEach(item => {
          // Normaliza plaqueta para 6 dígitos para garantir agrupamento correto
          const p = String(item[plaquetaHeader] || '').trim().padStart(6, '0');
          if (!groups.has(p)) groups.set(p, []);
          groups.get(p)!.push(item);
        });

        groups.forEach((items) => {
          const actives = items.filter(i => !isBaixado(i));
          const baixados = items.filter(i => isBaixado(i));

          if (actives.length > 0) {
            // REGRA: Se existe registro Ativo, elimina TODOS os baixados daquela plaqueta
            cleanedAssets.push(...actives);
            if (baixados.length > 0) conflictsCount += baixados.length;
          } else {
            // REGRA: Se só existem registros baixados, mantém todos eles (ou pelo menos um se forem duplicados)
            // Aqui mantemos todos os baixados originais, pois podem ser registros diferentes de baixa
            cleanedAssets.push(...baixados);
          }
        });
      } else {
        cleanedAssets = initialAssets;
      }

      // 3. Reorganização e Reindexação Total do Banco de Dados
      // Ordenamos para garantir consistência e então geramos novos IDs sequenciais
      const finalAssets = cleanedAssets
        .sort((a, b) => {
          const pA = String(a[plaquetaHeader!] || '').padStart(6, '0');
          const pB = String(b[plaquetaHeader!] || '').padStart(6, '0');
          return pA.localeCompare(pB, undefined, { numeric: true });
        })
        .map((item, index) => ({
          ...item,
          id: `clean_${index + 1}` // Reindexação total para evitar inconsistências
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
    return <IconComponent size={14} />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fadeIn w-full overflow-hidden">
      <div className="p-6 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm relative z-20">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2.5 hover:bg-gray-100 rounded-xl transition-all active:scale-90 text-gray-400">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase leading-none tracking-tighter italic">Carga Expert</h2>
            <div className="flex items-center space-x-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <p className="text-emerald-600 text-[7px] font-black uppercase tracking-[0.2em]">Depuração Rigorosa v3.0</p>
            </div>
          </div>
        </div>
        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
          <Database size={24} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start space-x-3 text-red-600 animate-fadeIn">
            <ShieldAlert className="shrink-0" size={18} />
            <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">{error}</p>
          </div>
        )}

        {step === 'SOURCE' && (
          <div className="space-y-6">
            <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
               <div className="relative z-10">
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60">Engine de Sincronização</span>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mt-1 mb-4">Master Data Import</h3>
                  <p className="text-[10px] font-bold opacity-80 leading-relaxed uppercase tracking-widest max-w-[220px]">Carregue o arquivo para depuração técnica e reindexação total.</p>
               </div>
               <Layers className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform" size={120} />
            </div>

            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="w-full bg-white p-12 rounded-[3.5rem] border-4 border-dashed border-indigo-100 flex flex-col items-center justify-center space-y-4 active:scale-[0.98] transition-all hover:bg-indigo-50/30"
            >
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[2.2rem] flex items-center justify-center shadow-inner">
                <FileSpreadsheet size={40} />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Localizar Master Excel</h3>
                <p className="text-[8px] font-black text-gray-300 uppercase mt-1 tracking-widest">A regra de Ativo vs Baixado será aplicada</p>
              </div>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          </div>
        )}

        {step === 'LOADING' && (
          <div className="py-32 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <Loader2 className="text-indigo-600 animate-spin" size={64} strokeWidth={3} />
              <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-200" size={24} />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] mb-1">Executando Reindexação</p>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Limpando conflitos de baixas e duplicidades...</p>
            </div>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-6 animate-slideUp">
            <div className="bg-slate-950 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
               <div className="flex items-center justify-between mb-4">
                 <span className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.3em]">Banco Reindexado</span>
                 <ShieldCheck size={20} className="text-emerald-500" />
               </div>
               <h3 className="text-7xl font-black font-mono tracking-tighter leading-none mb-3 italic">{summary.rows}</h3>
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Ativos Reindexados em Base Limpa</p>
               
               <div className="flex items-center space-x-3 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md">
                 <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
                    <FilterX size={20} />
                 </div>
                 <div>
                    <span className="text-[8px] font-black text-gray-400 uppercase block leading-none mb-1">Deduplicação Inteligente</span>
                    <span className="text-xs font-black text-white uppercase">{summary.conflictsResolved} Baixados Conflitantes Removidos</span>
                 </div>
               </div>
            </div>

            <div className="bg-white rounded-[3rem] p-8 border border-gray-100 shadow-xl">
              <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] mb-8 flex items-center px-2">
                <BarChart3 size={16} className="mr-2 text-indigo-600"/> 
                Distribuição por Unidade
              </h4>
              <div className="space-y-6">
                {Object.entries(summary.companies).map(([name, count]) => {
                  const percentage = Math.round((Number(count) / summary.rows) * 100);
                  return (
                    <div key={name} className="group">
                      <div className="flex justify-between items-end mb-2.5">
                        <div className="flex items-center space-x-4 min-w-0 pr-4">
                          <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            {getCompanyIcon(name)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[13px] font-black uppercase text-slate-900 truncate block tracking-tighter leading-none mb-1.5">{name}</span>
                          </div>
                        </div>
                        <span className="text-[16px] font-black text-indigo-600 font-mono tracking-tighter">{count}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100/50 p-[1px]">
                        <div 
                          className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out" 
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
              className="w-full bg-indigo-600 text-white py-7 rounded-[2.5rem] font-black uppercase text-[12px] tracking-[0.3em] shadow-2xl active:scale-95 transition-all group"
            >
              <span>Commit da Base Reindexada</span> 
              <ArrowRight size={22} className="inline ml-4 group-hover:translate-x-1.5 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
