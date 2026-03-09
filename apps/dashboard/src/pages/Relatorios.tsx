import { useState } from 'react'
import {
  FileText, Download, Table, TrendingUp,
  CheckCircle, Loader, AlertCircle,
} from 'lucide-react'
import { PRODUCTS } from '../config/products'
import { requestJson } from '../services/http'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(cents: number) {
  return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })
}

function fmtDate() {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMonth() {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function productName(sellerId: string) {
  return PRODUCTS[sellerId]?.name || 'Produto'
}

function productEmoji(sellerId: string) {
  return PRODUCTS[sellerId]?.emoji || '📦'
}

async function fetchJSON(endpoint: string) {
  return requestJson<any>(endpoint)
}

async function loadPdfLibs() {
  const [pdfMod, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const jsPDF = (pdfMod as any).jsPDF || (pdfMod as any).default
  const autoTable = (autoTableMod as any).default || (autoTableMod as any).autoTable
  if (!jsPDF || !autoTable) {
    throw new Error('Falha ao carregar bibliotecas de PDF')
  }
  return { jsPDF, autoTable }
}

async function loadExcelLib() {
  const mod = await import('exceljs')
  const Workbook = (mod as any).Workbook || (mod as any).default?.Workbook
  if (!Workbook) {
    throw new Error('Falha ao carregar biblioteca de Excel')
  }
  return { Workbook }
}

function triggerExcelDownload(rawData: ArrayBuffer | Uint8Array, filename: string) {
  const bytes = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)
  const blob = new Blob(
    [bytes],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type MergeCell = {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

function appendWorksheet(
  workbook: any,
  sheetName: string,
  rows: any[][],
  columnWidths: number[],
  merges: MergeCell[] = [],
) {
  const worksheet = workbook.addWorksheet(sheetName)
  rows.forEach((row) => {
    worksheet.addRow(
      row.map((cell) => {
        if (cell === null || cell === undefined) return ''
        if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return cell
        return String(cell)
      }),
    )
  })

  worksheet.columns = columnWidths.map(width => ({ width }))
  merges.forEach((merge) => {
    worksheet.mergeCells(merge.startRow, merge.startCol, merge.endRow, merge.endCol)
  })
}

// ─── 6.1 Relatório PDF semanal por produto ────────────────────────────────────

async function exportProdutosPDF() {
  const { jsPDF, autoTable } = await loadPdfLibs()
  const comparison = await fetchJSON('/dashboard/products/comparison')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // ── Cabeçalho
  doc.setFillColor(30, 30, 60)
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Supervisor Comercial', 14, 12)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Relatório por Produto — ' + fmtMonth(), 14, 20)
  doc.setFontSize(9)
  doc.text('Gerado em ' + fmtDate(), pageW - 14, 20, { align: 'right' })

  let y = 36

  // ── KPIs globais
  doc.setTextColor(40, 40, 40)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumo Consolidado', 14, y)
  y += 4

  const totals = comparison.totals
  autoTable(doc, {
    startY: y,
    head: [['Total Leads', 'Total Conversões', 'Faturamento Total', 'Meta Consolidada']],
    body: [[
      totals.total_leads.toLocaleString('pt-BR'),
      totals.total_conversions.toLocaleString('pt-BR'),
      fmtBRL(totals.total_revenue_cents),
      fmtBRL(totals.total_goal_cents),
    ]],
    styles: { fontSize: 10, halign: 'center' },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 255] },
    margin: { left: 14, right: 14 },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // ── Tabela por produto
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Performance por Produto', 14, y)
  y += 4

  const prodRows = comparison.products.map((p: any) => [
    `${productEmoji(p.seller_id)} ${productName(p.seller_id)}`,
    p.leads.toLocaleString('pt-BR'),
    p.conversions.toLocaleString('pt-BR'),
    `${p.conversion_rate}%`,
    fmtBRL(p.revenue_cents),
    fmtBRL(p.ticket_medio_cents),
    `${p.goal_progress_pct}%`,
    `${p.price_sensitivity_pct}%`,
  ])

  autoTable(doc, {
    startY: y,
    head: [['Produto', 'Leads', 'Vendas', 'Conversão', 'Faturamento', 'Ticket Médio', 'Meta', 'Sens. Preço']],
    body: prodRows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 30, 60], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 255] },
    columnStyles: { 0: { fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // ── Objeções por produto
  if (y > 240) { doc.addPage(); y = 20 }

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Top Objeções por Produto', 14, y)
  y += 4

  const objRows: any[] = []
  comparison.products.forEach((p: any) => {
    if (p.top_objections.length === 0) return
    p.top_objections.forEach((obj: any, i: number) => {
      objRows.push([
        i === 0 ? `${productEmoji(p.seller_id)} ${productName(p.seller_id)}` : '',
        `${i + 1}º`,
        obj.objection,
        obj.count,
      ])
    })
  })

  if (objRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Produto', 'Pos.', 'Objeção', 'Ocorrências']],
      body: objRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 248, 248] },
      margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Rodapé
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`Página ${i} de ${pageCount} — Supervisor Comercial — ${fmtDate()}`, pageW / 2, 292, { align: 'center' })
  }

  doc.save(`relatorio-produtos-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── 6.2 Excel performance de vendedores ────────────────────────────────────

async function exportVendedoresXLSX() {
  const { Workbook } = await loadExcelLib()
  const { sellers, team_totals } = await fetchJSON('/dashboard/sellers/full')

  const wb = new Workbook()

  // ── Aba 1: Ranking
  const rankingData = [
    ['Ranking', 'Rank Ajustado', 'Vendedor', 'Leads', 'Vendas', 'Faturamento (R$)', 'Conversão (%)', 'Conversão Ajustada (%)', 'Ticket Médio (R$)', 'Qualidade', 'Tendência'],
    ...sellers.map((s: any) => [
      s.rank,
      s.adjusted_rank,
      s.seller_name,
      s.leads,
      s.conversions,
      s.revenue_cents / 100,
      s.conversion_rate,
      s.adjusted_rate,
      s.ticket_medio_cents / 100,
      s.avg_quality,
      s.trend === 'up' ? '↑ Subindo' : s.trend === 'down' ? '↓ Caindo' : '→ Estável',
    ]),
    [],
    ['TOTAL DO TIME', '', '', team_totals.total_leads, team_totals.total_conversions, team_totals.total_revenue_cents / 100, team_totals.avg_conversion_rate, '', '', team_totals.global_avg_quality, ''],
  ]

  appendWorksheet(
    wb,
    'Ranking',
    rankingData,
    [8, 13, 22, 8, 8, 18, 14, 22, 16, 10, 12],
  )

  // ── Aba 2: Funil por vendedor
  const funnelData = [
    ['Vendedor', 'Lead', 'Qualificação', 'Proposta', 'Fechamento', 'Fechado'],
    ...sellers.map((s: any) => [
      s.seller_name,
      s.funnel.lead,
      s.funnel.qualificacao,
      s.funnel.proposta,
      s.funnel.fechamento,
      s.funnel.fechado,
    ]),
  ]
  appendWorksheet(
    wb,
    'Funil',
    funnelData,
    [22, 10, 14, 10, 14, 10],
  )

  // ── Aba 3: Tempo por estágio
  const stageData = [
    ['Vendedor', 'Dias em Lead', 'Dias em Qualif.', 'Dias em Proposta', 'Dias em Fechamento'],
    ...sellers.map((s: any) => [
      s.seller_name,
      s.stage_time.lead_days,
      s.stage_time.qualificacao_days,
      s.stage_time.proposta_days,
      s.stage_time.fechamento_days,
    ]),
  ]
  appendWorksheet(
    wb,
    'Tempo por Estágio',
    stageData,
    [22, 14, 16, 17, 19],
  )

  // ── Aba 4: Melhores horários
  const hoursRows: any[] = [['Vendedor', '#', 'Horário', 'Wins']]
  sellers.forEach((s: any) => {
    s.best_hours.forEach((h: any, i: number) => {
      hoursRows.push([i === 0 ? s.seller_name : '', i + 1, `${String(h.hour).padStart(2, '0')}h`, h.wins])
    })
  })
  appendWorksheet(
    wb,
    'Melhores Horários',
    hoursRows,
    [22, 5, 10, 8],
  )

  const buffer = await wb.xlsx.writeBuffer()
  triggerExcelDownload(buffer as ArrayBuffer | Uint8Array, `performance-vendedores-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── 6.3 Excel comparativo mês a mês ─────────────────────────────────────────

async function exportComparativoXLSX() {
  const { Workbook } = await loadExcelLib()
  const { current, previous, changes, ref_month, prev_month } = await fetchJSON('/dashboard/kpis-comparison')

  const wb = new Workbook()

  // ── Aba 1: Comparativo principal
  const fmt = (v: number, prefix = '') => `${prefix}${v.toLocaleString('pt-BR')}`
  const delta = (v: number) => v > 0 ? `▲ +${v}%` : v < 0 ? `▼ ${v}%` : `→ 0%`

  const compData = [
    [`Comparativo Mensal — ${ref_month} vs ${prev_month}`],
    [],
    ['Métrica', `Mês Atual (${ref_month})`, `Mês Anterior (${prev_month})`, 'Variação (%)'],
    ['Faturamento (R$)', current.revenue_cents / 100, previous.revenue_cents / 100, delta(changes.revenue)],
    ['Vendas (qtd)', current.sales_won, previous.sales_won, delta(changes.sales)],
    ['Leads Recebidos', current.leads_received, previous.leads_received, delta(changes.leads)],
    ['Conversão (%)', `${current.conversion_rate}%`, `${previous.conversion_rate}%`, delta(changes.conversion)],
    ['Ticket Médio (R$)', current.ticket_avg_cents / 100, previous.ticket_avg_cents / 100, delta(changes.ticket)],
    ['Tempo de Resposta (min)', current.avg_first_response_min, previous.avg_first_response_min, delta(changes.response_time)],
    [],
    [`Relatório gerado em ${fmtDate()} via Supervisor Comercial`],
  ]

  appendWorksheet(
    wb,
    'Comparativo',
    compData,
    [24, 22, 22, 16],
    [{ startRow: 1, startCol: 1, endRow: 1, endCol: 4 }],
  )

  // ── Aba 2: Histórico de KPIs (últimos 3 meses)
  const now = new Date()
  const months = [0, 1, 2].map(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const historyData: any[] = [
    ['Mês', 'Faturamento (R$)', 'Vendas', 'Leads', 'Conversão (%)', 'Ticket Médio (R$)'],
  ]

  for (const m of months) {
    try {
      const d = await fetchJSON(`/dashboard/kpis-comparison?month=${m}`)
      historyData.push([
        m,
        d.current.revenue_cents / 100,
        d.current.sales_won,
        d.current.leads_received,
        `${d.current.conversion_rate}%`,
        d.current.ticket_avg_cents / 100,
      ])
    } catch {
      historyData.push([m, '-', '-', '-', '-', '-'])
    }
  }

  appendWorksheet(
    wb,
    'Histórico 3 Meses',
    historyData,
    [12, 18, 10, 10, 14, 18],
  )

  const buffer = await wb.xlsx.writeBuffer()
  triggerExcelDownload(buffer as ArrayBuffer | Uint8Array, `comparativo-mensal-${ref_month}.xlsx`)
}

// ─── Componente de card de relatório ─────────────────────────────────────────

type Status = 'idle' | 'loading' | 'done' | 'error'

function ReportCard({
  icon: Icon,
  title,
  description,
  details,
  color,
  onExport,
  fileType,
}: {
  icon: any
  title: string
  description: string
  details: string[]
  color: string
  onExport: () => Promise<void>
  fileType: 'PDF' | 'Excel'
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handle = async () => {
    setStatus('loading')
    setErrorMsg('')
    try {
      await onExport()
      setStatus('done')
      setTimeout(() => setStatus('idle'), 4000)
    } catch (e: any) {
      setStatus('error')
      setErrorMsg(e.message || 'Erro desconhecido')
    }
  }

  const badgeColor = fileType === 'PDF' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'

  return (
    <div className="glass rounded-xl p-5 glow-box border border-dark-600 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${color} shrink-0`}>
            <Icon size={20} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                {fileType}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
        </div>
      </div>

      {/* O que inclui */}
      <ul className="space-y-1">
        {details.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
            {d}
          </li>
        ))}
      </ul>

      {/* Feedback de erro */}
      {status === 'error' && (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
          <AlertCircle size={13} className="text-red-400 shrink-0" />
          <span className="text-xs text-red-400">{errorMsg}</span>
        </div>
      )}

      {/* Botão */}
      <button
        onClick={handle}
        disabled={status === 'loading'}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
          status === 'done'
            ? 'bg-accent-success/20 text-accent-success border border-accent-success/30'
            : status === 'loading'
            ? 'bg-dark-700 text-gray-500 cursor-not-allowed'
            : status === 'error'
            ? 'bg-accent-danger/20 text-accent-danger border border-accent-danger/30 hover:bg-accent-danger/30'
            : 'bg-accent-primary hover:bg-accent-primary/80 text-white'
        }`}
      >
        {status === 'loading' && <Loader size={15} className="animate-spin" />}
        {status === 'done' && <CheckCircle size={15} />}
        {status === 'error' && <AlertCircle size={15} />}
        {(status === 'idle' || status === 'error') && <Download size={15} />}
        {status === 'idle' && 'Exportar'}
        {status === 'loading' && 'Gerando...'}
        {status === 'done' && 'Download iniciado!'}
        {status === 'error' && 'Tentar novamente'}
      </button>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Relatórios Exportáveis</h2>
        <p className="text-sm text-gray-500">Gere relatórios em PDF e Excel com dados em tempo real</p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <ReportCard
          icon={FileText}
          title="Relatório por Produto"
          description="Visão semanal de todos os produtos"
          details={[
            'KPIs consolidados (leads, vendas, faturamento)',
            'Performance individual de cada produto',
            'Progresso das metas do mês',
            'Top 3 objeções por produto',
            'Sensibilidade a preço detectada pela IA',
          ]}
          color="bg-red-500"
          fileType="PDF"
          onExport={exportProdutosPDF}
        />

        <ReportCard
          icon={Table}
          title="Performance de Vendedores"
          description="Análise completa por vendedor"
          details={[
            'Ranking por faturamento e conversão ajustada',
            'Funil individual de cada vendedor',
            'Tempo médio por estágio do funil',
            'Melhores horários de fechamento (90 dias)',
            'Tendência semanal (subindo/estável/caindo)',
          ]}
          color="bg-green-600"
          fileType="Excel"
          onExport={exportVendedoresXLSX}
        />

        <ReportCard
          icon={TrendingUp}
          title="Comparativo Mês a Mês"
          description="Evolução dos KPIs ao longo do tempo"
          details={[
            'Mês atual vs mês anterior com variação %',
            'Faturamento, vendas, leads, conversão',
            'Ticket médio e tempo de resposta',
            'Histórico dos últimos 3 meses',
            'Indicadores de tendência (▲▼→)',
          ]}
          color="bg-blue-600"
          fileType="Excel"
          onExport={exportComparativoXLSX}
        />
      </div>

      {/* Nota informativa */}
      <div className="mt-6 p-4 glass rounded-xl border border-dark-600">
        <p className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Como funciona:</span> Os relatórios buscam dados diretamente da API em tempo real no momento da exportação. O arquivo é gerado localmente no navegador e o download inicia automaticamente — nenhum dado é enviado para servidores externos.
        </p>
      </div>
    </>
  )
}
