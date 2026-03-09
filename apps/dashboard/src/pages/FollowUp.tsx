import { Clock, AlertTriangle, CheckCircle, XCircle, Target, Phone, Send, Calendar, User, MessageCircle } from 'lucide-react'
import { useApi } from '../hooks/useApi'

interface FollowupConversation {
  conversation_id: string
  contact_name: string
  contact_phone: string
  seller_name: string
  funnel_stage: string
  last_message_at: string
  last_message_text: string
  days_since_contact: number
  quality_score: number
  temperature: 'hot' | 'warm' | 'cold'
  urgency: 'critical' | 'high' | 'medium'
  next_action: string
  message_count: number
}

interface FollowupStats {
  total_pending: number
  overdue: number
  forgotten: number
  today: number
  this_week: number
}

interface FollowupData {
  items: FollowupConversation[]
  stats: FollowupStats
}

const temperatureStyle: Record<string, string> = {
  hot: 'bg-red-500/20 text-red-400 border-red-500/30',
  warm: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  cold: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}
const temperatureLabel: Record<string, string> = { hot: 'Quente', warm: 'Morno', cold: 'Frio' }

const urgencyStyle: Record<string, string> = {
  critical: 'border-l-4 border-accent-danger',
  high: 'border-l-4 border-accent-warning',
  medium: 'border-l-4 border-dark-600',
}

const stageLabel: Record<string, string> = {
  lead: 'Lead',
  qualificacao: 'Qualificação',
  proposta: 'Proposta',
  fechamento: 'Fechamento',
  pos_venda: 'Pós-venda',
}

function formatDaysSince(days: number): string {
  if (days === 0) return 'Hoje'
  if (days === 1) return '1 dia atrás'
  return `${days} dias atrás`
}

interface PageFilterProps {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
}

