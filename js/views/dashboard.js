// ============================================================================
// XAURA · js/views/dashboard.js — #/inicio (SPEC §6.1)
//
// Contrato de vista: render(params) · unmount(). Pinta dentro de #view.
// Orden de scroll (A→F):
//   A. Saludo por hora + chip de racha (+ banner "registra hoy")
//   B. Hero PATRIMONIO TOTAL (globalSnapshot) con toggle "Todo en COP / Por moneda"
//   C. Snapshot de HOY (ingresos/gastos COP + trading USD + balance del día)
//   D. 4 accesos rápidos (Ingreso/Gasto/Evento/Día trading → #/registrar?tipo=…)
//   E. 3 tarjetas KPI por módulo con sparkline (tap → módulo)
//   F. Donut global de patrimonio (normalizado a COP)
// Estado vacío elegante si no hay ningún dato.
//
// Dependencias (firmas reales leídas de disco):
//   ../ui/header.js        setHeader
//   ../ui/charts.js        sparkline, donut
//   ../ui/empty.js         emptyState
//   ../core/currency.js    fmtCOP, fmtUSD, fmtPct, fmtSigned, maskValue, toNum
//   ../core/dates.js       hoy, formatDateEs, monthKey, parseLocalDate
//   ../core/settings.js    getSettings, updateSettings
//   ../core/streak.js      getStreak, needsTodayRegister
//   ../core/aggregations.js  globalSnapshot, todaySnapshot, dailyCashflow,
//                            eventsRevenue, equityCurve, monthlyEventsPL,
//                            upcomingEvents, savingsRate, tradingStats
//   ../core/personal.js    getAccounts, getTransactions
//   ../core/events.js      getEvents
//   ../core/trading.js     getTradingAccounts, getTradeDays
//   ../router.js           navigate
// ============================================================================

import { setHeader } from '../ui/header.js';
import { sparkline, donut } from '../ui/charts.js';
import { emptyState } from '../ui/empty.js';

import {
  fmtCOP, fmtUSD, fmtPct, fmtSigned, maskValue, toNum,
} from '../core/currency.js';
import { hoy, formatDateEs, monthKey, parseLocalDate } from '../core/dates.js';
import { getSettings, updateSettings } from '../core/settings.js';
import { getStreak, needsTodayRegister } from '../core/streak.js';

import {
  globalSnapshot, todaySnapshot, dailyCashflow, eventsRevenue,
  equityCurve, monthlyEventsPL, upcomingEvents, savingsRate, tradingStats,
} from '../core/aggregations.js';

import { getAccounts, getTransactions } from '../core/personal.js';
import { getEvents } from '../core/events.js';
import { getTradingAccounts, getTradeDays } from '../core/trading.js';

import { navigate } from '../router.js';

/* ============================================================================
 *  ESTADO DEL MÓDULO
 * ========================================================================== */
let _busOff = null;     // desuscriptor del bus
let _bus = null;        // referencia al bus de la app (window.XAURA.bus)
let _mounted = false;

/* ============================================================================
 *  ICONOS DE LÍNEA (Tabler-like)
 * ========================================================================== */
const I = {
  income:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>',
  expense:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
  event:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  trade:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v4M8 15v4"/><rect x="6" y="9" width="4" height="6" rx="1"/><path d="M16 4v3M16 13v3"/><rect x="14" y="7" width="4" height="6" rx="1"/></svg>',
  wallet:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1"/><path d="M3 7v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3"/><path d="M21 11h-4a2 2 0 0 0 0 4h4z"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1 .3-2 1-3 .2 1 .8 1.6 1.5 1.8C10.2 7.7 11 5.4 12 3z"/></svg>',
  swap:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
  spark:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z"/></svg>',
};

/* ============================================================================
 *  HELPERS DE DOM
 * ========================================================================== */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined && html !== null) n.innerHTML = html;
  return n;
}

function viewRoot() {
  return document.getElementById('view');
}

function getBus() {
  if (_bus) return _bus;
  if (typeof window !== 'undefined' && window.XAURA && window.XAURA.bus) {
    _bus = window.XAURA.bus;
  }
  return _bus;
}

