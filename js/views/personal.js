// ============================================================================
// XAURA · js/views/personal.js
// Vista #/personal (COP) — SPEC §6.2.
// Cabecera con segmented control Personal | Eventos (Eventos → #/eventos).
// Tabs internos: Movimientos (default) · Stats · Presupuestos · Metas · Reporte.
//
// Contrato de vista: export function render(params) / export function unmount().
// Pinta dentro de #view. Usa setHeader de ../ui/header.js. Tras registrar datos
// refresca la vista y dispara bus.emit('data:changed', …) si app.js está cargado.
// ============================================================================

import { setHeader } from '../ui/header.js';
import {
  fmtCOP, fmtPct, fmtSigned, maskValue,
} from '../core/currency.js';
import {
  hoy, monthKey, rangeForMonth, daysInMonth, parseLocalDate,
  formatDateEs, monthName, addMonths, lastNMonths, isToday,
} from '../core/dates.js';
import {
  getCategories, getAccounts,
  getTransactions, addTransaction, updateTransaction, deleteTransaction,
  setBudget, getBudget, deleteBudget,
  getGoals, addGoal, updateGoal, archiveGoal, contributeToGoal,
} from '../core/personal.js';
import {
  savingsRate, sumByCategory, dailyCashflow, monthlyCashflow,
  budgetVsActual, monthCompare, goalProgress, topExpenses,
} from '../core/aggregations.js';
import { getSettings } from '../core/settings.js';
import {
  barsNet, donut, groupedBars, progressBars, progressRing, mirrorBars,
} from '../ui/charts.js';
import { openSheet } from '../ui/sheet.js';
import { toast, snackbarUndo } from '../ui/toast.js';
import { emptyState } from '../ui/empty.js';
import { attachAmountInput } from '../ui/keypad.js';

/* ============================================================
 *  BUS (app.js) — opcional/defensivo
 * ============================================================ */
function bus() {
  return (window.XAURA && window.XAURA.bus) ? window.XAURA.bus : null;
}
function emitData(action) {
  const b = bus();
  if (b) b.emit('data:changed', { area: 'personal', action });
}

/* ============================================================
 *  ICONOS lineales inline (Tabler-like)
 * ============================================================ */
const ICONS = {
  income: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
  expense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12l7 7 7-7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.4"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
};

/* ============================================================
 *  ESTADO DEL MÓDULO
 * ============================================================ */
const TABS = ['movimientos', 'stats', 'presupuestos', 'metas', 'reporte'];
const TAB_LABELS = {
  movimientos: 'Movimientos',
  stats: 'Stats',
  presupuestos: 'Presupuestos',
  metas: 'Metas',
  reporte: 'Reporte',
};

let state = {
  tab: 'movimientos',
  month: monthKey(hoy()),
  filters: { type: null, categoryId: null, method: null, search: '' },
};
let _busUnsub = null;
let _root = null;

/* ============================================================
 *  HELPERS DE FORMATO / DOM
 * ============================================================ */
function settings() { return getSettings(); }
function cop(n) { return maskValue(n, fmtCOP, settings()); }

function elx(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined && html !== null) n.innerHTML = html;
  return n;
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Nombre legible del mes en curso "junio 2026".
function monthLabel(mk) {
  const r = rangeForMonth(mk + '-01');
  return `${monthName(r.month)} ${r.year}`;
}

// Día actual transcurrido si el mes seleccionado es el actual; si no, D_mes.
function diasTranscurridos(mk) {
  const r = rangeForMonth(mk + '-01');
  const nDays = daysInMonth(r.year, r.month);
  const today = parseLocalDate(hoy());
  if (today && today.getFullYear() === r.year && (today.getMonth() + 1) === r.month) {
    return today.getDate();
  }
  // Mes pasado → completo; mes futuro → 1 (evita división por 0).
  const todayKey = monthKey(hoy());
  return mk < todayKey ? nDays : 1;
}

/* ============================================================
 *  RENDER PRINCIPAL
 * ============================================================ */
export function render(params) {
  // Resolver tab desde query (?tab=) o subruta.
  if (params) {
    const t = params.tab || (params.segments && params.segments[0]) || params.sub;
    if (t && TABS.indexOf(t) !== -1) state.tab = t;
    if (params.fecha && /^\d{4}-\d{2}/.test(params.fecha)) {
      state.month = params.fecha.slice(0, 7);
    }
  }

  paintHeader();

  const view = document.getElementById('view');
  if (!view) return;
  view.replaceChildren();

  _root = elx('div', 'personal-view enter');
  view.appendChild(_root);

  // Sub-tabs internos (segmented scroll).
  _root.appendChild(buildSubTabs());

  // Contenedor del tab activo.
  const body = elx('div', 'personal-body');
  body.id = 'personal-body';
  _root.appendChild(body);

  renderTab(body);

  // Suscripción al bus para refrescar tras cambios.
  if (!_busUnsub) {
    const b = bus();
    if (b) {
      _busUnsub = b.on('data:changed', () => refresh());
    }
  }
}

export function unmount() {
  if (_busUnsub) { try { _busUnsub(); } catch (_e) { /* noop */ } _busUnsub = null; }
  _root = null;
}

// Re-render in-place del tab activo (sin perder header/segmented).
function refresh() {
  const body = document.getElementById('personal-body');
  if (body) renderTab(body);
  // Actualiza también el estado activo de los sub-tabs.
  const wrap = _root ? _root.querySelector('.segmented--scroll') : null;
  if (wrap) {
    wrap.querySelectorAll('.segmented__item').forEach((it) => {
      it.classList.toggle('segmented__item--active', it.dataset.tab === state.tab);
    });
  }
}

/* ============================================================
 *  CABECERA: segmented Personal | Eventos + nav de mes
 * ============================================================ */
function paintHeader() {
  setHeader({
    title: 'Personal',
    subtitle: 'Finanzas',
    actions: [
      {
        icon: ICONS.income,
        ariaLabel: 'Registrar ingreso',
        variant: 'gold',
        onClick: () => openTxnSheet('income'),
      },
      {
        icon: ICONS.expense,
        ariaLabel: 'Registrar gasto',
        onClick: () => openTxnSheet('expense'),
      },
    ],
  });

  // Segmented Personal | Eventos justo bajo el header (en el área del header inner).
  const header = document.getElementById('appheader');
  if (!header) return;
  const inner = header.querySelector('.header-inner');
  if (!inner) return;
  // Evita duplicar.
  let seg = header.querySelector('.personal-areaseg');
  if (seg) seg.remove();
  seg = elx('div', 'segmented personal-areaseg');
  seg.style.marginTop = 'var(--sp-3)';
  const a = elx('button', 'segmented__item segmented__item--active', 'Personal');
  a.type = 'button';
  const e = elx('button', 'segmented__item', 'Eventos');
  e.type = 'button';
  e.addEventListener('click', () => { location.hash = '#/eventos'; });
  seg.appendChild(a);
  seg.appendChild(e);
  header.appendChild(seg);
}

/* ============================================================
 *  SUB-TABS
 * ============================================================ */
