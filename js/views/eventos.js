// ============================================================================
// XAURA · js/views/eventos.js
// Vista #/eventos (COP) — SPEC §6.3.
// Subvistas: Resumen (default) · Lista · Detalle :id · Nuevo/Editar · Reportes ·
// Calendario. Acciones rápidas: + Abono, + Costo, cambiar estado (sheets).
//
// Contrato de vista: export function render(params) / export function unmount().
// Cabecera con segmented Personal | Eventos (Personal → #/personal).
// ============================================================================

import { setHeader } from '../ui/header.js';
import { fmtCOP, fmtPct, fmtSigned, maskValue } from '../core/currency.js';
import {
  hoy, monthKey, rangeForMonth, monthName, addMonths,
  formatDateEs, parseLocalDate,
} from '../core/dates.js';
import {
  getEvents, addEvent, updateEvent, setEventStatus, deleteEvent,
  getEventIncomes, addEventIncome, deleteEventIncome,
  getEventCosts, addEventCost, deleteEventCost,
} from '../core/events.js';
import {
  eventPL, eventsPipeline, eventsRevenue, accountsReceivable,
  eventRanking, upcomingEvents, monthlyEventsPL,
} from '../core/aggregations.js';
import { getSettings } from '../core/settings.js';
import {
  groupedBars, hbarsRanked, donut, funnel, stackedBar, monthCalendar, progressRing,
} from '../ui/charts.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDestructive } from '../ui/modal.js';
import { toast, snackbarUndo } from '../ui/toast.js';
import { emptyState } from '../ui/empty.js';
import { attachAmountInput } from '../ui/keypad.js';

/* ============================================================
 *  ENUMS legibles (SPEC §4.3)
 * ============================================================ */
const EVENT_TYPES = ['boda', 'corporativo', 'cumpleanos', 'quinceanera', 'grado', 'aniversario', 'social', 'otro'];
const EVENT_TYPE_LABELS = {
  boda: 'Boda', corporativo: 'Corporativo', cumpleanos: 'Cumpleaños', quinceanera: 'Quinceañera',
  grado: 'Grado', aniversario: 'Aniversario', social: 'Social', otro: 'Otro',
};
const STATUSES = ['cotizado', 'confirmado', 'realizado', 'pagado', 'cancelado'];
const STATUS_LABELS = {
  cotizado: 'Cotizado', confirmado: 'Confirmado', realizado: 'Realizado', pagado: 'Pagado', cancelado: 'Cancelado',
};
const COST_CATS = ['lugar', 'catering', 'decoracion', 'sonido', 'fotografia', 'personal', 'transporte', 'papeleria', 'imprevistos'];
const COST_CAT_LABELS = {
  lugar: 'Lugar', catering: 'Catering', decoracion: 'Decoración', sonido: 'Sonido', fotografia: 'Fotografía',
  personal: 'Personal', transporte: 'Transporte', papeleria: 'Papelería', imprevistos: 'Imprevistos',
};
const INCOME_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

/* ============================================================
 *  ICONOS
 * ============================================================ */
const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.8-4.17-4.95-4.37-.14-.2-1.18-1.57-1.18-2.99s.75-2.12 1.01-2.41c.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.59.83 2.03.9 2.18.07.14.12.31.02.5-.09.2-.14.31-.28.48-.14.16-.29.37-.42.49-.14.14-.28.29-.12.57.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.21 1.36.27.14.43.12.59-.07.16-.2.68-.79.86-1.06.18-.27.36-.22.61-.13.24.09 1.56.74 1.83.87.27.14.45.2.51.31.07.11.07.64-.17 1.32z"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
};

/* ============================================================
 *  BUS
 * ============================================================ */
function bus() { return (window.XAURA && window.XAURA.bus) ? window.XAURA.bus : null; }
function emitData(action) { const b = bus(); if (b) b.emit('data:changed', { area: 'eventos', action }); }

/* ============================================================
 *  ESTADO
 * ============================================================ */
const TABS = ['resumen', 'lista', 'calendario', 'reportes'];
const TAB_LABELS = { resumen: 'Resumen', lista: 'Lista', calendario: 'Calendario', reportes: 'Reportes' };

let state = {
  tab: 'resumen',
  detailId: null,
  month: monthKey(hoy()),
  listFilter: null, // status o null
};
let _busUnsub = null;
let _root = null;

/* ============================================================
 *  HELPERS
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
function monthLabel(mk) {
  const r = rangeForMonth(mk + '-01');
  return `${monthName(r.month)} ${r.year}`;
}
function eventById(id) {
  return getEvents({}).find((e) => e.id === id) || null;
}
function statusBadge(status) {
  const cls = 'badge badge--' + status;
  return `<span class="${cls}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

/* ============================================================
 *  RENDER PRINCIPAL
 * ============================================================ */
export function render(params) {
  // Resolver subruta / detalle.
  state.detailId = null;
  if (params) {
    const seg = (params.segments && params.segments[0]) || params.sub || params.tab;
    if (params.id && /^evt_/.test(params.id)) {
      state.detailId = params.id;
    } else if (seg && /^evt_/.test(seg)) {
      state.detailId = seg;
    } else if (seg === 'nuevo') {
      state.detailId = null;
      // Se abre el sheet de alta tras montar.
      paintHeaderShell();
      const view = document.getElementById('view');
      if (view) view.replaceChildren();
      renderResumenOrTab('resumen');
      openEventSheet();
      wireBus();
      return;
    } else if (seg && TABS.indexOf(seg) !== -1) {
      state.tab = seg;
    } else if (params.tab && TABS.indexOf(params.tab) !== -1) {
      state.tab = params.tab;
    }
    if (params.fecha && /^\d{4}-\d{2}/.test(params.fecha)) state.month = params.fecha.slice(0, 7);
  }

  if (state.detailId) {
    renderDetail(state.detailId);
    wireBus();
    return;
  }

  renderResumenOrTab(state.tab);
  wireBus();
}

function wireBus() {
  if (!_busUnsub) {
    const b = bus();
    if (b) _busUnsub = b.on('data:changed', () => refresh());
  }
}

export function unmount() {
  if (_busUnsub) { try { _busUnsub(); } catch (_e) { /* noop */ } _busUnsub = null; }
  _root = null;
}

function refresh() {
  if (state.detailId) {
    if (eventById(state.detailId)) renderDetail(state.detailId);
    else { state.detailId = null; renderResumenOrTab(state.tab); }
    return;
  }
  renderResumenOrTab(state.tab);
}

/* ============================================================
 *  CABECERA (segmented Personal | Eventos)
 * ============================================================ */
