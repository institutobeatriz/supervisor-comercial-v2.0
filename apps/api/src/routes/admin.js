/**
 * Admin Routes
 * Supervisor Comercial
 */
import { getConversationsForAdmin, getConversationDetail, getMessagesByConversation, getInsightsByConversationId, getOutcomeByConversationId, setOutcome, getDailyReport, getWeeklyReport, findSimilarRagChunks, isRagVectorEnabled, } from '@supervisor/db';
// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function checkAdminAuth(request, reply) {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey)
        return true; // Skip if not configured
    const providedKey = request.headers['x-admin-key'];
    if (providedKey !== adminKey) {
        reply.status(401).send({ error: 'Unauthorized' });
        return false;
    }
    return true;
}
// ============================================================
// ROUTES
// ============================================================
const adminRoutes = async (fastify) => {
    // ============================================================
    // CONVERSATIONS LIST
    // ============================================================
    fastify.get('/conversations', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        const query = request.query;
        const conversations = await getConversationsForAdmin({
            status: query.status,
            stage: query.stage,
            q: query.q,
            limit: query.limit ? parseInt(query.limit) : 50,
            offset: query.offset ? parseInt(query.offset) : 0,
        });
        return { conversations };
    });
    // ============================================================
    // CONVERSATION DETAIL
    // ============================================================
    fastify.get('/conversations/:id', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        const params = request.params;
        const conversation = await getConversationDetail(params.id);
        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }
        const messages = await getMessagesByConversation(params.id, 100);
        const insights = await getInsightsByConversationId(params.id);
        const outcome = await getOutcomeByConversationId(params.id);
        return {
            conversation,
            messages,
            insights,
            outcome,
        };
    });
    // ============================================================
    // SET OUTCOME (won/lost)
    // ============================================================
    fastify.post('/outcomes', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        const body = request.body;
        const result = await setOutcome({
            conversation_id: body.conversation_id,
            outcome: body.outcome,
            value_cents: body.value_cents,
            loss_reason: body.loss_reason,
        });
        // TODO: Trigger analysis_job and rag_index_job if won
        return { outcome: result };
    });
    // ============================================================
    // REPORTS - DAILY
    // ============================================================
    fastify.get('/reports/daily', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        const query = request.query;
        const date = query.date || new Date().toISOString().split('T')[0];
        const sellerId = query.seller_id;
        const report = await getDailyReport(date, sellerId || '');
        return { date, report };
    });
    // ============================================================
    // REPORTS - WEEKLY
    // ============================================================
    fastify.get('/reports/weekly', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        const query = request.query;
        const weekStart = query.weekStart || getWeekStart();
        const sellerId = query.seller_id;
        const report = await getWeeklyReport(weekStart, sellerId || '');
        return { weekStart, report };
    });
    // ============================================================
    // RAG - BÍBLIA de Vendas
    // ============================================================
    fastify.get('/rag/search', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        const query = request.query;
        // If RAG_VECTOR is disabled, return empty
        if (!isRagVectorEnabled()) {
            return {
                enabled: false,
                chunks: [],
                message: 'RAG_VECTOR is disabled. Enable it to use semantic search.',
            };
        }
        // Note: This endpoint requires an embedding to search
        // In production, you'd generate embedding from query text
        return {
            enabled: true,
            message: 'Provide an embedding to search. Use POST /rag/search with embedding.',
        };
    });
    fastify.post('/rag/search', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        const body = request.body;
        if (!isRagVectorEnabled()) {
            return {
                enabled: false,
                chunks: [],
                message: 'RAG_VECTOR is disabled.',
            };
        }
        const chunks = await findSimilarRagChunks(body.embedding, body.objection, body.limit || 5);
        return {
            enabled: true,
            chunks,
        };
    });
    // ============================================================
    // ADMIN UI (HTML)
    // ============================================================
    fastify.get('/ui', {
        preHandler: async (request, reply) => {
            if (!checkAdminAuth(request, reply))
                return;
        },
    }, async (request, reply) => {
        return reply.type('text/html').send(getAdminUIHtml());
    });
};
// ============================================================
// HELPERS
// ============================================================
function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const weekStart = new Date(now.setDate(diff));
    return weekStart.toISOString().split('T')[0];
}
function getAdminUIHtml() {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Supervisor Comercial - Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div id="app" class="container mx-auto p-4">
    <h1 class="text-3xl font-bold mb-6">📊 Supervisor Comercial</h1>
    
    <!-- KPIs -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-gray-500 text-sm">Conversas Ativas</div>
        <div id="kpi-active" class="text-2xl font-bold text-blue-600">-</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-gray-500 text-sm">Taxa de Conversão</div>
        <div id="kpi-conversion" class="text-2xl font-bold text-green-600">-</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-gray-500 text-sm">Score Médio</div>
        <div id="kpi-score" class="text-2xl font-bold text-purple-600">-</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-gray-500 text-sm">Urgentes</div>
        <div id="kpi-urgent" class="text-2xl font-bold text-red-600">-</div>
      </div>
    </div>
    
    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex gap-4 flex-wrap">
        <select id="filter-status" class="border rounded px-3 py-2">
          <option value="">Todos Status</option>
          <option value="open">Abertas</option>
          <option value="closed">Fechadas</option>
          <option value="won">Ganhas</option>
          <option value="lost">Perdidas</option>
        </select>
        <select id="filter-stage" class="border rounded px-3 py-2">
          <option value="">Todas Etapas</option>
          <option value="lead">Lead</option>
          <option value="qualificacao">Qualificação</option>
          <option value="proposta">Proposta</option>
          <option value="fechamento">Fechamento</option>
        </select>
        <input id="filter-search" type="text" placeholder="Buscar..." class="border rounded px-3 py-2 flex-1">
      </div>
    </div>
    
    <!-- Objection Heatmap -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <h2 class="text-lg font-semibold mb-4">🔥 Heatmap de Objeções</h2>
      <div id="heatmap" class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div class="bg-red-100 p-3 rounded">
          <div class="text-sm text-gray-600">Preço</div>
          <div class="text-xl font-bold">-</div>
        </div>
        <div class="bg-orange-100 p-3 rounded">
          <div class="text-sm text-gray-600">Prazo</div>
          <div class="text-xl font-bold">-</div>
        </div>
        <div class="bg-yellow-100 p-3 rounded">
          <div class="text-sm text-gray-600">Confiança</div>
          <div class="text-xl font-bold">-</div>
        </div>
        <div class="bg-blue-100 p-3 rounded">
          <div class="text-sm text-gray-600">Comparação</div>
          <div class="text-xl font-bold">-</div>
        </div>
      </div>
    </div>
    
    <!-- Conversations List -->
    <div class="bg-white rounded-lg shadow">
      <div class="p-4 border-b">
        <h2 class="text-lg font-semibold">💬 Conversas</h2>
      </div>
      <div id="conversations" class="divide-y">
        <div class="p-4 text-gray-500">Carregando...</div>
      </div>
    </div>
    
    <!-- RAG - Bíblia de Vendas -->
    <div class="bg-white rounded-lg shadow mt-6 p-4">
      <h2 class="text-lg font-semibold mb-4">📚 Bíblia de Vendas</h2>
      <div class="flex gap-2 mb-4">
        <select id="rag-objection" class="border rounded px-3 py-2">
          <option value="">Todas Objeções</option>
          <option value="price">Preço</option>
          <option value="time">Prazo</option>
          <option value="trust">Confiança</option>
          <option value="compare">Comparação</option>
        </select>
        <button onclick="searchRag()" class="bg-blue-500 text-white px-4 py-2 rounded">Buscar Respostas</button>
      </div>
      <div id="rag-results" class="space-y-3"></div>
    </div>
  </div>
  
  <script>
    const API = '/admin';
    const adminKey = localStorage.getItem('adminKey') || prompt('Admin Key:');
    if (adminKey) localStorage.setItem('adminKey', adminKey);
    
    async function fetchAPI(url) {
      const res = await fetch(url, { headers: { 'x-admin-key': adminKey } });
      return res.json();
    }
    
    async function loadConversations() {
      const status = document.getElementById('filter-status').value;
      const stage = document.getElementById('filter-stage').value;
      const search = document.getElementById('filter-search').value;
      
      let url = API + '/conversations?limit=50';
      if (status) url += '&status=' + status;
      if (stage) url += '&stage=' + stage;
      if (search) url += '&q=' + encodeURIComponent(search);
      
      const data = await fetchAPI(url);
      renderConversations(data.conversations || []);
    }
    
    function renderConversations(convs) {
      const container = document.getElementById('conversations');
      if (!convs.length) {
        container.innerHTML = '<div class="p-4 text-gray-500">Nenhuma conversa encontrada</div>';
        return;
      }
      
      container.innerHTML = convs.map(c => \`
        <div class="p-4 hover:bg-gray-50 cursor-pointer" onclick="viewConversation('\${c.id}')">
          <div class="flex justify-between items-start">
            <div>
              <div class="font-medium">\${c.contact_name || c.phone_e164}</div>
              <div class="text-sm text-gray-500">\${c.phone_e164}</div>
            </div>
            <div class="text-right">
              <div class="text-xs text-gray-400">\${c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('pt-BR') : '-'}</div>
              <div class="mt-1">
                <span class="text-xs px-2 py-1 rounded \${getStatusClass(c.outcome || c.status)}">\${c.outcome || c.status}</span>
              </div>
            </div>
          </div>
          \${c.quality_score ? \`<div class="mt-2 text-sm text-gray-600">Score: \${c.quality_score}/100</div>\` : ''}
        </div>
      \`).join('');
    }
    
    function getStatusClass(status) {
      const classes = {
        open: 'bg-blue-100 text-blue-800',
        won: 'bg-green-100 text-green-800',
        lost: 'bg-red-100 text-red-800',
        closed: 'bg-gray-100 text-gray-800'
      };
      return classes[status] || 'bg-gray-100 text-gray-800';
    }
    
    async function viewConversation(id) {
      const data = await fetchAPI(API + '/conversations/' + id);
      alert('Conversa: ' + JSON.stringify(data, null, 2));
    }
    
    async function searchRag() {
      document.getElementById('rag-results').innerHTML = '<div class="text-gray-500">Busca por embedding requer integração com LLM.</div>';
    }
    
    // Event listeners
    document.getElementById('filter-status').addEventListener('change', loadConversations);
    document.getElementById('filter-stage').addEventListener('change', loadConversations);
    document.getElementById('filter-search').addEventListener('input', debounce(loadConversations, 300));
    
    function debounce(fn, ms) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), ms);
      };
    }
    
    // Initial load
    loadConversations();
  </script>
</body>
</html>`;
}
export default adminRoutes;
//# sourceMappingURL=admin.js.map