function buildSubTabs() {
  const wrap = elx('div', 'subnav-wrap');
  const seg = elx('div', 'segmented segmented--ghost segmented--scroll');
  TABS.forEach((t) => {
    const b = elx('button', 'segmented__item' + (t === state.tab ? ' segmented__item--active' : ''), TAB_LABELS[t]);
    b.type = 'button';
    b.dataset.tab = t;
    b.addEventListener('click', () => {
      if (state.tab === t) return;
      state.tab = t;
      // refleja en hash sin recargar la vista (query tab).
      try { history.replaceState(null, '', `#/personal?tab=${t}`); } catch (_e) { /* noop */ }
      refresh();
    });
    seg.appendChild(b);
  });
  wrap.appendChild(seg);
  return wrap;
}

/* ============================================================
 *  ROUTER DE TABS
 * ============================================================ */
function renderTab(body) {
  body.replaceChildren();
  switch (state.tab) {
    case 'stats': renderStats(body); break;
    case 'presupuestos': renderPresupuestos(body); break;
    case 'metas': renderMetas(body); break;
    case 'reporte': renderReporte(body); break;
    case 'movimientos':
    default: renderMovimientos(body); break;
  }
}

/* ============================================================
 *  BARRA DE MES (reutilizable en todos los tabs)
 * ============================================================ */
function buildMonthBar(onChange) {
  const bar = elx('div', 'monthbar');
  Object.assign(bar.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)',
  });
  const nav = elx('div', 'daynav');
  const prev = elx('button', 'daynav__btn pressable',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Mes anterior');
  const label = elx('span', 'daynav__label', escapeHtml(monthLabel(state.month)));
  label.style.minWidth = '128px';
  const next = elx('button', 'daynav__btn pressable',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>');
  next.type = 'button';
  next.setAttribute('aria-label', 'Mes siguiente');

  prev.addEventListener('click', () => {
    state.month = monthKey(addMonths(state.month + '-01', -1));
    onChange();
  });
  next.addEventListener('click', () => {
    state.month = monthKey(addMonths(state.month + '-01', 1));
    onChange();
  });

  nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next);
  bar.appendChild(elx('div', 'section__title', 'Mes'));
  bar.appendChild(nav);
  return bar;
}

/* ============================================================
 *  TAB 1 — MOVIMIENTOS
 * ============================================================ */
function renderMovimientos(body) {
  // Barra de mes + filtros.
  body.appendChild(buildMonthBar(() => refresh()));

  // Resumen rápido del mes (3 ministats).
  const sr = savingsRate(state.month);
  const quick = elx('div', 'snapshot-today');
  quick.appendChild(ministat('Ingresos', cop(sr.ingresos), 'var(--positive)'));
  quick.appendChild(ministat('Gastos', cop(sr.gastos), 'var(--negative)'));
  quick.appendChild(ministat('Balance', cop(sr.balance), sr.balance >= 0 ? 'var(--positive)' : 'var(--negative)'));
  body.appendChild(quick);

  // Fila de filtros.
  body.appendChild(buildFilters());

  // Lista de movimientos por día.
  const f = state.filters;
  const txns = getTransactions({
    month: state.month,
    type: f.type || undefined,
    categoryId: f.categoryId || undefined,
    search: f.search || undefined,
    excludeTransfers: false,
    sort: 'date-desc',
  }).filter((t) => !f.method || t.method === f.method);

  const listWrap = elx('div', 'section');
  if (txns.length === 0) {
    emptyState(listWrap, {
      icon: 'movimientos',
      message: `Sin movimientos en ${monthLabel(state.month)}. ¿Registramos uno?`,
      actions: [
        { label: 'Ingreso', variant: 'outline', onClick: () => openTxnSheet('income') },
        { label: 'Gasto', variant: 'primary', onClick: () => openTxnSheet('expense') },
      ],
    });
  } else {
    listWrap.appendChild(buildTxnList(txns));
  }
  body.appendChild(listWrap);
}

function ministat(label, value, color) {
  const n = elx('div', 'ministat');
  n.appendChild(elx('span', 'ministat__label', escapeHtml(label)));
  const v = elx('span', 'ministat__value', escapeHtml(value));
  if (color) v.style.color = color;
  n.appendChild(v);
  return n;
}

function buildFilters() {
  const cats = getCategories({});
  const catById = new Map(cats.map((c) => [c.id, c]));
  const f = state.filters;

  const row = elx('div', 'chip-row chip-row--scroll');
  row.style.marginBottom = 'var(--sp-2)';

  // Chip "Todos" (limpia).
  const all = chip('Todos', !f.type && !f.categoryId && !f.method && !f.search);
  all.addEventListener('click', () => {
    state.filters = { type: null, categoryId: null, method: null, search: '' };
    refresh();
  });
  row.appendChild(all);

  // Tipo.
  ['income', 'expense'].forEach((t) => {
    const lbl = t === 'income' ? 'Ingresos' : 'Gastos';
    const c = chip(lbl, f.type === t);
    c.addEventListener('click', () => {
      state.filters.type = f.type === t ? null : t;
      refresh();
    });
    row.appendChild(c);
  });

  // Botón "más filtros" (categoría / método / búsqueda) vía sheet.
  const more = chip('Filtros', !!(f.categoryId || f.method || f.search), ICONS.filter);
  more.classList.add('chip--add');
  more.addEventListener('click', () => openFilterSheet(catById));
  row.appendChild(more);

  // Chips de filtro activo (categoría / método).
  if (f.categoryId) {
    const c = catById.get(f.categoryId);
    const ch = chip('Cat: ' + (c ? c.name : '—'), true);
    ch.addEventListener('click', () => { state.filters.categoryId = null; refresh(); });
    row.appendChild(ch);
  }
  if (f.method) {
    const ch = chip('Método: ' + f.method, true);
    ch.addEventListener('click', () => { state.filters.method = null; refresh(); });
    row.appendChild(ch);
  }

  return row;
}

function chip(label, active, iconHtml) {
  const c = elx('button', 'chip' + (active ? ' chip--active' : ''));
  c.type = 'button';
  if (iconHtml) c.innerHTML = iconHtml + '<span>' + escapeHtml(label) + '</span>';
  else c.textContent = label;
  return c;
}

