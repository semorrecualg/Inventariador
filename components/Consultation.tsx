
import React, { useState, useMemo, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Asset } from '../types';
import { 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  Barcode,
  AlertCircle,
  QrCode,
  Filter,
  X,
  Building2,
  Tag,
  MapPin,
  FileText,
  Hash,
  User,
  LayoutGrid,
  Calendar
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
  qrCodeFields: string[];
}

interface SearchFilters {
  ETIQUETA: string;
  DESCRICAODOATIVO: string;
  SERIAL: string;
  CNPJ: string;
  NOMEFORNECEDOR: string;
  NOTAFISCAL: string;
  ENDERECO: string;
  CONTACONTABIL: string;
  CENTRODECUSTO: string;
  DATAAQUSIC_START: string;
  DATAAQUSIC_END: string;
}

const parseAssetDate = (val: string | number | null | undefined): Date | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return null;
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
  }
  const parts = s.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const NumericKeypad = ({ onInput, onDelete, onClose, onSearch }: { onInput: (val: string) => void, onDelete: () => void, onClose: () => void, onSearch: () => void }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  
  return (
    <div className="bg-white border-t border-slate-200 p-6 grid grid-cols-3 gap-4 animate-slideUp z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[3rem]">
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => {
            if (key === 'C') onClose();
            else if (key === '⌫') onDelete();
            else onInput(key);
          }}
          className={`h-16 rounded-3xl flex items-center justify-center text-2xl font-bold transition-all active:scale-90 ${
            key === 'C' ? 'bg-slate-100 text-slate-400' : 
            key === '⌫' ? 'bg-slate-100 text-slate-400' : 
            'bg-white border border-slate-200 text-slate-900 shadow-sm hover:border-sky-300'
          }`}
        >
          {key}
        </button>
      ))}
      <button 
        onClick={onSearch}
        className="col-span-3 h-16 bg-sky-600 text-white rounded-3xl flex items-center justify-center text-lg font-bold uppercase tracking-widest shadow-lg shadow-sky-900/20 active:scale-95 transition-all mt-2"
      >
        <Search size={20} className="mr-3" /> Confirmar Busca
      </button>
    </div>
  );
};

