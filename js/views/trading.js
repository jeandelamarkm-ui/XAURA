// ============================================================================
// XAURA · js/views/trading.js  →  #/trading  (USD, SPEC §6.4, §8)
//
// Nav interno: Resumen · Equity · Diario · Stats  (resto en "···":
//   Movimientos/caja · Reportes · Ajustes).
//
// Contrato de vista:  export render(params) / export unmount()
//   - params.query: { fecha, id (accountId), tab }
//   - Pinta dentro de #view, usa setHeader(), formato de core/currency.js,
//     fechas de core/dates.js, datos de core/{trading,settings,aggregations},
//     gráficos de ui/charts.js y UI de ui/{sheet,modal,toast,keypad,empty}.
//   - Tras registrar datos, refresca la vista y dispara el bus (data:changed).
//
// Estética premium fiel a SPEC.md. Cifras mono/tabular. USD con 2 decimales y
// equivalente COP en gris (toggle settings.ui.showCop). Cero NaN / div-por-cero.
// ============================================================================

import { setHeader } from '../ui/header.js';

import {
  fmtUSD, fmtCOP, fmtPct, fmtSigned, toNum,
} from '../core/currency.js';

import {
  hoy, monthKey, formatDateEs, parseLocalDate, addMonths,
  monthName, addDays,
} from '../core/dates.js';

import {
  getTradingAccounts, addTradingAccount, updateTradingAccount,
  setTradeDay, deleteTradeDay, getTradeDays,
  addTradingMovement, deleteTradingMovement, getTradingMovements,
} from '../core/trading.js';

import {
  tradingStats, equityCurve, pnlCalendar, pnlDistribution,
  monthlyPnl, tradingConsistency, tradingBalance,
} from '../core/aggregations.js';

import {
  getSettings, updateSettings, getFxRate, setFxRate,
} from '../core/settings.js';

import {
  lineArea, barsNet, heatmapCal, histogram, groupedBars,
} from '../ui/charts.js';

import { openSheet, closeSheet } from '../ui/sheet.js';
import { openModal, promptText } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { attachAmountInput } from '../ui/keypad.js';
import { emptyState } from '../ui/empty.js';

/* ============================================================================
 *  ICONOS (línea, Tabler-like)
 * ========================================================================== */
const ICON = {
  candle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v17a1 1 0 0 0 1 1h16"/><rect x="8" y="9" width="3" height="6" rx="1"/><path d="M9.5 6v3M9.5 15v2"/><rect x="14" y="7" width="3" height="5" rx="1"/><path d="M15.5 5v2M15.5 12v2"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.6"/><path d="M20 4v6h-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};

/* ============================================================================
 *  ESTADO DEL MÓDULO
 * ========================================================================== */
let _root = null;        // contenedor raíz de la vista (dentro de #view)
let _busOff = null;      // desuscriptor del bus
let _state = {
  tab: 'resumen',        // resumen | equity | diario | stats | movimientos | reportes | ajustes
  accountId: null,
  diaryDate: hoy(),
  range: 'todo',         // 1M | 3M | 6M | 1A | todo
  equityMode: 'full',    // full | trading
};

const TABS_MAIN = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'equity', label: 'Equity' },
  { key: 'diario', label: 'Diario' },
  { key: 'stats', label: 'Stats' },
];
const TABS_MORE = [
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'ajustes', label: 'Ajustes' },
];

/* ============================================================================
 *  HELPERS GENÉRICOS
 * ========================================================================== */
