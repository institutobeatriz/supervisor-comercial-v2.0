import { useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Clock, Eye, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useApi, apiPost } from '../hooks/useApi'

interface Review {
  id: string
  conversation_id: string
  type: string
  predicted_outcome: string
  confidence: number
  suggested_value_cents: number
  contact_name?: string
  seller_name?: string
  created_at: string
  status: 'pending' | 'approved' | 'rejected'
  rule_triggered?: string
  rule_reason?: string
  notes?: string
}

interface ReviewStats {
  pending: number
  approved: number
  rejected: number
  total: number
}

interface PageFilterProps {
  selectedProduct: string
  periodMode: 'day' | 'month'
  selectedDate: string
  selectedMonth: string
}

export default function ReviewsPage({ selectedProduct }: PageFilterProps) {
  const STORAGE_KEY = 'reviews_admin_key'
  const getSavedKey = () => (typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) || '' : '')

  const [adminKeyInput, setAdminKeyInput] = useState(getSavedKey)
  const [adminKey, setAdminKey] = useState(getSavedKey)

  const sellerQ = selectedProduct !== 'all' ? `?sellerId=${selectedProduct}` : ''
  const authHeaders = adminKey ? { 'x-admin-key': adminKey } : undefined
  const { data: reviewsData, loading, error } = useApi<{ value: Review[] }>(
    `/reviews${sellerQ}`,
    authHeaders
  )
  const { data: statsData } = useApi<ReviewStats>(
    '/reviews/stats',
    authHeaders
  )

  const [processing, setProcessing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [localReviews, setLocalReviews] = useState<Review[] | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null)

  const reviews = localReviews ?? reviewsData?.value ?? []
  const stats = statsData || { pending: 0, approved: 0, rejected: 0, total: 0 }

  const pending = reviews.filter(r => r.status === 'pending')
  const resolved = reviews.filter(r => r.status !== 'pending')

  async function handleApprove(review: Review) {
    setProcessing(review.id)
    try {
      await apiPost(
        `/reviews/${review.id}/approve`,
        { finalOutcome: 'approved', notes: '' },
        { 'x-admin-key': adminKey, 'x-reviewer-name': 'Supervisor' }
      )
      setLocalReviews(prev =>
        (prev ?? reviews).map(r => r.id === review.id ? { ...r, status: 'approved' as const } : r)
      )
      setFeedbackMsg({ id: review.id, msg: 'Aprovada com sucesso', ok: true })
    } catch (e) {
      setFeedbackMsg({ id: review.id, msg: 'Erro ao aprovar', ok: false })
    } finally {
      setProcessing(null)
      setTimeout(() => setFeedbackMsg(null), 3000)
    }
  }

  async function handleReject(review: Review) {
    setProcessing(review.id)
    try {
      await apiPost(
        `/reviews/${review.id}/reject`,
        { notes: 'Rejeitado pelo supervisor' },
        { 'x-admin-key': adminKey, 'x-reviewer-name': 'Supervisor' }
      )
      setLocalReviews(prev =>
        (prev ?? reviews).map(r => r.id === review.id ? { ...r, status: 'rejected' as const } : r)
      )
      setFeedbackMsg({ id: review.id, msg: 'Rejeitada com sucesso', ok: true })
    } catch (e) {
      setFeedbackMsg({ id: review.id, msg: 'Erro ao rejeitar', ok: false })
    } finally {
      setProcessing(null)
      setTimeout(() => setFeedbackMsg(null), 3000)
    }
  }

  function applyAdminKey() {
    const normalized = adminKeyInput.trim()
    if (!normalized) return
    setAdminKey(normalized)
    if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_KEY, normalized)
  }

  function clearAdminKey() {
    setAdminKey('')
    setAdminKeyInput('')
    setLocalReviews(null)
    if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_KEY)
  }

  if (!adminKey) return (
    <div className="glass rounded-xl p-6 border border-dark-600 max-w-lg">
      <h3 className="text-lg font-semibold text-white mb-2">Acesso de Revisões</h3>
      <p className="text-sm text-gray-400 mb-4">
        Informe a chave administrativa para carregar as revisões pendentes.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          className="flex-1 px-3 py-2 rounded-lg bg-dark-800 border border-dark-600 text-sm text-white outline-none focus:border-accent-primary"
          value={adminKeyInput}
          onChange={(e) => setAdminKeyInput(e.target.value)}
          placeholder="ADMIN_API_KEY"
        />
        <button
          onClick={applyAdminKey}
          className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm hover:opacity-90"
        >
          Entrar
        </button>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 animate-pulse">Carregando revisões...</div>
    </div>
  )

  if (error) return (
    <div className="glass rounded-xl p-6 border border-accent-danger/30">
      <p className="text-accent-danger text-sm">Erro ao carregar revisões: {error}</p>
      <p className="text-gray-500 text-xs mt-1">Verifique se a API está rodando e o ADMIN_KEY está correto.</p>
    </div>
  )

  return (
    <>
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-white">Revisões Pendentes</h2>
            <p className="text-sm text-gray-500">Validação humana de vendas detectadas pela IA</p>
          </div>
          <button
            onClick={clearAdminKey}
            className="px-3 py-1.5 rounded-lg border border-dark-600 text-xs text-gray-300 hover:bg-dark-700"
          >
            Trocar chave
          </button>
        </div>
        {error && (
          <p className="text-accent-danger text-xs mt-2">
            Falha de autenticação ou API indisponível: {error}
          </p>
        )}
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="glass rounded-xl p-4 glow-box border border-accent-warning/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-accent-warning" />
            <span className="text-xs text-gray-500">Pendentes</span>
          </div>
          <p className="text-2xl font-bold text-accent-warning">{stats.pending || pending.length}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-success/30">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-accent-success" />
            <span className="text-xs text-gray-500">Aprovadas</span>
          </div>
          <p className="text-2xl font-bold text-accent-success">{stats.approved}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-danger/30">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={16} className="text-accent-danger" />
            <span className="text-xs text-gray-500">Rejeitadas</span>
          </div>
          <p className="text-2xl font-bold text-accent-danger">{stats.rejected}</p>
        </div>
        <div className="glass rounded-xl p-4 glow-box">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCcw size={16} className="text-gray-400" />
            <span className="text-xs text-gray-500">Total</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
      </div>

      {/* Pendentes */}
      <div className="glass rounded-xl p-4 glow-box mb-4">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-accent-warning" />
          Aguardando Revisão ({pending.length})
        </h3>

        {pending.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 bg-accent-success/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={24} className="text-accent-success" />
            </div>
            <p className="text-gray-400 text-sm">Nenhuma revisão pendente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((review) => (
              <div key={review.id} className="p-4 bg-dark-700/50 rounded-xl border border-dark-600">
                {/* Feedback inline */}
                {feedbackMsg?.id === review.id && (
                  <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${feedbackMsg.ok ? 'bg-accent-success/20 text-accent-success' : 'bg-accent-danger/20 text-accent-danger'}`}>
                    {feedbackMsg.msg}
                  </div>
                )}

                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      review.predicted_outcome === 'won' ? 'bg-accent-success/20 text-accent-success' :
                      review.predicted_outcome === 'lost' ? 'bg-accent-danger/20 text-accent-danger' :
                      'bg-accent-primary/20 text-accent-primary'
                    }`}>
                      {review.predicted_outcome === 'won' ? '✓' : review.predicted_outcome === 'lost' ? '✗' : '?'}
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{review.contact_name || 'Contato'}</p>
                      <p className="text-xs text-gray-500">{review.seller_name || 'Vendedor'} • {review.type}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-white font-medium">
                      {review.suggested_value_cents > 0
                        ? `R$ ${(review.suggested_value_cents / 100).toLocaleString('pt-BR')}`
                        : '—'}
                    </p>
                    <p className="text-xs text-gray-500">Confiança: {review.confidence}%</p>
                  </div>
                </div>

                {/* Regra que disparou */}
                {review.rule_reason && (
                  <div className="mb-3 px-3 py-2 bg-dark-800/50 rounded-lg border border-dark-600">
                    <p className="text-[11px] text-gray-500 mb-0.5">Motivo da revisão</p>
                    <p className="text-xs text-accent-warning">{review.rule_reason}</p>
                  </div>
                )}

                {/* Detalhes expansíveis */}
                <button
                  onClick={() => setExpanded(expanded === review.id ? null : review.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mb-3"
                >
                  <Eye size={12} />
                  {expanded === review.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                  {expanded === review.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {expanded === review.id && (
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-dark-800/50 rounded">
                      <p className="text-gray-500">ID</p>
                      <p className="text-gray-300 font-mono truncate">{review.id}</p>
                    </div>
                    <div className="p-2 bg-dark-800/50 rounded">
                      <p className="text-gray-500">Conversa</p>
                      <p className="text-gray-300 font-mono truncate">{review.conversation_id}</p>
                    </div>
                    <div className="p-2 bg-dark-800/50 rounded">
                      <p className="text-gray-500">Resultado previsto</p>
                      <p className="text-gray-300 capitalize">{review.predicted_outcome}</p>
                    </div>
                    <div className="p-2 bg-dark-800/50 rounded">
                      <p className="text-gray-500">Criado em</p>
                      <p className="text-gray-300">{new Date(review.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(review)}
                    disabled={processing === review.id}
                    className="flex-1 px-3 py-2 bg-accent-success/20 rounded-lg text-sm text-accent-success hover:bg-accent-success/30 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle size={14} />
                    {processing === review.id ? 'Processando...' : 'Aprovar'}
                  </button>
                  <button
                    onClick={() => handleReject(review)}
                    disabled={processing === review.id}
                    className="flex-1 px-3 py-2 bg-accent-danger/20 rounded-lg text-sm text-accent-danger hover:bg-accent-danger/30 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle size={14} />
                    {processing === review.id ? 'Processando...' : 'Rejeitar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolvidas recentes */}
      {resolved.length > 0 && (
        <div className="glass rounded-xl p-4 glow-box">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Resolvidas nesta sessão ({resolved.length})</h3>
          <div className="space-y-2">
            {resolved.map(review => (
              <div key={review.id} className="flex items-center gap-3 text-xs p-2 bg-dark-800/30 rounded-lg">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${review.status === 'approved' ? 'bg-accent-success' : 'bg-accent-danger'}`} />
                <span className="text-gray-300 flex-1">{review.contact_name || 'Contato'}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${review.status === 'approved' ? 'bg-accent-success/20 text-accent-success' : 'bg-accent-danger/20 text-accent-danger'}`}>
                  {review.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
