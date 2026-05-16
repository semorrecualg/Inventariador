
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { 
  SlidersHorizontal, 
  Lock, 
  Unlock, 
  Save, 
  CheckCircle2,
} from 'lucide-react';
import BackButton from './BackButton';

interface FieldConfiguratorProps {
  assets: Asset[];
  currentEditable: string[];
  onSave: (fields: string[]) => void;
  onBack: () => void;
}

const FieldConfigurator: React.FC<FieldConfiguratorProps> = ({ assets, currentEditable, onSave, onBack }) => {
  const [selectedFields, setSelectedFields] = useState<string[]>(currentEditable);

  const fieldLabels: Record<string, string> = {
    UNIDADE_OPERACIONAL: 'Unidade Operacional',
    GRUPO_EMPRESARIAL: 'Grupo Empresarial',
    STATUS: 'Status Vital',
    ETIQUETA: 'Etiqueta de Patrimônio',
    CENTRODECUSTO: 'Centro de Custo',
    VLRAQUISIC: 'Valor de Aquisição',
    DESCRICAODOATIVO: 'Descrição do Ativo',
    SERIAL: 'Número de Série',
    DATAAQUISIC: 'Data de Aquisição',
    DATABAIXA: 'Data de Baixa',
    CNPJ: 'CNPJ Fornecedor',
    NOMEFORNECEDOR: 'Fornecedor',
    NOTAFISCAL: 'Nota Fiscal',
    ENDERECO: 'Localização Física',
    REGISTRO: 'Número de Registro',
    SUBREG: 'Sub-registro',
    conta_contabil: 'Conta Contábil',
    PRIMARYKEY: 'Chave Primária'
  };

  const availableFields = useMemo(() => {
    if (assets.length === 0) return Object.keys(fieldLabels);
    const keys = new Set(Object.keys(assets[0]).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'TAG_INVENTARIO' && k !== 'TAG_DUPLICIDADE'));
    const mapped = Object.keys(fieldLabels).filter(k => keys.has(k));
    const unmapped = Array.from(keys).filter(k => !fieldLabels[k]);
    return [...mapped, ...unmapped];
  }, [assets]);

  const toggleField = (field: string) => {
    setSelectedFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-8 bg-white border-b border-accent/10 relative z-20 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <BackButton onClick={onBack} label="Voltar" subLabel="Autoridade de Escrita" />
          <div className="bg-accent-soft px-4 py-2 rounded-full border border-accent/10 text-accent shadow-sm">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]">Protocolo v24.40</span>
          </div>
        </div>
        <div className="flex items-center space-x-5">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
            <SlidersHorizontal size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-ink uppercase tracking-tight leading-none">Autoridade de Escrita</h2>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-2">Configurar Acesso de 18 Dimensões</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar pb-40">
        {availableFields.map(field => {
          const isEditable = selectedFields.includes(field);
          return (
            <button key={field} onClick={() => toggleField(field)} className={`w-full p-6 rounded-[2.5rem] border transition-all flex items-center justify-between modern-card active:scale-[0.98] ${isEditable ? 'bg-accent-soft border-accent/20 shadow-sm' : 'bg-white border-slate-200 opacity-60'}`}>
              <div className="flex items-center space-x-5 text-left">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${isEditable ? 'bg-accent text-white border-accent shadow-md' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                  {isEditable ? <Unlock size={20} /> : <Lock size={20} />}
                </div>
                <div>
                  <h4 className={`text-[13px] font-bold uppercase tracking-tight ${isEditable ? 'text-ink' : 'text-slate-400'}`}>{fieldLabels[field] || field}</h4>
                  <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mt-1 font-mono">{field}</p>
                </div>
              </div>
              {isEditable && <CheckCircle2 size={24} className="text-accent" />}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-8 bg-white/80 backdrop-blur-md border-t border-accent/10 z-30 flex items-center justify-between shadow-2xl">
         <div className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.5em]">Field Guard v24.40</div>
         <button onClick={() => { onSave(selectedFields); onBack(); }} className="bg-accent text-white px-10 py-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center space-x-3 shadow-accent/20">
            <Save size={20} />
            <span>Aplicar v24.40</span>
         </button>
      </div>
    </div>
  );
};

export default FieldConfigurator;