/* ============================================================================
 *  ¿Hay algún dato registrado en la app?
 * ========================================================================== */
function hasAnyData() {
  const accs = getAccounts({ includeArchived: true });
  if (accs && accs.length) return true;
  const txns = getTransactions({ limit: 1 });
  if (txns && txns.length) return true;
  const evs = getEvents ? getEvents({}) : [];
  if (evs && evs.length) return true;
  const tAccs = getTradingAccounts({ includeArchived: true });
  if (tAccs && tAccs.length) return true;
  const days = getTradeDays({});
  if (days && days.length) return true;
  return false;
}

/* ============================================================================
 *  SALUDO POR HORA
 * ========================================================================== */
function saludoPorHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ============================================================================
 *  RENDER PRINCIPAL
 * ========================================================================== */
export function render(_params) {
  _mounted = true;
  const root = viewRoot();
  if (!root) return;

  // Cabecera: marca sutil de la app (sin navegación de día en el dashboard).
  setHeader({ title: 'Inicio' });

  root.replaceChildren();

  const settings = getSettings();

  // --- Estado vacío elegante si no hay nada registrado ---
  if (!hasAnyData()) {
    renderEmpty(root);
    wireBus();
    return;
  }

  const container = el('div', 'dashboard enter stack-lg');

  // A. Saludo + racha
  container.appendChild(buildGreeting(settings));

  // Banner "registra hoy" (racha viva pero sin registro hoy).
  const banner = buildStreakBanner();
  if (banner) container.appendChild(banner);

  // B. Hero patrimonio
  container.appendChild(buildHero(settings));

  // C. Snapshot de HOY
  container.appendChild(buildTodaySnapshot(settings));

  // D. Accesos rápidos
  container.appendChild(buildQuickActions());

  // E. 3 tarjetas KPI por módulo
  container.appendChild(buildModuleCards(settings));

  // F. Donut global de patrimonio
  container.appendChild(buildDonutSection(settings));

  root.appendChild(container);

  // Render diferido de los gráficos (tras pintar el layout).
  requestAnimationFrame(() => {
    drawSparklines();
    drawDonut(settings);
  });

  wireBus();
}

/* ============================================================================
 *  A. SALUDO + RACHA
 * ========================================================================== */
function buildGreeting(settings) {
  const wrap = el('div', 'greeting');

  const left = el('div', null);
  const nombre = (settings && settings.userName ? settings.userName : '').trim();
  const hi = el('div', 'greeting__hi',
    escapeHtml(saludoPorHora()) + (nombre ? ', ' + escapeHtml(nombre) : '') + '.');
  const fecha = el('div', 'greeting__date', formatDateEs(hoy(), { weekday: true, long: true }));
  left.append(hi, fecha);
  wrap.appendChild(left);

  // Chip de racha.
  const streak = getStreak();
  const chip = el('div', 'streak-chip');
  chip.appendChild(el('span', 'streak-chip__flame', I.flame));
  chip.appendChild(el('span', 'streak-chip__count', String(streak.count || 0)));
  chip.appendChild(el('span', 'streak-chip__unit', streak.count === 1 ? 'día' : 'días'));
  chip.title = 'Racha de registros consecutivos';
  wrap.appendChild(chip);

  return wrap;
}

function buildStreakBanner() {
  if (!needsTodayRegister()) return null;
  const banner = el('div', 'streak-banner pressable');
  banner.appendChild(el('span', null, I.flame));
  banner.appendChild(el('span', null, 'Aún no registras nada hoy. ¡Mantén tu racha!'));
  banner.addEventListener('click', () => navigate('#/registrar'));
  return banner;
}

/* ============================================================================
 *  B. HERO PATRIMONIO TOTAL
 *  Toggle "Todo en COP / Por moneda" persistido en settings.ui.showCop.
 *  (showCop=true → todo consolidado en COP; false → COP + USD por separado.)
 * ========================================================================== */
