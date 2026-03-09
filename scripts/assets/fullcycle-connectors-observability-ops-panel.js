function readPanelData() {
  const node = document.getElementById('phase31-panel-data');
  if (!node) return {};
  try {
    return JSON.parse(node.textContent || '{}');
  } catch {
    return {};
  }
}

const D = readPanelData();
    const q = (id) => document.getElementById(id);
    const toText = (value) => value === null || value === undefined || value === '' ? 'n/a' : String(value);
    const lower = (value) => String(value || '').trim().toLowerCase();
    const num = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
    const parseTime = (value) => { const parsed = Date.parse(String(value || '')); return Number.isFinite(parsed) ? parsed : null; };
    const esc = (value) => String(toText(value)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const tone = (value) => { const raw = lower(value); if (['critical', 'error', 'fail', 'fatal'].includes(raw)) return 'critical'; if (['warning', 'warn', 'degraded'].includes(raw)) return 'warning'; return 'info'; };
    const periods = { '15m': 900000, '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000, all: Number.POSITIVE_INFINITY };
    const state = { incidents: [], alerts: [], events: [], slaHistory: [], incidentSummary: null, alertSummary: null, slaSummary: null, backendSummary: null, backendReport: null, teams: [], sse: null, lastEventAt: null, lastRefreshAt: null, refreshTimer: null, refreshInFlight: false, pendingRefresh: false, authSkipLogged: false, sseSkipLogged: false };
    let filterDebounce = null;

    function log(message) {
      const line = '[' + new Date().toISOString() + '] ' + message;
      const node = q('activityLog');
      node.textContent += line + '\n';
      node.scrollTop = node.scrollHeight;
    }

    function badgeClass(value) { return 'badge badge-' + tone(value); }
    function toneClass(value) { return 'tone-' + tone(value); }
    function ageLabel(value) {
      const ms = parseTime(value);
      if (!Number.isFinite(ms)) return 'n/a';
      const minutes = Math.round(((Date.now() - ms) / 60000) * 100) / 100;
      return minutes + ' min';
    }
    function allowPeriod(value) {
      const key = lower(q('period').value || '24h') || '24h';
      const windowMs = periods[key] !== undefined ? periods[key] : periods['24h'];
      if (!Number.isFinite(windowMs)) return true;
      const ts = parseTime(value);
      if (!Number.isFinite(ts)) return true;
      return ts >= Date.now() - windowMs;
    }
    function headers(config) {
      const result = { 'x-observability-role': config.role || 'operator' };
      if (config.key) result['x-admin-key'] = config.key;
      return result;
    }
    function cfg() {
      return { base: String(q('apiBase').value || '').trim().replace(/\/+$/, ''), key: String(q('adminKey').value || ''), role: lower(q('role').value || 'operator') || 'operator', limit: Math.max(1, Math.min(1000, Number(q('limit').value || D?.api?.defaultLimit || 200))) };
    }
    function selectedSeverities() {
      const values = [];
      if (q('sevCritical').checked) values.push('critical');
      if (q('sevWarning').checked) values.push('warning');
      if (q('sevInfo').checked) values.push('info');
      return values;
    }
    function currentFilters() {
      return { severities: selectedSeverities(), status: lower(q('status').value || 'all'), team: lower(q('team').value || 'all'), source: lower(q('source').value || 'all'), environment: lower(q('environment').value || 'all'), search: String(q('search').value || '').trim() };
    }
    async function fetchJson(url, config) {
      const response = await fetch(url, { headers: headers(config) });
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      return { status: response.status, data, text };
    }
    function toOption(value) { return '<option value="' + esc(value) + '">' + esc(value) + '</option>'; }
    function syncSelect(id, values, fallback) {
      const select = q(id);
      const previous = lower(select.value || fallback || 'all') || 'all';
      const options = ['all'].concat(values.filter(Boolean).sort());
      select.innerHTML = options.map(toOption).join('');
      select.value = options.includes(previous) ? previous : 'all';
    }
    function teamName(value) {
      if (value && typeof value === 'object') return lower(value.team || value.name || '');
      return lower(value || '');
    }
    function collectTeams() {
      const fromSummary = [].concat(Array.isArray(state.incidentSummary?.teams) ? state.incidentSummary.teams : []).concat(Array.isArray(state.alertSummary?.teams) ? state.alertSummary.teams : []);
      const fromRecords = state.incidents.concat(state.alerts).map((item) => lower(item?.ownerTeam || item?.routing?.team || ''));
      return Array.from(new Set(fromSummary.concat(fromRecords).map((item) => teamName(item)).filter(Boolean)));
    }
    function collectSources() { return Array.from(new Set(state.alerts.concat(state.events).map((item) => lower(item?.source || '')).filter(Boolean))); }
    function collectEnvironments() {
      return Array.from(new Set(state.incidents.concat(state.alerts).concat(state.events).concat(state.slaHistory).map((item) => lower(item?.environment || '')).filter(Boolean)));
    }
    function normalizeEvent(raw) {
      return { id: String(raw?.id || ''), timestamp: raw?.timestamp || raw?.generatedAt || null, source: lower(raw?.source || 'unknown') || 'unknown', environment: lower(raw?.environment || raw?.metadata?.environment || D?.summary?.defaultEnvironment || 'unknown') || 'unknown', severity: tone(raw?.severity || raw?.status), status: lower(raw?.status || 'unknown') || 'unknown', type: lower(raw?.type || 'event') || 'event', code: String(raw?.code || ''), message: String(raw?.message || raw?.code || raw?.type || 'event') };
    }
    function normalizeSla(raw) {
      return { timestamp: raw?.timestamp || raw?.generatedAt || null, environment: lower(raw?.environment || D?.summary?.defaultEnvironment || 'unknown') || 'unknown', status: lower(raw?.status || 'unknown') || 'unknown', availabilityPct: num(raw?.availabilityPct), worstLatencyMs: num(raw?.worstLatencyMs), observedPayloadAgeMinutes: num(raw?.observedPayloadAgeMinutes), blockingViolations: num(raw?.blockingViolations) };
    }
    function operationalView() {
      return state.backendSummary?.operationalSources || state.backendReport?.report?.operationalSources || D?.operationalSources || null;
    }
    function providerView() {
      return state.backendSummary?.operationalProvider || state.backendReport?.report?.operationalProvider || D?.operationalProvider || null;
    }
    function operationalSource(key) {
      return operationalView()?.sources?.[key] || null;
    }
    function mergeEvent(raw) {
      const item = normalizeEvent(raw);
      const key = item.id || [item.timestamp, item.source, item.type, item.code, item.message].join('::');
      const index = state.events.findIndex((entry) => (entry.id || [entry.timestamp, entry.source, entry.type, entry.code, entry.message].join('::')) === key);
      if (index >= 0) state.events[index] = item; else state.events.push(item);
      state.events.sort((a, b) => (parseTime(b.timestamp) || 0) - (parseTime(a.timestamp) || 0));
      if (state.events.length > 4000) state.events = state.events.slice(0, 4000);
    }
    function formatStatus(value) { return '<span class="' + toneClass(value || 'unknown') + '">' + esc(lower(value || 'unknown')) + '</span>'; }
    function badge(value) { return '<span class="' + badgeClass(value || 'info') + '">' + esc(lower(value || 'unknown')) + '</span>'; }
    function filteredIncidents() {
      const filters = currentFilters();
      return state.incidents.filter((item) => (!filters.severities.length || filters.severities.includes(tone(item?.severity))) && (filters.team === 'all' || lower(item?.ownerTeam || item?.routing?.team || '') === filters.team) && (filters.source === 'all' || lower(item?.source || '') === filters.source) && (filters.environment === 'all' || lower(item?.environment || '') === filters.environment) && allowPeriod(item?.lastSeenAt || item?.resolvedAt || item?.openedAt || item?.startedAt));
    }
    function filteredAlerts() {
      const filters = currentFilters();
      return state.alerts.filter((item) => (!filters.severities.length || filters.severities.includes(tone(item?.severity))) && (filters.team === 'all' || lower(item?.ownerTeam || item?.routing?.team || '') === filters.team) && (filters.source === 'all' || lower(item?.source || '') === filters.source) && (filters.environment === 'all' || lower(item?.environment || '') === filters.environment) && allowPeriod(item?.lastSeenAt || item?.resolvedAt || item?.openedAt));
    }
    function filteredEvents() {
      const filters = currentFilters();
      return state.events.filter((item) => (!filters.severities.length || filters.severities.includes(tone(item?.severity))) && (filters.source === 'all' || lower(item?.source || '') === filters.source) && (filters.environment === 'all' || lower(item?.environment || '') === filters.environment) && allowPeriod(item?.timestamp));
    }
    function filteredSla() {
      const filters = currentFilters();
      return state.slaHistory.filter((item) => (filters.environment === 'all' || lower(item?.environment || '') === filters.environment) && allowPeriod(item?.timestamp));
    }
    function renderStats() {
      const incidentSummary = state.incidentSummary?.summary || {};
      const alertSummary = state.alertSummary?.summary || {};
      const latestSla = state.slaHistory[0] || normalizeSla(state.slaSummary?.latest || {});
      const operational = operationalView();
      const provider = providerView();
      const opOverall = operational?.overall || {};
      const opState = operationalSource('incidentAutomation');
      const opSnapshot = operationalSource('itsmSnapshot');
      const providerSubtitle = provider?.producerMode
        ? 'producer ' + provider.producerMode + ' / legacy ' + (provider?.legacyFallbackState || 'n/a')
        : 'contract v' + (provider?.contractVersion || 'n/a');
      const cards = [
        ['Backend status', state.backendSummary?.status || state.backendReport?.report?.status || state.incidentSummary?.status || D?.summary?.backendStatus || 'unknown', 'route store + backend report'],
        ['Operational provider', provider?.mode || 'unknown', providerSubtitle],
        ['Stream status', D?.summary?.streamStatus || 'unknown', 'SSE timeline contract'],
        ['Operational workload', opOverall?.workloadState || D?.summary?.operationalWorkloadState || 'unknown', 'active vs idle'],
        ['Operational freshness', opOverall?.freshnessState || D?.summary?.operationalFreshnessState || 'unknown', 'source health'],
        ['Actionability', opOverall?.actionabilityState || D?.summary?.operationalActionabilityState || 'unknown', 'ready vs degraded'],
        ['Open incidents', incidentSummary.openEntries ?? D?.summary?.openIncidents ?? 0, 'dedicated backend'],
        ['Critical incidents', incidentSummary.criticalOpenEntries ?? D?.summary?.openCriticalIncidents ?? 0, 'open / critical'],
        ['Active alerts', alertSummary.activeEntries ?? D?.summary?.activeAlerts ?? 0, 'dedicated backend'],
        ['Critical alerts', alertSummary.criticalActiveEntries ?? D?.summary?.activeCriticalAlerts ?? 0, 'active / critical'],
        ['Teams tracked', state.teams.length || D?.summary?.teams || 0, 'team routing'],
        ['State age', opState?.ageMinutes !== null && opState?.ageMinutes !== undefined ? opState.ageMinutes + ' min' : 'n/a', 'incident automation'],
        ['Snapshot age', opSnapshot?.ageMinutes !== null && opSnapshot?.ageMinutes !== undefined ? opSnapshot.ageMinutes + ' min' : 'n/a', 'itsm snapshot'],
        ['Visible timeline', filteredEvents().length, 'after local period filter'],
        ['Visible incidents', filteredIncidents().length, 'server filter + local period'],
        ['Visible alerts', filteredAlerts().length, 'server filter + local period'],
        ['Latest availability', latestSla?.availabilityPct !== null ? latestSla.availabilityPct + '%' : 'n/a', 'API SLA'],
        ['Latest latency', latestSla?.worstLatencyMs !== null ? latestSla.worstLatencyMs + ' ms' : 'n/a', 'worst latency'],
      ];
      q('stats').innerHTML = cards.map((item) => {
        const emphasis = typeof item[1] === 'string' && ['pass', 'warn', 'fail', 'critical', 'warning', 'info'].includes(lower(item[1])) ? '<span class="' + toneClass(item[1]) + '">' + esc(item[1]) + '</span>' : '<span>' + esc(item[1]) + '</span>';
        return '<article class="card stat"><b>' + esc(item[0]) + '</b>' + emphasis + '<small>' + esc(item[2]) + '</small></article>';
      }).join('');
    }
    function renderIncidents() {
      const rows = filteredIncidents();
      q('incidentsMeta').className = badgeClass(rows.some((item) => tone(item?.severity) === 'critical') ? 'critical' : 'info');
      q('incidentsMeta').textContent = rows.length + ' visible';
      q('incidentsBody').innerHTML = rows.length ? rows.slice(0, cfg().limit).map((item) => '<tr><td>' + esc(item?.id) + '</td><td>' + badge(item?.severity) + '</td><td>' + formatStatus(item?.status) + '</td><td>' + esc(item?.ownerTeam || item?.routing?.team) + '</td><td>' + esc(Array.isArray(item?.connectors) ? item.connectors.join(', ') : 'n/a') + '</td><td>' + esc(item?.openedAt || item?.startedAt || item?.detectedAt) + '</td><td>' + esc(item?.status === 'resolved' ? (toText(item?.durationMinutes) + ' min') : ageLabel(item?.openedAt || item?.startedAt || item?.detectedAt)) + '</td><td>' + esc(item?.violationCount ?? (Array.isArray(item?.violations) ? item.violations.length : 0)) + '</td></tr>').join('') : '<tr><td class="empty" colspan="8">No incidents for current filter set.</td></tr>';
    }
    function renderAlerts() {
      const rows = filteredAlerts();
      q('alertsMeta').className = badgeClass(rows.some((item) => tone(item?.severity) === 'critical') ? 'critical' : 'info');
      q('alertsMeta').textContent = rows.length + ' visible';
      q('alertsBody').innerHTML = rows.length ? rows.slice(0, cfg().limit).map((item) => '<tr><td>' + esc(item?.key) + '</td><td>' + badge(item?.severity) + '</td><td>' + formatStatus(item?.status) + '</td><td>' + esc(item?.ownerTeam || item?.routing?.team) + '</td><td>' + esc(item?.source) + '</td><td>' + esc(item?.lastSeenAt || item?.openedAt) + '</td><td>' + esc(item?.dispatchAttemptCount ?? 0) + '</td><td>' + esc(item?.message) + '</td></tr>').join('') : '<tr><td class="empty" colspan="8">No alerts for current filter set.</td></tr>';
    }
    function renderTimeline() {
      const rows = filteredEvents();
      q('timelineMeta').className = badgeClass(rows.some((item) => item.severity === 'critical') ? 'critical' : 'info');
      q('timelineMeta').textContent = rows.length + ' events';
      q('timelineBody').innerHTML = rows.length ? rows.slice(0, 500).map((item) => '<tr><td>' + esc(item?.timestamp) + '</td><td>' + badge(item?.severity) + '</td><td>' + esc(item?.source) + '</td><td>' + esc(item?.environment) + '</td><td>' + esc(item?.type) + '</td><td>' + formatStatus(item?.status) + '</td><td>' + esc(item?.message) + '</td></tr>').join('') : '<tr><td class="empty" colspan="7">Connect SSE to populate the realtime timeline.</td></tr>';
    }
    function renderSla() {
      const rows = filteredSla();
      q('slaMeta').className = badgeClass(rows[0]?.status || state.slaSummary?.latest?.status || 'info');
      q('slaMeta').textContent = rows.length ? rows.length + ' points' : 'summary only';
      q('slaBody').innerHTML = rows.length ? rows.slice(0, 300).map((item) => '<tr><td>' + esc(item?.timestamp) + '</td><td>' + esc(item?.environment) + '</td><td>' + formatStatus(item?.status) + '</td><td>' + esc(item?.availabilityPct !== null ? item.availabilityPct + '%' : 'n/a') + '</td><td>' + esc(item?.worstLatencyMs !== null ? item.worstLatencyMs + ' ms' : 'n/a') + '</td><td>' + esc(item?.observedPayloadAgeMinutes !== null ? item.observedPayloadAgeMinutes + ' min' : 'n/a') + '</td><td>' + esc(item?.blockingViolations) + '</td></tr>').join('') : '<tr><td class="empty" colspan="7">No SLA history available for the current role/filter. Operator uses summary only.</td></tr>';
    }
    function renderPosture() {
      const incidentSummary = state.incidentSummary?.summary || {};
      const alertSummary = state.alertSummary?.summary || {};
      const latestSla = state.slaHistory[0] || state.slaSummary?.latest || {};
      const operational = operationalView();
      const opOverall = operational?.overall || {};
      const opFullcycle = operationalSource('fullcycleReport');
      const cards = [
        ['Open incidents', incidentSummary.openEntries ?? 0],
        ['Resolved incidents', incidentSummary.resolvedEntries ?? 0],
        ['Active alerts', alertSummary.activeEntries ?? 0],
        ['Resolved alerts', alertSummary.resolvedEntries ?? 0],
        ['SLA blocking', latestSla?.blockingViolations ?? 'n/a'],
        ['Cursor', D?.summary?.streamCursor ?? 'n/a'],
        ['Source freshness', opOverall?.freshnessState || 'unknown'],
        ['Fullcycle age', opFullcycle?.ageMinutes !== null && opFullcycle?.ageMinutes !== undefined ? opFullcycle.ageMinutes + ' min' : 'n/a'],
      ];
      q('postureGrid').innerHTML = cards.map((item) => '<div class="mini-card"><b>' + esc(item[0]) + '</b><span>' + esc(item[1]) + '</span></div>').join('');
      q('teamList').innerHTML = state.teams.length ? state.teams.map((item) => '<span class="team-chip">' + esc(item) + '</span>').join('') : '<span class="team-chip">no teams loaded</span>';
    }
    function renderHero() {
      q('generatedAt').textContent = toText(D?.generatedAt);
      q('gateStatus').textContent = toText(D?.status).toUpperCase();
      q('backendStatusHero').textContent = toText(state.backendSummary?.status || state.backendReport?.report?.status || state.incidentSummary?.status || D?.summary?.backendStatus).toUpperCase();
      q('streamStatusHero').textContent = toText(D?.summary?.streamStatus).toUpperCase();
      q('lastRefreshLabel').textContent = state.lastRefreshAt || 'n/a';
      q('lastEventBadge').className = badgeClass(state.lastEventAt ? 'info' : 'warning');
      q('lastEventBadge').textContent = 'last event ' + (state.lastEventAt || 'n/a');
    }
    function renderConnection(status, label) {
      q('connState').className = badgeClass(status);
      q('connState').textContent = label;
    }
    function render() {
      syncSelect('team', collectTeams(), 'all');
      syncSelect('source', collectSources(), 'all');
      syncSelect('environment', collectEnvironments(), D?.summary?.defaultEnvironment || 'all');
      state.teams = collectTeams();
      renderHero();
      renderStats();
      renderIncidents();
      renderAlerts();
      renderTimeline();
      renderSla();
      renderPosture();
    }
    function withFilters(url) {
      const filters = currentFilters();
      if (filters.status !== 'all') url.searchParams.set('status', filters.status);
      if (filters.severities.length) url.searchParams.set('severity', filters.severities.join(','));
      if (filters.team !== 'all') url.searchParams.set('team', filters.team);
      if (filters.source !== 'all') url.searchParams.set('source', filters.source);
      if (filters.environment !== 'all') url.searchParams.set('environment', filters.environment);
      if (filters.search) url.searchParams.set('q', filters.search);
      return url;
    }
    async function loadBackend(mode = 'auto') {
      if (state.refreshInFlight) { state.pendingRefresh = true; return; }
      state.refreshInFlight = true;
      const config = cfg();
      if (!config.key && mode !== 'manual') {
        if (!state.authSkipLogged) {
          log('backend refresh skipped admin key missing');
          state.authSkipLogged = true;
        }
        state.refreshInFlight = false;
        return;
      }
      state.authSkipLogged = false;
      const base = config.base || D?.api?.baseDefault || 'http://127.0.0.1:3000';
      try {
        const incidentUrl = withFilters(new URL('/api/observability/connectors/incidents', base));
        incidentUrl.searchParams.set('limit', String(config.limit));
        const alertUrl = withFilters(new URL('/api/observability/connectors/alerts', base));
        alertUrl.searchParams.set('limit', String(config.limit));
        const requests = [
          fetchJson(new URL('/api/observability/connectors/incidents/summary', base), config),
          fetchJson(incidentUrl.toString(), config),
          fetchJson(new URL('/api/observability/connectors/alerts/summary', base), config),
          fetchJson(alertUrl.toString(), config),
          fetchJson(new URL('/api/observability/connectors/api-sla/summary', base), config),
          fetchJson(new URL('/api/observability/connectors/backend/summary', base), config),
          (config.role === 'executive' || config.role === 'admin') ? fetchJson(new URL('/api/observability/connectors/api-sla/history?limit=500', base), config) : Promise.resolve({ status: 0, data: null }),
          (config.role === 'executive' || config.role === 'admin') ? fetchJson(new URL('/api/observability/connectors/backend/report', base), config) : Promise.resolve({ status: 0, data: null }),
        ];
        const [incidentSummaryRes, incidentsRes, alertSummaryRes, alertsRes, slaSummaryRes, backendSummaryRes, slaHistoryRes, backendReportRes] = await Promise.all(requests);
        if (incidentSummaryRes.status !== 200) throw new Error('incidents/summary status=' + incidentSummaryRes.status);
        if (incidentsRes.status !== 200) throw new Error('incidents status=' + incidentsRes.status);
        if (alertSummaryRes.status !== 200) throw new Error('alerts/summary status=' + alertSummaryRes.status);
        if (alertsRes.status !== 200) throw new Error('alerts status=' + alertsRes.status);
        if (slaSummaryRes.status !== 200) throw new Error('api-sla/summary status=' + slaSummaryRes.status);
        if (backendSummaryRes.status !== 200) throw new Error('backend/summary status=' + backendSummaryRes.status);
        state.incidentSummary = incidentSummaryRes.data || null;
        state.alertSummary = alertSummaryRes.data || null;
        state.slaSummary = slaSummaryRes.data || null;
        state.backendSummary = backendSummaryRes.data || null;
        state.backendReport = backendReportRes.status === 200 ? backendReportRes.data : null;
        state.incidents = Array.isArray(incidentsRes.data?.entries) ? incidentsRes.data.entries : [];
        state.alerts = Array.isArray(alertsRes.data?.entries) ? alertsRes.data.entries : [];
        state.slaHistory = slaHistoryRes.status === 200 && Array.isArray(slaHistoryRes.data?.entries) ? slaHistoryRes.data.entries.map(normalizeSla).sort((a, b) => (parseTime(b.timestamp) || 0) - (parseTime(a.timestamp) || 0)) : (state.slaSummary?.latest ? [normalizeSla(state.slaSummary.latest)] : []);
        state.lastRefreshAt = new Date().toISOString();
        render();
        log('backend refresh ok incidents=' + state.incidents.length + ' alerts=' + state.alerts.length + ' sla=' + state.slaHistory.length + ' role=' + config.role + ' op=' + (state.backendSummary?.operationalSources?.overall?.actionabilityState || 'unknown'));
      } catch (error) {
        log('backend refresh error ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        state.refreshInFlight = false;
        if (state.pendingRefresh) { state.pendingRefresh = false; loadBackend(); }
      }
    }
    function stopSse() {
      if (state.sse) { state.sse.close(); state.sse = null; }
      renderConnection('warning', 'disconnected');
    }
    function scheduleBackendRefresh(delayMs) {
      if (!q('autoRefresh').checked) return;
      if (state.refreshTimer) clearTimeout(state.refreshTimer);
      state.refreshTimer = setTimeout(() => { state.refreshTimer = null; loadBackend(); }, Math.max(250, delayMs));
    }
    function connectSse(mode = 'auto') {
      stopSse();
      const config = cfg();
      if (!config.key && mode !== 'manual') {
        renderConnection('warning', 'missing key');
        if (!state.sseSkipLogged) {
          log('sse connect skipped admin key missing');
          state.sseSkipLogged = true;
        }
        return;
      }
      state.sseSkipLogged = false;
      const base = config.base || D?.api?.baseDefault || 'http://127.0.0.1:3000';
      const url = new URL('/api/observability/connectors/stream', base);
      url.searchParams.set('limit', String(config.limit));
      url.searchParams.set('role', config.role);
      if (config.key) url.searchParams.set('adminKey', config.key);
      log('sse connect ' + url.toString());
      try { state.sse = new EventSource(url.toString()); } catch (error) { renderConnection('critical', 'error'); log('sse init error ' + (error instanceof Error ? error.message : String(error))); return; }
      state.sse.onopen = () => { renderConnection('info', 'connected'); log('sse connected'); };
      state.sse.onerror = () => { renderConnection('critical', 'stream error'); log('sse error'); };
      state.sse.addEventListener('snapshot', (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          const entries = Array.isArray(payload?.events) ? payload.events : [];
          state.events = [];
          for (const item of entries) mergeEvent(item);
          render();
          log('sse snapshot ' + entries.length);
        } catch (error) {
          log('snapshot parse error ' + (error instanceof Error ? error.message : String(error)));
        }
      });
      state.sse.addEventListener('event', (event) => {
        try {
          mergeEvent(JSON.parse(event.data || '{}'));
          state.lastEventAt = new Date().toISOString();
          render();
          scheduleBackendRefresh(1200);
        } catch (error) {
          log('event parse error ' + (error instanceof Error ? error.message : String(error)));
        }
      });
      state.sse.addEventListener('heartbeat', () => { state.lastEventAt = new Date().toISOString(); render(); });
      state.sse.addEventListener('end', () => { log('sse end'); stopSse(); });
    }
    function bindFilterRefresh(id, mode) {
      const handler = () => {
        if (mode === 'debounce') {
          if (filterDebounce) clearTimeout(filterDebounce);
          filterDebounce = setTimeout(() => { filterDebounce = null; loadBackend(); }, 260);
          return;
        }
        loadBackend();
        render();
      };
      q(id).addEventListener('change', handler);
      if (mode === 'debounce') q(id).addEventListener('input', handler);
    }

    const initQuery = new URLSearchParams(location.search);
    const initApiBase = String(initQuery.get('apiBase') || initQuery.get('base') || '').trim();
    const initRole = lower(initQuery.get('role') || '');
    const initAdminKey = String(initQuery.get('adminKey') || '').trim();
    const initLimitRaw = Number(initQuery.get('limit') || '');
    const initLimit = Number.isFinite(initLimitRaw) ? Math.max(1, Math.min(1000, initLimitRaw)) : null;

    q('apiBase').value = initApiBase || D?.api?.baseDefault || 'http://127.0.0.1:3000';
    q('role').value = ['operator', 'executive', 'admin'].includes(initRole) ? initRole : (D?.api?.defaultRole || 'operator');
    q('limit').value = String(initLimit || D?.api?.defaultLimit || 200);
    q('adminKey').value = initAdminKey;
    q('autoRefresh').checked = true;
    q('generatedAt').textContent = toText(D?.generatedAt);
    q('gateStatus').textContent = toText(D?.status).toUpperCase();
    renderConnection('warning', 'disconnected');
    log('panel booted without embedded local payload');
    if (initAdminKey) log('admin key detected via query string');
    else log('admin key missing; waiting authenticated refresh');

    q('refresh').addEventListener('click', () => loadBackend('manual'));
    q('connect').addEventListener('click', () => connectSse('manual'));
    q('stop').addEventListener('click', stopSse);
    for (const id of ['sevCritical', 'sevWarning', 'sevInfo', 'status', 'team', 'source', 'environment', 'period', 'role', 'limit']) bindFilterRefresh(id, 'change');
    bindFilterRefresh('search', 'debounce');

    render();
    loadBackend();
    setInterval(() => { if (q('autoRefresh').checked) loadBackend(); }, Math.max(5000, Number(D?.ui?.refreshMs || 30000)));
    if (D?.ui?.autoConnect !== false) connectSse();