function elh(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function viewEl() { return document.getElementById('view'); }

function getBus() {
  try { return (window.XAURA && window.XAURA.bus) || null; } catch (_e) { return null; }
}
function emitChanged(action) {
  const bus = getBus();
  if (bus) { try { bus.emit('data:changed', { area: 'trading', action }); } catch (_e) { /* noop */ } }
}

function showCop() {
  const s = getSettings();
  return !!(s && s.ui && s.ui.showCop);
}

// Línea COP de conversión en gris (referencial), solo si showCop.
function copLineUSD(usd) {
  if (!showCop()) return '';
  const cop = toNum(usd) * getFxRate();
  return '<span class="x-cop-ref">≈ ' + escapeHtml(fmtCOP(cop)) + '</span>';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Devuelve la cuenta activa (o crea contexto vacío).
function activeAccount() {
  const accs = getTradingAccounts({ includeArchived: false });
  if (!accs.length) return null;
  if (_state.accountId) {
    const found = accs.find((a) => a.id === _state.accountId);
    if (found) return found;
  }
  _state.accountId = accs[0].id;
  return accs[0];
}

// Rango de fechas [from,to] según _state.range respecto a hoy.
function rangeFromTo(range) {
  const to = hoy();
  if (range === 'todo') return { from: null, to: null };
  const map = { '1M': -1, '3M': -3, '6M': -6, '1A': -12 };
  const m = map[range] || -1;
  return { from: addMonths(to, m), to: null };
}

// Color semántico para un número.
function signClass(n) { return toNum(n) >= 0 ? 'pos' : 'neg'; }

// Inserta estilos locales una sola vez (clases específicas de esta vista).
function ensureStyles() {
  if (document.getElementById('trading-view-style')) return;
  const css = `
.x-cop-ref{ display:block; font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:2px; }
.tr-balance{ position:relative; padding:var(--sp-6); border-radius:var(--r-xl); background:var(--glass-bg); -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(140%); backdrop-filter:blur(var(--glass-blur)) saturate(140%); border:1px solid var(--glass-border); overflow:hidden; }
.tr-balance::before{ content:""; position:absolute; inset:0; background:var(--gradient-aura); pointer-events:none; }
.tr-balance>*{ position:relative; }
.tr-balance__label{ font-size:var(--fs-xs); letter-spacing:var(--ls-wide); text-transform:uppercase; color:var(--text-tertiary); }
.tr-balance__value{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-weight:600; font-size:clamp(28px,9vw,var(--fs-display)); letter-spacing:-0.015em; color:var(--text-primary); line-height:1.05; margin-top:var(--sp-2); }
.tr-balance__cop{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:var(--fs-sm); color:var(--text-tertiary); margin-top:var(--sp-1); }
.tr-balance__foot{ display:flex; align-items:center; justify-content:space-between; gap:var(--sp-3); margin-top:var(--sp-4); flex-wrap:wrap; }
.tr-pill{ display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:var(--r-pill); font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:var(--fs-sm); font-weight:600; }
.tr-pill--pos{ color:var(--positive); background:var(--positive-bg); }
.tr-pill--neg{ color:var(--negative); background:var(--negative-bg); }
.tr-pill--flat{ color:var(--text-secondary); background:var(--bg-surface-3); }
.tr-pill svg{ width:13px; height:13px; }
.tr-meta{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:var(--fs-xs); color:var(--text-tertiary); }
.tr-stat-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--sp-3); }
.tr-acc-row{ display:flex; align-items:center; justify-content:space-between; gap:var(--sp-3); margin-bottom:var(--sp-4); }
.tr-acc-name{ font-family:var(--font-serif); font-weight:500; font-size:var(--fs-h3); color:var(--text-primary); }
.tr-acc-sel{ display:flex; gap:var(--sp-2); flex-wrap:wrap; }
.tr-day{ display:flex; align-items:center; gap:var(--sp-3); padding:var(--sp-3) var(--sp-4); background:var(--bg-surface-1); }
.tr-day+.tr-day{ border-top:1px solid var(--border-subtle); }
.tr-day__date{ flex:0 0 auto; width:54px; display:flex; flex-direction:column; align-items:center; }
.tr-day__d{ font-family:var(--font-mono); font-weight:600; font-size:var(--fs-h3); color:var(--text-primary); line-height:1; }
.tr-day__m{ font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary); }
.tr-day__body{ flex:1 1 auto; min-width:0; }
.tr-day__tag{ font-size:var(--fs-xs); color:var(--text-tertiary); }
.tr-day__trades{ font-size:var(--fs-xs); color:var(--text-tertiary); }
.tr-day__pnl{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-weight:600; font-size:var(--fs-body); text-align:right; flex-shrink:0; }
.tr-day__pnl.pos{ color:var(--positive); } .tr-day__pnl.neg{ color:var(--negative); } .tr-day__pnl.flat{ color:var(--text-secondary); }
.tr-day--flat{ opacity:0.7; }
.tr-empty-line{ font-size:var(--fs-xs); color:var(--text-tertiary); font-style:italic; }
.tr-range{ display:inline-flex; gap:var(--sp-1); flex-wrap:wrap; }
.tr-range__btn{ padding:4px 12px; border-radius:var(--r-pill); font-family:var(--font-mono); font-size:var(--fs-xs); font-weight:500; color:var(--text-tertiary); background:transparent; border:1px solid transparent; }
.tr-range__btn.is-active{ color:var(--text-on-gold); background:var(--gradient-gold); }
.tr-toggle{ display:inline-flex; align-items:center; gap:var(--sp-2); font-size:var(--fs-sm); color:var(--text-secondary); }
.tr-sheet-amount{ display:flex; align-items:baseline; justify-content:center; gap:var(--sp-2); padding:var(--sp-4) 0; border-bottom:1px solid var(--border-strong); }
.tr-sheet-amount__cur{ font-family:var(--font-mono); font-size:var(--fs-h2); font-weight:500; color:var(--text-secondary); }
.tr-sheet-amount__cop{ text-align:center; font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:var(--fs-sm); color:var(--text-tertiary); margin-top:var(--sp-2); }
.tr-pn-toggle{ display:flex; gap:var(--sp-2); margin-top:var(--sp-4); }
.tr-pn-toggle .btn{ flex:1 1 0; }
.tr-pn-toggle .btn.is-on--pos{ background:var(--positive-bg); border-color:var(--positive); color:var(--positive); }
.tr-pn-toggle .btn.is-on--neg{ background:var(--negative-bg); border-color:var(--negative); color:var(--negative); }
.tr-score{ display:flex; align-items:center; gap:var(--sp-5); padding:var(--sp-4); border-radius:var(--r-lg); background:var(--bg-surface-1); border:1px solid var(--border-subtle); }
.tr-score__num{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-weight:600; font-size:var(--fs-display); color:var(--gold); line-height:1; }
.tr-score__body{ flex:1 1 auto; min-width:0; }
.tr-info{ display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--sp-2); }
.tr-info svg{ width:13px; height:13px; }
.tr-mov{ display:flex; align-items:center; gap:var(--sp-3); padding:var(--sp-3) var(--sp-4); background:var(--bg-surface-1); }
.tr-mov+.tr-mov{ border-top:1px solid var(--border-subtle); }
.tr-mov__ic{ width:38px; height:38px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:var(--r-md); }
.tr-mov__ic--dep{ background:var(--positive-bg); color:var(--positive); }
.tr-mov__ic--wd{ background:var(--negative-bg); color:var(--negative); }
.tr-mov__ic svg{ width:18px; height:18px; }
.tr-mov__body{ flex:1 1 auto; min-width:0; }
.tr-mov__t{ font-size:var(--fs-body); font-weight:500; color:var(--text-primary); }
.tr-mov__s{ font-size:var(--fs-xs); color:var(--text-tertiary); }
.tr-mov__amt{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-weight:600; flex-shrink:0; }
.tr-mov__del{ flex-shrink:0; color:var(--text-tertiary); }
`;
  const tag = document.createElement('style');
  tag.id = 'trading-view-style';
  tag.textContent = css;
  document.head.appendChild(tag);
}

/* ============================================================================
 *  RENDER PRINCIPAL
 * ========================================================================== */
export function render(params) {
  ensureStyles();

  const q = (params && params.query) ? params.query : (params || {});
  // tab puede venir por query o por sub (params.sub del router) o params.tab.
  const tab = (q.tab || (params && params.sub) || _state.tab || 'resumen');
  if (q.id) _state.accountId = q.id;
  if (q.fecha && parseLocalDate(q.fecha)) _state.diaryDate = q.fecha;
  _state.tab = TABS_MAIN.concat(TABS_MORE).some((t) => t.key === tab) ? tab : 'resumen';

  // Suscripción al bus para refrescar tras cambios externos.
  if (!_busOff) {
    const bus = getBus();
    if (bus) {
      const off1 = bus.on('data:changed', (p) => {
        if (!p || p.area === 'trading' || p.area === undefined) refresh();
      });
      const off2 = bus.on('fx:changed', () => refresh());
      _busOff = () => { try { off1(); } catch (_e) {} try { off2(); } catch (_e) {} };
    }
  }

  paint();
}

export function unmount() {
  if (_busOff) { try { _busOff(); } catch (_e) { /* noop */ } _busOff = null; }
  try { closeSheet(true); } catch (_e) { /* noop */ }
  _root = null;
}

// Re-pinta conservando estado (tab/cuenta/rango).
function refresh() {
  if (!viewEl()) return;
  paint();
}

/* ============================================================================
 *  PINTURA: cabecera + nav interno + cuerpo del tab
 * ========================================================================== */
function paint() {
  const host = viewEl();
  if (!host) return;
  host.replaceChildren();

  _root = elh('div', 'enter stack-lg');
  host.appendChild(_root);

  // Cabecera con acción "Registrar día" (oro) y selector de cuenta vía "···".
  setHeader({
    title: 'Trading',
    subtitle: 'USD',
    actions: [
      {
        icon: ICON.plus, ariaLabel: 'Registrar día',
        variant: 'gold',
        onClick: () => openDaySheet(_state.diaryDate),
      },
      {
        icon: ICON.dots, ariaLabel: 'Más opciones',
        onClick: openMoreMenu,
      },
    ],
  });

  // Nav interno (segmented).
  _root.appendChild(buildSubnav());

  // Sin cuentas → onboarding mínimo de trading.
  const acc = activeAccount();
  if (!acc) {
    const box = elh('div');
    emptyState(box, {
      icon: 'trading',
      title: 'Aún no hay operaciones',
      message: 'Crea tu cuenta de trading para empezar a registrar tus días.',
      ctaLabel: 'Crear cuenta',
      onCta: openCreateAccountSheet,
    });
    _root.appendChild(box);
    return;
  }

  // Cuerpo según tab.
  const body = elh('div', 'stack-lg');
  _root.appendChild(body);
  switch (_state.tab) {
    case 'equity': renderEquity(body, acc); break;
    case 'diario': renderDiary(body, acc); break;
    case 'stats': renderStats(body, acc); break;
    case 'movimientos': renderMovements(body, acc); break;
    case 'reportes': renderReports(body, acc); break;
    case 'ajustes': renderModuleSettings(body, acc); break;
    case 'resumen':
    default: renderResumen(body, acc); break;
  }
}

function buildSubnav() {
  const wrap = elh('div', 'subnav-wrap');
  const seg = elh('div', 'segmented segmented--scroll');
  TABS_MAIN.forEach((t) => {
    const b = elh('button', 'segmented__item' + (_state.tab === t.key ? ' segmented__item--active' : ''));
    b.type = 'button';
    b.textContent = t.label;
    b.addEventListener('click', () => { _state.tab = t.key; paint(); });
    seg.appendChild(b);
  });
  // Botón "···" como item extra del segmented.
  const more = elh('button', 'segmented__item' + (TABS_MORE.some((t) => t.key === _state.tab) ? ' segmented__item--active' : ''), ICON.dots);
  more.type = 'button';
  more.setAttribute('aria-label', 'Más secciones');
  more.style.flex = '0 0 auto';
  more.addEventListener('click', openMoreMenu);
  seg.appendChild(more);
  wrap.appendChild(seg);
  return wrap;
}

function openMoreMenu() {
  const list = elh('div', 'settings-group');
  const items = [
    { key: 'movimientos', label: 'Movimientos / caja' },
    { key: 'reportes', label: 'Reportes' },
    { key: 'ajustes', label: 'Ajustes del módulo' },
    { key: '__nuevacuenta', label: 'Nueva cuenta de trading' },
    { key: '__cambiarcuenta', label: 'Cambiar de cuenta' },
  ];
  items.forEach((it) => {
    const row = elh('button', 'settings-row pressable');
    row.type = 'button';
    row.style.width = '100%';
    row.appendChild(elh('span', 'settings-row__label', escapeHtml(it.label)));
    row.appendChild(elh('span', 'settings-row__chevron', ICON.chevron));
    row.addEventListener('click', () => {
      closeSheet();
      if (it.key === '__nuevacuenta') { openCreateAccountSheet(); return; }
      if (it.key === '__cambiarcuenta') { openAccountPicker(); return; }
      _state.tab = it.key;
      paint();
    });
    list.appendChild(row);
  });
  openSheet({ title: 'Trading · Más', content: list, dismissible: true });
}

function openAccountPicker() {
  const accs = getTradingAccounts({ includeArchived: false });
  const list = elh('div', 'settings-group');
  accs.forEach((a) => {
    const row = elh('button', 'settings-row pressable');
    row.type = 'button';
    row.style.width = '100%';
    row.appendChild(elh('span', 'settings-row__label', escapeHtml(a.name)));
    const bal = tradingBalance(a.id);
    row.appendChild(elh('span', 'settings-row__value', escapeHtml(fmtUSD(bal))));
    row.addEventListener('click', () => {
      _state.accountId = a.id;
      closeSheet();
      paint();
    });
    list.appendChild(row);
  });
  openSheet({ title: 'Elegir cuenta', content: list });
}

/* ============================================================================
 *  TAB · RESUMEN
 *  Balance USD + equiv COP · P&L total % · retorno del mes vs meta · mini equity
 * ========================================================================== */
function renderResumen(host, acc) {
  const st = tradingStats({ accountId: acc.id });
  const s = getSettings();
  const targetPct = toNum(s && s.trading && s.trading.monthlyTargetPct, 0);

  // Retorno del mes (mes en curso) vs meta.
  const curKey = monthKey(hoy());
  const mp = monthlyPnl(acc.id, parseLocalDate(hoy()).getFullYear());
  const moRow = mp.find((r) => r.key === curKey) || { pnl: 0, returnPct: null };

  // --- Tarjeta de balance (hero) ---
  const balUsd = st.currentBalance;
  const card = elh('div', 'tr-balance');
  card.appendChild(elh('div', 'tr-balance__label', 'Balance de la cuenta'));
  card.appendChild(elh('div', 'tr-balance__value', escapeHtml(fmtUSD(balUsd))));
  if (showCop()) {
    card.appendChild(elh('div', 'tr-balance__cop', '≈ ' + escapeHtml(fmtCOP(balUsd * getFxRate()))));
  }

  const foot = elh('div', 'tr-balance__foot');
  // P&L total %.
  const plPct = st.returnPct;
  const plCls = st.totalPnl >= 0 ? 'pos' : 'neg';
  const pill = elh('div', 'tr-pill tr-pill--' + plCls,
    (st.totalPnl >= 0 ? ICON.up : ICON.down) +
    '<span>' + escapeHtml(fmtSigned(st.totalPnl, fmtUSD)) + ' · ' +
    (plPct === null ? '—' : escapeHtml(fmtSigned(plPct, (n) => fmtPct(n, 1)))) + '</span>');
  foot.appendChild(pill);
  // Cuenta + nombre.
  const meta = elh('div', 'tr-meta', escapeHtml(acc.name) + (acc.broker ? ' · ' + escapeHtml(acc.broker) : ''));
  foot.appendChild(meta);
  card.appendChild(foot);
  host.appendChild(card);

  // --- KPIs: P&L total, retorno del mes vs meta ---
  const grid = elh('div', 'tr-stat-grid');
  grid.appendChild(kpiCard(
    'P&L total',
    fmtSigned(st.totalPnl, fmtUSD),
    plPct === null ? 'Sin base' : fmtSigned(plPct, (n) => fmtPct(n, 1)) + ' acumulado',
    st.totalPnl >= 0 ? 'pos' : 'neg',
    'trading'));

  const moRet = moRow.returnPct;
  const moSub = (moRet === null)
    ? 'Meta ' + fmtPct(targetPct, 0)
    : (moRet >= targetPct ? '✓ ' : '') + 'Meta ' + fmtPct(targetPct, 0);
  grid.appendChild(kpiCard(
    'Retorno del mes',
    moRet === null ? '—' : fmtSigned(moRet, (n) => fmtPct(n, 1)),
    moSub + ' · ' + fmtSigned(moRow.pnl, fmtUSD),
    moRow.pnl >= 0 ? 'pos' : 'neg',
    'trading'));
  host.appendChild(grid);

  // --- Mini equity ---
  const eq = equityCurve({ accountId: acc.id, from: null, to: null, mode: 'full' });
  const card2 = elh('div', 'chart-card');
  const head2 = elh('div', 'chart-card__head');
  head2.appendChild(elh('div', 'chart-card__title', 'Curva de equity'));
  const verBtn = elh('button', 'btn btn--ghost btn--sm pressable', 'Ver detalle');
  verBtn.type = 'button';
  verBtn.addEventListener('click', () => { _state.tab = 'equity'; paint(); });
  head2.appendChild(verBtn);
  card2.appendChild(head2);
  const chartWrap = elh('div', 'chart-wrap');
  card2.appendChild(chartWrap);
  host.appendChild(card2);

  if (eq.points.length < 2) {
    emptyState(chartWrap, {
      icon: 'chart',
      message: 'Necesitas algunos días más para ver la curva.',
      ctaLabel: 'Registrar día',
      onCta: () => openDaySheet(_state.diaryDate),
    });
  } else {
    const series = eq.points.map((p) => ({ date: p.date, value: p.equity }));
    const peakIdx = peakIndex(eq);
    lineArea(chartWrap, series, {
      currency: 'USD', height: 150, peak: peakIdx, baselineZero: false,
      cssHeight: '150px',
    });
  }

  // --- Accesos rápidos ---
  const quick = elh('div');
  quick.style.display = 'grid';
  quick.style.gridTemplateColumns = 'repeat(2, 1fr)';
  quick.style.gap = 'var(--sp-3)';
  const qb1 = elh('button', 'btn btn--primary pressable', ICON.plus + '<span>Registrar día</span>');
  qb1.type = 'button';
  qb1.addEventListener('click', () => openDaySheet(_state.diaryDate));
  const qb2 = elh('button', 'btn btn--outline pressable', '<span>Depósito / Retiro</span>');
  qb2.type = 'button';
  qb2.addEventListener('click', () => openMovementSheet('deposit'));
  quick.appendChild(qb1);
  quick.appendChild(qb2);
  host.appendChild(quick);

  if (showCop()) {
    host.appendChild(infoNote('Conversión referencial a la tasa actual (' + fmtCOP(getFxRate()) + ' / US$1).'));
  }
}

function kpiCard(label, value, sub, sign, accent) {
  const card = elh('div', 'kpi' + (accent ? ' kpi--' + accent : ''));
  const head = elh('div', 'kpi__head');
  head.appendChild(elh('span', 'kpi__label', escapeHtml(label)));
  card.appendChild(head);
  const v = elh('div', 'kpi__value', escapeHtml(value));
  if (sign === 'pos') v.style.color = 'var(--positive)';
  else if (sign === 'neg') v.style.color = 'var(--negative)';
  card.appendChild(v);
  if (sub) card.appendChild(elh('div', 'kpi__sub', escapeHtml(sub)));
  return card;
}

function infoNote(text) {
  const n = elh('div', 'tr-info', ICON.info + '<span>' + escapeHtml(text) + '</span>');
  return n;
}

// Índice del punto de equity con valor máximo (para el pico dorado).
function peakIndex(eq) {
  if (!eq || !eq.points || !eq.points.length) return undefined;
  let idx = 0; let best = -Infinity;
  eq.points.forEach((p, i) => { if (p.equity > best) { best = p.equity; idx = i; } });
  return idx;
}

/* ============================================================================
 *  TAB · EQUITY
 *  lineArea (pico dorado + maxDD sombreado) + rango 1M/3M/6M/1A/Todo
 *  + toggle con/sin caja
 * ========================================================================== */
function renderEquity(host, acc) {
  // Controles: rango + toggle modo.
  const controls = elh('div');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.justifyContent = 'space-between';
  controls.style.gap = 'var(--sp-3)';
  controls.style.flexWrap = 'wrap';

  const rangeBox = elh('div', 'tr-range');
  ['1M', '3M', '6M', '1A', 'todo'].forEach((r) => {
    const b = elh('button', 'tr-range__btn' + (_state.range === r ? ' is-active' : ''), r === 'todo' ? 'Todo' : r);
    b.type = 'button';
    b.addEventListener('click', () => { _state.range = r; paint(); });
    rangeBox.appendChild(b);
  });
  controls.appendChild(rangeBox);

  // Toggle con/sin caja (full vs trading).
  const toggle = elh('label', 'tr-toggle');
  const sw = elh('span', 'switch');
  const inp = elh('input');
  inp.type = 'checkbox';
  inp.checked = _state.equityMode === 'trading';
  inp.addEventListener('change', () => {
    _state.equityMode = inp.checked ? 'trading' : 'full';
    paint();
  });
  sw.appendChild(inp);
  sw.appendChild(elh('span', 'switch__track'));
  toggle.appendChild(elh('span', null, _state.equityMode === 'trading' ? 'Solo trading' : 'Con caja'));
  toggle.appendChild(sw);
  controls.appendChild(toggle);
  host.appendChild(controls);

  // Datos.
  const { from, to } = rangeFromTo(_state.range);
  const eq = equityCurve({ accountId: acc.id, from, to, mode: _state.equityMode });

  const card = elh('div', 'chart-card');
  const chartWrap = elh('div', 'chart-wrap');
  card.appendChild(chartWrap);
  host.appendChild(card);

  if (eq.points.length < 2) {
    emptyState(chartWrap, {
      icon: 'chart',
      title: 'Sin curva todavía',
      message: 'Registra más días operados para dibujar la equity.',
      ctaLabel: 'Registrar día',
      onCta: () => openDaySheet(_state.diaryDate),
    });
    return;
  }

  const series = eq.points.map((p) => ({ date: p.date, value: p.equity }));
  const peakIdx = peakIndex(eq);

  // Sombra de maxDD: desde el pico hasta el valle posterior más profundo.
  const dd = computeDrawdownWindow(eq);

  lineArea(chartWrap, series, {
    currency: 'USD', height: 210, cssHeight: '210px',
    peak: peakIdx,
    dd: dd ? { from: dd.peakIdx, to: dd.troughIdx } : undefined,
    baselineZero: false,
  });

  // Resumen bajo el gráfico (pico, drawdown).
  const st = tradingStats({ accountId: acc.id, from, to });
  const grid = elh('div', 'tr-stat-grid');
  grid.appendChild(kpiCard('Drawdown máx', fmtUSD(st.maxDD),
    st.maxDDPct === null ? '—' : fmtPct(st.maxDDPct, 1) + ' del pico', 'neg'));
  grid.appendChild(kpiCard('Drawdown actual', fmtUSD(st.currentDD),
    st.currentDDPct === null ? '—' : fmtPct(st.currentDDPct, 1) + ' desde el pico',
    st.currentDD > 0 ? 'neg' : null));
  host.appendChild(grid);

  if (showCop()) host.appendChild(infoNote('Valores en USD; conversión referencial a la tasa actual.'));
}

// Calcula la ventana del drawdown máximo (índice del pico y del valle).
function computeDrawdownWindow(eq) {
  const pts = eq.points;
  if (!pts || pts.length < 2) return null;
  let peak = eq.base;
  let peakIdx = -1;          // índice del punto donde se alcanzó el pico de referencia
  let bestPeak = eq.base;
  let bestPeakIdx = 0;
  let maxDD = 0;
  let resPeakIdx = 0;
  let resTroughIdx = 0;
  for (let i = 0; i < pts.length; i++) {
    peak += pts[i].cashFlow;
    if (pts[i].equity > peak) { peak = pts[i].equity; bestPeak = peak; bestPeakIdx = i; }
    const dd = peak - pts[i].equity;
    if (dd > maxDD) { maxDD = dd; resPeakIdx = bestPeakIdx; resTroughIdx = i; }
  }
  if (maxDD <= 0) return null;
  return { peakIdx: Math.max(0, resPeakIdx), troughIdx: resTroughIdx };
}

/* ============================================================================
 *  TAB · DIARIO
 *  Lista de días con pnl verde/rojo · registrar/editar · "hoy no operé"
 * ========================================================================== */
function renderDiary(host, acc) {
  // Barra de mes con navegación.
  const monthBar = buildMonthBar(_state.diaryDate, (newDate) => {
    _state.diaryDate = newDate; paint();
  });
  host.appendChild(monthBar);

  const key = monthKey(_state.diaryDate);
  const days = getTradeDays({ accountId: acc.id, month: key })
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // más reciente primero

  // Botón registrar día (con fecha seleccionada).
  const addBtn = elh('button', 'btn btn--primary btn--full pressable', ICON.plus + '<span>Registrar / editar día</span>');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => openDaySheet(_state.diaryDate));
  host.appendChild(addBtn);

  if (!days.length) {
    const box = elh('div');
    emptyState(box, {
      icon: 'trading',
      title: 'Mes sin registros',
      message: 'No hay días operados en ' + monthName(parseLocalDate(_state.diaryDate).getMonth() + 1) + '.',
      ctaLabel: 'Registrar día',
      onCta: () => openDaySheet(_state.diaryDate),
    });
    host.appendChild(box);
    return;
  }

  const list = elh('div', 'list--card');
  days.forEach((d) => list.appendChild(buildDayRow(d, acc)));
  host.appendChild(list);

  // Total del mes.
  const totalMes = days.reduce((acc2, d) => acc2 + (d.traded ? toNum(d.pnl) : 0), 0);
  const totRow = elh('div');
  totRow.style.display = 'flex';
  totRow.style.justifyContent = 'space-between';
  totRow.style.alignItems = 'baseline';
  totRow.style.padding = 'var(--sp-3) var(--sp-1)';
  totRow.appendChild(elh('span', 'section__title', 'Total del mes'));
  const tot = elh('span');
  tot.style.fontFamily = 'var(--font-mono)';
  tot.style.fontVariantNumeric = 'tabular-nums';
  tot.style.fontWeight = '600';
  tot.style.color = totalMes >= 0 ? 'var(--positive)' : 'var(--negative)';
  tot.innerHTML = escapeHtml(fmtSigned(totalMes, fmtUSD)) + copLineUSD(totalMes);
  totRow.appendChild(tot);
  host.appendChild(totRow);
}

function buildDayRow(d, acc) {
  const dd = parseLocalDate(d.date);
  const traded = !!d.traded;
  const pnl = toNum(d.pnl);
  const cls = !traded ? 'flat' : (pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'flat');

  const row = elh('button', 'tr-day pressable' + (!traded ? ' tr-day--flat' : ''));
  row.type = 'button';
  row.style.width = '100%';
  row.style.textAlign = 'left';

  const date = elh('div', 'tr-day__date');
  date.appendChild(elh('div', 'tr-day__d', String(dd ? dd.getDate() : '?')));
  date.appendChild(elh('div', 'tr-day__m', dd ? monthName(dd.getMonth() + 1, { abbr: true }) : ''));
  row.appendChild(date);

  const body = elh('div', 'tr-day__body');
  const titleTxt = traded ? (d.tag ? d.tag : 'Operado') : 'Sin operar';
  body.appendChild(elh('div', 'tr-day__tag', escapeHtml(titleTxt)));
  const subTxt = traded
    ? (toNum(d.trades) > 0 ? toNum(d.trades) + ' op.' : '') + (d.note ? (toNum(d.trades) > 0 ? ' · ' : '') + d.note : '')
    : (d.note || '');
  if (subTxt) body.appendChild(elh('div', 'tr-day__trades', escapeHtml(subTxt)));
  row.appendChild(body);

  const pnlNode = elh('div', 'tr-day__pnl ' + cls);
  pnlNode.innerHTML = traded ? escapeHtml(fmtSigned(pnl, fmtUSD)) : '—';
  row.appendChild(pnlNode);

  row.addEventListener('click', () => openDaySheet(d.date));
  return row;
}

function buildMonthBar(dateISO, onChange) {
  const d = parseLocalDate(dateISO) || parseLocalDate(hoy());
  const bar = elh('div');
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.justifyContent = 'space-between';
  bar.style.gap = 'var(--sp-2)';

  const prev = elh('button', 'btn btn--icon pressable', ICON.chevron);
  prev.type = 'button';
  prev.style.transform = 'scaleX(-1)';
  prev.setAttribute('aria-label', 'Mes anterior');
  prev.addEventListener('click', () => onChange(addMonths(dateISO, -1)));

  const label = elh('div');
  label.style.fontFamily = 'var(--font-serif)';
  label.style.fontSize = 'var(--fs-h3)';
  label.style.fontWeight = '500';
  label.style.color = 'var(--text-primary)';
  label.textContent = monthName(d.getMonth() + 1) + ' ' + d.getFullYear();

  const next = elh('button', 'btn btn--icon pressable', ICON.chevron);
  next.type = 'button';
  next.setAttribute('aria-label', 'Mes siguiente');
  next.addEventListener('click', () => onChange(addMonths(dateISO, 1)));

  bar.appendChild(prev);
  bar.appendChild(label);
  bar.appendChild(next);
  return bar;
}

/* ============================================================================
 *  TAB · STATS
 *  Las 10 tarjetas (§6.4) + barsNet P&L diario + heatmapCal + histogram +
 *  monthlyPnl (groupedBars con línea meta)
 * ========================================================================== */
function renderStats(host, acc) {
  const st = tradingStats({ accountId: acc.id });
  const s = getSettings();
  const targetPct = toNum(s && s.trading && s.trading.monthlyTargetPct, 0);
  const fx = getFxRate();

  // Retorno del mes (mes en curso).
  const curKey = monthKey(hoy());
  const mp = monthlyPnl(acc.id, parseLocalDate(hoy()).getFullYear());
  const moRow = mp.find((r) => r.key === curKey) || { pnl: 0, returnPct: null };

  // --- 10 tarjetas ---
  const grid = elh('div', 'tr-stat-grid');

  // 1) Balance (USD/COP)
  grid.appendChild(statCard('Balance', fmtUSD(st.currentBalance),
    showCop() ? '≈ ' + fmtCOP(st.currentBalance * fx) : null));

  // 2) P&L total (USD/COP/%)
  grid.appendChild(statCard('P&L total', fmtSigned(st.totalPnl, fmtUSD),
    (st.returnPct === null ? '—' : fmtSigned(st.returnPct, (n) => fmtPct(n, 1))) +
    (showCop() ? ' · ≈ ' + fmtCOP(st.totalPnl * fx) : ''),
    st.totalPnl >= 0 ? 'pos' : 'neg'));

  // 3) Retorno del mes (vs meta)
  grid.appendChild(statCard('Retorno del mes',
    moRow.returnPct === null ? '—' : fmtSigned(moRow.returnPct, (n) => fmtPct(n, 1)),
    'Meta ' + fmtPct(targetPct, 0) + (moRow.returnPct !== null && moRow.returnPct >= targetPct ? ' ✓' : ''),
    moRow.pnl >= 0 ? 'pos' : 'neg'));

  // 4) Win rate
  grid.appendChild(statCard('Win rate',
    st.winRate === null ? '—' : fmtPct(st.winRate, 1),
    st.tradedDays + ' días operados'));

  // 5) Profit factor
  grid.appendChild(statCard('Profit factor',
    typeof st.profitFactor === 'number' ? fmtPct(st.profitFactor, 2).replace(' %', '') : String(st.profitFactor),
    'Ganancia / pérdida'));

  // 6) Prom verde/rojo (payoff)
  grid.appendChild(statCard('Prom. verde / rojo',
    fmtUSD(st.avgGreen) + ' / ' + fmtUSD(st.avgRed),
    'Payoff ' + (st.payoff === null ? '—' : fmtPct(st.payoff, 2).replace(' %', ''))));

  // 7) Mejor / Peor día
  grid.appendChild(statCard('Mejor / Peor día',
    (st.bestDay ? fmtSigned(st.bestDay.pnl, fmtUSD) : '—'),
    (st.worstDay ? fmtSigned(st.worstDay.pnl, fmtUSD) : '—'),
    st.bestDay && st.bestDay.pnl >= 0 ? 'pos' : null));

  // 8) Verdes / rojos / planos
  grid.appendChild(statCard('Verdes / Rojos / Planos',
    st.greenDays + ' / ' + st.redDays + ' / ' + st.flatDays,
    'Distribución de días'));

  // 9) Racha actual / máx verde / máx roja
  const rachaStr = (st.currentStreak === 0 ? '0' : (st.currentStreak > 0 ? '+' : '') + st.currentStreak);
  grid.appendChild(statCard('Racha',
    rachaStr,
    'Máx ' + st.maxGreenStreak + ' verde · ' + st.maxRedStreak + ' roja',
    st.currentStreak > 0 ? 'pos' : st.currentStreak < 0 ? 'neg' : null));

  // 10) Drawdown máx / actual
  grid.appendChild(statCard('Drawdown máx',
    fmtUSD(st.maxDD),
    (st.maxDDPct === null ? '—' : fmtPct(st.maxDDPct, 1)) + ' · actual ' + fmtUSD(st.currentDD),
    'neg'));

  host.appendChild(grid);

  // --- barsNet: P&L diario (mes en curso) ---
  const barsCard = elh('div', 'chart-card');
  const bh = elh('div', 'chart-card__head');
  bh.appendChild(elh('div', 'chart-card__title', 'P&L diario'));
  bh.appendChild(elh('div', 'chart-card__meta', monthName(parseLocalDate(hoy()).getMonth() + 1)));
  barsCard.appendChild(bh);
  const barsWrap = elh('div', 'chart-wrap');
  barsCard.appendChild(barsWrap);
  host.appendChild(barsCard);

  const monthDays = getTradeDays({ accountId: acc.id, month: curKey })
    .filter((d) => d.traded)
    .map((d) => ({ label: String(parseLocalDate(d.date).getDate()), value: toNum(d.pnl) }));
  if (monthDays.length) {
    barsNet(barsWrap, monthDays, { currency: 'USD', height: 160, cssHeight: '160px' });
  } else {
    emptyState(barsWrap, { icon: 'chart', message: 'Sin días operados este mes.' });
  }

  // --- heatmapCal: calendario del mes ---
  const heatCard = elh('div', 'chart-card');
  const hh = elh('div', 'chart-card__head');
  hh.appendChild(elh('div', 'chart-card__title', 'Calendario'));
  heatCard.appendChild(hh);
  const heatWrap = elh('div', 'chart-wrap');
  heatCard.appendChild(heatWrap);
  host.appendChild(heatCard);

  const calData = pnlCalendar({ accountId: acc.id, month: curKey });
  heatmapCal(heatWrap, calData, { month: curKey, currency: 'USD' });

  // --- histogram: distribución de P&L ---
  const histCard = elh('div', 'chart-card');
  const hih = elh('div', 'chart-card__head');
  hih.appendChild(elh('div', 'chart-card__title', 'Distribución de resultados'));
  histCard.appendChild(hih);
  const histWrap = elh('div', 'chart-wrap');
  histCard.appendChild(histWrap);
  host.appendChild(histCard);

  const dist = pnlDistribution({ accountId: acc.id });
  if (dist.bins.length) {
    histogram(histWrap, dist.bins, { mean: dist.mean, median: dist.median, height: 180, cssHeight: '180px' });
  } else {
    emptyState(histWrap, { icon: 'chart', message: 'Aún no hay suficientes operaciones.' });
  }

  // --- monthlyPnl: retorno mensual (groupedBars con línea meta) ---
  const moCard = elh('div', 'chart-card');
  const mh = elh('div', 'chart-card__head');
  mh.appendChild(elh('div', 'chart-card__title', 'Retorno mensual'));
  mh.appendChild(elh('div', 'chart-card__meta', String(parseLocalDate(hoy()).getFullYear())));
  moCard.appendChild(mh);
  const moWrap = elh('div', 'chart-wrap');
  moCard.appendChild(moWrap);
  host.appendChild(moCard);

  // groupedBars: a = P&L del mes (USD), línea = meta (en USD equivalente sobre balance inicio).
  const moBars = mp.map((r) => ({
    label: monthName(r.month, { abbr: true }),
    a: toNum(r.pnl),
    b: 0,
    line: null,
  }));
  const anyMonth = moBars.some((r) => r.a !== 0);
  if (anyMonth) {
    groupedBars(moWrap, moBars, {
      currency: 'USD', height: 200, cssHeight: '200px',
      colorA: 'var(--chart-bar)', colorB: 'transparent',
      labelA: 'P&L mes', labelB: '',
    });
  } else {
    emptyState(moWrap, { icon: 'chart', message: 'Sin actividad este año.' });
  }

  if (showCop()) host.appendChild(infoNote('Equivalencias COP referenciales a la tasa actual.'));
}

function statCard(label, value, sub, sign) {
  const card = elh('div', 'stat-card');
  card.appendChild(elh('div', 'stat-card__label', escapeHtml(label)));
  const v = elh('div', 'stat-card__value', escapeHtml(value));
  if (sign === 'pos') v.style.color = 'var(--positive)';
  else if (sign === 'neg') v.style.color = 'var(--negative)';
  card.appendChild(v);
  if (sub != null) card.appendChild(elh('div', 'stat-card__sub', escapeHtml(sub)));
  return card;
}

/* ============================================================================
 *  TAB · MOVIMIENTOS (caja)  +Depósito / Retiro
 * ========================================================================== */
function renderMovements(host, acc) {
  const head = elh('div');
  head.style.display = 'grid';
  head.style.gridTemplateColumns = 'repeat(2, 1fr)';
  head.style.gap = 'var(--sp-3)';
  const dep = elh('button', 'btn btn--primary pressable', ICON.up + '<span>Depósito</span>');
  dep.type = 'button';
  dep.addEventListener('click', () => openMovementSheet('deposit'));
  const wd = elh('button', 'btn btn--outline pressable', ICON.down + '<span>Retiro</span>');
  wd.type = 'button';
  wd.addEventListener('click', () => openMovementSheet('withdrawal'));
  head.appendChild(dep);
  head.appendChild(wd);
  host.appendChild(head);

  // Resumen de caja.
  const movs = getTradingMovements({ accountId: acc.id });
  const sumDep = movs.filter((m) => m.type === 'deposit').reduce((a, m) => a + toNum(m.amount), 0);
  const sumWd = movs.filter((m) => m.type === 'withdrawal').reduce((a, m) => a + toNum(m.amount), 0);

  const grid = elh('div', 'tr-stat-grid');
  grid.appendChild(kpiCard('Depósitos', fmtUSD(sumDep), showCop() ? '≈ ' + fmtCOP(sumDep * getFxRate()) : '', 'pos'));
  grid.appendChild(kpiCard('Retiros', fmtUSD(sumWd), showCop() ? '≈ ' + fmtCOP(sumWd * getFxRate()) : '', 'neg'));
  host.appendChild(grid);

  if (!movs.length) {
    const box = elh('div');
    emptyState(box, {
      icon: 'caja',
      title: 'Sin movimientos de caja',
      message: 'Registra tus depósitos y retiros para un balance fiel.',
      ctaLabel: 'Añadir depósito',
      onCta: () => openMovementSheet('deposit'),
    });
    host.appendChild(box);
    return;
  }

  const list = elh('div', 'list--card');
  movs.forEach((m) => list.appendChild(buildMovementRow(m)));
  host.appendChild(list);
}

function buildMovementRow(m) {
  const isDep = m.type === 'deposit';
  const row = elh('div', 'tr-mov');
  const ic = elh('div', 'tr-mov__ic ' + (isDep ? 'tr-mov__ic--dep' : 'tr-mov__ic--wd'), isDep ? ICON.up : ICON.down);
  row.appendChild(ic);
  const body = elh('div', 'tr-mov__body');
  body.appendChild(elh('div', 'tr-mov__t', isDep ? 'Depósito' : 'Retiro'));
  body.appendChild(elh('div', 'tr-mov__s', formatDateEs(m.date) + (m.note ? ' · ' + m.note : '')));
  row.appendChild(body);
  const amt = elh('div', 'tr-mov__amt');
  amt.style.color = isDep ? 'var(--positive)' : 'var(--negative)';
  amt.textContent = (isDep ? '+' : '−') + fmtUSD(m.amount);
  row.appendChild(amt);
  const del = elh('button', 'btn--icon-bare tr-mov__del pressable', ICON.trash);
  del.type = 'button';
  del.setAttribute('aria-label', 'Eliminar movimiento');
  del.addEventListener('click', () => {
    openModal({
      title: '¿Eliminar movimiento?',
      content: 'Se eliminará este ' + (isDep ? 'depósito' : 'retiro') + ' de ' + fmtUSD(m.amount) + '.',
      confirmText: 'Eliminar', danger: true, icon: 'trash',
      onConfirm: () => {
        deleteTradingMovement(m.id);
        emitChanged('delete-movement');
        toast('Movimiento eliminado', { type: 'info' });
        paint();
      },
    });
  });
  row.appendChild(del);
  return row;
}

/* ============================================================================
 *  TAB · REPORTES
 *  Consistencia / score · mejor / peor mes
 * ========================================================================== */
function renderReports(host, acc) {
  const cons = tradingConsistency(acc.id);

  // Score de consistencia.
  const scoreCard = elh('div', 'tr-score');
  scoreCard.appendChild(elh('div', 'tr-score__num', String(cons.score)));
  const sb = elh('div', 'tr-score__body');
  sb.appendChild(elh('div', 'stat-card__label', 'Score de consistencia'));
  sb.appendChild(elh('div', 'stat-card__sub',
    cons.monthsGreen + ' / ' + cons.monthsTotal + ' meses verdes · ' +
    'σ ' + (cons.sigma === null ? '—' : fmtUSD(cons.sigma)) + ' · ' +
    'CV ' + (cons.cv === null ? '—' : fmtPct(cons.cv, 2).replace(' %', ''))));
  scoreCard.appendChild(sb);
  host.appendChild(scoreCard);

  // Win rate + profit factor.
  const grid = elh('div', 'tr-stat-grid');
  grid.appendChild(kpiCard('Win rate', cons.winRate === null ? '—' : fmtPct(cons.winRate, 1), 'Días verdes / operados'));
  grid.appendChild(kpiCard('Profit factor',
    typeof cons.profitFactor === 'number' ? fmtPct(cons.profitFactor, 2).replace(' %', '') : String(cons.profitFactor),
    'Ganancia / pérdida'));
  host.appendChild(grid);

  // Mejor / peor mes.
  const year = parseLocalDate(hoy()).getFullYear();
  const mp = monthlyPnl(acc.id, year).filter((r) => r.pnl !== 0);
  let best = null; let worst = null;
  mp.forEach((r) => {
    if (best === null || r.pnl > best.pnl) best = r;
    if (worst === null || r.pnl < worst.pnl) worst = r;
  });

  const sec = elh('div', 'section');
  sec.appendChild(elh('div', 'section__title', 'Mejor y peor mes (' + year + ')'));
  const grid2 = elh('div', 'tr-stat-grid');
  grid2.appendChild(kpiCard('Mejor mes',
    best ? fmtSigned(best.pnl, fmtUSD) : '—',
    best ? monthName(best.month) + (best.returnPct === null ? '' : ' · ' + fmtSigned(best.returnPct, (n) => fmtPct(n, 1))) : 'Sin datos',
    'pos'));
  grid2.appendChild(kpiCard('Peor mes',
    worst ? fmtSigned(worst.pnl, fmtUSD) : '—',
    worst ? monthName(worst.month) + (worst.returnPct === null ? '' : ' · ' + fmtSigned(worst.returnPct, (n) => fmtPct(n, 1))) : 'Sin datos',
    worst && worst.pnl < 0 ? 'neg' : null));
  sec.appendChild(grid2);
  host.appendChild(sec);

  // Resumen mensual (tabla).
  const allMonths = monthlyPnl(acc.id, year);
  const tableSec = elh('div', 'section');
  tableSec.appendChild(elh('div', 'section__title', 'Resumen mensual'));
  const wrap = elh('div', 'report-table');
  const table = document.createElement('table');
  table.innerHTML =
    '<thead><tr><th>Mes</th><th class="num">P&L</th><th class="num">Retorno</th></tr></thead>';
  const tbody = document.createElement('tbody');
  let anyRow = false;
  allMonths.forEach((r) => {
    if (r.pnl === 0 && r.returnPct === null) return;
    anyRow = true;
    const tr = document.createElement('tr');
    const cls = r.pnl >= 0 ? 'num--pos' : 'num--neg';
    tr.innerHTML =
      '<td>' + escapeHtml(monthName(r.month)) + '</td>' +
      '<td class="num ' + cls + '">' + escapeHtml(fmtSigned(r.pnl, fmtUSD)) + '</td>' +
      '<td class="num ' + cls + '">' + (r.returnPct === null ? '—' : escapeHtml(fmtSigned(r.returnPct, (n) => fmtPct(n, 1)))) + '</td>';
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  if (anyRow) {
    tableSec.appendChild(wrap);
  } else {
    const box = elh('div');
    emptyState(box, { icon: 'reportes', message: 'Necesitas algunos meses más para ver tendencias.' });
    tableSec.appendChild(box);
  }
  host.appendChild(tableSec);
}

/* ============================================================================
 *  TAB · AJUSTES DEL MÓDULO (atajo; el completo está en #/ajustes)
 * ========================================================================== */
function renderModuleSettings(host, acc) {
  const s = getSettings();
  const group = elh('div', 'settings-group');

  // Balance inicial.
  group.appendChild(settingRow('Balance inicial', fmtUSD(acc.initialBalance), () => {
    promptText({
      title: 'Balance inicial (USD)', label: 'Capital base de la cuenta',
      value: String(acc.initialBalance || ''), inputmode: 'decimal',
      validate: (v) => (toNum(v) < 0 ? 'No puede ser negativo' : null),
    }).then((v) => {
      if (v === null) return;
      updateTradingAccount(acc.id, { initialBalance: toNum(v) });
      emitChanged('update-account');
      toast('Balance inicial actualizado', { type: 'success' });
      paint();
    });
  }));

  // Fecha de inicio.
  group.appendChild(settingRow('Fecha de inicio', acc.startDate ? formatDateEs(acc.startDate) : '—', () => {
    openDatePromptSheet('Fecha de inicio', acc.startDate || hoy(), (d) => {
      updateTradingAccount(acc.id, { startDate: d });
      emitChanged('update-account');
      toast('Fecha de inicio actualizada', { type: 'success' });
      paint();
    });
  }));

  // Meta mensual %.
  group.appendChild(settingRow('Meta mensual', fmtPct(toNum(s.trading && s.trading.monthlyTargetPct), 0), () => {
    promptText({
      title: 'Meta mensual (%)', label: 'Retorno objetivo por mes',
      value: String((s.trading && s.trading.monthlyTargetPct) || ''), inputmode: 'decimal',
      validate: (v) => (toNum(v) < 0 ? 'No puede ser negativo' : null),
    }).then((v) => {
      if (v === null) return;
      updateSettings({ trading: { monthlyTargetPct: toNum(v) } });
      emitChanged('update-settings');
      toast('Meta actualizada', { type: 'success' });
      paint();
    });
  }));

  // Nombre de la cuenta.
  group.appendChild(settingRow('Nombre de la cuenta', acc.name, () => {
    promptText({
      title: 'Nombre de la cuenta', value: acc.name,
      validate: (v) => (!v.trim() ? 'Escribe un nombre' : null),
    }).then((v) => {
      if (v === null) return;
      updateTradingAccount(acc.id, { name: v });
      emitChanged('update-account');
      paint();
    });
  }));

  // Broker.
  group.appendChild(settingRow('Broker', acc.broker || '—', () => {
    promptText({ title: 'Broker', value: acc.broker || '' }).then((v) => {
      if (v === null) return;
      updateTradingAccount(acc.id, { broker: v });
      emitChanged('update-account');
      paint();
    });
  }));

  host.appendChild(group);

  // Etiquetas de sesión.
  const tagSec = elh('div', 'section');
  tagSec.appendChild(elh('div', 'section__title', 'Etiquetas de sesión'));
  const tagWrap = elh('div', 'chip-row');
  const tags = (s.trading && Array.isArray(s.trading.tags)) ? s.trading.tags : [];
  tags.forEach((t) => {
    const chip = elh('span', 'chip', escapeHtml(t));
    tagWrap.appendChild(chip);
  });
  const addTag = elh('button', 'chip chip--add pressable', ICON.plus + '<span>Etiqueta</span>');
  addTag.type = 'button';
  addTag.addEventListener('click', () => {
    promptText({ title: 'Nueva etiqueta', placeholder: 'Ej. Londres' }).then((v) => {
      if (!v) return;
      const next = tags.slice();
      if (!next.includes(v)) next.push(v);
      updateSettings({ trading: { tags: next } });
      emitChanged('update-settings');
      paint();
    });
  });
  tagWrap.appendChild(addTag);
  tagSec.appendChild(tagWrap);
  host.appendChild(tagSec);

  // Enlace a Ajustes completos.
  const link = elh('button', 'btn btn--ghost btn--full pressable', 'Abrir Ajustes completos');
  link.type = 'button';
  link.addEventListener('click', () => { location.hash = '#/ajustes'; });
  host.appendChild(link);
}

function settingRow(label, value, onClick) {
  const row = elh('button', 'settings-row pressable');
  row.type = 'button';
  row.style.width = '100%';
  row.appendChild(elh('span', 'settings-row__label', escapeHtml(label)));
  row.appendChild(elh('span', 'settings-row__value', escapeHtml(value)));
  row.appendChild(elh('span', 'settings-row__chevron', ICON.chevron));
  if (onClick) row.addEventListener('click', onClick);
  return row;
}

/* ============================================================================
 *  SHEET · REGISTRAR / EDITAR DÍA
 *  Foco en P&L · botones [+ Ganancia][− Pérdida] · chips de etiqueta ·
 *  "Hoy no operé" · si la fecha ya existe → modo edición.
 * ========================================================================== */
function openDaySheet(dateISO) {
  const acc = activeAccount();
  if (!acc) { openCreateAccountSheet(); return; }

  const date = (dateISO && parseLocalDate(dateISO)) ? dateISO : hoy();
  const existing = getTradeDays({ accountId: acc.id, from: date, to: date })[0] || null;

  // Estado local del formulario.
  let sign = existing ? (toNum(existing.pnl) >= 0 ? 1 : -1) : 1; // +1 ganancia / -1 pérdida
  let traded = existing ? !!existing.traded : true;
  let tag = existing ? (existing.tag || null) : null;

  const s = getSettings();
  const tags = (s.trading && Array.isArray(s.trading.tags)) ? s.trading.tags : [];

  const wrap = elh('div', 'stack');

  // Selector de fecha.
  const dateRow = elh('button', 'settings-row pressable');
  dateRow.type = 'button';
  dateRow.style.width = '100%';
  dateRow.style.borderRadius = 'var(--r-md)';
  dateRow.style.background = 'var(--bg-surface-2)';
  dateRow.appendChild(elh('span', 'settings-row__label', 'Fecha'));
  const dateVal = elh('span', 'settings-row__value', formatDateEs(date, { weekday: true }));
  dateRow.appendChild(dateVal);
  dateRow.appendChild(elh('span', 'settings-row__chevron', ICON.chevron));
  let curDate = date;
  dateRow.addEventListener('click', () => {
    openDatePromptSheet('Fecha del día', curDate, (d) => {
      curDate = d;
      dateVal.textContent = formatDateEs(d, { weekday: true });
    });
  });
  wrap.appendChild(dateRow);

  // Línea de monto (P&L).
  const amountLine = elh('div', 'tr-sheet-amount');
  amountLine.appendChild(elh('span', 'tr-sheet-amount__cur', 'US$'));
  const input = document.createElement('input');
  input.className = 'input input--amount';
  input.setAttribute('inputmode', 'decimal');
  input.placeholder = '0.00';
  input.style.maxWidth = '60%';
  amountLine.appendChild(input);
  wrap.appendChild(amountLine);

  const copHint = elh('div', 'tr-sheet-amount__cop');
  wrap.appendChild(copHint);

  const ctrl = attachAmountInput(input, {
    currency: 'USD',
    onChange: (val) => updateCopHint(val),
  });
  if (existing && existing.traded) ctrl.setValue(Math.abs(toNum(existing.pnl)));

  function updateCopHint(val) {
    if (!showCop()) { copHint.textContent = ''; return; }
    const usdVal = (sign < 0 ? -1 : 1) * toNum(val);
    copHint.textContent = '≈ ' + fmtCOP(usdVal * getFxRate());
  }
  updateCopHint(ctrl.getValue());

  // Toggle Ganancia / Pérdida.
  const pn = elh('div', 'tr-pn-toggle');
  const gBtn = elh('button', 'btn btn--outline pressable', ICON.up + '<span>Ganancia</span>');
  gBtn.type = 'button';
  const lBtn = elh('button', 'btn btn--outline pressable', ICON.down + '<span>Pérdida</span>');
  lBtn.type = 'button';
  function paintSign() {
    gBtn.classList.toggle('is-on--pos', sign > 0);
    lBtn.classList.toggle('is-on--neg', sign < 0);
  }
  gBtn.addEventListener('click', () => { sign = 1; paintSign(); updateCopHint(ctrl.getValue()); });
  lBtn.addEventListener('click', () => { sign = -1; paintSign(); updateCopHint(ctrl.getValue()); });
  paintSign();
  pn.appendChild(gBtn);
  pn.appendChild(lBtn);
  wrap.appendChild(pn);

  // Número de operaciones.
  const tradesField = elh('div', 'field');
  tradesField.appendChild(elh('label', 'field__label', 'Operaciones (opcional)'));
  const tradesInput = document.createElement('input');
  tradesInput.className = 'input';
  tradesInput.type = 'text';
  tradesInput.setAttribute('inputmode', 'numeric');
  tradesInput.placeholder = '0';
  tradesInput.value = existing && toNum(existing.trades) > 0 ? String(existing.trades) : '';
  tradesInput.addEventListener('input', () => {
    tradesInput.value = tradesInput.value.replace(/[^\d]/g, '');
  });
  tradesField.appendChild(tradesInput);
  wrap.appendChild(tradesField);

  // Chips de etiqueta.
  const tagSec = elh('div', 'field');
  tagSec.appendChild(elh('label', 'field__label', 'Etiqueta de sesión'));
  const chipRow = elh('div', 'chip-row chip-row--scroll');
  function paintChips() {
    chipRow.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('chip--active', c.dataset.tag === (tag || ''));
    });
  }
  tags.forEach((t) => {
    const chip = elh('button', 'chip pressable', escapeHtml(t));
    chip.type = 'button';
    chip.dataset.tag = t;
    chip.addEventListener('click', () => { tag = (tag === t ? null : t); paintChips(); });
    chipRow.appendChild(chip);
  });
  tagSec.appendChild(chipRow);
  paintChips();
  wrap.appendChild(tagSec);

  // Nota.
  const noteField = elh('div', 'field');
  noteField.appendChild(elh('label', 'field__label', 'Nota (opcional)'));
  const noteInput = document.createElement('textarea');
  noteInput.className = 'textarea';
  noteInput.rows = 2;
  noteInput.value = existing ? (existing.note || '') : '';
  noteField.appendChild(noteInput);
  wrap.appendChild(noteField);

  // "Hoy no operé".
  const flatRow = elh('label', 'tr-toggle');
  flatRow.style.justifyContent = 'space-between';
  flatRow.style.width = '100%';
  flatRow.style.padding = 'var(--sp-3) 0';
  flatRow.appendChild(elh('span', null, 'No operé este día'));
  const flatSw = elh('span', 'switch');
  const flatInp = elh('input');
  flatInp.type = 'checkbox';
  flatInp.checked = !traded;
  flatSw.appendChild(flatInp);
  flatSw.appendChild(elh('span', 'switch__track'));
  flatRow.appendChild(flatSw);
  wrap.appendChild(flatRow);

  function setTradedMode(isTraded) {
    traded = isTraded;
    [input, tradesInput, gBtn, lBtn].forEach((n) => { n.disabled = !isTraded; });
    chipRow.querySelectorAll('.chip').forEach((c) => { c.disabled = !isTraded; });
    amountLine.style.opacity = isTraded ? '1' : '0.4';
    pn.style.opacity = isTraded ? '1' : '0.4';
  }
  flatInp.addEventListener('change', () => setTradedMode(!flatInp.checked));
  setTradedMode(traded);

  const actions = [
    { label: 'Cancelar', variant: 'ghost' },
    {
      label: existing ? 'Guardar cambios' : 'Registrar',
      variant: 'primary',
      onClick: () => {
        const pnlMagnitude = ctrl.getValue();
        const pnl = traded ? (sign < 0 ? -pnlMagnitude : pnlMagnitude) : 0;
        const trades = traded ? (parseInt(tradesInput.value, 10) || 0) : 0;
        setTradeDay({
          accountId: acc.id,
          date: curDate,
          pnl,
          trades,
          note: noteInput.value.trim(),
          tag: traded ? tag : null,
          traded,
        });
        emitChanged('set-day');
        try { ctrl.destroy(); } catch (_e) { /* noop */ }
        toast(existing ? 'Día actualizado' : 'Día registrado',
          { type: traded ? (pnl >= 0 ? 'success' : 'info') : 'info' });
        _state.diaryDate = curDate;
        paint();
        return true;
      },
    },
  ];
  if (existing) {
    actions.splice(1, 0, {
      label: 'Eliminar', variant: 'danger', closeOnClick: false,
      onClick: () => {
        openModal({
          title: '¿Eliminar día?',
          content: 'Se borrará el registro del ' + formatDateEs(curDate) + '.',
          confirmText: 'Eliminar', danger: true, icon: 'trash',
          onConfirm: () => {
            deleteTradeDay(curDate, acc.id);
            emitChanged('delete-day');
            try { ctrl.destroy(); } catch (_e) { /* noop */ }
            closeSheet();
            toast('Día eliminado', { type: 'info' });
            paint();
          },
        });
        return false;
      },
    });
  }

  openSheet({
    title: existing ? 'Editar día' : 'Registrar día',
    content: wrap,
    actions,
    onClose: () => { try { ctrl.destroy(); } catch (_e) { /* noop */ } },
  });

  setTimeout(() => { try { input.focus(); } catch (_e) { /* noop */ } }, 220);
}

/* ============================================================================
 *  SHEET · DEPÓSITO / RETIRO
 * ========================================================================== */
function openMovementSheet(initialType) {
  const acc = activeAccount();
  if (!acc) { openCreateAccountSheet(); return; }

  let type = initialType === 'withdrawal' ? 'withdrawal' : 'deposit';
  let curDate = hoy();

  const wrap = elh('div', 'stack');

  // Segmented depósito/retiro.
  const seg = elh('div', 'segmented');
  const depItem = elh('button', 'segmented__item' + (type === 'deposit' ? ' segmented__item--active' : ''), 'Depósito');
  depItem.type = 'button';
  const wdItem = elh('button', 'segmented__item' + (type === 'withdrawal' ? ' segmented__item--active' : ''), 'Retiro');
  wdItem.type = 'button';
  depItem.addEventListener('click', () => { type = 'deposit'; depItem.classList.add('segmented__item--active'); wdItem.classList.remove('segmented__item--active'); updateCop(); });
  wdItem.addEventListener('click', () => { type = 'withdrawal'; wdItem.classList.add('segmented__item--active'); depItem.classList.remove('segmented__item--active'); updateCop(); });
  seg.appendChild(depItem);
  seg.appendChild(wdItem);
  wrap.appendChild(seg);

  // Monto.
  const amountLine = elh('div', 'tr-sheet-amount');
  amountLine.appendChild(elh('span', 'tr-sheet-amount__cur', 'US$'));
  const input = document.createElement('input');
  input.className = 'input input--amount';
  input.placeholder = '0.00';
  input.style.maxWidth = '60%';
  amountLine.appendChild(input);
  wrap.appendChild(amountLine);

  const copHint = elh('div', 'tr-sheet-amount__cop');
  wrap.appendChild(copHint);

  const ctrl = attachAmountInput(input, { currency: 'USD', onChange: () => updateCop() });
  function updateCop() {
    if (!showCop()) { copHint.textContent = ''; return; }
    copHint.textContent = '≈ ' + fmtCOP(ctrl.getValue() * getFxRate());
  }
  updateCop();

  // Fecha.
  const dateRow = elh('button', 'settings-row pressable');
  dateRow.type = 'button';
  dateRow.style.width = '100%';
  dateRow.style.borderRadius = 'var(--r-md)';
  dateRow.style.background = 'var(--bg-surface-2)';
  dateRow.appendChild(elh('span', 'settings-row__label', 'Fecha'));
  const dateVal = elh('span', 'settings-row__value', formatDateEs(curDate, { weekday: true }));
  dateRow.appendChild(dateVal);
  dateRow.appendChild(elh('span', 'settings-row__chevron', ICON.chevron));
  dateRow.addEventListener('click', () => {
    openDatePromptSheet('Fecha del movimiento', curDate, (d) => {
      curDate = d; dateVal.textContent = formatDateEs(d, { weekday: true });
    });
  });
  wrap.appendChild(dateRow);

  // Nota.
  const noteField = elh('div', 'field');
  noteField.appendChild(elh('label', 'field__label', 'Nota (opcional)'));
  const noteInput = document.createElement('input');
  noteInput.className = 'input';
  noteInput.type = 'text';
  noteField.appendChild(noteInput);
  wrap.appendChild(noteField);

  openSheet({
    title: 'Movimiento de caja',
    content: wrap,
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Guardar', variant: 'primary',
        onClick: () => {
          const amount = ctrl.getValue();
          if (amount <= 0) { toast('Ingresa un monto válido', { type: 'error' }); return false; }
          addTradingMovement({ accountId: acc.id, type, amount, date: curDate, note: noteInput.value.trim() });
          emitChanged('add-movement');
          try { ctrl.destroy(); } catch (_e) { /* noop */ }
          toast(type === 'deposit' ? 'Depósito registrado' : 'Retiro registrado',
            { type: type === 'deposit' ? 'success' : 'info' });
          paint();
          return true;
        },
      },
    ],
    onClose: () => { try { ctrl.destroy(); } catch (_e) { /* noop */ } },
  });

  setTimeout(() => { try { input.focus(); } catch (_e) { /* noop */ } }, 220);
}

