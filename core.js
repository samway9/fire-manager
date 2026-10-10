// FIRE Manager — phone core. Line-for-line port of the tested Python app (app/calc.py, rules.py,
// actions.py, policy.py, importer.py, formatting.py). Pure functions: no DOM, no storage.
// Cross-checked against golden values produced by the Python version (phone/tests).

export const CCYS = ['PLN', 'EUR', 'USD'];
export const VWCE_ISIN = 'IE00BK5BQT80';
export const EXPORT_FORMAT = 2;

// ---------- numbers & dates ----------
export function parseAmount(v) {
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('not a number'); return v; }
  let s = String(v ?? '').replace(/[\s ]/g, '');
  if (s === '') return 0;
  s = (s.includes(',') && s.includes('.')) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) throw new Error('not a number');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error('not a number');
  return n;
}
export function num(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  try { return parseAmount(v); } catch (_) { return 0; }
}
export const jsRound = x => Math.floor(x + 0.5);
const pad = n => String(n).padStart(2, '0');
export function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
const utc = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);   // b - a
export const monthKey = iso => iso.slice(0, 7);
export function addMonths(iso, n) {
  let [y, m, d] = iso.split('-').map(Number);
  const t = m - 1 + n; y += Math.floor(t / 12); m = ((t % 12) + 12) % 12 + 1;
  const dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return `${y}-${pad(m)}-${pad(Math.min(d, dim))}`;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const monthLabel = k => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
export const dayLabel = iso => `${DOW[new Date(utc(iso)).getUTCDay()]} ${iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

// ---------- formatting (mirrors Intl en-GB like the prototype) ----------
const SYMBOL = {EUR: '€', USD: 'US$', PLN: 'PLN '};
export function fmt(v, ccy = 'EUR', dp) {
  v = Number(v); if (!Number.isFinite(v)) return '—';
  if (dp === undefined || dp === null) dp = Math.abs(v) >= 1000 ? 0 : 2;
  const body = new Intl.NumberFormat('en-GB', {minimumFractionDigits: dp, maximumFractionDigits: dp}).format(Math.abs(v));
  const neg = v < 0 && Number(body.replace(/,/g, '')) !== 0;
  return (neg ? '-' : '') + (SYMBOL[ccy] || ccy + ' ') + body;
}
export function fmtN(v, dp = 2, fixed = false) {
  v = Number(v); if (!Number.isFinite(v)) return '—';
  let s = new Intl.NumberFormat('en-GB', {minimumFractionDigits: fixed ? dp : 0, maximumFractionDigits: dp}).format(v);
  if (s === '-0') s = '0';
  return s;
}
export function inputValue(v) {
  v = Number(v); if (!Number.isFinite(v)) return '';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
}

// ---------- defaults (generic: no personal data in the published code) ----------
export const DEFAULT_SETTINGS = {
  age: 30, ageAsOf: '', fireAge: 55, stretchAge: 60, reportCcy: 'EUR',
  retireSpend: 24000, retireSpendCcy: 'EUR', monthlySpendPLN: 3000,
  multiplier: 25, realReturn: 5, efTargetPLN: 16000, liquidTargetPLN: 12000,
  salaryAmt: 0, salaryCcy: 'PLN', inflationPct: 3.4, belkaPct: 19,
  operatingFloatPLN: 3000, salaryDay: 10,
};
export const COOLING_OFF_DAYS = 30;
export const MIN_REASON = 20;
export const DEFAULT_RULES = [
  ['holding', 'Equity holding', 'VWCE only — Vanguard FTSE All-World UCITS ETF (Acc), ISIN IE00BK5BQT80.'],
  ['deploy', 'How money goes in', 'Lump sum whenever cash is available, plus a monthly DCA from salary.'],
  ['noTiming', 'No market timing', 'Price levels, recent highs or expected drops are never a reason to hold cash.'],
  ['excluded', 'Not allowed', 'No individual stocks, no sector ETFs, no US-listed ETFs, no AI-picked allocations, no buy/sell signals from price data.'],
  ['reserveFirst', 'Reserve first', 'The emergency fund and the instant-access reserve are filled before investing.'],
  ['goalsFromCash', 'Near-term goals', 'Goals under ~3 years are funded from cash, never by selling VWCE.'],
];
export const defaultPolicy = () => ({rules: DEFAULT_RULES.map(([key, label, value]) => ({key, label, value})), changes: []});
export function emptyState(today) {
  return {
    settings: {...DEFAULT_SETTINGS, ageAsOf: today},
    fx: {EURPLN: 4.3, USDPLN: 3.8, asOf: null, source: 'not set yet', fetchedAt: null},
    market: {price: 0, asOf: null, source: 'not set yet', fetchedAt: null},
    accounts: [], lots: [], dca: {log: {}},
    budget: {categories: [
      {id: 'rent', name: 'Rent', kind: 'spend', mode: 'fixed', value: 0, payVia: 'transfer'},
      {id: 'food', name: 'Food & restaurants', kind: 'spend', mode: 'fixed', value: 0, payVia: 'card'},
      {id: 'reserve', name: 'Reserve top-up', kind: 'save', mode: 'fixed', value: 0, payVia: 'transfer'},
      {id: 'invest', name: 'Invest (VWCE)', kind: 'invest', mode: 'fixed', value: 0, payVia: 'transfer'}], months: {}},
    goals: [{id: 'ef', name: 'Emergency fund', target: 16000, ccy: 'PLN', targetDate: '', funding: 'cash', saved: 0, monthlySave: 0, autoEF: true}],
    policy: defaultPolicy(), legacy: {},
  };
}

// ---------- Calc ----------
export class Calc {
  constructor(S, today) { this.S = S; this.today = today || todayISO(); }
  get s() { return this.S.settings; }
  get rc() { return this.s.reportCcy || 'EUR'; }
  plnRate(c) { return c === 'PLN' ? 1 : num(c === 'EUR' ? this.S.fx.EURPLN : this.S.fx.USDPLN); }
  conv(a, f, t) { return f === t ? num(a) : num(a) * this.plnRate(f) / this.plnRate(t); }
  rep(a, f) { return this.conv(a, f, this.rc); }
  otherCcy() { return this.rc === 'EUR' ? 'PLN' : 'EUR'; }
  effAge() { const asOf = parseDate(this.s.ageAsOf) || this.today; return num(this.s.age) + daysBetween(asOf, this.today) / 365.25; }
  daysSince(iso) { const d = parseDate(iso); return d === null ? 9999 : daysBetween(d, this.today); }
  stale(iso, days = 7) { return this.daysSince(iso) > days; }
  vwce() {
    let sh = 0, costE = 0;
    for (const l of this.S.lots) { sh += num(l.shares); costE += this.conv(num(l.shares) * num(l.price), l.ccy || 'EUR', 'EUR'); }
    const val = sh * num(this.S.market.price);
    return {sh, costE, avg: sh ? costE / sh : 0, valE: val, gainE: val - costE, est: this.S.lots.some(l => l.est)};
  }
  static counts(a) { return num(a.balance) > 0; }
  counts(a) { return Calc.counts(a); }
  accPln(a) { return this.conv(num(a.balance), a.ccy, 'PLN'); }
  accTotalPln(role = null) { return this.S.accounts.filter(a => role === null || a.role === role).reduce((t, a) => t + this.accPln(a), 0); }
  efAccounts() { return this.S.accounts.filter(a => a.role === 'ef' && Calc.counts(a)); }
  efTotalPln() { return this.efAccounts().reduce((t, a) => t + this.accPln(a), 0); }
  liquidEfPln() { return this.efAccounts().filter(a => a.instant !== false).reduce((t, a) => t + this.accPln(a), 0); }
  lockedEfPln() { return this.efAccounts().filter(a => a.instant === false).reduce((t, a) => t + this.accPln(a), 0); }
  salaryAccount() { return this.S.accounts.find(a => a.salary) || null; }
  floatPln() { const a = this.salaryAccount(); return a ? Math.max(0, Math.min(num(this.s.operatingFloatPLN), this.accPln(a))) : 0; }
  investableCashPln() { return Math.max(0, this.accTotalPln('invest') - this.floatPln()); }
  idleCashPln() { return this.S.accounts.filter(a => !a.broker && num(a.rate) <= 0 && Calc.counts(a)).reduce((t, a) => t + this.accPln(a), 0); }
  anyInterest() { return this.S.accounts.some(a => !a.broker && num(a.rate) > 0 && Calc.counts(a)); }
  expiringRates() {
    const out = [];
    for (const a of this.S.accounts) {
      const until = parseDate(a.rateUntil);
      if (!until || num(a.rate) <= 0 || !Calc.counts(a)) continue;
      out.push({id: a.id, name: a.name, rate: num(a.rate), until: a.rateUntil, days: daysBetween(this.today, until), pln: this.accPln(a)});
    }
    return out.sort((x, y) => x.days - y.days);
  }
  realCashRate(g) { return num(g) * (1 - num(this.s.belkaPct) / 100) - num(this.s.inflationPct); }
  netWorthRep() { return this.rep(this.vwce().valE, 'EUR') + this.conv(this.accTotalPln(), 'PLN', this.rc); }
  investableRep() { return this.rep(this.vwce().valE, 'EUR') + this.conv(this.accTotalPln('invest'), 'PLN', this.rc); }
  belkaPln() { const g = this.vwce().gainE; return g <= 0 ? 0 : num(this.s.belkaPct) / 100 * this.conv(g, 'EUR', 'PLN'); }
  salaryPln() { return this.conv(num(this.s.salaryAmt), this.s.salaryCcy || 'PLN', 'PLN'); }
  catTargetPln(c, inc) { return c.mode === 'fixed' ? num(c.value) : num(c.value) / 100 * inc; }
  investPlanPln() { const inc = this.salaryPln(); return this.S.budget.categories.filter(c => c.kind === 'invest').reduce((t, c) => t + this.catTargetPln(c, inc), 0); }
  dcaAmountPln(k) {
    k = k || monthKey(this.today);
    const m = this.S.budget.months[k];
    if (!m) return this.investPlanPln();
    return this.S.budget.categories.filter(c => c.kind === 'invest').reduce((t, c) => t + num(m.alloc[c.id] ?? 0), 0);
  }
  monthIncomePln(k) { const m = this.S.budget.months[k]; return m ? m.incomes.reduce((t, i) => t + this.conv(num(i.amount), i.ccy, 'PLN'), 0) : 0; }
  fireNumbers() {
    const mult = num(this.s.multiplier);
    return {target: this.conv(num(this.s.retireSpend) * mult, this.s.retireSpendCcy || 'EUR', this.rc),
            current: this.conv(num(this.s.monthlySpendPLN) * 12 * mult, 'PLN', this.rc)};
  }
  projection() {
    const r = Math.pow(1 + num(this.s.realReturn) / 100, 1 / 12) - 1;
    const contribPLN = this.investPlanPln(), contrib = this.conv(contribPLN, 'PLN', this.rc);
    let bal = this.investableRep();
    const targets = this.fireNumbers(), a0 = this.effAge(), fireAge = num(this.s.fireAge);
    const pts = [{age: a0, v: bal}];
    const achieve = {}; for (const k of Object.keys(targets)) achieve[k] = bal >= targets[k] ? a0 : null;
    let atFire = a0 >= fireAge ? bal : null;
    const months = Math.max(1, jsRound((80 - a0) * 12));
    for (let m = 1; m <= months; m++) {
      bal = bal * (1 + r) + contrib;
      const age = a0 + m / 12;
      for (const k of Object.keys(targets)) if (achieve[k] === null && bal >= targets[k]) achieve[k] = age;
      if (atFire === null && age >= fireAge) atFire = bal;
      if (m % 12 === 0) pts.push({age, v: bal});
    }
    return {pts, targets, achieve, atFire: atFire === null ? bal : atFire, contribPLN, contribRep: contrib, startRep: this.investableRep()};
  }
  fvContribPln(monthly) {
    const yrs = Math.max(0, num(this.s.fireAge) - this.effAge());
    const r = Math.pow(1 + num(this.s.realReturn) / 100, 1 / 12) - 1, n = jsRound(yrs * 12);
    if (n <= 0) return 0;
    if (r <= 0) return monthly * n;
    return monthly * ((Math.pow(1 + r, n) - 1) / r);
  }
  reserveInterestPln(g) { return this.efTotalPln() * num(g) / 100 * (1 - num(this.s.belkaPct) / 100); }
  goalSaved(g) {
    if (g.autoEF) return this.conv(this.efTotalPln(), 'PLN', g.ccy);
    const a = g.account ? this.S.accounts.find(x => x.id === g.account) : null;
    if (a) return this.conv(num(a.balance), a.ccy, g.ccy);
    return num(g.saved);
  }
  goalCalc(g) {
    const saved = this.goalSaved(g), target = num(g.target), remaining = Math.max(0, target - saved);
    let monthsLeft = null, reqM = null;
    const td = parseDate(g.targetDate);
    if (td) { monthsLeft = Math.max(0, Math.ceil(daysBetween(this.today, td) / 30.44)); reqM = monthsLeft > 0 ? remaining / monthsLeft : remaining; }
    const rate = num(g.monthlySave);
    const monthsAtRate = (rate > 0 && remaining > 0) ? Math.ceil(remaining / rate) : (remaining <= 0 ? 0 : null);
    return {saved, remaining, monthsLeft, reqM, rate, monthsAtRate, pct: target > 0 ? Math.min(1, saved / target) : 0};
  }
  etaLabel(months) { return months === null || months === undefined ? '—' : monthLabel(monthKey(addMonths(this.today, months))); }
  proposedAlloc(inc) {
    const o = {};
    for (const c of this.S.budget.categories) o[c.id] = c.mode === 'fixed' ? num(c.value) : jsRound(num(c.value) / 100 * inc);
    return o;
  }
  nextPayday() {
    const day = Math.min(Math.trunc(num(this.s.salaryDay)) || 10, 28);
    const d = this.today.slice(0, 8) + pad(day);
    return +this.today.slice(8, 10) <= day ? d : addMonths(d, 1);
  }
  brokerAccount() { return this.S.accounts.find(a => a.broker) || null; }
  payday(k) {
    const m = this.S.budget.months[k];
    if (!m) return null;
    const cats = this.S.budget.categories, accs = Object.fromEntries(this.S.accounts.map(a => [a.id, a]));
    const amt = c => num(m.alloc[c.id] ?? 0);
    const inc = this.monthIncomePln(k), sal = this.salaryAccount(), steps = [];
    const group = items => ({amt: items.reduce((t, c) => t + amt(c), 0), names: items.map(c => c.name)});
    const spend = cats.filter(c => c.kind === 'spend' && amt(c) > 0);
    for (const [via, label] of [['transfer', 'Pay bills by transfer'], ['cash', 'Withdraw cash']]) {
      const items = spend.filter(c => c.payVia === via);
      if (items.length) steps.push({kind: via, label, ...group(items)});
    }
    const order = [], byDest = new Map();
    for (const c of cats) {
      if ((c.kind === 'save' || c.kind === 'invest') && amt(c) > 0) {
        let dest = c.toAccount && accs[c.toAccount] ? c.toAccount : null;
        if (dest === null && c.kind === 'invest' && this.brokerAccount()) dest = this.brokerAccount().id;
        if (!byDest.has(dest)) { byDest.set(dest, []); order.push(dest); }
        byDest.get(dest).push(c);
      }
    }
    const price = num(this.S.market.price);
    for (const dest of order) {
      const a = dest !== null ? accs[dest] : null;
      const step = {kind: 'transfer', label: a ? `Transfer → ${a.name}` : 'Transfer → savings (pick an account in Budget)', account: dest, ...group(byDest.get(dest))};
      if (a && a.broker && price > 0) {
        const cashEUR = this.conv(num(a.balance), a.ccy, 'EUR') + this.conv(step.amt, 'PLN', 'EUR');
        step.shares = Math.floor(cashEUR / price); step.orderEUR = step.shares * price; step.cashEUR = cashEUR;
      }
      steps.push(step);
    }
    const keep = group(spend.filter(c => !['transfer', 'cash', 'pot'].includes(c.payVia)));
    const fromPots = spend.filter(c => c.payVia === 'pot').map(c => ({name: c.name, amt: amt(c), account: c.fromAccount && accs[c.fromAccount] ? accs[c.fromAccount].name : 'savings'}));
    const total = cats.filter(c => !(c.kind === 'spend' && c.payVia === 'pot')).reduce((t, c) => t + amt(c), 0);
    return {inc, steps, keep, fromPots, salName: sal ? sal.name : 'salary account', left: inc - total, day: Math.trunc(num(this.s.salaryDay)) || 10};
  }
  monthlyPlanRows() {
    const k = monthKey(this.today), m = this.S.budget.months[k];
    const inc = m && m.incomes.length ? this.monthIncomePln(k) : this.salaryPln();
    const rows = this.S.budget.categories.map(c => {
      const explicit = m && Object.prototype.hasOwnProperty.call(m.alloc, c.id);
      return {name: c.name, kind: c.kind, amt: jsRound(explicit ? num(m.alloc[c.id]) : this.catTargetPln(c, inc))};
    });
    return {inc, rows, left: inc - rows.reduce((t, r) => t + r.amt, 0), fromBudget: !!m, k};
  }

  // ---------- year-end outlook (port of Calc.forecast) ----------
  cashPln() { return this.S.accounts.filter(a => !a.broker).reduce((t, a) => t + this.accPln(a), 0); }
  forecast(until) {
    const end = until || `${this.today.slice(0, 4)}-12-31`;
    const P = JSON.parse(JSON.stringify(this.S));
    const accs = Object.fromEntries(P.accounts.map(a => [a.id, a])), cats = P.budget.categories;
    const sal = P.accounts.find(a => a.salary) || null, broker = P.accounts.find(a => a.broker) || null;
    const price = num(P.market.price), day = Math.trunc(num(this.s.salaryDay)) || 10;
    const move = (acc, pln) => { if (acc) acc.balance = num(acc.balance) + this.conv(pln, 'PLN', acc.ccy); };
    const rows = [], snaps = {}, last = monthKey(end);
    let k = monthKey(this.today);
    while (k <= last) {
      const m = P.budget.months[k];
      const inc = m ? new Calc(P, this.today).monthIncomePln(k) : this.salaryPln();
      const alloc = m ? m.alloc : this.proposedAlloc(inc);
      const income = (k === monthKey(this.today) && +this.today.slice(8, 10) >= day) ? 0 : inc;
      move(sal, income);
      let spend = 0, pot = 0, saved = 0, invested = 0;
      for (const c of cats) {
        const a = num(alloc[c.id] ?? 0);
        if (a <= 0 || (c.kind === 'spend' && c.payVia === 'pot')) continue;
        if (c.kind === 'spend') { move(sal, -a); spend += a; continue; }
        let dest = c.toAccount && accs[c.toAccount] ? accs[c.toAccount] : null;
        if (dest === null && c.kind === 'invest') dest = broker;
        if (dest !== null && dest !== sal) { move(sal, -a); move(dest, a); }
        if (c.kind === 'invest') invested += a; else saved += a;
      }
      for (const g of P.goals) {
        if (!g.autoEF && g.funding === 'cash' && (g.targetDate || '').slice(0, 7) === k) snaps[g.id] = new Calc(P, this.today).goalCalc(g);
      }
      for (const c of cats) {
        const a = num(alloc[c.id] ?? 0);
        if (a > 0 && c.kind === 'spend' && c.payVia === 'pot') { move((c.fromAccount && accs[c.fromAccount]) || sal, -a); pot += a; }
      }
      let bought = 0;
      if (broker && price > 0) {
        bought = Math.floor(this.conv(num(broker.balance), broker.ccy, 'EUR') / price);
        if (bought > 0) {
          broker.balance = num(broker.balance) - this.conv(bought * price, 'EUR', broker.ccy);
          P.lots.push({id: `forecast-${k}`, date: `${k}-${pad(Math.min(day, 28))}`, shares: bought, price, ccy: 'EUR', est: false});
        }
      }
      const pc = new Calc(P, this.today);
      rows.push({k, planned: !!m, income, spend, potSpend: pot, saved, invested, sharesBought: bought, cashEnd: pc.cashPln(), salaryEnd: sal ? pc.accPln(sal) : 0});
      k = monthKey(addMonths(k + '-01', 1));
    }
    const E = new Calc(P, end), unlocks = [];
    for (const a of P.accounts) {
      const ru = parseDate(a.rateUntil);
      if (a.role === 'ef' && a.instant === false && ru && end < ru && ru <= addMonths(end, 2) && Calc.counts(a)) unlocks.push({name: a.name, date: a.rateUntil, pln: E.accPln(a)});
    }
    const efT = num(this.s.efTargetPLN);
    return {end, rows, accounts: P.accounts.map(a => ({name: a.name, ccy: a.ccy, balance: num(a.balance), pln: E.accPln(a), role: a.role})),
      cashStart: this.cashPln(), cashEnd: E.cashPln(), sharesStart: this.vwce().sh, sharesEnd: E.vwce().sh,
      netWorthStart: this.netWorthRep(), netWorthEnd: E.netWorthRep(), invested: rows.reduce((t, r) => t + r.invested, 0),
      efEnd: E.efTotalPln(), liqEnd: E.liquidEfPln(), lockedEnd: E.lockedEfPln(), efT, liqT: num(this.s.liquidTargetPLN),
      unlocks, excessAfterUnlock: unlocks.length ? Math.max(0, E.efTotalPln() - efT) : 0,
      goals: P.goals.filter(g => !g.autoEF && g.funding === 'cash').map(g => ({name: g.name, ccy: g.ccy, targetDate: g.targetDate || '', ...(snaps[g.id] || E.goalCalc(g))})),
      price};
  }
}

// ---------- rules engine (§7) ----------
export const TIMING_PATTERNS = ['\\bwait', '\\bdip\\b', '\\bdips\\b', '\\b(good|bad|right|best|wrong) time\\b', '\\ball[- ]time[- ]high',
  '\\bATH\\b', '\\bcrash', '\\bcorrection', '\\bovervalued', '\\bundervalued', '\\bpull ?back', '\\bbubble', '\\bmomentum',
  '\\bpeak\\b', '\\bbottom', '\\b(buy|sell) signal', '\\btiming\\b', '\\bhold off\\b', '\\btoo (high|expensive)\\b', '\\bcheap\\b',
  '\\bpredict', '\\bforecast'];
export const BLOCKED_INSTRUMENTS = ['\\bVOO\\b', '\\bVTI\\b', '\\bQQQ\\b', '\\bSPY\\b', '\\bIVV\\b', '\\bVUSA\\b', '\\bCSPX\\b', '\\bSXR8\\b',
  '\\bEQQQ\\b', '\\bIWDA\\b', '\\bSWDA\\b', '\\bEUNL\\b', 'S&P', '\\bNasdaq', '\\bbitcoin', '\\bcrypto', '\\bstock pick', '\\bsector\\b',
  '\\bindividual stock'];
const ALLOWED_CAPS = new Set(['VWCE', 'EUR', 'PLN', 'USD', 'AZN', 'IBKR', 'BFG', 'ECB', 'NBP', 'DCA', 'FX', 'ETF', 'UCITS', 'ISIN', 'PIT', 'FIRE', 'EF']);
export function policyViolations(text, ownNames = []) {
  const hits = [];
  for (const p of TIMING_PATTERNS.concat(BLOCKED_INSTRUMENTS)) if (new RegExp(p, 'i').test(text)) hits.push(p);
  let rest = text;
  for (const n of [...ownNames].sort((a, b) => b.length - a.length)) rest = rest.split(n).join(' ');
  for (const tok of rest.match(/\b[A-Z][A-Z0-9]{2,5}\b/g) || []) if (!ALLOWED_CAPS.has(tok) && !/^IE[0-9A-Z]+$/.test(tok)) hits.push(tok);
  return hits;
}
export function advicePlan(c, avail) {
  const s = c.s, efT = num(s.efTargetPLN), efSaved = c.efTotalPln(), shortfall = Math.max(0, efT - efSaved);
  const liqT = num(s.liquidTargetPLN), liqNow = c.liquidEfPln(), locked = c.lockedEfPln(), liqGap = Math.max(0, liqT - liqNow);
  const movable = [];
  for (const a of c.S.accounts) {
    if (a.role === 'ef' || a.role === 'goal' || a.instant === false) continue;
    if (a.broker) continue;
    if (a.ccy !== 'PLN') continue;
    const keep = a.salary ? num(s.operatingFloatPLN) : 0;
    const pln = Math.max(0, c.accPln(a) - keep);
    if (pln > 0.5) movable.push({id: a.id, name: a.name, rate: num(a.rate), role: a.role, pln});
  }
  movable.sort((x, y) => x.rate - y.rate);
  let need = liqGap; const moves = [];
  for (const m of movable) {
    if (need <= 0.5) break;
    const take = Math.min(need, m.pln);
    moves.push({id: m.id, name: m.name, amt: jsRound(take), rate: m.rate, role: m.role});
    need -= take;
  }
  const movedTotal = moves.reduce((t, m) => t + m.amt, 0);
  const movedFromInvestable = moves.filter(m => m.role === 'invest').reduce((t, m) => t + m.amt, 0);
  const liqStillShort = Math.max(0, liqGap - movedTotal);
  const holdback = Math.min(shortfall, avail);
  const efAccounts = c.efAccounts();
  let topups = [];
  if (holdback > 0.5) {
    if (!efAccounts.length) topups = [{name: 'an instant-access savings account (add one in Accounts)', rate: 0, amt: holdback}];
    else {
      const per = efT / efAccounts.length;
      const defs = efAccounts.map(a => ({name: a.name, rate: num(a.rate), def: Math.max(0, per - c.accPln(a))}));
      const tot = defs.reduce((t, d) => t + d.def, 0);
      if (tot <= 0) topups = [{name: efAccounts[0].name, rate: num(efAccounts[0].rate), amt: holdback}];
      else {
        topups = defs.filter(d => d.def > 0).map(d => ({name: d.name, rate: d.rate, amt: holdback * d.def / tot}));
        let acc = 0;
        topups.forEach((t, i) => { t.amt = i === topups.length - 1 ? holdback - acc : jsRound(t.amt); acc += t.amt; });
      }
    }
  }
  const afterHold = Math.max(0, avail - holdback);
  const investPLN = Math.max(0, afterHold - Math.min(movedFromInvestable, afterHold));
  const investEUR = c.conv(investPLN, 'PLN', 'EUR'), price = num(c.S.market.price);
  const shares = price > 0 ? Math.floor(investEUR / price) : 0, orderEUR = shares * price;
  return {efT, efSaved, shortfall, holdback, topups, investPLN, investEUR, shares, orderEUR, leftoverEUR: investEUR - orderEUR, price,
          liqT, liqNow, locked, liqGap, moves, movedTotal, movedFromInvestable, liqStillShort};
}
export function adviceLines(c, p, avail) {
  const P = v => fmt(v, 'PLN', 0), lines = [`You have ${P(avail)} available.`];
  if (p.holdback > 0.5) lines.push(`Hold back ${P(p.holdback)} as reserve (${p.topups.map(t => `${P(t.amt)} → ${t.name}`).join(', ')}) — you're at ${P(p.efSaved)} of your ${P(p.efT)} target.`);
  else lines.push(`Emergency fund is at target (${P(p.efSaved)} / ${P(p.efT)}) — nothing to hold back.`);
  if (p.liqGap > 0.5) {
    let msg = `Instant access is ${P(p.liqNow)} of your ${P(p.liqT)} target`;
    if (p.moves.length) msg += ' — move ' + p.moves.map(m => `${P(m.amt)} from ${m.name}`).join(' + ') + ' into instant-access savings first';
    lines.push(msg + '.');
    if (p.liqStillShort > 0.5) lines.push(`Still ${P(p.liqStillShort)} short of instant access${p.moves.length ? ' after that' : ''} — build it from monthly income.`);
  }
  const price = fmtN(p.price, 2, true);
  if (p.shares > 0) {
    lines.push(`Invest the remaining ${P(p.investPLN)} → ~${p.shares} VWCE shares at €${price}, as one order.`);
    lines.push(`Leftover after whole shares: €${fmtN(p.leftoverEUR, 2, true)} — stays in IBKR for the next DCA order.`);
  } else if (p.investPLN > 0.5) lines.push(`The remaining ${P(p.investPLN)} is less than one VWCE share (€${price}) — add it to next month's DCA order.`);
  else lines.push('All of it goes to the reserve this time.');
  return lines;
}
export function advise(c, amount, ccy = 'PLN') {
  const avail = CCYS.includes(ccy) ? c.conv(num(amount), ccy, 'PLN') : 0;
  if (avail <= 0) return {status: 'need_cash', lines: [], ask: "Enter how much cash you have available (any currency), or use your investable cash. I won't guess."};
  if (num(c.S.market.price) <= 0) return {status: 'need_price', lines: [], ask: 'There is no VWCE price yet — refresh prices or enter it in Settings.'};
  const warnings = [];
  if (c.stale(c.S.market.asOf)) warnings.push(`VWCE price is from ${c.S.market.asOf || 'an unknown date'} (over 7 days old) — refresh before placing the order.`);
  if (c.stale(c.S.fx.asOf)) warnings.push(`FX rates are from ${c.S.fx.asOf || 'an unknown date'} (over 7 days old) — refresh before converting.`);
  const p = advicePlan(c, avail), lines = adviceLines(c, p, avail);
  const names = c.S.accounts.map(a => a.name);
  const bad = lines.flatMap(l => policyViolations(l, names));
  if (bad.length) return {status: 'policy_error', lines: [], ask: 'Advice text failed the policy check and was withheld.', debug: bad};
  return {status: 'ok', plan: p, lines, warnings, availPLN: avail};
}