function openFilterSheet(catById) {
  const cats = getCategories({});
  const f = state.filters;

  const wrap = elx('div', 'stack');

  // Búsqueda.
  const fSearch = elx('div', 'field');
  fSearch.appendChild(elx('label', 'field__label', 'Buscar'));
  const inp = elx('input', 'input');
  inp.type = 'text';
  inp.placeholder = 'Nota o etiqueta…';
  inp.value = f.search || '';
  fSearch.appendChild(inp);
  wrap.appendChild(fSearch);

  // Categoría (chips).
  const fCat = elx('div', 'field');
  fCat.appendChild(elx('label', 'field__label', 'Categoría'));
  const catRow = elx('div', 'chip-row');
  let selCat = f.categoryId || null;
  const noneC = chip('Todas', !selCat);
  noneC.addEventListener('click', () => { selCat = null; markRow(catRow, noneC); });
  catRow.appendChild(noneC);
  cats.forEach((c) => {
    const ch = chip(c.name, selCat === c.id);
    ch.dataset.id = c.id;
    ch.addEventListener('click', () => { selCat = c.id; markRow(catRow, ch); });
    catRow.appendChild(ch);
  });
  fCat.appendChild(catRow);
  wrap.appendChild(fCat);

  // Método (chips).
  const METHODS = ['efectivo', 'transferencia', 'tarjeta', 'debito', 'otro'];
  const fMet = elx('div', 'field');
  fMet.appendChild(elx('label', 'field__label', 'Método'));
  const metRow = elx('div', 'chip-row');
  let selMet = f.method || null;
  const noneM = chip('Todos', !selMet);
  noneM.addEventListener('click', () => { selMet = null; markRow(metRow, noneM); });
  metRow.appendChild(noneM);
  METHODS.forEach((m) => {
    const ch = chip(m, selMet === m);
    ch.dataset.m = m;
    ch.addEventListener('click', () => { selMet = m; markRow(metRow, ch); });
    metRow.appendChild(ch);
  });
  fMet.appendChild(metRow);
  wrap.appendChild(fMet);

  openSheet({
    title: 'Filtros',
    content: wrap,
    actions: [
      {
        label: 'Limpiar', variant: 'ghost', closeOnClick: true,
        onClick: () => { state.filters = { type: state.filters.type, categoryId: null, method: null, search: '' }; refresh(); },
      },
      {
        label: 'Aplicar', variant: 'primary', closeOnClick: true,
        onClick: () => {
          state.filters.search = inp.value.trim();
          state.filters.categoryId = selCat;
          state.filters.method = selMet;
          refresh();
        },
      },
    ],
  });
}

function markRow(row, active) {
  row.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
  active.classList.add('chip--active');
}

// Lista de movimientos agrupada por día con swipe editar/eliminar.
function buildTxnList(txns) {
  const cats = new Map(getCategories({}).map((c) => [c.id, c]));
  const accs = new Map(getAccounts({ includeArchived: true }).map((a) => [a.id, a]));

  // Agrupar por fecha.
  const byDate = new Map();
  txns.forEach((t) => {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  });
  const dates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  const frag = document.createDocumentFragment();
  dates.forEach((d) => {
    const rows = byDate.get(d);
    // Cabecera de grupo: fecha + total neto del día.
    let net = 0;
    rows.forEach((t) => {
      if (t.type === 'income') net += t.amount;
      else if (t.type === 'expense') net -= t.amount;
    });
    const head = elx('div', 'list-group__head');
    const dlabel = isToday(d) ? 'Hoy' : formatDateEs(d, { weekday: true });
    head.appendChild(elx('span', 'list-group__date', escapeHtml(dlabel)));
    head.appendChild(elx('span', 'list-group__total', fmtSigned(net, fmtCOP)));
    frag.appendChild(head);

    const card = elx('div', 'list list--card');
    rows.forEach((t) => card.appendChild(buildTxnRow(t, cats, accs)));
    frag.appendChild(card);
  });
  return frag;
}

function buildTxnRow(t, cats, accs) {
  const row = elx('div', 'list-row');

  // Acciones detrás (editar / eliminar).
  const actions = elx('div', 'list-row__actions');
  const editBtn = elx('button', 'swipe-action swipe-action--edit', ICONS.edit);
  editBtn.type = 'button';
  editBtn.setAttribute('aria-label', 'Editar');
  const delBtn = elx('button', 'swipe-action swipe-action--delete', ICONS.trash);
  delBtn.type = 'button';
  delBtn.setAttribute('aria-label', 'Eliminar');
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  row.appendChild(actions);

  // Frente.
  const front = elx('div', 'list-row__front');
  const cat = t.categoryId ? cats.get(t.categoryId) : null;
  const acc = t.accountId ? accs.get(t.accountId) : null;

  const ic = elx('span', 'list-row__icon');
  if (t.type === 'income') { ic.innerHTML = ICONS.income; ic.style.color = 'var(--positive)'; }
  else if (t.type === 'expense') { ic.innerHTML = ICONS.expense; ic.style.color = 'var(--negative)'; }
  else { ic.innerHTML = ICONS.tag; }
  if (cat && cat.color) ic.style.color = cat.color;
  front.appendChild(ic);

  const main = elx('div', 'list-row__main');
  const title = t.type === 'transfer'
    ? 'Transferencia'
    : (cat ? cat.name : (t.type === 'income' ? 'Ingreso' : 'Gasto'));
  main.appendChild(elx('span', 'list-row__title', escapeHtml(t.note || title)));
  const subParts = [];
  if (t.note && cat) subParts.push(cat.name);
  if (acc) subParts.push(acc.name);
  if (t.method) subParts.push(t.method);
  main.appendChild(elx('span', 'list-row__sub', escapeHtml(subParts.join(' · '))));
  front.appendChild(main);

  const amt = elx('span', 'list-row__amount');
  if (t.type === 'income') { amt.classList.add('list-row__amount--pos'); amt.textContent = fmtSigned(t.amount, fmtCOP); }
  else if (t.type === 'expense') { amt.classList.add('list-row__amount--neg'); amt.textContent = fmtSigned(-t.amount, fmtCOP); }
  else { amt.textContent = fmtCOP(t.amount); }
  front.appendChild(amt);

  row.appendChild(front);

  // Gesto de swipe (touch) + tap para editar.
  wireSwipe(row, front);
  front.addEventListener('click', (e) => {
    if (row.classList.contains('is-swiped')) {
      e.preventDefault();
      row.classList.remove('is-swiped');
      return;
    }
  });

  editBtn.addEventListener('click', () => {
    row.classList.remove('is-swiped');
    if (t.type === 'transfer') {
      toast('Las transferencias se editan desde sus cuentas.', { type: 'info' });
      return;
    }
    openTxnSheet(t.type, t);
  });
  delBtn.addEventListener('click', () => {
    row.classList.remove('is-swiped');
    const snapshot = Object.assign({}, t);
    deleteTransaction(t.id);
    emitData('delete');
    refresh();
    snackbarUndo('Movimiento eliminado', () => {
      // Re-crear con los mismos datos (nuevo id).
      addTransaction({
        type: snapshot.type, accountId: snapshot.accountId, categoryId: snapshot.categoryId,
        amount: snapshot.amount, date: snapshot.date, note: snapshot.note,
        tags: snapshot.tags, method: snapshot.method,
      });
      emitData('restore');
      refresh();
    });
  });

  return row;
}

// Swipe horizontal simple: revela acciones a la derecha.
function wireSwipe(row, front) {
  let startX = 0, startY = 0, dx = 0, active = false, decided = false, horizontal = false;
  front.addEventListener('touchstart', (e) => {
    if (!e.touches[0]) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    dx = 0; active = true; decided = false; horizontal = false;
  }, { passive: true });
  front.addEventListener('touchmove', (e) => {
    if (!active || !e.touches[0]) return;
    dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!decided) {
      decided = true;
      horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!horizontal) return;
    const base = row.classList.contains('is-swiped') ? -128 : 0;
    let tx = Math.max(-128, Math.min(0, base + dx));
    front.style.transform = `translateX(${tx}px)`;
  }, { passive: true });
  front.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    front.style.transform = '';
    if (!horizontal) return;
    if (dx < -48) row.classList.add('is-swiped');
    else if (dx > 48) row.classList.remove('is-swiped');
  });
}

