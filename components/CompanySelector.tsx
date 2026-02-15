
import React, { useState } from 'react';
import { Building2, Search, MapPin, ArrowLeft, LayoutGrid, CheckCircle2, Factory, Landmark, Warehouse, Building } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-slate-50 animate-fadeIn">
      {/* Header Fixo */}
      <div className="p-8 pt-10 bg-white border-b border-gray-100 shadow-sm">
        <button 
          onClick={onBack}
          className="mb-5 flex items-center space-x-2 text-gray-400 text-[10px] font-black uppercase tracking-widest"
        >
          <ArrowLeft size={16} />
          <span>Retornar ao Painel Principal</span>
        </button>
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none italic">Unidade Operacional</h2>
            <p className="text-blue-500 text-[9px] font-black uppercase tracking-[0.3em] mt-2">Selecione o Foco do Inventário Atual</p>
          </div>
          <div className="w-14 h-14 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl">
            <LayoutGrid size={28} />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE PRIMÁRIA..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-[1.8rem] text-[12px] font-black uppercase border-2 border-transparent focus:border-blue-500 outline-none transition-all shadow-inner placeholder:text-gray-300"
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
                  className="bg-white p-6 rounded-[2.5rem] flex items-center justify-between shadow-md border-2 border-transparent hover:border-blue-500 active:scale-[0.97] transition-all group overflow-hidden relative"
                >
                  <div className="flex items-center space-x-5 relative z-10">
                    <div className={`w-16 h-16 ${style} rounded-[1.8rem] flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border`}>
                      <Icon size={32} strokeWidth={2.5} />
                    </div>
                    <div className="text-left">
                      <h4 className="font-black text-slate-900 text-sm uppercase leading-tight tracking-tight">{company}</h4>
                      <div className="flex items-center space-x-1.5 mt-1">
                         <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                         <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Base Master Disponível</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-gray-100 group-hover:text-blue-500 transition-colors relative z-10">
                    <CheckCircle2 size={24} />
                  </div>
                  {/* Detalhe visual de fundo */}
                  <div className={`absolute -right-4 -bottom-4 w-24 h-24 opacity-[0.03] rotate-12 group-hover:opacity-[0.08] transition-opacity`}>
                    <Icon size={96} />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-10">
              <Building2 size={80} />
              <p className="font-black uppercase tracking-[0.5em] text-[12px] mt-6">Unidade não encontrada</p>
            </div>
          )}
        </div>
      </div>

      {/* Info Bar Técnica */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-xl border-t border-gray-100 flex justify-between items-center z-50">
         <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <p className="text-[9px] text-slate-900 font-black uppercase tracking-widest">Pipeline Ativo</p>
         </div>
         <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">
           {companies.length} Entidades Identificadas
         </p>
      </div>
    </div>
  );
};

export default CompanySelector;
