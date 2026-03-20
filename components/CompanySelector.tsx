
import React, { useState } from 'react';
import { Building2, Search, LayoutGrid, CheckCircle2, Factory, Landmark, Warehouse, Building } from 'lucide-react';
import BackButton from './BackButton';

interface CompanySelectorProps {
  companies: Array<{ name: string; hasData: boolean }>;
  onSelect: (company: string) => void;
  onBack: () => void;
}

const CompanySelector: React.FC<CompanySelectorProps> = ({ companies, onSelect, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper para gerar ícone e cor consistente baseada no nome
  const getCompanyIdentity = (name: string, hasData: boolean) => {
    if (!hasData) {
      return {
        style: 'bg-slate-50 text-slate-300 border-slate-100 grayscale',
        Icon: Building2
      };
    }
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
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn">
      {/* Header Fixo */}
      <div className="p-5 pt-14 bg-white border-b border-border shadow-sm">
        <div className="mb-6">
          <BackButton onClick={onBack} label="Sair do Aplicativo" subLabel="Retornar ao Login" />
        </div>
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink uppercase tracking-tight leading-none">Unidade Operacional</h2>
            <p className="text-accent text-[9px] font-bold uppercase tracking-[0.2em] mt-2">Selecione o Foco do Inventário</p>
          </div>
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
            <LayoutGrid size={24} />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={18} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-12 pr-6 py-3.5 bg-bg-main rounded-xl text-[11px] font-bold uppercase border border-border focus:border-accent outline-none transition-all shadow-inner placeholder:text-ink-muted/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-5">
        <div className="grid grid-cols-1 gap-3 pb-24">
          {filteredCompanies.length > 0 ? (
            filteredCompanies.map((company) => {
              const { style, Icon } = getCompanyIdentity(company.name, company.hasData);
              return (
                <button
                  key={company.name}
                  onClick={() => company.hasData && onSelect(company.name)}
                  disabled={!company.hasData}
                  className={`bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border transition-all group overflow-hidden relative modern-card ${
                    company.hasData 
                      ? 'hover:border-accent active:scale-[0.99] border-border' 
                      : 'opacity-60 cursor-not-allowed border-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-4 relative z-10">
                    <div className={`w-12 h-12 ${style} rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm border`}>
                      <Icon size={24} strokeWidth={2.5} />
                    </div>
                    <div className="text-left">
                      <h4 className={`font-bold text-sm uppercase leading-tight tracking-tight ${company.hasData ? 'text-ink' : 'text-slate-400'}`}>
                        {company.name}
                      </h4>
                      <div className="flex items-center space-x-1.5 mt-1">
                         <div className={`w-1.5 h-1.5 rounded-full shadow-sm ${company.hasData ? 'bg-success shadow-success/50' : 'bg-slate-300'}`}></div>
                         <span className={`text-[9px] font-bold uppercase tracking-widest ${company.hasData ? 'text-ink-muted' : 'text-slate-300'}`}>
                           {company.hasData ? 'Base Master Disponível' : 'Sem Itens Ativos'}
                         </span>
                      </div>
                    </div>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors relative z-10 ${
                    company.hasData ? 'text-slate-100 group-hover:text-accent' : 'text-slate-50'
                  }`}>
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
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-border flex justify-between items-center z-50 shadow-lg">
         <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-accent rounded-full shadow-sm shadow-accent/50"></div>
            <p className="text-[9px] text-ink font-bold uppercase tracking-widest">Pipeline Ativo</p>
         </div>
         <p className="text-[9px] text-ink-muted font-bold uppercase tracking-widest">
           {companies.length} Entidades
         </p>
      </div>
    </div>
  );
};

export default CompanySelector;