/* ============================================================
 *  SHEET DE REGISTRO/EDICIÓN DE MOVIMIENTO
 * ============================================================ */
function openTxnSheet(type, existing) {
  const isEdit = !!existing;
  const t = type || (existing && existing.type) || 'expense';
  const cats = getCategories({ kind: t === 'income' ? 'income' : 'expense' });
  const accs = getAccounts({});

  let selType = t;
  let selCat = existing ? existing.categoryId : (cats[0] ? cats[0].id : null);
  let selAcc = existing ? existing.accountId : (accs[0] ? accs[0].id : null);
  let selMethod = existing ? existing.method : 'efectivo';
  let selDate = existing ? existing.date : hoy();

  const wrap = elx('div', 'stack');

  // Línea de monto.
  const amountLine = elx('div', 'amount-line');
  amountLine.appendChild(elx('span', 'amount-line__cur', '$'));
  const amountInput = elx('input', 'input--amount');
  amountInput.type = 'text';
  amountInput.placeholder = '0';
  amountLine.appendChild(amountInput);
  wrap.appendChild(amountLine);
  const ctrl = attachAmountInput(amountInput, { currency: 'COP' });
  if (existing) ctrl.setValue(existing.amount);

  // Toggle tipo.
  const typeToggle = elx('div', 'typetoggle');
  const incBtn = elx('button', 'typetoggle__btn typetoggle__btn--pos' + (selType === 'income' ? ' is-active' : ''), ICONS.income + '<span>Ingreso</span>');
  incBtn.type = 'button';
  const expBtn = elx('button', 'typetoggle__btn typetoggle__btn--neg' + (selType === 'expense' ? ' is-active' : ''), ICONS.expense + '<span>Gasto</span>');
  expBtn.type = 'button';
  typeToggle.appendChild(incBtn);
  typeToggle.appendChild(expBtn);
  wrap.appendChild(typeToggle);

  // Contenedor de categorías (se repinta al cambiar tipo).
  const catField = elx('div', 'field');
  catField.appendChild(elx('label', 'field__label', 'Categoría'));
  const catRow = elx('div', 'chip-row chip-row--scroll');
  catField.appendChild(catRow);
  wrap.appendChild(catField);

  function paintCats() {
    catRow.replaceChildren();
    const list = getCategories({ kind: selType === 'income' ? 'income' : 'expense' });
    if (list.length === 0) {
      selCat = null;
      catRow.appendChild(elx('span', 'field__hint', 'Sin categorías. Puedes registrar sin categoría.'));
      return;
    }
    list.forEach((c) => {
      const ch = chip(c.name, selCat === c.id);
      ch.addEventListener('click', () => { selCat = c.id; markRow(catRow, ch); });
      catRow.appendChild(ch);
    });
    if (!list.find((c) => c.id === selCat)) {
      selCat = list[0].id;
      markRow(catRow, catRow.firstChild);
    }
  }
  paintCats();

  incBtn.addEventListener('click', () => {
    selType = 'income';
    incBtn.classList.add('is-active'); expBtn.classList.remove('is-active');
    paintCats();
  });
  expBtn.addEventListener('click', () => {
    selType = 'expense';
    expBtn.classList.add('is-active'); incBtn.classList.remove('is-active');
    paintCats();
  });

  // Cuenta.
  const accField = elx('div', 'field');
  accField.appendChild(elx('label', 'field__label', 'Cuenta'));
  const accSel = elx('select', 'select');
  if (accs.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = 'Sin cuentas';
    accSel.appendChild(opt);
    selAcc = null;
  } else {
    accs.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name;
      if (a.id === selAcc) opt.selected = true;
      accSel.appendChild(opt);
    });
  }
  accSel.addEventListener('change', () => { selAcc = accSel.value || null; });
  accField.appendChild(accSel);
  wrap.appendChild(accField);

  // Método (chips).
  const METHODS = ['efectivo', 'transferencia', 'tarjeta', 'debito', 'otro'];
  const metField = elx('div', 'field');
  metField.appendChild(elx('label', 'field__label', 'Método'));
  const metRow = elx('div', 'chip-row chip-row--scroll');
  METHODS.forEach((m) => {
    const ch = chip(m, selMethod === m);
    ch.addEventListener('click', () => { selMethod = m; markRow(metRow, ch); });
    metRow.appendChild(ch);
  });
  metField.appendChild(metRow);
  wrap.appendChild(metField);

  // Fecha.
  const dateField = elx('div', 'field');
  dateField.appendChild(elx('label', 'field__label', 'Fecha'));
  const dateInput = elx('input', 'input');
  dateInput.type = 'date';
  dateInput.value = selDate;
  dateInput.addEventListener('change', () => { selDate = dateInput.value || hoy(); });
  dateField.appendChild(dateInput);
  wrap.appendChild(dateField);

  // Nota.
  const noteField = elx('div', 'field');
  noteField.appendChild(elx('label', 'field__label', 'Nota'));
  const noteInput = elx('input', 'input');
  noteInput.type = 'text';
  noteInput.placeholder = 'Opcional';
  noteInput.value = existing ? (existing.note || '') : '';
  noteField.appendChild(noteInput);
  wrap.appendChild(noteField);

  openSheet({
    title: isEdit ? 'Editar movimiento' : (t === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto'),
    content: wrap,
    actions: [
      { label: 'Cancelar', variant: 'ghost', closeOnClick: true },
      {
        label: isEdit ? 'Guardar' : 'Registrar', variant: 'primary',
        onClick: () => {
          const amount = ctrl.getValue();
          if (amount <= 0) {
            toast('Ingresa un monto mayor a 0.', { type: 'error' });
            return false; // mantener abierto
          }
          const payload = {
            type: selType,
            accountId: selAcc,
            categoryId: selCat,
            amount,
            date: selDate,
            note: noteInput.value.trim(),
            method: selMethod,
          };
          if (isEdit) {
            updateTransaction(existing.id, payload);
            toast('Movimiento actualizado', { type: 'success' });
            emitData('update');
          } else {
            addTransaction(payload);
            toast(selType === 'income' ? 'Ingreso registrado' : 'Gasto registrado', { type: 'success' });
            emitData('create');
          }
          refresh();
          return true;
        },
      },
    ],
  });
}

/* ============================================================
 *  TAB 2 — STATS  (todos los KPIs §6.2 + gráficos)
 * ============================================================ */
