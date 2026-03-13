function readDashboardData() {
  const node = document.getElementById('connector-observability-data');
  if (!node) return {};
  try {
    return JSON.parse(node.textContent || '{}');
  } catch {
    return {};
  }
}

const DATA = readDashboardData();

function renderStatusChip(value) {
  const key = String(value || 'unknown').toLowerCase();
  const css = key === 'pass' ? 'status-pass' : (key === 'fail' ? 'status-fail' : 'status-warn');
  return '<span class="' + css + '">' + key.toUpperCase() + '</span>';
}

function toCell(value) {
  if (value === null || value === undefined || value === '') return 'n/a';
  return String(value);
}

function renderEnvironmentTable() {
  const table = document.getElementById('env-table');
  const rows = DATA.environmentOverview || [];
  let html = '<thead><tr><th>Environment</th><th>Last Snapshot</th><th>Runtime</th><th>Readiness</th><th>Active Incident</th><th>Connectors</th></tr></thead><tbody>';
  if (!rows.length) {
    html += '<tr><td colspan="6">No environment snapshots</td></tr>';
  } else {
    for (const row of rows) {
      html += '<tr>'
        + '<td><span class="chip">' + toCell(row.environment) + '</span></td>'
        + '<td>' + toCell(row.timestamp) + '</td>'
        + '<td>' + renderStatusChip(row.runtimeStatus) + '</td>'
        + '<td>' + renderStatusChip(row.readinessStatus) + '</td>'
        + '<td>' + (row.activeIncidentId ? toCell(row.activeIncidentId) : 'none') + '</td>'
        + '<td>' + toCell(row.connectorsCount) + '</td>'
        + '</tr>';
    }
  }
  html += '</tbody>';
  table.innerHTML = html;
}

function renderFilterOptions() {
  const select = document.getElementById('env-filter');
  const envs = (DATA.environmentOverview || []).map((item) => item.environment);
  const options = ['all', ...envs];
  select.innerHTML = options.map((env) => '<option value="' + env + '">' + env.toUpperCase() + '</option>').join('');
  select.value = envs[0] || 'all';
  select.addEventListener('change', () => renderConnectorTable(select.value));
}

function renderConnectorTable(environment) {
  const table = document.getElementById('connector-table');
  const rows = DATA.connectorMatrix || [];
  let html = '<thead><tr><th>Connector</th><th>Provider</th><th>Channel</th><th>Success %</th><th>Timeout %</th><th>HTTP Error %</th><th>P95 ms</th><th>Contract Errors</th></tr></thead><tbody>';
  if (!rows.length) {
    html += '<tr><td colspan="8">No connectors tracked</td></tr>';
  } else {
    for (const row of rows) {
      const data = environment === 'all'
        ? Object.values(row.byEnvironment || {})[0]
        : (row.byEnvironment || {})[environment];
      if (!data && environment !== 'all') continue;
      html += '<tr>'
        + '<td>' + toCell(row.key) + '</td>'
        + '<td>' + toCell(row.provider) + '</td>'
        + '<td>' + toCell(row.channel) + '</td>'
        + '<td>' + toCell(data?.successRatePct) + '</td>'
        + '<td>' + toCell(data?.timeoutRatePct) + '</td>'
        + '<td>' + toCell(data?.httpErrorRatePct) + '</td>'
        + '<td>' + toCell(data?.latencyWorstP95Ms) + '</td>'
        + '<td>' + toCell(data?.contractErrors) + '</td>'
        + '</tr>';
    }
  }
  html += '</tbody>';
  table.innerHTML = html;
}

function renderCorrelationTable() {
  const table = document.getElementById('corr-table');
  const rows = DATA.correlations || [];
  let html = '<thead><tr><th>Incident</th><th>Status</th><th>Severity</th><th>Resolved At</th><th>Postmortem</th><th>Age (h)</th><th>SLA Breach</th></tr></thead><tbody>';
  if (!rows.length) {
    html += '<tr><td colspan="7">No connector incidents tracked</td></tr>';
  } else {
    for (const row of rows) {
      html += '<tr>'
        + '<td>' + toCell(row.incidentId) + '</td>'
        + '<td>' + toCell(row.status) + '</td>'
        + '<td>' + toCell(row.severity) + '</td>'
        + '<td>' + toCell(row.resolvedAt) + '</td>'
        + '<td>' + (row.postmortemExists ? 'linked' : 'missing') + '</td>'
        + '<td>' + toCell(row.ageHours) + '</td>'
        + '<td>' + (row.postmortemSlaBreached ? '<span class="status-fail">YES</span>' : 'no') + '</td>'
        + '</tr>';
    }
  }
  html += '</tbody>';
  table.innerHTML = html;
}

function renderViolations() {
  const list = document.getElementById('violations');
  const rows = DATA.violations || [];
  if (!rows.length) {
    list.innerHTML = '<li>none</li>';
    return;
  }
  list.innerHTML = rows.map((item) => '<li><strong>' + toCell(item.code) + '</strong>: ' + toCell(item.message) + '</li>').join('');
}

renderEnvironmentTable();
renderFilterOptions();
renderConnectorTable(document.getElementById('env-filter').value || 'all');
renderCorrelationTable();
renderViolations();
