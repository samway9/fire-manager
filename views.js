// Screens. Every ${value} is HTML-escaped unless wrapped in raw() — same safety as the PC app's Jinja autoescape.
import {Calc, num, fmt, fmtN, monthLabel, dayLabel, monthKey, addMonths, inputValue, parseDate, advise, daysLeft, forecastLines,
        COOLING_OFF_DAYS, MIN_REASON, CCYS, daysBetween} from './core.js';

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s));
const ESC = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ESC[ch]);
const val = x => x instanceof Raw ? x.s : Array.isArray(x) ? x.map(val).join('') : (x === null || x === undefined || x === false) ? '' : esc(x);
export function html(strings, ...vals) { let o = strings[0]; vals.forEach((x, i) => { o += val(x) + strings[i + 1]; }); return new Raw(o); }

export const TABS = [['dash', 'Home'], ['budget', 'Budget'], ['advice', 'Advice'], ['invest', 'Invest'], ['goals', 'Goals'],
                     ['accounts', 'Accounts'], ['policy', '🔒 Policy'], ['settings', 'Settings']];
const P = v => fmt(v, 'PLN', 0);
const pct = (a, b) => b > 0 ? fmtN(a / b * 100, 0) + '%' : '—';
const sel = (cond) => cond ? raw(' selected') : '';
const opts = (list, cur) => list.map(o => html`<option${sel(o === cur)}>${o}</option>`);
function ccySelect(cur, attrs) { return html`<select ${raw(attrs)}>${opts(CCYS, cur)}</select>`; }
const da = (name, v) => raw(` data-${name}="${esc(v)}"`);   // safe data attribute

function paydaySteps(p, compact = false) {
  return html`<table class="steps">
    ${p.steps.map((st, i) => html`<tr><td class="stepn">${i + 1}</td>
      <td><b>${st.label}</b>${compact ? '' : html`<div class="sm mut">${st.names.join(' + ')}</div>`}
      ${st.shares !== undefined ? (st.shares > 0
        ? html`<div class="sm acc">then buy <b>≈ ${st.shares} VWCE shares</b> (€${fmtN(st.orderEUR, 2, true)}) — one order, with the €${fmtN(st.cashEUR, 0)} that will be in IBKR</div>`
        : html`<div class="sm mut">under 1 VWCE share — it stays in IBKR for next month's order</div>`) : ''}</td>
      <td class="rt b nowrap">${P(st.amt)}</td></tr>`)}
    <tr><td class="stepn">${p.steps.length + 1}</td><td><b>Keep for card spending</b> <span class="sm mut">in ${p.salName}</span>${compact ? '' : html`<div class="sm mut">${p.keep.names.join(' + ')}</div>`}</td>
      <td class="rt b nowrap">${P(p.keep.amt)}</td></tr>
  </table>
  ${(p.fromPots || []).map(x => html`<div class="sm mut">🐷 Paid from ${x.account} (no transfer needed): ${x.name} ${P(x.amt)}</div>`)}
  ${p.left < -0.5 ? html`<div class="flag f-red">Over-allocated by ${P(-p.left)}.</div>` : p.left > 0.5 ? html`<div class="flag f-amber">${P(p.left)} has no job yet.</div>` : ''}`;
}
const rulesBanner = () => html`<div class="rules"><b>Your fixed rules</b> (<button class="linkbtn" data-tab="policy">Investment Policy</button>): VWCE only (IE00BK5BQT80) · reserve first · lump sum when cash is available + monthly DCA · near-term goals from cash. This app applies them to your numbers — it never picks instruments and never offers a market view.</div>`;

function fireRows(c, pr) {
  const s = c.s, inv = c.investableRep();
  return [['target', 'Target retirement lifestyle', `${fmt(num(s.retireSpend), s.retireSpendCcy || 'EUR', 0)}/yr`],
          ['current', 'Current lifestyle', `${P(num(s.monthlySpendPLN))}/mo`]].map(([key, label, spend]) => {
    const number = pr.targets[key], ach = pr.achieve[key], onTrack = pr.atFire >= number;
    const badge = onTrack ? ['green', `✓ On track for ${s.fireAge}`]
      : (ach !== null && ach <= num(s.stretchAge)) ? ['amber', `~ Stretch: FI at ≈ ${ach.toFixed(1)}`]
      : ['red', '✗ Behind — FI ' + (ach !== null ? `at ≈ ${ach.toFixed(1)}` : 'not reached by 80')];
    return {key, label, spend, number, achieve: ach, pct: number > 0 ? inv / number : 0, badge};
  });
}
function marketCard(S, c, meta) {
  const stale = c.stale(S.market.asOf) || c.stale(S.fx.asOf), m = S.market, fx = S.fx;
  return html`<div class="card"><h2>Market data <span class="pill ${stale ? 'p-amber' : 'p-green'}">${stale ? 'may be stale' : 'fresh'}</span></h2>
    <table><tr><td>VWCE price</td><td class="rt b">€${fmtN(m.price, 2, true)}</td><td class="rt src">${m.source || '?'} · quote ${m.asOf || '?'}${m.fetchedAt ? ` · fetched ${m.fetchedAt.replace('T', ' ')}` : ''}</td></tr>
    <tr><td>EUR/PLN</td><td class="rt b">${fmtN(fx.EURPLN, 4)}</td><td class="rt src" rowspan="2">${fx.source || '?'} · ${fx.asOf || '?'}${fx.fetchedAt ? ` · fetched ${fx.fetchedAt.replace('T', ' ')}` : ''}</td></tr>
    <tr><td>USD/PLN</td><td class="rt b">${fmtN(fx.USDPLN, 4)}</td></tr></table>
    ${(meta.lastRefresh?.results || []).filter(r => !r.ok).map(r => html`<div class="flag f-red">${r.msg}</div>`)}
    <div class="frow"><button class="btn refbtn" data-cmd="refresh">↻ Refresh prices</button>
    <span class="sm mut">Needs internet. If a fetch fails, the old value is kept and you're told. You can also type prices in Settings.</span></div></div>`;
}

function outlookCard(c) {
  const f = c.forecast(), lines = forecastLines(c, f);
  return html`<div class="card" style="border-left:4px solid var(--blue)"><h2>Year-end outlook · ${f.end}</h2>
    <ul class="outlook">${lines.map(l => html`<li>${l}</li>`)}</ul>
    <div class="tablewrap"><table style="margin-top:6px"><tr><th>Month</th><th class="rt">Salary in</th><th class="rt">Spent</th><th class="rt">Invested</th><th class="rt">Cash at end</th></tr>
    ${f.rows.map(r => html`<tr><td>${monthLabel(r.k)}${r.planned ? '' : html` <span class="pill p-mut" style="font-size:10px">targets</span>`}</td>
      <td class="rt">${r.income ? P(r.income) : '—'}</td><td class="rt">${P(r.spend + r.potSpend)}</td>
      <td class="rt">${P(r.invested)}${r.sharesBought ? html` <span class="sm mut">(${r.sharesBought} sh)</span>` : ''}</td><td class="rt b">${P(r.cashEnd)}</td></tr>`)}</table></div>
    <details style="margin-top:8px"><summary>Accounts on ${f.end}</summary><table>${f.accounts.map(a => html`<tr><td>${a.name}</td><td class="rt b">${fmt(a.balance, a.ccy, 0)}</td></tr>`)}</table></details>
    <div class="sm mut" style="margin-top:6px">If you follow your Budget month by month. Prices and FX kept at today's values — plan arithmetic, not a market view. Change the Budget and this updates.</div></div>`;
}