function renderStats(body) {
  body.appendChild(buildMonthBar(() => refresh()));

  const mk = state.month;
  const r = rangeForMonth(mk + '-01');
  const Dmes = daysInMonth(r.year, r.month);
  const Dtrans = diasTranscurridos(mk);

  const sr = savingsRate(mk);
  const cmp = monthCompare(mk);

  // Derivados (§6.2).
  const gastoPromDiario = Dtrans > 0 ? sr.gastos / Dtrans : 0;
  const proyeccionGasto = gastoPromDiario * Dmes;
  const balanceProyectado = sr.ingresos - proyeccionGasto;

  // Presupuesto total = Σ topes (override mes o monthlyBudget).
  const bva = budgetVsActual(mk);
  let presupuestoTotal = 0;
  bva.forEach((x) => { presupuestoTotal += x.budget; });
  // Si no hay topes por categoría, usa el presupuesto mensual global.
  const s = settings();
  if (presupuestoTotal <= 0 && s && s.personalBudgetMonthly > 0) {
    presupuestoTotal = s.personalBudgetMonthly;
  }
  const presupuestoRestante = presupuestoTotal - sr.gastos;
  const pctConsumido = presupuestoTotal > 0 ? (sr.gastos / presupuestoTotal) * 100 : null;
  const diasRestantes = Math.max(1, Dmes - Dtrans + 1);
  const disponibleHoy = presupuestoTotal > 0 ? presupuestoRestante / diasRestantes : null;

  const byCat = sumByCategory({ month: mk, kind: 'expense' });
  const catTop = byCat.length ? byCat[0] : null;

  // ---- Grid de KPIs ----
  const grid = elx('div', 'kpi-grid');
  grid.appendChild(kpiCard('Ingresos del mes', cop(sr.ingresos), null, 'var(--positive)'));
  grid.appendChild(kpiCard('Gastos del mes', cop(sr.gastos), null, 'var(--negative)'));
  grid.appendChild(kpiCard('Balance del mes', cop(sr.balance), null, sr.balance >= 0 ? 'var(--positive)' : 'var(--negative)'));
  grid.appendChild(kpiCard('Tasa de ahorro', sr.tasaAhorro === null ? '—' : fmtPct(sr.tasaAhorro, 1)));
  grid.appendChild(kpiCard('Gasto prom. diario', cop(gastoPromDiario)));
  grid.appendChild(kpiCard('Proyección fin de mes', cop(proyeccionGasto)));
  grid.appendChild(kpiCard('Balance proyectado', cop(balanceProyectado), null, balanceProyectado >= 0 ? 'var(--positive)' : 'var(--negative)'));
  grid.appendChild(kpiCard('Presupuesto total', presupuestoTotal > 0 ? cop(presupuestoTotal) : '—'));
  grid.appendChild(kpiCard('Presupuesto restante', presupuestoTotal > 0 ? cop(presupuestoRestante) : '—', null, presupuestoRestante >= 0 ? 'var(--positive)' : 'var(--negative)'));
  grid.appendChild(kpiCard('% presupuesto', pctConsumido === null ? '—' : fmtPct(pctConsumido, 0)));
  grid.appendChild(kpiCard('Disponible hoy', disponibleHoy === null ? '—' : cop(disponibleHoy) + ' /día'));
  grid.appendChild(kpiCard('Categoría top', catTop ? catTop.name : '—', catTop ? cop(catTop.total) : null));
  // Variación vs mes anterior.
  const vPct = cmp.delta.gastosPct;
  grid.appendChild(kpiCard('Var. gasto vs mes ant.', vPct === null ? '—' : fmtSigned(vPct, (n) => fmtPct(n, 1)), null, (vPct || 0) <= 0 ? 'var(--positive)' : 'var(--negative)'));
  body.appendChild(grid);

  // ---- Gráfico: flujo de caja diario (barsNet) + línea de saldo (info) ----
  const daily = dailyCashflow(mk);
  const flowCard = chartCard('Flujo de caja diario', monthLabel(mk));
  const flowWrap = elx('div', 'chart-wrap');
  flowCard.appendChild(flowWrap);
  body.appendChild(flowCard);
  barsNet(flowWrap, daily.map((d) => ({ label: String(d.day), value: d.net })), { currency: 'COP', cssHeight: '170px' });

  // ---- Gráfico: donut gastos por categoría ----
  if (byCat.length) {
    const donutCard = chartCard('Gastos por categoría', monthLabel(mk));
    const dWrap = elx('div', 'chart-wrap');
    dWrap.style.maxWidth = '260px';
    dWrap.style.margin = '0 auto';
    donutCard.appendChild(dWrap);
    body.appendChild(donutCard);
    donut(dWrap, byCat.map((c) => ({ label: c.name, value: c.total, color: c.color })), {
      currency: 'COP', size: 220, thickness: 26,
      center: { value: cop(sr.gastos), label: 'Gastos' },
    });
    // Leyenda.
    donutCard.appendChild(buildLegend(byCat.slice(0, 6).map((c) => ({ label: c.name, color: c.color, value: cop(c.total) }))));
  }

  // ---- Gráfico: ingresos vs gastos (groupedBars, 6 meses) ----
  const months = lastNMonths(6, mk + '-01');
  const yearNow = rangeForMonth(mk + '-01').year;
  const flowYear = monthlyCashflow(yearNow);
  const flowByKey = new Map(flowYear.map((m) => [m.key, m]));
  // Incluye meses de años anteriores recalculando por clave si hace falta.
  const gbData = months.map((m) => {
    let rec = flowByKey.get(m.key);
    if (!rec) {
      const yf = monthlyCashflow(m.year).find((x) => x.key === m.key);
      rec = yf || { income: 0, expense: 0 };
    }
    return { label: m.label, a: rec.income, b: rec.expense };
  });
  const gbCard = chartCard('Ingresos vs Gastos', 'Últimos 6 meses');
  const gbWrap = elx('div', 'chart-wrap');
  gbCard.appendChild(gbWrap);
  body.appendChild(gbCard);
  groupedBars(gbWrap, gbData, {
    currency: 'COP', labelA: 'Ingresos', labelB: 'Gastos',
    colorA: 'var(--positive)', colorB: 'var(--negative)', cssHeight: '200px',
  });
}

function kpiCard(label, value, sub, color) {
  const k = elx('div', 'kpi');
  const head = elx('div', 'kpi__head');
  head.appendChild(elx('span', 'kpi__label', escapeHtml(label)));
  k.appendChild(head);
  const v = elx('div', 'kpi__value', escapeHtml(value));
  if (color) v.style.color = color;
  k.appendChild(v);
  if (sub) k.appendChild(elx('div', 'kpi__sub', escapeHtml(sub)));
  return k;
}

function chartCard(title, meta) {
  const card = elx('div', 'chart-card section');
  const head = elx('div', 'chart-card__head');
  head.appendChild(elx('span', 'chart-card__title', escapeHtml(title)));
  if (meta) head.appendChild(elx('span', 'chart-card__meta', escapeHtml(meta)));
  card.appendChild(head);
  return card;
}

function buildLegend(items) {
  const leg = elx('div', 'chart-legend');
  items.forEach((it) => {
    const node = elx('span', 'chart-legend__item');
    const dot = elx('span', 'chart-legend__dot');
    dot.style.background = it.color || 'var(--gold)';
    node.appendChild(dot);
    node.appendChild(document.createTextNode(it.label + (it.value ? ' · ' + it.value : '')));
    leg.appendChild(node);
  });
  return leg;
}