function paintHeaderShell(opts) {
  const o = opts || {};
  setHeader({
    title: o.title || 'Eventos',
    subtitle: o.subtitle || 'Negocio',
    actions: o.back
      ? [{ icon: ICONS.back, ariaLabel: 'Volver', onClick: () => { state.detailId = null; location.hash = '#/eventos'; } }]
      : [{ icon: ICONS.plus, ariaLabel: 'Nuevo evento', variant: 'gold', onClick: () => openEventSheet() }],
  });

  if (o.back) return; // en detalle no mostramos segmented de área

  const header = document.getElementById('appheader');
  if (!header) return;
  let seg = header.querySelector('.personal-areaseg');
  if (seg) seg.remove();
  seg = elx('div', 'segmented personal-areaseg');
  seg.style.marginTop = 'var(--sp-3)';
  const p = elx('button', 'segmented__item', 'Personal');
  p.type = 'button';
  p.addEventListener('click', () => { location.hash = '#/personal'; });
  const e = elx('button', 'segmented__item segmented__item--active', 'Eventos');
  e.type = 'button';
  seg.appendChild(p); seg.appendChild(e);
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
      try { history.replaceState(null, '', `#/eventos?tab=${t}`); } catch (_e) { /* noop */ }
      renderResumenOrTab(t);
    });
    seg.appendChild(b);
  });
  wrap.appendChild(seg);
  return wrap;
}

/* ============================================================
 *  ROUTER DE TABS (lista/resumen/calendario/reportes)
 * ============================================================ */
function renderResumenOrTab(tab) {
  state.tab = tab;
  paintHeaderShell();
  const view = document.getElementById('view');
  if (!view) return;
  view.replaceChildren();
  _root = elx('div', 'eventos-view enter');
  view.appendChild(_root);
  _root.appendChild(buildSubTabs());

  const body = elx('div', 'eventos-body');
  _root.appendChild(body);

  switch (tab) {
    case 'lista': renderLista(body); break;
    case 'calendario': renderCalendario(body); break;
    case 'reportes': renderReportes(body); break;
    case 'resumen':
    default: renderResumen(body); break;
  }
}

/* ============================================================
 *  BARRA DE MES
 * ============================================================ */
function buildMonthBar(onChange) {
  const bar = elx('div', 'monthbar');
  Object.assign(bar.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' });
  const nav = elx('div', 'daynav');
  const prev = elx('button', 'daynav__btn pressable', ICONS.back);
  prev.type = 'button'; prev.setAttribute('aria-label', 'Mes anterior');
  const label = elx('span', 'daynav__label', escapeHtml(monthLabel(state.month)));
  label.style.minWidth = '128px';
  const next = elx('button', 'daynav__btn pressable', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>');
  next.type = 'button'; next.setAttribute('aria-label', 'Mes siguiente');
  prev.addEventListener('click', () => { state.month = monthKey(addMonths(state.month + '-01', -1)); onChange(); });
  next.addEventListener('click', () => { state.month = monthKey(addMonths(state.month + '-01', 1)); onChange(); });
  nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next);
  bar.appendChild(elx('div', 'section__title', 'Mes'));
  bar.appendChild(nav);
  return bar;
}

/* ============================================================
 *  KPI / CHART HELPERS
 * ============================================================ */
function kpiCard(label, value, sub, color, accent) {
  const k = elx('div', 'kpi' + (accent ? ' kpi--' + accent : ''));
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
 *  TAB — RESUMEN (KPIs del negocio + próximos eventos)
 * ============================================================ */
function renderResumen(body) {
  body.appendChild(buildMonthBar(() => renderResumenOrTab('resumen')));

  const mk = state.month;
  const pl = monthlyEventsPL(mk);
  const ar = accountsReceivable();
  const pipeline = eventsPipeline();
  const nByStatus = new Map(pipeline.map((p) => [p.status, p.count]));

  // KPIs §6.3.
  const grid = elx('div', 'kpi-grid');
  grid.appendChild(kpiCard('Ingresos del mes', cop(pl.ingresos), null, null, 'eventos'));
  grid.appendChild(kpiCard('Costos del mes', cop(pl.costos), null, 'var(--negative)'));
  grid.appendChild(kpiCard('Utilidad bruta', cop(pl.utilidad), null, pl.utilidad >= 0 ? 'var(--positive)' : 'var(--negative)'));
  grid.appendChild(kpiCard('Margen del mes', pl.margen === null ? '—' : fmtPct(pl.margen, 1)));
  grid.appendChild(kpiCard('Ticket promedio', pl.nEventos > 0 ? cop(pl.ticketPromedio) : '—', pl.nEventos + ' evento' + (pl.nEventos === 1 ? '' : 's')));
  grid.appendChild(kpiCard('Recaudado del mes', cop(pl.recaudadoMes)));
  grid.appendChild(kpiCard('Cuentas por cobrar', cop(ar.total), ar.rows.length + ' pendiente' + (ar.rows.length === 1 ? '' : 's'), ar.total > 0 ? 'var(--warning)' : null));
  grid.appendChild(kpiCard('Costo por persona', pl.costoPorPersona === null ? '—' : cop(pl.costoPorPersona)));
  body.appendChild(grid);

  // Conteo por estado (chips informativos).
  const statusRow = elx('div', 'chip-row chip-row--scroll');
  statusRow.style.marginTop = 'var(--sp-4)';
  STATUSES.forEach((s) => {
    const n = nByStatus.get(s) || 0;
    const c = elx('span', 'chip');
    c.innerHTML = `<span class="badge__dot" style="background:${statusColor(s)}"></span>${escapeHtml(STATUS_LABELS[s])} · ${n}`;
    statusRow.appendChild(c);
  });
  body.appendChild(statusRow);

  // Próximos eventos.
  const upcoming = upcomingEvents(5);
  const card = chartCard('Próximos eventos', '');
  if (upcoming.length === 0) {
    const inner = elx('div');
    emptyState(inner, { icon: 'eventos', message: 'No hay eventos próximos. Crea uno para empezar.', ctaLabel: 'Nuevo evento', onCta: () => openEventSheet() });
    card.appendChild(inner.firstChild);
  } else {
    upcoming.forEach((u) => card.appendChild(buildEventCard(u.eventId)));
  }
  body.appendChild(card);
}

function statusColor(s) {
  switch (s) {
    case 'cotizado': return 'var(--text-tertiary)';
    case 'confirmado': return 'var(--neutral)';
    case 'realizado': return 'var(--gold)';
    case 'pagado': return 'var(--positive)';
    case 'cancelado': return 'var(--negative)';
    default: return 'var(--gold)';
  }
}

// Tarjeta de evento reutilizable (resumen/lista). Navega a detalle.
function buildEventCard(eventId) {
  const ev = eventById(eventId);
  if (!ev) return elx('div');
  const pl = eventPL(ev.id);
  const d = parseLocalDate(ev.eventDate);

  const card = elx('div', 'event-card pressable');
  card.style.marginTop = 'var(--sp-2)';
  card.style.cursor = 'pointer';

  const dateBox = elx('div', 'event-card__date');
  if (d) {
    dateBox.appendChild(elx('span', 'event-card__day', String(d.getDate())));
    dateBox.appendChild(elx('span', 'event-card__mon', monthName(d.getMonth() + 1, { abbr: true })));
  } else {
    dateBox.appendChild(elx('span', 'event-card__day', '—'));
  }
  card.appendChild(dateBox);

  const bodyEl = elx('div', 'event-card__body');
  bodyEl.appendChild(elx('span', 'event-card__name', escapeHtml(ev.name)));
  const meta = elx('span', 'event-card__meta');
  const parts = [];
  if (ev.client && ev.client.name) parts.push(ev.client.name);
  parts.push(EVENT_TYPE_LABELS[ev.eventType] || ev.eventType);
  if (ev.venue) parts.push(ev.venue);
  meta.innerHTML = parts.map(escapeHtml).join(' · ');
  bodyEl.appendChild(meta);

  const foot = elx('div', 'event-card__foot');
  foot.innerHTML = statusBadge(ev.status);
  const amt = elx('span', 'event-card__amount');
  amt.textContent = cop(ev.quotedAmount);
  foot.appendChild(amt);
  bodyEl.appendChild(foot);

  // Saldo pendiente.
  if (pl.saldoPendiente > 0 && ev.status !== 'cancelado') {
    bodyEl.appendChild(elx('div', 'field__hint', 'Saldo: ' + cop(pl.saldoPendiente)));
  }
  card.appendChild(bodyEl);

  card.addEventListener('click', () => { location.hash = `#/eventos?id=${ev.id}`; });
  return card;
}

/* ============================================================
 *  TAB — LISTA (con estado y saldo + filtros)
 * ============================================================ */
function renderLista(body) {
  // Filtros por estado.
  const filterRow = elx('div', 'chip-row chip-row--scroll');
  filterRow.style.marginBottom = 'var(--sp-4)';
  const all = elx('button', 'chip' + (!state.listFilter ? ' chip--active' : ''), 'Todos');
  all.type = 'button';
  all.addEventListener('click', () => { state.listFilter = null; renderResumenOrTab('lista'); });
  filterRow.appendChild(all);
  STATUSES.forEach((s) => {
    const c = elx('button', 'chip' + (state.listFilter === s ? ' chip--active' : ''), STATUS_LABELS[s]);
    c.type = 'button';
    c.addEventListener('click', () => { state.listFilter = state.listFilter === s ? null : s; renderResumenOrTab('lista'); });
    filterRow.appendChild(c);
  });
  body.appendChild(filterRow);

  const evs = getEvents({ status: state.listFilter || undefined, sort: 'date-desc' });
  if (evs.length === 0) {
    emptyState(body, {
      icon: 'eventos',
      title: 'Sin eventos',
      message: state.listFilter ? 'No hay eventos con ese estado.' : 'Crea tu primer evento para empezar a gestionarlo.',
      ctaLabel: 'Nuevo evento',
      onCta: () => openEventSheet(),
    });
    return;
  }
  const wrap = elx('div', 'stack');
  evs.forEach((ev) => wrap.appendChild(buildEventCard(ev.id)));
  body.appendChild(wrap);
}

/* ============================================================
 *  TAB — CALENDARIO (monthCalendar de próximos)
 * ============================================================ */
function renderCalendario(body) {
  body.appendChild(buildMonthBar(() => renderResumenOrTab('calendario')));

  const mk = state.month;
  const r = rangeForMonth(mk + '-01');
  const evs = getEvents({}).filter((e) => monthKey(e.eventDate) === mk && e.status !== 'cancelado');

  const card = chartCard('Calendario de eventos', monthLabel(mk));
  const wrap = elx('div', 'chart-wrap');
  card.appendChild(wrap);
  body.appendChild(card);

  monthCalendar(wrap, evs.map((e) => ({ date: e.eventDate, color: statusColor(e.status) })), {
    month: mk,
    onSelect: (iso) => {
      const dayEvs = evs.filter((e) => e.eventDate === iso);
      if (dayEvs.length === 1) location.hash = `#/eventos?id=${dayEvs[0].id}`;
      else if (dayEvs.length > 1) openDayEventsSheet(iso, dayEvs);
    },
  });

  // Lista de eventos del mes bajo el calendario.
  const list = elx('div', 'stack');
  list.style.marginTop = 'var(--sp-4)';
  const sorted = evs.slice().sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1));
  if (sorted.length === 0) {
    const inner = elx('div');
    emptyState(inner, { icon: 'calendar', message: `Sin eventos en ${monthLabel(mk)}.`, ctaLabel: 'Nuevo evento', onCta: () => openEventSheet() });
    list.appendChild(inner.firstChild);
  } else {
    sorted.forEach((e) => list.appendChild(buildEventCard(e.id)));
  }
  body.appendChild(list);
}

