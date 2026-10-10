// FIRE Manager — phone app shell: storage on this phone, events, refresh, backups, offline updates.
import {runAction, ActionError, parseAny, ImportProblem, toExport, summary, emptyState, todayISO, parseFx, parsePriceFile} from './core.js';
import {renderTab, firstRun} from './views.js';

export const VERSION = '1.0.0+02e62b';
const KEY = 'fire.state.v2', META = 'fire.meta.v1', SNAP = 'fire.snap.';
const FX_URL = 'https://api.frankfurter.dev/v1/latest?from=EUR&to=PLN,USD';
const root = document.getElementById('root');
let tab = 'dash', params = {}, charts = {}, updateReady = null;

// ---------- storage (this phone only) ----------
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { localStorage.setItem(k, v); },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  keys() { try { return Object.keys(localStorage); } catch (_) { return []; } },
};
function loadState() { const r = ls.get(KEY); return r ? JSON.parse(r) : null; }
function saveState(S) {
  const today = todayISO();
  if (!ls.get(SNAP + today)) {                       // one automatic snapshot per day, of the state before today's first change
    const prev = ls.get(KEY); if (prev) ls.set(SNAP + today, prev);
    ls.keys().filter(k => k.startsWith(SNAP)).sort().reverse().slice(7).forEach(k => ls.del(k));
  }
  ls.set(KEY, JSON.stringify(S));
}
function meta() { try { return JSON.parse(ls.get(META) || '{}'); } catch (_) { return {}; } }
function setMeta(patch) { ls.set(META, JSON.stringify({...meta(), ...patch})); }
let persisted = false;
async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch (_) {}
}

// ---------- UI helpers ----------
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 4000); }
function viewMeta() {
  const m = meta(), last = m.lastExport ? new Date(m.lastExport) : null;
  return {...m, persisted, version: VERSION, updateReady: !!updateReady,
    backupDue: !last || (Date.now() - last.getTime()) > 7 * 864e5,
    snapshots: ls.keys().filter(k => k.startsWith(SNAP)).map(k => k.slice(SNAP.length)).sort().reverse()};
}
function render() {
  const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null, y = window.scrollY;
  const S = loadState();
  root.innerHTML = S ? renderTab(tab, S, todayISO(), viewMeta(), params) : firstRun().s;
  mount(); window.scrollTo(0, y);
  if (key) { const el = root.querySelector(`[data-key="${CSS.escape(key)}"]`); if (el) el.focus(); }
  try { history.replaceState(null, '', '#' + new URLSearchParams({tab, ...params}).toString()); } catch (_) {}
}
function act(name, args) {
  const S = loadState();
  try {
    const msg = runAction(S, name, args, todayISO());
    saveState(S);
    if (msg) toast(msg);
    return true;
  } catch (e) {
    toast('⚠ ' + (e instanceof ActionError ? e.message : 'Something went wrong: ' + e.message));
    return false;
  } finally { render(); }
}
const readParams = () => root.querySelectorAll('[data-param]').forEach(el => { params[el.dataset.param] = el.value.trim(); });

// ---------- events ----------
root.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.param !== undefined) { params[el.dataset.param] = el.value.trim(); if (el.dataset.autoapply !== undefined) render(); return; }
  const a = el.closest('[data-act]'); if (!a) return;
  const d = {...a.dataset}; delete d.act; delete d.key;
  act(a.dataset.act, {...d, value: a.type === 'checkbox' ? a.checked : a.value});
});
root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.param !== undefined) { e.preventDefault(); readParams(); render(); } });
root.addEventListener('click', e => {
  const t = e.target.closest('button[data-tab]');
  if (t) { tab = t.dataset.tab; params = t.dataset.month ? {month: t.dataset.month} : {}; render(); window.scrollTo(0, 0); return; }
  const sp = e.target.closest('[data-setparams]');
  if (sp) { readParams(); Object.assign(params, JSON.parse(sp.dataset.setparams)); render(); return; }
  if (e.target.closest('[data-apply-params]')) { readParams(); render(); return; }
  const b = e.target.closest('[data-click]');
  if (b) {
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    const d = {...b.dataset}; delete d.click; delete d.confirm;
    if (b.dataset.collect !== undefined) b.closest('[data-form]').querySelectorAll('[data-name]').forEach(el => { d[el.dataset.name] = el.value; });
    const ok = act(b.dataset.click, d);
    if (ok && b.dataset.clearparam) { params[b.dataset.clearparam] = ''; render(); }
    return;
  }
  const c = e.target.closest('[data-cmd]');
  if (c && CMDS[c.dataset.cmd]) CMDS[c.dataset.cmd](c);
});

