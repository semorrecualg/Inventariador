
import React, { useState, useRef, useMemo } from 'react';
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
    const baixadoTerms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA'];
    for (const term of baixadoTerms) {
      const val = String(item[term] || '').trim();
      if (val !== "" && val !== "---") return true;
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
        PLAQUETA: normalizedHeaders.findIndex(h => h.match(/PLAQUETA|PATRIMONIO|TAG|COD_BEM|REGISTRO/)),
        EMPRESA: normalizedHeaders.findIndex(h => h.match(/EMPRESA|UNIDADE|RAZAO/)),
      };

      // 1. Extração Inicial
      const initialAssets = rawRows.slice(headerRowIndex + 1)
        .filter(row => row.some(c => String(c).trim() !== ""))
        .map((row, idx) => {
          const item: any = { id: `db_${Date.now()}_${idx}` };
          normalizedHeaders.forEach((header, colIdx) => {
            item[header] = row[colIdx] !== undefined ? String(row[colIdx]).toUpperCase().trim() : "";
          });
          const empresa = mapping.EMPRESA !== -1 ? item[normalizedHeaders[mapping.EMPRESA]] : "GERAL";
          item._empresaNormalizada = empresa;
          return item;
        });

      // 2. Lógica de Depuração Expert (Integrity Rules)
      const plaquetaHeader = mapping.PLAQUETA !== -1 ? normalizedHeaders[mapping.PLAQUETA] : null;
      let finalAssets: any[] = [];
      let conflictsCount = 0;

      if (plaquetaHeader) {
        const groups = new Map<string, any[]>();
        initialAssets.forEach(item => {
          const p = String(item[plaquetaHeader] || '').trim();
          if (!groups.has(p)) groups.set(p, []);
          groups.get(p)!.push(item);
        });

        groups.forEach((items) => {
          const actives = items.filter(i => !isBaixado(i));
          const baixados = items.filter(i => isBaixado(i));

          if (actives.length > 0) {
            // Regra: Se existe Ativo e Baixado, elimina os baixados
            finalAssets.push(...actives);
            if (baixados.length > 0) conflictsCount += baixados.length;
          } else {
            // Regra: Se só existe Baixado, mantém na carga
            finalAssets.push(...baixados);
          }
        });
      } else {
        finalAssets = initialAssets;
      }

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
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const icons = [Factory, Warehouse, Landmark, Building];
    const IconComponent = icons[hash % icons.length];
    return <IconComponent size={14} />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fadeIn w-full overflow-hidden">
      {/* Header Profissional */}
      <div className="p-6 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm relative z-20">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2.5 hover:bg-gray-100 rounded-xl transition-all active:scale-90 text-gray-400">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase leading-none tracking-tighter italic">Carga Expert</h2>
            <div className="flex items-center space-x-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <p className="text-emerald-600 text-[7px] font-black uppercase tracking-[0.2em]">Base Local Ativa • Integrity Engine</p>
            </div>
          </div>
        </div>
        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
          <Database size={24} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        {step === 'SOURCE' && (
          <div className="space-y-6">
            <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
               <div className="relative z-10">
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60">Engine de Sincronização</span>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mt-1 mb-4">Novo Projeto de Carga</h3>
                  <p className="text-[10px] font-bold opacity-80 leading-relaxed uppercase tracking-widest max-w-[200px]">Carregue o Excel Master para depuração técnica automática.</p>
               </div>
               <Layers className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform" size={120} />
            </div>

            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="w-full bg-white p-12 rounded-[3.5rem] border-4 border-dashed border-blue-100 flex flex-col items-center justify-center space-y-4 active:scale-[0.98] transition-all hover:bg-blue-50/30"
            >
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2.2rem] flex items-center justify-center shadow-inner">
                <FileSpreadsheet size={40} />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Localizar Arquivo Master</h3>
                <p className="text-[8px] font-black text-gray-300 uppercase mt-1 tracking-widest">Formatos Suportados: XLSX, XLS, CSV</p>
              </div>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          </div>
        )}

        {step === 'LOADING' && (
          <div className="py-32 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <Loader2 className="text-blue-600 animate-spin" size={64} strokeWidth={3} />
              <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-200" size={24} />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] mb-1">Processando Integrity Rules</p>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Eliminando duplicidades de itens baixados...</p>
            </div>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-6 animate-slideUp">
            {/* Card Volumetria Master */}
            <div className="bg-slate-950 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
               <div className="flex items-center justify-between mb-4">
                 <span className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.3em]">Carga Concluída</span>
                 <ShieldCheck size={20} className="text-emerald-500" />
               </div>
               <h3 className="text-7xl font-black font-mono tracking-tighter leading-none mb-3 italic">{summary.rows}</h3>
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Ativos Detectados e Validados</p>
               
               {/* Regra de Integridade Aplicada */}
               <div className="flex items-center space-x-3 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md">
                 <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
                    <FilterX size={20} />
                 </div>
                 <div>
                    <span className="text-[8px] font-black text-gray-400 uppercase block leading-none mb-1">Conflitos de Integridade</span>
                    <span className="text-xs font-black text-white uppercase">{summary.conflictsResolved} Duplicidades de Baixa Eliminadas</span>
                 </div>
               </div>

               <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none scale-150">
                  <Database size={120} />
               </div>
            </div>

            {/* Grid Detalhado de Unidades */}
            <div className="bg-white rounded-[3rem] p-8 border border-gray-100 shadow-xl shadow-slate-100">
              <div className="flex items-center justify-between mb-8 px-2">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center">
                  <BarChart3 size={16} className="mr-2 text-blue-600"/> 
                  Unidades Identificadas
                </h4>
                <div className="flex items-center space-x-1.5">
                   <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                   <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">{Object.keys(summary.companies).length} Filiais</span>
                </div>
              </div>
              
              <div className="space-y-6">
                {Object.entries(summary.companies).map(([name, count]) => {
                  const percentage = Math.round((Number(count) / summary.rows) * 100);
                  return (
                    <div key={name} className="group relative">
                      <div className="flex justify-between items-end mb-2.5">
                        <div className="flex items-center space-x-4 min-w-0 pr-4">
                          <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-200 transition-all">
                            {getCompanyIcon(name)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[13px] font-black uppercase text-slate-900 truncate block tracking-tighter leading-none mb-1.5">{name}</span>
                            <div className="flex items-center space-x-1.5">
                               <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Densidade: {percentage}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[16px] font-black text-blue-600 font-mono tracking-tighter">{count}</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100/50 p-[1px]">
                        <div 
                          className="h-full bg-blue-600 rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(37,99,235,0.4)]" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Call to Action Final */}
            <button 
              onClick={() => onDataLoaded(processedDataRef.current, processedCompaniesRef.current)} 
              className="w-full bg-blue-600 text-white py-7 rounded-[2.5rem] font-black uppercase text-[12px] tracking-[0.3em] shadow-2xl shadow-blue-200 flex items-center justify-center space-x-4 active:scale-95 transition-all group border-t-2 border-white/20"
            >
              <span>Finalizar Carga Expert</span> 
              <ArrowRight size={22} className="group-hover:translate-x-1.5 transition-transform" />
            </button>
            
            <div className="flex flex-col items-center opacity-30">
               <ShieldAlert size={16} className="mb-2 text-slate-400" />
               <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.5em] italic">Commit Protocol GBR v2.1 • Security Enabled</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
