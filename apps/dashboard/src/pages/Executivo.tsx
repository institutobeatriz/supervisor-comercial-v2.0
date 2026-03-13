import { useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Minus,
  DollarSign, ShoppingCart, Users, Target,
  Clock, Zap, BarChart3, AlertTriangle, Shield,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { useApi } from '../hooks/useApi'

// ─── Tipos ───────────────────────────────────────────────────

interface KPIs {
  faturamentoMes: number
  vendasQtd: number
  leadsRecebidos: number
  leadsAtendidos: number
  leadsPerdidos: number
  taxaConversao: number
  ticketMedio: number
  tempoMedioResposta: string
  metaMes: number
}

interface Comparison {
  current: Record<string, number>
  previous: Record<string, number>
  changes: Record<string, number>
  ref_month: string
  prev_month: string
}

interface DailyPoint {
  date: string
  leads: number
  conversions: number
  revenue: number
}

interface WeightedStage {
  stage: string
  count: number
  value_cents: number
  probability: number
  weighted_value_cents: number
}

interface PipelineData {
  stages: WeightedStage[]
  total_pipeline: number
  total_weighted: number
  total_count: number
}

interface AnalyticsCurrent {
  activeRecords: number
  assignedOwners: number
  unassignedOwners: number
  ownerCoveragePct: number | null
  breachedEscalations: number
}

interface AnalyticsData {
  generatedAt: string | null
  current: AnalyticsCurrent | null
  totalEntries: number
}

// ─── Helpers ─────────────────────────────────────────────────

const stageLabel: Record<string, string> = {
  lead: 'Lead',
  qualificacao: 'Qualificação',
  proposta: 'Proposta',
  fechamento: 'Fechamento',
  pos_venda: 'Pós-venda',
}

const stageColor: Record<string, string> = {
  lead: '#6366f1',
  qualificacao: '#f59e0b',
  proposta: '#8b5cf6',
  fechamento: '#10b981',
  pos_venda: '#06b6d4',
}

function fmtBRL(cents: number) {
  return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })
}

function fmtPct(n: number) {
  return n > 0 ? `+${n}%` : `${n}%`
}

function monthLabel(ym: string) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

// ─── Sub-componentes ─────────────────────────────────────────

function ChangeChip({ value, invertido = false }: { value: number; invertido?: boolean }) {
  const positive = invertido ? value < 0 : value > 0
  const neutral = value === 0
  if (neutral) return <span className="flex items-center gap-0.5 text-xs text-gray-500"><Minus size={10} /> 0%</span>
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-accent-success' : 'text-accent-danger'}`}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {fmtPct(Math.abs(value))}
    </span>
  )
}

// ─── Componente Principal ────────────────────────────────────

interface Props {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
  productName: string
  productEmoji: string
  productColor: string
}

