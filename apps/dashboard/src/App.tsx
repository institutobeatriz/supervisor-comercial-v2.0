import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Activity, Funnel, Users, MessageCircle, RefreshCcw, AlertTriangle, Bell, BarChart3, TrendingDown, Calendar, Package, FileDown } from 'lucide-react'
// KPIs e FunnelData são gerenciados dentro dos subcomponentes

import { requestJson } from './services/http'
import { PRODUCTS } from './config/products'

// Carrega páginas sob demanda por aba para reduzir chunk inicial
const ExecutivoPage = lazy(() => import('./pages/Executivo'))
const PerformancePage = lazy(() => import('./pages/Performance'))
const ProdutosPage = lazy(() => import('./pages/Produtos'))
const LossAnalysisPage = lazy(() => import('./pages/LossAnalysis'))
const ConversasPage = lazy(() => import('./pages/Conversas'))
const FollowUpPage = lazy(() => import('./pages/FollowUp'))
const ReviewsPage = lazy(() => import('./pages/Reviews'))
const MetricsIAPage = lazy(() => import('./pages/MetricsIA'))
const AlertasPage = lazy(() => import('./pages/Alertas'))
const FunilPage = lazy(() => import('./pages/Funil'))
const RelatoriosPage = lazy(() => import('./pages/Relatorios'))

// Tipo para itens da sidebar com badge opcional
interface TabItem {
  id: string
  icon: React.ElementType
  label: string
  badge?: number
}

