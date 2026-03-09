import { useState } from 'react'
import {
  Target, DollarSign, Users, TrendingUp, AlertCircle,
  ShoppingCart, RefreshCcw, Star, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend, Cell,
} from 'recharts'
import { useApi } from '../hooks/useApi'
import { PRODUCTS } from '../config/products'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ProductData {
  seller_id: string
  seller_name: string
  leads: number
  conversions: number
  revenue_cents: number
  conversion_rate: number
  avg_quality: number
  ticket_medio_cents: number
  goal_cents: number
  goal_progress_pct: number
  reactivation_count: number
  reactivation_rate_pct: number
  price_sensitivity_pct: number
  top_objections: Array<{ objection: string; count: number }>
  top_loss_reasons: Array<{ reason: string; count: number }>
}

interface ComparisonData {
  products: ProductData[]
  totals: {
    total_leads: number
    total_revenue_cents: number
    total_goal_cents: number
    total_conversions: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(cents: number) {
  return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function getProductMeta(sellerId: string) {
  return PRODUCTS[sellerId] || {
    name: 'Produto',
    emoji: '📦',
    colorHex: '#6366f1',
    color: 'text-accent-primary',
    description: '',
  }
}

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

// ─── Card de produto ──────────────────────────────────────────────────────────

function ProductCard({ product, rank, totalLeads, totalRevenue }: {
  product: ProductData
  rank: number
  totalLeads: number
  totalRevenue: number
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = getProductMeta(product.seller_id)
  const goalColor = product.goal_progress_pct >= 100
    ? 'text-accent-success'
    : product.goal_progress_pct >= 70
    ? 'text-accent-warning'
    : 'text-accent-danger'
  const goalBarColor = product.goal_progress_pct >= 100
    ? '#22c55e'
    : product.goal_progress_pct >= 70
    ? '#f59e0b'
    : '#ef4444'
  const leadsShare = totalLeads > 0 ? Math.round((product.leads / totalLeads) * 100) : 0
  const revenueShare = totalRevenue > 0 ? Math.round((product.revenue_cents / totalRevenue) * 100) : 0

  return (
    <div className="glass rounded-xl overflow-hidden glow-box border border-dark-600">
      {/* Header */}
      <div className="p-4 border-b border-dark-600/50" style={{ borderTopColor: meta.colorHex, borderTopWidth: 3 }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta.emoji}</span>
            <div>
              <h3 className="text-sm font-bold text-white">{meta.name}</h3>
              <p className="text-[10px] text-gray-500">{meta.description || product.seller_name}</p>
            </div>
          </div>
          <span className="text-xs text-gray-600 bg-dark-700 px-2 py-0.5 rounded-full">#{rank}</span>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Leads</p>
          <p className="text-lg font-bold text-white">{product.leads.toLocaleString('pt-BR')}</p>
          <p className="text-[10px] text-gray-600">{leadsShare}% do total</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Conversão</p>
          <p className={`text-lg font-bold ${product.conversion_rate >= 30 ? 'text-accent-success' : product.conversion_rate >= 15 ? 'text-accent-warning' : 'text-gray-300'}`}>
            {product.conversion_rate}%
          </p>
          <p className="text-[10px] text-gray-600">{product.conversions} vendas</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Faturamento</p>
          <p className="text-base font-bold text-accent-warning">{fmtBRL(product.revenue_cents)}</p>
          <p className="text-[10px] text-gray-600">{revenueShare}% do total</p>
        </div>
      </div>

      {/* Meta do mês */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">Meta do mês</span>
          <span className={`text-xs font-bold ${goalColor}`}>{product.goal_progress_pct}%</span>
        </div>
        <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(product.goal_progress_pct, 100)}%`,
              backgroundColor: goalBarColor,
            }}
          />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-gray-600">{fmtBRL(product.revenue_cents)}</span>
          <span className="text-[9px] text-gray-600">{fmtBRL(product.goal_cents)}</span>
        </div>
      </div>

      {/* Métricas adicionais */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
        <div className="bg-dark-700/50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Ticket Médio</p>
          <p className="text-xs font-bold text-white">{fmtBRL(product.ticket_medio_cents)}</p>
        </div>
        <div className="bg-dark-700/50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Reativações</p>
          <p className="text-xs font-bold text-blue-400">{product.reactivation_count}</p>
          <p className="text-[9px] text-gray-600">{product.reactivation_rate_pct}%</p>
        </div>
        <div className="bg-dark-700/50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Sens. Preço</p>
          <p className={`text-xs font-bold ${product.price_sensitivity_pct >= 30 ? 'text-red-400' : product.price_sensitivity_pct >= 15 ? 'text-yellow-400' : 'text-green-400'}`}>
            {product.price_sensitivity_pct}%
          </p>
        </div>
      </div>

      {/* Toggle detalhes */}
      <button
        className="w-full flex items-center justify-center gap-1 px-4 py-2 border-t border-dark-600/40 text-[10px] text-gray-500 hover:text-white hover:bg-dark-700/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'Ocultar detalhes' : 'Ver objeções e perdas'}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Top objeções */}
          <div>
            <p className="text-[10px] text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
              <AlertCircle size={10} /> Top Objeções (30 dias)
            </p>
            {product.top_objections.length === 0 ? (
              <p className="text-[10px] text-gray-700">Sem dados</p>
            ) : (
              <div className="space-y-1">
                {product.top_objections.map((obj, i) => (
                  <div key={i} className="flex items-center justify-between bg-dark-700/40 rounded px-2 py-1">
                    <span className="text-[10px] text-gray-300 truncate">{obj.objection}</span>
                    <span className="text-[10px] text-gray-500 ml-2 shrink-0">{obj.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top motivos de perda */}
          <div>
            <p className="text-[10px] text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
              <TrendingUp size={10} className="rotate-180" /> Motivos de Perda
            </p>
            {product.top_loss_reasons.length === 0 ? (
              <p className="text-[10px] text-gray-700">Sem perdas registradas</p>
            ) : (
              <div className="space-y-1">
                {product.top_loss_reasons.map((lr, i) => (
                  <div key={i} className="flex items-center justify-between bg-dark-700/40 rounded px-2 py-1">
                    <span className="text-[10px] text-gray-300 truncate">{lr.reason}</span>
                    <span className="text-[10px] text-red-400 ml-2 shrink-0">{lr.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

interface PageFilterProps {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
}

export default function ProdutosPage({ selectedProduct, periodMode, selectedDate, selectedMonth }: PageFilterProps) {
  const buildQuery = () => {
    const p = new URLSearchParams()
    if (selectedProduct !== 'all') p.append('sellerId', selectedProduct)
    p.append('periodMode', periodMode)
    if (periodMode === 'day') p.append('date', selectedDate)
    else p.append('month', selectedMonth)
    return p.toString()
  }
  const { data, loading, error } = useApi<ComparisonData>(`/dashboard/products/comparison?${buildQuery()}`)
  const [chartMetric, setChartMetric] = useState<'revenue' | 'conversion' | 'leads'>('revenue')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 animate-pulse">Carregando análise por produto...</div>
    </div>
  )

  if (error) return (
    <div className="glass rounded-xl p-6 border border-accent-danger/30">
      <p className="text-accent-danger text-sm">Erro ao carregar: {error}</p>
    </div>
  )

  const products = data?.products || []
  const totals = data?.totals || { total_leads: 0, total_revenue_cents: 0, total_goal_cents: 0, total_conversions: 0 }

  // Dados para gráfico de barras comparativo
  const chartData = products.map((p) => {
    const meta = getProductMeta(p.seller_id)
    return {
      name: meta.name.length > 14 ? meta.name.slice(0, 12) + '…' : meta.name,
      emoji: meta.emoji,
      colorHex: meta.colorHex,
      revenue: Math.round(p.revenue_cents / 100),
      conversion: p.conversion_rate,
      leads: p.leads,
    }
  })

  // Dados para radar comparativo
  const maxLeads = Math.max(...products.map(p => p.leads), 1)
  const maxRevenue = Math.max(...products.map(p => p.revenue_cents), 1)
  const maxConversion = Math.max(...products.map(p => p.conversion_rate), 1)
  const maxQuality = Math.max(...products.map(p => p.avg_quality), 1)
  const maxReactivation = Math.max(...products.map(p => p.reactivation_rate_pct), 1)

  const radarData = [
    { metric: 'Leads', ...Object.fromEntries(products.map(p => [p.seller_id, Math.round((p.leads / maxLeads) * 100)])) },
    { metric: 'Conversão', ...Object.fromEntries(products.map(p => [p.seller_id, Math.round((p.conversion_rate / maxConversion) * 100)])) },
    { metric: 'Faturamento', ...Object.fromEntries(products.map(p => [p.seller_id, Math.round((p.revenue_cents / maxRevenue) * 100)])) },
    { metric: 'Qualidade', ...Object.fromEntries(products.map(p => [p.seller_id, Math.round((p.avg_quality / maxQuality) * 100)])) },
    { metric: 'Reativação', ...Object.fromEntries(products.map(p => [p.seller_id, Math.round((p.reactivation_rate_pct / Math.max(maxReactivation, 1)) * 100)])) },
  ]

  const globalGoalPct = totals.total_goal_cents > 0
    ? Math.round((totals.total_revenue_cents / totals.total_goal_cents) * 100)
    : 0

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Análise por Produto</h2>
        <p className="text-sm text-gray-500">{products.length} produto{products.length !== 1 ? 's' : ''} ativo{products.length !== 1 ? 's' : ''} • Mês atual</p>
      </header>

      {/* Totais consolidados */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-accent-primary" />
            <span className="text-[10px] text-gray-500">Total de Leads</span>
          </div>
          <p className="text-2xl font-bold text-white">{totals.total_leads.toLocaleString('pt-BR')}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-success/20">
          <div className="flex items-center gap-2 mb-1">
            <Target size={14} className="text-accent-success" />
            <span className="text-[10px] text-gray-500">Total Conversões</span>
          </div>
          <p className="text-2xl font-bold text-accent-success">{totals.total_conversions.toLocaleString('pt-BR')}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-accent-warning" />
            <span className="text-[10px] text-gray-500">Faturamento Total</span>
          </div>
          <p className="text-xl font-bold text-accent-warning">{fmtBRL(totals.total_revenue_cents)}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-1">
            <Target size={14} className="text-gray-400" />
            <span className="text-[10px] text-gray-500">Meta Consolidada</span>
          </div>
          <p className={`text-2xl font-bold ${globalGoalPct >= 100 ? 'text-accent-success' : globalGoalPct >= 70 ? 'text-accent-warning' : 'text-accent-danger'}`}>
            {globalGoalPct}%
          </p>
          <p className="text-[10px] text-gray-600">{fmtBRL(totals.total_goal_cents)}</p>
        </div>
      </div>

      {/* Gráfico comparativo + Radar */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Bar Chart comparativo */}
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Comparativo por Produto</h3>
            <div className="flex gap-1">
              {(['revenue', 'conversion', 'leads'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setChartMetric(m)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    chartMetric === m ? 'bg-accent-primary text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {m === 'revenue' ? 'R$' : m === 'conversion' ? '%' : 'Leads'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(val: any) => [
                  chartMetric === 'revenue' ? `R$ ${val.toLocaleString('pt-BR')}` :
                  chartMetric === 'conversion' ? `${val}%` : val,
                  chartMetric === 'revenue' ? 'Faturamento' : chartMetric === 'conversion' ? 'Conversão' : 'Leads',
                ]}
              />
              <Bar dataKey={chartMetric} radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.colorHex} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar comparativo */}
        {products.length >= 2 ? (
          <div className="glass rounded-xl p-4 glow-box">
            <h3 className="text-sm font-semibold text-white mb-3">Radar Comparativo</h3>
            <ResponsiveContainer width="100%" height={160}>
              <RadarChart data={radarData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                {products.map((p, i) => (
                  <Radar
                    key={p.seller_id}
                    name={getProductMeta(p.seller_id).name}
                    dataKey={p.seller_id}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                ))}
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                  formatter={(value) => {
                    const meta = getProductMeta(products.find(p => getProductMeta(p.seller_id).name === value)?.seller_id || '')
                    return `${meta.emoji} ${value}`
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass rounded-xl p-4 glow-box flex items-center justify-center">
            <p className="text-xs text-gray-600">Radar disponível com 2+ produtos</p>
          </div>
        )}
      </div>

      {/* Cards de produtos */}
      <div className={`grid gap-4 ${products.length === 1 ? 'grid-cols-1 max-w-md' : products.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {products.map((product, i) => (
          <ProductCard
            key={product.seller_id}
            product={product}
            rank={i + 1}
            totalLeads={totals.total_leads}
            totalRevenue={totals.total_revenue_cents}
          />
        ))}
      </div>

      {products.length === 0 && (
        <div className="py-16 text-center text-gray-500 text-sm">
          Nenhum produto encontrado. Verifique se há vendedores ativos no sistema.
        </div>
      )}
    </>
  )
}