// ---------- tabs ----------
function dash(S, c, meta, params) {
  const v = c.vwce(), rc = c.rc, oc = c.otherCcy(), nw = c.netWorthRep(), pr = c.projection();
  const nd = c.nextPayday(), k = monthKey(nd), plan = c.payday(k), days = daysBetween(c.today, nd);
  const efS = c.efTotalPln(), efT = num(c.s.efTargetPLN), liq = c.liquidEfPln(), liqT = num(c.s.liquidTargetPLN), locked = c.lockedEfPln();
  const efp = efT > 0 ? Math.min(1, efS / efT) : 0, lp = liqT > 0 ? Math.min(1, liq / liqT) : 1;
  const toOpen = S.accounts.filter(a => !Calc.counts(a)), funded = S.accounts.filter(a => Calc.counts(a));
  const upTo = num(c.s.stretchAge) + 5, pts = pr.pts.filter(p => p.age <= upTo);
  const chart = {labels: pts.map(p => Math.round(p.age)), portfolio: pts.map(p => Math.round(p.v)),
                 target: Math.round(pr.targets.target), current: Math.round(pr.targets.current), ccy: rc};
  const bar = (p, cls) => html`<div class="bar"><i class="${cls}" style="width:${(p * 100).toFixed(0)}%"></i></div>`;
  return html`
  ${meta.backupDue ? html`<div class="flag f-amber" style="margin:0">💾 Last backup: ${meta.lastExport ? meta.lastExport.slice(0, 10) : 'never'}. Your numbers live only on this phone — <button class="linkbtn" data-cmd="export">save a backup now</button>.</div>` : ''}
  ${c.expiringRates().filter(e => e.days <= 45).map(e => html`<div class="flag f-amber" style="margin:0">⏰ <b>${e.name}</b> — ${fmtN(e.rate, 2)}% on ${P(e.pln)} ${e.days > 0 ? `ends in ${e.days} days (${e.until})` : 'has ended'}. Decide: roll over, keep as reserve, or move what's above target to VWCE.</div>`)}
  <div class="card" style="border-left:4px solid var(--acc)">
    <div class="frow" style="margin:0 0 6px"><h2 style="margin:0">Next payday · ${dayLabel(nd)}</h2>
      <span class="pill ${days === 0 ? 'p-green' : 'p-acc'}">${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}</span>
      <button class="btn ghost" style="margin-left:auto" data-tab="budget"${da('month', k)}>Open ${monthLabel(k)} →</button></div>
    ${plan ? paydaySteps(plan, true) : html`<div class="flag f-info">${monthLabel(k)} has no budget yet. <button class="btn" style="margin-left:8px" data-click="bEnsure"${da('month', k)}>Set it up from my targets</button></div>`}
  </div>
  <div class="grid g4">
    <div class="card stat"><h2>Net worth</h2><div class="v">${fmt(nw, rc, 0)}</div><div class="s">${fmt(c.conv(nw, rc, oc), oc, 0)}</div></div>
    <div class="card stat"><h2>VWCE ${v.est ? html`<span class="pill p-amber">estimate</span>` : ''}</h2><div class="v">${fmt(c.rep(v.valE, 'EUR'), rc, 0)}</div><div class="s">${fmtN(v.sh, 2)} shares · avg €${fmtN(v.avg, 2, true)}</div></div>
    <div class="card stat"><h2>Cash</h2><div class="v">${fmt(c.conv(c.accTotalPln(), 'PLN', rc), rc, 0)}</div><div class="s">${funded.length} accounts${toOpen.length ? ` · ${toOpen.length} to open` : ''}</div></div>
    <div class="card stat"><h2>Unrealised gain</h2><div class="v ${v.gainE >= 0 ? 'green' : 'red'}">${fmt(c.rep(v.gainE, 'EUR'), rc, 0)}</div><div class="s">${v.costE > 0 ? fmtN(v.gainE / v.costE * 100, 1) + '%' : '—'}</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>Retirement at ${c.s.fireAge}</h2>
      <table><tr><td>Investable today <span class="sm mut">(VWCE + investable cash)</span></td><td class="rt b">${fmt(c.investableRep(), rc, 0)}</td></tr>
      <tr><td>Projected at ${c.s.fireAge} <span class="sm mut">(${fmtN(c.s.realReturn, 1)}% real, ${P(c.investPlanPln())}/mo)</span></td><td class="rt b">${fmt(pr.atFire, rc, 0)}</td></tr></table>
      ${fireRows(c, pr).map(f => html`<div class="lifestyle"><div class="frow" style="margin:0"><span class="b">${f.label}</span> <span class="sm mut">${f.spend}</span>
        <span class="pill p-${f.badge[0]}" style="margin-left:auto">${f.badge[1]}</span></div>
        ${bar(Math.min(1, f.pct), f.pct >= 1 ? 'g' : (f.key === 'target' ? 'a' : ''))}
        <div class="sm mut">FIRE number ${fmt(f.number, rc, 0)} (${c.s.multiplier}×) · ${fmtN(f.pct * 100, 1)}% reached today${f.achieve !== null ? ` · FI at ≈ ${f.achieve.toFixed(1)}` : ''}</div></div>`)}
      <div class="chartbox"><canvas id="projChart"></canvas></div>
      <script type="application/json" id="projData">${raw(JSON.stringify(chart).replace(/</g, '\\u003c'))}</script>
      <div class="legend"><span><i style="border-color:#0f766e"></i>projected portfolio</span><span><i class="dash" style="border-color:#d97706"></i>target lifestyle</span><span><i class="dash" style="border-color:#64748b"></i>current lifestyle</span></div>
      <div class="sm mut" style="margin-top:4px">Contribution comes from the Budget's invest line. Projection uses your Settings assumptions, not market predictions.</div></div>
    <div>
      <div class="card"><h2>Emergency fund</h2>
        <div class="big">${P(efS)} <span class="mut" style="font-size:13px;font-weight:600">of ${P(efT)}</span></div>
        ${bar(efp, efp >= 1 ? 'g' : efp >= 0.5 ? 'a' : 'r')}
        <div style="margin-top:10px"><div class="sm b">Instant-access ${P(liq)} <span class="mut" style="font-weight:600">of ${P(liqT)}</span>
          ${liq >= liqT ? html`<span class="pill p-green">✓</span>` : html`<span class="pill p-amber">short ${P(liqT - liq)}</span>`}</div>
          ${bar(lp, lp >= 1 ? 'g' : lp >= 0.5 ? 'a' : 'r')}
          ${locked > 0.5 ? html`<div class="sm mut">${P(locked)} of the reserve is locked and can't be withdrawn today.</div>` : ''}</div>
        <div class="sm mut" style="margin-top:6px">Counts accounts marked “Emergency fund” that hold money${toOpen.length ? ` · not counted (to open): ${toOpen.map(a => a.name).join(', ')}` : ''}</div></div>
      <div class="card" style="margin-top:12px"><h2>Cash accounts</h2><table>
        ${S.accounts.map(a => html`<tr><td>${a.name}${a.rate ? html` <span class="sm mut">${fmtN(a.rate, 2)}%</span>` : ''}${!Calc.counts(a) ? html` <span class="pill p-mut" style="font-size:10px">to open</span>` : ''}</td>
          <td class="rt nowrap"><input class="num inline" inputmode="decimal" value="${inputValue(a.balance)}" data-act="accSet"${da('id', a.id)} data-field="balance"${da('key', 'dash-bal-' + a.id)}> ${a.ccy}</td>
          <td class="rt mut">${fmt(c.conv(a.balance, a.ccy, rc), rc, 0)}</td></tr>`)}</table></div>
    </div>
  </div>
  ${outlookCard(c)}
  <div class="grid g2">
    <div class="card"><h2>Goals</h2>${S.goals.length ? html`<table>${S.goals.map(g => { const gc = c.goalCalc(g); return html`<tr><td>${g.name}</td>
      <td>${bar(gc.pct, gc.pct >= 1 ? 'g' : '')}</td><td class="rt">${fmt(gc.saved, g.ccy, 0)} / ${fmt(g.target, g.ccy, 0)}</td></tr>`; })}</table>` : html`<div class="mut">No goals yet.</div>`}</div>
    ${marketCard(S, c, meta)}
  </div>
  <details><summary>🌍 Relocation & tax flag (informational — not advice)</summary>
    <p><b>Where and when you sell matters more than what you hold.</b> Your VWCE plan doesn't change with location — the tax on it does.</p>
    <p><b>Poland (now):</b> 19% Belka tax on realised capital gains. Nothing due while you only hold.</p>
    <p><b>Netherlands (possible move):</b> Box 3 taxes deemed wealth — historically roughly ~2%/yr of portfolio value whether or not you sell. The regime is under reform — verify the current rules before any move.</p>
    <p><b>UAE (possible move):</b> currently 0% personal tax on capital gains. Exit taxes and residency rules apply.</p>
    <p class="amber"><b>→ Before relocating, consult a cross-border tax professional.</b> This card is a reminder, not tax advice.</p></details>`;
}

function advice(S, c, meta, params) {
  const cash = params.cash ?? '', ccy = params.ccy || 'PLN', result = cash !== '' ? advise(c, cash, ccy) : null;
  const inv = c.investableCashPln(), flt = c.floatPln(), infl = num(c.s.inflationPct), belka = num(c.s.belkaPct);
  const plan = c.monthlyPlanRows(), idle = c.idleCashPln(), base = c.fvContribPln(c.investPlanPln());
  const cashGoals = S.goals.filter(g => !g.autoEF && g.funding === 'cash'), pfGoals = S.goals.filter(g => !g.autoEF && g.funding === 'portfolio');
  let out = html`${rulesBanner()}
  <div class="card"><h2>Cash available to deploy right now</h2>
    <div class="frow" style="margin:0"><input class="num" inputmode="decimal" placeholder="amount" value="${cash}" data-param="cash" data-key="adv-cash">
      ${ccySelect(ccy, 'data-param="ccy"')}<button class="btn" data-apply-params>What should I do?</button>
      ${inv > 0.5 ? html`<button class="btn ghost" data-setparams="${JSON.stringify({cash: inv.toFixed(2), ccy: 'PLN'})}">Use my investable cash (${P(inv)})</button>` : ''}</div>
    ${flt > 0.5 ? html`<div class="sm mut" style="margin-top:6px">${P(flt)} kept in your salary account for this month's spending — excluded. Goal pots are excluded too.</div>` : ''}</div>`;
  if (result) {
    if (result.status !== 'ok') out = html`${out}<div class="card"><div class="flag f-amber">${result.ask}</div></div>`;
    else {
      const p = result.plan, efp = p.efT > 0 ? Math.min(1, p.efSaved / p.efT) : 0;
      out = html`${out}
      <div class="card" style="border-left:4px solid var(--acc)"><ol class="advice">${result.lines.map(l => html`<li>${l}</li>`)}</ol>
        ${result.warnings.map(w => html`<div class="flag f-amber">${w}</div>`)}
        <div class="sm mut" style="margin-top:6px">Computed from your data · FX ${S.fx.source} ${S.fx.asOf} · no market opinion included</div></div>
      <div class="grid g2">
        <div class="card"><h2>1 · Reserve first</h2><div class="bar"><i class="${efp >= 1 ? 'g' : efp >= 0.5 ? 'a' : 'r'}" style="width:${(efp * 100).toFixed(0)}%"></i></div>
          <div class="sm mut">${P(p.efSaved)} of ${P(p.efT)} (${fmtN(efp * 100, 0)}%)</div>
          ${p.holdback > 0.5 ? html`<table style="margin-top:8px"><tr><td class="b">Hold back now</td><td class="rt b">${P(p.holdback)}</td></tr>
            ${p.topups.map(t => html`<tr><td>→ ${t.name}${t.rate ? html` <span class="sm mut">${fmtN(t.rate, 2)}%</span>` : ''}</td><td class="rt b">${P(t.amt)}</td></tr>`)}</table>
            ${p.shortfall > p.holdback ? html`<div class="flag f-info">Still ${P(p.shortfall - p.holdback)} short after this — keep topping up from salary.</div>` : ''}`
          : html`<div class="flag f-green">✓ Reserve total is at target.</div>`}
          <div class="sep"><div class="b sm">Instant-access check</div><div class="sm mut">Locked money counts toward the total, not toward money you can withdraw today.</div>
            <table style="margin-top:6px"><tr><td>Instant-access now</td><td class="rt b ${p.liqGap > 0.5 ? 'amber' : 'green'}">${P(p.liqNow)}</td></tr>
            <tr><td>Instant-access target</td><td class="rt">${P(p.liqT)}</td></tr>${p.locked > 0.5 ? html`<tr><td class="mut">Locked</td><td class="rt mut">${P(p.locked)}</td></tr>` : ''}</table>
            ${p.liqGap > 0.5 ? html`<div class="flag f-amber">Short ${P(p.liqGap)} of instant access.${p.moves.length ? html` Move: ${p.moves.map((m, i) => html`${i ? ', ' : ''}<b>${P(m.amt)}</b> from ${m.name}`)} → instant-access savings.` : ''}${p.liqStillShort > 0.5 ? ` Build the remaining ${P(p.liqStillShort)} from salary (Budget → “Reserve top-up”).` : ''}</div>` : html`<div class="flag f-green">✓ Instant-access target met.</div>`}</div></div>
        <div class="card"><h2>2 · Invest the rest</h2><div class="sm mut">Lump sum, one order, as soon as the cash is there — your rule.</div>
          ${p.investPLN > 0.5 ? html`<table style="margin-top:8px">
            ${p.movedFromInvestable > 0.5 ? html`<tr><td class="mut">less ${P(p.movedFromInvestable)} moved to instant access</td><td class="rt mut">−${P(p.movedFromInvestable)}</td></tr>` : ''}
            <tr><td>To invest</td><td class="rt b">${P(p.investPLN)} <span class="mut">= €${fmtN(p.investEUR, 2, true)}</span></td></tr>
            <tr><td>VWCE @ €${fmtN(p.price, 2, true)} <span class="src">(${S.market.source} · ${S.market.asOf})</span></td><td class="rt b big">${p.shares > 0 ? `~${p.shares} shares` : '< 1 share'}</td></tr>
            ${p.shares > 0 ? html`<tr><td>Order size</td><td class="rt">€${fmtN(p.orderEUR, 2, true)}</td></tr><tr><td>Leftover after whole shares</td><td class="rt">€${fmtN(p.leftoverEUR, 2, true)} — stays in IBKR for the next DCA</td></tr>` : ''}</table>
            ${p.shares <= 0 ? html`<div class="flag f-info">Below one share — fold it into the next monthly DCA order.</div>` : ''}`
          : html`<div class="flag f-info">Nothing left to invest after the reserve — the reserve comes first.</div>`}</div>
      </div>`;
    }
  }
  return html`${out}
  <div class="grid g2">
    <div class="card"><h2>Monthly plan — ${monthLabel(plan.k)}</h2><div class="sm mut">${plan.fromBudget ? 'From your Budget for this month.' : 'From your category targets (month not set up in Budget yet).'} Income <b>${P(plan.inc)}</b></div>
      <table style="margin-top:8px">${plan.rows.filter(r => r.amt > 0).map(r => html`<tr><td>${r.name} <span class="pill p-${r.kind === 'invest' ? 'acc' : 'mut'}" style="font-size:10px">${r.kind}</span></td><td class="rt b">${P(r.amt)}</td><td class="rt mut">${pct(r.amt, plan.inc)}</td></tr>`)}
      <tr><td class="b">Unallocated</td><td class="rt b ${plan.left < -0.5 ? 'red' : ''}">${P(plan.left)}</td><td></td></tr></table></div>
    <div class="card"><h2>Goals check</h2>${cashGoals.length ? html`<div class="sm mut">Near-term goals are funded from <b>cash</b>, never by selling VWCE — your rule.</div>
      <table style="margin-top:8px">${cashGoals.map(g => { const gc = c.goalCalc(g); return html`<tr><td>${g.name}</td><td class="rt">${fmt(gc.saved, g.ccy, 0)} / ${fmt(g.target, g.ccy, 0)}</td><td class="rt">${
        gc.pct >= 1 ? html`<span class="pill p-green">✓ funded</span>` : (g.targetDate && gc.reqM !== null) ? html`<span class="pill p-amber">needs ${fmt(gc.reqM, g.ccy, 0)}/mo</span>` : gc.monthsAtRate !== null ? html`<span class="pill p-mut">≈ ${c.etaLabel(gc.monthsAtRate)}</span>` : html`<span class="pill p-mut">set a date</span>`}</td></tr>`; })}</table>`
      : html`<div class="mut sm">No cash goals yet — add them on the Goals tab.</div>`}
      ${pfGoals.length ? html`<div class="sm mut" style="margin-top:8px">Long-term (portfolio covers): ${pfGoals.map(g => g.name).join(', ')}</div>` : ''}</div>
  </div>
  ${idle > 0.5 ? html`<div class="card" style="border-left:4px solid var(--red)"><h2 style="color:var(--red)">${P(idle)} is earning 0%</h2>
    <div class="sm">At ${fmtN(infl, 1)}% inflation that's <b class="red">−${P(idle * infl / 100)} of purchasing power per year</b> while it sits idle.</div>
    ${!c.anyInterest() ? html`<div class="flag f-red">You have no interest-bearing account with money in it. Open a savings account and move reserve money there.</div>` : ''}</div>` : ''}
  ${c.expiringRates().length ? html`<div class="card" style="border-left:4px solid var(--amber)"><h2>Rate expiry watch</h2><table>${c.expiringRates().map(e => html`<tr><td>${e.name} <span class="b">${fmtN(e.rate, 2)}%</span> on ${P(e.pln)}</td><td class="rt ${e.days < 45 ? 'amber b' : 'mut'}">${e.days > 0 ? `ends in ${e.days} days (${e.until})` : `ENDED ${e.until}`}</td></tr>`)}</table>
    <div class="sm mut">When a promo ends the rate usually drops to near 0% silently. Decide before the date: roll into a new promo, keep as reserve, or — if above your reserve target — move it to VWCE.</div></div>` : ''}
  <div class="card"><h2>What actually moves the needle</h2><div class="sm mut">Both from your own numbers, over the ${fmtN(Math.max(0, num(c.s.fireAge) - c.effAge()), 0)} years to age ${c.s.fireAge}.</div>
    <table style="margin-top:8px"><tr><td>Rate-shopping your reserve<div class="sm mut">${P(c.efTotalPln())} from 0% → 5.25%, after Belka</div></td><td class="rt b">+${P(c.reserveInterestPln(5.25))}<div class="sm mut">per year</div></td></tr>
    <tr><td>Routing <b>1,000 PLN/month</b> more to VWCE<div class="sm mut">at ${fmtN(c.s.realReturn, 1)}% real, compounded to ${c.s.fireAge}</div></td><td class="rt b green">+${P(c.fvContribPln(c.investPlanPln() + 1000) - base)}<div class="sm mut">by retirement</div></td></tr></table>
    <div class="flag f-info">Both are worth doing — but the reserve is <b>insurance</b> (its job is to exist), the monthly contribution is the <b>engine</b>.</div></div>
  <div class="card"><h2>Where your cash sits</h2><div class="sm mut">Gross rate → after ${fmtN(belka, 0)}% Belka → after ${fmtN(infl, 1)}% inflation.</div>
    <table style="margin-top:8px"><tr><th>Account</th><th class="rt">Gross</th><th class="rt hide-m">Net</th><th class="rt">Real</th><th class="rt">Real/yr</th></tr>
    ${S.accounts.filter(a => !a.broker && Calc.counts(a)).map(a => { const r = num(a.rate), real = c.realCashRate(r); return html`<tr><td>${a.name}${a.instant === false ? html` <span class="pill p-mut" style="font-size:10px">locked</span>` : ''}</td>
      <td class="rt">${fmtN(r, 2)}%</td><td class="rt mut hide-m">${fmtN(r * (1 - belka / 100), 2)}%</td><td class="rt ${real >= 0 ? 'green' : 'red'}">${real >= 0 ? '+' : ''}${fmtN(real, 2)}%</td>
      <td class="rt ${real >= 0 ? '' : 'red'}">${real >= 0 ? '+' : ''}${P(c.accPln(a) * real / 100)}/yr</td></tr>`; })}</table>
    <div class="flag f-info">Cash at these rates roughly <b>holds</b> value — the right trade for reserve money. Money you won't touch for 5+ years is what VWCE is for.</div></div>`;
}