/* ============================================================
 *  TAB 3 — PRESUPUESTOS (progressBars + alerta predictiva)
 * ============================================================ */
function renderPresupuestos(body) {
  body.appendChild(buildMonthBar(() => refresh()));

  const mk = state.month;
  const r = rangeForMonth(mk + '-01');
  const Dmes = daysInMonth(r.year, r.month);
  const Dtrans = diasTranscurridos(mk);
  const bva = budgetVsActual(mk);

  // Cabecera con botón "editar topes".
  const head = elx('div', 'screenhead');
  head.style.marginBottom = 'var(--sp-4)';
  const titles = elx('div', 'screenhead__titles');
  titles.appendChild(elx('div', 'screenhead__eyebrow', 'Control'));
  titles.appendChild(elx('div', 'screenhead__title', 'Presupuestos'));
  head.appendChild(titles);
  const editBtn = elx('button', 'btn btn--sm btn--outline', ICONS.edit + '<span>Topes</span>');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => openBudgetSheet());
  const actions = elx('div', 'screenhead__actions');
  actions.appendChild(editBtn);
  head.appendChild(actions);
  body.appendChild(head);

  if (bva.length === 0) {
    emptyState(body, {
      icon: 'reporte',
      title: 'Sin presupuestos',
      message: 'Define topes mensuales por categoría para controlar tus gastos.',
      ctaLabel: 'Definir topes',
      onCta: () => openBudgetSheet(),
    });
    return;
  }

  // Alerta predictiva: consumido > tope × (Dtrans/Dmes) → ritmo alto.
  const ratio = Dmes > 0 ? (Dtrans / Dmes) : 1;
  const overs = bva.filter((x) => x.state === 'over');
  const predictivos = bva.filter((x) => x.state !== 'over' && x.pct > (ratio * 100) && x.pct >= 50);

  if (overs.length) {
    const banner = elx('div', 'alert-banner alert-banner--over', ICONS.warn + `<span>${overs.length} categoría${overs.length > 1 ? 's' : ''} excedida${overs.length > 1 ? 's' : ''} este mes.</span>`);
    body.appendChild(banner);
  } else if (predictivos.length) {
    const banner = elx('div', 'alert-banner alert-banner--alert', ICONS.warn + `<span>Ritmo de gasto alto en ${predictivos.length} categoría${predictivos.length > 1 ? 's' : ''}. Vas adelantado al ${fmtPct(ratio * 100, 0)} del mes.</span>`);
    body.appendChild(banner);
  }

  // Gráfico progressBars (SVG).
  const card = chartCard('Consumo por categoría', monthLabel(mk));
  const wrap = elx('div', 'chart-wrap');
  card.appendChild(wrap);
  body.appendChild(card);
  progressBars(wrap, bva.map((x) => ({ label: x.name, pct: x.pct, state: x.state })), {});

  // Filas de detalle con cifras.
  const detail = elx('div', 'section');
  bva.forEach((x) => {
    const stateCls = x.state === 'over' ? 'progress-row--over' : (x.state === 'alert' ? 'progress-row--alert' : 'progress-row--ok');
    const rowEl = elx('div', 'progress-row ' + stateCls);
    const top = elx('div', 'progress-row__top');
    top.appendChild(elx('span', 'progress-row__label', escapeHtml(x.name)));
    const nums = elx('span', 'progress-row__nums');
    nums.innerHTML = `${escapeHtml(cop(x.actual))} / ${escapeHtml(cop(x.budget))} · <span class="progress-row__pct">${escapeHtml(fmtPct(x.pct, 0))}</span>`;
    top.appendChild(nums);
    rowEl.appendChild(top);
    const prog = elx('div', 'progress progress--' + x.state);
    const bar = elx('div', 'progress__bar');
    bar.style.width = Math.max(0, Math.min(100, x.pct)) + '%';
    prog.appendChild(bar);
    rowEl.appendChild(prog);
    rowEl.style.cursor = 'pointer';
    rowEl.addEventListener('click', () => openBudgetSheet(x.categoryId));
    detail.appendChild(rowEl);
  });
  body.appendChild(detail);
}

function openBudgetSheet(focusCatId) {
  const mk = state.month;
  const cats = getCategories({ kind: 'expense' });

  const wrap = elx('div', 'stack');
  wrap.appendChild(elx('p', 'field__hint', `Topes para ${monthLabel(mk)}. Deja en 0 para quitar el tope.`));

  if (cats.length === 0) {
    wrap.appendChild(elx('p', 'modal__text', 'No hay categorías de gasto. Crea categorías primero.'));
  }

  const controls = [];
  cats.forEach((c) => {
    const existing = getBudget(mk, c.id);
    const baseAmount = existing ? existing.amount : (c.monthlyBudget || 0);

    const field = elx('div', 'field');
    const lab = elx('label', 'field__label', escapeHtml(c.name));
    field.appendChild(lab);
    const line = elx('div', 'amount-line');
    line.style.padding = 'var(--sp-2) 0';
    line.appendChild(elx('span', 'amount-line__cur', '$'));
    const inp = elx('input', 'input--amount');
    inp.style.fontSize = '24px';
    inp.style.minHeight = '44px';
    inp.style.textAlign = 'left';
    inp.type = 'text';
    inp.placeholder = '0';
    line.appendChild(inp);
    field.appendChild(line);
    wrap.appendChild(field);

    const ctrl = attachAmountInput(inp, { currency: 'COP' });
    if (baseAmount > 0) ctrl.setValue(baseAmount);
    controls.push({ catId: c.id, ctrl });
    if (focusCatId === c.id) setTimeout(() => inp.focus(), 250);
  });

  openSheet({
    title: 'Editar topes',
    content: wrap,
    height: '80dvh',
    actions: [
      { label: 'Cancelar', variant: 'ghost', closeOnClick: true },
      {
        label: 'Guardar', variant: 'primary', closeOnClick: true,
        onClick: () => {
          controls.forEach(({ catId, ctrl }) => {
            const v = ctrl.getValue();
            if (v > 0) setBudget({ month: mk, categoryId: catId, amount: v });
            else deleteBudget(mk, catId);
          });
          toast('Presupuestos actualizados', { type: 'success' });
          emitData('budget');
          refresh();
        },
      },
    ],
  });
}

/* ============================================================
 *  TAB 4 — METAS (progressRing + aportar)
 * ============================================================ */
