import { useApi } from '../hooks/useApi'
import { Activity, Zap, DollarSign, Calendar, Cpu } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

interface MetricData {
  total: { tokens: number; costCents: number; costBRL: string }
  byDate: Array<{ date: string; tokens: number; costCents: number; count: number }>
  byTask: Array<{ task: string; tokens: number; costCents: number; count: number }>
  byModel: Array<{ model: string; tokens: number; costCents: number; count: number }>
}

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6']

interface PageFilterProps {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
}

export default function MetricsIAPage({ selectedProduct }: PageFilterProps) {
  const sellerQ = selectedProduct !== 'all' ? `&sellerId=${selectedProduct}` : ''
  const { data: metrics, loading, error } = useApi<MetricData>(`/metrics/usage?days=7${sellerQ}`)

  if (loading) return <div className="text-gray-400">Carregando...</div>
  if (error && !metrics) {
    return (
      <div className="glass rounded-xl p-6 border border-accent-danger/30">
        <h2 className="text-2xl font-bold text-white mb-2">Métricas de IA</h2>
        <p className="text-sm text-accent-danger">Erro ao carregar métricas: {error}</p>
      </div>
    )
  }

  const data = metrics || { total: { tokens: 0, costCents: 0, costBRL: 'R$ 0,00' }, byDate: [], byTask: [], byModel: [] }
  const hasContent = data.total.tokens > 0 || data.byTask.length > 0 || data.byModel.length > 0

  if (!hasContent) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Métricas de IA</h2>
        <p className="text-sm text-gray-500">Sem consumo de IA registrado para o período selecionado.</p>
      </div>
    )
  }

  const chartData = data.byDate.map(d => ({
    date: d.date.slice(5),
    tokens: d.tokens,
    custo: d.costCents / 100
  }))

  const taskPieData = data.byTask.slice(0, 5).map(t => ({
    name: t.task,
    value: t.tokens
  }))

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Métricas de IA</h2>
        <p className="text-sm text-gray-500">Uso e custo dos modelos de linguagem</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-accent-primary" />
            <span className="text-xs text-gray-500">Total Tokens</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.total.tokens.toLocaleString()}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-accent-success" />
            <span className="text-xs text-gray-500">Custo Total</span>
          </div>
          <p className="text-2xl font-bold text-accent-success">{data.total.costBRL}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={16} className="text-accent-warning" />
            <span className="text-xs text-gray-500">Chamadas</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.byTask.reduce((sum, t) => sum + t.count, 0)}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={16} className="text-gray-400" />
            <span className="text-xs text-gray-500">Modelos</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.byModel.length}</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Tokens por Dia */}
        <div className="glass rounded-xl p-4 glow-box">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Calendar size={16} /> Tokens por Dia
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#252532" />
              <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
              <YAxis stroke="#6b7280" fontSize={10} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a25', border: '1px solid #6366f1', borderRadius: '8px' }} />
              <Bar dataKey="tokens" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Por Tarefa */}
        <div className="glass rounded-xl p-4 glow-box">
          <h3 className="text-sm font-semibold text-white mb-3">Tokens por Tarefa</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={taskPieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {taskPieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1a1a25', border: '1px solid #6366f1', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {data.byTask.slice(0, 5).map((t, i) => (
              <span key={t.task} className="text-xs px-2 py-1 rounded bg-dark-700" style={{ color: COLORS[i % COLORS.length] }}>
                {t.task}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Por Modelo */}
      <div className="glass rounded-xl p-4 glow-box">
        <h3 className="text-sm font-semibold text-white mb-4">Uso por Modelo</h3>
        <div className="grid grid-cols-3 gap-3">
          {data.byModel.map((model, i) => (
            <div key={model.model} className="p-3 bg-dark-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-sm text-white font-medium truncate">{model.model}</span>
              </div>
              <p className="text-xs text-gray-400">{model.tokens.toLocaleString()} tokens</p>
              <p className="text-xs text-gray-500">{model.count} chamadas</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
