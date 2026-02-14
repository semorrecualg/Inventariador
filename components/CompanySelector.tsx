
import React, { useState } from 'react';
import { Building2, Search, MapPin, ArrowLeft, LayoutGrid, CheckCircle2 } from 'lucide-react';

interface CompanySelectorProps {
  companies: string[];
  onSelect: (company: string) => void;
  onBack: () => void;
}

const CompanySelector: React.FC<CompanySelectorProps> = ({ companies, onSelect, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCompanies = companies.filter(c => 
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fadeIn">
      {/* Header Fixo */}
      <div className="p-6 pt-10 bg-white border-b border-gray-100 shadow-sm">
        <button 
          onClick={onBack}
          className="mb-4 flex items-center space-x-2 text-gray-400 text-[9px] font-black uppercase tracking-widest"
        >
          <ArrowLeft size={14} />
          <span>Menu Principal</span>
        </button>
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Unidade Primária</h2>
            <p className="text-blue-500 text-[8px] font-black uppercase tracking-[0.2em] mt-1">Foco da Operação Atual</p>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <LayoutGrid size={20} />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-11 pr-4 py-4 bg-slate-50 rounded-2xl text-[10px] font-black uppercase border-2 border-transparent focus:border-blue-500 outline-none transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-6">
        <div className="grid grid-cols-1 gap-3 pb-24">
          {filteredCompanies.length > 0 ? (
            filteredCompanies.map((company) => (
              <button
                key={company}
                onClick={() => onSelect(company)}
                className="bg-white p-5 rounded-3xl flex items-center justify-between shadow-sm border border-transparent hover:border-blue-500 active:scale-95 transition-all group"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <Building2 size={24} />
                  </div>
                  <div className="text-left">
                    <h4 className="font-black text-slate-900 text-xs uppercase leading-tight">{company}</h4>
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Base Ativa</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-gray-200 group-hover:text-blue-500 transition-colors">
                  <CheckCircle2 size={20} />
                </div>
              </button>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 opacity-20">
              <Building2 size={60} />
              <p className="font-black uppercase tracking-widest text-[10px] mt-4">Nenhuma unidade encontrada</p>
            </div>
          )}
        </div>
      </div>

      {/* Info Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100">
         <p className="text-[8px] text-gray-400 font-black text-center uppercase tracking-[0.3em]">
           {companies.length} Unidades Mapeadas no Pipeline
         </p>
      </div>
    </div>
  );
};

export default CompanySelector;
