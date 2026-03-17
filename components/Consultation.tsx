
import React, { useState, useMemo } from 'react';
import { Asset, ScannerMode, ScanFeedbackMode, SearchFilters } from '../types';
import Scanner from './Scanner';
import BackButton from './BackButton';
import { extractEtiquetaFromQrData, QR_FIELD_ORDER } from '../utils/qrUtils';
import { formatDateBR, formatCurrency, parseAssetDate } from '../utils/formatUtils';
import { 
  Search, 
  ChevronRight, 
  Check,
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
  Calendar,
  Camera
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
  qrCodeFields: string[];
  scannerMode: ScannerMode;
  onUpdateScannerMode: (mode: ScannerMode) => void;
  scanFeedbackMode: ScanFeedbackMode;
  isReturnMode?: boolean;
  onReturnToInventory?: (etiqueta: string) => void;
  filters: SearchFilters;
  onUpdateFilters: (filters: SearchFilters) => void;
  committedFilters: SearchFilters | null;
  onUpdateCommittedFilters: (filters: SearchFilters | null) => void;
}

const NumericKeypad = ({ 
  value, 
  label, 
  onInput, 
  onDelete, 
  onClose, 
  onSearch 
}: { 
  value: string, 
  label: string, 
  onInput: (val: string) => void, 
  onDelete: () => void, 
  onClose: () => void, 
  onSearch: () => void 
}) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  
  return (
    <div className="bg-white border-t border-slate-200 p-4 pb-8 flex flex-col animate-slideUp z-[100] shadow-[0_-20px_50px_rgba(0,0,0,0.15)] rounded-t-[2.5rem]">
      {/* Keypad Header - Context for the user */}
      <div className="flex flex-col items-center mb-4 px-2">
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mb-4" />
        <div className="w-full flex items-center justify-between mb-1">
          <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">{label}</span>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 flex items-center justify-center min-h-[56px] shadow-inner">
          <span className="text-2xl font-mono font-bold text-slate-900 tracking-wider">
            {value || <span className="text-slate-300">---</span>}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {keys.map((key) => (
          <button
            key={key}
            onClick={() => {
              if (key === '⌫') onDelete();
              else if (key === 'C') onClose();
              else onInput(key);
            }}
            className={`h-14 rounded-2xl flex items-center justify-center text-xl font-bold transition-all active:scale-90 ${
              key === 'C' ? 'bg-slate-100 text-slate-400' : 
              key === '⌫' ? 'bg-slate-100 text-slate-400' : 
              'bg-white border border-slate-200 text-slate-900 shadow-sm'
            }`}
          >
            {key === 'C' ? <X size={20} /> : key}
          </button>
        ))}
        <button 
          onClick={onSearch}
          className="col-span-3 h-14 bg-accent text-white rounded-2xl flex items-center justify-center text-sm font-bold uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all mt-1 border-b-4 border-black/20"
        >
          <Search size={18} className="mr-3" strokeWidth={3} /> Confirmar Busca
        </button>
      </div>
    </div>
  );
};