function openDayEventsSheet(iso, dayEvs) {
  const wrap = elx('div', 'stack');
  dayEvs.forEach((e) => {
    const card = buildEventCard(e.id);
    wrap.appendChild(card);
  });
  openSheet({ title: formatDateEs(iso, { weekday: true }), content: wrap });
}

/* ============================================================
 *  DETALLE :id  (P&L, abonos, costos, estado, WhatsApp)
 * ============================================================ */
function renderDetail(id) {
  const ev = eventById(id);
  if (!ev) {
    state.detailId = null;
    renderResumenOrTab(state.tab);
    return;
  }
  state.detailId = id;
  paintHeaderShell({ title: ev.name, subtitle: 'Evento', back: true });

  const view = document.getElementById('view');
  if (!view) return;
  view.replaceChildren();
  _root = elx('div', 'evento-detail enter');
  view.appendChild(_root);

  const pl = eventPL(ev.id);
  const incomes = getEventIncomes(ev.id);
  const costs = getEventCosts(ev.id);

  // Cabecera con tipo / cliente / fecha + estado.
  const head = elx('div', 'chart-card');
  const top = elx('div');
  top.style.display = 'flex';
  top.style.justifyContent = 'space-between';
  top.style.alignItems = 'flex-start';
  top.style.gap = 'var(--sp-3)';
  const titles = elx('div');
  titles.style.minWidth = '0';
  titles.appendChild(elx('div', 'chart-card__title', escapeHtml(ev.name)));
  const meta = elx('div', 'event-card__meta');
  const mp = [];
  if (ev.client && ev.client.name) mp.push(ev.client.name);
  mp.push(EVENT_TYPE_LABELS[ev.eventType] || ev.eventType);
  mp.push(formatDateEs(ev.eventDate, { weekday: true }));
  if (ev.hora) mp.push(ev.hora);
  if (ev.venue) mp.push(ev.venue);
  if (ev.ciudad) mp.push(ev.ciudad);
  if (ev.guests) mp.push(ev.guests + ' invitados');
  meta.innerHTML = mp.map(escapeHtml).join(' · ');
  titles.appendChild(meta);
  top.appendChild(titles);
  const badge = elx('div');
  badge.innerHTML = statusBadge(ev.status);
  top.appendChild(badge);
  head.appendChild(top);

  // Acciones de cabecera.
  const actRow = elx('div', 'chip-row');
  actRow.style.marginTop = 'var(--sp-4)';
  const editBtn = elx('button', 'btn btn--sm btn--ghost', ICONS.edit + '<span>Editar</span>');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => openEventSheet(ev));
  actRow.appendChild(editBtn);
  const statusBtn = elx('button', 'btn btn--sm btn--outline', 'Cambiar estado');
  statusBtn.type = 'button';
  statusBtn.addEventListener('click', () => openStatusSheet(ev));
  actRow.appendChild(statusBtn);
  if (ev.client && ev.client.phone) {
    const wa = elx('button', 'btn btn--sm btn--ghost', ICONS.whatsapp + '<span>WhatsApp</span>');
    wa.type = 'button';
    wa.addEventListener('click', () => openWhatsApp(ev, pl));
    actRow.appendChild(wa);
  }
  head.appendChild(actRow);
  _root.appendChild(head);

  // P&L del evento (KPIs).
  const grid = elx('div', 'kpi-grid section');
  grid.appendChild(kpiCard('Cotizado', cop(pl.income), null, null, 'eventos'));
  grid.appendChild(kpiCard('Costos', cop(pl.cost), null, 'var(--negative)'));
  grid.appendChild(kpiCard('Utilidad', cop(pl.profit), null, pl.profit >= 0 ? 'var(--positive)' : 'var(--negative)'));
  grid.appendChild(kpiCard('Margen', pl.margin === null ? '—' : fmtPct(pl.margin, 1)));
  _root.appendChild(grid);

  // Barra de cobro (progressRing + abonado/pendiente).
  const collect = elx('div', 'collect-bar section');
  const collectTop = elx('div');
  collectTop.style.display = 'flex';
  collectTop.style.alignItems = 'center';
  collectTop.style.gap = 'var(--sp-4)';
  const ringWrap = elx('div', 'chart-wrap');
  ringWrap.style.width = '100px';
  ringWrap.style.flexShrink = '0';
  collectTop.appendChild(ringWrap);
  progressRing(ringWrap, pl.pctCobrado === null ? 0 : pl.pctCobrado, { size: 100, thickness: 10, label: 'cobrado' });
  const collectInfo = elx('div');
  collectInfo.style.flex = '1 1 auto';
  collectInfo.innerHTML =
    `<div class="collect-bar__top"><span class="collect-bar__paid">Abonado ${escapeHtml(cop(pl.totalAbonado))}</span></div>` +
    `<div class="collect-bar__top"><span class="collect-bar__pending">Pendiente ${escapeHtml(cop(pl.saldoPendiente))}</span></div>`;
  if (pl.costoPorPersona !== null) {
    collectInfo.innerHTML += `<div class="field__hint">Costo/persona: ${escapeHtml(cop(pl.costoPorPersona))}</div>`;
  }
  collectTop.appendChild(collectInfo);
  collect.appendChild(collectTop);
  _root.appendChild(collect);

  // Botones rápidos +Abono / +Costo.
  const quickRow = elx('div', 'chip-row section');
  const addAbono = elx('button', 'btn btn--sm btn--primary', ICONS.plus + '<span>Abono</span>');
  addAbono.type = 'button';
  addAbono.addEventListener('click', () => openIncomeSheet(ev));
  const addCosto = elx('button', 'btn btn--sm btn--ghost', ICONS.plus + '<span>Costo</span>');
  addCosto.type = 'button';
  addCosto.addEventListener('click', () => openCostSheet(ev));
  quickRow.appendChild(addAbono);
  quickRow.appendChild(addCosto);
  _root.appendChild(quickRow);

  // Costos por categoría (donut) — agregados sobre los costos del evento.
  const evCostsByCat = aggregateCostsByCat(costs);
  if (evCostsByCat.length) {
    const card = chartCard('Costos por categoría', '');
    const dWrap = elx('div', 'chart-wrap');
    dWrap.style.maxWidth = '240px'; dWrap.style.margin = '0 auto';
    card.appendChild(dWrap);
    donut(dWrap, evCostsByCat.map((c) => ({ label: c.label, value: c.total, color: c.color })), {
      currency: 'COP', size: 200, thickness: 24, center: { value: cop(pl.cost), label: 'Costos' },
    });
    card.appendChild(buildLegend(evCostsByCat.map((c) => ({ label: c.label, color: c.color, value: cop(c.total) }))));
    _root.appendChild(card);
  }

  // Lista de abonos.
  const abonosCard = chartCard('Abonos', incomes.length + (incomes.length === 1 ? ' registro' : ' registros'));
  if (incomes.length === 0) {
    abonosCard.appendChild(elx('p', 'field__hint', 'Sin abonos registrados.'));
  } else {
    const list = elx('div', 'list list--card');
    incomes.forEach((inc) => list.appendChild(buildIncomeRow(ev, inc)));
    abonosCard.appendChild(list);
  }
  _root.appendChild(abonosCard);

  // Lista de costos.
  const costCard = chartCard('Costos', costs.length + (costs.length === 1 ? ' registro' : ' registros'));
  if (costs.length === 0) {
    costCard.appendChild(elx('p', 'field__hint', 'Sin costos registrados.'));
  } else {
    const list = elx('div', 'list list--card');
    costs.forEach((c) => list.appendChild(buildCostRow(ev, c)));
    costCard.appendChild(list);
  }
  _root.appendChild(costCard);

  // Notas.
  if (ev.notes) {
    const notesCard = chartCard('Notas', '');
    notesCard.appendChild(elx('p', 'modal__text', escapeHtml(ev.notes)));
    notesCard.querySelector('.modal__text').style.textAlign = 'left';
    _root.appendChild(notesCard);
  }

  // Eliminar evento.
  const delWrap = elx('div', 'section');
  const delBtn = elx('button', 'btn btn--full btn--danger', ICONS.trash + '<span>Eliminar evento</span>');
  delBtn.type = 'button';
  delBtn.addEventListener('click', async () => {
    const ok = await confirmDestructive({
      title: '¿Eliminar evento?',
      message: `Se eliminará "${ev.name}" con todos sus abonos y costos.`,
      word: 'BORRAR',
      confirmText: 'Eliminar',
    });
    if (ok) {
      deleteEvent(ev.id);
      toast('Evento eliminado', { type: 'info' });
      emitData('delete');
      state.detailId = null;
      location.hash = '#/eventos';
    }
  });
  delWrap.appendChild(delBtn);
  _root.appendChild(delWrap);
}

