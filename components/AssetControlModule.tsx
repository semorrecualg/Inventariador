import React, { useState, useEffect, useMemo } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { Asset } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabaseService';
import { assetControlService } from '../services/assetControlService';
import { AssetGroup, ChartOfAccount, AccountType, AccountNature, AccountClassification, DepreciationMethod, NCMClassifier } from '../types';
import BackButton from './BackButton';
import AssetGroupsTable from './AssetGroupsTable';
import ChartOfAccountsTable from './ChartOfAccountsTable';
import NCMClassifierTable from './NCMClassifierTable';
import BaseModal from './BaseModal';

interface AssetControlModuleProps {
  onBack: () => void;
  username: string;
  tenantid: string;
}

type SubModule = 'DASHBOARD' | 'ASSETS' | 'MOVEMENTS' | 'DEPRECIATION' | 'CATEGORIES' | 'REPORTS';

const AssetControlModule: React.FC<AssetControlModuleProps> = ({ onBack, username, tenantid }) => {
  const [activeSubModule, setActiveSubModule] = useState<SubModule>('DASHBOARD');
  const [configTab, setConfigTab] = useState<'ACCOUNTS' | 'GROUPS' | 'NCM'>('ACCOUNTS');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [ncmClassifiers, setNcmClassifiers] = useState<NCMClassifier[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewAssetModalOpen, setIsNewAssetModalOpen] = useState(false);
  const [newAssetForm, setNewAssetForm] = useState<Partial<Asset>>({
    _status_contabil: 'ATIVO',
    _data_aquisicao: new Date().toISOString().split('T')[0],
    _data_inicio_depreciacao: new Date().toISOString().split('T')[0],
  });
  const stats = useMemo(() => {
    const totalValue = assets.reduce((acc, curr) => acc + (Number(curr._valor_aquisicao) || Number(curr.VLRAQUISIC) || 0), 0);
    const totalDepreciated = assets.reduce((acc, curr) => acc + (Number(curr._depreciacao_acumulada) || 0), 0);
    const residualValue = assets.reduce((acc, curr) => acc + (Number(curr._valor_residual) || 0), 0);
    const activeCount = assets.filter(a => a._status_contabil !== 'BAIXADO').length;
    const writeOffCount = assets.filter(a => a._status_contabil === 'BAIXADO').length;

    return {
      totalValue,
      totalDepreciated,
      residualValue,
      activeCount,
      writeOffCount
    };
  }, [assets]);

  useEffect(() => {
    fetchAssets();
    fetchAssetGroups();
    fetchNCMClassifiers();
    fetchChartOfAccounts();
  }, [tenantid]);

  const fetchChartOfAccounts = async () => {
    try {
      const data = await assetControlService.getChartOfAccounts(tenantid);
      setChartOfAccounts(data);
    } catch (err) {
      console.error('Erro ao carregar plano de contas:', err);
    }
  };

  const fetchAssets = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('_tenantid', tenantid);

      if (error) throw error;
      
      const loadedAssets = data || [];
      setAssets(loadedAssets);
    } catch (err) {
      console.error('Erro ao carregar ativos contábeis:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetGroups = async () => {
    try {
      const data = await assetControlService.getAssetGroups(tenantid);
      setAssetGroups(data);
    } catch (err) {
      console.error('Erro ao carregar grupos contábeis:', err);
    }
  };

  const fetchNCMClassifiers = async () => {
    try {
      const data = await assetControlService.getNCMClassifiers(tenantid);
      setNcmClassifiers(data);
    } catch (err) {
      console.error('Erro ao carregar classificadores NCM:', err);
    }
  };

  const handleSaveChartOfAccount = async (acc: Partial<ChartOfAccount>) => {
    try {
      await assetControlService.saveChartOfAccount({ ...acc, _tenantid: tenantid });
      fetchChartOfAccounts();
    } catch (err) {
      console.error('Erro ao salvar conta:', err);
    }
  };

  const handleDeleteChartOfAccount = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;
    try {
      await assetControlService.deleteChartOfAccount(id);
      fetchChartOfAccounts();
    } catch (err) {
      console.error('Erro ao excluir conta:', err);
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
        await assetControlService.saveChartOfAccount({ ...acc, _tenantid: tenantid });
      }
      await fetchChartOfAccounts();
    } catch (err) {
      console.error('Erro ao semear plano de contas:', err);
    } finally {
      setLoading(false);
    }
  };
  const handleSaveAssetGroup = async (group: Partial<AssetGroup>) => {
    try {
      await assetControlService.saveAssetGroup({ ...group, _tenantid: tenantid });
      fetchAssetGroups();
    } catch (err) {
      console.error('Erro ao salvar grupo:', err);
    }
  };

  const handleDeleteAssetGroup = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este grupo?')) return;
    try {
      await assetControlService.deleteAssetGroup(id);
      fetchAssetGroups();
    } catch (err) {
      console.error('Erro ao excluir grupo:', err);
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
        await assetControlService.saveAssetGroup({ ...group, _tenantid: tenantid });
      }
      await fetchAssetGroups();
    } catch (err) {
      console.error('Erro ao semear grupos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNCMClassifier = async (cls: Partial<NCMClassifier>) => {
    try {
      await assetControlService.saveNCMClassifier({ ...cls, _tenantid: tenantid });
      fetchNCMClassifiers();
    } catch (err) {
      console.error('Erro ao salvar classificador NCM:', err);
    }
  };

  const handleDeleteNCMClassifier = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este classificador?')) return;
    try {
      await assetControlService.deleteNCMClassifier(id);
      fetchNCMClassifiers();
    } catch (err) {
      console.error('Erro ao excluir classificador NCM:', err);
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
        await assetControlService.saveNCMClassifier({ ...cls, _tenantid: tenantid });
      }
      await fetchNCMClassifiers();
    } catch (err) {
      console.error('Erro ao semear classificadores NCM:', err);
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
          DESCRICAODOATIVO: prev.DESCRICAODOATIVO || classifier.description,
          _taxa_depreciacao_anual: classifier.annual_depreciation_rate,
          _vida_util_meses: classifier.useful_life_months,
          _conta_contabil: group?.asset_account || prev._conta_contabil,
        }));
      }
    } catch (err) {
      console.error('Erro ao buscar NCM:', err);
    }
  };

  const handleSaveNewAsset = async () => {
    if (!supabase) return;
    if (!newAssetForm.ETIQUETA || !newAssetForm.DESCRICAODOATIVO || !newAssetForm._valor_aquisicao) {
      alert('Preencha os campos obrigatórios (Etiqueta, Descrição e Valor)');
      return;
    }

    setLoading(true);
    try {
      const assetToSave = {
        ...newAssetForm,
        _tenantid: tenantid,
        _valor_residual: newAssetForm._valor_residual || 0,
        _depreciacao_acumulada: 0,
      };

      const { error } = await supabase
        .from('assets')
        .insert(assetToSave);

      if (error) throw error;

      setIsNewAssetModalOpen(false);
      setNewAssetForm({
        _status_contabil: 'ATIVO',
        _data_aquisicao: new Date().toISOString().split('T')[0],
        _data_inicio_depreciacao: new Date().toISOString().split('T')[0],
      });
      fetchAssets();
    } catch (err) {
      console.error('Erro ao salvar novo ativo:', err);
      alert('Erro ao salvar ativo. Verifique os dados.');
    } finally {
      setLoading(false);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
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
            <div className="p-2 bg-amber-50 rounded-lg">
              <Package className="w-6 h-6 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ativos Ativos</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.activeCount}</div>
          <div className="mt-2 text-xs text-slate-500">Itens em operação</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

  const renderAssetList = () => (
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
            onClick={() => setIsNewAssetModalOpen(true)}
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.length > 0 ? (
              assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-800">{asset.ETIQUETA || 'S/E'}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[200px]">{asset.DESCRICAODOATIVO}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700">{asset._conta_contabil || asset.CONTACONTABIL || '-'}</div>
                    <div className="text-xs text-slate-400">{asset._centro_custo || asset.CENTRODECUSTO || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700">{asset._data_aquisicao || asset.DATAAQUISIC || '-'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-800">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset._valor_aquisicao || asset.VLRAQUISIC || 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-rose-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset._depreciacao_acumulada || 0))}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-emerald-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset._valor_residual || (Number(asset._valor_aquisicao || asset.VLRAQUISIC || 0) - Number(asset._depreciacao_acumulada || 0))))}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      asset._status_contabil === 'ATIVO' ? 'bg-emerald-100 text-emerald-700' :
                      asset._status_contabil === 'BAIXADO' ? 'bg-rose-100 text-rose-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {asset._status_contabil || 'ATIVO'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                  Nenhum ativo contábil encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

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
            <span>Config</span>
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
                                <td className="px-6 py-4 text-xs font-bold text-slate-900">{asset.ETIQUETA}</td>
                                <td className="px-6 py-4 text-xs text-slate-600 uppercase">{asset.DESCRICAODOATIVO}</td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-900">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset._valor_aquisicao) || Number(asset.VLRAQUISIC) || 0)}
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

                {activeSubModule !== 'DASHBOARD' && activeSubModule !== 'ASSETS' && activeSubModule !== 'CATEGORIES' && activeSubModule !== 'REPORTS' && (
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

      {/* Modal de Novo Ativo */}
      <BaseModal 
        isOpen={isNewAssetModalOpen} 
        onClose={() => setIsNewAssetModalOpen(false)}
        title="Cadastrar Novo Ativo Imobilizado"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Etiqueta / Patrimônio *</label>
              <input 
                type="text"
                value={newAssetForm.ETIQUETA || ''}
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
              value={newAssetForm.DESCRICAODOATIVO || ''}
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
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="0,00"
                />
              </div>
            </div>
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

          <div className="flex justify-end gap-3 pt-4">
            <button 
              onClick={() => setIsNewAssetModalOpen(false)}
              className="px-6 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveNewAsset}
              className="flex items-center gap-2 px-8 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Salvar Ativo</span>
            </button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
};

export default AssetControlModule;