function budget(S, c, meta, params) {
  let k = params.month || monthKey(c.today);
  if (k.length !== 7 || !parseDate(k + '-01')) k = monthKey(c.today);
  const m = S.budget.months[k], cats = S.budget.categories, inc = m ? c.monthIncomePln(k) : c.salaryPln();
  const proposed = c.proposedAlloc(inc), alloc = id => num(m ? (m.alloc[id] ?? 0) : (proposed[id] ?? 0));
  const kinds = {spend: 0, save: 0, invest: 0}; cats.forEach(x => { kinds[x.kind || 'spend'] += alloc(x.id); });
  const left = inc - (kinds.spend + kinds.save + kinds.invest), flags = [];
  if (m) {
    if (left < -0.5) flags.push(['red', `Over-allocated by ${P(-left)} — trim something.`]);
    else if (left > 0.5) flags.push(['amber', `${P(left)} has no job yet — give it one (reserve, goal or invest).`]);
    if (c.efTotalPln() < num(c.s.efTargetPLN) && kinds.save <= 0) flags.push(['amber', 'Emergency fund is below target but this month saves nothing.']);
    if (kinds.invest < c.investPlanPln() - 0.5) flags.push(['info', `Investing ${P(kinds.invest)} this month vs your ${P(c.investPlanPln())} plan.`]);
    if (!flags.length) flags.push(['green', '✓ Every złoty has a job.']);
  }
  const first = k + '-01', prev = monthKey(addMonths(first, -1)), next = monthKey(addMonths(first, 1)), pd = m ? c.payday(k) : null;
  const dests = S.accounts.filter(a => a.role !== 'invest' || a.broker);
  const donut = {labels: cats.map(x => x.name).concat('Unallocated'), values: cats.map(x => alloc(x.id)).concat(Math.max(0, left)), kinds: cats.map(x => x.kind).concat('none')};
  return html`
  <div class="card"><div class="frow" style="margin:0">
    <button class="btn ghost"${da('setparams', JSON.stringify({month: prev}))}>‹</button>
    <input class="dt" type="month" value="${k}" data-param="month" data-autoapply>
    <button class="btn ghost"${da('setparams', JSON.stringify({month: next}))}>›</button>
    <span class="big" style="margin-left:6px">${monthLabel(k)}</span>
    ${m ? html`<button class="btn ghost" style="margin-left:auto" data-click="bPropose"${da('month', k)} data-confirm="Replace this month's amounts with your category targets?">Propose split</button>` : ''}</div></div>
  ${!m ? html`<div class="card"><div class="flag f-info">${monthLabel(k)} isn't set up yet. The amounts below are your category targets.
    <button class="btn" style="margin-left:8px" data-click="bEnsure"${da('month', k)}>Set up ${monthLabel(k)}</button></div></div>` : ''}
  ${pd ? html`<div class="card" style="border-left:4px solid var(--acc)"><h2>Payday — do this on the ${pd.day}th</h2>
    <div class="sm mut">Salary ${P(pd.inc)} lands in ${pd.salName}. Move it the same day, before it gets spent by default.</div>
    ${paydaySteps(pd)}<div class="sm mut">Built from the allocation below — change an amount or a “goes to” account and this list updates.</div></div>` : ''}
  <div class="grid g2">
    <div class="card"><h2>Income</h2>${m ? html`<table><tr><th>Source</th><th class="rt">Amount</th><th>Ccy</th><th></th></tr>
      ${m.incomes.map(i => html`<tr><td><input class="inline" style="width:110px" value="${i.label}" data-act="bIncSet"${da('month', k)}${da('id', i.id)} data-field="label"${da('key', 'inc-' + i.id + '-l')}></td>
        <td class="rt"><input class="num inline" inputmode="decimal" value="${inputValue(i.amount)}" data-act="bIncSet"${da('month', k)}${da('id', i.id)} data-field="amount"${da('key', 'inc-' + i.id + '-a')}></td>
        <td>${ccySelect(i.ccy, `data-act="bIncSet" data-month="${esc(k)}" data-id="${esc(i.id)}" data-field="ccy"`)}</td>
        <td><button class="mini" data-click="bIncDel"${da('month', k)}${da('id', i.id)} data-confirm="Remove this income?">✕</button></td></tr>`)}</table>
      <div class="frow"><button class="btn ghost" data-click="bIncAdd"${da('month', k)}>+ Add income</button><span style="margin-left:auto" class="b">Total ${P(inc)}</span></div>`
      : html`<div class="mut">Salary ${P(inc)} (from Settings) once the month is set up.</div>`}</div>
    <div class="card"><h2>Where it goes</h2><div class="chartbox" style="height:170px"><canvas id="donut"></canvas></div>
      <script type="application/json" id="donutData">${raw(JSON.stringify(donut).replace(/</g, '\\u003c'))}</script>
      <table style="margin-top:6px">${[['invest', '→ Invest'], ['save', '→ Save'], ['spend', '→ Spend']].map(([kk, l]) => html`<tr><td>${l}</td><td class="rt b">${P(kinds[kk])}</td><td class="rt mut">${pct(kinds[kk], inc)}</td></tr>`)}
      <tr><td class="b">Left unallocated</td><td class="rt b ${left < -0.5 ? 'red' : left > 0.5 ? 'amber' : 'green'}">${P(left)}</td><td></td></tr></table></div>
  </div>
  <div class="card"><h2>Allocation — ${monthLabel(k)} <span class="sm mut" style="text-transform:none;letter-spacing:0">(PLN)</span></h2>
    <div class="tablewrap"><table><tr><th>Category</th><th class="hide-m">Type</th><th class="hide-m">Paid by / goes to</th><th class="rt hide-m">Monthly target</th><th class="rt">This month</th><th class="rt hide-m">%</th><th></th></tr>
    ${cats.map(cat => { const a = alloc(cat.id); return html`<tr>
      <td><input class="inline" style="width:160px" value="${cat.name}" data-act="catSet"${da('id', cat.id)} data-field="name"${da('key', 'cat-' + cat.id + '-n')}></td>
      <td class="hide-m"><select data-act="catSet"${da('id', cat.id)} data-field="kind">${opts(['spend', 'save', 'invest'], cat.kind)}</select></td>
      <td class="hide-m">${cat.kind === 'spend'
        ? html`<select data-act="catSet"${da('id', cat.id)} data-field="payVia">${[['card', '💳 card'], ['transfer', '🏦 transfer'], ['cash', '💵 cash'], ['pot', '🐷 from savings']].map(([v2, l]) => html`<option value="${v2}"${sel(cat.payVia === v2)}>${l}</option>`)}</select>
          ${cat.payVia === 'pot' ? html`<select data-act="catSet"${da('id', cat.id)} data-field="fromAccount"><option value="">← which account?</option>${dests.map(acc => html`<option value="${acc.id}"${sel(cat.fromAccount === acc.id)}>← ${acc.name}</option>`)}</select>` : ''}`
        : html`<select data-act="catSet"${da('id', cat.id)} data-field="toAccount"><option value="">→ choose account</option>${dests.map(acc => html`<option value="${acc.id}"${sel(cat.toAccount === acc.id)}>→ ${acc.name}</option>`)}</select>`}</td>
      <td class="rt nowrap hide-m"><input class="num sm inline" inputmode="decimal" value="${inputValue(cat.value)}" data-act="catSet"${da('id', cat.id)} data-field="value"${da('key', 'cat-' + cat.id + '-v')}><select data-act="catSet"${da('id', cat.id)} data-field="mode"><option value="fixed"${sel(cat.mode === 'fixed')}>PLN</option><option value="pct"${sel(cat.mode === 'pct')}>%</option></select></td>
      <td class="rt"><input class="num inline b" inputmode="decimal" value="${inputValue(a)}" data-act="bAlloc"${da('month', k)}${da('id', cat.id)}${da('key', 'al-' + cat.id)}></td>
      <td class="rt mut hide-m">${pct(a, inc)}</td>
      <td><button class="mini" data-click="catDel"${da('id', cat.id)}${da('confirm', `Remove category “${cat.name}”? Past months keep their numbers.`)}>✕</button></td></tr>`; })}</table></div>
    <div class="frow"><button class="btn ghost" data-click="catAdd">+ Add category</button>
      <span class="sm mut">“Monthly target” = your standing plan (new months + FIRE projection). “This month” = what you actually do. Rotate the phone sideways to see all columns.</span></div>
    ${flags.map(([kind, t]) => html`<div class="flag f-${kind}">${t}</div>`)}</div>`;
}

