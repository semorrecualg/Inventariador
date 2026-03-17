
import React, { useState, useEffect } from 'react';
import { AssetReport } from '../types';
import { getAssetReports, resolveAssetReport } from '../services/supabaseService';
import { 
  ArrowLeft, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  User, 
  MapPin, 
  MessageSquare,
  Calendar,
  Search
} from 'lucide-react';

interface AssetReportsProps {
  onBack: () => void;
}

const AssetReports: React.FC<AssetReportsProps> = ({ onBack }) => {
  const [reports, setReports] = useState<AssetReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await getAssetReports();
      setReports(data);
    } catch {
      console.error('Erro ao buscar reportes:');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveAssetReport(id);
      setReports(prev => prev.map(r => r.id === id ? { ...r, resolved: true } : r));
    } catch {
      alert('Erro ao resolver reporte.');
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesFilter = 
      filter === 'ALL' || 
      (filter === 'PENDING' && !r.resolved) || 
      (filter === 'RESOLVED' && r.resolved);
    
    const matchesSearch = 
      r.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.reporter_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.comment.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'LOCAL_DIVERGENTE': return 'Localização Divergente';
      case 'DANIFICADO': return 'Item Danificado';
      case 'NAO_ENCONTRADO': return 'Item Não Encontrado';
      default: return 'Outro Motivo';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">Reportes de Campo</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Divergências reportadas por funcionários</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="bg-amber-100 text-amber-600 px-3 py-1 rounded-full flex items-center space-x-1 border border-amber-200">
            <AlertTriangle size={12} />
            <span className="text-[10px] font-black">{reports.filter(r => !r.resolved).length}</span>
          </div>
        </div>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="p-4 space-y-4 bg-white border-b border-slate-200">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por etiqueta, nome ou comentário..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all"
          />
        </div>
        
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-hide">
          <button 
            onClick={() => setFilter('PENDING')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'PENDING' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            Pendentes
          </button>
          <button 
            onClick={() => setFilter('RESOLVED')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'RESOLVED' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            Resolvidos
          </button>
          <button 
            onClick={() => setFilter('ALL')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'ALL' ? 'bg-slate-800 text-white shadow-lg shadow-slate-800/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            Todos
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando reportes...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-600">Nenhum reporte encontrado</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Tudo limpo por aqui!</p>
            </div>
          </div>
        ) : (
          filteredReports.map(report => (
            <div 
              key={report.id}
              className={`bg-white rounded-3xl border p-5 shadow-sm transition-all ${report.resolved ? 'border-emerald-100 opacity-75' : 'border-slate-200 hover:border-accent/30 hover:shadow-md'}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${report.resolved ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{report.tag}</span>
                      {report.resolved && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[8px] font-black rounded-full uppercase tracking-widest">Resolvido</span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{getReasonLabel(report.reason)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-1 text-slate-400 justify-end">
                    <Calendar size={10} />
                    <span className="text-[9px] font-bold">{new Date(report.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-slate-400 justify-end mt-0.5">
                    <Clock size={10} />
                    <span className="text-[9px] font-bold">{new Date(report.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex items-start space-x-3">
                  <User size={14} className="text-slate-300 mt-0.5" />
                  <div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">REPORTADO POR</p>
                    <p className="text-[11px] font-bold text-slate-700 uppercase">{report.reporter_name}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <MapPin size={14} className="text-slate-300 mt-0.5" />
                  <div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">LOCALIZADO EM</p>
                    <p className="text-[11px] font-bold text-slate-700 uppercase">{report.location_found}</p>
                  </div>
                </div>

                {report.comment && (
                  <div className="flex items-start space-x-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <MessageSquare size={14} className="text-slate-300 mt-0.5" />
                    <p className="text-[11px] text-slate-600 italic leading-relaxed">&quot;{report.comment}&quot;</p>
                  </div>
                )}
              </div>

              {!report.resolved && (
                <button 
                  onClick={() => handleResolve(report.id)}
                  className="w-full py-3 bg-emerald-500 text-white rounded-2xl font-bold uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-emerald-500/10 active:scale-95 transition-all flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 size={14} />
                  <span>Marcar como Resolvido</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AssetReports;
