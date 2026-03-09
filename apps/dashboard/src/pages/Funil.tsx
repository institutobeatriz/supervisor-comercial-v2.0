import { useApi } from '../hooks/useApi'
import { PRODUCTS } from '../config/products'

// ─── Tipos ───────────────────────────────────────────────────

interface FunnelStage {
  status: string
  qtd: string
  valor: string
}

interface FunnelData {
  stages: FunnelStage[]
  temperature: { quente: number; morno: number; frio: number }
  stats: {
    total_conversations: number
    total_messages: number
    classified_messages: number
    purchase_intents: number
  }
}

interface Props {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
}

// ─── Componente ───────────────────────────────────────────────

export default function FunilPage({ selectedProduct, periodMode, selectedDate, selectedMonth }: Props) {
  const product = PRODUCTS[selectedProduct] || PRODUCTS['all']

  const buildQuery = () => {
    const params = new URLSearchParams()
    if (selectedProduct !== 'all') params.append('sellerId', selectedProduct)
    params.append('periodMode', periodMode)
    if (periodMode === 'day') params.append('date', selectedDate)
    else params.append('month', selectedMonth)
    const q = params.toString()
    return `/dashboard/funnel${q ? '?' + q : ''}`
  }

  const { data: funnel, loading, error } = useApi<FunnelData>(buildQuery())
  const hasData = Boolean(
    funnel &&
    ((funnel.stages?.length || 0) > 0 || (funnel.stats?.total_conversations || 0) > 0)
  )

  if (error && !funnel) {
    return (
      <div className="glass rounded-xl p-6 border border-accent-danger/30">
        <h2 className="text-xl font-bold text-white mb-2">Funil Comercial</h2>
        <p className="text-sm text-accent-danger">Erro ao carregar dados: {error}</p>
      </div>
    )
  }

  if (!loading && !hasData) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Funil Comercial</h2>
        <p className="text-sm text-gray-500">Nenhum dado encontrado para o filtro selecionado.</p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">{product.emoji}</span>
          <h2 className="text-2xl font-bold text-white">Funil Comercial</h2>
        </div>
        <p className="text-sm text-gray-500">{product.name} • Pipeline de vendas</p>
      </header>

      {/* Temperatura */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-xl p-4 border border-red-500/30">
          <p className="text-xs text-gray-500">Quentes</p>
          <p className="text-3xl font-bold text-red-400">
            {loading ? '—' : (funnel?.temperature?.quente ?? 0)}
          </p>
        </div>
        <div className="glass rounded-xl p-4 border border-yellow-500/30">
          <p className="text-xs text-gray-500">Mornos</p>
          <p className="text-3xl font-bold text-yellow-400">
            {loading ? '—' : (funnel?.temperature?.morno ?? 0)}
          </p>
        </div>
        <div className="glass rounded-xl p-4 border border-blue-500/30">
          <p className="text-xs text-gray-500">Frios</p>
          <p className="text-3xl font-bold text-blue-400">
            {loading ? '—' : (funnel?.temperature?.frio ?? 0)}
          </p>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="glass rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-white mb-3">Estatísticas</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-dark-700/50 rounded-lg">
            <p className="text-xs text-gray-500">Conversas</p>
            <p className="text-lg font-bold text-white">{funnel?.stats?.total_conversations ?? 0}</p>
          </div>
          <div className="p-3 bg-dark-700/50 rounded-lg">
            <p className="text-xs text-gray-500">Mensagens</p>
            <p className="text-lg font-bold text-white">{funnel?.stats?.total_messages ?? 0}</p>
          </div>
          <div className="p-3 bg-dark-700/50 rounded-lg">
            <p className="text-xs text-gray-500">Classificadas</p>
            <p className="text-lg font-bold text-white">{funnel?.stats?.classified_messages ?? 0}</p>
          </div>
          <div className="p-3 bg-dark-700/50 rounded-lg">
            <p className="text-xs text-gray-500">Intenções de Compra</p>
            <p className="text-lg font-bold text-accent-success">{funnel?.stats?.purchase_intents ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Estágios */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Estágios</h3>
        {loading && (
          <div className="flex items-center justify-center h-24 text-gray-500 text-sm">
            Carregando...
          </div>
        )}
        <div className="space-y-3">
          {funnel?.stages?.map((stage, i) => {
            const maxQtd = Math.max(...(funnel.stages.map(s => parseInt(s.qtd))), 1)
            const pct = Math.min((parseInt(stage.qtd) / maxQtd) * 100, 100)
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-400">{stage.status}</span>
                <div className="flex-1 h-8 bg-dark-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm text-white font-medium w-8 text-right">{stage.qtd}</span>
                <span className="text-xs text-gray-500 w-28 text-right">{stage.valor}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
