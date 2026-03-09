import fs from 'node:fs/promises';
import path from 'node:path';

const envBool = (k, d) => {
  const v = process.env[k];
  return v ? ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()) : d;
};
const envInt = (k, d) => {
  const v = parseInt(process.env[k] || '', 10);
  return Number.isFinite(v) ? v : d;
};
const parseMs = (v) => {
  const n = Date.parse(String(v || ''));
  return Number.isFinite(n) ? n : NaN;
};
const ageMin = (v, nowMs) => {
  const ts = parseMs(v);
  return Number.isFinite(ts) ? Math.round(((nowMs - ts) / 60000) * 100) / 100 : null;
};
const sev = (v) => {
  const s = String(v || '').toLowerCase();
  if (['critical', 'error', 'fail', 'fatal'].includes(s)) return 'critical';
  if (['warning', 'warn', 'degraded'].includes(s)) return 'warning';
  return 'info';
};
const existsNum = (v) => Number.isFinite(Number(v));

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function readJsonl(filePath) {
  try {
    return (await fs.readFile(filePath, 'utf-8'))
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        try {
          return JSON.parse(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function writeText(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, payload, 'utf-8');
}

async function appendJsonl(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

function nEvent(x, env) {
  return {
    id: String(x?.id || ''),
    timestamp: x?.timestamp || x?.generatedAt || null,
    source: String(x?.source || 'unknown').toLowerCase(),
    environment: String(x?.environment || x?.metadata?.environment || env || 'unknown').toLowerCase(),
    severity: sev(x?.severity || x?.status),
    status: String(x?.status || 'unknown').toLowerCase(),
    type: String(x?.type || 'event').toLowerCase(),
    code: String(x?.code || ''),
    message: String(x?.message || x?.code || x?.type || 'event'),
  };
}

function nSla(x, env) {
  return {
    timestamp: x?.timestamp || x?.generatedAt || null,
    environment: String(x?.environment || env || 'unknown').toLowerCase(),
    status: String(x?.status || 'unknown').toLowerCase(),
    availabilityPct: existsNum(x?.availabilityPct) ? Number(x.availabilityPct) : null,
    worstLatencyMs: existsNum(x?.worstLatencyMs) ? Number(x.worstLatencyMs) : null,
    observedPayloadAgeMinutes: existsNum(x?.observedPayloadAgeMinutes) ? Number(x.observedPayloadAgeMinutes) : null,
    blockingViolations: existsNum(x?.blockingViolations) ? Number(x.blockingViolations) : null,
  };
}

function renderHtml(data) {
  const safe = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Ops Panel</title><style>body{font:14px/1.35 "Space Grotesk","Segoe UI",sans-serif;margin:0;background:#f2f5f1;color:#15201d}main{max-width:1200px;margin:0 auto;padding:14px}.h{background:linear-gradient(115deg,#0f3b2e,#1e5946);color:#eaf5ef;border-radius:12px;padding:12px;margin-bottom:8px}.h h1{margin:0 0 4px;font-size:21px}.c{background:#fff;border:1px solid #d7dfda;border-radius:10px;padding:8px;margin-bottom:8px}.r{display:flex;gap:8px;flex-wrap:wrap;align-items:center}label{font-size:12px;color:#5f6f69;font-weight:700}input,select,button{border:1px solid #d7dfda;border-radius:7px;padding:6px 8px;font:inherit}button{background:#e4ece7;font-weight:700;cursor:pointer}.s{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:7px;margin-bottom:8px}.k{background:#fff;border:1px solid #d7dfda;border-radius:9px;padding:7px}.k b{display:block;font-size:11px;color:#5f6f69;text-transform:uppercase}.k span{font-size:19px;font-weight:700}.g{display:grid;grid-template-columns:2fr 1fr;gap:8px}.p{max-height:420px;overflow:auto;border:1px solid #d7dfda;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #ecf0ee;padding:6px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#f7faf8}.critical{color:#b02631;font-weight:700}.warning{color:#965f00;font-weight:700}.info{color:#1d6d4f;font-weight:700}pre{background:#101714;color:#c2dacd;border:1px solid #2d3c36;border-radius:9px;min-height:70px;max-height:120px;overflow:auto;padding:8px;font:12px "Consolas",monospace;white-space:pre-wrap}.ok{color:#1d6d4f;font-weight:700}.warn{color:#965f00;font-weight:700}.err{color:#b02631;font-weight:700}@media(max-width:920px){.g{grid-template-columns:1fr}}</style></head><body><main><section class="h"><h1>Realtime Observability Operations Panel</h1><div>Generated: <strong id="gen"></strong> | Status: <strong id="st"></strong></div></section><section id="stats" class="s"></section><section class="c"><div class="r"><label>API</label><input id="api" size="28"/><label>Admin key</label><input id="key" type="password" size="14"/><label>Role</label><select id="role"><option value="operator">operator</option><option value="executive">executive</option><option value="admin">admin</option></select><label>Limit</label><input id="lim" type="number" min="1" max="1000" value="200" style="width:84px"/><button id="connect">Connect SSE</button><button id="stop">Stop</button><button id="sla">Refresh SLA</button><label><input id="auto" type="checkbox" checked/>auto</label><span id="conn" class="warn">DISCONNECTED</span><span>last event: <span id="last">n/a</span></span></div><div class="r"><label><input id="c" type="checkbox" checked/>critical</label><label><input id="w" type="checkbox" checked/>warning</label><label><input id="i" type="checkbox" checked/>info</label><label>source</label><select id="src"></select><label>env</label><select id="env"></select><label>period</label><select id="per"><option value="15m">15m</option><option value="1h">1h</option><option value="6h">6h</option><option value="24h" selected>24h</option><option value="7d">7d</option><option value="all">all</option></select><label>search</label><input id="q" size="22"/></div></section><section class="g"><section class="c"><b>Timeline</b><div class="p"><table><thead><tr><th>Timestamp</th><th>Severity</th><th>Source</th><th>Env</th><th>Type</th><th>Status</th><th>Message</th></tr></thead><tbody id="ev"></tbody></table></div></section><section class="c"><b>API SLA</b><div class="p"><table><thead><tr><th>Timestamp</th><th>Env</th><th>Status</th><th>Avail%</th><th>Latency</th><th>Payload age</th><th>Blocking</th></tr></thead><tbody id="slaBody"></tbody></table></div></section></section><pre id="log"></pre></main><script>const D=${safe};const q=(id)=>document.getElementById(id);const l=(v)=>String(v||'').trim().toLowerCase();const t=(v)=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null};const p={\"15m\":900000,\"1h\":3600000,\"6h\":21600000,\"24h\":86400000,\"7d\":604800000,all:Number.POSITIVE_INFINITY};const txt=(v)=>(v===null||v===undefined||v==='')?'n/a':String(v);const sv=(v)=>{const s=l(v);if(['critical','error','fail','fatal'].includes(s))return'critical';if(['warning','warn','degraded'].includes(s))return'warning';return'info'};let ev=Array.isArray(D?.bootstrap?.events)?D.bootstrap.events.slice():[];let sla=Array.isArray(D?.bootstrap?.slaHistory)?D.bootstrap.slaHistory.slice():[];let es=null;function log(m){const n=q('log');n.textContent+='['+new Date().toISOString()+'] '+m+'\\n';n.scrollTop=n.scrollHeight}function setConn(cls,msg){const n=q('conn');n.className=cls;n.textContent=msg}function ne(x){return{id:String(x?.id||''),timestamp:x?.timestamp||x?.generatedAt||null,source:l(x?.source)||'unknown',environment:l(x?.environment||x?.metadata?.environment||D?.summary?.defaultEnvironment)||'unknown',severity:sv(x?.severity||x?.status),status:l(x?.status)||'unknown',type:l(x?.type)||'event',code:String(x?.code||''),message:String(x?.message||x?.code||x?.type||'event')}}function ns(x){return{timestamp:x?.timestamp||x?.generatedAt||null,environment:l(x?.environment||D?.summary?.defaultEnvironment)||'unknown',status:l(x?.status)||'unknown',availabilityPct:Number.isFinite(Number(x?.availabilityPct))?Number(x.availabilityPct):null,worstLatencyMs:Number.isFinite(Number(x?.worstLatencyMs))?Number(x.worstLatencyMs):null,observedPayloadAgeMinutes:Number.isFinite(Number(x?.observedPayloadAgeMinutes))?Number(x.observedPayloadAgeMinutes):null,blockingViolations:Number.isFinite(Number(x?.blockingViolations))?Number(x.blockingViolations):null}}function up(raw){const e=ne(raw);const i=ev.findIndex((x)=>String(x.id||'')===String(e.id||''));if(e.id&&i>=0)ev[i]=e;else ev.push(e);ev.sort((a,b)=>(t(b.timestamp)||0)-(t(a.timestamp)||0));if(ev.length>4000)ev=ev.slice(0,4000)}function fill(){const src=['all',...Array.from(new Set(ev.map((x)=>l(x?.source)||'unknown'))).sort()];const env=['all',...Array.from(new Set([...ev.map((x)=>l(x?.environment)),...sla.map((x)=>l(x?.environment))].filter(Boolean))).sort()];const cs=l(q('src').value||'all');const ce=l(q('env').value||'all');q('src').innerHTML=src.map((x)=>'<option value=\"'+x+'\">'+x+'</option>').join('');q('env').innerHTML=env.map((x)=>'<option value=\"'+x+'\">'+x+'</option>').join('');q('src').value=src.includes(cs)?cs:'all';q('env').value=env.includes(ce)?ce:'all'}function allowPeriod(iso){const k=l(q('per').value||'24h');const max=p[k]??p['24h'];if(!Number.isFinite(max))return true;const n=t(iso);if(!Number.isFinite(n))return true;return n>=Date.now()-max}function fEv(){const set=new Set();if(q('c').checked)set.add('critical');if(q('w').checked)set.add('warning');if(q('i').checked)set.add('info');const src=l(q('src').value||'all');const env=l(q('env').value||'all');const term=l(q('q').value||'');return ev.map(ne).filter((x)=>set.has(x.severity)).filter((x)=>src==='all'||x.source===src).filter((x)=>env==='all'||x.environment===env).filter((x)=>allowPeriod(x.timestamp)).filter((x)=>!term||[x.id,x.source,x.environment,x.type,x.status,x.code,x.message].join(' ').toLowerCase().includes(term))}function fSla(){const env=l(q('env').value||'all');return sla.map(ns).filter((x)=>env==='all'||x.environment===env).filter((x)=>allowPeriod(x.timestamp))}function render(){fill();const e=fEv();const h=fSla();const c={critical:e.filter((x)=>x.severity==='critical').length,warning:e.filter((x)=>x.severity==='warning').length,info:e.filter((x)=>x.severity==='info').length};const latest=h[0]||null;q('stats').innerHTML=[[\"Events\",e.length],[\"Critical\",c.critical],[\"Warning\",c.warning],[\"Info\",c.info],[\"Sources\",new Set(e.map((x)=>x.source)).size],[\"Environments\",new Set(e.map((x)=>x.environment)).size],[\"SLA points\",h.length],[\"Latest avail\",latest&&latest.availabilityPct!==null?latest.availabilityPct+'%':'n/a']].map((x)=>'<article class=\"k\"><b>'+x[0]+'</b><span>'+txt(x[1])+'</span></article>').join('');q('ev').innerHTML=e.slice(0,500).map((x)=>'<tr><td>'+txt(x.timestamp)+'</td><td class=\"'+x.severity+'\">'+txt(x.severity)+'</td><td>'+txt(x.source)+'</td><td>'+txt(x.environment)+'</td><td>'+txt(x.type)+'</td><td>'+txt(x.status)+'</td><td>'+txt(x.message)+'</td></tr>').join('')||'<tr><td colspan=\"7\">No events</td></tr>';q('slaBody').innerHTML=h.slice(0,300).map((x)=>'<tr><td>'+txt(x.timestamp)+'</td><td>'+txt(x.environment)+'</td><td>'+txt(x.status)+'</td><td>'+txt(x.availabilityPct)+'</td><td>'+txt(x.worstLatencyMs)+'</td><td>'+txt(x.observedPayloadAgeMinutes)+'</td><td>'+txt(x.blockingViolations)+'</td></tr>').join('')||'<tr><td colspan=\"7\">No SLA points</td></tr>'}function cfg(){return{api:String(q('api').value||'').trim().replace(/\\/+$/,''),key:String(q('key').value||''),role:l(q('role').value||'operator')||'operator',lim:Math.max(1,Math.min(1000,Number(q('lim').value||200)))}}function stop(){if(es){es.close();es=null}setConn('warn','DISCONNECTED')}function connect(){stop();const c=cfg();const u=new URL('/api/observability/connectors/stream',c.api||'http://127.0.0.1:3000');u.searchParams.set('limit',String(c.lim));u.searchParams.set('role',c.role);if(c.key)u.searchParams.set('adminKey',c.key);log('SSE connect '+u.toString());try{es=new EventSource(u.toString())}catch(err){setConn('err','ERROR');log(String(err));return}es.onopen=()=>{setConn('ok','CONNECTED');log('SSE connected')};es.onerror=()=>{setConn('err','ERROR');log('SSE error')};es.addEventListener('snapshot',(e)=>{try{const p=JSON.parse(e.data||'{}');const arr=Array.isArray(p.events)?p.events:[];for(const it of arr)up(it);render();log('snapshot '+arr.length)}catch(err){log('snapshot parse '+String(err))}});es.addEventListener('event',(e)=>{try{up(JSON.parse(e.data||'{}'));q('last').textContent=new Date().toISOString();render()}catch(err){log('event parse '+String(err))}});es.addEventListener('heartbeat',()=>{q('last').textContent=new Date().toISOString()});es.addEventListener('end',()=>{log('stream ended');stop()})}async function getJson(url,c){const h={'x-observability-role':c.role||'operator'};if(c.key)h['x-admin-key']=c.key;const r=await fetch(url,{headers:h});const b=await r.text();try{return{st:r.status,data:JSON.parse(b)}}catch{return{st:r.status,data:null}}}async function refreshSla(){const c=cfg();const base=c.api||'http://127.0.0.1:3000';try{const r=await getJson(new URL('/api/observability/connectors/api-sla/history?limit=500',base).toString(),c);if(r.st!==200||!Array.isArray(r?.data?.entries)){log('SLA status '+r.st);return}const m=new Map();for(const x of sla.map(ns))m.set((x.timestamp||'na')+'::'+(x.environment||'na'),x);for(const x of r.data.entries.map(ns))m.set((x.timestamp||'na')+'::'+(x.environment||'na'),x);sla=[...m.values()].sort((a,b)=>(t(b.timestamp)||0)-(t(a.timestamp)||0));if(sla.length>4000)sla=sla.slice(0,4000);render();log('SLA refreshed '+r.data.entries.length)}catch(err){log('SLA error '+String(err))}}q('gen').textContent=txt(D.generatedAt);q('st').textContent=txt(D.status).toUpperCase();q('api').value=D?.api?.baseDefault||'http://127.0.0.1:3000';q('role').value=D?.api?.defaultRole||'operator';q('lim').value=String(D?.api?.defaultLimit||200);q('connect').addEventListener('click',connect);q('stop').addEventListener('click',stop);q('sla').addEventListener('click',refreshSla);for(const id of ['c','w','i','src','env','per','q']){q(id).addEventListener('change',render);q(id).addEventListener('input',render)}render();log('panel booted events='+ev.length+' sla='+sla.length);setInterval(()=>{if(q('auto').checked)refreshSla()},30000);</script></body></html>`;
}

async function main() {
  const ts = new Date().toISOString();
  const nowMs = Date.now();
  const cfg = {
    streamStateFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-stream-state.json'),
    streamEventsFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-stream-events.jsonl'),
    streamReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-realtime-report.json'),
    alertReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-alerting-report.json'),
    apiSlaHistoryFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-sla-history.json'),
    panelReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-panel-report.json'),
    panelDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-ops-panel.html'),
    panelAuditFile: process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-panel-audit.jsonl'),
    apiBaseDefault: (process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_API_BASE || process.env.FULLCYCLE_CONNECTOR_OBS_API_BASE || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    defaultEnv: String(process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_DEFAULT_ENVIRONMENT || process.env.FULLCYCLE_CONNECTOR_ENVIRONMENT || 'unknown').toLowerCase(),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS', false),
    requireStreamPass: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS', true),
    requireAlertingPass: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS', true),
    requireApiSlaHistory: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY', true),
    minSlaPoints: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS', 5)),
    minEvents: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_EVENTS', 1)),
    maxStreamAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_STREAM_AGE_MIN', 240)),
    maxSlaAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_SLA_AGE_MIN', 240)),
  };

  const [streamState, streamReport, alertReport, slaPayload, eventsRaw] = await Promise.all([
    readJson(cfg.streamStateFile, null),
    readJson(cfg.streamReportFile, null),
    readJson(cfg.alertReportFile, null),
    readJson(cfg.apiSlaHistoryFile, null),
    readJsonl(cfg.streamEventsFile),
  ]);

  const events = eventsRaw.map((x) => nEvent(x, cfg.defaultEnv));
  const slaHistory = (Array.isArray(slaPayload?.history) ? slaPayload.history : []).map((x) => nSla(x, cfg.defaultEnv));
  const streamStatus = String(streamReport?.status || streamState?.status || 'unknown').toLowerCase();
  const alertStatus = String(alertReport?.status || 'unknown').toLowerCase();
  const streamAgeMinutes = ageMin(streamReport?.generatedAt || streamState?.generatedAt || events[events.length - 1]?.timestamp, nowMs);
  const slaAgeMinutes = ageMin(slaHistory[slaHistory.length - 1]?.timestamp, nowMs);

  const violations = [];
  if (!streamReport) violations.push({ code: 'stream_report_missing', blocking: true, message: `missing ${cfg.streamReportFile}` });
  if (!alertReport) violations.push({ code: 'alert_report_missing', blocking: true, message: `missing ${cfg.alertReportFile}` });
  if (cfg.requireStreamPass && streamStatus !== 'pass') violations.push({ code: 'stream_not_pass', blocking: true, message: `stream status=${streamStatus}` });
  if (cfg.requireAlertingPass && alertStatus !== 'pass') violations.push({ code: 'alerting_not_pass', blocking: true, message: `alerting status=${alertStatus}` });
  if (cfg.requireApiSlaHistory && !slaPayload) violations.push({ code: 'api_sla_missing', blocking: true, message: `missing ${cfg.apiSlaHistoryFile}` });
  if (slaHistory.length < cfg.minSlaPoints) violations.push({ code: 'api_sla_insufficient_points', blocking: true, message: `sla points=${slaHistory.length} expected>=${cfg.minSlaPoints}` });
  if (events.length < cfg.minEvents) violations.push({ code: 'stream_events_insufficient_points', blocking: true, message: `events=${events.length} expected>=${cfg.minEvents}` });
  if (Number.isFinite(streamAgeMinutes) && streamAgeMinutes > cfg.maxStreamAgeMinutes) violations.push({ code: 'stream_stale', blocking: true, message: `stream age=${streamAgeMinutes}min max=${cfg.maxStreamAgeMinutes}` });
  if (Number.isFinite(slaAgeMinutes) && slaAgeMinutes > cfg.maxSlaAgeMinutes) violations.push({ code: 'api_sla_stale', blocking: true, message: `sla age=${slaAgeMinutes}min max=${cfg.maxSlaAgeMinutes}` });

  const blocking = violations.filter((x) => x.blocking);
  const status = blocking.length > 0 ? (cfg.enforceTargets ? 'fail' : 'warn') : 'pass';
  const summary = {
    defaultEnvironment: cfg.defaultEnv,
    streamStatus,
    alertingStatus: alertStatus,
    streamCursor: existsNum(streamState?.cursor) ? Number(streamState.cursor) : null,
    events: events.length,
    streamAgeMinutes,
    slaPoints: slaHistory.length,
    slaAgeMinutes,
    violations: violations.length,
    blockingViolations: blocking.length,
  };

  const report = { generatedAt: ts, status, summary, config: cfg, violations };
  await writeJson(cfg.panelReportFile, report);
  await writeText(cfg.panelDashboardFile, renderHtml({
    generatedAt: ts,
    status,
    summary,
    api: { baseDefault: cfg.apiBaseDefault, defaultRole: 'operator', defaultLimit: Math.min(500, Math.max(50, events.length || 200)) },
    bootstrap: { events: events.slice(-1000), slaHistory: slaHistory.slice(-1000) },
  }));
  await appendJsonl(cfg.panelAuditFile, { timestamp: ts, source: 'phase29-observability-realtime-panel', status, summary, violations, panelReportFile: cfg.panelReportFile, panelDashboardFile: cfg.panelDashboardFile });

  console.log(`Observability panel report: ${cfg.panelReportFile}`);
  console.log(`Observability panel dashboard: ${cfg.panelDashboardFile}`);
  console.log(`Observability panel audit: ${cfg.panelAuditFile}`);
  console.log(`[OBS-PANEL] status=${status} events=${events.length} slaPoints=${slaHistory.length} violations=${violations.length}`);
  if (status === 'fail') {
    for (const item of blocking) console.error(`[OBS-PANEL] ${item.code}: ${item.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase29 observability panel failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