export default function FollowUpPage({ selectedProduct, periodMode, selectedDate, selectedMonth }: PageFilterProps) {
  const buildQuery = () => {
    const p = new URLSearchParams({ limit: '50' })
    if (selectedProduct !== 'all') p.append('sellerId', selectedProduct)
    p.append('periodMode', periodMode)
    if (periodMode === 'day') p.append('date', selectedDate)
    else p.append('month', selectedMonth)
    return p.toString()
  }
  const { data, loading, error } = useApi<FollowupData>(`/dashboard/followup/full?${buildQuery()}`)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 animate-pulse">Carregando follow-ups...</div>
    </div>
  )

  if (error) return (
    <div className="glass rounded-xl p-6 border border-accent-danger/30">
      <p className="text-accent-danger text-sm">Erro ao carregar: {error}</p>
    </div>
  )

  const stats = data?.stats || { total_pending: 0, overdue: 0, forgotten: 0, today: 0, this_week: 0 }
  const conversations = data?.items || []

  const criticos = conversations.filter(c => c.urgency === 'critical')
  const atrasados = conversations.filter(c => c.urgency === 'high')
  const normais = conversations.filter(c => c.urgency === 'medium')

  if (conversations.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Follow-up</h2>
        <p className="text-sm text-gray-500">Nenhuma conversa pendente para acompanhamento no período atual.</p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Follow-up</h2>
        <p className="text-sm text-gray-500">{conversations.length} conversas ativas precisando de atenção</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="glass rounded-xl p-4 glow-box">
          <Clock size={18} className="text-gray-400 mb-2" />
          <p className="text-2xl font-bold text-white">{stats.total_pending}</p>
          <p className="text-xs text-gray-500 mt-1">Pendentes</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-danger/30">
          <AlertTriangle size={18} className="text-accent-danger mb-2" />
          <p className="text-2xl font-bold text-accent-danger">{stats.overdue}</p>
          <p className="text-xs text-gray-500 mt-1">Atrasados</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-red-900/30">
          <XCircle size={18} className="text-red-500 mb-2" />
          <p className="text-2xl font-bold text-red-400">{stats.forgotten}</p>
          <p className="text-xs text-gray-500 mt-1">Esquecidos (+7d)</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <CheckCircle size={18} className="text-accent-success mb-2" />
          <p className="text-2xl font-bold text-accent-success">{stats.today}</p>
          <p className="text-xs text-gray-500 mt-1">Ativos Hoje</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <Target size={18} className="text-accent-primary mb-2" />
          <p className="text-2xl font-bold text-white">{stats.this_week}</p>
          <p className="text-xs text-gray-500 mt-1">Esta Semana</p>
        </div>
      </div>

      {/* Críticos — ação imediata */}
      {criticos.length > 0 && (
        <div className="glass rounded-xl p-4 glow-box border border-accent-danger/30 mb-4">
          <h3 className="text-sm font-semibold text-accent-danger mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="animate-pulse" />
            Ação Imediata — Esquecidos há mais de 7 dias ({criticos.length})
          </h3>
          <div className="space-y-2">
            {criticos.map((conv) => (
              <div key={conv.conversation_id} className={`p-3 bg-accent-danger/10 rounded-xl flex items-center gap-3 ${urgencyStyle.critical}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-accent-danger`}>
                  {conv.contact_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-white">{conv.contact_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${temperatureStyle[conv.temperature]}`}>
                      {temperatureLabel[conv.temperature]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{conv.last_message_text || conv.next_action}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1"><User size={10} />{conv.seller_name}</span>
                    <span className="flex items-center gap-1"><Calendar size={10} />{formatDaysSince(conv.days_since_contact)}</span>
                    <span className="flex items-center gap-1"><MessageCircle size={10} />{conv.message_count} msgs</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-white">{conv.quality_score}</p>
                  <p className="text-[10px] text-gray-500">Score</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    disabled
                    className="p-2 bg-accent-primary/20 rounded-lg text-accent-primary opacity-50 cursor-not-allowed"
                    title="Ação disponível em próxima fase"
                  >
                    <Send size={14} />
                  </button>
                  <button
                    disabled
                    className="p-2 bg-accent-success/20 rounded-lg text-accent-success opacity-50 cursor-not-allowed"
                    title="Ação disponível em próxima fase"
                  >
                    <Phone size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Atrasados */}
        <div className="glass rounded-xl p-4 glow-box">
          <h3 className="text-sm font-semibold text-accent-warning mb-3 flex items-center gap-2">
            <AlertTriangle size={16} />
            Atrasados — 3 a 7 dias sem resposta ({atrasados.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {atrasados.length === 0 && <p className="text-gray-500 text-sm">Nenhum atrasado</p>}
            {atrasados.map((conv) => (
              <div key={conv.conversation_id} className={`p-2.5 bg-dark-700/50 rounded-lg flex items-center gap-2 ${urgencyStyle.high}`}>
                <div className="w-8 h-8 rounded-full bg-accent-warning/20 flex items-center justify-center text-accent-warning font-bold text-sm flex-shrink-0">
                  {conv.contact_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{conv.contact_name}</p>
                  <p className="text-[11px] text-gray-500">{formatDaysSince(conv.days_since_contact)} • Score {conv.quality_score}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    disabled
                    className="p-1.5 bg-accent-primary/20 rounded-lg text-accent-primary opacity-50 cursor-not-allowed"
                    title="Ação disponível em próxima fase"
                  >
                    <Send size={12} />
                  </button>
                  <button
                    disabled
                    className="p-1.5 bg-accent-success/20 rounded-lg text-accent-success opacity-50 cursor-not-allowed"
                    title="Ação disponível em próxima fase"
                  >
                    <Phone size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Em dia */}
        <div className="glass rounded-xl p-4 glow-box">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Clock size={16} />
            Acompanhamento Regular ({normais.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {normais.length === 0 && <p className="text-gray-500 text-sm">Nenhum pendente</p>}
            {normais.map((conv) => (
              <div key={conv.conversation_id} className="p-2.5 bg-dark-700/30 rounded-lg flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary font-bold text-sm flex-shrink-0">
                  {conv.contact_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{conv.contact_name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">{stageLabel[conv.funnel_stage] || conv.funnel_stage}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded ${temperatureStyle[conv.temperature]}`}>
                      {temperatureLabel[conv.temperature]}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-gray-500 flex-shrink-0">{formatDaysSince(conv.days_since_contact)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