function renderMetas(body) {
  const head = elx('div', 'screenhead');
  head.style.marginBottom = 'var(--sp-4)';
  const titles = elx('div', 'screenhead__titles');
  titles.appendChild(elx('div', 'screenhead__eyebrow', 'Ahorro'));
  titles.appendChild(elx('div', 'screenhead__title', 'Metas'));
  head.appendChild(titles);
  const addBtn = elx('button', 'btn btn--sm btn--primary', ICONS.plus + '<span>Meta</span>');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => openGoalSheet());
  const actions = elx('div', 'screenhead__actions');
  actions.appendChild(addBtn);
  head.appendChild(actions);
  body.appendChild(head);

  const goals = getGoals({});
  if (goals.length === 0) {
    emptyState(body, {
      icon: 'meta',
      title: 'Sin metas aún',
      message: 'Crea una meta de ahorro y sigue su progreso con aportes.',
      ctaLabel: 'Crear meta',
      onCta: () => openGoalSheet(),
    });
    return;
  }

  goals.forEach((g) => {
    const prog = goalProgress(g.id);
    const card = elx('div', 'chart-card section');
    card.style.display = 'flex';
    card.style.gap = 'var(--sp-4)';
    card.style.alignItems = 'center';

    const ringWrap = elx('div', 'chart-wrap');
    ringWrap.style.width = '120px';
    ringWrap.style.flexShrink = '0';
    card.appendChild(ringWrap);
    progressRing(ringWrap, prog.pct, {
      size: 120, thickness: 11,
      color: g.color || 'var(--gold)',
      days: prog.daysLeft,
    });

    const info = elx('div', 'goal-info');
    info.style.flex = '1 1 auto';
    info.style.minWidth = '0';
    info.appendChild(elx('div', 'chart-card__title', escapeHtml(g.name)));
    const nums = elx('div', 'kpi__sub');
    nums.innerHTML = `${escapeHtml(cop(prog.current))} <span style="color:var(--text-tertiary)">de</span> ${escapeHtml(cop(prog.target))}`;
    info.appendChild(nums);
    if (prog.remaining > 0) {
      info.appendChild(elx('div', 'field__hint', 'Faltan ' + cop(prog.remaining)));
    } else {
      info.appendChild(elx('div', 'field__hint', '¡Meta alcanzada!'));
    }
    if (g.deadline) {
      info.appendChild(elx('div', 'field__hint', 'Meta: ' + formatDateEs(g.deadline)));
    }

    const btnRow = elx('div', 'chip-row');
    btnRow.style.marginTop = 'var(--sp-3)';
    const aportar = elx('button', 'btn btn--sm btn--outline', '+ Aportar');
    aportar.type = 'button';
    aportar.addEventListener('click', () => openContributeSheet(g));
    const editG = elx('button', 'btn btn--sm btn--ghost', 'Editar');
    editG.type = 'button';
    editG.addEventListener('click', () => openGoalSheet(g));
    btnRow.appendChild(aportar);
    btnRow.appendChild(editG);
    info.appendChild(btnRow);

    card.appendChild(info);
    body.appendChild(card);
  });
}

function openContributeSheet(g) {
  const wrap = elx('div', 'stack');
  const prog = goalProgress(g.id);
  wrap.appendChild(elx('p', 'field__hint', `${escapeHtml(g.name)} · ${cop(prog.current)} de ${cop(prog.target)}`));

  const line = elx('div', 'amount-line');
  line.appendChild(elx('span', 'amount-line__cur', '$'));
  const inp = elx('input', 'input--amount');
  inp.type = 'text'; inp.placeholder = '0';
  line.appendChild(inp);
  wrap.appendChild(line);
  const ctrl = attachAmountInput(inp, { currency: 'COP' });

  const minus = elx('label', 'switch-row');
  minus.style.display = 'flex';
  minus.style.alignItems = 'center';
  minus.style.justifyContent = 'space-between';
  minus.style.gap = 'var(--sp-3)';
  minus.innerHTML = '<span class="settings-row__label">Retirar (restar al ahorro)</span>';
  const sw = elx('label', 'switch');
  const swInput = elx('input');
  swInput.type = 'checkbox';
  sw.appendChild(swInput);
  sw.appendChild(elx('span', 'switch__track'));
  minus.appendChild(sw);
  wrap.appendChild(minus);

  openSheet({
    title: 'Aportar a meta',
    content: wrap,
    actions: [
      { label: 'Cancelar', variant: 'ghost', closeOnClick: true },
      {
        label: 'Aportar', variant: 'primary',
        onClick: () => {
          const v = ctrl.getValue();
          if (v <= 0) { toast('Ingresa un monto mayor a 0.', { type: 'error' }); return false; }
          const amount = swInput.checked ? -v : v;
          contributeToGoal(g.id, amount);
          toast(swInput.checked ? 'Retiro registrado' : 'Aporte registrado', { type: 'success' });
          emitData('goal');
          refresh();
          return true;
        },
      },
    ],
  });
}

function openGoalSheet(existing) {
  const isEdit = !!existing;
  const accs = getAccounts({});

  const wrap = elx('div', 'stack');

  const nameField = elx('div', 'field');
  nameField.appendChild(elx('label', 'field__label', 'Nombre'));
  const nameInput = elx('input', 'input');
  nameInput.type = 'text'; nameInput.placeholder = 'Ej: Viaje, Fondo de emergencia';
  nameInput.value = existing ? existing.name : '';
  nameField.appendChild(nameInput);
  wrap.appendChild(nameField);

  const targetField = elx('div', 'field');
  targetField.appendChild(elx('label', 'field__label', 'Meta (COP)'));
  const tLine = elx('div', 'amount-line');
  tLine.style.padding = 'var(--sp-2) 0';
  tLine.appendChild(elx('span', 'amount-line__cur', '$'));
  const tInput = elx('input', 'input--amount');
  tInput.style.fontSize = '26px'; tInput.style.minHeight = '48px'; tInput.style.textAlign = 'left';
  tInput.type = 'text'; tInput.placeholder = '0';
  tLine.appendChild(tInput);
  targetField.appendChild(tLine);
  wrap.appendChild(targetField);
  const tCtrl = attachAmountInput(tInput, { currency: 'COP' });
  if (existing) tCtrl.setValue(existing.targetAmount);

  // Aporte inicial (solo en alta).
  let cCtrl = null;
  if (!isEdit) {
    const cField = elx('div', 'field');
    cField.appendChild(elx('label', 'field__label', 'Ya ahorrado (opcional)'));
    const cLine = elx('div', 'amount-line');
    cLine.style.padding = 'var(--sp-2) 0';
    cLine.appendChild(elx('span', 'amount-line__cur', '$'));
    const cInput = elx('input', 'input--amount');
    cInput.style.fontSize = '24px'; cInput.style.minHeight = '44px'; cInput.style.textAlign = 'left';
    cInput.type = 'text'; cInput.placeholder = '0';
    cLine.appendChild(cInput);
    cField.appendChild(cLine);
    wrap.appendChild(cField);
    cCtrl = attachAmountInput(cInput, { currency: 'COP' });
  }

  // Fecha límite.
  const dField = elx('div', 'field');
  dField.appendChild(elx('label', 'field__label', 'Fecha límite (opcional)'));
  const dInput = elx('input', 'input');
  dInput.type = 'date';
  dInput.value = existing && existing.deadline ? existing.deadline : '';
  dField.appendChild(dInput);
  wrap.appendChild(dField);

  // Cuenta asociada (opcional).
  const aField = elx('div', 'field');
  aField.appendChild(elx('label', 'field__label', 'Cuenta (opcional)'));
  const aSel = elx('select', 'select');
  const optNone = document.createElement('option');
  optNone.value = ''; optNone.textContent = 'Ninguna';
  aSel.appendChild(optNone);
  accs.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.id; opt.textContent = a.name;
    if (existing && existing.accountId === a.id) opt.selected = true;
    aSel.appendChild(opt);
  });
  aField.appendChild(aSel);
  wrap.appendChild(aField);

  const acts = [
    { label: 'Cancelar', variant: 'ghost', closeOnClick: true },
    {
      label: isEdit ? 'Guardar' : 'Crear', variant: 'primary',
      onClick: () => {
        const name = nameInput.value.trim();
        const target = tCtrl.getValue();
        if (!name) { toast('Ponle un nombre a la meta.', { type: 'error' }); return false; }
        if (target <= 0) { toast('Define una meta mayor a 0.', { type: 'error' }); return false; }
        const payload = {
          name, targetAmount: target,
          deadline: dInput.value || null,
          accountId: aSel.value || null,
        };
        if (isEdit) {
          updateGoal(existing.id, payload);
          toast('Meta actualizada', { type: 'success' });
        } else {
          payload.currentAmount = cCtrl ? cCtrl.getValue() : 0;
          addGoal(payload);
          toast('Meta creada', { type: 'success' });
        }
        emitData('goal');
        refresh();
        return true;
      },
    },
  ];
  if (isEdit) {
    acts.splice(1, 0, {
      label: 'Archivar', variant: 'danger', closeOnClick: false,
      onClick: () => {
        archiveGoal(existing.id);
        toast('Meta archivada', { type: 'info' });
        emitData('goal');
        refresh();
        return undefined; // cierra
      },
    });
  }

  openSheet({ title: isEdit ? 'Editar meta' : 'Nueva meta', content: wrap, height: '82dvh', actions: acts });
}

