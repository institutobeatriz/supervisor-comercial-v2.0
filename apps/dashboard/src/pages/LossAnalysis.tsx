import { useApi } from '../hooks/useApi'
import { TrendingDown, AlertTriangle, XCircle, BarChart3 } from 'lucide-react'

interface LossStats {
  by_stage: Array<{ stage: string; total: number; lost: number; loss_rate: number }>
  by_objection: Array<{ objection: string; total: number; won: number; lost: number; win_rate: number }>
  loss_reasons: Array<{ reason: string; count: number; percentage: number }>
  summary: {
    total_conversations: number
    lost_at_lead: number
    lost_at_qualificacao: number
    lost_at_proposta: number
    lost_at_fechamento: number
    overall_loss_rate: number
  }
}

interface PageFilterProps {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
}

export default function LossAnalysisPage({ selectedProduct, periodMode, selectedDate, selectedMonth }: PageFilterProps) {
  const buildQuery = () => {
    const p = new URLSearchParams()
    if (selectedProduct !== 'all') p.append('sellerId', selectedProduct)
    p.append('periodMode', periodMode)
    if (periodMode === 'day') p.append('date', selectedDate)
    else p.append('month', selectedMonth)
    return p.toString()
  }
  const { data: lossData, loading, error } = useApi<LossStats>(`/dashboard/loss-stats?${buildQuery()}`)

  if (loading) return <div className="text-gray-400">Carregando...</div>
  if (error && !lossData) {
    return (
      <div className="glass rounded-xl p-6 border border-accent-danger/30">
        <h2 className="text-2xl font-bold text-white mb-2">Análise de Perdas</h2>
        <p className="text-sm text-accent-danger">Erro ao carregar: {error}</p>
      </div>
    )
  }

  const data = lossData || { by_stage: [], by_objection: [], loss_reasons: [], summary: { total_conversations: 0, lost_at_lead: 0, lost_at_qualificacao: 0, lost_at_proposta: 0, lost_at_fechamento: 0, overall_loss_rate: 0 } }
  const hasContent = data.summary.total_conversations > 0 || data.loss_reasons.length > 0 || data.by_objection.length > 0

  if (!hasContent) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Análise de Perdas</h2>
        <p className="text-sm text-gray-500">Sem dados de perdas para o período selecionado.</p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Análise de Perdas</h2>
        <p className="text-sm text-gray-500">Identifique onde e por que as vendas são perdidas</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="glass rounded-xl p-4 glow-box border border-accent-danger/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={16} className="text-accent-danger" />
            <span className="text-xs text-gray-500">Taxa de Perda</span>
          </div>
          <p className="text-2xl font-bold text-accent-danger">{data.summary.overall_loss_rate.toFixed(1)}%</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={16} className="text-gray-400" />
            <span className="text-xs text-gray-500">Perdas no Lead</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.summary.lost_at_lead}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-accent-warning" />
            <span className="text-xs text-gray-500">Total Conversas</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.summary.total_conversations}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-accent-primary" />
            <span className="text-xs text-gray-500">Objeções Detectadas</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.by_objection.length}</p>
        </div>
      </div>

      {/* Perdas por Estágio */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="glass rounded-xl p-4 glow-box">
          <h3 className="text-sm font-semibold text-white mb-4">Perdas por Estágio do Funil</h3>
          <div className="space-y-3">
            {data.by_stage.map((stage, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-400 capitalize">{stage.stage}</span>
                <div className="flex-1 h-6 bg-dark-700 rounded overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-accent-danger to-accent-warning" 
                    style={{width: `${Math.min(stage.loss_rate, 100)}%`}}
                  ></div>
                </div>
                <span className="text-sm text-white font-medium w-16 text-right">{stage.loss_rate.toFixed(0)}%</span>
                <span className="text-xs text-gray-500 w-20 text-right">{stage.lost}/{stage.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Motivos de Perda */}
        <div className="glass rounded-xl p-4 glow-box">
          <h3 className="text-sm font-semibold text-white mb-4">Principais Motivos de Perda</h3>
          {data.loss_reasons.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum motivo registrado</p>
          ) : (
            <div className="space-y-3">
              {data.loss_reasons.map((reason, i) => (
                <div key={i} className="p-3 bg-dark-700/50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white">{reason.reason}</span>
                    <span className="text-xs text-accent-danger">{reason.percentage}%</span>
                  </div>
                  <div className="h-1.5 bg-dark-600 rounded overflow-hidden">
                    <div 
                      className="h-full bg-accent-danger" 
                      style={{width: `${reason.percentage}%`}}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{reason.count} conversas</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Objeções */}
      <div className="glass rounded-xl p-4 glow-box">
        <h3 className="text-sm font-semibold text-white mb-4">Objeções Detectadas</h3>
        {data.by_objection.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma objeção detectada</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {data.by_objection.slice(0, 6).map((obj, i) => (
              <div key={i} className="p-3 bg-dark-700/50 rounded-lg">
                <p className="text-sm text-white font-medium capitalize">{obj.objection}</p>
                <p className="text-xs text-gray-500 mt-1">{obj.total} ocorrências</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