function invest(S, c, meta, params) {
  const v = c.vwce(), price = num(S.market.price), log = S.dca.log;
  const months = Array.from({length: 12}, (_, i) => monthKey(addMonths(c.today.slice(0, 8) + '01', i - 11)));
  const done = months.filter(k => log[k]).length;
  const amt = params.deploy ?? '', dccy = params.dccy || 'PLN';
  let deploy = null;
  if (amt !== '' && num(amt) > 0 && price > 0 && CCYS.includes(dccy)) { const eur = c.conv(num(amt), dccy, 'EUR'), sh = Math.floor(eur / price); deploy = {eur, shares: sh, cost: sh * price, left: eur - sh * price}; }
  const broker = c.brokerAccount(), brokerEUR = broker ? c.conv(num(broker.balance), broker.ccy, 'EUR') : 0;
  return html`${rulesBanner()}
  <div class="grid g4">
    <div class="card stat"><h2>Shares ${v.est ? html`<span class="pill p-amber">estimate</span>` : ''}</h2><div class="v">${fmtN(v.sh, 2)}</div><div class="s">avg cost €${fmtN(v.avg, 2, true)}</div></div>
    <div class="card stat"><h2>Invested</h2><div class="v">€${fmtN(v.costE, 0)}</div><div class="s">${S.lots.length} purchase${S.lots.length === 1 ? '' : 's'}</div></div>
    <div class="card stat"><h2>Value now</h2><div class="v">€${fmtN(v.valE, 0)}</div><div class="s">at €${fmtN(price, 2, true)} · ${S.market.asOf}</div></div>
    <div class="card stat"><h2>Unrealised</h2><div class="v ${v.gainE >= 0 ? 'green' : 'red'}">€${fmtN(v.gainE, 0)}</div><div class="s">Belka if sold now ≈ ${P(c.belkaPln())}</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>Deploy this cash</h2>
      ${broker && brokerEUR > 1 ? html`<div class="sm" style="margin-bottom:8px">IBKR cash ready to invest: <b>€${fmtN(brokerEUR, 2, true)}</b>
        <button class="btn ghost" style="padding:4px 10px"${da('setparams', JSON.stringify({deploy: brokerEUR.toFixed(2), dccy: 'EUR'}))}>Use it</button></div>` : ''}
      <div class="frow" style="margin:0"><input class="num" inputmode="decimal" placeholder="amount" value="${amt}" data-param="deploy" data-autoapply data-key="deploy">${ccySelect(dccy, 'data-param="dccy" data-autoapply')}</div>
      ${deploy ? html`<div class="big" style="margin-top:10px">≈ ${deploy.shares} shares</div>
        <div class="sm">at €${fmtN(price, 2, true)}/share (${S.market.source}, ${S.market.asOf}) → order €${fmtN(deploy.cost, 2, true)}, leftover €${fmtN(deploy.left, 2, true)}</div>
        <div class="flag f-info">Your rule: one lump-sum order as soon as the cash is there. This only does the arithmetic.</div>` : html`<div class="sm mut" style="margin-top:8px">Enter an amount to see the share count.</div>`}</div>
    <div class="card"><h2>Monthly DCA <span class="pill ${done >= 10 ? 'p-green' : 'p-mut'}">${done}/12 last 12 months</span></h2>
      <div class="sm mut" style="margin-bottom:8px">This month: <b>${P(c.dcaAmountPln())}</b> — from the Budget's invest line. Tick when the order is placed.</div>
      <div class="dcagrid">${months.map(k => html`<button class="dca ${log[k] ? 'on' : ''}" data-click="dcaTick"${da('month', k)}>${log[k] ? '✓ ' : ''}${monthLabel(k)}</button>`)}</div></div>
  </div>
  <div class="card"><h2>Purchase log</h2>
    ${v.est ? html`<div class="flag f-amber">One row is an <b>estimate</b>. The real fill price and share count are in IBKR → Statements → Trades. Edit the row to correct it — the estimate flag clears on edit.</div>` : ''}
    ${S.lots.length ? html`<div class="tablewrap"><table><tr><th>Date</th><th class="rt">Shares</th><th class="rt">Price</th><th class="hide-m">Ccy</th><th class="rt">Gain</th><th></th></tr>
    ${S.lots.map(l => { const cost = c.conv(num(l.shares) * num(l.price), l.ccy || 'EUR', 'EUR'), gain = num(l.shares) * price - cost; return html`<tr${l.est ? raw(' style="background:var(--amberbg)"') : ''}>
      <td><input class="dt inline" type="date" value="${l.date}" data-act="lotSet"${da('id', l.id)} data-field="date"></td>
      <td class="rt"><input class="num sm inline" inputmode="decimal" value="${inputValue(l.shares)}" data-act="lotSet"${da('id', l.id)} data-field="shares"${da('key', 'lot-' + l.id + '-s')}></td>
      <td class="rt"><input class="num sm inline" inputmode="decimal" value="${inputValue(l.price)}" data-act="lotSet"${da('id', l.id)} data-field="price"${da('key', 'lot-' + l.id + '-p')}></td>
      <td class="hide-m">${ccySelect(l.ccy, `data-act="lotSet" data-id="${esc(l.id)}" data-field="ccy"`)}</td>
      <td class="rt ${gain >= 0 ? 'green' : 'red'}">€${fmtN(gain, 0)}</td>
      <td><button class="mini" data-click="lotDel"${da('id', l.id)} data-confirm="Delete this purchase?">✕</button></td></tr>`; })}</table></div>` : html`<div class="mut">No purchases logged yet.</div>`}
    <div class="frow sep" data-form><input class="dt" type="date" data-name="date" value="${c.today}"><input class="num sm" inputmode="decimal" data-name="shares" placeholder="shares">
      <input class="num sm" inputmode="decimal" data-name="price" placeholder="price">${ccySelect('EUR', 'data-name="ccy"')}<button class="btn" data-click="lotAdd" data-collect>+ Log purchase</button></div>
    <div class="sm mut" style="margin-top:6px">Belka estimate = ${fmtN(c.s.belkaPct, 0)}% × unrealised gain — for planning only.</div></div>
  ${marketCard(S, c, meta)}`;
}

