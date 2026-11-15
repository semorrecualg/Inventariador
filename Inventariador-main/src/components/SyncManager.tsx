
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Cloud, 
  RefreshCw, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Image as ImageIcon,
  Loader2,
  Wifi,
  WifiOff,
  ShieldCheck,
  Archive,
  RotateCcw
} from 'lucide-react';
import BackButton from './BackButton';
import { SyncQueueItem } from '../types';
import { getPendingSyncItems, processSyncQueue, removeItemFromQueue, clearSyncQueue, getUnsyncedAssetsCount, processDataSyncQueue } from '../services/syncService';
import { getLastSyncSession, describeRejections, type SyncSession } from '../services/syncSessionService';
import { quarantinedFieldEvents, releaseQuarantinedFieldEvent } from '../services/fieldEventStore';
import type { QuarantinedFieldEvent } from '../types/fieldEvent';
import Modal from './Modal';

interface SyncManagerProps {
  onBack: () => void;
  onSyncSuccess?: () => void;
  isFieldMode?: boolean;
  onToggleFieldMode?: () => void;
}

const SyncManager: React.FC<SyncManagerProps> = ({ 
  onBack, 
  onSyncSuccess, 
  isFieldMode = false, 
  onToggleFieldMode 
}) => {
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [unsyncedAssets, setUnsyncedAssets] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [receiptSession, setReceiptSession] = useState<SyncSession | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantinedFieldEvent[]>([]);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    loadItems();

    const handleSynced = () => loadItems();
    window.addEventListener('gbr_photo_synced', handleSynced);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('gbr_photo_synced', handleSynced);
    };
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const pendingItems = await getPendingSyncItems();
    setItems(pendingItems);
    
    const unsyncedCount = await getUnsyncedAssetsCount();
    setUnsyncedAssets(unsyncedCount);

    // F2.4 — recibo do último ciclo, persistido pelo serviço de sessão.
    setReceiptSession(await getLastSyncSession());

    // Log de campo posto de parte: recusado pela chave única da nuvem e fora da
    // fila até alguém decidir devolvê-lo.
    setQuarantine(await quarantinedFieldEvents());

    setLoading(false);
  };

  const handleSyncNow = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      // Sincroniza fotos e dados
      await Promise.all([
        processSyncQueue(),
        processDataSyncQueue()
      ]);
      await loadItems();
      if (onSyncSuccess) onSyncSuccess();
    } catch (error) {
      console.error('Erro ao processar sincronização:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReleaseQuarantined = async (eventId: string) => {
    setReleasingId(eventId);
    try {
      await releaseQuarantinedFieldEvent(eventId);
      await loadItems();
    } catch (error) {
      console.error('Erro ao devolver evento à fila:', error);
    } finally {
      setReleasingId(null);
    }
  };

  const handleRemoveItem = async (id: string) => {
    await removeItemFromQueue(id);
    await loadItems();
  };

  const handleClearAll = async () => {
    await clearSyncQueue();
    await loadItems();
    setIsClearModalOpen(false);
    if (onSyncSuccess) onSyncSuccess();
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      <Modal 
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={handleClearAll}
        title="Limpar Fila"
        message="Deseja realmente limpar toda a fila de sincronização? As fotos não enviadas serão perdidas permanentemente."
        type="confirm"
        confirmText="Limpar Tudo"
        cancelText="Cancelar"
      />
      {/* Header */}
      <div className="pt-12 pb-4 px-4 bg-white border-b border-border flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-3">
          <BackButton onClick={onBack} label="Voltar" subLabel="Gestão de Sincronização" />
        </div>
        <div className="flex items-center space-x-2">
          {isOnline ? (
            <div className="flex items-center space-x-1 bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full border border-emerald-100">
              <Wifi size={10} />
              <span className="text-[8px] font-bold uppercase tracking-widest">Online</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 bg-rose-50 text-rose-600 px-2 py-1 rounded-full border border-rose-100">
              <WifiOff size={10} />
              <span className="text-[8px] font-bold uppercase tracking-widest">Offline</span>
            </div>
          )}
          <div className="w-10 h-10 bg-accent-soft border border-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm">
            <Cloud size={20} />
          </div>
        </div>
      </div>

      {/* Stats & Actions */}
      <div className="p-4 bg-white border-b border-border space-y-4">
        {/* Field Mode Toggle */}
        <div className="bg-bg-main p-4 rounded-2xl border border-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isFieldMode ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
              {isFieldMode ? <WifiOff size={20} /> : <Wifi size={20} />}
            </div>
            <div>
              <p className="text-[10px] font-bold text-ink uppercase tracking-tight">Modo de Campo (Offline)</p>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">
                {isFieldMode ? 'Suspensão de Sincronismo Ativa' : 'Sincronismo Automático Ativo'}
              </p>
            </div>
          </div>
          <button 
            onClick={onToggleFieldMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isFieldMode ? 'bg-rose-500' : 'bg-emerald-500'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isFieldMode ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg-main p-4 rounded-2xl border border-border">
            <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1">Fotos na Fila</p>
            <p className="text-2xl font-bold text-ink">{items.length}</p>
          </div>
          <div className="bg-bg-main p-4 rounded-2xl border border-border">
            <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1">Ativos Pendentes</p>
            <p className="text-2xl font-bold text-ink">{unsyncedAssets}</p>
          </div>
        </div>

        {receiptSession?.receipt && (
          <div className="bg-bg-main p-4 rounded-2xl border border-border space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">Recibo do Último Sync</p>
              <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border ${
                receiptSession.status === 'COMPLETED'
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  : receiptSession.status === 'PARTIAL'
                    ? 'bg-amber-50 text-amber-600 border-amber-100'
                    : 'bg-rose-50 text-rose-600 border-rose-100'
              }`}>
                {receiptSession.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Enviados</p>
                <p className="text-lg font-bold text-ink">{receiptSession.receipt.sent}</p>
              </div>
              <div>
                <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Aceitos</p>
                <p className="text-lg font-bold text-emerald-600">{receiptSession.receipt.accepted}</p>
              </div>
              <div>
                <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Faltam</p>
                <p className={`text-lg font-bold ${receiptSession.receipt.missing > 0 ? 'text-rose-600' : 'text-ink'}`}>
                  {receiptSession.receipt.missing}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[8px] font-bold text-ink-muted uppercase tracking-widest">
              <ShieldCheck size={10} className="text-emerald-600 shrink-0" />
              <span>
                conferência {receiptSession.receipt.checksum}
                {receiptSession.pull ? ` · recebidos ${receiptSession.receipt.received}` : ''}
              </span>
            </div>

            {describeRejections(receiptSession).map(item => (
              <div key={item.key} className="p-2 bg-rose-50 border border-rose-100 rounded-lg">
                <p className="text-[7px] font-black text-rose-900 uppercase tracking-widest leading-tight">
                  {item.key} — {item.reason}
                </p>
              </div>
            ))}
          </div>
        )}

        {quarantine.length > 0 && (
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-bold text-amber-900 uppercase tracking-widest flex items-center gap-1.5">
                <Archive size={10} /> Log de Campo em Quarentena
              </p>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[7px] font-black uppercase tracking-widest">
                {quarantine.length}
              </span>
            </div>
            <p className="text-[8px] font-bold text-amber-800 uppercase tracking-widest leading-snug">
              Recusados pela chave única da nuvem. Ficam fora da fila até serem devolvidos.
            </p>

            {quarantine.map(item => (
              <div key={item.event_id} className="bg-white/70 p-2 rounded-xl border border-amber-100 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[8px] font-black text-ink uppercase tracking-widest truncate">
                      {item.asset_key || item.event_id}
                    </p>
                    <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">
                      {item.event_type} · lamport {item.lamport}
                    </p>
                  </div>
                  <button
                    onClick={() => handleReleaseQuarantined(item.event_id)}
                    disabled={releasingId === item.event_id}
                    className="shrink-0 px-2 py-1 bg-white border border-amber-200 text-amber-800 rounded-lg text-[7px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 flex items-center gap-1"
                  >
                    {releasingId === item.event_id
                      ? <Loader2 size={9} className="animate-spin" />
                      : <RotateCcw size={9} />}
                    Devolver à fila
                  </button>
                </div>
                <p className="text-[7px] font-bold text-rose-700 uppercase tracking-widest leading-tight break-words">
                  {item.reason}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button 
            onClick={handleSyncNow}
            disabled={!isOnline || (items.length === 0 && unsyncedAssets === 0) || isSyncing}
            className="flex-1 py-4 bg-accent text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center space-x-2"
          >
            {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span>Sincronizar Agora</span>
          </button>
          <button 
            onClick={() => setIsClearModalOpen(true)}
            disabled={items.length === 0 || isSyncing}
            className="w-14 h-14 bg-white border border-border text-rose-500 rounded-2xl flex items-center justify-center active:scale-95 transition-all disabled:opacity-30"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-ink-muted" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Lendo fila local...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-40">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Tudo sincronizado!</p>
            <p className="text-[8px] text-center max-w-[200px] uppercase tracking-widest leading-relaxed">Não há fotos pendentes de envio para a nuvem.</p>
          </div>
        ) : (
          items.map((item) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-border rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-bg-main rounded-xl flex items-center justify-center text-ink-muted border border-border">
                    <ImageIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-[10px] font-bold text-ink uppercase tracking-tight">Ativo: {item.assetId}</h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <Clock size={8} className="text-ink-muted" />
                      <span className="text-[8px] font-bold text-ink-muted uppercase">{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => handleRemoveItem(item.id)}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center space-x-2">
                  {item.attempts > 0 ? (
                    <div className="flex items-center space-x-1 text-rose-500">
                      <AlertCircle size={10} />
                      <span className="text-[8px] font-bold uppercase tracking-widest">Falhou ({item.attempts}x)</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 text-amber-500">
                      <Clock size={10} />
                      <span className="text-[8px] font-bold uppercase tracking-widest">Aguardando</span>
                    </div>
                  )}
                </div>
                <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">ID: {item.id.split('-')[0]}</span>
              </div>

              {item.error && (
                <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg">
                  <p className="text-[7px] font-bold text-rose-900 uppercase tracking-widest leading-tight">
                    ERRO: {item.error}
                  </p>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Info Footer */}
      <div className="p-4 bg-white border-t border-border space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <p className="text-[9px] text-ink-muted leading-tight uppercase font-bold tracking-tighter">
            Fotos capturadas em modo offline são armazenadas localmente e enviadas automaticamente quando a conexão é restaurada.
          </p>
        </div>

        {localStorage.getItem('app_database_mode') === 'SUPABASE' && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-[9px] text-blue-900 leading-tight uppercase font-bold tracking-tight">
                🛡️ Modo Nuvem Ativo (Princípio da Redundância)
              </p>
              <p className="text-[8px] text-blue-700/70 leading-tight uppercase font-medium mt-0.5">
                Recomendamos backups locais (.Cloud) por segurança adicional dos dados.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncManager;
