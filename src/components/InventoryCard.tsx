import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, DexieAsset } from '../services/sqliteService';
import { saveCollectedAssetAtomic } from '../services/persistenceService';
import { 
  ArrowLeft, 
  MapPin, 
  Check, 
  Search, 
  AlertTriangle, 
  Battery, 
  BatteryCharging,
  Database,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

interface InventoryCardProps {
  onBack: () => void;
  userEmail?: string;
  userName?: string;
  currentCampaignId?: string | null;
}

interface BatteryStatus {
  level: number;
  charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export const InventoryCard: React.FC<InventoryCardProps> = ({
  onBack,
  userEmail = 'auditor@gbr.com.br',
  userName = 'Auditor SRE',
  currentCampaignId = null
}) => {
  // --- Estados do Componente ---
  const [unidades, setUnidades] = useState<string[]>([]);
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string>('');
  const [ativos, setAtivos] = useState<DexieAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingUnidades, setLoadingUnidades] = useState<boolean>(false);

  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterConferido, setFilterConferido] = useState<'todos' | 'conferido' | 'pendente'>('todos');
  const [filterContaEspecial, setFilterContaEspecial] = useState<boolean>(false);

  // Paginação rígida (OOM Guard)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 20;

  // Mutação e Detalhe de Ativo Selecionado
  const [ativoDetalhado, setAtivoDetalhado] = useState<DexieAsset | null>(null);
  const [novoStatusLocal, setNovoStatusLocal] = useState<string>('');
  const [novaObservacao, setNovaObservacao] = useState<string>('');

  // Notificações e Telemetria
  const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(1);
  const [batteryCharging, setBatteryCharging] = useState<boolean>(true);

  // --- Estados do Coletor de Código de Barras / RFID ---
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'divergence' | 'surplus';
    message: string;
    asset?: DexieAsset;
  } | null>(null);

  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [pendingAssetToTransfer, setPendingAssetToTransfer] = useState<DexieAsset | null>(null);

  const [showSurplusModal, setShowSurplusModal] = useState<boolean>(false);
  const [surplusDescription, setSurplusDescription] = useState<string>('');
  const [surplusSerial, setSurplusSerial] = useState<string>('');
  const [surplusObservation, setSurplusObservation] = useState<string>('');

  // --- Efeito: Monitoramento de Hardware (Bateria) ---
  useEffect(() => {
    let batteryObj: BatteryStatus | null = null;

    const updateBatteryInfo = () => {
      if (batteryObj) {
        setBatteryLevel(batteryObj.level);
        setBatteryCharging(batteryObj.charging);
      }
    };

    if ('getBattery' in navigator) {
      const nav = navigator as unknown as { getBattery: () => Promise<BatteryStatus> };
      nav.getBattery().then((battery) => {
        batteryObj = battery;
        updateBatteryInfo();
        battery.addEventListener('levelchange', updateBatteryInfo);
        battery.addEventListener('chargingchange', updateBatteryInfo);
      }).catch((e: unknown) => {
        console.warn('>>> [Hardware API] Falha ao ler bateria:', e);
      });
    }

    return () => {
      if (batteryObj) {
        batteryObj.removeEventListener('levelchange', updateBatteryInfo);
        batteryObj.removeEventListener('chargingchange', updateBatteryInfo);
      }
    };
  }, []);

  // --- Função: Mostrar Notificação ---
  const triggerNotification = useCallback((type: 'success' | 'warning' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  }, []);

  // --- Carregar Filiais Reativamente (Leitura Dinâmica) ---
  const carregarFiliais = useCallback(async () => {
    setLoadingUnidades(true);
    try {
      // Buscar filiais de forma única usando orderBy do Dexie
      const list: string[] = await db.local_assets.orderBy('filial').uniqueKeys() as string[];
      // Filtrar strings nulas ou vazias
      const filtradas = list.filter((f) => typeof f === 'string' && f.trim() !== '');
      setUnidades(filtradas);
      
      // Auto-selecionar a primeira se houver e nenhuma estiver selecionada
      if (filtradas.length > 0 && !unidadeSelecionada) {
        setUnidadeSelecionada(filtradas[0]);
      }
    } catch (err) {
      console.error('>>> [Dexie v4.00-PROD] Erro ao carregar filiais:', err);
      triggerNotification('error', 'Erro de banco de dados ao buscar filiais ativas.');
    } finally {
      setLoadingUnidades(false);
    }
  }, [unidadeSelecionada, triggerNotification]);

  // Carregar filiais ao montar o componente
  useEffect(() => {
    carregarFiliais();
  }, [carregarFiliais]);

  // --- Carregar Ativos da Filial Selecionada ---
  const carregarAtivos = useCallback(async () => {
    if (!unidadeSelecionada) {
      setAtivos([]);
      return;
    }
    setLoading(true);
    try {
      // Busca reativa no Dexie para a filial selecionada
      const list = await db.local_assets
        .where('filial')
        .equals(unidadeSelecionada)
        .toArray();
      
      // Filtrar deletados fisicamente no local
      const ativosAtivos = (list || []).filter(item => item._is_deleted !== 1);
      setAtivos(ativosAtivos);
      setCurrentPage(1); // Resetar página
    } catch (err) {
      console.error('>>> [Dexie v4.00-PROD] Erro ao carregar ativos:', err);
      triggerNotification('error', 'Falha crítica ao buscar inventário local no Dexie.');
    } finally {
      setLoading(false);
    }
  }, [unidadeSelecionada, triggerNotification]);

  // Recarregar sempre que selecionar uma unidade operacional
  useEffect(() => {
    carregarAtivos();
  }, [carregarAtivos]);

  // --- Filtros no Frontend com Optional Chaining (Volumetria Defensiva) ---
  const filteredAtivos = useMemo(() => {
    return (ativos || []).filter((ativo) => {
      // Filtro de texto (etiqueta, descrição ou serial)
      const term = searchTerm.toLowerCase().trim();
      const matchText = term === '' || 
        (ativo.etiqueta?.toLowerCase() || '').includes(term) ||
        (ativo.descricaodoativo?.toLowerCase() || '').includes(term) ||
        (ativo.serial?.toLowerCase() || '').includes(term) ||
        (ativo.primarykey?.toLowerCase() || '').includes(term);

      // Filtro de status de conferência
      const isConferido = ativo._conferido === 1;
      const matchConferido = filterConferido === 'todos' ||
        (filterConferido === 'conferido' && isConferido) ||
        (filterConferido === 'pendente' && !isConferido);

      // Filtro de conta de eliminação fiscal (131105001)
      const isContaEspecial = ativo.contacontabil === '131105001';
      const matchConta = !filterContaEspecial || isContaEspecial;

      return matchText && matchConferido && matchConta;
    });
  }, [ativos, searchTerm, filterConferido, filterContaEspecial]);

  // --- Estatísticas de Execução ---
  const stats = useMemo(() => {
    const list = filteredAtivos || [];
    const total = list.length;
    const conferidos = list.filter(a => a._conferido === 1).length;
    const pendentes = total - conferidos;
    const somaFinanceira = list.reduce((acc, curr) => acc + (curr.vlraquisic || 0), 0);
    const contaEspecialContagem = list.filter(a => a.contacontabil === '131105001').length;

    return {
      total,
      conferidos,
      pendentes,
      somaFinanceira,
      contaEspecialContagem
    };
  }, [filteredAtivos]);

  // --- Paginação Rígida (OOM Guard) ---
  const totalPages = Math.max(1, Math.ceil(filteredAtivos.length / itemsPerPage));
  const paginatedAtivos = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAtivos.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAtivos, currentPage]);

  // --- Tratamento de Hardware & Gravação de Ativo ---
  const handleUpdateAtivoStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ativoDetalhado) return;

    // 1. Tratamento de Hardware: Se bateria < 5% e não estiver carregando, aborta de forma impeditiva
    const isBatteryCritical = batteryLevel <= 0.05 && !batteryCharging;
    if (isBatteryCritical) {
      triggerNotification(
        'error', 
        `Operação cancelada! Bateria em nível crítico (${Math.round(batteryLevel * 100)}%) sem alimentação externa. Conecte o carregador para salvar.`
      );
      return;
    }

    try {
      // 2. Isolamento de Contrato Contábil para conta de eliminação fiscal 131105001
      const isEliminacaoFiscal = ativoDetalhado.contacontabil === '131105001';
      
      // Definir metadados e status
      const updatedItem: DexieAsset = {
        ...ativoDetalhado,
        status: novoStatusLocal || ativoDetalhado.status,
        _conferido: 1, // Marcar como conferido
        _history: JSON.stringify([
          ...(JSON.parse(ativoDetalhado._history || '[]')),
          {
            data: new Date().toISOString(),
            auditor: userEmail,
            status_anterior: ativoDetalhado.status,
            novo_status: novoStatusLocal,
            obs: novaObservacao
          }
        ]),
        // Se pertencer à conta 131105001, manter _is_synced = 0 de forma perpétua localmente
        _is_synced: isEliminacaoFiscal ? 0 : 0, // Por padrão local, marcamos como pendente de sincronização (0)
        _auditor: userEmail,
        _dataLeitura: new Date().toISOString()
      };

      // 3. Salvar no IndexedDB usando Dexie
      await db.local_assets.put(updatedItem);

      // Também replicar nas outras tabelas de compatibilidade se existirem registros correspondentes
      const existsAtivos = await db.ativos.get(ativoDetalhado.primarykey);
      if (existsAtivos) {
        await db.ativos.put(updatedItem);
      }
      const existsAssets = await db.assets.get(ativoDetalhado.primarykey);
      if (existsAssets) {
        await db.assets.put(updatedItem);
      }

      // Log de auditoria local no Dexie
      await db.audit_logs.put({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        usuario: userEmail,
        acao: `CONFERENCIA_CAMPANHA_FISICA`,
        tabela: `local_assets`,
        registro_id: ativoDetalhado.primarykey,
        details: `Conferência do ativo ${ativoDetalhado.etiqueta}. Status: ${novoStatusLocal}. Conta: ${ativoDetalhado.contacontabil}. Obs: ${novaObservacao}`,
        delta: JSON.stringify({
          antes: { status: ativoDetalhado.status, _conferido: ativoDetalhado._conferido },
          depois: { status: novoStatusLocal, _conferido: 1, _is_synced: updatedItem._is_synced }
        }),
        updated_at: new Date().toISOString()
      });

      // Recarregar os ativos para manter a consistência da UI
      await carregarAtivos();

      // Fechar modal e enviar sucesso
      setAtivoDetalhado(null);
      setNovaObservacao('');
      
      if (isEliminacaoFiscal) {
        triggerNotification('warning', `Conferência gravada localmente! Conta de Eliminação Contábil '131105001' detectada. Sincronização em nuvem bloqueada para este item.`);
      } else {
        triggerNotification('success', `Ativo ${ativoDetalhado.etiqueta} conferido com sucesso.`);
      }

    } catch (err) {
      console.error('>>> [Dexie v4.00-PROD] Erro ao gravar status do ativo:', err);
      triggerNotification('error', 'Falha interna ao persistir mutação no Dexie.');
    }
  };

  // Abrir detalhes de um ativo para edição
  const abrirDetalhesAtivo = (ativo: DexieAsset) => {
    setAtivoDetalhado(ativo);
    setNovoStatusLocal(ativo.status || 'CONFERIDO');
    setNovaObservacao('');
  };

  // --- Manipuladores de Escaneamento e Confronto ---
  const handleScanSubmit = async (code: string) => {
    if (!code) return;
    const normalizedBarcode = code.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!normalizedBarcode) return;

    setIsSaving(true);
    setScanFeedback(null);

    // 1. Tratamento de Hardware: Se bateria < 5% e não estiver carregando, aborta de forma impeditiva
    const isBatteryCritical = batteryLevel <= 0.05 && !batteryCharging;
    if (isBatteryCritical) {
      triggerNotification(
        'error', 
        `Operação cancelada! Bateria em nível crítico (${Math.round(batteryLevel * 100)}%) sem alimentação externa.`
      );
      setIsSaving(false);
      return;
    }

    try {
      // Buscar primeiro por primarykey ou etiqueta na tabela de ativos
      let asset = await db.ativos.where('primarykey').equals(normalizedBarcode).first();
      if (!asset) {
        asset = await db.ativos.where('etiqueta').equals(normalizedBarcode).first();
      }

      if (asset) {
        // Encontrou o ativo cadastrado!
        const assetUnit = String(asset.filial || asset._unitid || '').toUpperCase().trim();
        const currentUnit = unidadeSelecionada.toUpperCase().trim();

        if (assetUnit === currentUnit) {
          // SUCESSO OPERACIONAL (Verde): mesma filial
          await saveCollectedAssetAtomic({
            ...asset,
            _conferido: 1,
            _is_synced: 0,
            status: 'CONFERIDO'
          });

          await carregarAtivos();

          setScanFeedback({
            type: 'success',
            message: `Ativo ${normalizedBarcode} conferido com sucesso na filial atual!`,
            asset
          });
          setBarcodeInput('');
        } else {
          // DIVERGÊNCIA DE LOCALIDADE (Amarelo): filial diferente
          setPendingAssetToTransfer(asset);
          setShowTransferModal(true);
          setScanFeedback({
            type: 'divergence',
            message: `O ativo ${normalizedBarcode} foi cadastrado originalmente na filial ${assetUnit || 'NÃO CONFIGURADA'}. Deseja transferi-lo para a filial atual (${unidadeSelecionada})?`,
            asset
          });
        }
      } else {
        // SOBRA FÍSICA / EXCEDENTE (Laranja): não localizado
        setScanFeedback({
          type: 'surplus',
          message: `O ativo ${normalizedBarcode} não foi localizado na base local. Deseja registrá-lo como Sobra Física (Excedente)?`
        });
        setShowSurplusModal(true);
      }
    } catch (err) {
      console.error(">>> [InventoryCard] Erro no confronto assíncrono de ativo:", err);
      triggerNotification('error', 'Falha física de acesso ao IndexedDB durante o confronto.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!pendingAssetToTransfer) return;

    // Trava preventiva de bateria baixa (< 5%) sem alimentação externa
    const isBatteryCritical = batteryLevel <= 0.05 && !batteryCharging;
    if (isBatteryCritical) {
      triggerNotification(
        'error', 
        `Operação cancelada! Bateria em nível crítico (${Math.round(batteryLevel * 100)}%) sem alimentação externa.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const updatedAsset: DexieAsset = {
        ...pendingAssetToTransfer,
        filial: unidadeSelecionada,
        _conferido: 1,
        _is_synced: 0,
        status: 'CONFERIDO_TRANSFERIDO',
        _history: JSON.stringify([
          ...(JSON.parse(pendingAssetToTransfer._history || '[]')),
          {
            data: new Date().toISOString(),
            auditor: userEmail,
            status_anterior: pendingAssetToTransfer.status || 'PENDENTE',
            novo_status: 'CONFERIDO_TRANSFERIDO',
            obs: `Transferido da filial ${pendingAssetToTransfer.filial} para ${unidadeSelecionada} via Coletor SRE.`
          }
        ])
      };

      await saveCollectedAssetAtomic(updatedAsset);
      await carregarAtivos();

      triggerNotification('success', `Ativo ${pendingAssetToTransfer.etiqueta || pendingAssetToTransfer.primarykey} transferido e conferido com sucesso!`);
      setBarcodeInput('');
      setScanFeedback(null);
      setShowTransferModal(false);
      setPendingAssetToTransfer(null);
    } catch (err) {
      console.error(">>> [InventoryCard] Erro ao transferir ativo:", err);
      triggerNotification('error', 'Falha ao processar transferência.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSurplus = async () => {
    if (!barcodeInput) return;
    const cleanBarcode = barcodeInput.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleanBarcode) return;

    // Trava preventiva de bateria baixa (< 5%) sem alimentação externa
    const isBatteryCritical = batteryLevel <= 0.05 && !batteryCharging;
    if (isBatteryCritical) {
      triggerNotification(
        'error', 
        `Operação cancelada! Bateria em nível crítico (${Math.round(batteryLevel * 100)}%) sem alimentação externa.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const newSurplus: DexieAsset = {
        primarykey: cleanBarcode,
        etiqueta: cleanBarcode,
        filial: unidadeSelecionada,
        descricaodoativo: surplusDescription.trim() || 'SOBRA FÍSICA - EXCEDENTE DE CAMPO',
        serial: surplusSerial.trim() || 'SEM SERIAL',
        status: 'SOBRA_FISICA',
        _conferido: 1,
        _is_synced: 0,
        observacao: surplusObservation.trim(),
        _auditor: userEmail,
        _dataLeitura: new Date().toISOString(),
        _history: JSON.stringify([{
          data: new Date().toISOString(),
          auditor: userEmail,
          status_anterior: 'NÃO CADASTRADO',
          novo_status: 'SOBRA_FISICA',
          obs: 'Cadastrado como Sobra Física (Surplus) de campo via Coletor SRE.'
        }])
      };

      await saveCollectedAssetAtomic(newSurplus);
      
      // Garante escrita explícita local de compatibilidade nas coleções do Dexie
      await db.local_assets.put(newSurplus);
      await db.ativos.put(newSurplus);

      await carregarAtivos();

      triggerNotification('success', `Sobra física ${cleanBarcode} registrada e conferida na unidade ${unidadeSelecionada}!`);
      setBarcodeInput('');
      setScanFeedback(null);
      setShowSurplusModal(false);
      setSurplusDescription('');
      setSurplusSerial('');
      setSurplusObservation('');
    } catch (err) {
      console.error(">>> [InventoryCard] Erro ao cadastrar sobra física:", err);
      triggerNotification('error', 'Falha ao registrar sobra física no IndexedDB.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="gbr-inventory-card-screen" className="flex flex-col h-full bg-slate-900 text-slate-100 font-sans">
      {/* --- NOTIFICAÇÃO FLUTUANTE (Sem window.alert) --- */}
      {notification && (
        <div 
          id="gbr-notification-toast"
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] flex items-center space-x-3 px-6 py-4 rounded-2xl shadow-2xl border transition-all duration-300 animate-slideDown ${
            notification.type === 'error' ? 'bg-red-950 border-red-500 text-red-200' :
            notification.type === 'warning' ? 'bg-amber-950 border-amber-500 text-amber-200' :
            'bg-emerald-950 border-emerald-500 text-emerald-200'
          }`}
        >
          <AlertTriangle size={20} className={notification.type === 'error' ? 'text-red-400' : notification.type === 'warning' ? 'text-amber-400' : 'text-emerald-400'} />
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider">
              {notification.type === 'error' ? 'FALHA DE COBERTURA' : notification.type === 'warning' ? 'ALERTA RESTRITO' : 'SUCESSO OPERACIONAL'}
            </span>
            <p className="text-[11px] font-medium leading-relaxed max-w-md">{notification.message}</p>
          </div>
        </div>
      )}

      {/* --- CABEÇALHO TÁTICO --- */}
      <header id="gbr-inventory-header" className="bg-slate-950 border-b border-slate-800 p-4 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-4">
            <button 
              id="btn-back-dashboard"
              onClick={onBack} 
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Voltar ao Painel"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                <h1 className="text-sm font-black uppercase tracking-widest text-white">CARD AZUL DE INVENTÁRIO</h1>
              </div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Consolidação local via Dexie.js (v4.00-PROD)</p>
            </div>
          </div>

          {/* --- TELEMETRIA DE HARDWARE & SISTEMA --- */}
          <div className="flex items-center space-x-3 text-[10px] font-mono bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            {/* Indicador de Base de Dados */}
            <div className="flex items-center space-x-1.5 text-blue-400">
              <Database size={12} />
              <span className="font-bold">InventoryLocalStore</span>
            </div>

            <div className="h-3 w-px bg-slate-800" />

            {/* Bateria */}
            <div className={`flex items-center space-x-1 ${batteryLevel <= 0.05 && !batteryCharging ? 'text-red-400 animate-pulse font-bold' : 'text-slate-400'}`}>
              {batteryCharging ? <BatteryCharging size={13} className="text-emerald-400" /> : <Battery size={13} />}
              <span>{Math.round(batteryLevel * 100)}%</span>
            </div>
          </div>
        </div>
      </header>

      {/* --- CONTEÚDO PRINCIPAL (GRID) --- */}
      <main id="gbr-inventory-grid-body" className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* --- MOTOR DE CAPTURA E ENTRADA ATÔMICA (SRE) --- */}
        <div className="bg-slate-950 p-5 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
            <div className="flex items-center space-x-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <label htmlFor="input-barcode-capture" className="text-[10px] font-black uppercase tracking-widest text-slate-200">
                Coletor Ativo de Código de Barras / RFID Tag (SRE)
              </label>
            </div>
            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-mono font-bold">
              CONEXÃO ATÔMICA ACID
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleScanSubmit(barcodeInput); }} className="flex gap-3">
            <div className="flex-1 relative">
              <input 
                id="input-barcode-capture"
                type="text" 
                placeholder={isSaving ? "GRAVANDO REGISTRO..." : "ESCANEIE OU DIGITE O CÓDIGO DA PLAQUETA/RFID..."}
                value={barcodeInput}
                disabled={isSaving}
                onChange={(e) => setBarcodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl pl-11 pr-4 py-3.5 text-xs font-mono font-bold tracking-widest placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-all uppercase"
                autoComplete="off"
                autoFocus
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                <Search size={15} className="text-slate-500" />
              </div>
            </div>
            <button
              id="btn-submit-scanned-code"
              type="submit"
              disabled={isSaving || !barcodeInput}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-black uppercase tracking-wider text-[10px] transition-colors shrink-0"
            >
              CONFERIR
            </button>
          </form>

          {/* Visual state feedback cards */}
          {scanFeedback && (
            <div 
              id="scanned-asset-feedback-card"
              className={`p-4 rounded-2xl border flex items-start space-x-3 transition-all ${
                scanFeedback.type === 'success' 
                  ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' 
                  : scanFeedback.type === 'divergence' 
                    ? 'bg-amber-950/30 border-amber-900/50 text-amber-400' 
                    : 'bg-orange-950/30 border-orange-900/50 text-orange-400'
              }`}
            >
              <AlertTriangle className="shrink-0 mt-0.5" size={16} />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {scanFeedback.type === 'success' && 'SUCESSO OPERACIONAL'}
                    {scanFeedback.type === 'divergence' && 'DIVERGÊNCIA DE LOCALIDADE'}
                    {scanFeedback.type === 'surplus' && 'SOBRA FÍSICA DETECTADA (EXCEDENTE)'}
                  </span>
                  <button 
                    onClick={() => setScanFeedback(null)} 
                    className="text-[9px] uppercase font-black tracking-widest hover:underline opacity-80"
                  >
                    Fechar
                  </button>
                </div>
                <p className="text-xs font-semibold leading-relaxed">
                  {scanFeedback.message}
                </p>
                {scanFeedback.asset && (
                  <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-900 flex flex-wrap gap-x-4">
                    <span>Etiqueta: {scanFeedback.asset.etiqueta}</span>
                    <span>Desc: {scanFeedback.asset.descricaodoativo}</span>
                    <span>Original: {scanFeedback.asset.filial}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* FILIAL SELECTOR & TELEMETRIA OPERACIONAL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-slate-950 p-5 rounded-3xl border border-slate-800 flex flex-col justify-between space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Unidade Física Operacional (Filtro Estrito SQLite migrado)</label>
              <div className="relative">
                <select 
                  id="select-filial-dynamic"
                  value={unidadeSelecionada} 
                  onChange={(e) => setUnidadeSelecionada(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                  disabled={loadingUnidades}
                >
                  {loadingUnidades ? (
                    <option>Buscando unidades no IndexedDB...</option>
                  ) : unidades.length === 0 ? (
                    <option value="">Nenhuma filial cadastrada na soberania</option>
                  ) : (
                    unidades.map(unidade => (
                      <option key={unidade} value={unidade}>{unidade}</option>
                    ))
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <MapPin size={14} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
                Operador: <span className="text-slate-200 font-bold">{userName}</span>
              </span>
              <span className="bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
                Conectado: <span className="text-slate-200 font-bold">{userEmail}</span>
              </span>
              {currentCampaignId && (
                <span className="bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
                  Campanha: <span className="text-blue-400 font-bold">{currentCampaignId}</span>
                </span>
              )}
            </div>
          </div>

          {/* PAINEL DE ESTATÍSTICAS DA UNIDADE */}
          <div className="bg-slate-950 p-5 rounded-3xl border border-slate-800 grid grid-cols-2 gap-4">
            <div className="flex flex-col justify-between p-3.5 bg-slate-900 rounded-2xl border border-slate-800">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ativos Totais</span>
              <div className="flex items-baseline space-x-1.5 mt-2">
                <span className="text-xl font-black text-white">{stats.total}</span>
                <span className="text-[10px] font-mono text-slate-500">itens</span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-3.5 bg-emerald-950/20 rounded-2xl border border-emerald-900/30">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Conferidos</span>
              <div className="flex items-baseline space-x-1.5 mt-2">
                <span className="text-xl font-black text-emerald-300">{stats.conferidos}</span>
                <span className="text-[9px] font-mono text-emerald-500">({stats.total > 0 ? Math.round((stats.conferidos / stats.total) * 100) : 0}%)</span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-3.5 bg-amber-950/20 rounded-2xl border border-amber-900/30">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Pendentes</span>
              <div className="flex items-baseline space-x-1.5 mt-2">
                <span className="text-xl font-black text-amber-300">{stats.pendentes}</span>
                <span className="text-[10px] font-mono text-amber-500">itens</span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-3.5 bg-blue-950/20 rounded-2xl border border-blue-900/30">
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Valor Acumulado</span>
              <div className="flex items-baseline mt-2">
                <span className="text-xs text-blue-400 mr-0.5">R$</span>
                <span className="text-sm font-black text-blue-300">
                  {stats.somaFinanceira.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* --- GRADE DE FILTROS E BUSCA DE ATIVOS --- */}
        <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input 
                id="input-asset-search"
                type="text" 
                placeholder="Buscar por Etiqueta, Descrição, Chave Primária ou Serial..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Search size={14} />
              </div>
            </div>

            {/* Seletor de Conferência */}
            <div className="flex items-center space-x-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
              <button
                onClick={() => setFilterConferido('todos')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  filterConferido === 'todos' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterConferido('conferido')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  filterConferido === 'conferido' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Conferidos
              </button>
              <button
                onClick={() => setFilterConferido('pendente')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  filterConferido === 'pendente' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pendentes
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-900">
            {/* Switch de Filtro Especial da Conta 131105001 */}
            <div className="flex items-center space-x-2.5">
              <input 
                id="checkbox-filter-special-account"
                type="checkbox"
                checked={filterContaEspecial}
                onChange={(e) => setFilterContaEspecial(e.target.checked)}
                className="w-4 h-4 rounded border-slate-800 text-blue-600 bg-slate-900 focus:ring-blue-500 cursor-pointer"
              />
              <label 
                htmlFor="checkbox-filter-special-account"
                className="text-[10px] uppercase font-black tracking-widest text-slate-400 cursor-pointer flex items-center space-x-1.5 hover:text-white"
              >
                <span>Foco Conta Fiscal Eliminação (131105001)</span>
                {stats.contaEspecialContagem > 0 && (
                  <span className="bg-amber-950 text-amber-300 border border-amber-900 px-1.5 py-0.2 rounded font-mono text-[9px]">
                    {stats.contaEspecialContagem} itens
                  </span>
                )}
              </label>
            </div>

            <div className="text-[10px] text-slate-500 font-medium">
              Mostrando {Math.min(filteredAtivos.length, itemsPerPage)} de {filteredAtivos.length} registros correspondentes
            </div>
          </div>
        </div>

        {/* --- LISTAGEM DE ATIVOS CONFERÍVEIS (OOM Guard / Volumetria Defensiva) --- */}
        <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="animate-spin text-blue-500" size={28} />
              <p className="text-xs uppercase font-black tracking-widest text-slate-400">Consultando indexedDB em tempo real...</p>
            </div>
          ) : paginatedAtivos.length === 0 ? (
            <div className="p-16 text-center">
              <AlertTriangle className="mx-auto text-slate-600 mb-3" size={32} />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Nenhum Ativo Localizado</h3>
              <p className="text-xs text-slate-400 mt-1">Nenhum registro corresponde aos filtros ou à filial selecionada.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-900">
              {paginatedAtivos.map((ativo) => {
                const isConferido = ativo._conferido === 1;
                const isSpecial = ativo.contacontabil === '131105001';

                return (
                  <div 
                    key={ativo.primarykey}
                    id={`asset-row-${ativo.primarykey}`}
                    className="p-4 hover:bg-slate-900/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                    onClick={() => abrirDetalhesAtivo(ativo)}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-xs font-black text-white font-mono uppercase bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {ativo.etiqueta || 'SEM ETIQUETA'}
                        </span>
                        
                        {isSpecial && (
                          <span className="bg-red-950/50 text-red-400 border border-red-900/50 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider">
                            ELIMINAÇÃO CONTÁBIL (131105001)
                          </span>
                        )}

                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          isConferido ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/50' : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}>
                          {isConferido ? 'CONFERIDO' : 'PENDENTE'}
                        </span>
                      </div>

                      <h3 className="text-xs font-semibold text-slate-200 truncate leading-relaxed">
                        {ativo.descricaodoativo || 'SEM DESCRIÇÃO COMPATÍVEL'}
                      </h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[10px] font-mono text-slate-500">
                        <div>S/N: <span className="text-slate-300">{ativo.serial || 'N/A'}</span></div>
                        <div>C.Custo: <span className="text-slate-300">{ativo.centrodecusto || 'N/A'}</span></div>
                        <div>Conta: <span className="text-slate-300">{ativo.contacontabil || 'N/A'}</span></div>
                        <div>Reg/Sub: <span className="text-slate-300">{ativo.registro || '0'}/{ativo.subreg || '0'}</span></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-slate-900 pt-3 md:pt-0">
                      <div className="text-right">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block">VALOR CONTÁBIL</span>
                        <span className="text-xs font-bold text-slate-200 font-mono">
                          R$ {(ativo.vlraquisic || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
                        isConferido ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-white'
                      }`}>
                        <Check size={14} className={isConferido ? 'stroke-[3]' : 'stroke-[2]'} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CONTROLES DE PAGINAÇÃO RÍGIDA */}
          {totalPages > 1 && (
            <div id="gbr-pagination-bar" className="bg-slate-950 px-4 py-3.5 border-t border-slate-900 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={12} />
                <span>Anterior</span>
              </button>

              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Página <span className="text-white font-mono">{currentPage}</span> de <span className="text-white font-mono">{totalPages}</span>
              </span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <span>Próxima</span>
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL DETALHADO DO ATIVO (AÇÃO CONTRA O DEXIE) --- */}
      {ativoDetalhado && (
        <div 
          id="gbr-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setAtivoDetalhado(null)}
        >
          <div 
            id="gbr-modal-content"
            className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-scaleUp max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">CONFERÊNCIA DE CAMPO</span>
                <h3 className="text-sm font-black text-white font-mono uppercase">ETIQUETA: {ativoDetalhado.etiqueta || 'N/A'}</h3>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                ativoDetalhado._conferido === 1 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}>
                {ativoDetalhado._conferido === 1 ? 'REGISTRO CONFERIDO' : 'AGUARDANDO LEITURA'}
              </span>
            </div>

            {/* Conteúdo Físico */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              
              {/* Alerta de Conta Especial de Eliminação */}
              {ativoDetalhado.contacontabil === '131105001' && (
                <div className="p-4 rounded-2xl bg-red-950/30 border border-red-900/50 flex space-x-3 text-red-400">
                  <AlertTriangle className="shrink-0" size={18} />
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider block">CONTA DE ELIMINAÇÃO DETECTADA</span>
                    <p className="text-[11px] leading-relaxed">
                      Este ativo belongs à conta de eliminação fiscal <strong>131105001</strong>. De acordo com as diretrizes SRE (GBR v3.70), as modificações feitas aqui serão travadas localmente com <code>_is_synced = 0</code> para evitar inconsistências nos livros consolidados de nuvem.
                    </p>
                  </div>
                </div>
              )}

              {/* Grid de Informações dos 21 índices */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-900 pb-2">
                  Atributos Contábeis do Registro (Soberania Física)
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="space-y-1.5">
                    <div className="text-slate-500 text-[10px]">DESCRIÇÃO COMPLETA:</div>
                    <div className="text-slate-200 font-sans font-bold leading-relaxed">{ativoDetalhado.descricaodoativo || 'Não especificada'}</div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-slate-500 text-[10px]">VALOR DE AQUISIÇÃO:</div>
                    <div className="text-slate-200 font-bold text-sm text-blue-400">
                      R$ {(ativoDetalhado.vlraquisic || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 col-span-1 md:col-span-2">
                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-850">
                      <div className="text-slate-500 text-[9px]">SÉRIAL NUMBER</div>
                      <div className="text-slate-300 font-bold uppercase tracking-wider mt-0.5">{ativoDetalhado.serial || 'N/A'}</div>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-850">
                      <div className="text-slate-500 text-[9px]">DATA AQUISIÇÃO</div>
                      <div className="text-slate-300 font-bold uppercase tracking-wider mt-0.5">{ativoDetalhado.dataaqusic || 'N/A'}</div>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-850">
                      <div className="text-slate-500 text-[9px]">CONTA CONTÁBIL</div>
                      <div className="text-slate-300 font-bold uppercase tracking-wider mt-0.5">{ativoDetalhado.contacontabil || 'N/A'}</div>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-850">
                      <div className="text-slate-500 text-[9px]">CENTRO DE CUSTO</div>
                      <div className="text-slate-300 font-bold uppercase tracking-wider mt-0.5">{ativoDetalhado.centrodecusto || 'N/A'}</div>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-850">
                      <div className="text-slate-500 text-[9px]">FORNECEDOR</div>
                      <div className="text-slate-300 font-semibold truncate mt-0.5">{ativoDetalhado.nomefornecedor || 'N/A'}</div>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-850">
                      <div className="text-slate-500 text-[9px]">NOTA FISCAL</div>
                      <div className="text-slate-300 font-bold uppercase tracking-wider mt-0.5">{ativoDetalhado.notafiscal || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form de Ação */}
              <form onSubmit={handleUpdateAtivoStatus} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                    Estado Físico / Parecer do Auditor
                  </label>
                  <select 
                    id="select-parecer-status"
                    value={novoStatusLocal}
                    onChange={(e) => setNovoStatusLocal(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="CONFERIDO">CONFERIDO (PERFEITO ESTADO)</option>
                    <option value="DIVERGENCIA">DIVERGÊNCIA (INCONSISTÊNCIA CADASTRAL)</option>
                    <option value="BAIXADO">BAIXADO (NÃO LOCALIZADO NO SETOR)</option>
                    <option value="ADOTADO">ADOTADO (TRANSFERIDO DE OUTRA FILIAL)</option>
                    <option value="FALTA_ETIQUETAR">FALTA ETIQUETAR (ETIQUETA DANIFICADA/AUSENTE)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                    Anotações Técnicas de Campo (Histórico Físico)
                  </label>
                  <textarea 
                    id="textarea-anotacao-campo"
                    placeholder="Insera notas detalhadas para registrar no log de auditoria..."
                    value={novaObservacao}
                    onChange={(e) => setNovaObservacao(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium placeholder:text-slate-600"
                  />
                </div>

                {/* Footer de botões */}
                <div className="flex items-center space-x-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAtivoDetalhado(null)}
                    className="flex-1 py-3 bg-slate-950 text-slate-400 rounded-xl font-bold uppercase tracking-wider text-[10px] border border-slate-800 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    id="btn-confirm-saving-indexeddb"
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20"
                  >
                    Persistir no Dexie
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE CONFIRMAÇÃO DE TRANSFERÊNCIA (DIVERGÊNCIA) --- */}
      {showTransferModal && pendingAssetToTransfer && (
        <div 
          id="gbr-transfer-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
        >
          <div 
            id="gbr-transfer-modal"
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-scaleUp p-6 space-y-6"
          >
            <div className="flex items-start space-x-3 text-amber-400">
              <AlertTriangle className="shrink-0 mt-1" size={24} />
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Divergência Crítica</span>
                <h3 className="text-sm font-black uppercase tracking-wide text-white">Transferir Ativo de Filial?</h3>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              O ativo <strong className="font-mono text-white">{pendingAssetToTransfer.etiqueta || pendingAssetToTransfer.primarykey}</strong> ({pendingAssetToTransfer.descricaodoativo}) está registrado na filial <strong className="text-amber-400">{pendingAssetToTransfer.filial}</strong>. 
              <br/><br/>
              Deseja transferi-lo para a filial atual <strong className="text-emerald-400">{unidadeSelecionada}</strong> e registrá-lo como conferido?
            </p>

            <div className="flex items-center space-x-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => { setShowTransferModal(false); setPendingAssetToTransfer(null); }}
                className="flex-1 py-3 bg-slate-950 text-slate-400 hover:text-white rounded-xl font-bold uppercase tracking-wider text-[10px] border border-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-transfer"
                type="button"
                onClick={handleConfirmTransfer}
                disabled={isSaving}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] transition-colors shadow-lg shadow-amber-900/20 disabled:opacity-50"
              >
                {isSaving ? "PROCESSANDO..." : "SIM, TRANSFERIR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE REGISTRO DE SOBRA FÍSICA (SURPLUS) --- */}
      {showSurplusModal && (
        <div 
          id="gbr-surplus-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
        >
          <div 
            id="gbr-surplus-modal"
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-scaleUp flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">SOBRA FÍSICA / SOBRA SRE</span>
                <h3 className="text-sm font-black text-white font-mono uppercase">CÓDIGO: {barcodeInput}</h3>
              </div>
              <span className="bg-orange-950 text-orange-400 border border-orange-800 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                EXCEDENTE (SURPLUS)
              </span>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Este ativo não pertence a nenhuma filial cadastrada. Preencha os detalhes abaixo para incluí-lo como <strong>Sobra Física (Excedente)</strong> na filial <strong className="text-white">{unidadeSelecionada}</strong>.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                    Descrição do Ativo *
                  </label>
                  <input 
                    type="text" 
                    placeholder="Ex: CADEIRA DE ESCRITÓRIO PRETA"
                    value={surplusDescription}
                    onChange={(e) => setSurplusDescription(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium placeholder:text-slate-700 uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                    Número de Serial (S/N)
                  </label>
                  <input 
                    type="text" 
                    placeholder="Ex: SN-12345-XYZ"
                    value={surplusSerial}
                    onChange={(e) => setSurplusSerial(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium placeholder:text-slate-700 uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                    Observações de Coleta / Campo
                  </label>
                  <textarea 
                    placeholder="Notas técnicas do local físico do ativo excedente..."
                    value={surplusObservation}
                    onChange={(e) => setSurplusObservation(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium placeholder:text-slate-700"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center space-x-3">
              <button
                type="button"
                onClick={() => { setShowSurplusModal(false); setSurplusDescription(''); setSurplusSerial(''); setSurplusObservation(''); }}
                className="flex-1 py-3 bg-slate-900 text-slate-400 hover:text-white rounded-xl font-bold uppercase tracking-wider text-[10px] border border-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-save-surplus"
                type="button"
                onClick={handleSaveSurplus}
                disabled={isSaving}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] transition-colors shadow-lg shadow-orange-900/20 disabled:opacity-50"
              >
                {isSaving ? "GRAVANDO..." : "SALVAR EXCEDENTE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
