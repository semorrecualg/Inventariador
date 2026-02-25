import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { ArrowLeft, Check, Save } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800">
        <button onClick={onBack} className="flex items-center space-x-2 text-slate-500 font-black text-[10px] uppercase tracking-widest mb-4">
          <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
        </button>
        <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Configurar QR Code</h1>
        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-2">Selecione os campos para incluir no QR Code.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-2 pb-32 no-scrollbar">
        {allPossibleFields.map(field => (
          <button 
            key={field} 
            onClick={() => toggleField(field)} 
            className={`w-full p-4 rounded-xl flex items-center justify-between transition-all text-left ${selectedFields.has(field) ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            <span className="font-bold uppercase text-xs tracking-wider">{field}</span>
            {selectedFields.has(field) && <Check size={20} />}
          </button>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end z-30">
         <button onClick={() => onSave(Array.from(selectedFields))} className='bg-sky-600 text-white px-8 py-3.5 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 flex items-center space-x-2 transition-all'>
            <Save size={16} />
            <span>Salvar Configuração</span>
         </button>
      </div>
    </div>
  );
};

export default QrCodeConfigurator;