function buildHero(settings) {
  const snap = globalSnapshot();
  const showCop = !(settings && settings.ui && settings.ui.showCop === false);

  const hero = el('div', 'hero-patrimonio pressable');
  hero.setAttribute('role', 'button');
  hero.setAttribute('aria-label', 'Patrimonio total. Toca para cambiar entre COP y por moneda.');

  hero.appendChild(el('div', 'hero-patrimonio__label', 'Patrimonio total'));

  const valWrap = el('div', null);
  valWrap.id = 'hero-value';
  renderHeroValue(valWrap, snap, showCop, settings);
  hero.appendChild(valWrap);

  // Pie: tasa + toggle.
  const foot = el('div', 'hero-patrimonio__foot');

  const rate = el('div', 'hero-patrimonio__rate');
  rate.appendChild(el('span', null, I.swap));
  rate.appendChild(el('span', null, '1 USD = ' + fmtCOP(snap.fxRate)));
  foot.appendChild(rate);

  const toggle = el('button', 'btn btn--ghost btn--sm pressable',
    showCop ? 'Todo en COP' : 'Por moneda');
  toggle.type = 'button';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCurrencyMode(settings, valWrap, toggle);
  });
  foot.appendChild(toggle);

  hero.appendChild(foot);

  // Tap en el hero también alterna el modo.
  hero.addEventListener('click', () => toggleCurrencyMode(getSettings(), valWrap, toggle));

  return hero;
}

function renderHeroValue(node, snap, showCop, settings) {
  node.replaceChildren();
  if (showCop) {
    const v = el('div', 'hero-patrimonio__value');
    v.innerHTML = '<span class="hero-patrimonio__approx">≈ </span>' +
      escapeHtml(maskValue(snap.totalCop, fmtCOP, settings));
    node.appendChild(v);
  } else {
    // Por moneda: COP nativo (personal + eventos) y trading en USD.
    const copPart = snap.personalNet + snap.eventsProfit;
    const v1 = el('div', 'hero-patrimonio__value');
    v1.textContent = maskValue(copPart, fmtCOP, settings);
    const v2 = el('div', 'hero-patrimonio__rate');
    v2.style.fontSize = 'var(--fs-h3)';
    v2.style.color = 'var(--area-trading)';
    v2.style.marginTop = 'var(--sp-2)';
    v2.textContent = '+ ' + maskValue(snap.tradingBalanceUsd, fmtUSD, settings) + ' en trading';
    node.append(v1, v2);
  }
}

function toggleCurrencyMode(settings, valWrap, toggleBtn) {
  const cur = !(settings && settings.ui && settings.ui.showCop === false);
  const next = !cur;
  updateSettings({ ui: { showCop: next } });
  const fresh = getSettings();
  const snap = globalSnapshot();
  renderHeroValue(valWrap, snap, next, fresh);
  if (toggleBtn) toggleBtn.textContent = next ? 'Todo en COP' : 'Por moneda';
}

/* ============================================================================
 *  C. SNAPSHOT DE HOY
 * ========================================================================== */
function buildTodaySnapshot(settings) {
  const snap = todaySnapshot();
  const section = el('div', 'section');
  section.appendChild(el('div', 'section__title', 'Hoy'));

  const grid = el('div', 'snapshot-today');
  grid.appendChild(buildMiniStat('Ingresos', maskValue(snap.ingresosCop, fmtCOP, settings), 'var(--positive)'));
  grid.appendChild(buildMiniStat('Gastos', maskValue(snap.gastosCop, fmtCOP, settings), 'var(--negative)'));
  grid.appendChild(buildMiniStat('Trading', maskValue(snap.tradingUsd, fmtUSD, settings),
    snap.tradingUsd >= 0 ? 'var(--positive)' : 'var(--negative)'));
  section.appendChild(grid);

  // Balance del día (COP).
  const bal = el('div', 'snapshot-balance');
  bal.appendChild(el('span', 'snapshot-balance__label', 'Balance del día'));
  const balVal = el('span', 'snapshot-balance__value');
  balVal.style.color = snap.balanceDiaCop >= 0 ? 'var(--positive)' : 'var(--negative)';
  balVal.textContent = maskValue(snap.balanceDiaCop, (n) => fmtSigned(n, fmtCOP), settings);
  bal.appendChild(balVal);
  section.appendChild(bal);

  return section;
}

