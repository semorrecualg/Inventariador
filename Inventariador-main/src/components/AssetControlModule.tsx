import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  History, 
  Settings, 
  TrendingDown, 
  ArrowLeftRight, 
  PlusCircle, 
  Search,
  Filter,
  Download,
  DollarSign,
  Calendar,
  PieChart,
  CheckCircle2,
  Building2,
  Edit3,
  Trash2,
  AlertCircle,
  Printer,
  FileText
} from 'lucide-react';
import { Asset, UnitConfig } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, logAuditEvent } from '../services/supabaseService';
import { assetControlService } from '../services/assetControlService';
import { AssetGroup, ChartOfAccount, AccountType, AccountNature, AccountClassification, DepreciationMethod, NCMClassifier, DatabaseMode, User, UserRole } from '../types';
import { localDb } from '../services/localDbService';
import { calculateDepreciation } from '../services/depreciationService';
import BackButton from './BackButton';
import AssetGroupsTable from './AssetGroupsTable';
import ChartOfAccountsTable from './ChartOfAccountsTable';
import NCMClassifierTable from './NCMClassifierTable';
import AssetLedger from './AssetLedger';
import { InventoryCard } from './InventoryCard';
import BaseModal from './BaseModal';
import UnitConfigurator from './UnitConfigurator';
import ImpairmentTestModal from './ImpairmentTestModal';
import AssetUnitizeModal from './AssetUnitizeModal';
import { getCurrentLocation } from '../utils/gpsUtils';
import { Layers, ShieldCheck } from 'lucide-react';
import { logger } from '../utils/logger';

interface AssetControlModuleProps {
  onBack: () => void;
  username: string;
  tenantid: string;
  databaseMode: DatabaseMode;
}

type SubModule = 'DASHBOARD' | 'ASSETS' | 'UNITS' | 'MOVEMENTS' | 'DEPRECIATION' | 'CATEGORIES' | 'REPORTS';

