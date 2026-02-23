
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { 
  ArrowLeft, 
  QrCode, 
  Lock, 
  Unlock, 
  Save, 
  CheckCircle2,
  Settings2
} from 'lucide-react';

interface QrConfiguratorProps {
  assets: Asset[];
  currentFields: string[];
  onSave: (fields: string[]) => void;
  onBack: () => void;
}

const QrConfigurator: React.FC<QrConfiguratorProps> = ({ assets, currentFields, onSave, onBack }) => {
  const [selectedFields, setSelectedFields] = useState<string[]>(currentFields);
  const [isSaved, setIsSaved] = useState(false);

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
    const DB_ORDER = [
      'EMPRESA', 'STATUS', 'ETIQUETA', 'QT', 'DESCRICAODOATIVO', 'SERIAL', 
      'DATAAQUSIC', 'CNPJ', 'NOMEFORNECEDOR', 'NOTAFISCAL', 'ENDERECO', 
      'REGISTRO', 'SUBREG', 'DATABAIXA', 'CONTACONTABIL', 'PRIMARYKEY', 
      'CENTRODECUSTO', 'VLRAQUISIC'
    ];

    if (assets.length === 0) return DB_ORDER;
    const keys = Object.keys(assets[0]).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'TAG_INVENTARIO' && k !== 'TAG_DUPLICIDADE');
    
    // Filtrar e ordenar conforme DB_ORDER
    const sorted = DB_ORDER.filter(k => keys.includes(k));
    const others = keys.filter(k => !DB_ORDER.includes(k));
    
    return [...sorted, ...others];
  }, [assets]);

  const toggleField = (field: string) => {
    setSelectedFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
  };

  const handleSave = () => {
    onSave(selectedFields);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onBack();
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800 relative z-20 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center space-x-1.5 text-slate-500 font-black text-[9px] uppercase tracking-widest active:text-indigo-400">
            <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
          </button>
          <div className="bg-sky-600/20 px-3 py-1 rounded-full border border-sky-500/30 text-sky-400">
            <span className="text-[7px] font-black uppercase tracking-[0.3em]">Protocolo v24.50</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 bg-sky-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl">
            <QrCode size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none italic">Configuração QR Code</h2>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Definir Conteúdo da Etiqueta Digital</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-2 no-scrollbar pb-40">
        <div className="mb-4 p-4 bg-sky-900/20 border border-sky-500/30 rounded-2xl">
          <p className="text-[10px] font-bold text-sky-400 leading-relaxed uppercase flex items-center">
            <Settings2 size={14} className="mr-2" />
            Configuração Global Permanente
          </p>
          <p className="text-[8px] font-medium text-sky-500/70 uppercase mt-1">
            Esta seleção será aplicada automaticamente a todas as empresas do sistema.
          </p>
        </div>
        
        <div className="mb-4 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase">
            Selecione os campos que serão incorporados ao QR Code. Os dados serão concatenados para leitura técnica.
          </p>
        </div>
        
        {availableFields.map(field => {
          const isIncluded = selectedFields.includes(field);
          return (
            <button key={field} onClick={() => toggleField(field)} className={`w-full p-5 rounded-[2rem] border transition-all flex items-center justify-between ${isIncluded ? 'bg-sky-900/10 border-sky-500/40' : 'bg-slate-900 border-slate-800 opacity-60'}`}>
              <div className="flex items-center space-x-4 text-left">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isIncluded ? 'bg-sky-600 text-white shadow-lg' : 'bg-slate-950 text-slate-700'}`}>
                  {isIncluded ? <Unlock size={18} /> : <Lock size={18} />}
                </div>
                <div>
                  <h4 className={`text-[11px] font-black uppercase tracking-tight ${isIncluded ? 'text-white' : 'text-slate-500'}`}>{fieldLabels[field] || field}</h4>
                  <p className="text-[7px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{field}</p>
                </div>
              </div>
              {isIncluded && <CheckCircle2 size={20} className="text-sky-400" />}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/90 backdrop-blur-md border-t border-slate-900 z-30 flex items-center justify-between">
         <div className="text-[8px] font-black text-slate-700 uppercase tracking-[0.4em]">QR Guard v24.50</div>
         <button 
           onClick={handleSave} 
           disabled={isSaved}
           className={`${isSaved ? 'bg-emerald-600' : 'bg-sky-600'} text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-2 transition-all min-w-[180px] justify-center`}
         >
            {isSaved ? (
              <>
                <CheckCircle2 size={18} />
                <span>Configuração Salva!</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Salvar Permanente</span>
              </>
            )}
         </button>
      </div>
    </div>
  );
};

export default QrConfigurator;
