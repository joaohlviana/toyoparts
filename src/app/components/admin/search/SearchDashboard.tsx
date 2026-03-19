import React, { useEffect, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  LineChart,
  Line
} from 'recharts';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Zap, 
  Search, 
  AlertCircle, 
  MousePointer2,
  Clock,
  LayoutGrid,
  TrendingUp,
  Database,
  Activity
} from 'lucide-react';
import { Card } from '../../base/card';
import { searchApi } from '../../../lib/search-api';

const data = [
  { name: '01/02', queries: 2400, zero: 120, latency: 15 },
  { name: '02/02', queries: 1398, zero: 80, latency: 12 },
  { name: '03/02', queries: 9800, zero: 450, latency: 18 },
  { name: '04/02', queries: 3908, zero: 210, latency: 14 },
  { name: '05/02', queries: 4800, zero: 190, latency: 13 },
  { name: '06/02', queries: 3800, zero: 150, latency: 11 },
  { name: '07/02', queries: 4300, zero: 160, latency: 12 },
];

const topQueries = [
  { term: 'hilux amortecedor', count: 1240, ctr: '12.4%', zero: false },
  { term: 'corolla 2018 farol', count: 890, ctr: '8.2%', zero: false },
  { term: 'embreagem etios', count: 560, ctr: '0.5%', zero: true },
  { term: 'pastilha freio rav4', count: 420, ctr: '15.1%', zero: false },
  { term: 'parachoque yaris', count: 310, ctr: '2.4%', zero: false },
];

export function SearchDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await searchApi.getStats();
        setStats(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const totalDocs = stats?.stats?.numberOfDocuments || 0;
  const healthStatus = stats?.health?.status || (stats?.health?.ok ? 'available' : 'down');
  const dbSize = stats?.stats?.databaseSize ? (stats.stats.databaseSize / 1024 / 1024).toFixed(2) + ' MB' : '0 MB';

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">Dashboard de Busca</h2>
        <p className="text-[#86868b] text-sm">Visão geral do desempenho e saúde do motor de busca.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Total Produtos" 
          value={loading ? "..." : totalDocs.toLocaleString()} 
          change={loading ? "..." : `DB: ${stats?.productsCount || 0}`} 
          trend="up" 
          icon={Database} 
          color="blue"
        />
        <KpiCard 
          title="Status do Index" 
          value={loading ? "..." : (stats?.stats?.isIndexing ? 'Indexando' : 'Pronto')} 
          change={healthStatus}
          trend={healthStatus === 'available' ? 'up' : 'down'} 
          icon={Activity} 
          color={healthStatus === 'available' ? 'emerald' : 'amber'}
        />
        <KpiCard 
          title="Tamanho DB" 
          value={loading ? "..." : dbSize} 
          change="Meili" 
          trend="down" 
          icon={LayoutGrid} 
          color="purple"
        />
        <KpiCard 
          title="Avg Latency (est)" 
          value="14.2ms" 
          change="-2.1ms" 
          trend="up" 
          icon={Clock} 
          color="emerald"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Chart (Mock Data - Analytics not implemented yet) */}
        <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
          <Card.Header className="pb-2">
            <Card.Title className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" /> Volume de Busca (Mock)
            </Card.Title>
          </Card.Header>
          <Card.Content className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#86868b' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#86868b' }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Area type="monotone" dataKey="queries" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorQueries)" />
                <Area type="monotone" dataKey="zero" stroke="#f59e0b" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </Card.Content>
        </Card.Root>

        {/* Top Queries Table (Mock Data) */}
        <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
          <Card.Header>
            <Card.Title className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-500" /> Termos Populares (Mock)
            </Card.Title>
          </Card.Header>
          <Card.Content className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-black/[0.03]">
                    <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Query</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider text-right">Volume</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider text-right">CTR</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.02]">
                  {topQueries.map((item, i) => (
                    <tr key={i} className="hover:bg-black/[0.01] transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-[#1d1d1f] dark:text-white">{item.term}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs text-[#86868b]">{item.count}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">{item.ctr}</span>
                      </td>
                      <td className="px-6 py-4">
                        {item.zero ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">Zero Results</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Healthy</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  );
}

function KpiCard({ title, value, change, trend, icon: Icon, color }: any) {
  const colors: any = {
    blue: 'text-blue-500 bg-blue-500/10',
    emerald: 'text-emerald-500 bg-emerald-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
  };

  return (
    <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
      <Card.Content className="p-5">
        <div className="flex justify-between items-start">
          <div className={`p-2 rounded-xl ${colors[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className={`flex items-center gap-0.5 text-[11px] font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-amber-500'}`}>
            {change}
            {trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
            {trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
          </div>
        </div>
        <div className="mt-4">
          <h3 className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider">{title}</h3>
          <p className="text-2xl font-bold text-[#1d1d1f] dark:text-white mt-1">{value}</p>
        </div>
      </Card.Content>
    </Card.Root>
  );
}