/* ============================================================================
 *  SHEET · CREAR CUENTA DE TRADING
 * ========================================================================== */
function openCreateAccountSheet() {
  const wrap = elh('div', 'stack');

  const nameField = elh('div', 'field');
  nameField.appendChild(elh('label', 'field__label', 'Nombre de la cuenta'));
  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.type = 'text';
  nameInput.placeholder = 'Mi cuenta de trading';
  nameField.appendChild(nameInput);
  wrap.appendChild(nameField);

  const brokerField = elh('div', 'field');
  brokerField.appendChild(elh('label', 'field__label', 'Broker (opcional)'));
  const brokerInput = document.createElement('input');
  brokerInput.className = 'input';
  brokerInput.type = 'text';
  brokerField.appendChild(brokerInput);
  wrap.appendChild(brokerField);

  const balField = elh('div', 'field');
  balField.appendChild(elh('label', 'field__label', 'Balance inicial (USD)'));
  const balInput = document.createElement('input');
  balInput.className = 'input';
  balInput.placeholder = '0.00';
  balField.appendChild(balInput);
  wrap.appendChild(balField);
  const balCtrl = attachAmountInput(balInput, { currency: 'USD' });

  let startDate = hoy();
  const dateRow = elh('button', 'settings-row pressable');
  dateRow.type = 'button';
  dateRow.style.width = '100%';
  dateRow.style.borderRadius = 'var(--r-md)';
  dateRow.style.background = 'var(--bg-surface-2)';
  dateRow.appendChild(elh('span', 'settings-row__label', 'Fecha de inicio'));
  const dateVal = elh('span', 'settings-row__value', formatDateEs(startDate));
  dateRow.appendChild(dateVal);
  dateRow.appendChild(elh('span', 'settings-row__chevron', ICON.chevron));
  dateRow.addEventListener('click', () => {
    openDatePromptSheet('Fecha de inicio', startDate, (d) => { startDate = d; dateVal.textContent = formatDateEs(d); });
  });
  wrap.appendChild(dateRow);

  openSheet({
    title: 'Nueva cuenta de trading',
    content: wrap,
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Crear', variant: 'primary',
        onClick: () => {
          const name = nameInput.value.trim() || 'Cuenta de trading';
          const initialBalance = balCtrl.getValue();
          const created = addTradingAccount({ name, broker: brokerInput.value.trim(), initialBalance, startDate });
          // Si hay balance inicial, lo registramos como depósito inicial para la base de capital.
          if (initialBalance > 0) {
            addTradingMovement({ accountId: created.id, type: 'deposit', amount: initialBalance, date: startDate, note: 'Depósito inicial' });
            // El initialBalance ya queda absorbido por el depósito (B0=0 cuando hay depósitos).
            updateTradingAccount(created.id, { initialBalance: 0 });
          }
          _state.accountId = created.id;
          emitChanged('add-account');
          try { balCtrl.destroy(); } catch (_e) { /* noop */ }
          toast('Cuenta creada', { type: 'success' });
          paint();
          return true;
        },
      },
    ],
    onClose: () => { try { balCtrl.destroy(); } catch (_e) { /* noop */ } },
  });
}

