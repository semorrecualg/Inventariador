
import React, { useState } from 'react';
import { Building2, Search, ArrowLeft, LayoutGrid, CheckCircle2, Factory, Landmark, Warehouse, Building } from 'lucide-react';

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

  // Helper para gerar ícone e cor consistente baseada no nome
  const getCompanyIdentity = (name: string) => {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      'bg-blue-50 text-blue-600 border-blue-100',
      'bg-indigo-50 text-indigo-600 border-indigo-100',
      'bg-emerald-50 text-emerald-600 border-emerald-100',
      'bg-purple-50 text-purple-600 border-purple-100',
      'bg-amber-50 text-amber-600 border-amber-100',
      'bg-rose-50 text-rose-600 border-rose-100'
    ];
    const icons = [Building2, Factory, Landmark, Warehouse, Building];
    
    return {
      style: colors[hash % colors.length],
      Icon: icons[hash % icons.length]
    };
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn">
      {/* Header Fixo */}
      <div className="p-5 pt-10 bg-white border-b border-slate-200 shadow-sm">
        <button 
          onClick={onBack}
          className="mb-4 flex items-center space-x-2 text-slate-400 text-[9px] font-bold uppercase tracking-widest hover:text-blue-600 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Retornar ao Painel</span>
        </button>
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight leading-none">Unidade Operacional</h2>
            <p className="text-blue-600 text-[9px] font-bold uppercase tracking-[0.2em] mt-2">Selecione o Foco do Inventário</p>
          </div>
          <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
            <LayoutGrid size={24} />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-12 pr-6 py-3.5 bg-slate-50 rounded-xl text-[11px] font-bold uppercase border border-slate-200 focus:border-blue-500 outline-none transition-all shadow-inner placeholder:text-slate-300"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-5">
        <div className="grid grid-cols-1 gap-3 pb-24">
          {filteredCompanies.length > 0 ? (
            filteredCompanies.map((company) => {
              const { style, Icon } = getCompanyIdentity(company);
              return (
                <button
                  key={company}
                  onClick={() => onSelect(company)}
                  className="bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border border-slate-200 hover:border-blue-300 active:scale-[0.99] transition-all group overflow-hidden relative modern-card"
                >
                  <div className="flex items-center space-x-4 relative z-10">
                    <div className={`w-12 h-12 ${style} rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm border`}>
                      <Icon size={24} strokeWidth={2.5} />
                    </div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-900 text-sm uppercase leading-tight tracking-tight">{company}</h4>
                      <div className="flex items-center space-x-1.5 mt-1">
                         <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/50"></div>
                         <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Base Master Disponível</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-slate-100 group-hover:text-blue-500 transition-colors relative z-10">
                    <CheckCircle2 size={24} />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16 opacity-20">
              <Building2 size={60} className="text-slate-300" />
              <p className="font-bold uppercase tracking-[0.3em] text-[10px] mt-6 text-slate-400">Unidade não encontrada</p>
            </div>
          )}
        </div>
      </div>

      {/* Info Bar Técnica */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-slate-200 flex justify-between items-center z-50 shadow-lg">
         <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50"></div>
            <p className="text-[9px] text-slate-900 font-bold uppercase tracking-widest">Pipeline Ativo</p>
         </div>
         <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
           {companies.length} Entidades
         </p>
      </div>
    </div>
  );
};

export default CompanySelector;
