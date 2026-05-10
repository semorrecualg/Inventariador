import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package as PackageIcon, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  PlusCircle, 
  AlertCircle,
  CheckCircle2,
  Table as TableIcon
} from 'lucide-react';
import { sqliteService } from '../services/sqliteService';
import { Asset } from '../types';

const ITEMS_PER_PAGE = 50;

const Inventory: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyPending, setShowOnlyPending] = useState(false);

  // Mapped constants for GBR v24
  const ACCOUNTS_TO_HIDE = ['131105001'];

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const offset = currentPage * ITEMS_PER_PAGE;
      let sqlCount = "SELECT COUNT(*) as count FROM assets WHERE 1=1";
      let sqlData = "SELECT * FROM assets WHERE 1=1";
      const params: any[] = [];

      // Filter out hidden accounts
      if (ACCOUNTS_TO_HIDE.length > 0) {
        const placeholders = ACCOUNTS_TO_HIDE.map(() => '?').join(',');
        sqlCount += ` AND N3_CONTA NOT IN (${placeholders})`;
        sqlData += ` AND N3_CONTA NOT IN (${placeholders})`;
        params.push(...ACCOUNTS_TO_HIDE);
      }

      if (searchQuery) {
        const searchParam = `%${searchQuery}%`;
        const searchClause = ` AND (C_CODIGO LIKE ? OR C_DESCRICAO LIKE ?)`;
        sqlCount += searchClause;
        sqlData += searchClause;
        params.push(searchParam, searchParam);
      }

      if (showOnlyPending) {
        const pendingClause = ` AND C_STATUS_AUDIT = 'pending'`;
        sqlCount += pendingClause;
        sqlData += pendingClause;
      }

      // Get total count
      try {
        const countRes = sqliteService.executeQuery(sqlCount, params);
        const total = (countRes[0]?.values[0][0] as number) || 0;
        setTotalCount(total);
      } catch (e) {
        console.warn("Table 'assets' might not exist yet:", e);
        setTotalCount(0);
        setAssets([]);
        setIsLoading(false);
        return;
      }

      // Fetch data with limit and offset
      const paginatedSql = `${sqlData} ORDER BY SN1_RECNO DESC LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}`;
      const res = sqliteService.executeQuery(paginatedSql, params);
      
      if (res.length > 0) {
        const columns = res[0].columns;
        const rows = res[0].values.map(row => {
          const obj: any = {};
          columns.forEach((col, i) => {
            obj[col] = row[i];
          });
          return obj as Asset;
        });
        setAssets(rows);
      } else {
        setAssets([]);
      }
    } catch (err) {
      console.error("Error fetching assets:", err);
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, showOnlyPending]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleAddSurplus = async () => {
    // Lógica de Sobras: Ativo Não Cadastrado
    const recno = Date.now();
    const uuid = crypto.randomUUID();
    const newAsset: Asset = {
      _uuid: uuid,
      _origemTransacao: 1000,
      _status_sinc: 0,
      C_CODIGO: `SOBRA-${recno}`,
      C_DESCRICAO: "NOVO ATIVO IDENTIFICADO NO CAMPO",
      C_STATUS_AUDIT: 'verified',
      SN1_RECNO: recno,
      SN3_RECNO: recno,
      N3_CONTA: 'SURPLUS',
    };

    try {
      sqliteService.executeQuery(
        `INSERT INTO assets (_uuid, _origemTransacao, _status_sinc, C_CODIGO, C_DESCRICAO, C_STATUS_AUDIT, SN1_RECNO, SN3_RECNO, N3_CONTA) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, 1000, 0, newAsset.C_CODIGO, newAsset.C_DESCRICAO, 'verified', recno, recno, 'SURPLUS']
      );
      
      setAssets(prev => [newAsset, ...prev]);
      setTotalCount(t => t + 1);
      
      // Audit Trail (Rule of 5)
      await sqliteService.saveIncremental();
    } catch (err) {
      console.error("Failed to add surplus:", err);
    }
  };

  const updateAssetStatus = async (sn1: number, sn3: number, newStatus: Asset['C_STATUS_AUDIT']) => {
    try {
      sqliteService.executeQuery(
        "UPDATE assets SET C_STATUS_AUDIT = ? WHERE SN1_RECNO = ? AND SN3_RECNO = ?",
        [newStatus, sn1, sn3]
      );
      
      setAssets(prev => prev.map(a => 
        (a.SN1_RECNO === sn1 && a.SN3_RECNO === sn3) ? { ...a, C_STATUS_AUDIT: newStatus } : a
      ));

      // Audit Trail
      await sqliteService.saveIncremental();
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Inventário Kardek</h1>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            <TableIcon size={16} /> Mapeamento SIGAATF Ativo (GBR v24)
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowOnlyPending(!showOnlyPending)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
              showOnlyPending ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter size={18} /> {showOnlyPending ? 'Pendentes' : 'Todos'}
          </button>
          <button 
            onClick={handleAddSurplus}
            className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all"
          >
            <PlusCircle size={18} /> Ativo não Cadastrado
          </button>
        </div>
      </header>

      {/* Stats Quickbar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Encontrados</p>
          <p className="text-xl font-black text-slate-800">{totalCount}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Página</p>
          <p className="text-xl font-black text-slate-800">{currentPage + 1}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text"
          placeholder="Buscar por código ou descrição..."
          className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm font-medium"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden relative min-h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Código / Recno</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Audit</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {assets.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={4} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                       <AlertCircle size={48} className="text-slate-200" />
                       <p className="text-slate-400 font-bold uppercase tracking-tighter italic">Base de Dados Vazia ou Sem Resultados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={`${asset.SN1_RECNO}-${asset.SN3_RECNO}`} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-slate-700 text-sm">{asset.C_CODIGO}</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-tighter">SIGA: {asset.SN1_RECNO} | {asset.SN3_RECNO}</span>
                      </div>
                    </td>
                    <td className="p-4 max-w-xs md:max-w-md">
                      <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-tight uppercase">{asset.C_DESCRICAO}</p>
                      {asset.N3_CONTA && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono uppercase font-bold">{asset.N3_CONTA}</span>}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {asset.C_STATUS_AUDIT === 'verified' && (
                          <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 uppercase">
                            <CheckCircle2 size={12} /> Verificado
                          </div>
                        )}
                        {asset.C_STATUS_AUDIT === 'pending' || !asset.C_STATUS_AUDIT ? (
                          <div className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 uppercase">
                            <AlertCircle size={12} /> Pendente
                          </div>
                        ) : null}
                        {asset.C_STATUS_AUDIT === 'divergent' && (
                          <div className="bg-rose-100 text-rose-700 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 uppercase">
                            <AlertCircle size={12} /> Divergente
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2 justify-end">
                        <button 
                          onClick={() => updateAssetStatus(asset.SN1_RECNO, asset.SN3_RECNO, 'verified')}
                          className="w-10 h-10 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm active:scale-90"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                        <button 
                         onClick={() => updateAssetStatus(asset.SN1_RECNO, asset.SN3_RECNO, 'divergent')}
                         className="w-10 h-10 flex items-center justify-center bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-90"
                        >
                          <AlertCircle size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {totalCount > 0 ? `Total: ${totalCount} ativos` : 'Sem registros'}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-sm font-bold text-slate-700 font-mono">
                {currentPage + 1}
                </span>
            </div>
            <button 
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={(currentPage + 1) * ITEMS_PER_PAGE >= totalCount}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