function buildMiniStat(label, value, color) {
  const m = el('div', 'ministat');
  m.appendChild(el('div', 'ministat__label', escapeHtml(label)));
  const v = el('div', 'ministat__value', escapeHtml(value));
  if (color) v.style.color = color;
  m.appendChild(v);
  return m;
}

/* ============================================================================
 *  D. ACCESOS RÁPIDOS  → #/registrar?tipo=…&fecha=hoy
 * ========================================================================== */
function buildQuickActions() {
  const section = el('div', 'section');
  section.appendChild(el('div', 'section__title', 'Registrar'));

  const grid = el('div', 'quick-actions');
  const today = hoy();
  const actions = [
    { tipo: 'ingreso', label: 'Ingreso', icon: I.income, mod: 'pos' },
    { tipo: 'gasto', label: 'Gasto', icon: I.expense, mod: 'neg' },
    { tipo: 'evento', label: 'Evento', icon: I.event, mod: 'evt' },
    { tipo: 'trading', label: 'Día trading', icon: I.trade, mod: 'trd' },
  ];
  actions.forEach((a) => {
    const btn = el('button', 'quick-action pressable quick-action--' + a.mod);
    btn.type = 'button';
    const ic = el('span', 'quick-action__ic', a.icon);
    const lab = el('span', 'quick-action__label', a.label);
    btn.append(ic, lab);
    btn.addEventListener('click', () => {
      navigate('#/registrar?tipo=' + encodeURIComponent(a.tipo) + '&fecha=' + today);
    });
    grid.appendChild(btn);
  });
  section.appendChild(grid);
  return section;
}

/* ============================================================================
 *  E. 3 TARJETAS KPI POR MÓDULO (con sparkline, tap → módulo)
 * ========================================================================== */
function buildModuleCards(settings) {
  const section = el('div', 'section');
  section.appendChild(el('div', 'section__title', 'Tus módulos'));

  const stack = el('div', 'stack');
  stack.appendChild(buildPersonalCard(settings));
  stack.appendChild(buildEventsCard(settings));
  stack.appendChild(buildTradingCard(settings));
  section.appendChild(stack);
  return section;
}

// --- Personal: % presupuesto usado + balance del mes -----------------------
function buildPersonalCard(settings) {
  const sr = savingsRate(monthKey(hoy()));
  const budget = (settings && settings.personalBudgetMonthly > 0)
    ? settings.personalBudgetMonthly : 0;
  const usado = budget > 0 ? (sr.gastos / budget) * 100 : null;

  let sub;
  if (budget > 0) {
    sub = fmtPct(usado || 0, 0) + ' del presupuesto';
  } else {
    sub = 'Balance: ' + fmtSigned(sr.balance, fmtCOP);
  }

  return buildModuleCard({
    name: 'Personal',
    dotColor: 'var(--area-personal)',
    metric: maskValue(sr.gastos, fmtCOP, settings),
    metricLabel: 'gasto del mes',
    sub,
    sparkId: 'spark-personal',
    accentClass: 'kpi--personal',
    onTap: () => navigate('#/personal'),
  });
}

// --- Eventos: utilidad del mes + próximo evento ----------------------------
function buildEventsCard(settings) {
  const pl = monthlyEventsPL(monthKey(hoy()));
  const prox = upcomingEvents(1);
  let sub;
  if (prox && prox.length) {
    const e = prox[0];
    const dleft = e.daysLeft;
    const cuando = dleft === 0 ? 'hoy' : (dleft === 1 ? 'mañana' : 'en ' + dleft + ' días');
    sub = 'Próximo: ' + truncate(e.name, 16) + ' ' + cuando;
  } else {
    sub = 'Sin eventos próximos';
  }
  return buildModuleCard({
    name: 'Eventos',
    dotColor: 'var(--area-eventos)',
    metric: maskValue(pl.utilidad, fmtCOP, settings),
    metricLabel: 'utilidad del mes',
    sub,
    sparkId: 'spark-eventos',
    accentClass: 'kpi--eventos',
    onTap: () => navigate('#/eventos'),
  });
}