function goals(S, c) {
  const pots = S.accounts.filter(a => a.role === 'goal' || a.role === 'other');
  return html`<div class="card"><h2>Add a goal</h2><div class="frow" style="margin:0">
    <button class="btn ghost" data-click="goalAdd" data-value="trip">✈️ Trip</button><button class="btn ghost" data-click="goalAdd" data-value="car">🚗 Car</button>
    <button class="btn ghost" data-click="goalAdd" data-value="flat">🏠 Flat</button><button class="btn ghost" data-click="goalAdd" data-value="custom">+ Custom</button></div></div>
  <div class="grid g2">${S.goals.length ? S.goals.map(g => { const gc = c.goalCalc(g); return html`<div class="goalcard">
    <div class="frow" style="margin:0"><input class="inline b" style="font-size:15px;width:65%" value="${g.name}" data-act="goalSet"${da('id', g.id)} data-field="name"${da('key', 'g-' + g.id + '-n')}>
      ${g.autoEF ? html`<span class="pill p-acc">auto: reserve</span>` : ''}<button class="mini" style="margin-left:auto" data-click="goalDel"${da('id', g.id)}${da('confirm', `Delete goal “${g.name}”?`)}>✕</button></div>
    <div class="bar" style="margin-top:10px"><i class="${gc.pct >= 1 ? 'g' : ''}" style="width:${(gc.pct * 100).toFixed(0)}%"></i></div>
    <div class="sm mut">${fmt(gc.saved, g.ccy, 0)} of ${fmt(g.target, g.ccy, 0)} (${fmtN(gc.pct * 100, 0)}%)${gc.remaining > 0 ? ` · ${fmt(gc.remaining, g.ccy, 0)} to go` : ''}</div>
    <table style="margin-top:8px">
      <tr><td>Target</td><td class="rt nowrap"><input class="num inline" inputmode="decimal" value="${inputValue(g.target)}" data-act="goalSet"${da('id', g.id)} data-field="target"${da('key', 'g-' + g.id + '-t')}> ${ccySelect(g.ccy, `data-act="goalSet" data-id="${esc(g.id)}" data-field="ccy"`)}</td></tr>
      ${!g.autoEF ? html`<tr><td>Money is in</td><td class="rt"><select data-act="goalSet"${da('id', g.id)} data-field="account"><option value="">— typed by hand —</option>${pots.map(a => html`<option value="${a.id}"${sel(g.account === a.id)}>${a.name}</option>`)}</select></td></tr>
        ${!g.account ? html`<tr><td>Saved so far</td><td class="rt"><input class="num inline" inputmode="decimal" value="${inputValue(g.saved)}" data-act="goalSet"${da('id', g.id)} data-field="saved"${da('key', 'g-' + g.id + '-s')}> ${g.ccy}</td></tr>` : ''}` : ''}
      <tr><td>Target date</td><td class="rt"><input class="dt inline" type="date" value="${g.targetDate || ''}" data-act="goalSet"${da('id', g.id)} data-field="targetDate"></td></tr>
      <tr><td>Saving per month</td><td class="rt"><input class="num inline" inputmode="decimal" value="${inputValue(g.monthlySave || 0)}" data-act="goalSet"${da('id', g.id)} data-field="monthlySave"${da('key', 'g-' + g.id + '-m')}> ${g.ccy}</td></tr>
      ${g.targetDate ? html`<tr><td>Months left</td><td class="rt b">${gc.monthsLeft}</td></tr><tr><td>Needed per month</td><td class="rt b ${gc.rate > 0 && gc.reqM > gc.rate ? 'red' : ''}">${fmt(gc.reqM, g.ccy, 0)}/mo</td></tr>`
        : gc.monthsAtRate !== null ? html`<tr><td>At ${fmt(gc.rate, g.ccy, 0)}/mo →</td><td class="rt b">${gc.monthsAtRate} months <span class="mut">(≈ ${c.etaLabel(gc.monthsAtRate)})</span></td></tr>`
        : html`<tr><td colspan="2" class="mut sm">Set a target date or a monthly amount to see when you get there.</td></tr>`}
      <tr><td>Funding</td><td class="rt"><select data-act="goalSet"${da('id', g.id)} data-field="funding"><option value="cash"${sel(g.funding === 'cash')}>Cash (near-term)</option><option value="portfolio"${sel(g.funding === 'portfolio')}>Portfolio (long-term)</option></select></td></tr>
    </table></div>`; }) : html`<div class="mut">No goals yet.</div>`}</div>`;
}

