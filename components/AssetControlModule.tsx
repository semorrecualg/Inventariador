import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  History, 
  Settings, 
  TrendingDown, 
  ArrowLeftRight, 
  PlusCircle, 
  FileText, 
  ArrowLeft,
  Search,
  Filter,
  Download,
  DollarSign,
  Calendar,
  PieChart
} from 'lucide-react';
import { Asset } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabaseService';
import { assetControlService } from '../services/assetControlService';
import { AssetCategory } from '../types';

interface AssetControlModuleProps {
  onBack: () => void;
  username: string;
  tenantId: string;
}

type SubModule = 'DASHBOARD' | 'ASSETS' | 'MOVEMENTS' | 'DEPRECIATION' | 'CATEGORIES' | 'REPORTS';

const AssetControlModule: React.FC<AssetControlModuleProps> = ({ onBack, username, tenantId }) => {
  const [activeSubModule, setActiveSubModule] = useState<SubModule>('DASHBOARD');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalValue: 0,
    totalDepreciated: 0,
    residualValue: 0,
    activeCount: 0,
    writeOffCount: 0
  });

  useEffect(() => {
    fetchAssets();
    fetchCategories();
  }, [tenantId]);

  const fetchAssets = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('_tenantId', tenantId);

      if (error) throw error;
      
      const loadedAssets = data || [];
      setAssets(loadedAssets);

      // Calcular estatísticas básicas
      const totalValue = loadedAssets.reduce((acc, curr) => acc + (Number(curr._valor_aquisicao) || Number(curr.VLRAQUISIC) || 0), 0);
      const totalDepreciated = loadedAssets.reduce((acc, curr) => acc + (Number(curr._depreciacao_acumulada) || 0), 0);
      const residualValue = loadedAssets.reduce((acc, curr) => acc + (Number(curr._valor_residual) || 0), 0);
      const activeCount = loadedAssets.filter(a => a._status_contabil !== 'BAIXADO').length;
      const writeOffCount = loadedAssets.filter(a => a._status_contabil === 'BAIXADO').length;

      setStats({
        totalValue,
        totalDepreciated,
        residualValue,
        activeCount,
        writeOffCount
      });
    } catch (err) {
      console.error('Erro ao carregar ativos contábeis:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await assetControlService.getCategories(tenantId);
      setCategories(data);
    } catch (err) {
      console.error('Erro ao carregar categorias:', err);
    }
  };

  const handleSaveCategory = async (cat: Partial<AssetCategory>) => {
    try {
      await assetControlService.saveCategory({ ...cat, _tenantId: tenantId });
      fetchCategories();
    } catch (err) {
      console.error('Erro ao salvar categoria:', err);
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
          <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm">
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
                    <div className="text-sm text-slate-700">{asset._data_aquisicao || asset.DATAAQUSIC || '-'}</div>
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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar do Módulo */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-200">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Controle de Ativos</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Módulo Contábil</p>
            </div>
          </div>

          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Início</span>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button 
            onClick={() => setActiveSubModule('DASHBOARD')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeSubModule === 'DASHBOARD' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('ASSETS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeSubModule === 'ASSETS' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Package className="w-5 h-5" />
            <span>Ativos Imobilizados</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('MOVEMENTS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeSubModule === 'MOVEMENTS' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <ArrowLeftRight className="w-5 h-5" />
            <span>Movimentações</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('DEPRECIATION')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeSubModule === 'DEPRECIATION' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <TrendingDown className="w-5 h-5" />
            <span>Cálculo Depreciação</span>
          </button>

          <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Configurações
          </div>

          <button 
            onClick={() => setActiveSubModule('CATEGORIES')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeSubModule === 'CATEGORIES' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Contas e Taxas</span>
          </button>

          <button 
            onClick={() => setActiveSubModule('REPORTS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeSubModule === 'REPORTS' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span>Relatórios Fiscais</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Usuário</div>
            <div className="text-xs font-semibold text-slate-700 truncate">{username}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <h2 className="text-lg font-semibold text-slate-800">
            {activeSubModule === 'DASHBOARD' && 'Visão Geral do Imobilizado'}
            {activeSubModule === 'ASSETS' && 'Gestão de Ativos Contábeis'}
            {activeSubModule === 'MOVEMENTS' && 'Histórico de Movimentações'}
            {activeSubModule === 'DEPRECIATION' && 'Processamento de Depreciação'}
            {activeSubModule === 'CATEGORIES' && 'Configuração de Contas'}
            {activeSubModule === 'REPORTS' && 'Central de Relatórios'}
          </h2>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
              <Calendar className="w-4 h-4" />
              <span>Período: Março / 2026</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
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
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-slate-800">Contas e Taxas de Depreciação</h3>
                      <button 
                        onClick={() => handleSaveCategory({ name: 'Nova Categoria', account_code: '000', annual_depreciation_rate: 10, useful_life_months: 120 })}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Nova Conta</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50">
                            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome da Conta</th>
                            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Código</th>
                            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Taxa Anual (%)</th>
                            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vida Útil (Meses)</th>
                            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {categories.map((cat) => (
                            <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-sm font-medium text-slate-800">{cat.name}</td>
                              <td className="px-6 py-4 text-sm text-slate-600">{cat.account_code}</td>
                              <td className="px-6 py-4 text-sm text-slate-600">{cat.annual_depreciation_rate}%</td>
                              <td className="px-6 py-4 text-sm text-slate-600">{cat.useful_life_months}</td>
                              <td className="px-6 py-4">
                                <button className="text-emerald-600 hover:text-emerald-700 font-medium text-sm">Editar</button>
                              </td>
                            </tr>
                          ))}
                          {categories.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                Nenhuma conta configurada.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {activeSubModule !== 'DASHBOARD' && activeSubModule !== 'ASSETS' && activeSubModule !== 'CATEGORIES' && (
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
    </div>
  );
};

export default AssetControlModule;
