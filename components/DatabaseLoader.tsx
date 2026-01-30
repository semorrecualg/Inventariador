
import React, { useState } from 'react';
import { 
  Upload, 
  CheckCircle2, 
  Loader2, 
  Layers, 
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface DatabaseLoaderProps {
  onBack: () => void;
  onDataLoaded: (assets: any[], companies: string[]) => void;
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ onBack, onDataLoaded }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{rows: number, cos: number} | null>(null);

  const formatExcelDate = (serial: any) => {
    if (typeof serial !== 'number' || serial < 1 || serial > 100000) return serial;
    try {
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      return date.toLocaleDateString('pt-BR');
    } catch (e) {
      return serial;
    }
  };

  const processWorkbook = (dataBuffer: any) => {
    try {
      const wb = XLSX.read(dataBuffer, { type: 'array' });
      const assetSheetName = wb.SheetNames[0];
      const assetWs = wb.Sheets[assetSheetName];
      const assetRows = XLSX.utils.sheet_to_json(assetWs, { header: 1, defval: "" }) as any[][];

      if (!assetRows || assetRows.length === 0) throw new Error("Planilha de ativos inválida.");

      let assetHeaderIndex = -1;
      for (let i = 0; i < assetRows.length; i++) {
        if (assetRows[i].some(cell => String(cell).trim() !== "")) {
          assetHeaderIndex = i;
          break;
        }
      }

      const assetHeaders = assetRows[assetHeaderIndex].map((h, i) => String(h).trim() || `Col_${i + 1}`);
      const plaquetaTerms = ['PLAQUETA', 'PATRIMONIO', 'PATRIMÔNIO', 'REGISTRO', 'CODIGO', 'CÓDIGO', 'ETIQUETA', 'TAG', 'BEM', 'NUMERO', 'NÚMERO'];
      const indiceTerms = ['INDICE', 'ÍNDICE', 'ID', 'ID_ATIVO', 'CONTROLE'];
      const companyTerms = ['EMPRESA', 'UNIDADE', 'UNID', 'COMPANHIA'];
      
      const plaquetaColName = assetHeaders.find(h => plaquetaTerms.includes(h.toUpperCase()));
      const indiceColName = assetHeaders.find(h => indiceTerms.includes(h.toUpperCase()));
      const companyColName = assetHeaders.find(h => companyTerms.includes(h.toUpperCase()));

      // Mapas para detecção de duplicidade granular
      const globalIndiceToCompanies = new Map<string, Set<string>>();
      const companyToIndices = new Map<string, Map<string, number>>();
      
      const rawData = assetRows.slice(assetHeaderIndex + 1)
        .filter(row => row.some(cell => String(cell).trim() !== ""))
        .map((row, rowIndex) => {
          const item: any = {};
          assetHeaders.forEach((header, colIndex) => {
            let val = row[colIndex];
            if (header.toUpperCase().match(/DATA|AQUISICAO|DT_/) && typeof val === 'number') val = formatExcelDate(val);
            item[header] = val !== undefined ? String(val).toUpperCase() : "";
          });
          
          const idxVal = indiceColName ? String(item[indiceColName]).trim().toUpperCase() : "";
          const cmpVal = companyColName ? String(item[companyColName]).trim().toUpperCase() : "EMPRESA PADRÃO";

          if (idxVal) {
            if (!globalIndiceToCompanies.has(idxVal)) globalIndiceToCompanies.set(idxVal, new Set());
            globalIndiceToCompanies.get(idxVal)!.add(cmpVal);

            if (!companyToIndices.has(cmpVal)) companyToIndices.set(cmpVal, new Map());
            const cmpMap = companyToIndices.get(cmpVal)!;
            cmpMap.set(idxVal, (cmpMap.get(idxVal) || 0) + 1);
          }

          return { ...item, _tempCompany: cmpVal, _tempIndice: idxVal };
        });

      const assetData = rawData.map((item, rowIndex) => {
        item.id = item.id || `at_${rowIndex}_${Date.now()}`;
        
        const plaquetaVal = plaquetaColName ? String(item[plaquetaColName]).trim() : "";
        item._hasPlaqueta = plaquetaVal.length > 0;
        
        const idx = item._tempIndice;
        const cmp = item._tempCompany;

        const countInCompany = companyToIndices.get(cmp)?.get(idx) || 0;
        const companiesWithIndice = globalIndiceToCompanies.get(idx)?.size || 0;

        item._isInternalDuplicate = countInCompany > 1;
        item._isExternalDuplicate = companiesWithIndice > 1;
        item._isDuplicate = item._isInternalDuplicate || item._isExternalDuplicate;
        item._conferido = false;

        item.TAG_INVENTARIO = "PENDENTE";
        item.TAG_PLAQUETA = item._hasPlaqueta ? "COM PLAQUETA" : "SEM PLAQUETA";
        
        if (item._isInternalDuplicate && item._isExternalDuplicate) {
          item.TAG_DUPLICIDADE = "DUPLICIDADE MÚLTIPLA";
        } else if (item._isInternalDuplicate) {
          item.TAG_DUPLICIDADE = "DUPLICIDADE INTERNA";
        } else if (item._isExternalDuplicate) {
          item.TAG_DUPLICIDADE = "DUPLICIDADE EXTERNA";
        } else {
          item.TAG_DUPLICIDADE = "ÚNICO";
        }

        delete item._tempCompany;
        delete item._tempIndice;
        
        return item;
      });

      let companies: string[] = Array.from(companyToIndices.keys()).sort();
      if (companies.length === 0) companies = ["EMPRESA PADRÃO"];

      setSuccess({ rows: assetData.length, cos: assetHeaders.length });
      setTimeout(() => onDataLoaded(assetData, companies), 1500);
    } catch (err: any) {
      setError(err.message || "Erro no processamento.");
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      setError(null);
      const r = new FileReader();
      r.onload = (evt) => processWorkbook(evt.target?.result);
      r.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 animate-fadeIn">
      <div className="p-6 bg-white border-b border-gray-100 shadow-sm">
        <h2 className="text-2xl font-black text-gray-900 uppercase leading-none">Carga de Dados</h2>
        <p className="text-gray-400 text-[10px] mt-2 font-black uppercase tracking-widest">Identificando duplicidades internas e externas</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center text-center">
            <Loader2 className="text-blue-500 animate-spin mb-6" size={80} />
            <h3 className="text-xl font-black text-gray-900 mb-2 uppercase">Mapeando Índices...</h3>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Cruzando dados entre unidades</p>
          </div>
        ) : success ? (
          <div className="text-center animate-bounceIn">
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-100">
              <CheckCircle2 className="text-white" size={48} />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2 uppercase">Pronto!</h3>
            <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">{success.rows} Itens Cruzados com Sucesso</p>
          </div>
        ) : (
          <div className="space-y-6">
            <label className="group relative w-full aspect-square rounded-[3rem] border-4 border-dashed border-blue-100 flex flex-col items-center justify-center p-8 cursor-pointer bg-white hover:border-blue-300 hover:bg-blue-50/10 transition-all duration-300">
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              <div className="w-24 h-24 bg-blue-50 rounded-[2rem] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-inner">
                <Upload className="text-blue-600" size={40} />
              </div>
              <p className="font-black text-gray-800 text-xl uppercase">Upload Excel</p>
              {error && <p className="mt-4 text-red-500 text-[10px] font-black uppercase bg-red-50 px-3 py-1 rounded-lg">{error}</p>}
            </label>
          </div>
        )}
      </div>

      <div className="p-6 bg-white border-t border-gray-100 flex items-center justify-between">
         <button onClick={onBack} className="px-6 py-3 text-gray-400 font-black text-[10px] uppercase border rounded-xl">Cancelar</button>
         <div className="flex items-center text-[10px] text-gray-300 font-black uppercase"><Layers size={12} className="mr-1" /> V6.2 Robust_DB</div>
      </div>
    </div>
  );
};

export default DatabaseLoader;