function aggregateCostsByCat(costs) {
  const acc = new Map();
  costs.forEach((c) => {
    acc.set(c.category, (acc.get(c.category) || 0) + c.amount);
  });
  const rows = [];
  let i = 0;
  const palette = ['var(--gold)', '#C084FC', '#5E9DF6', '#34D399', '#FBBF24', '#F87171', '#E6C45E', '#8E8E98', 'var(--gold-deep)'];
  COST_CATS.forEach((cat) => {
    if (acc.has(cat)) {
      rows.push({ category: cat, label: COST_CAT_LABELS[cat], total: acc.get(cat), color: palette[i % palette.length] });
      i++;
    }
  });
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

function buildIncomeRow(ev, inc) {
  const row = elx('div', 'list-row');
  const front = elx('div', 'list-row__front');
  const ic = elx('span', 'list-row__icon', ICONS.cash);
  ic.style.color = 'var(--positive)';
  front.appendChild(ic);
  const main = elx('div', 'list-row__main');
  main.appendChild(elx('span', 'list-row__title', escapeHtml(inc.concept)));
  main.appendChild(elx('span', 'list-row__sub', escapeHtml(formatDateEs(inc.date) + ' · ' + inc.method)));
  front.appendChild(main);
  const amt = elx('span', 'list-row__amount list-row__amount--pos', '+' + cop(inc.amount));
  front.appendChild(amt);
  const del = elx('button', 'btn--icon-bare', ICONS.trash);
  del.type = 'button';
  del.style.color = 'var(--text-tertiary)';
  del.setAttribute('aria-label', 'Eliminar abono');
  del.addEventListener('click', () => {
    deleteEventIncome(inc.id);
    toast('Abono eliminado', { type: 'info' });
    emitData('income-delete');
    refresh();
  });
  front.appendChild(del);
  row.appendChild(front);
  return row;
}

function buildCostRow(ev, c) {
  const row = elx('div', 'list-row');
  const front = elx('div', 'list-row__front');
  const ic = elx('span', 'list-row__icon', ICONS.receipt);
  front.appendChild(ic);
  const main = elx('div', 'list-row__main');
  main.appendChild(elx('span', 'list-row__title', escapeHtml(c.concept)));
  const sub = [COST_CAT_LABELS[c.category] || c.category];
  if (c.supplier) sub.push(c.supplier);
  sub.push(c.paid ? 'Pagado' : 'Pendiente');
  main.appendChild(elx('span', 'list-row__sub', escapeHtml(sub.join(' · '))));
  front.appendChild(main);
  const amt = elx('span', 'list-row__amount list-row__amount--neg', '-' + cop(c.amount));
  front.appendChild(amt);
  const del = elx('button', 'btn--icon-bare', ICONS.trash);
  del.type = 'button';
  del.style.color = 'var(--text-tertiary)';
  del.setAttribute('aria-label', 'Eliminar costo');
  del.addEventListener('click', () => {
    deleteEventCost(c.id);
    toast('Costo eliminado', { type: 'info' });
    emitData('cost-delete');
    refresh();
  });
  front.appendChild(del);
  row.appendChild(front);
  return row;
}

/* ============================================================
 *  WHATSAPP — recordatorio de saldo con client.phone
 * ============================================================ */
function openWhatsApp(ev, pl) {
  const phone = (ev.client && ev.client.phone) ? String(ev.client.phone).replace(/[^\d]/g, '') : '';
  if (!phone) { toast('Este cliente no tiene teléfono.', { type: 'error' }); return; }
  const nombre = (ev.client && ev.client.name) ? ev.client.name : 'Hola';
  let msg;
  if (pl.saldoPendiente > 0) {
    msg = `Hola ${nombre}, te recordamos el saldo pendiente de tu evento "${ev.name}" (${formatDateEs(ev.eventDate)}): ${fmtCOP(pl.saldoPendiente)}. ¡Gracias!`;
  } else {
    msg = `Hola ${nombre}, gracias por confiar en nosotros para tu evento "${ev.name}". ¡Todo al día!`;
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  try { window.open(url, '_blank', 'noopener'); } catch (_e) { location.href = url; }
}

/* ============================================================
 *  SHEET — CAMBIAR ESTADO
 * ============================================================ */
function openStatusSheet(ev) {
  const wrap = elx('div', 'stack');
  const row = elx('div', 'chip-row');
  STATUSES.forEach((s) => {
    const c = elx('button', 'chip' + (ev.status === s ? ' chip--active' : ''));
    c.type = 'button';
    c.innerHTML = `<span class="badge__dot" style="background:${statusColor(s)}"></span>${escapeHtml(STATUS_LABELS[s])}`;
    c.addEventListener('click', () => {
      setEventStatus(ev.id, s);
      toast('Estado: ' + STATUS_LABELS[s], { type: 'success' });
      emitData('status');
      refresh();
    });
    row.appendChild(c);
  });
  wrap.appendChild(row);
  openSheet({ title: 'Cambiar estado', content: wrap, actions: [{ label: 'Cerrar', variant: 'ghost', closeOnClick: true }] });
}

/* ============================================================
 *  SHEET — +ABONO
 * ============================================================ */
function openIncomeSheet(ev) {
  const pl = eventPL(ev.id);
  const wrap = elx('div', 'stack');
  wrap.appendChild(elx('p', 'field__hint', `Saldo pendiente: ${cop(pl.saldoPendiente)}`));

  const line = elx('div', 'amount-line');
  line.appendChild(elx('span', 'amount-line__cur', '$'));
  const inp = elx('input', 'input--amount');
  inp.type = 'text'; inp.placeholder = '0';
  line.appendChild(inp);
  wrap.appendChild(line);
  const ctrl = attachAmountInput(inp, { currency: 'COP' });

  const conceptField = elx('div', 'field');
  conceptField.appendChild(elx('label', 'field__label', 'Concepto'));
  const conceptInput = elx('input', 'input');
  conceptInput.type = 'text'; conceptInput.placeholder = 'Abono';
  conceptInput.value = 'Abono';
  conceptField.appendChild(conceptInput);
  wrap.appendChild(conceptField);

  let selMethod = 'transferencia';
  const metField = elx('div', 'field');
  metField.appendChild(elx('label', 'field__label', 'Método'));
  const metRow = elx('div', 'chip-row chip-row--scroll');
  INCOME_METHODS.forEach((m) => {
    const ch = elx('button', 'chip' + (selMethod === m ? ' chip--active' : ''), m);
    ch.type = 'button';
    ch.addEventListener('click', () => {
      selMethod = m;
      metRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('chip--active'));
      ch.classList.add('chip--active');
    });
    metRow.appendChild(ch);
  });
  metField.appendChild(metRow);
  wrap.appendChild(metField);

  const dateField = elx('div', 'field');
  dateField.appendChild(elx('label', 'field__label', 'Fecha'));
  const dateInput = elx('input', 'input');
  dateInput.type = 'date'; dateInput.value = hoy();
  dateField.appendChild(dateInput);
  wrap.appendChild(dateField);

  openSheet({
    title: 'Registrar abono',
    content: wrap,
    actions: [
      { label: 'Cancelar', variant: 'ghost', closeOnClick: true },
      {
        label: 'Registrar', variant: 'primary',
        onClick: () => {
          const v = ctrl.getValue();
          if (v <= 0) { toast('Ingresa un monto mayor a 0.', { type: 'error' }); return false; }
          addEventIncome({
            eventId: ev.id, amount: v, concept: conceptInput.value.trim() || 'Abono',
            method: selMethod, date: dateInput.value || hoy(),
          });
          toast('Abono registrado', { type: 'success' });
          emitData('income');
          refresh();
          return true;
        },
      },
    ],
  });
}

/* ============================================================
 *  SHEET — +COSTO
 * ============================================================ */
function openCostSheet(ev) {
  const wrap = elx('div', 'stack');

  const line = elx('div', 'amount-line');
  line.appendChild(elx('span', 'amount-line__cur', '$'));
  const inp = elx('input', 'input--amount');
  inp.type = 'text'; inp.placeholder = '0';
  line.appendChild(inp);
  wrap.appendChild(line);
  const ctrl = attachAmountInput(inp, { currency: 'COP' });

  let selCat = 'lugar';
  const catField = elx('div', 'field');
  catField.appendChild(elx('label', 'field__label', 'Categoría'));
  const catRow = elx('div', 'chip-row chip-row--scroll');
  COST_CATS.forEach((c) => {
    const ch = elx('button', 'chip' + (selCat === c ? ' chip--active' : ''), COST_CAT_LABELS[c]);
    ch.type = 'button';
    ch.addEventListener('click', () => {
      selCat = c;
      catRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('chip--active'));
      ch.classList.add('chip--active');
    });
    catRow.appendChild(ch);
  });
  catField.appendChild(catRow);
  wrap.appendChild(catField);

  const conceptField = elx('div', 'field');
  conceptField.appendChild(elx('label', 'field__label', 'Concepto'));
  const conceptInput = elx('input', 'input');
  conceptInput.type = 'text'; conceptInput.placeholder = 'Descripción del costo';
  conceptField.appendChild(conceptInput);
  wrap.appendChild(conceptField);

  const supplierField = elx('div', 'field');
  supplierField.appendChild(elx('label', 'field__label', 'Proveedor (opcional)'));
  const supplierInput = elx('input', 'input');
  supplierInput.type = 'text'; supplierInput.placeholder = 'Nombre del proveedor';
  supplierField.appendChild(supplierInput);
  wrap.appendChild(supplierField);

  const dateField = elx('div', 'field');
  dateField.appendChild(elx('label', 'field__label', 'Fecha'));
  const dateInput = elx('input', 'input');
  dateInput.type = 'date'; dateInput.value = hoy();
  dateField.appendChild(dateInput);
  wrap.appendChild(dateField);

  // Pagado.
  const paidRow = elx('div', 'settings-row');
  paidRow.style.padding = '0';
  paidRow.style.background = 'transparent';
  paidRow.innerHTML = '<span class="settings-row__label">Marcar como pagado</span>';
  const sw = elx('label', 'switch');
  const swInput = elx('input');
  swInput.type = 'checkbox';
  sw.appendChild(swInput);
  sw.appendChild(elx('span', 'switch__track'));
  paidRow.appendChild(sw);
  wrap.appendChild(paidRow);

  openSheet({
    title: 'Registrar costo',
    content: wrap,
    height: '78dvh',
    actions: [
      { label: 'Cancelar', variant: 'ghost', closeOnClick: true },
      {
        label: 'Registrar', variant: 'primary',
        onClick: () => {
          const v = ctrl.getValue();
          if (v <= 0) { toast('Ingresa un monto mayor a 0.', { type: 'error' }); return false; }
          addEventCost({
            eventId: ev.id, amount: v, category: selCat,
            concept: conceptInput.value.trim() || 'Costo',
            supplier: supplierInput.value.trim(),
            date: dateInput.value || hoy(),
            paid: swInput.checked,
          });
          toast('Costo registrado', { type: 'success' });
          emitData('cost');
          refresh();
          return true;
        },
      },
    ],
  });
}