export default function App() {
  const [activeTab, setActiveTab] = useState('executivo')
  const [selectedProduct, setSelectedProduct] = useState('all')
  const [periodMode, setPeriodMode] = useState<'day' | 'month'>('month')
  const [selectedDate, setSelectedDate] = useState(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  )
  const [selectedMonth, setSelectedMonth] = useState(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
  )
  const [alertCount, setAlertCount] = useState(0)

  const product = PRODUCTS[selectedProduct] || PRODUCTS['all']

  // Contagem de alertas urgentes — atualiza a cada minuto
  useEffect(() => {
    let active = true

    const fetchAlerts = () => {
      const params = new URLSearchParams()
      if (selectedProduct !== 'all') params.append('sellerId', selectedProduct)
      const query = params.toString()

      requestJson<{ urgentes?: number }>(`/alerts${query ? `?${query}` : ''}`)
        .then(d => {
          if (active) setAlertCount(d?.urgentes || 0)
        })
        .catch(() => {
          if (active) setAlertCount(0)
        })
    }

    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [selectedProduct])

  // Tema dinâmico: injeta CSS variable com a cor do produto selecionado
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--color-accent-primary', product.colorHex)
    // Gera variante com opacidade para hover/glow
    root.style.setProperty('--color-accent-primary-raw', product.colorHex)
  }, [product.colorHex])

  const tabs: TabItem[] = [
    { id: 'executivo', icon: BarChart3, label: 'Visão Executiva' },
    { id: 'funil', icon: Funnel, label: 'Funil Comercial' },
    { id: 'vendedores', icon: Users, label: 'Performance' },
    { id: 'produtos', icon: Package, label: 'Produtos' },
    { id: 'perdas', icon: TrendingDown, label: 'Análise de Perdas' },
    { id: 'conversas', icon: MessageCircle, label: 'Conversas' },
    { id: 'followup', icon: RefreshCcw, label: 'Follow-up' },
    { id: 'reviews', icon: AlertTriangle, label: 'Revisões' },
    { id: 'metrics', icon: Activity, label: 'Métricas IA' },
    { id: 'alertas', icon: Bell, label: 'Alertas', badge: alertCount > 0 ? alertCount : undefined },
    { id: 'relatorios', icon: FileDown, label: 'Relatórios' },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'executivo':
        return (
          <ExecutivoPage
            selectedProduct={selectedProduct}
            periodMode={periodMode}
            selectedDate={selectedDate}
            selectedMonth={selectedMonth}
            productName={product.name}
            productEmoji={product.emoji}
            productColor={product.color}
          />
        )

      case 'funil':
        return (
          <FunilPage
            selectedProduct={selectedProduct}
            periodMode={periodMode}
            selectedDate={selectedDate}
            selectedMonth={selectedMonth}
          />
        )

      case 'vendedores': return (
        <PerformancePage
          selectedProduct={selectedProduct}
          periodMode={periodMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
        />
      )
      case 'produtos': return (
        <ProdutosPage
          selectedProduct={selectedProduct}
          periodMode={periodMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
        />
      )
      case 'perdas': return (
        <LossAnalysisPage
          selectedProduct={selectedProduct}
          periodMode={periodMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
        />
      )
      case 'conversas': return (
        <ConversasPage
          selectedProduct={selectedProduct}
          periodMode={periodMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
        />
      )
      case 'followup': return (
        <FollowUpPage
          selectedProduct={selectedProduct}
          periodMode={periodMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
        />
      )
      case 'reviews': return (
        <ReviewsPage
          selectedProduct={selectedProduct}
          periodMode={periodMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
        />
      )
      case 'metrics': return (
        <MetricsIAPage
          selectedProduct={selectedProduct}
          periodMode={periodMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
        />
      )
      case 'alertas': return <AlertasPage />
      case 'relatorios': return <RelatoriosPage />
      default: return null
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 glass border-r border-dark-600 p-4 flex flex-col fixed h-full">
        <div className="mb-6">
          <h1 className="text-xl font-bold gradient-text">Supervisor</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-sm">{product.emoji}</span>
            <p className="text-xs font-medium" style={{ color: product.colorHex }}>{product.name}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                activeTab === item.id
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                  : 'text-gray-400 hover:bg-dark-700 hover:text-white'
              }`}
            >
              <item.icon size={16} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="bg-accent-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-dark-600 space-y-3">
          {/* Período */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Período</p>
            <div className="flex gap-1">
              <button
                onClick={() => setPeriodMode('day')}
                className={`flex-1 px-2 py-1 rounded text-xs ${periodMode === 'day' ? 'bg-accent-primary text-white' : 'bg-dark-700 text-gray-400'}`}
              >Dia</button>
              <button
                onClick={() => setPeriodMode('month')}
                className={`flex-1 px-2 py-1 rounded text-xs ${periodMode === 'month' ? 'bg-accent-primary text-white' : 'bg-dark-700 text-gray-400'}`}
              >Mês</button>
            </div>
          </div>

          {periodMode === 'day' ? (
            <div>
              <p className="text-xs text-gray-500 mb-1"><Calendar size={11} className="inline mr-1" />Data</p>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-2 py-1 bg-dark-700 border border-dark-600 rounded text-xs text-white" />
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 mb-1"><Calendar size={11} className="inline mr-1" />Mês</p>
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-2 py-1 bg-dark-700 border border-dark-600 rounded text-xs text-white" />
            </div>
          )}

          {/* Produto */}
          <div>
            <p className="text-xs text-gray-500 mb-1"><Package size={11} className="inline mr-1" />Produto</p>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full px-2 py-1 bg-dark-700 border border-dark-600 rounded text-xs text-white"
            >
              {Object.entries(PRODUCTS).map(([id, p]) => (
                <option key={id} value={id}>{p.emoji} {p.name}</option>
              ))}
            </select>
          </div>

          {/* Usuário */}
          <div className="flex items-center gap-2 pt-2 border-t border-dark-700">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${product.colorHex}, #6366f1)` }}
            >
              {product.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{product.name}</p>
              <p className="text-[10px] text-gray-500">Conectado</p>
            </div>
            <div className="w-1.5 h-1.5 bg-accent-success rounded-full animate-pulse flex-shrink-0" />
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6 ml-56 overflow-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            Carregando módulo...
          </div>
        }>
          {renderContent()}
        </Suspense>
      </main>
    </div>
  )
}
