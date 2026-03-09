import { useState, useEffect, useCallback } from 'react'
import {
  MessageCircle, Clock, User, Phone, Search, X, ChevronLeft, ChevronRight,
  Filter, Zap, ThumbsUp, ThumbsDown, Minus, ShoppingCart, Star,
} from 'lucide-react'
import { requestJson } from '../services/http'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  contact_name: string
  contact_phone: string
  seller_name: string
  seller_id: string
  last_message: string
  last_message_at: string
  message_count: number
  stage: string
  status: string
  outcome: string | null
  quality_score: number | null
  temperature: string | null
  urgency_score: number | null
}

interface ConvListData {
  value: Conversation[]
  count: number
  total: number
  offset: number
  limit: number
}

interface Message {
  id: string
  role: string
  text: string
  timestamp: string
  media_type: string | null
  sentiment: string | null
  is_purchase_intent: boolean | null
}

interface ConvDetail {
  conversation: {
    id: string
    contact_name: string
    contact_phone: string
    seller_name: string
    stage: string
    status: string
    outcome: string | null
    quality_score: number | null
    temperature: string | null
    urgency_score: number | null
    created_at: string
    last_message_at: string | null
  }
  messages: Message[]
  stats: {
    total_messages: number
    classified: number
    purchase_intents: number
    avg_sentiment: number
  }
}

interface PageFilterProps {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGES = ['all', 'novo', 'lead', 'qualificacao', 'proposta', 'fechamento', 'pos_venda']
const STAGE_LABELS: Record<string, string> = {
  all: 'Todos', novo: 'Novo', lead: 'Lead', qualificacao: 'Qualificação',
  proposta: 'Proposta', fechamento: 'Fechamento', pos_venda: 'Pós-Venda',
}
const STAGE_COLORS: Record<string, string> = {
  novo: 'bg-gray-500/20 text-gray-400',
  lead: 'bg-blue-500/20 text-blue-400',
  qualificacao: 'bg-yellow-500/20 text-yellow-400',
  proposta: 'bg-orange-500/20 text-orange-400',
  fechamento: 'bg-purple-500/20 text-purple-400',
  pos_venda: 'bg-emerald-500/20 text-emerald-400',
}
const TEMP_COLORS: Record<string, string> = {
  hot: 'text-red-400', warm: 'text-yellow-400', cold: 'text-blue-400',
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 60) return `${mins}min`
  if (hours < 24) return `${hours}h`
  return `${days}d`
}

function SentimentIcon({ s }: { s: string | null }) {
  if (s === 'positive') return <ThumbsUp size={11} className="text-emerald-400" />
  if (s === 'negative') return <ThumbsDown size={11} className="text-red-400" />
  return <Minus size={11} className="text-gray-500" />
}

// ─── Painel de Detalhe ────────────────────────────────────────────────────────