// --- Trading: win rate mes + P&L acumulado ---------------------------------
function buildTradingCard(settings) {
  const stats = tradingStats({});
  const wr = stats.winRate === null ? '—' : fmtPct(stats.winRate, 0);
  const pnl = stats.totalPnl;
  const sub = 'Win rate: ' + wr + ' · ' + stats.tradedDays + ' días op.';
  return buildModuleCard({
    name: 'Trading',
    dotColor: 'var(--area-trading)',
    metric: maskValue(pnl, (n) => fmtSigned(n, fmtUSD), settings),
    metricLabel: 'P&L acumulado',
    sub,
    sparkId: 'spark-trading',
    accentClass: 'kpi--trading',
    onTap: () => navigate('#/trading'),
  });
}

function buildModuleCard({ name, dotColor, metric, metricLabel, sub, sparkId, accentClass, onTap }) {
  const card = el('div', 'module-card pressable ' + (accentClass || ''));
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', name);

  const body = el('div', 'module-card__body');
  const nameRow = el('div', 'module-card__name');
  const dot = el('span', 'dot');
  dot.style.background = dotColor;
  nameRow.appendChild(dot);
  nameRow.appendChild(document.createTextNode(name));
  body.appendChild(nameRow);

  const m = el('div', 'module-card__metric', escapeHtml(metric));
  body.appendChild(m);
  body.appendChild(el('div', 'module-card__sub', escapeHtml(sub)));
  card.appendChild(body);

  // Sparkline (se rellena en drawSparklines).
  const spark = el('div', 'module-card__spark');
  spark.id = sparkId;
  card.appendChild(spark);

  card.appendChild(el('div', 'module-card__chevron', I.chevron));

  card.addEventListener('click', onTap);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
  });
  return card;
}

/* ============================================================================
 *  SPARKLINES — series desde aggregations
 * ========================================================================== */
function drawSparklines() {
  if (!_mounted) return;

  // Personal: gasto diario del mes en curso.
  const daily = dailyCashflow(monthKey(hoy()));
  const today = parseLocalDate(hoy());
  const cutDay = today ? today.getDate() : daily.length;
  const personalSeries = daily
    .filter((d) => d.day <= cutDay)
    .map((d) => d.expense);
  paintSpark('spark-personal', personalSeries, 'var(--area-personal)');

  // Eventos: utilidad mensual de los últimos ~6 meses.
  const evRev = eventsRevenue({ groupBy: 'month' });
  const eventosSeries = evRev.slice(-6).map((r) => r.profit);
  paintSpark('spark-eventos', eventosSeries, 'var(--area-eventos)', { colorByTrend: false });

  // Trading: curva de equity de la cuenta principal.
  const eq = equityCurve({ mode: 'full' });
  const tradingSeries = eq.points.map((p) => p.equity);
  paintSpark('spark-trading', tradingSeries, 'var(--area-trading)', { colorByTrend: true });
}

function paintSpark(id, series, color, extra) {
  const node = document.getElementById(id);
  if (!node) return;
  const data = Array.isArray(series) ? series.filter((v) => Number.isFinite(toNum(v))) : [];
  if (data.length < 2) {
    // Estado vacío sutil: la propia sparkline pinta una línea base si <2 puntos.
    sparkline(node, data, Object.assign({ width: 84, height: 36, color }, extra || {}));
    return;
  }
  sparkline(node, data, Object.assign({ width: 84, height: 36, color }, extra || {}));
}

/* ============================================================================
 *  F. DONUT GLOBAL DE PATRIMONIO  (normalizado a COP)
 * ========================================================================== */
function buildDonutSection(_settings) {
  const section = el('div', 'section');
  section.appendChild(el('div', 'section__title', 'Distribución del patrimonio'));

  const card = el('div', 'kpi');
  const holder = el('div', null);
  holder.id = 'donut-global';
  holder.style.display = 'flex';
  holder.style.justifyContent = 'center';
  holder.style.padding = 'var(--sp-2) 0';
  card.appendChild(holder);

  // Leyenda.
  const legend = el('div', null);
  legend.id = 'donut-legend';
  legend.style.display = 'flex';
  legend.style.flexDirection = 'column';
  legend.style.gap = 'var(--sp-2)';
  legend.style.marginTop = 'var(--sp-3)';
  card.appendChild(legend);

  section.appendChild(card);
  return section;
}

