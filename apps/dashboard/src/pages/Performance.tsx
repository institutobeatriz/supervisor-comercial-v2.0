import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Minus, Users, DollarSign, Target, Award,
  ChevronDown, ChevronUp, Clock, BarChart2, Star, Zap,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { useApi } from '../hooks/useApi'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SellerFull {
  seller_id: string
  seller_name: string
  rank: number
  adjusted_rank: number
  leads: number
  conversions: number
  revenue_cents: number
  conversion_rate: number
  avg_quality: number
  ticket_medio_cents: number
  adjusted_rate: number
  trend: 'up' | 'down' | 'stable'
  funnel: {
    lead: number
    qualificacao: number
    proposta: number
    fechamento: number
    fechado: number
  }
  stage_time: {
    lead_days: number
    qualificacao_days: number
    proposta_days: number
    fechamento_days: number
  }
  weekly_evolution: Array<{ week: string; vendas: number; revenue_cents: number }>
  best_hours: Array<{ hour: number; wins: number }>
}

interface TeamTotals {
  total_leads: number
  total_conversions: number
  total_revenue_cents: number
  avg_conversion_rate: number
  global_avg_quality: number
  total_sellers: number
}

interface SellersFullData {
  sellers: SellerFull[]
  team_totals: TeamTotals
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(cents: number) {
  return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatHour(h: number) {
  return `${String(h).padStart(2, '0')}h`
}

const FUNNEL_STAGES = [
  { key: 'lead', label: 'Lead', color: '#6366f1' },
  { key: 'qualificacao', label: 'Qualif.', color: '#8b5cf6' },
  { key: 'proposta', label: 'Proposta', color: '#f59e0b' },
  { key: 'fechamento', label: 'Fechamento', color: '#10b981' },
  { key: 'fechado', label: 'Fechado', color: '#22c55e' },
] as const

const STAGE_TIME_LABELS: Record<string, string> = {
  lead_days: 'Lead',
  qualificacao_days: 'Qualificação',
  proposta_days: 'Proposta',
  fechamento_days: 'Fechamento',
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <TrendingUp size={14} className="text-green-400" />
  if (trend === 'down') return <TrendingDown size={14} className="text-red-400" />
  return <Minus size={14} className="text-gray-500" />
}

function RankDelta({ rank, adjustedRank }: { rank: number; adjustedRank: number }) {
  const delta = rank - adjustedRank
  if (delta > 0) return (
    <span className="text-[10px] text-green-400 ml-1">▲{delta}</span>
  )
  if (delta < 0) return (
    <span className="text-[10px] text-red-400 ml-1">▼{Math.abs(delta)}</span>
  )
  return null
}

// ─── Componente de detalhe do vendedor ───────────────────────────────────────

function SellerDetail({ seller }: { seller: SellerFull }) {
  const maxFunnel = seller.funnel.lead || 1

  const weeklyData = seller.weekly_evolution.map((w, i) => ({
    name: `S${i + 1}`,
    vendas: w.vendas,
    receita: w.revenue_cents / 100,
  }))

  const maxStageTime = Math.max(
    seller.stage_time.lead_days,
    seller.stage_time.qualificacao_days,
    seller.stage_time.proposta_days,
    seller.stage_time.fechamento_days,
    1,
  )

  return (
    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-dark-600 pt-3">
      {/* Funil individual */}
      <div className="bg-dark-800/50 rounded-xl p-3">
        <h5 className="text-[11px] text-gray-500 font-semibold mb-3 flex items-center gap-1">
          <BarChart2 size={11} /> Funil do Vendedor
        </h5>
        <div className="space-y-1.5">
          {FUNNEL_STAGES.map(({ key, label, color }) => {
            const val = seller.funnel[key] as number
            const pct = Math.round((val / maxFunnel) * 100)
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-14 text-right shrink-0">{label}</span>
                <div className="flex-1 h-4 bg-dark-700 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                  />
                </div>
                <span className="text-[10px] text-white w-6 shrink-0">{val}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tempo por estágio */}
      <div className="bg-dark-800/50 rounded-xl p-3">
        <h5 className="text-[11px] text-gray-500 font-semibold mb-3 flex items-center gap-1">
          <Clock size={11} /> Dias por Estágio
        </h5>
        <div className="space-y-1.5">
          {Object.entries(STAGE_TIME_LABELS).map(([key, label]) => {
            const val = seller.stage_time[key as keyof typeof seller.stage_time]
            const pct = Math.round((val / maxStageTime) * 100)
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-20 text-right shrink-0">{label}</span>
                <div className="flex-1 h-4 bg-dark-700 rounded overflow-hidden">
                  <div
                    className="h-full rounded bg-accent-primary/70 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-white w-8 shrink-0">{val}d</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Evolução semanal */}
      <div className="bg-dark-800/50 rounded-xl p-3 col-span-2">
        <h5 className="text-[11px] text-gray-500 font-semibold mb-2 flex items-center gap-1">
          <TrendingUp size={11} /> Evolução Semanal (últimas 4 semanas)
        </h5>
        {weeklyData.length === 0 ? (
          <p className="text-gray-600 text-xs py-4 text-center">Sem dados de evolução semanal</p>
        ) : (
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={weeklyData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradW-${seller.seller_id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(val: any) => [val, 'Vendas']}
              />
              <Area
                type="monotone"
                dataKey="vendas"
                stroke="#6366f1"
                strokeWidth={2}
                fill={`url(#gradW-${seller.seller_id})`}
                dot={{ r: 3, fill: '#6366f1' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Melhores horários */}
      {seller.best_hours.length > 0 && (
        <div className="bg-dark-800/50 rounded-xl p-3 col-span-2">
          <h5 className="text-[11px] text-gray-500 font-semibold mb-2 flex items-center gap-1">
            <Zap size={11} /> Top 3 Horários de Fechamento
          </h5>
          <div className="flex gap-3">
            {seller.best_hours.map((h, i) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center p-2 bg-dark-700/60 rounded-lg border border-dark-600">
                <span className="text-[10px] text-gray-500 mb-0.5">#{i + 1}</span>
                <span className="text-lg font-bold text-white">{formatHour(h.hour)}</span>
                <span className="text-[10px] text-accent-success">{h.wins} wins</span>
              </div>
            ))}
            {seller.best_hours.length < 3 && Array(3 - seller.best_hours.length).fill(0).map((_, i) => (
              <div key={i} className="flex-1 flex items-center justify-center p-2 bg-dark-700/20 rounded-lg border border-dark-600/40">
                <span className="text-[10px] text-gray-700">—</span>
              </div>
            ))}
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

export default function PerformancePage({ selectedProduct, periodMode, selectedDate, selectedMonth }: PageFilterProps) {
  const buildQuery = () => {
    const p = new URLSearchParams()
    if (selectedProduct !== 'all') p.append('sellerId', selectedProduct)
    p.append('periodMode', periodMode)
    if (periodMode === 'day') p.append('date', selectedDate)
    else p.append('month', selectedMonth)
    return p.toString()
  }
  const { data, loading, error } = useApi<SellersFullData>(`/dashboard/sellers/full?${buildQuery()}`)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<'revenue' | 'conversion' | 'adjusted'>('revenue')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 animate-pulse">Carregando análise de vendedores...</div>
    </div>
  )

  if (error) return (
    <div className="glass rounded-xl p-6 border border-accent-danger/30">
      <p className="text-accent-danger text-sm">Erro ao carregar: {error}</p>
    </div>
  )

  const totals = data?.team_totals || {
    total_leads: 0, total_conversions: 0, total_revenue_cents: 0,
    avg_conversion_rate: 0, global_avg_quality: 0, total_sellers: 0,
  }

  let sellers = [...(data?.sellers || [])]
  if (sortMode === 'conversion') sellers.sort((a, b) => b.conversion_rate - a.conversion_rate)
  else if (sortMode === 'adjusted') sellers.sort((a, b) => b.adjusted_rate - a.adjusted_rate)
  // 'revenue' já vem ordenado

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Performance de Vendedores</h2>
        <p className="text-sm text-gray-500">{totals.total_sellers} vendedor{totals.total_sellers !== 1 ? 'es' : ''} ativos • Análise do mês atual</p>
      </header>

      {/* KPIs do time */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-accent-primary" />
            <span className="text-xs text-gray-500">Total de Leads</span>
          </div>
          <p className="text-2xl font-bold text-white">{totals.total_leads.toLocaleString('pt-BR')}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-success/20">
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-accent-success" />
            <span className="text-xs text-gray-500">Conversões</span>
          </div>
          <p className="text-2xl font-bold text-accent-success">{totals.total_conversions.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-gray-500">{totals.avg_conversion_rate}% média</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-warning/20">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-accent-warning" />
            <span className="text-xs text-gray-500">Faturamento Total</span>
          </div>
          <p className="text-2xl font-bold text-accent-warning">{fmtBRL(totals.total_revenue_cents)}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <Star size={16} className="text-gray-400" />
            <span className="text-xs text-gray-500">Qualidade Média</span>
          </div>
          <p className="text-2xl font-bold text-white">{totals.global_avg_quality}</p>
          <p className="text-xs text-gray-500">score de leads</p>
        </div>
      </div>

      {/* Tabela de ranking */}
      <div className="glass rounded-xl p-4 glow-box">
        {/* Header com filtro de ordenação */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Award size={16} className="text-accent-warning" />
            Ranking de Vendedores
          </h3>
          <div className="flex gap-1">
            {(['revenue', 'conversion', 'adjusted'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  sortMode === mode
                    ? 'bg-accent-primary text-white'
                    : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
                }`}
              >
                {mode === 'revenue' ? 'Faturamento' : mode === 'conversion' ? 'Conversão' : 'Ajustado*'}
              </button>
            ))}
          </div>
        </div>

        {sortMode === 'adjusted' && (
          <p className="text-[10px] text-gray-600 mb-3 -mt-2">
            * Ranking ajustado normaliza a taxa de conversão pela qualidade dos leads recebidos — valoriza vendedores que convertem leads mais difíceis.
          </p>
        )}

        {sellers.length === 0 && (
          <div className="py-10 text-center text-gray-500 text-sm">Nenhum vendedor encontrado</div>
        )}

        <div className="space-y-2">
          {sellers.map((seller) => {
            const isExpanded = expanded === seller.seller_id
            const displayRank = sortMode === 'adjusted' ? seller.adjusted_rank : sortMode === 'conversion'
              ? sellers.findIndex(s => s.seller_id === seller.seller_id) + 1
              : seller.rank

            return (
              <div
                key={seller.seller_id}
                className="rounded-xl border border-dark-600 overflow-hidden transition-all"
              >
                {/* Linha do vendedor */}
                <button
                  className="w-full flex items-center gap-3 p-3 bg-dark-700/40 hover:bg-dark-700/70 transition-colors text-left"
                  onClick={() => setExpanded(isExpanded ? null : seller.seller_id)}
                >
                  {/* Posição */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    displayRank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                    displayRank === 2 ? 'bg-gray-400/20 text-gray-300' :
                    displayRank === 3 ? 'bg-orange-600/20 text-orange-400' :
                    'bg-dark-600 text-gray-500'
                  }`}>
                    {displayRank}
                  </div>

                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary font-bold text-sm shrink-0">
                    {seller.seller_name.charAt(0).toUpperCase()}
                  </div>

                  {/* Nome e tendência */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white truncate">{seller.seller_name}</span>
                      <TrendIcon trend={seller.trend} />
                      {sortMode === 'adjusted' && seller.rank !== seller.adjusted_rank && (
                        <RankDelta rank={seller.rank} adjustedRank={seller.adjusted_rank} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-500">{seller.leads} leads</span>
                      <span className="text-[10px] text-gray-600">•</span>
                      <span className="text-[10px] text-gray-500">{seller.conversions} vendas</span>
                      <span className="text-[10px] text-gray-600">•</span>
                      <span className="text-[10px] text-gray-500">Q:{seller.avg_quality}</span>
                    </div>
                  </div>

                  {/* Métricas chave */}
                  <div className="flex gap-4 items-center shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-gray-500">Conversão</p>
                      <p className={`text-sm font-bold ${seller.conversion_rate >= 30 ? 'text-accent-success' : seller.conversion_rate >= 15 ? 'text-accent-warning' : 'text-gray-300'}`}>
                        {seller.conversion_rate}%
                      </p>
                    </div>
                    {sortMode === 'adjusted' && (
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-gray-500">Ajustada</p>
                        <p className="text-sm font-bold text-accent-primary">{seller.adjusted_rate}%</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500">Faturamento</p>
                      <p className="text-sm font-bold text-white">{fmtBRL(seller.revenue_cents)}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-gray-500">Ticket médio</p>
                      <p className="text-sm font-medium text-gray-300">{fmtBRL(seller.ticket_medio_cents)}</p>
                    </div>

                    {/* Expand toggle */}
                    <div className="text-gray-500 ml-1">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </button>

                {/* Painel de detalhe */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-dark-800/30">
                    <SellerDetail seller={seller} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