export default function ExecutivoPage({
  selectedProduct, periodMode, selectedDate, selectedMonth,
  productName, productEmoji, productColor,
}: Props) {

  // Queries
  const kpisParams = new URLSearchParams()
  if (selectedProduct !== 'all') kpisParams.append('sellerId', selectedProduct)
  kpisParams.append('periodMode', periodMode)
  if (periodMode === 'day') kpisParams.append('date', selectedDate)
  else kpisParams.append('month', selectedMonth)

  const compParams = new URLSearchParams()
  if (selectedProduct !== 'all') compParams.append('sellerId', selectedProduct)
  compParams.append('month', selectedMonth)

  const pipelineParams = new URLSearchParams()
  if (selectedProduct !== 'all') pipelineParams.append('sellerId', selectedProduct)

  const evolutionParams = new URLSearchParams()
  if (selectedProduct !== 'all') evolutionParams.append('sellerId', selectedProduct)
  evolutionParams.append('days', '30')

  const { data: kpis, loading: kpisLoading, error: kpisError } = useApi<KPIs>(`/dashboard/kpis?${kpisParams}`)
  const { data: comparison, loading: comparisonLoading, error: comparisonError } = useApi<Comparison>(`/dashboard/kpis-comparison?${compParams}`)
  const { data: evolution, loading: evolutionLoading, error: evolutionError } = useApi<DailyPoint[]>(`/dashboard/daily-evolution?${evolutionParams}`)
  const { data: pipeline, loading: pipelineLoading, error: pipelineError } = useApi<PipelineData>(`/dashboard/pipeline-weighted?${pipelineParams}`)
  const { data: analytics } = useApi<AnalyticsData>('/observability/connectors/backend/analytics?limit=1')
  const primaryLoading = kpisLoading
  const hasAnyError = kpisError || comparisonError || evolutionError || pipelineError
  const noData = !kpis && !primaryLoading

  if (primaryLoading && !kpis) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Visão Executiva</h2>
        <p className="text-sm text-gray-500">Carregando indicadores executivos...</p>
      </div>
    )
  }

  if (noData && hasAnyError) {
    return (
      <div className="glass rounded-xl p-6 border border-accent-danger/30">
        <h2 className="text-2xl font-bold text-white mb-2">Visão Executiva</h2>
        <p className="text-sm text-accent-danger">Falha ao carregar dados: {hasAnyError}</p>
      </div>
    )
  }

  if (noData) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Visão Executiva</h2>
        <p className="text-sm text-gray-500">Sem dados para os filtros selecionados.</p>
      </div>
    )
  }

  // Forecast: baseado no ritmo atual do mês
  const forecast = useMemo(() => {
    const today = new Date()
    const dayOfMonth = today.getDate()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const revenue = kpis?.faturamentoMes || 0
    const meta = kpis?.metaMes || 1
    const pace = dayOfMonth > 0 ? revenue / dayOfMonth : 0
    const projected = Math.round(pace * daysInMonth)
    const projectedPct = Math.round((projected / meta) * 100)
    const currentPct = Math.round((revenue / meta) * 100)
    const daysLeft = daysInMonth - dayOfMonth
    const neededPerDay = Math.max(0, Math.round((meta - revenue) / Math.max(daysLeft, 1)))
    return { projected, projectedPct, currentPct, pace, daysLeft, neededPerDay, daysInMonth, dayOfMonth }
  }, [kpis])

  const metaColor = forecast.projectedPct >= 100 ? '#10b981' : forecast.projectedPct >= 70 ? '#f59e0b' : '#ef4444'
  const periodLabel = periodMode === 'day' ? `Dia ${selectedDate}` : `Mês ${selectedMonth}`

  // Gráfico: agrupa dados diários
  const chartData = useMemo(() => {
    if (!evolution) return []
    return evolution.map(d => ({
      day: String(d.date).slice(8, 10), // só o dia (dd)
      leads: d.leads,
      vendas: d.conversions,
      receita: Math.round(d.revenue),
    }))
  }, [evolution])

  return (
    <>
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">{productEmoji}</span>
          <h2 className="text-2xl font-bold text-white">Visão Executiva</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-dark-700 ${productColor}`}>
            {productName}
          </span>
        </div>
        <p className="text-sm text-gray-500">{periodLabel}</p>
        {hasAnyError && (
          <p className="text-xs text-accent-warning mt-2">
            Parte dos blocos pode estar incompleta: {hasAnyError}
          </p>
        )}
      </header>

      {/* ── Bloco 1: KPIs Principais ── */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <KpiCard
          label="Faturamento"
          value={`R$ ${(kpis?.faturamentoMes || 0).toLocaleString('pt-BR')}`}
          change={comparison?.changes.revenue}
          icon={<DollarSign size={14} className="text-gray-400" />}
        />
        <KpiCard
          label="Vendas"
          value={String(kpis?.vendasQtd || 0)}
          change={comparison?.changes.sales}
          icon={<ShoppingCart size={14} className="text-gray-400" />}
        />
        <KpiCard
          label="Leads Recebidos"
          value={String(kpis?.leadsRecebidos || 0)}
          change={comparison?.changes.leads}
          icon={<Users size={14} className="text-gray-400" />}
        />
        <KpiCard
          label="Conversão"
          value={`${kpis?.taxaConversao || 0}%`}
          change={comparison?.changes.conversion}
          icon={<Target size={14} className="text-gray-400" />}
        />
        <KpiCard
          label="Ticket Médio"
          value={`R$ ${(kpis?.ticketMedio || 0).toLocaleString('pt-BR')}`}
          change={comparison?.changes.ticket}
          icon={<BarChart3 size={14} className="text-gray-400" />}
        />
      </div>

      {/* ── Bloco 2: KPIs Secundários ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="glass rounded-xl p-4 glow-box">
          <p className="text-xs text-gray-500">Leads Atendidos</p>
          <p className="text-xl font-bold text-accent-success">{kpis?.leadsAtendidos || 0}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <p className="text-xs text-gray-500">Leads Perdidos</p>
          <p className="text-xl font-bold text-accent-danger">{kpis?.leadsPerdidos || 0}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <p className="text-xs text-gray-500">Tempo de Resposta</p>
          <p className="text-xl font-bold text-white">{kpis?.tempoMedioResposta || '—'}</p>
          {comparison && <ChangeChip value={comparison.changes.response_time} />}
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <p className="text-xs text-gray-500">Mês Anterior</p>
          <p className="text-xl font-bold text-gray-400">
            {comparison ? `R$ ${(comparison.previous.revenue_cents / 100).toLocaleString('pt-BR')}` : '—'}
          </p>
          {comparison && <p className="text-[10px] text-gray-600">{monthLabel(comparison.prev_month)}</p>}
        </div>
      </div>

      {/* ── Bloco 3: Forecast + Comparativo ── */}
      {periodMode === 'month' && (
        <div className="grid grid-cols-3 gap-4 mb-6">

          {/* Forecast */}
          <div className="glass rounded-xl p-4 glow-box col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap size={14} className="text-accent-warning" /> Projeção do Mês
              </h3>
              <span className="text-xs text-gray-500">{forecast.dayOfMonth}/{forecast.daysInMonth} dias</span>
            </div>

            {/* Barra de progresso dupla: atual vs projetado */}
            <div className="relative mb-3">
              <div className="h-7 bg-dark-700 rounded-lg overflow-hidden">
                {/* Projetado (fundo) */}
                <div
                  className="absolute inset-y-0 left-0 rounded-lg opacity-20"
                  style={{ width: `${Math.min(forecast.projectedPct, 100)}%`, backgroundColor: metaColor }}
                />
                {/* Atual (frente) */}
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all"
                  style={{ width: `${Math.min(forecast.currentPct, 100)}%`, backgroundColor: metaColor }}
                />
                {/* Label dentro */}
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-xs font-bold text-white drop-shadow">
                    {forecast.currentPct}% atingido · projeção {forecast.projectedPct}%
                  </span>
                </div>
              </div>
              {/* Linha da meta */}
              <div className="absolute top-0 bottom-0 border-r-2 border-white/60 border-dashed" style={{ left: '100%', display: forecast.projectedPct >= 100 ? 'none' : undefined }} />
            </div>

            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="p-2 bg-dark-700/50 rounded-lg text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">Atual</p>
                <p className="text-sm font-bold text-white">R$ {(kpis?.faturamentoMes || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="p-2 bg-dark-700/50 rounded-lg text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">Projeção</p>
                <p className="text-sm font-bold" style={{ color: metaColor }}>R$ {forecast.projected.toLocaleString('pt-BR')}</p>
              </div>
              <div className="p-2 bg-dark-700/50 rounded-lg text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">Meta</p>
                <p className="text-sm font-bold text-white">R$ {(kpis?.metaMes || 0).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            {forecast.daysLeft > 0 && forecast.projectedPct < 100 && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-accent-warning/10 border border-accent-warning/20 rounded-lg">
                <AlertTriangle size={13} className="text-accent-warning flex-shrink-0" />
                <p className="text-xs text-accent-warning">
                  Precisa de <strong>R$ {forecast.neededPerDay.toLocaleString('pt-BR')}/dia</strong> nos {forecast.daysLeft} dias restantes para atingir a meta.
                </p>
              </div>
            )}
            {forecast.projectedPct >= 100 && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-accent-success/10 border border-accent-success/20 rounded-lg">
                <Target size={13} className="text-accent-success flex-shrink-0" />
                <p className="text-xs text-accent-success">No ritmo atual a meta será <strong>superada</strong>. 🎯</p>
              </div>
            )}
          </div>

          {/* Comparativo mês anterior */}
          <div className="glass rounded-xl p-4 glow-box">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp size={14} className="text-accent-primary" />
              vs {comparison ? monthLabel(comparison.prev_month) : 'Mês Anterior'}
            </h3>
            {comparison ? (
              <div className="space-y-2.5">
                <ComparRow label="Faturamento" change={comparison.changes.revenue} />
                <ComparRow label="Vendas" change={comparison.changes.sales} />
                <ComparRow label="Leads" change={comparison.changes.leads} />
                <ComparRow label="Conversão" change={comparison.changes.conversion} />
                <ComparRow label="Ticket Médio" change={comparison.changes.ticket} />
                <ComparRow label="Resp. Tempo" change={comparison.changes.response_time} invertido />
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Carregando...</p>
            )}
          </div>
        </div>
      )}

      {/* ── Bloco 4: Gráfico Evolução Diária ── */}
      <div className="glass rounded-xl p-4 glow-box mb-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 size={14} className="text-accent-primary" /> Evolução Diária — Últimos 30 dias
        </h3>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Sem dados no período</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Leads vs Vendas */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Leads × Vendas</p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gVendas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252532" />
                  <XAxis dataKey="day" stroke="#4b5563" fontSize={10} tickLine={false} />
                  <YAxis stroke="#4b5563" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a25', border: '1px solid #6366f1', borderRadius: '8px', fontSize: 11 }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="leads" stroke="#6366f1" fill="url(#gLeads)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="vendas" stroke="#10b981" fill="url(#gVendas)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Faturamento diário */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Faturamento (R$)</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252532" />
                  <XAxis dataKey="day" stroke="#4b5563" fontSize={10} tickLine={false} />
                  <YAxis stroke="#4b5563" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a25', border: '1px solid #6366f1', borderRadius: '8px', fontSize: 11 }}
                    formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, 'Receita']}
                  />
                  <Bar dataKey="receita" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ── Bloco 5: Pipeline com Valor Ponderado ── */}
      <div className="glass rounded-xl p-4 glow-box">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Target size={14} className="text-accent-primary" /> Pipeline com Valor Esperado
          </h3>
          {pipeline && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-500">
                Pipeline bruto: <span className="text-white font-medium">{fmtBRL(pipeline.total_pipeline)}</span>
              </span>
              <span className="text-gray-500">
                Valor esperado: <span className="text-accent-success font-medium">{fmtBRL(pipeline.total_weighted)}</span>
              </span>
            </div>
          )}
        </div>

        {!pipeline || pipeline.stages.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum dado de pipeline</p>
        ) : (
          <div className="space-y-3">
            {pipeline.stages.filter(s => s.count > 0 || s.value_cents > 0).map((stage) => {
              const barPct = pipeline.total_pipeline > 0
                ? Math.min((stage.value_cents / pipeline.total_pipeline) * 100, 100)
                : 0
              const weightedBarPct = pipeline.total_pipeline > 0
                ? Math.min((stage.weighted_value_cents / pipeline.total_pipeline) * 100, 100)
                : 0
              return (
                <div key={stage.stage} className="flex items-center gap-3">
                  {/* Label + probabilidade */}
                  <div className="w-28 flex-shrink-0">
                    <p className="text-sm text-gray-300">{stageLabel[stage.stage] || stage.stage}</p>
                    <p className="text-[11px] text-gray-500">{stage.probability}% chance</p>
                  </div>

                  {/* Barra dupla */}
                  <div className="flex-1 space-y-1">
                    {/* Valor bruto */}
                    <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full opacity-40"
                        style={{ width: `${barPct}%`, backgroundColor: stageColor[stage.stage] || '#6366f1' }}
                      />
                    </div>
                    {/* Valor ponderado */}
                    <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${weightedBarPct}%`, backgroundColor: stageColor[stage.stage] || '#6366f1' }}
                      />
                    </div>
                  </div>

                  {/* Valores */}
                  <div className="w-36 flex-shrink-0 text-right">
                    <p className="text-xs text-gray-400">{fmtBRL(stage.value_cents)}</p>
                    <p className="text-xs font-medium" style={{ color: stageColor[stage.stage] || '#6366f1' }}>
                      {fmtBRL(stage.weighted_value_cents)} esperado
                    </p>
                  </div>

                  {/* Qtd */}
                  <div className="w-12 flex-shrink-0 text-center">
                    <p className="text-sm font-bold text-white">{stage.count}</p>
                    <p className="text-[10px] text-gray-500">leads</p>
                  </div>
                </div>
              )
            })}

            {/* Totais */}
            <div className="mt-3 pt-3 border-t border-dark-600 flex items-center justify-between">
              <span className="text-xs text-gray-500">{pipeline.total_count} leads no pipeline</span>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-accent-primary/40 inline-block" />
                  Valor bruto
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-accent-primary inline-block" />
                  Valor esperado (ponderado)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bloco 6: Cobertura Operacional (analytics) ── */}
      {analytics?.current && (
        <div className="glass rounded-xl p-4 glow-box mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield size={14} className="text-accent-primary" /> Cobertura Operacional
            </h3>
            {analytics.generatedAt && (
              <span className="text-[10px] text-gray-500">
                {new Date(analytics.generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>

          {(() => {
            const pct = analytics.current!.ownerCoveragePct ?? 0
            const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Cobertura de Owners</span>
                  <span className="text-xs font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="p-2 bg-dark-700/50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Registros Ativos</p>
              <p className="text-lg font-bold text-white">{analytics.current!.activeRecords}</p>
            </div>
            <div className="p-2 bg-dark-700/50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Com Owner</p>
              <p className="text-lg font-bold text-accent-success">{analytics.current!.assignedOwners}</p>
            </div>
            <div className="p-2 bg-dark-700/50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Sem Owner</p>
              <p className={`text-lg font-bold ${analytics.current!.unassignedOwners > 0 ? 'text-accent-warning' : 'text-gray-500'}`}>
                {analytics.current!.unassignedOwners}
              </p>
            </div>
          </div>

          {analytics.current!.breachedEscalations > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-accent-danger/10 border border-accent-danger/20 rounded-lg">
              <AlertTriangle size={13} className="text-accent-danger flex-shrink-0" />
              <p className="text-xs text-accent-danger">
                <strong>{analytics.current!.breachedEscalations}</strong> escalação{analytics.current!.breachedEscalations > 1 ? 'ões' : ''} com SLA violado
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── Helpers de UI ───────────────────────────────────────────

function KpiCard({ label, value, change, icon }: {
  label: string
  value: string
  change?: number
  icon?: React.ReactNode
}) {
  return (
    <div className="glass rounded-xl p-4 glow-box">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      {change != null && <ChangeChip value={change} />}
    </div>
  )
}

function ComparRow({ label, change, invertido = false }: { label: string; change: number; invertido?: boolean }) {
  const positive = invertido ? change < 0 : change > 0
  const neutral = change === 0
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-medium flex items-center gap-0.5 ${
        neutral ? 'text-gray-500' : positive ? 'text-accent-success' : 'text-accent-danger'
      }`}>
        {neutral ? <Minus size={10} /> : positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        {neutral ? '0%' : `${positive ? '+' : ''}${change}%`}
      </span>
    </div>
  )
}