/* ============================================================
 *  SHEET — NUEVO / EDITAR EVENTO
 * ============================================================ */
function openEventSheet(existing) {
  const isEdit = !!existing;
  const wrap = elx('div', 'stack');

  function field(label, inputEl) {
    const f = elx('div', 'field');
    f.appendChild(elx('label', 'field__label', label));
    f.appendChild(inputEl);
    return f;
  }

  // Nombre.
  const nameInput = elx('input', 'input');
  nameInput.type = 'text'; nameInput.placeholder = 'Ej: Boda Ana y Luis';
  nameInput.value = existing ? existing.name : '';
  wrap.appendChild(field('Nombre del evento', nameInput));

  // Tipo (chips).
  let selType = existing ? existing.eventType : 'boda';
  const typeField = elx('div', 'field');
  typeField.appendChild(elx('label', 'field__label', 'Tipo'));
  const typeRow = elx('div', 'chip-row chip-row--scroll');
  EVENT_TYPES.forEach((t) => {
    const ch = elx('button', 'chip' + (selType === t ? ' chip--active' : ''), EVENT_TYPE_LABELS[t]);
    ch.type = 'button';
    ch.addEventListener('click', () => {
      selType = t;
      typeRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('chip--active'));
      ch.classList.add('chip--active');
    });
    typeRow.appendChild(ch);
  });
  typeField.appendChild(typeRow);
  wrap.appendChild(typeField);

  // Cotizado (monto).
  const qLine = elx('div', 'amount-line');
  qLine.style.padding = 'var(--sp-2) 0';
  qLine.appendChild(elx('span', 'amount-line__cur', '$'));
  const qInput = elx('input', 'input--amount');
  qInput.style.fontSize = '26px'; qInput.style.minHeight = '48px'; qInput.style.textAlign = 'left';
  qInput.type = 'text'; qInput.placeholder = '0';
  qLine.appendChild(qInput);
  const qField = elx('div', 'field');
  qField.appendChild(elx('label', 'field__label', 'Valor cotizado (COP)'));
  qField.appendChild(qLine);
  wrap.appendChild(qField);
  const qCtrl = attachAmountInput(qInput, { currency: 'COP' });
  if (existing) qCtrl.setValue(existing.quotedAmount);

  // Cliente.
  const clientName = elx('input', 'input');
  clientName.type = 'text'; clientName.placeholder = 'Nombre del cliente';
  clientName.value = existing && existing.client ? existing.client.name : '';
  wrap.appendChild(field('Cliente', clientName));

  const clientPhone = elx('input', 'input');
  clientPhone.type = 'tel'; clientPhone.placeholder = '57 300 000 0000';
  clientPhone.value = existing && existing.client ? existing.client.phone : '';
  wrap.appendChild(field('Teléfono (WhatsApp)', clientPhone));

  // Fecha + hora.
  const dateInput = elx('input', 'input');
  dateInput.type = 'date';
  dateInput.value = existing ? existing.eventDate : hoy();
  wrap.appendChild(field('Fecha del evento', dateInput));

  const horaInput = elx('input', 'input');
  horaInput.type = 'time';
  horaInput.value = existing && existing.hora ? existing.hora : '';
  wrap.appendChild(field('Hora (opcional)', horaInput));

  // Lugar / ciudad / invitados.
  const venueInput = elx('input', 'input');
  venueInput.type = 'text'; venueInput.placeholder = 'Salón, finca, hotel…';
  venueInput.value = existing ? (existing.venue || '') : '';
  wrap.appendChild(field('Lugar', venueInput));

  const ciudadInput = elx('input', 'input');
  ciudadInput.type = 'text'; ciudadInput.placeholder = 'Ciudad';
  ciudadInput.value = existing && existing.ciudad ? existing.ciudad : '';
  wrap.appendChild(field('Ciudad (opcional)', ciudadInput));

  const guestsInput = elx('input', 'input');
  guestsInput.type = 'number'; guestsInput.min = '0'; guestsInput.inputMode = 'numeric';
  guestsInput.placeholder = '0';
  guestsInput.value = existing && existing.guests ? String(existing.guests) : '';
  wrap.appendChild(field('Invitados', guestsInput));

  // Estado (solo edición; alta arranca en cotizado).
  let selStatus = existing ? existing.status : 'cotizado';
  if (isEdit) {
    const stField = elx('div', 'field');
    stField.appendChild(elx('label', 'field__label', 'Estado'));
    const stRow = elx('div', 'chip-row chip-row--scroll');
    STATUSES.forEach((s) => {
      const ch = elx('button', 'chip' + (selStatus === s ? ' chip--active' : ''), STATUS_LABELS[s]);
      ch.type = 'button';
      ch.addEventListener('click', () => {
        selStatus = s;
        stRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('chip--active'));
        ch.classList.add('chip--active');
      });
      stRow.appendChild(ch);
    });
    stField.appendChild(stRow);
    wrap.appendChild(stField);
  }

  // Notas.
  const notesInput = elx('textarea', 'textarea');
  notesInput.placeholder = 'Detalles, requerimientos…';
  notesInput.value = existing ? (existing.notes || '') : '';
  wrap.appendChild(field('Notas', notesInput));

  openSheet({
    title: isEdit ? 'Editar evento' : 'Nuevo evento',
    content: wrap,
    height: '88dvh',
    actions: [
      { label: 'Cancelar', variant: 'ghost', closeOnClick: true },
      {
        label: isEdit ? 'Guardar' : 'Crear evento', variant: 'primary',
        onClick: () => {
          const name = nameInput.value.trim();
          if (!name) { toast('Ponle un nombre al evento.', { type: 'error' }); return false; }
          const payload = {
            name,
            eventType: selType,
            quotedAmount: qCtrl.getValue(),
            client: { name: clientName.value.trim(), phone: clientPhone.value.trim(), email: '' },
            eventDate: dateInput.value || hoy(),
            hora: horaInput.value || null,
            venue: venueInput.value.trim(),
            ciudad: ciudadInput.value.trim() || null,
            guests: Math.max(0, parseInt(guestsInput.value, 10) || 0),
            notes: notesInput.value.trim(),
          };
          if (isEdit) {
            payload.status = selStatus;
            updateEvent(existing.id, payload);
            toast('Evento actualizado', { type: 'success' });
            emitData('update');
            refresh();
          } else {
            const created = addEvent(payload);
            toast('Evento creado', { type: 'success' });
            emitData('create');
            if (created && created.id) {
              state.detailId = created.id;
              location.hash = `#/eventos?id=${created.id}`;
            } else {
              refresh();
            }
          }
          return true;
        },
      },
    ],
  });
}