const Consultation: React.FC<ConsultationProps> = ({ assets, onBack, onSelectAsset, qrCodeFields }) => {
  const [filters, setFilters] = useState<SearchFilters>({
    ETIQUETA: '',
    DESCRICAODOATIVO: '',
    SERIAL: '',
    CNPJ: '',
    NOMEFORNECEDOR: '',
    NOTAFISCAL: '',
    ENDERECO: '',
    CONTACONTABIL: '',
    CENTRODECUSTO: '',
    DATAAQUSIC_START: '',
    DATAAQUSIC_END: ''
  });
  
  const [committedFilters, setCommittedFilters] = useState<SearchFilters | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedAssetForQr, setSelectedAssetForQr] = useState<Asset | null>(null);
  const [activeField, setActiveField] = useState<keyof SearchFilters | null>(null);
  const [showNumericKeypad, setShowNumericKeypad] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(true);
  
  // Selection list state
  const [selectionModal, setSelectionModal] = useState<{ field: 'CONTACONTABIL' | 'CENTRODECUSTO' | null, searchTerm: string }>({ field: null, searchTerm: '' });

  const uniqueValues = useMemo(() => {
    const contabilidade = new Set<string>();
    const custos = new Set<string>();
    
    assets.forEach(asset => {
      if (asset.CONTACONTABIL) contabilidade.add(String(asset.CONTACONTABIL).trim());
      if (asset.CENTRODECUSTO) custos.add(String(asset.CENTRODECUSTO).trim());
    });
    
    return {
      CONTACONTABIL: Array.from(contabilidade).sort(),
      CENTRODECUSTO: Array.from(custos).sort()
    };
  }, [assets]);

  const filteredSelectionValues = useMemo(() => {
    if (!selectionModal.field) return [];
    const values = uniqueValues[selectionModal.field];
    if (!selectionModal.searchTerm) return values;
    const term = selectionModal.searchTerm.toUpperCase();
    return values.filter(v => v.toUpperCase().includes(term));
  }, [selectionModal, uniqueValues]);

  const filteredAssets = useMemo(() => {
    if (!committedFilters) return [];
    
    return assets.filter(asset => {
      // Standard text filters
      const textMatch = Object.entries(committedFilters).every(([key, value]) => {
        if (!value || key.startsWith('DATAAQUSIC_')) return true;
        const assetValue = String(asset[key as keyof Asset] || '').toUpperCase();
        return assetValue.includes(value.toUpperCase().trim());
      });

      if (!textMatch) return false;

      // Date range filter
      const assetDate = parseAssetDate(asset.DATAAQUSIC);
      if (!assetDate) {
        // If asset has no date but user is filtering by date, it's a mismatch
        return !committedFilters.DATAAQUSIC_START && !committedFilters.DATAAQUSIC_END;
      }

      if (committedFilters.DATAAQUSIC_START) {
        const start = new Date(committedFilters.DATAAQUSIC_START);
        if (!isNaN(start.getTime()) && assetDate < start) return false;
      }

      if (committedFilters.DATAAQUSIC_END) {
        const end = new Date(committedFilters.DATAAQUSIC_END);
        if (!isNaN(end.getTime()) && assetDate > end) return false;
      }

      return true;
    }).sort((a, b) => String(a.ETIQUETA || '').localeCompare(String(b.ETIQUETA || ''), undefined, { numeric: true }));
  }, [assets, committedFilters]);

  const triggerSearch = () => {
    setCommittedFilters({ ...filters });
    setShowNumericKeypad(false);
    setActiveField(null);
    setIsFilterDrawerOpen(false);
  };

  const handleInputChange = (field: keyof SearchFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const isNumericField = (field: keyof SearchFilters) => {
    return ['ETIQUETA', 'CNPJ', 'NOTAFISCAL'].includes(field);
  };

  const clearFilters = () => {
    setFilters({
      ETIQUETA: '',
      DESCRICAODOATIVO: '',
      SERIAL: '',
      CNPJ: '',
      NOMEFORNECEDOR: '',
      NOTAFISCAL: '',
      ENDERECO: '',
      CONTACONTABIL: '',
      CENTRODECUSTO: '',
      DATAAQUSIC_START: '',
      DATAAQUSIC_END: ''
    });
    setCommittedFilters(null);
  };

  const renderInput = (field: keyof SearchFilters, label: string, icon: React.ReactNode) => {
    const isNumeric = isNumericField(field);
    const isSelectable = field === 'CONTACONTABIL' || field === 'CENTRODECUSTO';
    
    return (
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">{label}</label>
        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors">
            {icon}
          </div>
          <input 
            type="text"
            readOnly={isNumeric || isSelectable}
            value={filters[field]}
            onChange={(e) => !isNumeric && !isSelectable && handleInputChange(field, e.target.value)}
            onClick={() => {
              if (isNumeric) {
                setActiveField(field);
                setShowNumericKeypad(true);
              } else if (isSelectable) {
                setSelectionModal({ field: field as 'CONTACONTABIL' | 'CENTRODECUSTO', searchTerm: '' });
              } else {
                setShowNumericKeypad(false);
                setActiveField(null);
              }
            }}
            onFocus={() => {
              if (isNumeric) {
                setActiveField(field);
                setShowNumericKeypad(true);
              }
            }}
            className={`w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-sky-500 focus:bg-white transition-all text-sm font-bold text-slate-900 shadow-inner ${(isNumeric || isSelectable) ? 'cursor-pointer' : ''}`}
            placeholder={isSelectable ? `Selecionar ${label.toLowerCase()}...` : `Buscar por ${label.toLowerCase()}...`}
          />
          {filters[field] && (
            <button 
              onClick={() => handleInputChange(field, '')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderAssetItem = useCallback((index: number, asset: Asset) => (
    <div className="px-6 py-2">
      <div onClick={() => onSelectAsset(asset)} className="w-full flex items-center p-5 bg-white rounded-[2rem] border border-slate-200 shadow-sm active:scale-[0.98] transition-all text-left cursor-pointer hover:border-sky-200 group">
        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-sky-50 group-hover:text-sky-600 mr-5 shrink-0 border border-slate-100 transition-colors">
          <Barcode size={28} />
        </div>
        <div className="flex-1 min-w-0 pr-3">
          <span className="text-lg font-bold text-slate-900 font-mono leading-none block mb-1 tracking-tight">{asset.ETIQUETA || 'S/ ETQ'}</span>
          <p className="text-[11px] font-bold text-slate-500 uppercase truncate tracking-tight">
            {asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO'}
          </p>
          <div className="flex items-center space-x-2 mt-2">
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">SN: {asset.SERIAL || '---'}</span>
            <span className="text-slate-200">•</span>
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{asset.ENDERECO || '---'}</span>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); setSelectedAssetForQr(asset); setIsQrModalOpen(true); }} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 active:scale-90 mr-3 shadow-sm hover:text-sky-600 transition-colors">
          <QrCode size={20} />
        </button>
        <ChevronRight size={20} className="text-slate-300 group-hover:text-sky-400 transition-colors" />
      </div>
    </div>
  ), [onSelectAsset, setSelectedAssetForQr, setIsQrModalOpen]);

  return (
    <div className="flex flex-col h-screen bg-bg-main animate-fadeIn relative overflow-hidden">
      {/* HEADER */}
      <div className="bg-white px-6 pt-12 pb-6 border-b border-slate-200 relative z-20 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 active:scale-90 transition-all shadow-sm hover:bg-white hover:text-slate-900">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsFilterDrawerOpen(true)}
              className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-900/20 active:scale-95 transition-all"
            >
              <Filter size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Filtros</span>
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none">Consulta Expert</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
            {committedFilters ? 'Resultados da Pesquisa' : 'Inicie sua consulta'}
          </p>
        </div>
      </div>

      <div className="flex-1 relative">
        {committedFilters ? (
          filteredAssets.length > 0 ? (
            <div className="h-full flex flex-col">
              <div className="px-8 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ativos Localizados</span>
                <span className="bg-sky-100 text-sky-600 px-3 py-1 rounded-full text-[10px] font-bold">{filteredAssets.length}</span>
              </div>
              <Virtuoso
                style={{ height: '100%' }}
                data={filteredAssets}
                itemContent={renderAssetItem}
                className="no-scrollbar"
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
              <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-6 border border-slate-100">
                <AlertCircle size={48} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Nenhum Registro</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2 max-w-[200px]">Não encontramos ativos com os critérios informados.</p>
              <button 
                onClick={() => setIsFilterDrawerOpen(true)}
                className="mt-8 px-8 py-4 bg-sky-600 text-white rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
              >
                Ajustar Filtros
              </button>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-40">
            <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-8 border border-slate-100">
              <Filter size={48} />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] max-w-[220px] leading-relaxed">Clique no botão de filtros para iniciar sua consulta expert</p>
            <button 
              onClick={() => setIsFilterDrawerOpen(true)}
              className="mt-8 px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold uppercase text-[10px] tracking-widest active:scale-95 transition-all"
            >
              Abrir Filtros
            </button>
          </div>
        )}
      </div>

      {/* FILTER DRAWER */}
      {isFilterDrawerOpen && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="mt-auto bg-white w-full rounded-t-[3rem] shadow-2xl flex flex-col max-h-[90vh] animate-slideUp overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Filtros de Consulta</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Refine sua busca expert</p>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={clearFilters}
                  className="p-3 bg-slate-50 rounded-2xl text-slate-400 active:scale-90 transition-all"
                  title="Limpar Filtros"
                >
                  <X size={20} />
                </button>
                <button 
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="p-3 bg-slate-900 rounded-2xl text-white active:scale-90 transition-all shadow-lg"
                >
                  <ChevronRight size={20} className="rotate-90" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar pb-32">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderInput('ETIQUETA', 'Etiqueta', <Barcode size={18} />)}
                {renderInput('DESCRICAODOATIVO', 'Descrição', <FileText size={18} />)}
                {renderInput('SERIAL', 'Serial', <Hash size={18} />)}
                {renderInput('CNPJ', 'CNPJ', <Building2 size={18} />)}
                {renderInput('NOMEFORNECEDOR', 'Fornecedor', <User size={18} />)}
                {renderInput('NOTAFISCAL', 'Nota Fiscal', <FileText size={18} />)}
                {renderInput('ENDERECO', 'Endereço', <MapPin size={18} />)}
                {renderInput('CONTACONTABIL', 'Conta Contábil', <LayoutGrid size={18} />)}
                {renderInput('CENTRODECUSTO', 'Centro de Custo', <Tag size={18} />)}
                
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data Aquisição (De)</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors">
                      <Calendar size={18} />
                    </div>
                    <input 
                      type="date"
                      value={filters.DATAAQUSIC_START}
                      onChange={(e) => handleInputChange('DATAAQUSIC_START', e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-sky-500 focus:bg-white transition-all text-sm font-bold text-slate-900 shadow-inner"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data Aquisição (Até)</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors">
                      <Calendar size={18} />
                    </div>
                    <input 
                      type="date"
                      value={filters.DATAAQUSIC_END}
                      onChange={(e) => handleInputChange('DATAAQUSIC_END', e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-sky-500 focus:bg-white transition-all text-sm font-bold text-slate-900 shadow-inner"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-8 bg-white border-t border-slate-100 sticky bottom-0 z-10">
              <button 
                onClick={triggerSearch}
                className="w-full bg-sky-600 text-white py-5 rounded-3xl font-bold uppercase text-[12px] tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all flex items-center justify-center space-x-3 shadow-sky-900/20"
              >
                <Search size={20} strokeWidth={2.5} />
                <span>Confirmar e Buscar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {isQrModalOpen && selectedAssetForQr && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-fadeIn" onClick={() => setIsQrModalOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] border border-slate-200 shadow-2xl p-10 flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-xl font-bold text-slate-900 uppercase tracking-tight font-mono mb-6">{selectedAssetForQr.EMPRESA}</p>
            <div className="bg-white p-6 border-2 border-slate-900 rounded-3xl shadow-inner mb-8">
              <QRCodeSVG value={qrCodeFields.map(field => selectedAssetForQr[field] || '').join('|')} size={240} />
            </div>
            <div className="text-center w-full">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-3">NÚMERO DO ATIVO</p>
              <p className="bg-slate-900 text-white w-full py-5 rounded-2xl text-3xl font-bold uppercase tracking-tighter font-mono shadow-xl">{selectedAssetForQr.ETIQUETA}</p>
            </div>
            <button onClick={() => setIsQrModalOpen(false)} className="mt-10 w-full py-5 bg-slate-100 text-slate-900 rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] active:scale-95 transition-all">Fechar</button>
          </div>
        </div>
      )}

      {showNumericKeypad && activeField && (
        <div className="fixed bottom-0 left-0 right-0 z-[600]">
          <NumericKeypad 
            onInput={(val) => handleInputChange(activeField, filters[activeField] + val)}
            onDelete={() => handleInputChange(activeField, filters[activeField].slice(0, -1))}
            onClose={() => setShowNumericKeypad(false)}
            onSearch={triggerSearch}
          />
        </div>
      )}

      {/* SELECTION MODAL */}
      {selectionModal.field && (
        <div className="fixed inset-0 z-[700] flex flex-col bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="mt-auto bg-white w-full rounded-t-[3rem] shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            <div className="p-8 border-b border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                  {selectionModal.field === 'CONTACONTABIL' ? 'Conta Contábil' : 'Centro de Custo'}
                </h3>
                <button 
                  onClick={() => setSelectionModal({ field: null, searchTerm: '' })}
                  className="p-3 bg-slate-50 rounded-2xl text-slate-400 active:scale-90 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  autoFocus
                  value={selectionModal.searchTerm}
                  onChange={(e) => setSelectionModal(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-sky-500 focus:bg-white transition-all text-sm font-bold text-slate-900"
                  placeholder="Filtrar lista..."
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-2 no-scrollbar">
              {filteredSelectionValues.length > 0 ? (
                filteredSelectionValues.map((val, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      handleInputChange(selectionModal.field!, val);
                      setSelectionModal({ field: null, searchTerm: '' });
                    }}
                    className="w-full text-left p-5 rounded-2xl border border-slate-100 hover:border-sky-200 hover:bg-sky-50 transition-all active:scale-[0.98]"
                  >
                    <span className="text-sm font-bold text-slate-700 uppercase tracking-tight">{val}</span>
                  </button>
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nenhum valor encontrado</p>
                </div>
              )}
            </div>
            
            <div className="p-8 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setSelectionModal({ field: null, searchTerm: '' })}
                className="w-full py-5 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] active:scale-95 transition-all shadow-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Consultation;
