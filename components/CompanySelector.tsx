
import React, { useState } from 'react';
import { Building2, Search, MapPin, ArrowLeft, LayoutGrid } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-gray-50 animate-fadeIn">
      {/* Header Fixo */}
      <div className="p-6 pt-10 bg-white border-b border-gray-100">
        <button 
          onClick={onBack}
          className="mb-6 flex items-center space-x-2 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-blue-600 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Voltar ao Menu</span>
        </button>
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900 leading-tight">Empresas</h2>
            <p className="text-gray-400 text-xs font-medium">Selecione o local de atuação</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <LayoutGrid size={24} />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            placeholder="Buscar empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-gray-50 rounded-2xl text-sm font-bold border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all"
          />
        </div>
      </div>

      {/* Grid de Empresas */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-6">
        {filteredCompanies.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 pb-20">
            {filteredCompanies.map((company) => (
              <button
                key={company}
                onClick={() => onSelect(company)}
                className="bg-white p-5 rounded-[2.5rem] flex flex-col items-center text-center shadow-sm border border-transparent hover:border-blue-500 hover:shadow-lg hover:shadow-blue-100 active:scale-95 transition-all group"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-500 mb-4 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-inner">
                  <Building2 size={32} />
                </div>
                <h4 className="font-black text-gray-900 text-xs uppercase leading-tight mb-2 line-clamp-2 min-h-[2rem]">
                  {company}
                </h4>
                <div className="flex items-center space-x-1 text-[9px] text-gray-300 font-bold uppercase tracking-widest mt-auto">
                  <MapPin size={10} />
                  <span>Ativar</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <Building2 size={60} className="opacity-10 mb-4" />
            <p className="font-black uppercase tracking-widest text-[10px]">Nada encontrado</p>
          </div>
        )}
      </div>

      {/* Info Bar */}
      <div className="p-4 text-center bg-white border-t border-gray-100">
         <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.3em]">
           {companies.length} UNIDADES CARREGADAS • ABA LOCAIS
         </p>
      </div>
    </div>
  );
};

export default CompanySelector;