const Consultation: React.FC<ConsultationProps> = ({ 
  assets, 
  onBack, 
  onSelectAsset, 
  scannerMode, 
  onUpdateScannerMode, 
  scanFeedbackMode,
  isReturnMode = false,
  onReturnToInventory,
  filters,
  onUpdateFilters,
  committedFilters,
  onUpdateCommittedFilters,
  qrCodeFields
}) => {
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedAssetForQr, setSelectedAssetForQr] = useState<Asset | null>(null);
  const [activeField, setActiveField] = useState<keyof SearchFilters | null>(null);
  
  const qrCodeData = useMemo(() => {
    if (!selectedAssetForQr) return '';
    const lines: string[] = [];
    
    // Filtra os campos selecionados que existem no ativo e os ordena conforme a regra oficial
    const activeFields = QR_FIELD_ORDER.filter(field => 
      qrCodeFields.includes(field) && 
      selectedAssetForQr[field as keyof Asset] !== undefined && 
      selectedAssetForQr[field as keyof Asset] !== null && 
      selectedAssetForQr[field as keyof Asset] !== ''
    );

    activeFields.forEach(field => {
      let value = String(selectedAssetForQr[field as keyof Asset]);
      
      if (field === 'DATAAQUSIC' || field === 'DATABAIXA') value = formatDateBR(value);
      if (field === 'VLRAQUISIC') value = formatCurrency(value);
      
      lines.push(value);
    });
    return lines.join('\n');
  }, [selectedAssetForQr, qrCodeFields]);
  const [showNumericKeypad, setShowNumericKeypad] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  
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
    }).sort((a, b) => String(a.ETIQUETA || '').localeCompare(String(b.ETIQUETA || ''), undefined, { numeric: true }))
      .slice(0, 100);
  }, [assets, committedFilters]);

  const triggerSearch = () => {
    onUpdateCommittedFilters({ ...filters });
    setShowNumericKeypad(false);
    setActiveField(null);
    setIsFilterOpen(false);
  };

  const handleInputChange = (field: keyof SearchFilters, value: string) => {
    onUpdateFilters({ ...filters, [field]: value });
  };

  const isNumericField = (field: keyof SearchFilters) => {
    return ['ETIQUETA', 'CNPJ', 'NOTAFISCAL'].includes(field);
  };

  const clearFilters = () => {
    onUpdateFilters({
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
    onUpdateCommittedFilters(null);
  };

  const renderInput = (field: keyof SearchFilters, label: string, icon: React.ReactNode) => {
    const isNumeric = isNumericField(field);
    const isSelectable = field === 'CONTACONTABIL' || field === 'CENTRODECUSTO';
    
    return (
      <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">{label}</label>
        <div className="relative group">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors">
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
            className={`w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-accent focus:bg-white transition-all text-xs font-bold text-slate-900 shadow-inner ${(isNumeric || isSelectable) ? 'cursor-pointer' : ''}`}
            placeholder={isSelectable ? `Selecionar...` : `Buscar...`}
          />
          {field === 'ETIQUETA' && (
            <button 
              onClick={() => setIsScannerOpen(true)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-accent text-white rounded-xl shadow-sm active:scale-95 transition-all"
            >
              <Camera size={20} />
            </button>
          )}
          {filters[field] && field !== 'ETIQUETA' && (
            <button 
              onClick={() => handleInputChange(field, '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn relative overflow-hidden">
      {/* HEADER */}
      <div className="bg-white px-5 pt-12 pb-4 border-b border-accent/10 relative z-20 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <BackButton onClick={onBack} label="Retornar" subLabel="Consulta de Ativos" />
          <div className="flex items-center space-x-3">
            <button 
              onClick={clearFilters}
              className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 text-[11px] font-bold uppercase tracking-widest active:scale-95 transition-all"
            >
              Limpar
            </button>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-all active:scale-90 ${isFilterOpen ? 'bg-accent text-white' : 'bg-accent-soft text-accent border border-accent/10'}`}
              title={isFilterOpen ? "Fechar Filtros" : "Abrir Filtros"}
            >
              {isFilterOpen ? <X size={24} /> : <Filter size={24} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink uppercase tracking-tight leading-none">Consulta Expert</h1>
            <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mt-1.5">Formulário Multifunção v24</p>
          </div>
          {!isFilterOpen && committedFilters && (
            <button 
              onClick={() => setIsFilterOpen(true)}
              className="flex items-center space-x-2 px-3 py-2 bg-accent-soft rounded-lg border border-accent/10 animate-pulse"
            >
              <div className="w-2 h-2 bg-accent rounded-full"></div>
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Filtro Ativo</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* SEARCH FORM - DYNAMIC PANEL */}
        {isFilterOpen && (
          <div className="p-5 space-y-4 bg-white border-b border-accent/10 shadow-lg animate-slideDown relative z-10">
            <div className="flex items-center mb-4">
              <button 
                onClick={triggerSearch}
                className="bg-accent text-white px-4 py-2.5 rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-md active:scale-95 transition-all flex items-center space-x-2 mr-4 shrink-0"
              >
                <Search size={16} strokeWidth={3} />
                <span>Executar Consulta</span>
              </button>
              <span className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] whitespace-nowrap">Parâmetros de Busca</span>
              <div className="h-px flex-1 bg-accent/10 ml-4"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderInput('ETIQUETA', 'Etiqueta', <Barcode size={16} />)}
              {renderInput('DESCRICAODOATIVO', 'Descrição', <FileText size={16} />)}
              {renderInput('SERIAL', 'Serial', <Hash size={16} />)}
              {renderInput('CNPJ', 'CNPJ', <Building2 size={16} />)}
              {renderInput('NOMEFORNECEDOR', 'Fornecedor', <User size={16} />)}
              {renderInput('NOTAFISCAL', 'Nota Fiscal', <FileText size={16} />)}
              {renderInput('ENDERECO', 'Endereço', <MapPin size={16} />)}
              {renderInput('CONTACONTABIL', 'Conta Contábil', <LayoutGrid size={16} />)}
              {renderInput('CENTRODECUSTO', 'Centro de Custo', <Tag size={16} />)}
              
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-ink-muted uppercase tracking-widest ml-1">Data Aquisição (De)</label>
                <div className="relative group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted group-focus-within:text-accent transition-colors">
                    <Calendar size={16} />
                  </div>
                  <input 
                    type="date"
                    value={filters.DATAAQUSIC_START}
                    onChange={(e) => handleInputChange('DATAAQUSIC_START', e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-accent-soft border border-accent/10 rounded-xl outline-none focus:border-accent focus:bg-white transition-all text-xs font-bold text-ink shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-ink-muted uppercase tracking-widest ml-1">Data Aquisição (Até)</label>
                <div className="relative group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted group-focus-within:text-accent transition-colors">
                    <Calendar size={16} />
                  </div>
                  <input 
                    type="date"
                    value={filters.DATAAQUSIC_END}
                    onChange={(e) => handleInputChange('DATAAQUSIC_END', e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-accent-soft border border-accent/10 rounded-xl outline-none focus:border-accent focus:bg-white transition-all text-xs font-bold text-ink shadow-inner"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RESULTS */}
        <div className="px-5 py-6 pb-28">
          {committedFilters ? (
            filteredAssets.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Resultados</span>
                  <span className="bg-accent-soft text-accent px-2 py-0.5 rounded-full text-[9px] font-bold">{filteredAssets.length}</span>
                </div>
                {filteredAssets.map((asset) => (
                  <div key={asset.id} onClick={() => onSelectAsset(asset)} className="w-full flex items-center p-3 bg-white rounded-xl border border-slate-200 shadow-sm active:scale-[0.99] transition-all text-left cursor-pointer hover:border-accent/30 group">
                    <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-accent-soft group-hover:text-accent mr-4 shrink-0 border border-slate-100 transition-colors">
                      <Barcode size={20} />
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="text-base font-bold text-slate-900 font-mono leading-none block mb-0.5 tracking-tight">{asset.ETIQUETA || 'S/ ETQ'}</span>
                      <p className="text-[10px] font-bold text-slate-500 uppercase truncate tracking-tight">
                        {asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO'}
                      </p>
                      <div className="flex items-center space-x-1.5 mt-1">
                        <span className="text-[7px] font-bold text-slate-300 uppercase tracking-widest">SN: {asset.SERIAL || '---'}</span>
                        <span className="text-slate-200">•</span>
                        <span className="text-[7px] font-bold text-slate-300 uppercase tracking-widest">{asset.ENDERECO || '---'}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isReturnMode && onReturnToInventory && (
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            onReturnToInventory(asset.ETIQUETA || ''); 
                          }} 
                          className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600 active:scale-90 shadow-sm hover:bg-emerald-100 transition-all flex items-center space-x-2"
                          title="Retornar ao Inventário"
                        >
                          <Check size={16} strokeWidth={3} />
                          <span className="text-[10px] font-black uppercase tracking-tighter">Selecionar</span>
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setSelectedAssetForQr(asset); setIsQrModalOpen(true); }} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 active:scale-90 shadow-sm hover:text-blue-600 transition-colors">
                        <QrCode size={16} />
                      </button>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors ml-1" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-20">
                <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-6 border border-slate-100">
                  <AlertCircle size={48} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Nenhum Registro</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2 max-w-[200px]">Não encontramos ativos com os critérios informados.</p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-20 opacity-40">
              <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-8 border border-slate-100">
                <Filter size={48} />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] max-w-[220px] leading-relaxed">Preencha os campos acima para iniciar sua consulta expert</p>
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {isQrModalOpen && selectedAssetForQr && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 bg-slate-950/40 backdrop-blur-md animate-fadeIn" onClick={() => setIsQrModalOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] border border-accent/20 shadow-2xl p-10 flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-xl font-bold text-ink uppercase tracking-tight font-mono mb-6">{selectedAssetForQr.EMPRESA}</p>
            <div className="bg-white p-6 border-2 border-accent rounded-3xl shadow-inner mb-8">
              <QRCodeSVG 
                value={qrCodeData} 
                size={280} 
                level="M"
                includeMargin={true}
              />
            </div>
            <div className="text-center w-full">
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-[0.3em] mb-3">NÚMERO DO ATIVO</p>
              <p className="bg-accent text-white w-full py-5 rounded-2xl text-3xl font-bold uppercase tracking-tighter font-mono shadow-xl shadow-accent/20">{selectedAssetForQr.ETIQUETA}</p>
            </div>
            <button onClick={() => setIsQrModalOpen(false)} className="mt-10 w-full py-5 bg-accent-soft text-accent rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] active:scale-95 transition-all">Fechar</button>
          </div>
        </div>
      )}

      {showNumericKeypad && activeField && (
        <div className="fixed bottom-0 left-0 right-0 z-[600]">
          <NumericKeypad 
            value={filters[activeField]}
            label={
              activeField === 'ETIQUETA' ? 'Etiqueta Patrimonial' :
              activeField === 'CNPJ' ? 'CNPJ do Fornecedor' :
              activeField === 'NOTAFISCAL' ? 'Número da Nota Fiscal' : 'Campo Numérico'
            }
            onInput={(val) => handleInputChange(activeField, filters[activeField] + val)}
            onDelete={() => handleInputChange(activeField, filters[activeField].slice(0, -1))}
            onClose={() => setShowNumericKeypad(false)}
            onSearch={triggerSearch}
          />
        </div>
      )}

      {/* SELECTION MODAL */}
      {selectionModal.field && (
        <div className="fixed inset-0 z-[700] flex flex-col bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="mt-auto bg-white w-full rounded-t-[3rem] shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            <div className="p-8 border-b border-accent/10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-ink uppercase tracking-tight">
                  {selectionModal.field === 'CONTACONTABIL' ? 'Conta Contábil' : 'Centro de Custo'}
                </h3>
                <button 
                  onClick={() => setSelectionModal({ field: null, searchTerm: '' })}
                  className="p-3 bg-accent-soft rounded-2xl text-accent active:scale-90 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" size={18} />
                <input 
                  type="text"
                  autoFocus
                  value={selectionModal.searchTerm}
                  onChange={(e) => setSelectionModal(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="w-full pl-12 pr-4 py-4 bg-accent-soft border border-accent/10 rounded-2xl outline-none focus:border-accent focus:bg-white transition-all text-sm font-bold text-ink"
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
                    className="w-full text-left p-5 rounded-2xl border border-accent/10 hover:border-accent/30 hover:bg-accent-soft transition-all active:scale-[0.98]"
                  >
                    <span className="text-sm font-bold text-ink-muted uppercase tracking-tight">{val}</span>
                  </button>
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-sm font-bold text-ink-muted uppercase tracking-widest">Nenhum valor encontrado</p>
                </div>
              )}
            </div>
            
            <div className="p-8 bg-accent-soft border-t border-accent/10">
              <button 
                onClick={() => setSelectionModal({ field: null, searchTerm: '' })}
                className="w-full py-5 bg-white border border-accent/10 text-ink rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] active:scale-95 transition-all shadow-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <Scanner 
          mode={scannerMode}
          onModeChange={onUpdateScannerMode}
          onScan={(result) => {
            const extracted = extractEtiquetaFromQrData(result);
            onUpdateFilters({ ...filters, ETIQUETA: extracted });
            setIsScannerOpen(false);
          }}
          onClose={() => setIsScannerOpen(false)}
          scanFeedbackMode={scanFeedbackMode}
        />
      )}
    </div>
  );
};

export default Consultation;
