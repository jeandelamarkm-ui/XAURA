// XAURA · js/core/events.js
// CRUD del modulo Eventos (COP): eventos, ingresos (abonos) y costos (SPEC §4.4).
// Modelo normalizado: incomes y costs viven en events.incomes / events.costs
// y referencian eventId. deleteEvent borra todos sus hijos. Cada mutacion llama commit().

import {
  getDB, commit, nextId
} from './store.js';

import {
  roundMoney, isoDate, nowISO,
  num, str, bool,
  isEventType, isEventStatus, isEventIncomeMethod, isEventCostCategory,
  isISODate
} from './schema.js';

/* ============================================================
 *  UTILIDADES INTERNAS
 * ============================================================ */

// COP: enteros. Toda la rama de eventos opera en COP.
function copRound(x) {
  return roundMoney(x, 'COP');
}

function normDate(v) {
  return isISODate(v) ? v : isoDate();
}

function indexById(arr, id) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].id === id) return i;
  }
  return -1;
}

// Cliente normalizado {name, phone, email}.
function normClient(c) {
  c = c || {};
  return {
    name: str(c.name).trim(),
    phone: str(c.phone).trim(),
    email: str(c.email).trim()
  };
}

/* ============================================================
 *  EVENTOS
 * ============================================================ */

export function addEvent(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('evt');
  const ts = nowISO();
  const event = {
    id,
    name: str(d.name).trim() || 'Evento',
    client: normClient(d.client),
    eventType: isEventType(d.eventType) ? d.eventType : 'otro',
    eventDate: normDate(d.eventDate),
    hora: (d.hora === undefined || d.hora === null || d.hora === '') ? null : str(d.hora),
    venue: str(d.venue).trim(),
    ciudad: (d.ciudad === undefined || d.ciudad === null || d.ciudad === '') ? null : str(d.ciudad).trim(),
    guests: Math.max(0, Math.round(num(d.guests, 0))),
    status: isEventStatus(d.status) ? d.status : 'cotizado',
    currency: 'COP',
    quotedAmount: copRound(num(d.quotedAmount, 0)),
    notes: str(d.notes),
    createdAt: ts,
    updatedAt: ts
  };
  db.events.events.push(event);
  commit();
  return event;
}

export function updateEvent(id, patch) {
  const db = getDB();
  const i = indexById(db.events.events, id);
  if (i === -1) return null;
  const ev = db.events.events[i];
  patch = patch || {};

  if (patch.name !== undefined) ev.name = str(patch.name).trim() || ev.name;
  if (patch.client !== undefined) ev.client = normClient(patch.client);
  if (patch.eventType !== undefined && isEventType(patch.eventType)) ev.eventType = patch.eventType;
  if (patch.eventDate !== undefined) ev.eventDate = normDate(patch.eventDate);
  if (patch.hora !== undefined) ev.hora = (patch.hora === null || patch.hora === '') ? null : str(patch.hora);
  if (patch.venue !== undefined) ev.venue = str(patch.venue).trim();
  if (patch.ciudad !== undefined) ev.ciudad = (patch.ciudad === null || patch.ciudad === '') ? null : str(patch.ciudad).trim();
  if (patch.guests !== undefined) ev.guests = Math.max(0, Math.round(num(patch.guests, ev.guests)));
  if (patch.status !== undefined && isEventStatus(patch.status)) ev.status = patch.status;
  if (patch.quotedAmount !== undefined) ev.quotedAmount = copRound(num(patch.quotedAmount, ev.quotedAmount));
  if (patch.notes !== undefined) ev.notes = str(patch.notes);
  ev.currency = 'COP';
  ev.updatedAt = nowISO();

  commit();
  return ev;
}

export function setEventStatus(id, status) {
  const db = getDB();
  const i = indexById(db.events.events, id);
  if (i === -1) return null;
  if (!isEventStatus(status)) return db.events.events[i];
  db.events.events[i].status = status;
  db.events.events[i].updatedAt = nowISO();
  commit();
  return db.events.events[i];
}

// deleteEvent: borra el evento y TODOS sus ingresos y costos.
export function deleteEvent(id) {
  const db = getDB();
  const i = indexById(db.events.events, id);
  if (i === -1) return false;

  db.events.events.splice(i, 1);
  db.events.incomes = db.events.incomes.filter(function (x) {
    return !(x && x.eventId === id);
  });
  db.events.costs = db.events.costs.filter(function (x) {
    return !(x && x.eventId === id);
  });

  commit();
  return true;
}