function accounts(S, c) {
  const byRole = r => S.accounts.filter(a => a.role === r).reduce((t, a) => t + c.accPln(a), 0);
  return html`<div class="grid g4">
    <div class="card stat"><h2>Reserve</h2><div class="v">${P(byRole('ef'))}</div></div><div class="card stat"><h2>Investable</h2><div class="v">${P(byRole('invest'))}</div></div>
    <div class="card stat"><h2>Goal pots</h2><div class="v">${P(byRole('goal'))}</div></div><div class="card stat"><h2>Other</h2><div class="v">${P(byRole('other'))}</div></div></div>
  <div class="card"><h2>Accounts</h2>${S.accounts.map(a => { const until = parseDate(a.rateUntil), days = until ? daysBetween(c.today, until) : null; return html`<div class="acccard">
    <div class="frow" style="margin:0"><input class="inline b" style="flex:1" value="${a.name}" data-act="accSet"${da('id', a.id)} data-field="name"${da('key', 'acc-' + a.id + '-n')}>
      ${!Calc.counts(a) ? html`<span class="pill p-mut" style="font-size:10px">to open</span>` : ''}<button class="mini" data-click="accDel"${da('id', a.id)}${da('confirm', `Delete account “${a.name}”?`)}>✕</button></div>
    <div class="frow"><input class="num b" inputmode="decimal" value="${inputValue(a.balance)}" data-act="accSet"${da('id', a.id)} data-field="balance"${da('key', 'acc-' + a.id + '-b')}>
      ${ccySelect(a.ccy, `data-act="accSet" data-id="${esc(a.id)}" data-field="ccy"`)}
      <select data-act="accSet"${da('id', a.id)} data-field="role">${[['ef', 'Emergency fund'], ['invest', 'Investable cash'], ['goal', 'Goal pot'], ['other', 'Other']].map(([v2, l]) => html`<option value="${v2}"${sel(a.role === v2)}>${l}</option>`)}</select></div>
    <div class="frow"><span class="sm mut">Rate</span><input class="num sm" inputmode="decimal" value="${inputValue(a.rate)}" data-act="accSet"${da('id', a.id)} data-field="rate"${da('key', 'acc-' + a.id + '-r')}>%
      <span class="sm mut">until</span><input class="dt" type="date" value="${a.rateUntil || ''}" data-act="accSet"${da('id', a.id)} data-field="rateUntil">
      ${days !== null ? html`<span class="sm ${days <= 30 ? 'amber b' : 'mut'}">${days >= 0 ? `in ${days} days` : 'ended'}</span>` : ''}</div>
    <div class="frow"><label class="chk"><input type="checkbox"${a.instant !== false ? raw(' checked') : ''} data-act="accSet"${da('id', a.id)} data-field="instant"> instant access</label>
      <label class="chk"><input type="checkbox"${a.salary ? raw(' checked') : ''} data-act="accSet"${da('id', a.id)} data-field="salary"> salary</label>
      <label class="chk"><input type="checkbox"${a.broker ? raw(' checked') : ''} data-act="accSet"${da('id', a.id)} data-field="broker"> broker</label></div></div>`; })}
    <div class="frow"><button class="btn ghost" data-click="accAdd">+ Add account</button></div></div>
  <div class="card"><h2>What the roles mean</h2><table>
    <tr><td><b>Emergency fund</b></td><td class="sm">Counts toward your reserve. Untick <b>instant access</b> for locked money (a lokata).</td></tr>
    <tr><td><b>Investable cash</b></td><td class="sm">Salary account and broker cash. The salary account keeps its float (${P(c.s.operatingFloatPLN)}). Broker cash is never moved out.</td></tr>
    <tr><td><b>Goal pot</b></td><td class="sm">Money set aside for a goal. Never swept into the reserve, never invested.</td></tr>
    <tr><td><b>Other</b></td><td class="sm">Idle money — Advice suggests moving it to instant-access savings if the reserve is short.</td></tr>
    <tr><td><b>0 balance</b></td><td class="sm">Shown as “to open”; left out of reserve maths until money is in it.</td></tr></table></div>`;
}