function drawDonut(settings) {
  const holder = document.getElementById('donut-global');
  const legend = document.getElementById('donut-legend');
  if (!holder) return;

  const snap = globalSnapshot();
  const segments = [
    { label: 'Personal', value: Math.max(0, snap.personalNet), color: 'var(--area-personal)' },
    { label: 'Eventos', value: Math.max(0, snap.eventsProfit), color: 'var(--area-eventos)' },
    { label: 'Trading', value: Math.max(0, snap.tradingBalanceCop), color: 'var(--area-trading)' },
  ];
  const total = segments.reduce((a, s) => a + s.value, 0);

  donut(holder, segments, {
    size: 196,
    thickness: 24,
    currency: 'COP',
    center: {
      value: total > 0 ? compactCop(total) : '—',
      label: 'Total',
    },
  });

  if (legend) {
    legend.replaceChildren();
    segments.forEach((s) => {
      const pct = total > 0 ? (s.value / total) * 100 : 0;
      const row = el('div', null);
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
        fontSize: 'var(--fs-sm)',
      });
      const dot = el('span', null);
      Object.assign(dot.style, {
        width: '9px', height: '9px', borderRadius: 'var(--r-pill)',
        background: s.color, flexShrink: '0',
      });
      const name = el('span', null, escapeHtml(s.label));
      name.style.flex = '1 1 auto';
      name.style.color = 'var(--text-secondary)';
      const val = el('span', null,
        maskValue(s.value, fmtCOP, settings) + '  ·  ' + fmtPct(pct, 0));
      Object.assign(val.style, {
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        color: 'var(--text-primary)',
      });
      row.append(dot, name, val);
      legend.appendChild(row);
    });
  }
}

// Compacta una cifra COP grande para el centro del donut ("$8,4 M").
function compactCop(n) {
  const v = Math.abs(toNum(n));
  const sign = n < 0 ? '-' : '';
  if (v >= 1e9) return sign + '$' + (v / 1e9).toFixed(1).replace(/\.0$/, '') + ' MM';
  if (v >= 1e6) return sign + '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' M';
  if (v >= 1e3) return sign + '$' + Math.round(v / 1e3) + ' k';
  return fmtCOP(n);
}

/* ============================================================================
 *  ESTADO VACÍO (sin datos)
 * ========================================================================== */
function renderEmpty(root) {
  const settings = getSettings();
  setHeader({ title: 'Inicio' });

  const wrap = el('div', 'dashboard enter');

  // Saludo arriba aunque esté vacío (toque premium).
  wrap.appendChild(buildGreeting(settings));

  const card = el('div', 'kpi kpi--hero');
  emptyState(card, {
    icon: 'diamond',
    title: 'Tu patrimonio empieza aquí',
    message: 'Aún no hay datos. Registra tu primer movimiento para ver tu panorama completo.',
    actions: [
      { label: 'Registrar', variant: 'primary', onClick: () => navigate('#/registrar') },
    ],
  });
  wrap.appendChild(card);

  // Accesos rápidos siempre disponibles.
  wrap.appendChild(buildQuickActions());

  root.appendChild(wrap);
}

/* ============================================================================
 *  BUS: refrescar la vista tras cambios de datos / tasa / tema
 * ========================================================================== */
function wireBus() {
  const bus = getBus();
  if (!bus || typeof bus.on !== 'function') return;
  // Evita suscripciones duplicadas.
  if (_busOff) { _busOff(); _busOff = null; }

  const handler = () => { if (_mounted) render({}); };
  const offs = [
    bus.on('data:changed', handler),
    bus.on('fx:changed', handler),
    bus.on('theme:changed', () => { if (_mounted) render({}); }),
  ];
  _busOff = () => offs.forEach((f) => { try { f(); } catch (_e) { /* noop */ } });
}

/* ============================================================================
 *  UNMOUNT
 * ========================================================================== */
export function unmount() {
  _mounted = false;
  if (_busOff) { try { _busOff(); } catch (_e) { /* noop */ } _busOff = null; }
  const root = viewRoot();
  if (root) root.replaceChildren();
}

/* ============================================================================
 *  UTILIDADES
 * ========================================================================== */
function truncate(str, max) {
  const s = String(str == null ? '' : str);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default { render, unmount };
