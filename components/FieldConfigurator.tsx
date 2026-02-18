
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { 
  ArrowLeft, 
  SlidersHorizontal, 
  Lock, 
  Unlock, 
  ShieldCheck, 
  Save, 
  Info,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface FieldConfiguratorProps {
  assets: Asset[];
  currentEditable: string[];
  onSave: (fields: string[]) => void;
  onBack: () => void;
}

const FieldConfigurator: React.FC<FieldConfiguratorProps> = ({ assets, currentEditable, onSave, onBack }) => {
  const [selectedFields, setSelectedFields] = useState<string[]>(currentEditable);

  const fieldLabels: Record<string, string> = {
    EMPRESA: 'Empresa',
    STATUS: 'Status Vital',
    ETIQUETA: 'Etiqueta de Patrimônio',
    CENTRODECUSTO: 'Centro de Custo',
    VLRAQUISIC: 'Valor de Aquisição',
    DESCRICAODOATIVO: 'Descrição do Ativo',
    SERIAL: 'Número de Série',
    DATAAQUSIC: 'Data de Aquisição',
    DATABAIXA: 'Data de Baixa',
    CNPJ: 'CNPJ Fornecedor',
    NOMEFORNECEDOR: 'Fornecedor',
    NOTAFISCAL: 'Nota Fiscal',
    ENDERECO: 'Localização Física',
    REGISTRO: 'Número de Registro',
    SUBREG: 'Sub-registro',
    CONTACONTABIL: 'Conta Contábil',
    PRIMARYKEY: 'Chave Primária'
  };

  const availableFields = useMemo(() => {
    if (assets.length === 0) return Object.keys(fieldLabels);
    const keys = Object.keys(assets[0]).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'TAG_INVENTARIO' && k !== 'TAG_DUPLICIDADE');
    const mapped = Object.keys(fieldLabels).filter(k => keys.includes(k));
    const unmapped = keys.filter(k => !Object.keys(fieldLabels).includes(k));
    return [...mapped, ...unmapped];
  }, [assets]);

  const toggleField = (field: string) => {
    setSelectedFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800 relative z-20 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center space-x-1.5 text-slate-500 font-black text-[9px] uppercase tracking-widest active:text-indigo-400">
            <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
          </button>
          <div className="bg-purple-600/20 px-3 py-1 rounded-full border border-purple-500/30 text-purple-400">
            <span className="text-[7px] font-black uppercase tracking-[0.3em]">Protocolo v24.40</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl">
            <SlidersHorizontal size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none italic">Autoridade de Escrita</h2>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Configurar Acesso de 18 Dimensões</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-2 no-scrollbar pb-40">
        {availableFields.map(field => {
          const isEditable = selectedFields.includes(field);
          return (
            <button key={field} onClick={() => toggleField(field)} className={`w-full p-5 rounded-[2rem] border transition-all flex items-center justify-between ${isEditable ? 'bg-indigo-900/10 border-indigo-500/40' : 'bg-slate-900 border-slate-800 opacity-60'}`}>
              <div className="flex items-center space-x-4 text-left">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEditable ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-950 text-slate-700'}`}>
                  {isEditable ? <Unlock size={18} /> : <Lock size={18} />}
                </div>
                <div>
                  <h4 className={`text-[11px] font-black uppercase tracking-tight ${isEditable ? 'text-white' : 'text-slate-500'}`}>{fieldLabels[field] || field}</h4>
                  <p className="text-[7px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{field}</p>
                </div>
              </div>
              {isEditable && <CheckCircle2 size={20} className="text-indigo-400" />}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/90 backdrop-blur-md border-t border-slate-900 z-30 flex items-center justify-between">
         <div className="text-[8px] font-black text-slate-700 uppercase tracking-[0.4em]">Field Guard v24.40</div>
         <button onClick={() => { onSave(selectedFields); onBack(); }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-2">
            <Save size={18} />
            <span>Aplicar v24.40</span>
         </button>
      </div>
    </div>
  );
};

export default FieldConfigurator;