// ---------- commands ----------
async function getJSON(url) {
  const r = await fetch(url, {cache: 'no-store'});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const CMDS = {
  async refresh() {
    if (!navigator.onLine) { toast('⚠ No internet right now — prices kept as they are.'); return; }
    document.querySelectorAll('.refbtn').forEach(x => { x.disabled = true; x.textContent = 'Fetching…'; });
    const S = loadState(), stamp = new Date().toISOString().slice(0, 16), results = [];
    try { const v = parsePriceFile(await getJSON('./price.json')); Object.assign(S.market, v, {fetchedAt: stamp}); results.push({ok: true, msg: `VWCE €${v.price.toFixed(2)} (${v.asOf})`}); }
    catch (e) { results.push({ok: false, msg: `VWCE fetch failed (${e.message}) — kept €${S.market.price} from ${S.market.asOf}`}); }
    try { const f = parseFx(await getJSON(FX_URL)); Object.assign(S.fx, f, {fetchedAt: stamp}); results.push({ok: true, msg: `EUR/PLN ${f.EURPLN.toFixed(4)} (${f.asOf})`}); }
    catch (e) { results.push({ok: false, msg: `FX fetch failed (${e.message}) — kept EUR/PLN ${S.fx.EURPLN} from ${S.fx.asOf}`}); }
    saveState(S); setMeta({lastRefresh: {at: stamp, results}});
    toast('Refreshed: ' + results.map(r => r.msg).join(' · ')); render();
  },
  export() {
    const S = loadState(); if (!S) return;
    const blob = new Blob([JSON.stringify(toExport(S), null, 1)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `fire-backup-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setMeta({lastExport: new Date().toISOString()}); toast('Backup saved to Downloads.'); render();
  },
  import() { document.getElementById('importFile').click(); },
  startEmpty() { if (confirm('Start with an empty app? You can import a backup later in Settings.')) { saveState(emptyState(todayISO())); render(); } },
  restoreSnap(btn) {
    const k = SNAP + btn.dataset.snap, raw = ls.get(k); if (!raw) return;
    if (!confirm(`Go back to how things were on ${btn.dataset.snap}? (Changes since then are lost unless you saved a backup.)`)) return;
    ls.set(KEY, raw); toast('Restored.'); render();
  },
  applyUpdate() { if (updateReady) { updateReady.postMessage('skipWaiting'); } },
};
document.getElementById('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let S;
  try { S = parseAny(JSON.parse(await f.text())); }
  catch (err) { toast('⚠ Import failed: ' + (err instanceof ImportProblem ? err.message : 'not a valid backup file')); return; }
  const s = summary(S), had = !!loadState();
  if (!confirm(`File contains: ${s.accounts} accounts, ${s.lots} purchases, ${s.goals} goals, ${s.budgetMonths} budget months.\n\n${had ? 'This REPLACES what is on this phone (today\'s snapshot keeps the old data for undo). Continue?' : 'Import it?'}`)) return;
  if (had) ls.set(SNAP + todayISO() + '-before-import', ls.get(KEY));
  ls.set(KEY, JSON.stringify(S)); setMeta({lastExport: meta().lastExport || null});
  toast('Imported ✓'); tab = 'dash'; params = {}; render();
});

// ---------- charts ----------
const fmtShort = (v, ccy) => (ccy === 'EUR' ? '€' : ccy === 'USD' ? 'US$' : 'PLN ') + new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0}).format(v);
function mount() {
  Object.values(charts).forEach(ch => ch.destroy()); charts = {};
  if (typeof Chart === 'undefined') return;
  const pEl = document.getElementById('projChart'), pD = document.getElementById('projData');
  if (pEl && pD) {
    const d = JSON.parse(pD.textContent);
    charts.proj = new Chart(pEl, {type: 'line', data: {labels: d.labels, datasets: [
      {label: 'Projected portfolio', data: d.portfolio, borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,.08)', fill: true, tension: .25, pointRadius: 0, borderWidth: 2},
      {label: 'Target lifestyle', data: d.labels.map(() => d.target), borderColor: '#d97706', borderDash: [6, 5], pointRadius: 0, borderWidth: 1.5, fill: false},
      {label: 'Current lifestyle', data: d.labels.map(() => d.current), borderColor: '#64748b', borderDash: [3, 4], pointRadius: 0, borderWidth: 1.5, fill: false}]},
      options: {responsive: true, maintainAspectRatio: false, animation: false, plugins: {legend: {display: false}, tooltip: {callbacks: {label: x => x.dataset.label + ': ' + fmtShort(x.parsed.y, d.ccy)}}},
        interaction: {intersect: false, mode: 'index'}, scales: {y: {ticks: {callback: v => fmtShort(v, d.ccy)}}, x: {title: {display: true, text: 'age'}, grid: {display: false}, ticks: {maxRotation: 0, autoSkipPadding: 10}}}}});
  }
  const dEl = document.getElementById('donut'), dD = document.getElementById('donutData');
  if (dEl && dD) {
    const d = JSON.parse(dD.textContent), base = {invest: [15, 118, 110], save: [37, 99, 235], spend: [148, 163, 184], none: [226, 232, 240]}, seen = {};
    const colors = d.kinds.map(k => { const n = seen[k] = (seen[k] || 0) + 1, c = base[k] || base.none, a = k === 'none' ? 1 : Math.max(0.35, 1 - (n - 1) * 0.18); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; });
    const keep = d.values.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);
    charts.donut = new Chart(dEl, {type: 'doughnut', data: {labels: keep.map(i => d.labels[i]), datasets: [{data: keep.map(i => d.values[i]), backgroundColor: keep.map(i => colors[i]), borderWidth: 1}]},
      options: {responsive: true, maintainAspectRatio: false, animation: false, plugins: {legend: {position: 'right', labels: {boxWidth: 12, font: {size: 11}}}, tooltip: {callbacks: {label: x => x.label + ': ' + fmtShort(x.parsed, 'PLN')}}}}});
  }
}

// ---------- offline + updates ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { updateReady = w; toast('A new version is ready — Settings → Install the new version.'); render(); } });
    if (reg.waiting && navigator.serviceWorker.controller) { updateReady = reg.waiting; }
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

// ---------- start ----------
try { const h = new URLSearchParams(location.hash.slice(1)); if (h.get('tab')) { tab = h.get('tab'); h.delete('tab'); params = Object.fromEntries(h); } } catch (_) {}
askPersist().then(render);
render();
