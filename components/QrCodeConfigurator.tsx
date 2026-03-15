import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { Check, Save } from 'lucide-react';
import BackButton from './BackButton';

interface QrCodeConfiguratorProps {
  assets: Asset[];
  currentQrCodeFields: string[];
  onSave: (fields: string[]) => void;
  onBack: () => void;
}

const QrCodeConfigurator: React.FC<QrCodeConfiguratorProps> = ({ assets, currentQrCodeFields, onSave, onBack }) => {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(currentQrCodeFields));

  const allPossibleFields = useMemo(() => {
    const fieldSet = new Set<string>();
    assets.forEach(asset => {
      Object.keys(asset).forEach(key => {
        if (!key.startsWith('_')) {
          fieldSet.add(key);
        }
      });
    });
    return Array.from(fieldSet).sort();
  }, [assets]);

  const toggleField = (field: string) => {
    setSelectedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(field)) {
        newSet.delete(field);
      } else {
        newSet.add(field);
      }
      return newSet;
    });
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-8 bg-white border-b border-slate-200 shadow-sm relative z-20">
        <div className="mb-6">
          <BackButton onClick={onBack} label="Voltar ao Menu" subLabel="Configurar QR Code" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none">Configurar QR Code</h1>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Selecione os campos para incluir no QR Code.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-40 no-scrollbar">
        {allPossibleFields.map(field => (
          <button 
            key={field} 
            onClick={() => toggleField(field)} 
            className={`w-full p-6 rounded-[2.5rem] flex items-center justify-between transition-all text-left border modern-card active:scale-[0.98] ${selectedFields.has(field) ? 'bg-sky-50 border-sky-200 text-sky-600 shadow-sm' : 'bg-white border-slate-200 text-slate-400'}`}>
            <span className="font-bold uppercase text-[13px] tracking-tight">{field}</span>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${selectedFields.has(field) ? 'bg-sky-600 text-white border-sky-500 shadow-md' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
              {selectedFields.has(field) ? <Check size={20} strokeWidth={3} /> : <div className="w-2 h-2 bg-slate-200 rounded-full" />}
            </div>
          </button>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-8 bg-white/80 backdrop-blur-md border-t border-slate-200 flex items-center justify-between z-30 shadow-2xl">
         <div className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.5em]">QR Guard v24.40</div>
         <button onClick={() => { onSave(Array.from(selectedFields)); onBack(); }} className='bg-slate-900 text-white px-10 py-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest shadow-xl active:scale-95 flex items-center space-x-3 transition-all'>
            <Save size={20} />
            <span>Salvar Configuração</span>
         </button>
      </div>
    </div>
  );
};

export default QrCodeConfigurator;