/* ============================================================================
 *  SHEET · SELECTOR DE FECHA SIMPLE (input date nativo + navegación)
 * ========================================================================== */
function openDatePromptSheet(title, currentISO, onPick) {
  const wrap = elh('div', 'stack');
  let value = (currentISO && parseLocalDate(currentISO)) ? currentISO : hoy();

  const field = elh('div', 'field');
  field.appendChild(elh('label', 'field__label', 'Selecciona la fecha'));
  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'date';
  input.value = value;
  input.max = hoy();
  field.appendChild(input);
  wrap.appendChild(field);

  // Atajos rápidos.
  const quick = elh('div', 'chip-row');
  [['Hoy', hoy()], ['Ayer', addDays(hoy(), -1)], ['Antier', addDays(hoy(), -2)]].forEach(([lbl, iso]) => {
    const chip = elh('button', 'chip pressable', lbl);
    chip.type = 'button';
    chip.addEventListener('click', () => { value = iso; input.value = iso; });
    quick.appendChild(chip);
  });
  wrap.appendChild(quick);

  openSheet({
    title: title || 'Fecha',
    content: wrap,
    height: '46dvh',
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Aceptar', variant: 'primary',
        onClick: () => {
          const picked = (input.value && parseLocalDate(input.value)) ? input.value : value;
          if (typeof onPick === 'function') onPick(picked);
          return true;
        },
      },
    ],
  });
}

export default { render, unmount };