// getEvents(filters): {status,eventType,from,to,search,sort}
// from/to aplican sobre eventDate.
export function getEvents(filters) {
  const db = getDB();
  filters = filters || {};

  const status = filters.status;
  const eventType = filters.eventType;
  const from = isISODate(filters.from) ? filters.from : null;
  const to = isISODate(filters.to) ? filters.to : null;
  const search = filters.search ? String(filters.search).trim().toLowerCase() : '';

  const rows = [];
  const src = db.events.events;
  for (let i = 0; i < src.length; i++) {
    const ev = src[i];
    if (!ev) continue;
    if (status && ev.status !== status) continue;
    if (eventType && ev.eventType !== eventType) continue;
    if (from && ev.eventDate < from) continue;
    if (to && ev.eventDate > to) continue;
    if (search) {
      const name = (ev.name || '').toLowerCase();
      const cli = (ev.client && ev.client.name ? ev.client.name : '').toLowerCase();
      const venue = (ev.venue || '').toLowerCase();
      const ciudad = (ev.ciudad || '').toLowerCase();
      if (name.indexOf(search) === -1 &&
          cli.indexOf(search) === -1 &&
          venue.indexOf(search) === -1 &&
          ciudad.indexOf(search) === -1) continue;
    }
    rows.push(ev);
  }

  const sort = filters.sort || 'date-desc';
  rows.sort(function (a, b) {
    if (sort === 'date-asc') {
      if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? -1 : 1;
      return (a.createdAt < b.createdAt) ? -1 : (a.createdAt > b.createdAt ? 1 : 0);
    }
    if (sort === 'amount-desc') {
      return num(b.quotedAmount, 0) - num(a.quotedAmount, 0);
    }
    if (sort === 'amount-asc') {
      return num(a.quotedAmount, 0) - num(b.quotedAmount, 0);
    }
    // date-desc (default)
    if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? 1 : -1;
    return (a.createdAt < b.createdAt) ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
  });

  return rows;
}

/* ============================================================
 *  INGRESOS DE EVENTO (abonos)
 * ============================================================ */

export function addEventIncome(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('evi');
  const income = {
    id,
    eventId: str(d.eventId),
    concept: str(d.concept).trim() || 'Abono',
    amount: copRound(num(d.amount, 0)),
    currency: 'COP',
    date: normDate(d.date),
    method: isEventIncomeMethod(d.method) ? d.method : 'transferencia',
    createdAt: nowISO()
  };
  db.events.incomes.push(income);
  commit();
  return income;
}

export function updateEventIncome(id, patch) {
  const db = getDB();
  const i = indexById(db.events.incomes, id);
  if (i === -1) return null;
  const inc = db.events.incomes[i];
  patch = patch || {};

  if (patch.eventId !== undefined) inc.eventId = str(patch.eventId) || inc.eventId;
  if (patch.concept !== undefined) inc.concept = str(patch.concept).trim() || inc.concept;
  if (patch.amount !== undefined) inc.amount = copRound(num(patch.amount, inc.amount));
  if (patch.date !== undefined) inc.date = normDate(patch.date);
  if (patch.method !== undefined && isEventIncomeMethod(patch.method)) inc.method = patch.method;
  inc.currency = 'COP';

  commit();
  return inc;
}

export function deleteEventIncome(id) {
  const db = getDB();
  const i = indexById(db.events.incomes, id);
  if (i === -1) return false;
  db.events.incomes.splice(i, 1);
  commit();
  return true;
}

export function getEventIncomes(eventId) {
  const db = getDB();
  const eid = str(eventId);
  const out = [];
  for (let i = 0; i < db.events.incomes.length; i++) {
    const inc = db.events.incomes[i];
    if (!inc) continue;
    if (eid && inc.eventId !== eid) continue;
    out.push(inc);
  }
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt < b.createdAt) ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
  });
  return out;
}

/* ============================================================
 *  COSTOS DE EVENTO
 * ============================================================ */

export function addEventCost(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('evc');
  const cost = {
    id,
    eventId: str(d.eventId),
    category: isEventCostCategory(d.category) ? d.category : 'imprevistos',
    supplier: str(d.supplier).trim(),
    concept: str(d.concept).trim() || 'Costo',
    amount: copRound(num(d.amount, 0)),
    currency: 'COP',
    date: normDate(d.date),
    paid: bool(d.paid, false),
    createdAt: nowISO()
  };
  db.events.costs.push(cost);
  commit();
  return cost;
}

export function updateEventCost(id, patch) {
  const db = getDB();
  const i = indexById(db.events.costs, id);
  if (i === -1) return null;
  const c = db.events.costs[i];
  patch = patch || {};

  if (patch.eventId !== undefined) c.eventId = str(patch.eventId) || c.eventId;
  if (patch.category !== undefined && isEventCostCategory(patch.category)) c.category = patch.category;
  if (patch.supplier !== undefined) c.supplier = str(patch.supplier).trim();
  if (patch.concept !== undefined) c.concept = str(patch.concept).trim() || c.concept;
  if (patch.amount !== undefined) c.amount = copRound(num(patch.amount, c.amount));
  if (patch.date !== undefined) c.date = normDate(patch.date);
  if (patch.paid !== undefined) c.paid = bool(patch.paid, c.paid);
  c.currency = 'COP';

  commit();
  return c;
}

export function deleteEventCost(id) {
  const db = getDB();
  const i = indexById(db.events.costs, id);
  if (i === -1) return false;
  db.events.costs.splice(i, 1);
  commit();
  return true;
}

export function getEventCosts(eventId) {
  const db = getDB();
  const eid = str(eventId);
  const out = [];
  for (let i = 0; i < db.events.costs.length; i++) {
    const c = db.events.costs[i];
    if (!c) continue;
    if (eid && c.eventId !== eid) continue;
    out.push(c);
  }
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt < b.createdAt) ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
  });
  return out;
}
