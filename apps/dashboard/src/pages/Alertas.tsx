import { useState, useEffect, useRef, useCallback } from 'react'
import {
  AlertTriangle, AlertCircle, Info, Phone, RefreshCcw, Eye,
  Wifi, WifiOff, TrendingDown, Clock, Zap, Target,
} from 'lucide-react'
import { requestJson, resolveApiPath } from '../services/http'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface AlertItem {
  id: string
  tipo: 'urgente' | 'alerta' | 'info'
  titulo: string
  lead: string
  telefone?: string
  acao: string
  tempo?: string
  score?: number
  seller_name?: string
  conversation_id: string
  created_at: string
}

interface AlertsData {
  urgentes: number
  alertas_count: number
  infos: number
  alertas: AlertItem[]
}

// ─── Hook SSE ─────────────────────────────────────────────────────────────────
// Conecta ao endpoint /api/alerts/stream e mantém os dados ao vivo

function useAlertStream() {
  const [data, setData] = useState<AlertsData | null>(null)
  const [connected, setConnected] = useState(false)
  const [newAlerts, setNewAlerts] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const prevUrgentCount = useRef(0)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(2000)

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()

    const es = new EventSource(resolveApiPath('/alerts/stream'))
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      setStreamError(null)
      reconnectDelay.current = 2000
    }

    es.onmessage = (e) => {
      try {
        const d: AlertsData = JSON.parse(e.data)
        setData(prev => {
          const prevUrgent = prev?.urgentes ?? 0
          if (d.urgentes > prevUrgent) {
            setNewAlerts(n => n + (d.urgentes - prevUrgent))
          }
          prevUrgentCount.current = d.urgentes
          return d
        })
        setLastUpdate(new Date())
        setConnected(true)
      } catch {
        // mensagem de keepalive ou parse error — ignorar
      }
    }

    es.onerror = () => {
      setConnected(false)
      setStreamError('Falha na conexao de alertas em tempo real')
      es.close()
      esRef.current = null
      // reconectar com backoff exponencial (máx 30s)
      reconnectTimerRef.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000)
        connect()
      }, reconnectDelay.current)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [connect])

  // Fallback: se o SSE não conectar em 5s, tenta REST
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (!data) {
        requestJson<AlertsData>('/alerts')
          .then(d => {
            setData(d)
            setLastUpdate(new Date())
            setStreamError(null)
          })
          .catch(() => {
            setStreamError('Nao foi possivel carregar alertas via fallback')
          })
      }
    }, 5000)
    return () => clearTimeout(fallbackTimer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const clearNew = () => setNewAlerts(0)
  const forceRefresh = () => {
    setNewAlerts(0)
    connect()
  }

  return { data, connected, newAlerts, lastUpdate, streamError, clearNew, forceRefresh }
}

// ─── Ícone por categoria de alerta ───────────────────────────────────────────

function alertIcon(id: string, tipo: AlertItem['tipo']) {
  if (id.startsWith('stagnant')) return <Clock size={14} className="text-accent-warning shrink-0 mt-0.5" />
  if (id.startsWith('behind-pace')) return <Target size={14} className="text-accent-danger shrink-0 mt-0.5" />
  if (id.startsWith('conv-drop')) return <TrendingDown size={14} className="text-amber-400 shrink-0 mt-0.5" />
  if (id.startsWith('urgent') || id.startsWith('hot')) return <Zap size={14} className="text-accent-danger shrink-0 mt-0.5" />
  if (tipo === 'urgente') return <AlertTriangle size={14} className="text-accent-danger shrink-0 mt-0.5" />
  if (tipo === 'alerta') return <AlertCircle size={14} className="text-accent-warning shrink-0 mt-0.5" />
  return <Info size={14} className="text-accent-primary shrink-0 mt-0.5" />
}

// ─── Card de alerta ──────────────────────────────────────────────────────────