export function forecastLines(c, f) {
  const P = v => fmt(v, 'PLN', 0), end = f.end, rc = c.rc;
  const d = f.netWorthEnd - f.netWorthStart, bought = f.sharesEnd - f.sharesStart;
  const out = [`Following your Budget, on ${end} you'd hold ${P(f.cashEnd)} in cash and ${fmtN(f.sharesEnd, 2)} VWCE shares ` +
    `(+${fmtN(Math.max(0, bought), 2)}). Net worth ${fmt(f.netWorthStart, rc, 0)} → ${fmt(f.netWorthEnd, rc, 0)} ` +
    `(${d >= 0 ? '+' : '-'}${fmt(Math.abs(d), rc, 0)} saved; prices kept at today's €${fmtN(f.price, 2, true)}).`];
  for (const r of f.rows) if (r.salaryEnd < -0.5) out.push(`${monthLabel(r.k)}: the salary account would go ${P(-r.salaryEnd)} below zero — trim that month's plan.`);
  if (f.liqEnd + 0.5 >= f.liqT) out.push(`Instant-access reserve reaches its ${P(f.liqT)} target (${P(f.liqEnd)}).`);
  else out.push(`Instant-access reserve ends at ${P(f.liqEnd)} of ${P(f.liqT)} — add ${P(f.liqT - f.liqEnd)} to the Reserve top-up line in the Budget.`);
  for (const u of f.unlocks) {
    let msg = `On ${u.date} ${u.name} unlocks (${P(u.pln)}).`;
    if (f.excessAfterUnlock > 0.5) msg += ` Your reserve would then be ${P(f.efEnd)} against a ${P(f.efT)} target — ${P(f.excessAfterUnlock)} above it.` +
      ' Your rules: keep the reserve at target; the extra goes to VWCE in one order, or to a near-term cash goal.';
    out.push(msg);
  }
  for (const g of f.goals) {
    if (!g.targetDate || g.targetDate > end) continue;
    if (g.pct >= 1) out.push(`${g.name}: fully funded by ${g.targetDate} ✓`);
    else out.push(`${g.name} would be at ${fmt(g.saved, g.ccy, 0)} of ${fmt(g.saved + g.remaining, g.ccy, 0)} on ${g.targetDate} — ${fmt(g.remaining, g.ccy, 0)} short.`);
  }
  const unplanned = f.rows.filter(r => !r.planned).map(r => monthLabel(r.k));
  if (unplanned.length) out.push(`${unplanned.join(', ')}: no budget yet — your category targets were used.`);
  const names = c.S.accounts.map(a => a.name).concat(c.S.goals.map(g => g.name));
  return out.filter(l => policyViolations(l, names).length === 0);
}

