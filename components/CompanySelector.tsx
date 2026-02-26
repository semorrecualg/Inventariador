
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
      <div className="p-8 pt-12 bg-white border-b border-slate-200 shadow-sm">
        <button 
          onClick={onBack}
          className="mb-6 flex items-center space-x-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:text-sky-600 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Retornar ao Painel Principal</span>
        </button>
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-tight leading-none">Unidade Operacional</h2>
            <p className="text-sky-600 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">Selecione o Foco do Inventário Atual</p>
          </div>
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl">
            <LayoutGrid size={32} />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE PRIMÁRIA..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-16 pr-8 py-5 bg-slate-50 rounded-3xl text-[12px] font-bold uppercase border border-slate-200 focus:border-sky-500 outline-none transition-all shadow-inner placeholder:text-slate-300"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-8">
        <div className="grid grid-cols-1 gap-4 pb-32">
          {filteredCompanies.length > 0 ? (
            filteredCompanies.map((company) => {
              const { style, Icon } = getCompanyIdentity(company);
              return (
                <button
                  key={company}
                  onClick={() => onSelect(company)}
                  className="bg-white p-6 rounded-[2.5rem] flex items-center justify-between shadow-sm border border-slate-200 hover:border-sky-300 active:scale-[0.98] transition-all group overflow-hidden relative modern-card"
                >
                  <div className="flex items-center space-x-6 relative z-10">
                    <div className={`w-16 h-16 ${style} rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm border`}>
                      <Icon size={32} strokeWidth={2.5} />
                    </div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-900 text-base uppercase leading-tight tracking-tight">{company}</h4>
                      <div className="flex items-center space-x-2 mt-1.5">
                         <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-500/50"></div>
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Master Disponível</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-slate-100 group-hover:text-sky-500 transition-colors relative z-10">
                    <CheckCircle2 size={28} />
                  </div>
                  {/* Detalhe visual de fundo */}
                  <div className={`absolute -right-6 -bottom-6 w-32 h-32 opacity-[0.02] rotate-12 group-hover:opacity-[0.05] transition-opacity`}>
                    <Icon size={128} />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-20">
              <Building2 size={80} className="text-slate-300" />
              <p className="font-bold uppercase tracking-[0.5em] text-[12px] mt-8 text-slate-400">Unidade não encontrada</p>
            </div>
          )}
        </div>
      </div>

      {/* Info Bar Técnica */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-slate-200 flex justify-between items-center z-50 shadow-2xl">
         <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 bg-sky-500 rounded-full shadow-sm shadow-sky-500/50"></div>
            <p className="text-[10px] text-slate-900 font-bold uppercase tracking-widest">Pipeline Ativo</p>
         </div>
         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
           {companies.length} Entidades Identificadas
         </p>
      </div>
    </div>
  );
};

export default CompanySelector;