function AlertCard({
  alerta,
  onDismiss,
  border,
}: {
  alerta: AlertItem
  onDismiss: (id: string) => void
  border: string
}) {
  return (
    <div className={`p-3 rounded-xl border ${border} flex items-start gap-3`}>
      {alertIcon(alerta.id, alerta.tipo)}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium leading-tight">{alerta.titulo}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400 truncate">{alerta.lead}</span>
          {alerta.telefone && (
            <span className="text-xs text-gray-600">{alerta.telefone}</span>
          )}
          {alerta.tempo && (
            <span className={`text-xs font-medium ${alerta.tipo === 'urgente' ? 'text-accent-danger' : 'text-accent-warning'}`}>
              {alerta.tempo}
            </span>
          )}
        </div>
      </div>
      {alerta.score != null && (
        <div className="text-center shrink-0">
          <p className="text-base font-bold text-white">{alerta.score}</p>
          <p className="text-[9px] text-gray-500">Score</p>
        </div>
      )}
      <div className="flex gap-1.5 shrink-0">
        {alerta.conversation_id && (
          <button
            disabled
            className="p-1.5 bg-dark-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Ação disponível em próxima fase"
          >
            <Eye size={13} />
          </button>
        )}
        {alerta.telefone && (
          <button
            disabled
            className="p-1.5 bg-dark-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Ação disponível em próxima fase"
          >
            <Phone size={13} />
          </button>
        )}
        <button
          onClick={() => onDismiss(alerta.id)}
          className="p-1.5 bg-dark-700 rounded-lg text-gray-500 hover:text-white text-xs transition-colors"
          title="Dispensar"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AlertasPage() {
  const { data, connected, newAlerts, lastUpdate, streamError, clearNew, forceRefresh } = useAlertStream()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]))

  // Limpa badge de "novos" ao abrir a aba
  useEffect(() => { clearNew() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !data
  const allAlerts = (data?.alertas || []).filter(a => !dismissed.has(a.id))
  const urgentes = allAlerts.filter(a => a.tipo === 'urgente')
  const alertas = allAlerts.filter(a => a.tipo === 'alerta')
  const infos = allAlerts.filter(a => a.tipo === 'info')
  const totalDismissed = dismissed.size

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white">Alertas</h2>
            {newAlerts > 0 && (
              <span className="px-2 py-0.5 bg-accent-danger text-white text-xs font-bold rounded-full animate-pulse">
                +{newAlerts} novo{newAlerts > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Indicador de conexão SSE */}
            {connected ? (
              <span className="flex items-center gap-1 text-xs text-accent-success">
                <Wifi size={11} />
                <span>Ao vivo</span>
                <span className="w-1.5 h-1.5 bg-accent-success rounded-full animate-pulse inline-block ml-0.5" />
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <WifiOff size={11} />
                <span>Reconectando...</span>
              </span>
            )}
            {lastUpdate && (
              <span className="text-xs text-gray-600">
                • {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            {totalDismissed > 0 && (
              <span className="text-xs text-gray-600">• {totalDismissed} dispensado{totalDismissed > 1 ? 's' : ''}</span>
            )}
            {streamError && (
              <span className="text-xs text-accent-danger">• {streamError}</span>
            )}
          </div>
        </div>
        <button
          onClick={forceRefresh}
          className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-dark-600 transition-colors"
        >
          <RefreshCcw size={14} className={connected ? '' : 'animate-spin'} />
          {connected ? 'Atualizar' : 'Reconectar'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-xl p-4 glow-box border border-accent-danger/30">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-accent-danger/20">
              <AlertTriangle size={24} className="text-accent-danger" />
            </div>
            <div>
              <p className="text-3xl font-bold text-accent-danger">{urgentes.length}</p>
              <p className="text-sm text-gray-400">Urgentes</p>
            </div>
            {urgentes.length > 0 && (
              <div className="ml-auto w-2 h-2 bg-accent-danger rounded-full animate-ping" />
            )}
          </div>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-warning/30">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-accent-warning/20">
              <AlertCircle size={24} className="text-accent-warning" />
            </div>
            <div>
              <p className="text-3xl font-bold text-accent-warning">{alertas.length}</p>
              <p className="text-sm text-gray-400">Atenção</p>
            </div>
          </div>
        </div>
        <div className="glass rounded-xl p-4 glow-box border border-accent-primary/30">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-accent-primary/20">
              <Info size={24} className="text-accent-primary" />
            </div>
            <div>
              <p className="text-3xl font-bold text-accent-primary">{infos.length}</p>
              <p className="text-sm text-gray-400">Informativos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40 glass rounded-xl">
          <div className="text-gray-400 animate-pulse text-sm flex items-center gap-2">
            <Wifi size={16} /> Conectando ao feed de alertas...
          </div>
        </div>
      )}

      {/* Sem alertas */}
      {!loading && allAlerts.length === 0 && (
        <div className="glass rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-accent-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-accent-success" />
          </div>
          <p className="text-white font-medium mb-2">Tudo sob controle!</p>
          <p className="text-gray-500 text-sm">Nenhum alerta ativo no momento.</p>
          {connected && (
            <p className="text-gray-600 text-xs mt-2">Monitorando em tempo real via SSE</p>
          )}
        </div>
      )}

      {/* Urgentes */}
      {urgentes.length > 0 && (
        <div className="glass rounded-xl p-4 glow-box border border-accent-danger/30 mb-4">
          <h3 className="text-sm font-semibold text-accent-danger mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="animate-pulse" />
            Ação Imediata Necessária
            <span className="ml-auto text-xs bg-accent-danger/20 text-accent-danger px-2 py-0.5 rounded-full">
              {urgentes.length}
            </span>
          </h3>
          <div className="space-y-2">
            {urgentes.map(a => (
              <AlertCard
                key={a.id}
                alerta={a}
                onDismiss={dismiss}
                border="border-accent-danger/25 bg-accent-danger/8"
              />
            ))}
          </div>
        </div>
      )}

      {/* Alertas de atenção e informativos */}
      {(alertas.length > 0 || infos.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {/* Atenção */}
          <div className="glass rounded-xl p-4 glow-box">
            <h3 className="text-sm font-semibold text-accent-warning mb-3 flex items-center gap-2">
              <AlertCircle size={15} />
              Atenção
              {alertas.length > 0 && (
                <span className="ml-auto text-xs bg-accent-warning/20 text-accent-warning px-2 py-0.5 rounded-full">
                  {alertas.length}
                </span>
              )}
            </h3>
            {alertas.length === 0 ? (
              <p className="text-gray-600 text-sm py-2">Nenhum alerta de atenção</p>
            ) : (
              <div className="space-y-2">
                {alertas.map(a => (
                  <AlertCard
                    key={a.id}
                    alerta={a}
                    onDismiss={dismiss}
                    border="border-accent-warning/20 bg-accent-warning/5"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Informativos */}
          <div className="glass rounded-xl p-4 glow-box">
            <h3 className="text-sm font-semibold text-accent-primary mb-3 flex items-center gap-2">
              <Info size={15} />
              Informativos
              {infos.length > 0 && (
                <span className="ml-auto text-xs bg-accent-primary/20 text-accent-primary px-2 py-0.5 rounded-full">
                  {infos.length}
                </span>
              )}
            </h3>
            {infos.length === 0 ? (
              <p className="text-gray-600 text-sm py-2">Nenhum informativo</p>
            ) : (
              <div className="space-y-2">
                {infos.map(a => (
                  <AlertCard
                    key={a.id}
                    alerta={a}
                    onDismiss={dismiss}
                    border="border-accent-primary/20 bg-accent-primary/5"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