function policy(S, c, meta, params) {
  const labels = Object.fromEntries(S.policy.rules.map(r => [r.key, r.label]));
  const pending = S.policy.changes.filter(ch => ch.status === 'pending'), pendingKeys = new Set(pending.map(ch => ch.ruleKey));
  return html`<div class="card" style="border-left:4px solid var(--acc)"><h2>🔒 Investment Policy</h2>
    <div class="sm">These are <b>your</b> rules. Nothing else in the app can change them. To change one: write the new rule and your reason → a <b>${COOLING_OFF_DAYS}-day cooling-off</b> starts → only after it ends can you apply it. Every step is logged.</div></div>
  ${pending.map(ch => { const dl = daysLeft(ch, c.today); return html`<div class="card" style="border-left:4px solid var(--amber)"><h2>Pending change · ${labels[ch.ruleKey] || ch.ruleKey}</h2>
    <table><tr><td class="mut">Current</td><td>${ch.oldValue}</td></tr><tr><td class="mut">Proposed</td><td class="b">${ch.newValue}</td></tr>
    <tr><td class="mut">Your reason</td><td>“${ch.reason}”</td></tr><tr><td class="mut">Requested</td><td>${ch.requestedAt}</td></tr></table>
    ${dl > 0 ? html`<div class="countdown"><span class="big">${dl}</span> days of cooling-off left · can be applied from ${ch.effectiveAt}</div>
      <div class="bar"><i class="a" style="width:${((COOLING_OFF_DAYS - dl) / COOLING_OFF_DAYS * 100).toFixed(0)}%"></i></div>` : html`<div class="flag f-info">Cooling-off is over. Re-read your reason above — do you still agree with it?</div>`}
    <div class="frow">${dl <= 0 ? html`<button class="btn" data-click="policyApply"${da('id', ch.id)} data-confirm="Apply this change to your Investment Policy?">Apply change</button>` : ''}
      <button class="btn ghost" data-click="policyCancel"${da('id', ch.id)} data-confirm="Cancel this change? The rule stays as it is.">Cancel change</button></div></div>`; })}
  <div class="card"><h2>Rules</h2><table>${S.policy.rules.map(r => html`<tr><td style="width:140px" class="b">${r.label}</td><td>${r.value}</td>
    <td class="rt nowrap">${pendingKeys.has(r.key) ? html`<span class="pill p-amber">pending</span>` : params.edit !== r.key ? html`<button class="linkbtn sm"${da('setparams', JSON.stringify({edit: r.key}))}>change…</button>` : ''}</td></tr>
    ${params.edit === r.key && !pendingKeys.has(r.key) ? html`<tr><td colspan="3"><div class="changeform" data-form>
      <span class="lbl">New rule text</span><textarea data-name="newValue" style="height:60px">${r.value}</textarea>
      <span class="lbl" style="margin-top:8px">Why do you want this change? (at least ${MIN_REASON} characters — you'll see this again before applying)</span>
      <textarea data-name="reason" style="height:70px" placeholder="Write the honest reason…"></textarea>
      <div class="frow"><button class="btn" data-click="policyRequest"${da('id', r.key)} data-collect data-clearparam="edit">Start ${COOLING_OFF_DAYS}-day cooling-off</button>
        <button class="btn ghost" data-setparams='{"edit": ""}'>Never mind</button></div></div></td></tr>` : ''}`)}</table>
    <div class="sm mut" style="margin-top:8px">The advice engine is built on these rules. Nothing ever trades or moves money by itself.</div></div>
  <div class="card"><h2>Change log</h2>${S.policy.changes.length ? html`<table><tr><th>Requested</th><th>Rule</th><th>Change</th><th>Status</th></tr>
    ${[...S.policy.changes].reverse().map(ch => html`<tr><td class="nowrap sm">${ch.requestedAt}</td><td class="sm">${labels[ch.ruleKey] || ch.ruleKey}</td><td class="sm">${ch.newValue}<div class="mut">${ch.reason}</div></td>
      <td class="nowrap"><span class="pill p-${({pending: 'amber', applied: 'green', cancelled: 'mut'})[ch.status]}">${ch.status}</span>${ch.decidedAt ? html`<div class="sm mut">${ch.decidedAt}</div>` : ''}</td></tr>`)}</table>`
    : html`<div class="mut sm">No changes yet — your rules are as you first wrote them.</div>`}</div>`;
}