/* ============================================================
 *  TAB — REPORTES (P&L mensual, ranking, CxC, gráficos)
 * ============================================================ */
function renderReportes(body) {
  body.appendChild(buildMonthBar(() => renderResumenOrTab('reportes')));

  const mk = state.month;

  // ---- Gráfico: ingresos / costos / utilidad (groupedBars + línea) ----
  const r = rangeForMonth(mk + '-01');
  // Rango: 6 meses hasta el mes seleccionado.
  const fromKey = monthKey(addMonths(mk + '-01', -5));
  const fromDate = fromKey + '-01';
  const toDate = rangeForMonth(mk + '-01').to;
  const revenue = eventsRevenue({ from: fromDate, to: toDate, groupBy: 'month' });
  const revByKey = new Map(revenue.map((x) => [x.key, x]));

  const gbData = [];
  for (let i = 5; i >= 0; i--) {
    const k = monthKey(addMonths(mk + '-01', -i));
    const rec = revByKey.get(k) || { income: 0, cost: 0, profit: 0 };
    gbData.push({ label: monthName(rangeForMonth(k + '-01').month, { abbr: true }), a: rec.income, b: rec.cost, line: rec.profit });
  }
  const gbCard = chartCard('Ingresos · Costos · Utilidad', 'Últimos 6 meses');
  const gbWrap = elx('div', 'chart-wrap');
  gbCard.appendChild(gbWrap);
  body.appendChild(gbCard);
  groupedBars(gbWrap, gbData, {
    currency: 'COP', labelA: 'Ingresos', labelB: 'Costos', lineLabel: 'Utilidad',
    colorA: 'var(--area-eventos)', colorB: 'var(--negative)', colorLine: 'var(--gold)',
    cssHeight: '210px',
  });

  // ---- P&L mensual (tabla con desglose por 9 categorías de costo) ----
  const pl = monthlyEventsPL(mk);
  const monthEvents = getEvents({}).filter((e) => monthKey(e.eventDate) === mk && (e.status === 'realizado' || e.status === 'pagado'));
  const eventIds = new Set(monthEvents.map((e) => e.id));
  const monthCosts = [];
  monthEvents.forEach((e) => { getEventCosts(e.id).forEach((c) => monthCosts.push(c)); });
  const costByCat = new Map();
  monthCosts.forEach((c) => { costByCat.set(c.category, (costByCat.get(c.category) || 0) + c.amount); });

  const plCard = chartCard('P&L mensual', monthLabel(mk));
  const table = elx('div', 'report-table');
  let html = '<table><tbody>';
  html += `<tr><td>Ingresos (cotizado)</td><td class="num num--pos">${escapeHtml(cop(pl.ingresos))}</td></tr>`;
  COST_CATS.forEach((cat) => {
    const v = costByCat.get(cat) || 0;
    if (v > 0) html += `<tr><td>· ${escapeHtml(COST_CAT_LABELS[cat])}</td><td class="num num--neg">-${escapeHtml(cop(v))}</td></tr>`;
  });
  html += `<tr><td><strong>Total costos</strong></td><td class="num num--neg">-${escapeHtml(cop(pl.costos))}</td></tr>`;
  html += '</tbody>';
  html += `<tfoot><tr><td>Utilidad bruta</td><td class="num">${escapeHtml(fmtSigned(pl.utilidad, fmtCOP))}</td></tr>`;
  html += `<tr><td>Margen</td><td class="num">${pl.margen === null ? '—' : escapeHtml(fmtPct(pl.margen, 1))}</td></tr></tfoot></table>`;
  table.innerHTML = html;
  plCard.appendChild(table);
  body.appendChild(plCard);

  // ---- Costos por categoría (donut) — todos los costos del rango del mes ----
  const allMonthCostRows = aggregateCostsByCat(monthCosts.length ? monthCosts : collectAllCostsForMonth(mk));
  if (allMonthCostRows.length) {
    const card = chartCard('Costos por categoría', monthLabel(mk));
    const dWrap = elx('div', 'chart-wrap');
    dWrap.style.maxWidth = '240px'; dWrap.style.margin = '0 auto';
    card.appendChild(dWrap);
    const tot = allMonthCostRows.reduce((a, x) => a + x.total, 0);
    donut(dWrap, allMonthCostRows.map((c) => ({ label: c.label, value: c.total, color: c.color })), {
      currency: 'COP', size: 200, thickness: 24, center: { value: cop(tot), label: 'Costos' },
    });
    card.appendChild(buildLegend(allMonthCostRows.map((c) => ({ label: c.label, color: c.color, value: cop(c.total) }))));
    body.appendChild(card);
  }

  // ---- Embudo de pipeline (funnel) ----
  const pipeline = eventsPipeline().filter((s) => s.status !== 'cancelado');
  const funnelCard = chartCard('Pipeline por estado', '');
  const fWrap = elx('div', 'chart-wrap');
  funnelCard.appendChild(fWrap);
  body.appendChild(funnelCard);
  funnel(fWrap, pipeline.map((s) => ({ status: s.label, count: s.count, amount: s.amount, color: statusColor(s.status) })), { currency: 'COP' });

  // ---- Ranking por rentabilidad (hbarsRanked, margen por evento) ----
  let rankSort = 'profit';
  const rankCard = chartCard('Ranking de eventos', '');
  const rankHead = rankCard.querySelector('.chart-card__head');
  const sortToggle = elx('div', 'range-toggle');
  const byProfit = elx('button', 'range-toggle__btn is-active', 'Utilidad');
  byProfit.type = 'button';
  const byMargin = elx('button', 'range-toggle__btn', 'Margen');
  byMargin.type = 'button';
  sortToggle.appendChild(byProfit);
  sortToggle.appendChild(byMargin);
  rankHead.appendChild(sortToggle);
  const rankWrap = elx('div', 'chart-wrap');
  rankCard.appendChild(rankWrap);
  body.appendChild(rankCard);

  function paintRank() {
    const rows = eventRanking({ sort: rankSort }).slice(0, 10);
    if (rankSort === 'margin') {
      hbarsRanked(rankWrap, rows.map((e) => ({
        label: e.name, value: e.margin === null ? 0 : e.margin,
        sub: cop(e.profit), color: (e.margin || 0) >= 0 ? 'var(--positive)' : 'var(--negative)',
      })), { sort: false, currency: 'COP', format: (n) => fmtPct(n, 0) });
    } else {
      hbarsRanked(rankWrap, rows.map((e) => ({
        label: e.name, value: e.profit,
        sub: e.margin === null ? '—' : fmtPct(e.margin, 0),
        color: e.profit >= 0 ? 'var(--gold)' : 'var(--negative)',
      })), { sort: false, currency: 'COP' });
    }
  }
  byProfit.addEventListener('click', () => {
    rankSort = 'profit';
    byProfit.classList.add('is-active'); byMargin.classList.remove('is-active');
    paintRank();
  });
  byMargin.addEventListener('click', () => {
    rankSort = 'margin';
    byMargin.classList.add('is-active'); byProfit.classList.remove('is-active');
    paintRank();
  });
  paintRank();

  // ---- Cuentas por cobrar (stackedBar recaudo vs pendiente + tabla, vencidos arriba) ----
  const ar = accountsReceivable();
  const cxcCard = chartCard('Cuentas por cobrar', cop(ar.total));
  if (ar.rows.length === 0) {
    cxcCard.appendChild(elx('p', 'field__hint', 'Sin saldos pendientes. ¡Todo cobrado!'));
  } else {
    const stWrap = elx('div', 'chart-wrap');
    cxcCard.appendChild(stWrap);
    stackedBar(stWrap, ar.rows.slice(0, 8).map((row) => ({
      label: row.nombre || row.cliente || '—',
      parts: [
        { value: row.abonado, color: 'var(--positive)', label: 'Recaudado' },
        { value: row.saldo, color: 'var(--warning)', label: 'Pendiente' },
      ],
    })), { currency: 'COP' });

    // Tabla con vencidos arriba.
    const table2 = elx('div', 'report-table');
    table2.style.marginTop = 'var(--sp-3)';
    let h2 = '<table><thead><tr><th>Cliente</th><th class="num">Saldo</th><th class="num">% cobr.</th></tr></thead><tbody>';
    ar.rows.forEach((row) => {
      const trCls = row.vencido ? ' class="is-overdue"' : '';
      const phoneAttr = row.phone ? ` data-phone="${escapeHtml(String(row.phone).replace(/[^\d]/g, ''))}"` : '';
      h2 += `<tr${trCls} data-id="${escapeHtml(row.eventId)}"${phoneAttr} style="cursor:pointer">` +
        `<td>${escapeHtml(row.cliente || row.nombre)}${row.vencido ? ' <span class="badge badge--neg">Vencido</span>' : ''}<br><span class="field__hint">${escapeHtml(formatDateEs(row.fecha))}</span></td>` +
        `<td class="num">${escapeHtml(cop(row.saldo))}</td>` +
        `<td class="num">${escapeHtml(fmtPct(row.pctCobrado, 0))}</td></tr>`;
    });
    h2 += '</tbody></table>';
    table2.innerHTML = h2;
    table2.querySelectorAll('tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        const id = tr.dataset.id;
        if (id) { state.detailId = id; location.hash = `#/eventos?id=${id}`; }
      });
    });
    cxcCard.appendChild(table2);
  }
  body.appendChild(cxcCard);
}

// Costos de TODOS los eventos cuyo costo cae en el mes (fallback para el donut de reportes).
function collectAllCostsForMonth(mk) {
  const out = [];
  getEvents({}).forEach((e) => {
    getEventCosts(e.id).forEach((c) => {
      if (monthKey(c.date) === mk) out.push(c);
    });
  });
  return out;
}
