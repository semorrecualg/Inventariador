
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  Activity, 
  Clock,
  ChevronRight,
  ChevronDown,
  Info,
  Download,
  ArrowUp
} from 'lucide-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import BackButton from './BackButton';
import { User, DatabaseMode } from '../types';
import { fetchAuditLogs, fetchAssetLogs } from '../services/supabaseService';
import { safeStringify } from '../services/utils';

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
  old_data?: unknown;
  new_data?: unknown;
  details?: string;
  tenant_id?: string;
  origin?: string;
}

const AuditLogs: React.FC<AuditLogsProps> = ({ user, onBack, databaseMode }) => {
  const [logs, setLogs] = useState<AuditLogDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [logType, setLogType] = useState<'SYSTEM' | 'ASSET'>('ASSET');
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useEffect(() => {
    const loadLogs = async () => {
      if (databaseMode === DatabaseMode.SUPABASE && user?.tenantid) {
        setLoading(true);
        try {
          const data = logType === 'SYSTEM' 
            ? await fetchAuditLogs(user.tenantid)
            : await fetchAssetLogs(user.tenantid);
          
          // Normalizar dados de asset_logs para o formato esperado pelo componente
          const normalizedData = (data as Record<string, unknown>[]).map(log => ({
            ...log,
            // Se for asset_logs, mapear campos correspondentes
            record_id: (log.record_id || log.asset_id) as string,
            table_name: (log.table_name || 'assets') as string,
            tenant_id: (log.tenant_id || log.tenantid) as string
          }));

          setLogs(normalizedData as unknown as AuditLogDB[]);
        } catch (error) {
          console.error('Erro ao carregar logs:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    loadLogs();
  }, [databaseMode, user, logType]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.user_email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.details?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.record_id?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesAction = filterAction === 'ALL' || log.action === filterAction;
    
    return matchesSearch && matchesAction;
  });

  const actions = logType === 'SYSTEM' 
    ? ['ALL', 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'BULK_UPDATE']
    : ['ALL', 'CREATE', 'UPDATE', 'DELETE', 'IMPAIRMENT_TEST'];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR');
  };

  const exportLogs = () => {
    const dataStr = safeStringify(filteredLogs, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `audit_logs_${new Date().getTime()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <div className="flex flex-col h-full bg-bg text-ink font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-ink text-bg px-6 py-4 flex items-center justify-between shadow-lg z-10">
        <div className="flex items-center gap-4">
          <BackButton onClick={onBack} label="Voltar" subLabel="Log de Auditoria" />
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">Trilha de Auditoria</h1>
            <p className="text-xs opacity-60 font-mono tracking-widest uppercase">Audit Trail System v24.50</p>
          </div>
        </div>
        <button 
          onClick={exportLogs}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors text-sm font-bold uppercase tracking-widest"
        >
          <Download className="w-4 h-4" />
          Exportar
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-line p-4 space-y-4 shadow-sm">
        {/* Log Type Toggle */}
        <div className="flex p-1 bg-bg rounded-xl border border-line">
          <button
            onClick={() => { setLogType('ASSET'); setFilterAction('ALL'); }}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${logType === 'ASSET' ? 'bg-ink text-bg shadow-sm' : 'text-ink-muted'}`}
          >
            Ativos (Granular)
          </button>
          <button
            onClick={() => { setLogType('SYSTEM'); setFilterAction('ALL'); }}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${logType === 'SYSTEM' ? 'bg-ink text-bg shadow-sm' : 'text-ink-muted'}`}
          >
            Sistema (Geral)
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" />
          <input 
            type="text"
            placeholder="BUSCAR POR USUÁRIO, ID OU DETALHES..."
            className="w-full pl-10 pr-4 py-3 bg-bg border border-line rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ink/20 transition-all uppercase"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {actions.map(action => (
            <button
              key={action}
              onClick={() => setFilterAction(action)}
              className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border ${
                filterAction === action 
                ? 'bg-ink text-bg border-ink' 
                : 'bg-bg text-ink-muted border-line hover:border-ink'
              }`}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-bg/50">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="w-12 h-12 border-4 border-ink/10 border-t-ink rounded-full animate-spin"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Carregando logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4 opacity-40">
            <Activity className="w-16 h-16" />
            <p className="text-xs font-bold uppercase tracking-widest">Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="h-full relative">
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              data={filteredLogs}
              atTopStateChange={(atTop) => setShowScrollTop(!atTop)}
              itemContent={(index, log) => (
              <div className="px-4 py-1.5">
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-line rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
                >
                  <div 
                    className="p-4 cursor-pointer flex items-center justify-between"
                    onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        log.action === 'DELETE' ? 'bg-red-100 text-red-600' :
                        log.action === 'INSERT' ? 'bg-green-100 text-green-600' :
                        log.action === 'UPDATE' ? 'bg-blue-100 text-blue-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-tighter bg-ink text-bg px-1.5 py-0.5 rounded">
                            {log.action}
                          </span>
                          <span className="text-xs font-bold text-ink truncate max-w-[150px]">
                            {log.user_email}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-ink-muted font-mono">
                          <Clock className="w-3 h-3" />
                          {formatDate(log.timestamp)}
                        </div>
                      </div>
                    </div>
                    {expandedLogId === log.id ? <ChevronDown className="w-5 h-5 opacity-40" /> : <ChevronRight className="w-5 h-5 opacity-40" />}
                  </div>

                  {expandedLogId === log.id && (
                    <div className="px-4 pb-4 border-t border-line bg-bg/30 space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Tabela</p>
                          <p className="text-xs font-mono">{log.table_name || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">ID Registro</p>
                          <p className="text-xs font-mono truncate">{log.record_id || 'N/A'}</p>
                        </div>
                      </div>

                      {log.details && (
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Detalhes</p>
                          <p className="text-xs bg-white p-2 rounded border border-line">{log.details}</p>
                        </div>
                      )}

                      {(!!log.old_data || !!log.new_data) && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Alterações de Dados</p>
                          <div className="grid grid-cols-1 gap-2">
                            {!!log.old_data && (
                              <div className="bg-red-50 p-2 rounded border border-red-100">
                                <p className="text-[8px] font-bold text-red-600 uppercase mb-1">Dados Anteriores</p>
                                <pre className="text-[10px] font-mono overflow-x-auto">
                                  {safeStringify(log.old_data, 2)}
                                </pre>
                              </div>
                            )}
                            {!!log.new_data && (
                              <div className="bg-green-50 p-2 rounded border border-green-100">
                                <p className="text-[8px] font-bold text-green-600 uppercase mb-1">Novos Dados</p>
                                <pre className="text-[10px] font-mono overflow-x-auto">
                                  {safeStringify(log.new_data, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          />
          
          {/* Scroll to top button */}
          {showScrollTop && (
            <button
              onClick={() => virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' })}
              className="absolute bottom-6 right-6 w-12 h-12 bg-ink text-bg rounded-full shadow-2xl flex items-center justify-center animate-bounce z-30 border-4 border-white active:scale-90 transition-all"
            >
              <ArrowUp size={24} strokeWidth={3} />
            </button>
          )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-white border-t border-line p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
          <Info className="w-4 h-4" />
        </div>
        <p className="text-[10px] text-ink-muted leading-tight">
          Esta trilha de auditoria é imutável e gerada automaticamente por triggers no banco de dados. 
          Todas as ações críticas são registradas para conformidade e segurança.
        </p>
      </div>
    </div>
  );
};

export default AuditLogs;
