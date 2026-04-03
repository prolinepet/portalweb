"use client";
import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

type ChartDataEntry = {
  name: string;
  value: number;
};

type EntityEntry = {
  id: number;
  name: string;
};

type TrendEntry = {
  name: string;
  sales: number;
  invoiced: number;
};

type DashboardData = {
  salesByCustomer: ChartDataEntry[];
  salesByStatus: ChartDataEntry[];
  salesByFamily: ChartDataEntry[];
  trend: TrendEntry[];
  availableEntities: EntityEntry[];
};

export default function SalesDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<string>('');
  const [entityId, setEntityId] = useState<string>('');

  const months = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('year', String(year));
        if (month) params.set('month', month);
        if (entityId) params.set('entityId', entityId);

        const res = await fetch(`/api/sales/dashboard?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [year, month, entityId]);

  const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  // Common options for charts
  const commonOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => fmtMoney(context.raw as number)
        }
      }
    },
  };

  // 1. Vendas por Cliente (Top 10) - Hide names on X axis, show in tooltip
  const customerChartOptions: ChartOptions<'bar'> = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      tooltip: {
        callbacks: {
            title: (items) => items[0].label, // Show name in tooltip title
            label: (context) => fmtMoney(context.raw as number)
        }
      }
    },
    scales: {
      x: {
        ticks: { display: false } // Hide labels on X axis
      }
    }
  };

  const customerChartData = {
    labels: data?.salesByCustomer?.map(d => d.name) || [],
    datasets: [{
      label: 'Vendas',
      data: data?.salesByCustomer?.map(d => d.value) || [],
      backgroundColor: 'rgba(54, 162, 235, 0.8)',
      borderRadius: 4,
    }]
  };

  // 2. Total Vendas Por Situação - Horizontal Bar
  const statusChartOptions: ChartOptions<'bar'> = {
    ...commonOptions,
    indexAxis: 'y',
    scales: {
        x: { beginAtZero: true }
    }
  };

  const statusChartData = {
    labels: data?.salesByStatus?.map(d => d.name) || [],
    datasets: [{
      label: 'Total',
      data: data?.salesByStatus?.map(d => d.value) || [],
      backgroundColor: 'rgba(14, 165, 233, 0.8)', // sky-500
      borderRadius: 4,
    }]
  };

  // 3. Total Vendas Por Fam. Comercial
  const familyChartData = {
    labels: data?.salesByFamily?.map(d => d.name) || [],
    datasets: [{
      label: 'Total',
      data: data?.salesByFamily?.map(d => d.value) || [],
      backgroundColor: 'rgba(6, 182, 212, 0.8)', // cyan-500
      borderRadius: 4,
    }]
  };

  // 4. Tendência de Vendas
  const trendChartData = {
    labels: data?.trend?.map(d => d.name) || [],
    datasets: [
      {
        label: 'Vendas (Integrado+)',
        data: data?.trend?.map(d => d.sales) || [],
        backgroundColor: 'rgba(74, 222, 128, 0.8)', // green-400
        borderRadius: 4,
      },
      {
        label: 'Faturado',
        data: data?.trend?.map(d => d.invoiced) || [],
        backgroundColor: 'rgba(59, 130, 246, 0.8)', // blue-500
        borderRadius: 4,
      }
    ]
  };


  if (loading && !data) return <div className="p-8 text-center text-gray-500">Carregando dashboard...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white p-4 rounded shadow-sm border border-gray-200 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Ano</label>
          <select 
            value={year} 
            onChange={(e) => setYear(Number(e.target.value))}
            className="border rounded px-3 py-1.5 text-sm w-32 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Mês</label>
          <select 
            value={month} 
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm w-40 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Todos</option>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Entidade</label>
          <select 
            value={entityId} 
            onChange={(e) => setEntityId(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Todas</option>
            {data?.availableEntities?.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Row 1 */}
        <div className="bg-white p-4 rounded shadow border border-gray-200 h-80 flex flex-col">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">Vendas por Cliente (Top 10)</h3>
            <div className="flex-1 min-h-0">
                <Bar data={customerChartData} options={customerChartOptions} />
            </div>
        </div>

        <div className="bg-white p-4 rounded shadow border border-gray-200 h-80 flex flex-col">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">Total Vendas Por Situação</h3>
            <div className="flex-1 min-h-0">
                <Bar data={statusChartData} options={statusChartOptions} />
            </div>
        </div>
        
        {/* Row 2 */}
        <div className="bg-white p-4 rounded shadow border border-gray-200 h-80 flex flex-col">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">Total Vendas Por Fam. Comercial R$</h3>
            <div className="flex-1 min-h-0">
                <Bar data={familyChartData} options={commonOptions} />
            </div>
        </div>
        
        {/* Trend spans 2 cols or full width depending on layout */}
        <div className="md:col-span-2 lg:col-span-3 bg-white p-4 rounded shadow border border-gray-200 h-80 flex flex-col">
             <h3 className="text-sm font-semibold mb-2 text-gray-700">{`Total Vendas x Faturado - ${year}`}</h3>
             <div className="flex-1 min-h-0">
                <Bar data={trendChartData} options={commonOptions} />
             </div>
        </div>
      </div>
    </div>
  );
}
