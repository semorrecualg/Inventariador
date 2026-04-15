
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Activity, 
  Clock,
  ChevronRight,
  ChevronDown,
  Info,
  Download,
  ArrowUp,
  Filter,
  Calendar,
  User as UserIcon,
  Database,
  History,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import BackButton from './BackButton';
import { User, DatabaseMode } from '../types';
import { fetchAuditLogs, fetchAssetLogs } from '../services/supabaseService';
import { localDb } from '../services/localDbService';

interface AuditLogsProps {
  user: User | null;
  onBack: () => void;
  databaseMode: DatabaseMode;
}

interface AuditLogDB {
  id: string;
  timestamp: string;
  user_email: string;
  action: string;
  table_name?: string;
  record_id?: string;
  old_data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  new_data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  details?: string;
  _tenantid?: string;
  tenant_id?: string;
  origin?: string;
}

const JsonDiff = ({ oldData, newData }: { oldData: any, newData: any }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!oldData || !newData) return null;
  
  // Se forem objetos, comparamos chaves
  if (typeof oldData === 'object' && typeof newData === 'object' && oldData !== null && newData !== null) {
    const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    const diffs = keys.filter(k => {
      // Ignora campos internos de controle no diff visual para não poluir
      if (k.startsWith('_') && k !== '_status_contabil' && k !== '_conferido') return false;
      return JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]);
    });
    
    if (diffs.length === 0) return <p className="text-[10px] text-ink-muted italic">Alterações em campos técnicos ou internos.</p>;

    return (
      <div className="space-y-1.5 mt-2 bg-white/50 p-3 rounded-lg border border-line/50">
        <div className="grid grid-cols-12 gap-2 text-[9px] font-black uppercase tracking-widest text-ink-muted mb-1 border-b border-line pb-1">
          <div className="col-span-3">Campo</div>
          <div className="col-span-4">Anterior</div>
          <div className="col-span-1 text-center"></div>
          <div className="col-span-4">Novo</div>
        </div>
        {diffs.map(k => (
          <div key={k} className="grid grid-cols-12 gap-2 text-[10px] items-center py-0.5">
            <div className="col-span-3 font-bold text-ink truncate" title={k}>{k}</div>
            <div className="col-span-4 text-red-600 line-through truncate bg-red-50 px-1.5 py-0.5 rounded border border-red-100/50">
              {oldData[k] === null || oldData[k] === undefined ? 'NULO' : String(oldData[k])}
            </div>
            <div className="col-span-1 text-center text-ink-muted font-bold">→</div>
            <div className="col-span-4 text-green-700 font-black truncate bg-green-50 px-1.5 py-0.5 rounded border border-green-200/50">
              {newData[k] === null || newData[k] === undefined ? 'NULO' : String(newData[k])}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
};

const AuditLogs: React.FC<AuditLogsProps> = ({ user, onBack, databaseMode }) => {
  const [logs, setLogs] = useState<AuditLogDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [logType, setLogType] = useState<'SYSTEM' | 'ASSET'>('ASSET');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      try {
        const tenantId = user?._tenantid || user?.tenantid;
        if (databaseMode.startsWith('SUPABASE') && tenantId) {
          const data = logType === 'SYSTEM' 
            ? await fetchAuditLogs(tenantId)
            : await fetchAssetLogs(tenantId);
          
          const normalizedData = (data as Record<string, any>[]).map(log => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            ...log,
            record_id: String(log.record_id || log.asset_id || ''),
            table_name: (log.table_name || (logType === 'ASSET' ? 'assets' : '')) as string,
            _tenantid: (log._tenantid || log.tenant_id || log.tenantid) as string
          }));

          setLogs(normalizedData as AuditLogDB[]);
        } else if (databaseMode === DatabaseMode.INTERNAL) {
          const localLogs = await localDb.auditLogs.reverse().limit(200).toArray();
          setLogs(localLogs as unknown as AuditLogDB[]);
        }
      } catch (error) {
        console.error('Erro ao carregar logs:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [databaseMode, user, logType]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        (log.user_email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.details?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.record_id?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.action?.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesAction = filterAction === 'ALL' || log.action === filterAction;
      
      let matchesDate = true;
      if (dateRange.start) {
        matchesDate = matchesDate && new Date(log.timestamp) >= new Date(dateRange.start);
      }
      if (dateRange.end) {
        // Adiciona 23:59:59 ao fim do dia selecionado
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && new Date(log.timestamp) <= endDate;
      }
      
      return matchesSearch && matchesAction && matchesDate;
    });
  }, [logs, searchTerm, filterAction, dateRange]);

  const actions = useMemo(() => {
    const baseActions = logType === 'SYSTEM' 
      ? ['ALL', 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'BULK_UPDATE', 'CARGA_EXPERT', 'SYNC_PUSH', 'SYNC_PULL', 'SYNC_CONFLICT', 'RESTORE', 'DOWNLOAD']
      : ['ALL', 'CREATE', 'UPDATE', 'DELETE', 'IMPAIRMENT', 'UNITARIZAÇÃO', 'ACQUISITION', 'TRANSFER', 'SALE', 'WRITE_OFF'];
    
    // Adiciona ações que existem nos logs mas não estão na lista base
    const existingActions = Array.from(new Set(logs.map(l => l.action)));
    return Array.from(new Set([...baseActions, ...existingActions]))
      .filter(Boolean)
      .sort((a, b) => a === 'ALL' ? -1 : b === 'ALL' ? 1 : a.localeCompare(b));
  }, [logs, logType]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const exportLogs = () => {
    const csvContent = [
      ['Data', 'Usuario', 'Acao', 'Tabela', 'ID Registro', 'Detalhes', 'Tenant'].join(','),
      ...filteredLogs.map(log => [
        `"${formatDate(log.timestamp)}"`,
        `"${log.user_email}"`,
        `"${log.action}"`,
        `"${log.table_name || ''}"`,
        `"${log.record_id || ''}"`,
        `"${(log.details || '').replace(/"/g, '""')}"`,
        `"${log._tenantid || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AUDITORIA_${logType}_${new Date().getTime()}.csv`);
    link.click();
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'DELETE':
      case 'WRITE_OFF':
      case 'SALE':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'INSERT':
      case 'CREATE':
      case 'ACQUISITION':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'UPDATE':
      case 'BULK_UPDATE':
      case 'RECONCILIAÇÃO':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'LOGIN':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'IMPAIRMENT':
      case 'UNITARIZAÇÃO':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      {/* Header Profissional */}
      <header className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between shadow-xl z-20">
        <div className="flex items-center gap-5">
          <BackButton onClick={onBack} label="Voltar" subLabel="Governança" />
          <div className="h-10 w-[1px] bg-white/10 mx-1 hidden sm:block"></div>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase flex items-center gap-2">
              <History className="w-5 h-5 text-blue-400" />
              Trilha de Auditoria
            </h1>
            <p className="text-[10px] opacity-50 font-mono tracking-[0.2em] uppercase">
              Compliance & Asset Governance System
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 rounded-xl transition-all border ${showFilters ? 'bg-blue-500 border-blue-400 text-white' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70'}`}
            title="Filtros Avançados"
          >
            <Filter className="w-5 h-5" />
          </button>
          <button 
            onClick={exportLogs}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/20 transition-all text-xs font-black uppercase tracking-widest"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </header>

      {/* Painel de Filtros Avançados */}
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white border-b border-slate-200 shadow-inner overflow-hidden"
          >
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Período Inicial
                </label>
                <input 
                  type="date"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Período Final
                </label>
                <input 
                  type="date"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <UserIcon className="w-3 h-3" /> Ações Rápidas
                </label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setDateRange({ start: '', end: '' })}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Limpar Datas
                  </button>
                  <button 
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setDateRange({ start: today, end: today });
                    }}
                    className="flex-1 py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Hoje
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barra de Busca e Tipo de Log */}
      <div className="bg-white border-b border-slate-200 p-4 space-y-4 shadow-sm z-10">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Log Type Toggle */}
          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 w-full sm:w-72">
            <button
              onClick={() => { setLogType('ASSET'); setFilterAction('ALL'); }}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${logType === 'ASSET' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Ativos
            </button>
            <button
              onClick={() => { setLogType('SYSTEM'); setFilterAction('ALL'); }}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${logType === 'SYSTEM' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Sistema
            </button>
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text"
              placeholder="BUSCAR POR USUÁRIO, TAG, ID OU DETALHE..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all uppercase placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {actions.map(action => (
            <button
              key={action}
              onClick={() => setFilterAction(action)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 ${
                filterAction === action 
                ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20' 
                : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300 hover:text-slate-600'
              }`}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Logs com Virtuoso */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
              <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-900">Processando Trilha</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Recuperando registros de governança...</p>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-30 grayscale">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-12 h-12 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-widest">Vazio</p>
              <p className="text-[10px] uppercase tracking-widest mt-1">Nenhum evento registrado para este filtro</p>
            </div>
          </div>
        ) : (
          <div className="h-full">
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              data={filteredLogs}
              atTopStateChange={(atTop) => setShowScrollTop(!atTop)}
              itemContent={(index, log) => (
                <div className="px-4 py-2">
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.05, 0.5) }}
                    className={`bg-white border rounded-2xl overflow-hidden transition-all duration-300 ${expandedLogId === log.id ? 'ring-2 ring-blue-500/20 shadow-xl border-blue-200' : 'border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'}`}
                  >
                    <div 
                      className="p-4 cursor-pointer flex items-center justify-between gap-4"
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border-2 ${getActionColor(log.action)}`}>
                          {log.action === 'DELETE' ? <AlertTriangle className="w-6 h-6" /> :
                           log.action === 'LOGIN' ? <UserIcon className="w-6 h-6" /> :
                           log.action === 'EXPORT' ? <Download className="w-6 h-6" /> :
                           <Activity className="w-6 h-6" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${getActionColor(log.action)}`}>
                              {log.action}
                            </span>
                            <span className="text-xs font-black text-slate-900 truncate">
                              {log.user_email}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              <Clock className="w-3 h-3" />
                              {formatDate(log.timestamp)}
                            </div>
                            {log.record_id && (
                              <div className="flex items-center gap-1.5 text-[10px] text-blue-500 font-black uppercase tracking-tighter bg-blue-50 px-2 py-0.5 rounded-md">
                                <Database className="w-3 h-3" />
                                {log.record_id}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {expandedLogId === log.id ? 
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                            <ChevronDown className="w-5 h-5" />
                          </div> : 
                          <div className="w-8 h-8 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-300 transition-colors">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                        }
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedLogId === log.id && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-5 pb-6 border-t border-slate-100 bg-slate-50/50 space-y-5 pt-5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Entidade</p>
                              <p className="text-xs font-black text-slate-700 flex items-center gap-2">
                                <FileText className="w-3 h-3 text-blue-500" />
                                {log.table_name || 'SISTEMA'}
                              </p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm sm:col-span-2">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">ID do Registro</p>
                              <p className="text-xs font-mono text-slate-600 break-all">{log.record_id || 'N/A'}</p>
                            </div>
                          </div>

                          {log.details && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                                <Info className="w-3 h-3 text-blue-500" /> Narrativa do Evento
                              </p>
                              <p className="text-xs text-slate-600 leading-relaxed font-medium">{log.details}</p>
                            </div>
                          )}

                          {/* Visual Diffing Engine */}
                          {(!!log.old_data || !!log.new_data) && (
                            <div className="space-y-3">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Activity className="w-3 h-3 text-blue-500" /> Análise de Mutação de Dados
                              </p>
                              
                              <JsonDiff oldData={log.old_data} newData={log.new_data} />

                              <div className="flex items-center gap-4 mt-4">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(JSON.stringify({ old: log.old_data, new: log.new_data }, null, 2));
                                    alert('JSON copiado para a área de transferência.');
                                  }}
                                  className="flex items-center gap-1.5 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-50 px-2 py-1 rounded-md transition-all"
                                >
                                  <FileText className="w-3 h-3" />
                                  Copiar JSON
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Dados Brutos:', { old: log.old_data, new: log.new_data });
                                    alert('Dados brutos enviados para o console do desenvolvedor.');
                                  }}
                                  className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:underline"
                                >
                                  Ver no Console
                                </button>
                              </div>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between pt-4 border-t border-slate-200/50">
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">ID LOG: {log.id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">TENANT: {log._tenantid || 'GLOBAL'}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              )}
            />
            
            {/* Botão Flutuante de Topo */}
            <AnimatePresence>
              {showScrollTop && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={() => virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' })}
                  className="absolute bottom-8 right-8 w-14 h-14 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center justify-center z-30 border-4 border-white active:scale-90 transition-all group"
                >
                  <ArrowUp size={24} strokeWidth={3} className="group-hover:-translate-y-1 transition-transform" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer de Governança */}
      <footer className="bg-white border-t border-slate-200 p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
          <Info className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
            <span className="font-black text-slate-900 uppercase tracking-tighter mr-1">Aviso de Integridade:</span>
            Esta trilha de auditoria é protegida por políticas de imutabilidade. 
            Todas as mutações de estado no Ativo Imobilizado são registradas com carimbo de tempo atômico para fins de compliance fiscal e contábil (CPC 27).
          </p>
        </div>
      </footer >
    </div>
  );
};

export default AuditLogs;