function settings(S, c, meta) {
  const s = S.settings;
  const field = (label, key, hint = '') => html`<div class="field"><span class="lbl">${label}</span><input class="num" style="width:100%" inputmode="decimal" value="${inputValue(s[key])}" data-act="set"${da('path', 'settings.' + key)}${da('key', 'set-' + key)}>${hint ? html`<span class="sm mut">${hint}</span>` : ''}</div>`;
  const choice = (label, key, list) => html`<div class="field"><span class="lbl">${label}</span><select data-act="set"${da('path', 'settings.' + key)}>${opts(list, s[key])}</select></div>`;
  const mfield = (label, path, v, key) => html`<div class="field"><span class="lbl">${label}</span><input class="num" style="width:100%" inputmode="decimal" value="${inputValue(v)}" data-act="set"${da('path', path)}${da('key', key)}></div>`;
  return html`
  <div class="card" style="border-left:4px solid var(--acc)"><h2>💾 Your data</h2>
    <div class="sm">Everything is stored <b>only on this phone</b>, inside Chrome. If you clear Chrome's data or lose the phone, it's gone — so keep backups.</div>
    <table style="margin-top:8px"><tr><td>Last backup file</td><td class="rt b">${meta.lastExport ? meta.lastExport.replace('T', ' ').slice(0, 16) : 'never'}</td></tr>
      <tr><td>Storage protected from automatic clean-up</td><td class="rt">${meta.persisted ? html`<span class="pill p-green">yes</span>` : html`<span class="pill p-amber">not yet — install the app to the home screen</span>`}</td></tr>
      <tr><td>Automatic snapshots on this phone</td><td class="rt">${meta.snapshots.length} (last 7 days)</td></tr></table>
    <div class="frow"><button class="btn" data-cmd="export">💾 Save backup file</button><button class="btn ghost" data-cmd="import">Import / restore…</button></div>
    <div class="sm mut">The backup file goes to your phone's Downloads. Same format as the PC app — either app can read it.</div>
    ${meta.snapshots.length ? html`<details style="margin-top:10px"><summary>Undo: restore an automatic snapshot</summary><table>${meta.snapshots.map(sn => html`<tr><td class="sm">${sn}</td>
      <td class="rt"><button class="btn ghost" style="padding:4px 10px" data-cmd="restoreSnap"${da('snap', sn)}>Restore</button></td></tr>`)}</table></details>` : ''}</div>
  <div class="card"><h2>Profile & plan</h2><div class="setgrid">${field('Age (today)', 'age')}${field('FIRE age', 'fireAge')}${field('Stretch age', 'stretchAge')}
    ${field('FIRE multiplier (25 = 4% rule)', 'multiplier')}${field('Real return %/yr', 'realReturn')}${field('Inflation %', 'inflationPct')}</div></div>
  <div class="card"><h2>Two lifestyles</h2><div class="setgrid">
    ${field('Current lifestyle — spending (PLN/month)', 'monthlySpendPLN', '= ' + fmt(num(s.monthlySpendPLN) * 12 * num(s.multiplier), 'PLN', 0) + ' FIRE number')}
    ${field('Target retirement lifestyle (per year)', 'retireSpend', '= ' + fmt(num(s.retireSpend) * num(s.multiplier), s.retireSpendCcy, 0) + ' FIRE number')}
    ${choice('Retirement lifestyle currency', 'retireSpendCcy', CCYS)}</div></div>
  <div class="card"><h2>Income, reserve & cash flow</h2><div class="setgrid">
    ${field('Net salary', 'salaryAmt')}${choice('Salary currency', 'salaryCcy', CCYS)}${field('Salary day of month', 'salaryDay')}${field('Keep in salary account (float, PLN)', 'operatingFloatPLN')}
    ${field('Emergency fund target (PLN)', 'efTargetPLN')}${field('…of which instant-access (PLN)', 'liquidTargetPLN')}${field('Belka tax %', 'belkaPct')}${choice('Reporting currency', 'reportCcy', ['EUR', 'PLN'])}</div>
    <div class="flag f-info">Monthly contribution <b>${P(c.investPlanPln())}</b> (projection) and this month's DCA <b>${P(c.dcaAmountPln())}</b> come from the Budget's invest line.</div></div>
  <div class="card"><h2>Market data</h2><div class="setgrid">${mfield('VWCE price (EUR)', 'market.price', S.market.price, 'mk-p')}${mfield('EUR/PLN', 'fx.EURPLN', S.fx.EURPLN, 'mk-e')}${mfield('USD/PLN', 'fx.USDPLN', S.fx.USDPLN, 'mk-u')}</div>
    <div class="frow"><button class="btn refbtn" data-cmd="refresh">↻ Refresh prices</button><span class="src">Price: ${S.market.source} · ${S.market.asOf || '?'} — FX: ${S.fx.source} · ${S.fx.asOf || '?'}</span></div></div>
  <div class="card"><h2>App</h2><div class="sm">Version ${meta.version} · works offline · no accounts, no bank or broker connections. Internet is used only when you tap Refresh.</div>
    ${meta.updateReady ? html`<div class="frow"><button class="btn" data-cmd="applyUpdate">Install the new version</button></div>` : ''}</div>`;
}

export function firstRun() {
  return html`<div class="card empty"><h2>Welcome to FIRE Manager</h2>
    <p>Your numbers will live <b>only on this phone</b>.</p>
    <p><button class="btn" data-cmd="import">Import my backup file…</button></p>
    <p class="sm mut">Use the JSON from the PC app (Settings → Export JSON) or a phone backup.</p>
    <p><button class="btn ghost" data-cmd="startEmpty">Start empty instead</button></p></div>`;
}

const BUILDERS = {dash, advice, budget, invest, goals, accounts, policy, settings};
export function renderTab(tab, S, today, meta, params) {
  const c = new Calc(S, today);
  const header = html`<header><div class="hrow"><h1>FIRE</h1>
    <div class="nw"><div class="v">${fmt(c.netWorthRep(), c.rc, 0)}</div><div class="l">net worth · ${c.rc}</div></div>
    <div class="ccytog"><button class="${c.rc === 'EUR' ? 'on' : ''}" data-click="setRep" data-value="EUR">EUR</button><button class="${c.rc === 'PLN' ? 'on' : ''}" data-click="setRep" data-value="PLN">PLN</button></div></div>
    <nav>${TABS.map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}"${da('tab', k)}>${l}</button>`)}</nav></header>`;
  return html`${header}<main>${(BUILDERS[tab] || dash)(S, c, meta, params)}</main>`.s;
}