// ---------- investment policy ----------
export class PolicyError extends Error {}
const rule = (S, key) => { const r = S.policy.rules.find(x => x.key === key); if (!r) throw new PolicyError('Unknown rule'); return r; };
export function requestChange(S, key, newValue, reason, today) {
  const r = rule(S, key);
  newValue = String(newValue ?? '').trim(); reason = String(reason ?? '').trim();
  if (!newValue || newValue === r.value) throw new PolicyError('Write the new rule text (different from the current one).');
  if (reason.length < MIN_REASON) throw new PolicyError(`Write your reason — at least ${MIN_REASON} characters. Why do you want this change?`);
  if (S.policy.changes.some(ch => ch.ruleKey === key && ch.status === 'pending')) throw new PolicyError('There is already a pending change for this rule. Cancel it first.');
  const id = Math.max(0, ...S.policy.changes.map(ch => ch.id)) + 1;
  const ch = {id, ruleKey: key, oldValue: r.value, newValue: newValue.slice(0, 500), reason: reason.slice(0, 1000),
              requestedAt: today, effectiveAt: addDays(today, COOLING_OFF_DAYS), status: 'pending', decidedAt: null};
  S.policy.changes.push(ch);
  return ch;
}
export function addDays(iso, n) { const d = new Date(utc(iso) + n * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
const openChange = (S, id) => {
  const ch = S.policy.changes.find(x => x.id === id);
  if (!ch) throw new PolicyError('Change not found');
  if (ch.status !== 'pending') throw new PolicyError('This change is already closed');
  return ch;
};
export const daysLeft = (ch, today) => Math.max(0, daysBetween(today, ch.effectiveAt));
export function cancelChange(S, id, today) { Object.assign(openChange(S, id), {status: 'cancelled', decidedAt: today}); }
export function applyChange(S, id, today) {
  const ch = openChange(S, id);
  if (daysLeft(ch, today) > 0) throw new PolicyError(`Cooling-off: ${daysLeft(ch, today)} days left (until ${ch.effectiveAt}).`);
  const r = rule(S, ch.ruleKey);
  if (r.value !== ch.oldValue) throw new PolicyError('The rule changed since this request — cancel it and request again.');
  r.value = ch.newValue;
  Object.assign(ch, {status: 'applied', decidedAt: today});
}

// ---------- actions (the only way the UI changes data) ----------
export class ActionError extends Error {}
const rid = (n = 4) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
function number(v, what, {positive = false, minimum = null} = {}) {
  let n; try { n = parseAmount(v); } catch (_) { throw new ActionError(`${what}: “${v}” is not a number`); }
  if (positive && n <= 0) throw new ActionError(`${what} must be above 0`);
  if (minimum !== null && n < minimum) throw new ActionError(`${what} can't be below ${minimum}`);
  return n;
}
function text(v, what, max = 80) { v = String(v ?? '').trim(); if (!v) throw new ActionError(`${what} can't be empty`); return v.slice(0, max); }
function dateIn(v, what) { v = String(v ?? '').trim(); if (v && !parseDate(v)) throw new ActionError(`${what}: not a date`); return v.slice(0, 10); }
const NUM_SETTINGS = {age: {minimum: 0}, fireAge: {minimum: 0}, stretchAge: {minimum: 0}, retireSpend: {minimum: 0}, monthlySpendPLN: {minimum: 0},
  multiplier: {positive: true}, realReturn: {}, efTargetPLN: {minimum: 0}, liquidTargetPLN: {minimum: 0}, salaryAmt: {minimum: 0},
  inflationPct: {}, belkaPct: {minimum: 0}, operatingFloatPLN: {minimum: 0}, salaryDay: {minimum: 1}};
const CHOICE_SETTINGS = {reportCcy: ['EUR', 'PLN'], salaryCcy: CCYS, retireSpendCcy: CCYS};
const LABELS = {age: 'Age', fireAge: 'FIRE age', stretchAge: 'Stretch age', retireSpend: 'Retirement spend', monthlySpendPLN: 'Current monthly spending',
  multiplier: 'Multiplier', realReturn: 'Real return', efTargetPLN: 'Emergency fund target', liquidTargetPLN: 'Instant-access target',
  salaryAmt: 'Salary', inflationPct: 'Inflation', belkaPct: 'Belka %', operatingFloatPLN: 'Salary-account float', salaryDay: 'Salary day'};
const find = (list, id, what) => { const x = list.find(o => o.id === id); if (!x) throw new ActionError(`${what} not found`); return x; };
function monthArg(a) { const k = String(a.month || ''); if (k.length !== 7 || !parseDate(k + '-01')) throw new ActionError('Pick a month first'); return k; }
function ensureMonth(S, k, today) {
  let m = S.budget.months[k];
  if (!m) {
    m = S.budget.months[k] = {incomes: [{id: 'i1', label: 'Salary', amount: num(S.settings.salaryAmt), ccy: S.settings.salaryCcy || 'PLN'}], alloc: {}};
    const c = new Calc(S, today);
    m.alloc = c.proposedAlloc(c.monthIncomePln(k));
  }
  return m;
}
export const ACTIONS = {
  setRep(S, a) { S.settings.reportCcy = ['EUR', 'PLN'].includes(a.value) ? a.value : 'EUR'; },
  set(S, a, today) {
    const path = String(a.path || ''), v = a.value;
    if (path.startsWith('settings.')) {
      const k = path.slice(9);
      if (k in NUM_SETTINGS) {
        const n = number(v, LABELS[k], NUM_SETTINGS[k]);
        if (k === 'salaryDay' && n > 28) throw new ActionError('Salary day must be 1–28');
        S.settings[k] = ['salaryDay', 'fireAge', 'stretchAge'].includes(k) ? Math.trunc(n) : n;
        if (k === 'age') S.settings.ageAsOf = today;
      } else if (k in CHOICE_SETTINGS) {
        if (!CHOICE_SETTINGS[k].includes(v)) throw new ActionError('Not an allowed choice');
        S.settings[k] = v;
      } else throw new ActionError('Unknown setting');
    } else if (['market.price', 'fx.EURPLN', 'fx.USDPLN'].includes(path)) {
      const n = number(v, {'market.price': 'VWCE price', 'fx.EURPLN': 'EUR/PLN', 'fx.USDPLN': 'USD/PLN'}[path], {positive: true});
      const [g, key] = path.split('.');
      S[g][key] = n; Object.assign(S[g], {asOf: today, source: 'manual entry', fetchedAt: null});
    } else throw new ActionError('Unknown field');
    return 'Saved.';
  },
  accSet(S, a) {
    const acc = find(S.accounts, a.id, 'Account'), f = a.field, v = a.value;
    if (f === 'name') acc.name = text(v, 'Name');
    else if (f === 'ccy') { if (!CCYS.includes(v)) throw new ActionError('Unknown currency'); acc.ccy = v; }
    else if (f === 'balance') acc.balance = number(v, 'Balance');
    else if (f === 'rate') acc.rate = number(v, 'Rate', {minimum: 0});
    else if (f === 'rateUntil') { const d = dateIn(v, 'Promo end date'); if (d) acc.rateUntil = d; else delete acc.rateUntil; }
    else if (f === 'role') { if (!['ef', 'invest', 'goal', 'other'].includes(v)) throw new ActionError('Unknown role'); acc.role = v; }
    else if (f === 'instant' || f === 'broker') acc[f] = !!v;
    else if (f === 'salary') { S.accounts.forEach(x => { x.salary = false; }); acc.salary = !!v; }
    else throw new ActionError('Unknown field');
    return 'Saved.';
  },
  accAdd(S) { S.accounts.push({id: rid(), name: 'New account', ccy: 'PLN', balance: 0, rate: 0, role: 'other', instant: true, salary: false, broker: false}); return 'Account added — fill it in below.'; },
  accDel(S, a) {
    const acc = find(S.accounts, a.id, 'Account');
    S.accounts.splice(S.accounts.indexOf(acc), 1);
    for (const x of S.budget.categories.concat(S.goals)) { if (x.toAccount === acc.id) x.toAccount = null; if (x.account === acc.id) x.account = null; if (x.fromAccount === acc.id) x.fromAccount = null; }
    return `Deleted ${acc.name}.`;
  },
  bEnsure(S, a, today) { ensureMonth(S, monthArg(a), today); return 'Month set up from your targets — adjust anything.'; },
  bPropose(S, a, today) { const k = monthArg(a), m = ensureMonth(S, k, today), c = new Calc(S, today); m.alloc = c.proposedAlloc(c.monthIncomePln(k)); return 'Split proposed from your targets — adjust freely.'; },
  bAlloc(S, a, today) { const m = ensureMonth(S, monthArg(a), today); find(S.budget.categories, a.id, 'Category'); m.alloc[a.id] = number(a.value, 'Amount', {minimum: 0}); },
  bIncAdd(S, a, today) { ensureMonth(S, monthArg(a), today).incomes.push({id: rid(3), label: 'Extra income', amount: 0, ccy: 'PLN'}); },
  bIncSet(S, a, today) {
    const i = find(ensureMonth(S, monthArg(a), today).incomes, a.id, 'Income'), f = a.field, v = a.value;
    if (f === 'label') i.label = text(v, 'Label'); else if (f === 'amount') i.amount = number(v, 'Amount', {minimum: 0});
    else if (f === 'ccy' && CCYS.includes(v)) i.ccy = v; else throw new ActionError('Unknown field');
  },
  bIncDel(S, a, today) { const m = ensureMonth(S, monthArg(a), today); m.incomes.splice(m.incomes.indexOf(find(m.incomes, a.id, 'Income')), 1); },
  catSet(S, a) {
    const c = find(S.budget.categories, a.id, 'Category'), f = a.field, v = a.value;
    if (f === 'name') c.name = text(v, 'Name');
    else if (f === 'kind' && ['spend', 'save', 'invest'].includes(v)) c.kind = v;
    else if (f === 'mode' && ['fixed', 'pct'].includes(v)) c.mode = v;
    else if (f === 'value') c.value = number(v, 'Target', {minimum: 0});
    else if (f === 'payVia' && ['card', 'cash', 'transfer', 'pot'].includes(v)) c.payVia = v;
    else if (f === 'fromAccount') { if (v && !S.accounts.some(x => x.id === v)) throw new ActionError('Account not found'); c.fromAccount = v || null; }
    else if (f === 'toAccount') { if (v && !S.accounts.some(x => x.id === v)) throw new ActionError('Account not found'); c.toAccount = v || null; }
    else throw new ActionError('Unknown field');
  },
  catAdd(S) { S.budget.categories.push({id: rid(), name: 'New category', kind: 'spend', mode: 'fixed', value: 0, payVia: 'card'}); return 'Category added.'; },
  catDel(S, a) { const c = find(S.budget.categories, a.id, 'Category'); S.budget.categories.splice(S.budget.categories.indexOf(c), 1); return `Removed ${c.name} (past months keep their numbers).`; },
  lotAdd(S, a) {
    const d = dateIn(a.date, 'Date'); if (!d) throw new ActionError('Enter the purchase date');
    const sh = number(a.shares, 'Shares', {positive: true}), pr = number(a.price, 'Price', {positive: true});
    S.lots.push({id: rid(), date: d, shares: sh, price: pr, ccy: CCYS.includes(a.ccy) ? a.ccy : 'EUR', isin: VWCE_ISIN, est: false, source: 'manual'});
    S.lots.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    return 'Purchase logged.';
  },
  lotSet(S, a) {
    const l = find(S.lots, a.id, 'Purchase'), f = a.field, v = a.value;
    if (f === 'date') { const d = dateIn(v, 'Date'); if (!d) throw new ActionError('Enter a date'); l.date = d; }
    else if (f === 'shares' || f === 'price') l[f] = number(v, f[0].toUpperCase() + f.slice(1), {positive: true});
    else if (f === 'ccy' && CCYS.includes(v)) l.ccy = v; else throw new ActionError('Unknown field');
    l.est = false;
  },
  lotDel(S, a) { S.lots.splice(S.lots.indexOf(find(S.lots, a.id, 'Purchase')), 1); return 'Purchase deleted.'; },
  dcaTick(S, a) { const k = monthArg(a); S.dca.log[k] = !S.dca.log[k]; },
  goalAdd(S, a) {
    const [name, target] = ({car: ['Car', 60000], flat: ['Flat down-payment', 100000], trip: ['Trip', 5000], custom: ['New goal', 0]})[a.value] || ['New goal', 0];
    S.goals.push({id: rid(), name, target, ccy: 'PLN', targetDate: '', funding: 'cash', saved: 0, monthlySave: 0, autoEF: false});
    return 'Goal added — edit the amounts.';
  },
  goalSet(S, a) {
    const g = find(S.goals, a.id, 'Goal'), f = a.field, v = a.value;
    if (f === 'name') g.name = text(v, 'Name');
    else if (['target', 'saved', 'monthlySave'].includes(f)) g[f] = number(v, 'Amount', {minimum: 0});
    else if (f === 'ccy' && CCYS.includes(v)) g.ccy = v;
    else if (f === 'targetDate') g.targetDate = dateIn(v, 'Target date');
    else if (f === 'funding' && ['cash', 'portfolio'].includes(v)) g.funding = v;
    else if (f === 'account') { if (v && !S.accounts.some(x => x.id === v)) throw new ActionError('Account not found'); g.account = v || null; }
    else throw new ActionError('Unknown field');
  },
  goalDel(S, a) { const g = find(S.goals, a.id, 'Goal'); S.goals.splice(S.goals.indexOf(g), 1); return `Deleted ${g.name}.`; },
  policyRequest(S, a, today) { const ch = wrapPolicy(() => requestChange(S, a.id, a.newValue, a.reason, today)); return `Logged. Cooling-off until ${ch.effectiveAt} — you can cancel any time before then.`; },
  policyCancel(S, a, today) { wrapPolicy(() => cancelChange(S, intArg(a.id), today)); return 'Change cancelled — the rule stays as it was.'; },
  policyApply(S, a, today) { wrapPolicy(() => applyChange(S, intArg(a.id), today)); return 'Rule updated and logged.'; },
};
function intArg(v) { const n = Number(v); if (!Number.isInteger(n)) throw new ActionError('Bad id'); return n; }
function wrapPolicy(fn) { try { return fn(); } catch (e) { if (e instanceof PolicyError) throw new ActionError(e.message); throw e; } }
export function runAction(S, name, args, today) {
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, name)) throw new ActionError(`Unknown action ${JSON.stringify(name)}`);
  return ACTIONS[name](S, args || {}, today) ?? null;
}