function DetailPanel({ convId, onClose }: { convId: string; onClose: () => void }) {
  const [data, setData] = useState<ConvDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    requestJson<ConvDetail>(`/conversations/${convId}`, { signal: controller.signal })
      .then(d => { setData(d); setLoading(false) })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err.message || 'Erro ao carregar conversa')
        setLoading(false)
      })

    return () => controller.abort()
  }, [convId])

  return (
    <div className="fixed inset-y-0 right-0 w-[440px] bg-dark-800 border-l border-dark-600 flex flex-col z-50 shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-dark-600 flex items-center justify-between shrink-0">
        <div>
          <p className="font-semibold text-white">{data?.conversation.contact_name || '...'}</p>
          <p className="text-xs text-gray-500">{data?.conversation.contact_phone}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-dark-700 rounded-lg text-gray-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm animate-pulse">
          Carregando conversa...
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          {error}
        </div>
      ) : !data ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Conversa não encontrada
        </div>
      ) : (
        <>
          {/* Métricas */}
          <div className="p-3 border-b border-dark-600 grid grid-cols-4 gap-2 shrink-0">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{data.stats.total_messages}</p>
              <p className="text-[10px] text-gray-500">Msgs</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-accent-success">{data.stats.purchase_intents}</p>
              <p className="text-[10px] text-gray-500">Intenções</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${data.conversation.quality_score && data.conversation.quality_score >= 70 ? 'text-accent-success' : 'text-accent-warning'}`}>
                {data.conversation.quality_score ?? '—'}
              </p>
              <p className="text-[10px] text-gray-500">Score</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${TEMP_COLORS[data.conversation.temperature || ''] || 'text-gray-400'}`}>
                {data.conversation.temperature ? data.conversation.temperature.charAt(0).toUpperCase() + data.conversation.temperature.slice(1) : '—'}
              </p>
              <p className="text-[10px] text-gray-500">Temp</p>
            </div>
          </div>

          {/* Stage + vendedor */}
          <div className="px-3 py-2 border-b border-dark-600 flex items-center gap-3 text-xs text-gray-400 shrink-0">
            <span className={`px-2 py-0.5 rounded-full ${STAGE_COLORS[data.conversation.stage] || STAGE_COLORS.novo}`}>
              {STAGE_LABELS[data.conversation.stage] || data.conversation.stage}
            </span>
            <span className="flex items-center gap-1"><User size={11} />{data.conversation.seller_name}</span>
            {data.conversation.outcome && (
              <span className={`px-2 py-0.5 rounded-full ${data.conversation.outcome === 'ganho' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {data.conversation.outcome}
              </span>
            )}
          </div>

          {/* Timeline de mensagens */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {data.messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'assistant'
                    ? 'bg-accent-primary/20 text-white border border-accent-primary/20'
                    : 'bg-dark-700 text-gray-200'
                }`}>
                  <p className="leading-snug">{msg.text}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.sentiment && <SentimentIcon s={msg.sentiment} />}
                    {msg.is_purchase_intent && (
                      <ShoppingCart size={11} className="text-accent-success" title="Intenção de compra" />
                    )}
                    {msg.media_type && msg.media_type !== 'text' && (
                      <span className="text-[10px] text-gray-600">[{msg.media_type}]</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function ConversasPage({ selectedProduct, periodMode, selectedDate, selectedMonth }: PageFilterProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stage, setStage] = useState('all')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [data, setData] = useState<ConvListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 30

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  // Reset paginação ao trocar filtros
  useEffect(() => { setPage(0) }, [stage, selectedProduct, periodMode, selectedDate, selectedMonth])

  const buildUrl = useCallback(() => {
    const p = new URLSearchParams()
    p.append('limit', String(PAGE_SIZE))
    p.append('offset', String(page * PAGE_SIZE))
    if (selectedProduct !== 'all') p.append('sellerId', selectedProduct)
    p.append('periodMode', periodMode)
    if (periodMode === 'day') p.append('date', selectedDate)
    else p.append('month', selectedMonth)
    if (debouncedSearch.trim()) p.append('search', debouncedSearch.trim())
    if (stage !== 'all') p.append('stage', stage)
    return `/conversations?${p.toString()}`
  }, [page, selectedProduct, periodMode, selectedDate, selectedMonth, debouncedSearch, stage])

  const loadConversations = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    requestJson<ConvListData>(buildUrl(), { signal: controller.signal })
      .then(d => { setData(d); setLoading(false) })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err.message || 'Erro ao carregar conversas')
        setData(null)
        setLoading(false)
      })

    return () => controller.abort()
  }, [buildUrl])

  useEffect(() => {
    const cleanup = loadConversations()
    return cleanup
  }, [loadConversations])

  useEffect(() => {
    if (!selectedId) return
    if (!data?.value.some(c => c.id === selectedId)) {
      setSelectedId(null)
    }
  }, [selectedId, data])

  const conversations = data?.value || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <header className="mb-4">
        <h2 className="text-2xl font-bold text-white">Conversas</h2>
        <p className="text-sm text-gray-500">
          {loading ? 'Carregando...' : error ? 'Falha ao carregar dados' : `${total} conversa${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`}
        </p>
      </header>

      {/* Barra de busca + filtros */}
      <div className="flex flex-col gap-3 mb-4">
        {/* Busca */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou vendedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-primary/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtros de estágio */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter size={13} className="text-gray-500 mr-0.5" />
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                stage === s
                  ? 'bg-accent-primary text-white'
                  : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
              }`}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="glass rounded-xl glow-box overflow-hidden mb-4">
        {loading ? (
          <div className="p-12 text-center text-gray-500 text-sm animate-pulse">Carregando conversas...</div>
        ) : error ? (
          <div className="p-12 text-center text-gray-500 text-sm space-y-3">
            <p className="text-accent-danger">Erro ao carregar conversas: {error}</p>
            <button
              onClick={loadConversations}
              className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-xs hover:opacity-90"
            >
              Tentar novamente
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            Nenhuma conversa encontrada.
          </div>
        ) : (
          <div className="divide-y divide-dark-700">
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id === selectedId ? null : conv.id)}
                className={`p-4 hover:bg-dark-700/30 transition-colors cursor-pointer ${selectedId === conv.id ? 'bg-accent-primary/5 border-l-2 border-accent-primary' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {conv.contact_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-white text-sm">{conv.contact_name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${STAGE_COLORS[conv.stage] || STAGE_COLORS.novo}`}>
                        {STAGE_LABELS[conv.stage] || conv.stage}
                      </span>
                      {conv.temperature && (
                        <span className={`text-[10px] font-medium ${TEMP_COLORS[conv.temperature]}`}>
                          {conv.temperature === 'hot' ? '🔥' : conv.temperature === 'warm' ? '🌡️' : '❄️'}
                        </span>
                      )}
                      {conv.quality_score != null && (
                        <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                          <Star size={9} />{conv.quality_score}
                        </span>
                      )}
                      {conv.urgency_score != null && conv.urgency_score >= 70 && (
                        <Zap size={11} className="text-accent-danger" title={`Urgência: ${conv.urgency_score}`} />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mb-1">{conv.last_message}</p>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                      <span className="flex items-center gap-0.5"><User size={10} />{conv.seller_name}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle size={10} />{conv.message_count}</span>
                      <span className="flex items-center gap-0.5"><Clock size={10} />{relativeTime(conv.last_message_at)}</span>
                      {conv.outcome && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${conv.outcome === 'ganho' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                          {conv.outcome}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Botão */}
                  <div className="flex gap-1.5 shrink-0">
                    {conv.contact_phone && (
                      <button
                        disabled
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 bg-accent-success/15 rounded-lg text-accent-success opacity-50 cursor-not-allowed"
                        title="Ação disponível em próxima fase"
                      >
                        <Phone size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 text-xs">
            Página {page + 1} de {totalPages} • {total} total
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg bg-dark-700 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs transition-colors ${
                    page === pageNum ? 'bg-accent-primary text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {pageNum + 1}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg bg-dark-700 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Painel de Detalhe (slide-in) */}
      {selectedId && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelectedId(null)}
          />
          <DetailPanel convId={selectedId} onClose={() => setSelectedId(null)} />
        </>
      )}
    </>
  )
}
