import React, { useEffect, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  Trophy, 
  Package as PackageIcon, 
  Activity, 
  AlertCircle 
} from 'lucide-react';
import { sqliteService } from '../services/sqliteService';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#64748b'];

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    divergent: 0
  });

  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const loadStats = () => {
      try {
        const res = sqliteService.executeQuery(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN C_STATUS_AUDIT = 'verified' THEN 1 ELSE 0 END) as verified,
            SUM(CASE WHEN C_STATUS_AUDIT = 'pending' OR C_STATUS_AUDIT IS NULL THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN C_STATUS_AUDIT = 'divergent' THEN 1 ELSE 0 END) as divergent
          FROM assets
        `);

        if (res.length > 0 && res[0].values.length > 0) {
          const [total, verified, pending, divergent] = res[0].values[0] as number[];
          setStats({ total, verified, pending, divergent });

          setChartData([
            { name: 'Verificado', value: verified, color: '#10b981' },
            { name: 'Pendente', value: pending, color: '#f59e0b' },
            { name: 'Divergente', value: divergent, color: '#ef4444' }
          ]);
        }
      } catch (err) {
        console.error("Dashboard failed to load stats:", err);
      }
    };

    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase italic">Performance Operacional</h1>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Soberania Industrial GBR v24.50</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Inventário" 
          value={stats.total} 
          icon={<PackageIcon className="text-slate-400" size={20} />} 
          trend="Base SIGA"
        />
        <StatCard 
          title="Eficiência (Verificados)" 
          value={stats.verified} 
          icon={<Trophy className="text-emerald-500" size={20} />} 
          trend={`${stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0}% Realizado`}
          color="emerald"
        />
        <StatCard 
          title="Pendentes" 
          value={stats.pending} 
          icon={<Activity className="text-amber-500" size={20} />} 
          trend="Aguardando Campo"
          color="amber"
        />
        <StatCard 
          title="Divergentes" 
          value={stats.divergent} 
          icon={<AlertCircle className="text-rose-500" size={20} />} 
          trend="Risco Operacional"
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-xl border border-slate-100 min-h-[400px]">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Status por Volume</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} 
                />
                <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} 
                />
                <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                 />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 flex flex-col">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Composição</h3>
          <div className="flex-1 min-h-[250px]">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={chartData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip />
                </PieChart>
             </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {chartData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs font-bold text-slate-500 uppercase">{item.name}</span>
                    </div>
                    <span className="text-xs font-black text-slate-800">{item.value}</span>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, color = 'slate' }: any) => (
  <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 hover:scale-[1.02] transition-all">
    <div className="flex items-center justify-between mb-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color}-50`}>
        {icon}
      </div>
    </div>
    <div className="space-y-1">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      <p className="text-2xl font-black text-slate-800 tracking-tight">{value}</p>
      <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
        {trend}
      </p>
    </div>
  </div>
);

export default Dashboard;