const AssetControlModule: React.FC<AssetControlModuleProps> = ({ onBack, username, tenantid, databaseMode }) => {
  const [activeSubModule, setActiveSubModule] = useState<SubModule>('DASHBOARD');
  const [configTab, setConfigTab] = useState<'ACCOUNTS' | 'GROUPS' | 'NCM'>('ACCOUNTS');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [ncmClassifiers, setNcmClassifiers] = useState<NCMClassifier[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [unitConfigs, setUnitConfigs] = useState<UnitConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewAssetModalOpen, setIsNewAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isImpairmentModalOpen, setIsImpairmentModalOpen] = useState(false);
  const [isUnitizeModalOpen, setIsUnitizeModalOpen] = useState(false);
  const [newAssetForm, setNewAssetForm] = useState<Partial<Asset>>({
    _status_contabil: 'ATIVO',
    _data_aquisicao: new Date().toISOString().split('T')[0],
    _data_inicio_depreciacao: new Date().toISOString().split('T')[0],
  });
  const stats = useMemo(() => {
    let totalValue = 0;
    let totalDepreciated = 0;
    let residualValue = 0;
    let activeCount = 0;
    let writeOffCount = 0;

    assets.forEach(asset => {
      const v0 = Number(asset._valor_aquisicao || asset.vlraquisic) || 0;
      totalValue += v0;
      
      const depr = calculateDepreciation(asset);
      totalDepreciated += depr.accumulatedDepreciation;
      residualValue += depr.netBookValue;

      if (asset._status_contabil === 'BAIXADO') {
        writeOffCount++;
      } else {
        activeCount++;
      }
    });

    return {
      totalValue,
      totalDepreciated,
      residualValue,
      activeCount,
      writeOffCount
    };
  }, [assets]);



  // Auto-normalização se a base de unidades estiver vazia mas houver ativos
  useEffect(() => {
    if (!loading && assets.length > 0 && unitConfigs.length === 0 && databaseMode === DatabaseMode.SUPABASE) {
      logger.info('>>> [AssetControl] Detectada base de unidades vazia com ativos presentes. Sugerindo normalização...');
      // Poderíamos disparar automaticamente, mas vamos deixar o botão em destaque no Dashboard
    }
  }, [assets, unitConfigs, loading, databaseMode]);

  const fetchUnits = useCallback(async () => {
    try {
      if (databaseMode === DatabaseMode.INTERNAL) {
        const data = await localDb.unitConfigs.toArray();
        setUnitConfigs(data);
      } else {
        if (!supabase) return;
        const { data, error } = await supabase.from('unit_configs').select('*').eq('tenantid', tenantid);
        if (error) throw error;
        setUnitConfigs(data || []);
      }
    } catch (err) {
      logger.error('Erro ao carregar unidades:', err);
    }
  }, [databaseMode, tenantid]);

  const fetchChartOfAccounts = useCallback(async () => {
    try {
      const data = await assetControlService.getChartOfAccounts(tenantid);
      setChartOfAccounts(data);
    } catch (err) {
      logger.error('Erro ao carregar plano de contas:', err);
    }
  }, [tenantid]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      if (databaseMode === DatabaseMode.INTERNAL) {
        logger.info('>>> [AssetControl] Carregando ativos da base LOCAL (Dexie)...');
        const localAssets = await localDb.assets.toArray();
        setAssets(localAssets);
      } else {
        if (!supabase) return;
        logger.info('>>> [AssetControl] Carregando ativos da base CLOUD (Supabase)...');
        const { data, error } = await supabase
          .from('assets')
          .select('*')
          .eq('tenantid', tenantid);

        if (error) throw error;
        setAssets(data || []);
      }
    } catch (err) {
      logger.error('Erro ao carregar ativos contábeis:', err);
    } finally {
      setLoading(false);
    }
  }, [databaseMode, tenantid]);

  const handleNormalizeUnits = async () => {
    try {
      setLoading(true);
      const result = await assetControlService.normalizeUnits(tenantid);
      alert(`Normalização concluída! ${result.discovered} unidades encontradas na base de ativos, ${result.created} novas configurações criadas.`);
      fetchUnits();
    } catch (err) {
      logger.error('Erro ao normalizar unidades:', err);
      alert('Erro ao normalizar unidades: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetGroups = useCallback(async () => {
    try {
      const data = await assetControlService.getAssetGroups(tenantid);
      setAssetGroups(data);
    } catch (err) {
      logger.error('Erro ao carregar grupos contábeis:', err);
    }
  }, [tenantid]);

  const fetchNCMClassifiers = useCallback(async () => {
    try {
      const data = await assetControlService.getNCMClassifiers(tenantid);
      setNcmClassifiers(data);
    } catch (err) {
      logger.error('Erro ao carregar classificadores NCM:', err);
    }
  }, [tenantid]);

  useEffect(() => {
    fetchAssets();
    fetchAssetGroups();
    fetchNCMClassifiers();
    fetchChartOfAccounts();
    fetchUnits();
  }, [tenantid, databaseMode, fetchAssets, fetchAssetGroups, fetchNCMClassifiers, fetchChartOfAccounts, fetchUnits]);



  const handleSaveChartOfAccount = async (acc: Partial<ChartOfAccount>) => {
    try {
      await assetControlService.saveChartOfAccount({ ...acc, tenantid });
      
      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: acc.id ? 'UPDATE' : 'INSERT',
        table_name: 'chart_of_accounts',
        record_id: String(acc.id || acc.code),
        new_data: acc,
        details: `${acc.id ? 'Atualização' : 'Criação'} de conta contábil: ${acc.code} - ${acc.name}`,
        tenantid: tenantid
      });

      fetchChartOfAccounts();
    } catch (err) {
      logger.error('Erro ao salvar conta:', err);
    }
  };

  const handleDeleteChartOfAccount = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;
    try {
      const accToDelete = chartOfAccounts.find(a => a.id === id);
      await assetControlService.deleteChartOfAccount(id);
      
      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: 'DELETE',
        table_name: 'chart_of_accounts',
        record_id: id,
        old_data: accToDelete,
        details: `Exclusão de conta contábil: ${accToDelete?.code} - ${accToDelete?.name}`,
        tenantid: tenantid
      });

      fetchChartOfAccounts();
    } catch (err) {
      logger.error('Erro ao excluir conta:', err);
    }
  };

  const seedInitialChartOfAccounts = async () => {
    const standardData: Partial<ChartOfAccount>[] = [
      { code: '1', name: 'ATIVO', type: AccountType.SYNTHETIC, level: 1, nature: AccountNature.DEBIT, classification: AccountClassification.ASSET, is_active: true },
      { code: '1.1', name: 'ATIVO CIRCULANTE', type: AccountType.SYNTHETIC, level: 2, nature: AccountNature.DEBIT, classification: AccountClassification.ASSET, is_active: true },
      { code: '1.2', name: 'ATIVO NÃO CIRCULANTE', type: AccountType.SYNTHETIC, level: 2, nature: AccountNature.DEBIT, classification: AccountClassification.ASSET, is_active: true },
      { code: '1.2.01', name: 'IMOBILIZADO', type: AccountType.SYNTHETIC, level: 3, nature: AccountNature.DEBIT, classification: AccountClassification.ASSET, is_active: true },
      { code: '1.2.01.0001', name: 'MÁQUINAS E EQUIPAMENTOS', type: AccountType.ANALYTICAL, level: 4, nature: AccountNature.DEBIT, classification: AccountClassification.ASSET, is_active: true },
      { code: '1.2.01.0002', name: 'VEÍCULOS', type: AccountType.ANALYTICAL, level: 4, nature: AccountNature.DEBIT, classification: AccountClassification.ASSET, is_active: true },
      { code: '2', name: 'PASSIVO', type: AccountType.SYNTHETIC, level: 1, nature: AccountNature.CREDIT, classification: AccountClassification.LIABILITY, is_active: true },
      { code: '3', name: 'PATRIMÔNIO LÍQUIDO', type: AccountType.SYNTHETIC, level: 1, nature: AccountNature.CREDIT, classification: AccountClassification.EQUITY, is_active: true },
    ];

    setLoading(true);
    try {
      for (const acc of standardData) {
        await assetControlService.saveChartOfAccount({ ...acc, tenantid });
      }
      await fetchChartOfAccounts();
    } catch (err) {
      logger.error('Erro ao semear plano de contas:', err);
    } finally {
      setLoading(false);
    }
  };
  const handleSaveAssetGroup = async (group: Partial<AssetGroup>) => {
    try {
      await assetControlService.saveAssetGroup({ ...group, tenantid });
      
      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: group.id ? 'UPDATE' : 'INSERT',
        table_name: 'asset_groups',
        record_id: String(group.id || group.group_code),
        new_data: group,
        details: `${group.id ? 'Atualização' : 'Criação'} de grupo de ativos: ${group.group_code} - ${group.name}`,
        tenantid: tenantid
      });

      fetchAssetGroups();
    } catch (err) {
      logger.error('Erro ao salvar grupo:', err);
    }
  };

  const handleDeleteAssetGroup = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este grupo?')) return;
    try {
      const groupToDelete = assetGroups.find(g => g.id === id);
      await assetControlService.deleteAssetGroup(id);
      
      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: 'DELETE',
        table_name: 'asset_groups',
        record_id: id,
        old_data: groupToDelete,
        details: `Exclusão de grupo de ativos: ${groupToDelete?.group_code} - ${groupToDelete?.name}`,
        tenantid: tenantid
      });

      fetchAssetGroups();
    } catch (err) {
      logger.error('Erro ao excluir grupo:', err);
    }
  };

  const seedInitialAssetGroups = async () => {
    const standardData: Partial<AssetGroup>[] = [
      { group_code: '1000', name: 'EDIFICAÇÕES', asset_account: '1.2.01.0001', accumulated_depreciation_account: '1.2.01.0002', depreciation_expense_account: '3.1.01.0001', annual_depreciation_rate: 4, depreciation_method: DepreciationMethod.LINEAR, useful_life_months: 300 },
      { group_code: '2000', name: 'INSTALAÇÕES', asset_account: '1.2.01.0003', accumulated_depreciation_account: '1.2.01.0004', depreciation_expense_account: '3.1.01.0002', annual_depreciation_rate: 10, depreciation_method: DepreciationMethod.LINEAR, useful_life_months: 120 },
      { group_code: '3000', name: 'MÁQUINAS E EQUIPAMENTOS', asset_account: '1.2.01.0005', accumulated_depreciation_account: '1.2.01.0006', depreciation_expense_account: '3.1.01.0003', annual_depreciation_rate: 10, depreciation_method: DepreciationMethod.LINEAR, useful_life_months: 120 },
      { group_code: '4000', name: 'MÓVEIS E UTENSÍLIOS', asset_account: '1.2.01.0007', accumulated_depreciation_account: '1.2.01.0008', depreciation_expense_account: '3.1.01.0004', annual_depreciation_rate: 10, depreciation_method: DepreciationMethod.LINEAR, useful_life_months: 120 },
      { group_code: '5000', name: 'VEÍCULOS', asset_account: '1.2.01.0009', accumulated_depreciation_account: '1.2.01.0010', depreciation_expense_account: '3.1.01.0005', annual_depreciation_rate: 20, depreciation_method: DepreciationMethod.LINEAR, useful_life_months: 60 },
      { group_code: '6000', name: 'COMPUTADORES E PERIFÉRICOS', asset_account: '1.2.01.0011', accumulated_depreciation_account: '1.2.01.0012', depreciation_expense_account: '3.1.01.0006', annual_depreciation_rate: 20, depreciation_method: DepreciationMethod.LINEAR, useful_life_months: 60 },
    ];

    setLoading(true);
    try {
      for (const group of standardData) {
        await assetControlService.saveAssetGroup({ ...group, tenantid });
      }
      await fetchAssetGroups();
    } catch (err) {
      logger.error('Erro ao semear grupos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNCMClassifier = async (cls: Partial<NCMClassifier>) => {
    try {
      await assetControlService.saveNCMClassifier({ ...cls, tenantid });
      
      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: cls.id ? 'UPDATE' : 'INSERT',
        table_name: 'ncm_classifiers',
        record_id: String(cls.id || cls.ncm_code),
        new_data: cls,
        details: `${cls.id ? 'Atualização' : 'Criação'} de classificador NCM: ${cls.ncm_code} - ${cls.description}`,
        tenantid: tenantid
      });

      fetchNCMClassifiers();
    } catch (err) {
      logger.error('Erro ao salvar classificador NCM:', err);
    }
  };

  const handleDeleteNCMClassifier = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este classificador?')) return;
    try {
      const clsToDelete = ncmClassifiers.find(c => c.id === id);
      await assetControlService.deleteNCMClassifier(id);
      
      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: 'DELETE',
        table_name: 'ncm_classifiers',
        record_id: id,
        old_data: clsToDelete,
        details: `Exclusão de classificador NCM: ${clsToDelete?.ncm_code} - ${clsToDelete?.description}`,
        tenantid: tenantid
      });

      fetchNCMClassifiers();
    } catch (err) {
      logger.error('Erro ao excluir classificador NCM:', err);
    }
  };

  const seedInitialNCMClassifiers = async () => {
    const standardData: Partial<NCMClassifier>[] = [
      { ncm_code: '9403.30.00', description: 'Móveis de madeira do tipo utilizado em escritórios', group_code: '4000', annual_depreciation_rate: 10, useful_life_months: 120 },
      { ncm_code: '8471.30.12', description: 'Notebooks / Laptops', group_code: '6000', annual_depreciation_rate: 20, useful_life_months: 60 },
      { ncm_code: '8703.22.10', description: 'Automóveis de passageiros', group_code: '5000', annual_depreciation_rate: 20, useful_life_months: 60 },
    ];

    setLoading(true);
    try {
      for (const cls of standardData) {
        await assetControlService.saveNCMClassifier({ ...cls, tenantid });
      }
      await fetchNCMClassifiers();
    } catch (err) {
      logger.error('Erro ao semear classificadores NCM:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNCMLookup = async (ncmCode: string) => {
    if (!ncmCode || ncmCode.length < 4) return;
    try {
      const classifier = await assetControlService.getNCMClassifierByCode(ncmCode, tenantid);
      if (classifier) {
        const group = assetGroups.find(g => g.group_code === classifier.group_code);
        
        setNewAssetForm(prev => ({
          ...prev,
          _ncm_code: ncmCode,
          descricaodoativo: prev.descricaodoativo || classifier.description,
          _taxa_depreciacao_anual: classifier.annual_depreciation_rate,
          _vida_util_meses: classifier.useful_life_months,
          _conta_contabil: group?.asset_account || prev._conta_contabil,
        }));
      }
    } catch (err) {
      logger.error('Erro ao buscar NCM:', err);
    }
  };

  const handleSaveNewAsset = async () => {
    if (!newAssetForm.etiqueta || !newAssetForm.descricaodoativo || !newAssetForm._valor_aquisicao) {
      alert('Preencha os campos obrigatórios (Etiqueta, Descrição e Valor)');
      return;
    }

    setLoading(true);
    try {
      // Captura GPS no momento do salvamento para inventário
      let gpsData = {};
      try {
        const loc = await getCurrentLocation(true);
        // Guarda Defensiva: hardware pode retornar null/undefined - nunca ler .lng de undefined
        if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) {
          throw new Error('GPS invalido retornado pelo hardware');
        }
        gpsData = { latitude: loc.lat, longitude: loc.lng };
        logger.info('>>> [GPS] Localização capturada para o ativo:', gpsData);
      } catch (gpsErr) {
        logger.warn('>>> [GPS] Falha ao capturar localização, salvando sem coordenadas:', gpsErr);
      }

      const assetToSave = {
        ...newAssetForm,
        ...gpsData,
        tenantid: tenantid,
        filial: newAssetForm.filial || 'MATRIZ',
        _valor_residual: newAssetForm._valor_residual || 0,
        _depreciacao_acumulada: newAssetForm._depreciacao_acumulada || 0,
        _status_contabil: newAssetForm._status_contabil || 'ATIVO',
      } as Asset;

      if (databaseMode === DatabaseMode.INTERNAL) {
        if (editingAsset) {
          await localDb.assets.update(String(editingAsset.id), assetToSave);
        } else {
          await localDb.assets.add({
            ...assetToSave,
            id: crypto.randomUUID(),
            _sync_status: 'PENDING'
          });
        }
      } else {
        if (!supabase) return;
        if (editingAsset) {
          const { error } = await supabase
            .from('assets')
            .update(assetToSave)
            .eq('id', editingAsset.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('assets')
            .insert(assetToSave);
          if (error) throw error;
        }
      }

      setIsNewAssetModalOpen(false);
      
      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: editingAsset ? 'UPDATE' : 'INSERT',
        table_name: 'assets',
        record_id: String(editingAsset?.id || assetToSave.id),
        old_data: editingAsset,
        new_data: assetToSave,
        details: `${editingAsset ? 'Atualização' : 'Criação'} manual de ativo imobilizado: ${assetToSave.etiqueta}`,
        tenantid: tenantid
      });

      setEditingAsset(null);
      setNewAssetForm({
        _status_contabil: 'ATIVO',
        _data_aquisicao: new Date().toISOString().split('T')[0],
        _data_inicio_depreciacao: new Date().toISOString().split('T')[0],
      });
      fetchAssets();
    } catch (err) {
      logger.error('Erro ao salvar ativo:', err);
      alert('Erro ao salvar ativo. Verifique os dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleImpairmentSave = async (updatedAsset: Asset) => {
    setLoading(true);
    try {
      if (databaseMode === DatabaseMode.INTERNAL) {
        await localDb.assets.update(String(updatedAsset.id), updatedAsset);
      } else {
        if (!supabase) return;
        const { error } = await supabase
          .from('assets')
          .update(updatedAsset)
          .eq('id', updatedAsset.id);
        if (error) throw error;
      }

      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: 'IMPAIRMENT',
        table_name: 'assets',
        record_id: String(updatedAsset.id),
        old_data: selectedAsset,
        new_data: updatedAsset,
        details: `Teste de recuperabilidade realizado. Perda: ${updatedAsset._perda_impairment}`,
        tenantid: tenantid
      });

      fetchAssets();
    } catch (err) {
      logger.error('Erro ao salvar impairment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnitizeConfirm = async (numberOfUnits: number, percentages?: number[]) => {
    if (!selectedAsset) return;
    setLoading(true);
    try {
      const timestamp = new Date().toISOString();
      const valueFields = [
        '_valor_aquisicao',
        '_valor_residual',
        '_depreciacao_acumulada',
        '_perda_impairment',
        '_valor_recuperavel',
      ];

      const calculateSplit = (total: number, units: number, index: number, pcts?: number[]) => {
        if (pcts) {
          const pct = pcts[index] / 100;
          const val = Math.round(total * pct * 100) / 100;
          if (index === units - 1) {
            let sumPrevious = 0;
            for (let j = 0; j < units - 1; j++) {
              sumPrevious += Math.round(total * (pcts[j] / 100) * 100) / 100;
            }
            return Math.round((total - sumPrevious) * 100) / 100;
          }
          return val;
        }
        const baseValue = Math.floor((total / units) * 100) / 100;
        if (index === units - 1) {
          return Math.round((total - (baseValue * (units - 1))) * 100) / 100;
        }
        return baseValue;
      };

      const updatedParent: Asset = {
        ...selectedAsset,
        _is_unitized: true,
        _status_contabil: 'BAIXADO',
        _history: [
          ...(selectedAsset._history || []),
          {
            timestamp,
            user: username,
            action: 'UNITARIZAÇÃO CONTÁBIL',
            details: `Ativo desmembrado em ${numberOfUnits} unidades para controle individual.`
          }
        ]
      };

      const newAssets: Asset[] = [];
      for (let i = 0; i < numberOfUnits; i++) {
        const child: Asset = {
          ...selectedAsset,
          id: crypto.randomUUID(),
          _parent_id: selectedAsset.id,
          etiqueta: `.`,
          _isNew: true,
          _history: [
            {
              timestamp,
              user: username,
              action: 'CRIAÇÃO POR UNITARIZAÇÃO',
              details: `Unidade ${i + 1} de ${numberOfUnits} gerada a partir do ativo ${selectedAsset.etiqueta}.`
            }
          ]
        };

        valueFields.forEach(field => {
          const totalValue = Number(selectedAsset[field] || 0);
          if (totalValue > 0) {
            child[field] = calculateSplit(totalValue, numberOfUnits, i, percentages);
          }
        });

        newAssets.push(child);
      }

      if (databaseMode === DatabaseMode.INTERNAL) {
        await localDb.assets.update(String(selectedAsset.id), updatedParent);
        await localDb.assets.bulkAdd(newAssets);
      } else {
        if (!supabase) return;
        const { error: parentError } = await supabase.from('assets').update(updatedParent).eq('id', selectedAsset.id);
        if (parentError) throw parentError;
        const { error: childrenError } = await supabase.from('assets').insert(newAssets);
        if (childrenError) throw childrenError;
      }

      // Log de Auditoria
      await logAuditEvent({
        user_email: username,
        action: 'UNITARIZAÇÃO',
        table_name: 'assets',
        record_id: String(selectedAsset.id),
        old_data: selectedAsset,
        new_data: { parent: updatedParent, children: newAssets.length },
        details: `Ativo desmembrado em ${numberOfUnits} unidades.`,
        tenantid: tenantid
      });

      setSelectedAsset(null);
      fetchAssets();
      alert('Unitarização contábil concluída com sucesso!');
    } catch (err) {
      logger.error('Erro na unitarização:', err);
      alert('Erro ao processar unitarização.');
    } finally {
      setLoading(false);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Alerta de Normalização */}
      {!loading && assets.length > 0 && unitConfigs.length === 0 && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-900">Base de Unidades Desatualizada</p>
              <p className="text-xs text-indigo-700">Detectamos unidades nos ativos que não estão configuradas. Deseja normalizar agora?</p>
            </div>
          </div>
          <button 
            onClick={handleNormalizeUnits}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg"
          >
            Normalizar Agora
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={() => setActiveSubModule('ASSETS')}
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-200 transition-all text-left group"
        >
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Gerir Ativos</h4>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Inclusão e Alteração</p>
          </div>
        </button>

        <button 
          onClick={() => setActiveSubModule('UNITS')}
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-blue-200 transition-all text-left group"
        >
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Unidades Operacionais</h4>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Cadastro de Filiais</p>
          </div>
        </button>

        <button 
          onClick={() => {
            setActiveSubModule('CATEGORIES');
            setConfigTab('ACCOUNTS');
          }}
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-amber-200 transition-all text-left group"
        >
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Plano de Contas</h4>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Gestão de Contas</p>
          </div>
        </button>

        <button 
          onClick={() => setActiveSubModule('REPORTS')}
          className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-rose-200 transition-all text-left group"
        >
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl group-hover:scale-110 transition-transform">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Relatórios</h4>
            <p className="text-[10px] text-slate-400 uppercase font-bold">CPC 27 & Impairment</p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Valor Total</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalValue)}
          </div>
          <div className="mt-2 text-xs text-slate-500">Valor de Aquisição</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-rose-50 rounded-lg">
              <TrendingDown className="w-6 h-6 text-rose-600" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Depreciação Acumulada</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalDepreciated)}
          </div>
          <div className="mt-2 text-xs text-slate-500">Total até o momento</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <PieChart className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Valor Residual</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.residualValue || (stats.totalValue - stats.totalDepreciated))}
          </div>
          <div className="mt-2 text-xs text-slate-500">Valor Contábil Líquido</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Conformidade CPC 27</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">100%</div>
          <div className="mt-2 text-xs text-emerald-600 font-bold uppercase tracking-tighter">Base Auditada</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Inventário em Destaque</h3>
          {assets.length > 0 ? (
            <div className="space-y-3">
              {assets.slice(0, 3).map(asset => (
                <div key={asset.id} className="rounded-xl overflow-hidden border border-slate-100">
                  <InventoryCard
                    asset={asset}
                    batteryLevel={1}
                    isPlugged
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 italic">
              Nenhum ativo carregado na tabela de trabalho.
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Últimas Movimentações</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-center h-40 text-slate-400 italic">
              Nenhuma movimentação recente registrada.
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Distribuição por Conta</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-center h-40 text-slate-400 italic">
              Gráfico de distribuição em desenvolvimento.
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderReports = () => {
    const impairmentAssets = assets.filter(a => Number(a._perda_impairment || 0) > 0);
    const unitizedAssets = assets.filter(a => a._is_unitized);
    
    const formatCurrency = (val: number) => 
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    return (
      <div className="space-y-8 animate-fadeIn">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Centro de Relatórios</h2>
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Auditoria e Conformidade Contábil</p>
          </div>
          <button 
            onClick={() => setActiveSubModule('DASHBOARD')}
            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
          >
            Voltar ao Dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total de Ativos</p>
            <p className="text-2xl font-black text-slate-900">{assets.length}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Perda por Impairment</p>
            <p className="text-2xl font-black text-rose-600">
              {formatCurrency(assets.reduce((acc, a) => acc + Number(a._perda_impairment || 0), 0))}
            </p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ativos Unitarizados</p>
            <p className="text-2xl font-black text-emerald-600">{unitizedAssets.length}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Ativos com Perda por Impairment (CPC 01)</h3>
              <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                <Printer className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Etiqueta</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">VCL</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Recuperável</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Perda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {impairmentAssets.length > 0 ? impairmentAssets.map(asset => {
                    const v0 = Number(asset._valor_aquisicao || asset.vlraquisic || 0);
                    const depr = Number(asset._depreciacao_acumulada || 0);
                    const vcl = v0 - depr;
                    return (
                      <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs font-black text-slate-900">{asset.etiqueta}</td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase truncate max-w-xs">{asset.descricaodoativo}</td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-900 text-right">{formatCurrency(vcl)}</td>
                        <td className="px-6 py-4 text-xs font-bold text-blue-600 text-right">{formatCurrency(Number(asset._valor_recuperavel || 0))}</td>
                        <td className="px-6 py-4 text-xs font-black text-rose-600 text-right">{formatCurrency(Number(asset._perda_impairment || 0))}</td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma perda registrada</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Histórico de Unitarização (CPC 27)</h3>
              <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                <Printer className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Etiqueta Original</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Total</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Filhos</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {unitizedAssets.length > 0 ? unitizedAssets.map(asset => {
                    const childrenCount = assets.filter(a => a._parent_id === asset.id).length;
                    return (
                      <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs font-black text-slate-900">{asset.etiqueta}</td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase truncate max-w-xs">{asset.descricaodoativo}</td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-900 text-right">{formatCurrency(Number(asset._valor_aquisicao || asset.vlraquisic || 0))}</td>
                        <td className="px-6 py-4 text-xs font-black text-emerald-600 text-center">{childrenCount}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[9px] font-black rounded-lg uppercase">Unitarizado</span>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma unitarização realizada</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAssetList = () => {
    if (selectedAsset) {
      return <AssetLedger asset={selectedAsset} onBack={() => setSelectedAsset(null)} />;
    }

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar por etiqueta, descrição ou conta..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                <Filter className="w-5 h-5" />
              </button>
              <button className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                <Download className="w-5 h-5" />
              </button>
              <button 
                onClick={() => {
                  setEditingAsset(null);
                  setNewAssetForm({
                    _status_contabil: 'ATIVO',
                    _data_aquisicao: new Date().toISOString().split('T')[0],
                    _data_inicio_depreciacao: new Date().toISOString().split('T')[0],
                  });
                  setIsNewAssetModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Novo Ativo</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ativo</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Conta / CC</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Aquisição</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vlr. Aquisição</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Depr. Acum.</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vlr. Residual</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.length > 0 ? (
                  assets.map((asset) => {
                    const depr = calculateDepreciation(asset);
                    return (
                      <tr 
                        key={asset.id} 
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4" onClick={() => setSelectedAsset(asset)}>
                          <div className="font-medium text-slate-800">{asset.etiqueta || 'S/E'}</div>
                          <div className="text-xs text-slate-500 truncate max-w-[200px]">{asset.descricaodoativo}</div>
                        </td>
                        <td className="px-6 py-4" onClick={() => setSelectedAsset(asset)}>
                          <div className="text-sm text-slate-700">{asset.filial || asset._unidade_operacional || '-'}</div>
                          <div className="text-xs text-slate-400">{asset._centro_custo || asset.centrodecusto || '-'}</div>
                        </td>
                        <td className="px-6 py-4" onClick={() => setSelectedAsset(asset)}>
                          <div className="text-sm text-slate-700">{asset._data_aquisicao || asset.dataaqusic || '-'}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-800" onClick={() => setSelectedAsset(asset)}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset._valor_aquisicao || asset.vlraquisic || 0))}
                        </td>
                        <td className="px-6 py-4 text-sm text-rose-600" onClick={() => setSelectedAsset(asset)}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(depr.accumulatedDepreciation)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-emerald-600" onClick={() => setSelectedAsset(asset)}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(depr.netBookValue)}
                        </td>
                        <td className="px-6 py-4" onClick={() => setSelectedAsset(asset)}>
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                            asset._status_contabil === 'ATIVO' ? 'bg-emerald-100 text-emerald-700' :
                            asset._status_contabil === 'BAIXADO' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {asset._status_contabil || 'ATIVO'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAsset(asset);
                                setIsUnitizeModalOpen(true);
                              }}
                              title="Unitarizar"
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            >
                              <Layers className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAsset(asset);
                                setIsImpairmentModalOpen(true);
                              }}
                              title="Teste de Impairment"
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                            >
                              <TrendingDown className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAsset(asset);
                                setNewAssetForm(asset);
                                setIsNewAssetModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Excluir este ativo?')) {
                                  // Lógica de exclusão
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                      Nenhum ativo contábil encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar do Módulo */}
      <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between md:block">
          <div className="flex items-center gap-3 md:mb-6">
            <div className="p-2 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-200">
              <TrendingDown className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold text-slate-800 leading-tight">Controle de Ativos</h1>
              <p className="hidden md:block text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Módulo Contábil</p>
            </div>
          </div>

          <div className="mt-4">
            <BackButton onClick={onBack} label="Voltar" subLabel="Módulo Contábil" />
          </div>
        </div>

        <nav className="flex md:flex-col p-2 md:p-4 space-x-2 md:space-x-0 md:space-y-2 overflow-x-auto md:overflow-y-auto scrollbar-hide">
          <button 
            onClick={() => setActiveSubModule('DASHBOARD')}
            className={`flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
              activeSubModule === 'DASHBOARD' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 md:w-5 md:h-5" />
            <span>Dashboard</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('ASSETS')}
            className={`flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
              activeSubModule === 'ASSETS' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Package className="w-4 h-4 md:w-5 md:h-5" />
            <span>Ativos</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('UNITS')}
            className={`flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
              activeSubModule === 'UNITS' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Building2 className="w-4 h-4 md:w-5 md:h-5" />
            <span>Unidades</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('MOVEMENTS')}
            className={`flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
              activeSubModule === 'MOVEMENTS' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4 md:w-5 md:h-5" />
            <span>Movimentações</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('DEPRECIATION')}
            className={`flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
              activeSubModule === 'DEPRECIATION' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <TrendingDown className="w-4 h-4 md:w-5 md:h-5" />
            <span>Depreciação</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('CATEGORIES')}
            className={`flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
              activeSubModule === 'CATEGORIES' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Settings className="w-4 h-4 md:w-5 md:h-5" />
            <span>Config. Contábil</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('REPORTS')}
            className={`flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
              activeSubModule === 'REPORTS' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4 md:w-5 md:h-5" />
            <span>Relatórios</span>
          </button>
        </nav>

        <div className="hidden md:block p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Usuário</div>
            <div className="text-xs font-semibold text-slate-700 truncate">{username}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
          <h2 className="text-sm md:text-lg font-semibold text-slate-800 truncate">
            {activeSubModule === 'DASHBOARD' && 'Visão Geral'}
            {activeSubModule === 'ASSETS' && 'Gestão de Ativos'}
            {activeSubModule === 'MOVEMENTS' && 'Movimentações'}
            {activeSubModule === 'DEPRECIATION' && 'Depreciação'}
            {activeSubModule === 'CATEGORIES' && 'Configuração'}
            {activeSubModule === 'REPORTS' && 'Relatórios'}
          </h2>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-slate-100 rounded-lg text-[10px] md:text-xs font-medium text-slate-600">
              <Calendar className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Período: Março / 2026</span>
              <span className="sm:hidden">Mar/26</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center h-[60vh]">
              <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSubModule}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeSubModule === 'DASHBOARD' && renderDashboard()}
                {activeSubModule === 'ASSETS' && renderAssetList()}
                {activeSubModule === 'REPORTS' && renderReports()}
                {activeSubModule === 'UNITS' && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <UnitConfigurator 
                      user={{ username, tenantid, email: username, role: UserRole.ADMIN } as User}
                      units={unitConfigs.map(u => u.filial || u._unitid || u.unit_id || '')}
                      onBack={() => setActiveSubModule('DASHBOARD')} 
                    />
                  </div>
                )}
                {activeSubModule === 'CATEGORIES' && (
                  <div className="space-y-6">
                    {/* Tabs para Configuração */}
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                      <button 
                        onClick={() => setConfigTab('ACCOUNTS')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${configTab === 'ACCOUNTS' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Plano de Contas
                      </button>
                      <button 
                        onClick={() => setConfigTab('GROUPS')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${configTab === 'GROUPS' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Grupos Contábeis
                      </button>
                      <button 
                        onClick={() => setConfigTab('NCM')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${configTab === 'NCM' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        NCM
                      </button>
                    </div>

                    {configTab === 'ACCOUNTS' ? (
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-800">Estrutura do Plano de Contas</h3>
                            <p className="text-xs text-slate-500 mt-1">Defina a hierarquia contábil para lançamentos e relatórios</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {chartOfAccounts.length === 0 && (
                              <button 
                                onClick={seedInitialChartOfAccounts}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all text-sm font-bold"
                              >
                                <Download className="w-4 h-4" />
                                <span>Carregar Plano Padrão</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <ChartOfAccountsTable 
                          accounts={chartOfAccounts}
                          onSave={handleSaveChartOfAccount}
                          onDelete={handleDeleteChartOfAccount}
                        />
                      </div>
                    ) : configTab === 'GROUPS' ? (
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-800">Grupos Contábeis de Bens</h3>
                            <p className="text-xs text-slate-500 mt-1">Defina os grupos, contas contábeis e métodos de depreciação</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {assetGroups.length === 0 && (
                              <button 
                                onClick={seedInitialAssetGroups}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all text-sm font-bold"
                              >
                                <Download className="w-4 h-4" />
                                <span>Carregar Grupos Padrão</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <AssetGroupsTable 
                          groups={assetGroups}
                          onSave={handleSaveAssetGroup}
                          onDelete={handleDeleteAssetGroup}
                        />
                      </div>
                    ) : configTab === 'NCM' ? (
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-800">Classificador NCM</h3>
                            <p className="text-xs text-slate-500 mt-1">Vincule códigos NCM a grupos e taxas para automação</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {ncmClassifiers.length === 0 && (
                              <button 
                                onClick={seedInitialNCMClassifiers}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all text-sm font-bold"
                              >
                                <Download className="w-4 h-4" />
                                <span>Carregar NCMs Padrão</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <NCMClassifierTable 
                          classifiers={ncmClassifiers}
                          onSave={handleSaveNCMClassifier}
                          onDelete={handleDeleteNCMClassifier}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
                {activeSubModule === 'REPORTS' && (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Relatórios e Impressão</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Geração de documentos e listagens</p>
                      </div>
                      <button 
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>Imprimir Relatório</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-200 transition-all cursor-pointer group">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <Package className="w-6 h-6" />
                        </div>
                        <h4 className="font-bold text-slate-900 uppercase text-sm">Inventário Geral</h4>
                        <p className="text-xs text-slate-500 mt-2">Listagem completa de todos os ativos cadastrados no sistema.</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-200 transition-all cursor-pointer group">
                        <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <TrendingDown className="w-6 h-6" />
                        </div>
                        <h4 className="font-bold text-slate-900 uppercase text-sm">Depreciação Mensal</h4>
                        <p className="text-xs text-slate-500 mt-2">Relatório de valores depreciados no período selecionado.</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-200 transition-all cursor-pointer group">
                        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <ArrowLeftRight className="w-6 h-6" />
                        </div>
                        <h4 className="font-bold text-slate-900 uppercase text-sm">Movimentações</h4>
                        <p className="text-xs text-slate-500 mt-2">Histórico de transferências e baixas de ativos.</p>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Prévia do Relatório</span>
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                           <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Dados Atualizados</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50">
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">Etiqueta</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">Descrição</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">Valor Aquisição</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {assets.slice(0, 10).map((asset) => (
                              <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 text-xs font-bold text-slate-900">{asset.etiqueta}</td>
                                <td className="px-6 py-4 text-xs text-slate-600 uppercase">{asset.descricaodoativo}</td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-900">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset._valor_aquisicao || asset.vlraquisic) || 0)}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                                    asset._status_contabil === 'ATIVO' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {asset._status_contabil}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeSubModule !== 'DASHBOARD' && activeSubModule !== 'ASSETS' && activeSubModule !== 'UNITS' && activeSubModule !== 'CATEGORIES' && activeSubModule !== 'REPORTS' && (
                  <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
                    <div className="p-6 bg-slate-100 rounded-full mb-4">
                      <History className="w-12 h-12" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-600">Em Desenvolvimento</h3>
                    <p className="max-w-md text-center mt-2">
                      Esta funcionalidade está sendo construída para oferecer controle total sobre {activeSubModule.toLowerCase()}.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Modais Disruptivos */}
      {selectedAsset && isImpairmentModalOpen && (
        <ImpairmentTestModal 
          isOpen={isImpairmentModalOpen}
          onClose={() => {
            setIsImpairmentModalOpen(false);
            setSelectedAsset(null);
          }}
          asset={selectedAsset}
          onSave={handleImpairmentSave}
        />
      )}

      {selectedAsset && isUnitizeModalOpen && (
        <AssetUnitizeModal 
          isOpen={isUnitizeModalOpen}
          onClose={() => {
            setIsUnitizeModalOpen(false);
            setSelectedAsset(null);
          }}
          asset={selectedAsset}
          onConfirm={handleUnitizeConfirm}
        />
      )}

      {/* Modal de Novo/Editar Ativo */}
      <BaseModal 
        isOpen={isNewAssetModalOpen} 
        onClose={() => setIsNewAssetModalOpen(false)}
        title={editingAsset ? "Editar Ativo Imobilizado" : "Cadastrar Novo Ativo Imobilizado"}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-6 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Etiqueta / Patrimônio *</label>
              <input 
                type="text"
                value={newAssetForm.etiqueta || ''}
                onChange={(e) => setNewAssetForm({...newAssetForm, ETIQUETA: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Ex: 001234"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Código NCM (Classificação Automática)</label>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={newAssetForm._ncm_code || ''}
                  onChange={(e) => setNewAssetForm({...newAssetForm, _ncm_code: e.target.value})}
                  onBlur={(e) => handleNCMLookup(e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Ex: 8471.30.12"
                />
                <button 
                  onClick={() => handleNCMLookup(newAssetForm._ncm_code || '')}
                  className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Descrição do Ativo *</label>
            <input 
              type="text"
              value={newAssetForm.descricaodoativo || ''}
              onChange={(e) => setNewAssetForm({...newAssetForm, DESCRICAODOATIVO: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Ex: NOTEBOOK DELL LATITUDE 3420"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Valor de Aquisição *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number"
                  value={newAssetForm._valor_aquisicao || ''}
                  onChange={(e) => setNewAssetForm({...newAssetForm, _valor_aquisicao: Number(e.target.value)})}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Valor Residual</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number"
                  value={newAssetForm._valor_residual || ''}
                  onChange={(e) => setNewAssetForm({...newAssetForm, _valor_residual: Number(e.target.value)})}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Status Contábil</label>
              <select 
                value={newAssetForm._status_contabil || 'ATIVO'}
                onChange={(e) => setNewAssetForm({...newAssetForm, _status_contabil: e.target.value as 'ATIVO' | 'BAIXADO' | 'VENDIDO'})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="ATIVO">ATIVO</option>
                <option value="BAIXADO">BAIXADO</option>
                <option value="VENDIDO">VENDIDO</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Data Aquisição</label>
              <input 
                type="date"
                value={newAssetForm._data_aquisicao || ''}
                onChange={(e) => setNewAssetForm({...newAssetForm, _data_aquisicao: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Início Depreciação</label>
              <input 
                type="date"
                value={newAssetForm._data_inicio_depreciacao || ''}
                onChange={(e) => setNewAssetForm({...newAssetForm, _data_inicio_depreciacao: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Conta Contábil</label>
              <select 
                value={newAssetForm._conta_contabil || ''}
                onChange={(e) => setNewAssetForm({...newAssetForm, _conta_contabil: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">Selecione uma conta...</option>
                {chartOfAccounts.filter(a => a.type === AccountType.ANALYTICAL).map(acc => (
                  <option key={acc.id} value={acc.code}>{acc.code} - {acc.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Unidade Operacional</label>
              <select 
                value={newAssetForm._unidade_operacional || ''}
                onChange={(e) => setNewAssetForm({...newAssetForm, _unidade_operacional: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">Selecione uma unidade...</option>
                {unitConfigs.map(u => (
                  <option key={u.id} value={u._unitid}>{u._unitid}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
            <div className="space-y-2">
              <label className="text-xs font-bold text-emerald-700 uppercase">Taxa Depr. Anual (%)</label>
              <input 
                type="number"
                value={newAssetForm._taxa_depreciacao_anual || ''}
                onChange={(e) => setNewAssetForm({...newAssetForm, _taxa_depreciacao_anual: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-emerald-700 uppercase">Vida Útil (Meses)</label>
              <input 
                type="number"
                value={newAssetForm._vida_util_meses || ''}
                onChange={(e) => setNewAssetForm({...newAssetForm, _vida_util_meses: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button 
              onClick={() => setIsNewAssetModalOpen(false)}
              className="px-6 py-2 text-slate-500 font-bold text-xs uppercase hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveNewAsset}
              className="flex items-center gap-2 px-8 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{editingAsset ? "Salvar Alterações" : "Cadastrar Ativo"}</span>
            </button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
};

export default AssetControlModule;
