
import React, { useState, useRef } from 'react';
import { 
  Loader2, 
  AlertCircle,
  HardDrive,
  BarChart3,
  Building2,
  ArrowRight,
  ChevronRight,
  ArrowLeft,
  X,
  Database,
  TableProperties,
  ShieldCheck,
  Info,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface LoadSummary {
  rows: number;
  cols: number;
  companies: Record<string, number>;
  status: Record<string, number>;
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

  const processFile = async (dataBuffer: any) => {
    try {
      setStep('LOADING');
      setLoading(true);
      setError(null);
      
      const wb = XLSX.read(dataBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

      if (!rows || rows.length < 2) throw new Error("Planilha vazia ou formato inválido.");

      let headerRowIndex = 0;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].some(c => String(c).trim() !== "")) {
          headerRowIndex = i;
          break;
        }
      }

      const rawHeaders = rows[headerRowIndex].map(h => String(h).trim());
      const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));

      const mapping = {
        PLAQUETA: normalizedHeaders.findIndex(h => h.match(/PLAQUETA|PATRIMONIO|TAG|COD_BEM|REGISTRO/)),
        EMPRESA: normalizedHeaders.findIndex(h => h.match(/EMPRESA|UNIDADE|RAZAO/)),
        DESCRICAO: normalizedHeaders.findIndex(h => h.match(/DESCRICAO_DO_ATIVO_IMOBILIZADO|DESCRICAO_DO_ATIVO_INTANGIVEL|DESCRICAO|DESC_SINTETICA/))
      };

      const companyStats: Record<string, number> = {};
      const assetData = rows.slice(headerRowIndex + 1)
        .filter(row => row.some(c => String(c).trim() !== ""))
        .map((row, idx) => {
          const item: any = { id: `db_${Date.now()}_${idx}` };
          normalizedHeaders.forEach((header, colIdx) => {
            item[header] = row[colIdx] !== undefined ? String(row[colIdx]).toUpperCase().trim() : "";
          });

          const empresa = mapping.EMPRESA !== -1 ? item[normalizedHeaders[mapping.EMPRESA]] : "GERAL";
          companyStats[empresa] = (companyStats[empresa] || 0) + 1;

          return { ...item, _empresaNormalizada: empresa, _conferido: false, TAG_INVENTARIO: "PENDENTE" };
        });

      processedDataRef.current = assetData;
      processedCompaniesRef.current = Object.keys(companyStats).sort();

      setSummary({
        rows: assetData.length,
        cols: normalizedHeaders.length,
        companies: companyStats,
        status: {},
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

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fadeIn w-full overflow-hidden">
      <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg"><ArrowLeft size={16} className="text-gray-400"/></button>
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase leading-none tracking-tight">Carga Expert</h2>
            <p className="text-emerald-500 text-[6px] font-black uppercase tracking-widest mt-0.5">Base Local Ativa</p>
          </div>
        </div>
        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white"><Database size={16} /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {step === 'SOURCE' && (
          <div className="space-y-4">
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white p-6 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center space-y-3 active:scale-95 transition-all">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><HardDrive size={24} /></div>
              <div className="text-center">
                <h3 className="text-xs font-black text-slate-900 uppercase">Selecionar Planilha</h3>
                <p className="text-[7px] font-bold text-gray-400 uppercase mt-0.5">.XLSX OU .XLS</p>
              </div>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
          </div>
        )}

        {step === 'LOADING' && (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="text-blue-600 animate-spin" size={32} strokeWidth={3} />
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Processando...</p>
          </div>
        )}

        {step === 'SUMMARY' && summary && (
          <div className="space-y-3 animate-slideUp">
            <div className="bg-slate-900 p-5 rounded-3xl text-white shadow-xl">
               <span className="text-[7px] font-black uppercase text-emerald-400 block mb-1">Carga Concluída</span>
               <h3 className="text-3xl font-black italic tracking-tighter">{summary.rows}</h3>
               <p className="text-[8px] font-bold text-slate-400 uppercase">Ativos Detectados</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm max-h-[300px] overflow-y-auto no-scrollbar">
              <h4 className="text-[8px] font-black text-slate-900 uppercase mb-3 flex items-center"><ChevronRight size={10} className="mr-1 text-blue-500"/> Unidades</h4>
              {Object.entries(summary.companies).map(([name, count]) => (
                <div key={name} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-[8px] font-black uppercase text-gray-600 truncate max-w-[140px]">{name}</span>
                  <span className="text-[8px] font-black text-blue-600">{count}</span>
                </div>
              ))}
            </div>
            <button onClick={() => onDataLoaded(processedDataRef.current, processedCompaniesRef.current)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center space-x-2">
              <span>Finalizar Carga</span> <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseLoader;