// ---------- import / export (same JSON format as the PC app) ----------
export class ImportProblem extends Error {}
const need = (c, msg) => { if (!c) throw new ImportProblem(msg); };
const ccyOf = (v, where) => { need(CCYS.includes(v), `${where}: unknown currency ${JSON.stringify(v)}`); return v; };
const dateOrBlank = (v, where) => { if (v === null || v === undefined || v === '') return ''; need(parseDate(v) !== null, `${where}: bad date ${JSON.stringify(v)}`); return String(v).slice(0, 10); };
const clone = o => JSON.parse(JSON.stringify(o));
function take(o, k, d) { const v = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d; delete o[k]; return v; }
function account(a, proto) {
  a = clone(a); need(a.id && a.name !== undefined && a.name !== null, 'account without id/name');
  const out = {id: String(take(a, 'id')), name: String(take(a, 'name')), ccy: ccyOf(take(a, 'ccy'), 'account'),
               balance: num(take(a, 'balance', 0)), rate: num(take(a, 'rate', 0)), role: take(a, 'role', 'other')};
  need(['ef', 'invest', 'goal', 'other'].includes(out.role), `account ${out.name}: unknown role`);
  if (proto) { out.instant = take(a, 'liquid', true) !== false; out.salary = !!take(a, 'salaryAcct', false); }
  else { out.instant = !!take(a, 'instant', true); out.salary = !!take(a, 'salary', false); }
  out.broker = !!take(a, 'broker', false);
  const ru = dateOrBlank(take(a, 'rateUntil', ''), `account ${out.name}`); if (ru) out.rateUntil = ru;
  return Object.assign(out, a);
}
function lot(l) {
  l = clone(l);
  const out = {id: String(take(l, 'id')), date: dateOrBlank(take(l, 'date', ''), 'lot'), shares: num(take(l, 'shares', 0)), price: num(take(l, 'price', 0)),
               ccy: ccyOf(take(l, 'ccy', 'EUR') || 'EUR', 'lot'), isin: take(l, 'isin', VWCE_ISIN), est: !!take(l, 'est', false), source: take(l, 'source', 'manual')};
  need(out.date, 'lot without date');
  const tid = take(l, 'tradeId', null); if (tid) out.tradeId = tid;
  return Object.assign(out, l);
}
function category(c, proto) {
  c = clone(c);
  const out = {id: String(take(c, 'id')), name: String(take(c, 'name', '')), kind: take(c, 'kind', 'spend'), mode: take(c, 'mode', 'fixed'), value: num(take(c, 'value', 0))};
  need(['spend', 'save', 'invest'].includes(out.kind), `category ${out.name}: unknown kind`);
  need(['fixed', 'pct'].includes(out.mode), `category ${out.name}: unknown mode`);
  let pay = take(c, 'payVia', null);
  if (!pay) pay = proto && ['rent', 'util'].includes(out.id) ? 'cash' : (out.kind === 'spend' ? 'card' : 'transfer');
  out.payVia = pay;
  return Object.assign(out, c);
}
function goal(g) {
  g = clone(g);
  const out = {id: String(take(g, 'id')), name: String(take(g, 'name', '')), target: num(take(g, 'target', 0)), ccy: ccyOf(take(g, 'ccy', 'PLN'), 'goal'),
               targetDate: dateOrBlank(take(g, 'targetDate', ''), 'goal'), funding: take(g, 'funding', 'cash'), saved: num(take(g, 'saved', 0)),
               monthlySave: num(take(g, 'monthlySave', 0)), autoEF: !!take(g, 'autoEF', false)};
  need(['cash', 'portfolio'].includes(out.funding), `goal ${out.name}: unknown funding`);
  return Object.assign(out, g);
}
function months(ms) {
  const out = {};
  for (const [k, m0] of Object.entries(ms || {})) {
    need(k.length === 7 && parseDate(k + '-01'), `bad budget month ${JSON.stringify(k)}`);
    const m = clone(m0);
    const incomes = (take(m, 'incomes', []) || []).map(i => ({id: String(i.id), label: String(i.label ?? ''), amount: num(i.amount ?? 0), ccy: ccyOf(i.ccy ?? 'PLN', `income ${k}`)}));
    const alloc = {}; for (const [cid, v] of Object.entries(take(m, 'alloc', {}) || {})) alloc[String(cid)] = num(v);
    out[k] = {incomes, alloc, ...m};
  }
  return out;
}
function fx(f = {}) { const o = {EURPLN: num(f.EURPLN), USDPLN: num(f.USDPLN), asOf: f.asOf ?? null, source: f.source ?? null, fetchedAt: f.fetchedAt ?? null}; need(o.EURPLN > 0 && o.USDPLN > 0, 'FX rates missing'); return o; }
const market = (m = {}) => ({price: num(m.price), asOf: m.asOf ?? null, source: m.source ?? null, fetchedAt: m.fetchedAt ?? null});
function policy(p) {
  if (!p) return defaultPolicy();
  const rules = (p.rules || []).map(r => ({key: String(r.key), label: String(r.label), value: String(r.value)}));
  need(rules.length, 'policy has no rules');
  const changes = (p.changes || []).map(ch => {
    need(['pending', 'applied', 'cancelled'].includes(ch.status), 'bad policy change status');
    return {id: Number(ch.id), ruleKey: String(ch.ruleKey), oldValue: ch.oldValue ?? null, newValue: String(ch.newValue), reason: String(ch.reason),
            requestedAt: dateOrBlank(ch.requestedAt, 'policy change'), effectiveAt: dateOrBlank(ch.effectiveAt, 'policy change'), status: ch.status, decidedAt: ch.decidedAt ?? null};
  });
  return {rules, changes};
}
function unique(items, where) { const ids = items.map(x => x.id); need(new Set(ids).size === ids.length, `${where}: duplicate ids`); }
function validate(S) {
  unique(S.accounts, 'accounts'); unique(S.lots, 'lots'); unique(S.goals, 'goals'); unique(S.budget.categories, 'budget categories');
  need(['EUR', 'PLN'].includes(S.settings.reportCcy), 'reportCcy must be EUR or PLN');
  need(S.accounts.filter(a => a.salary).length <= 1, 'more than one salary account');
}
export function parseAny(d) {
  need(d && typeof d === 'object' && !Array.isArray(d), 'not a JSON object');
  let S;
  if (d.app === 'FIRE Manager') {
    need(d.format === EXPORT_FORMAT, `unsupported export format ${JSON.stringify(d.format)}`);
    const b = d.budget || {};
    S = {settings: {...DEFAULT_SETTINGS, ...(d.settings || {})}, fx: fx(d.fx), market: market(d.market),
         accounts: (d.accounts || []).map(a => account(a, false)), lots: (d.lots || []).map(lot),
         dca: {log: Object.fromEntries(Object.entries((d.dca || {}).log || {}).map(([k, v]) => [String(k), !!v]))},
         budget: {categories: (b.categories || []).map(c => category(c, false)), months: months(b.months)},
         goals: (d.goals || []).map(goal), policy: policy(d.policy), legacy: clone(d.legacy || {})};
  } else {
    need('settings' in d && 'accounts' in d, 'not a FIRE Manager backup (no settings/accounts)');
    const src = clone(d), sIn = {...(src.settings || {})}, settings = {...DEFAULT_SETTINGS}, legacy = {};
    if ('annualSpend' in sIn) { legacy.annualSpend = sIn.annualSpend; settings.retireSpend = num(sIn.annualSpend); settings.retireSpendCcy = sIn.reportCcy || 'EUR'; delete sIn.annualSpend; }
    if ('monthlyContribPLN' in sIn) { legacy.monthlyContribPLN = sIn.monthlyContribPLN; delete sIn.monthlyContribPLN; }
    Object.assign(settings, sIn);
    const dca = src.dca || {};
    if ('amount' in dca) legacy.dcaAmount = dca.amount;
    for (const k of ['ui', 'seedV7', 'v']) if (k in src) legacy[k] = src[k];
    const known = new Set(['v', 'ui', 'settings', 'seedV7', 'fx', 'market', 'accounts', 'lots', 'dca', 'budget', 'goals']);
    for (const k of Object.keys(src)) if (!known.has(k)) legacy[k] = src[k];
    const b = src.budget || {};
    S = {settings, fx: fx(src.fx), market: market(src.market), accounts: (src.accounts || []).map(a => account(a, true)),
         lots: (src.lots || []).map(lot), dca: {log: Object.fromEntries(Object.entries(dca.log || {}).map(([k, v]) => [String(k), !!v]))},
         budget: {categories: (b.categories || []).map(c => category(c, true)), months: months(b.months)},
         goals: (src.goals || []).map(goal), policy: defaultPolicy(), legacy};
  }
  validate(S);
  return S;
}
export function toExport(S, now = new Date()) {
  const out = {app: 'FIRE Manager', format: EXPORT_FORMAT, exportedAt: now.toISOString().slice(0, 19)};
  for (const k of ['settings', 'fx', 'market', 'accounts', 'lots', 'dca', 'budget', 'goals', 'policy', 'legacy']) out[k] = clone(S[k]);
  return out;
}
export const summary = S => ({accounts: S.accounts.length, lots: S.lots.length, goals: S.goals.length,
  budgetMonths: Object.keys(S.budget.months).length, categories: S.budget.categories.length, dcaMonths: Object.keys(S.dca.log).length});

// ---------- live data (read-only, on demand) ----------
export const PRICE_BAND = [10, 2000], EURPLN_BAND = [2, 10], EURUSD_BAND = [0.5, 3];
const inBand = (v, b) => typeof v === 'number' && b[0] < v && v < b[1];
export function parsePriceFile(p) {
  // price.json is written daily by the site's GitHub Action from justETF (same format as justETF's quote API)
  const v = p && p.latestQuote ? p.latestQuote.raw : undefined;
  if (!inBand(v, PRICE_BAND)) throw new Error(`unexpected price ${JSON.stringify(v)}`);
  return {price: v, asOf: p.latestQuoteDate || null, source: `justETF (${p.quoteTradingVenue || '?'}) via daily update`};
}
export function parseFx(f) {
  const r = (f && f.rates) || {};
  if (!inBand(r.PLN, EURPLN_BAND) || !inBand(r.USD, EURUSD_BAND)) throw new Error(`unexpected rates ${JSON.stringify(r)}`);
  return {EURPLN: r.PLN, USDPLN: r.PLN / r.USD, asOf: f.date || null, source: 'ECB via frankfurter.dev'};
}