/* ============================================================
 *  TAB 5 — REPORTE (mirrorBars mes vs mes + resumen)
 * ============================================================ */
function renderReporte(body) {
  body.appendChild(buildMonthBar(() => refresh()));

  const mk = state.month;
  const cmp = monthCompare(mk);
  const prevKey = monthKey(addMonths(mk + '-01', -1));

  // Resumen comparativo (tabla).
  const head = elx('div', 'screenhead');
  head.style.marginBottom = 'var(--sp-4)';
  const titles = elx('div', 'screenhead__titles');
  titles.appendChild(elx('div', 'screenhead__eyebrow', `${monthLabel(prevKey)} → ${monthLabel(mk)}`));
  titles.appendChild(elx('div', 'screenhead__title', 'Reporte mensual'));
  head.appendChild(titles);
  body.appendChild(head);

  // Tabla resumen.
  const table = elx('div', 'report-table');
  const rows = [
    ['Ingresos', cmp.actual.ingresos, cmp.anterior.ingresos, cmp.delta.ingresos, false],
    ['Gastos', cmp.actual.gastos, cmp.anterior.gastos, cmp.delta.gastos, true],
    ['Balance', cmp.actual.balance, cmp.anterior.balance, cmp.delta.balance, false],
  ];
  let html = '<table><thead><tr><th>Concepto</th><th class="num">Actual</th><th class="num">Anterior</th><th class="num">Δ</th></tr></thead><tbody>';
  rows.forEach(([label, act, prev, delta, invert]) => {
    // Para gastos, un delta positivo (más gasto) es "malo" (rojo); ingresos/balance al revés.
    const good = invert ? delta <= 0 : delta >= 0;
    const cls = delta === 0 ? '' : (good ? 'num--pos' : 'num--neg');
    html += `<tr><td>${escapeHtml(label)}</td>` +
      `<td class="num">${escapeHtml(cop(act))}</td>` +
      `<td class="num">${escapeHtml(cop(prev))}</td>` +
      `<td class="num ${cls}">${escapeHtml(fmtSigned(delta, fmtCOP))}</td></tr>`;
  });
  // Tasa de ahorro.
  const taAct = cmp.actual.tasaAhorro;
  const taPrev = cmp.anterior.tasaAhorro;
  html += `<tr><td>Tasa de ahorro</td>` +
    `<td class="num">${taAct === null ? '—' : escapeHtml(fmtPct(taAct, 1))}</td>` +
    `<td class="num">${taPrev === null ? '—' : escapeHtml(fmtPct(taPrev, 1))}</td>` +
    `<td class="num">${(taAct === null || taPrev === null) ? '—' : escapeHtml(fmtSigned(taAct - taPrev, (n) => fmtPct(n, 1)))}</td></tr>`;
  html += '</tbody></table>';
  table.innerHTML = html;
  body.appendChild(table);

  // Gráfico mirrorBars por categoría (gastos actual vs anterior).
  const catsActual = sumByCategory({ month: mk, kind: 'expense' });
  const catsPrev = sumByCategory({ month: prevKey, kind: 'expense' });
  const prevMap = new Map(catsPrev.map((c) => [c.name, c.total]));
  const mergedNames = new Set();
  catsActual.forEach((c) => mergedNames.add(c.name));
  catsPrev.forEach((c) => mergedNames.add(c.name));
  const mirrorData = Array.from(mergedNames).map((name) => {
    const a = catsActual.find((c) => c.name === name);
    return { label: name, actual: a ? a.total : 0, prev: prevMap.get(name) || 0 };
  }).sort((a, b) => b.actual - a.actual).slice(0, 8);

  if (mirrorData.length) {
    const card = chartCard('Gastos por categoría', 'Mes vs mes anterior');
    const wrap = elx('div', 'chart-wrap');
    card.appendChild(wrap);
    body.appendChild(card);
    mirrorBars(wrap, mirrorData, {
      currency: 'COP', labelActual: monthName(rangeForMonth(mk + '-01').month),
      labelPrev: monthName(rangeForMonth(prevKey + '-01').month),
    });
  }

  // Top de gastos del mes.
  const top = topExpenses({ month: mk, limit: 5 });
  if (top.length) {
    const card = chartCard('Mayores gastos', monthLabel(mk));
    const list = elx('div', 'list list--card');
    top.forEach((t) => {
      const row = elx('div', 'list-row');
      const front = elx('div', 'list-row__front');
      const ic = elx('span', 'list-row__icon', ICONS.expense);
      if (t.color) ic.style.color = t.color;
      front.appendChild(ic);
      const main = elx('div', 'list-row__main');
      main.appendChild(elx('span', 'list-row__title', escapeHtml(t.note || t.categoryName)));
      main.appendChild(elx('span', 'list-row__sub', escapeHtml(formatDateEs(t.date) + ' · ' + t.categoryName)));
      front.appendChild(main);
      const amt = elx('span', 'list-row__amount list-row__amount--neg', fmtSigned(-t.amount, fmtCOP));
      front.appendChild(amt);
      row.appendChild(front);
      list.appendChild(row);
    });
    card.appendChild(list);
    body.appendChild(card);
  }
}
