// XAURA · js/core/trading.js
// CRUD del modulo Trading (USD): cuentas, dias operados y movimientos de caja (SPEC §4.4).
// Reglas: USD redondeado a 2 decimales en escritura. tradeDay con id deterministico
// (upsert por tradeDayId). traded:false -> pnl:0 y se excluye de estadisticas.
// Balances/P&L NUNCA se persisten. Cada mutacion llama commit().

import {
  getDB, commit, nextId, tradeDayId
} from './store.js';

import {
  roundMoney, isoDate, nowISO,
  num, str, bool,
  isTradingMovementType, isISODate, isMonthKey
} from './schema.js';

/* ============================================================
 *  UTILIDADES INTERNAS
 * ============================================================ */

// USD: 2 decimales.
function usdRound(x) {
  return roundMoney(x, 'USD');
}

function monthOf(dateStr) {
  return (typeof dateStr === 'string' && dateStr.length >= 7) ? dateStr.slice(0, 7) : '';
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

/* ============================================================
 *  CUENTAS DE TRADING
 * ============================================================ */

export function addTradingAccount(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('tracc');
  const ts = nowISO();
  const account = {
    id,
    name: str(d.name).trim() || 'Cuenta de trading',
    broker: str(d.broker).trim(),
    currency: 'USD',
    initialBalance: usdRound(num(d.initialBalance, 0)),
    startDate: normDate(d.startDate),
    color: str(d.color) || '#5E9DF6',
    archived: false,
    createdAt: ts,
    updatedAt: ts
  };
  db.trading.accounts.push(account);
  commit();
  return account;
}

export function updateTradingAccount(id, patch) {
  const db = getDB();
  const i = indexById(db.trading.accounts, id);
  if (i === -1) return null;
  const acc = db.trading.accounts[i];
  patch = patch || {};

  if (patch.name !== undefined) acc.name = str(patch.name).trim() || acc.name;
  if (patch.broker !== undefined) acc.broker = str(patch.broker).trim();
  if (patch.initialBalance !== undefined) acc.initialBalance = usdRound(num(patch.initialBalance, acc.initialBalance));
  if (patch.startDate !== undefined) acc.startDate = normDate(patch.startDate);
  if (patch.color !== undefined) acc.color = str(patch.color) || acc.color;
  if (patch.archived !== undefined) acc.archived = bool(patch.archived, acc.archived);
  acc.currency = 'USD';
  acc.updatedAt = nowISO();

  commit();
  return acc;
}

export function archiveTradingAccount(id) {
  const db = getDB();
  const i = indexById(db.trading.accounts, id);
  if (i === -1) return null;
  db.trading.accounts[i].archived = true;
  db.trading.accounts[i].updatedAt = nowISO();
  commit();
  return db.trading.accounts[i];
}

export function getTradingAccounts(opts) {
  const db = getDB();
  const includeArchived = !!(opts && opts.includeArchived);
  const out = [];
  for (let i = 0; i < db.trading.accounts.length; i++) {
    const a = db.trading.accounts[i];
    if (!a) continue;
    if (!includeArchived && a.archived) continue;
    out.push(a);
  }
  return out;
}

/* ============================================================
 *  DIAS DE TRADING  (id deterministico trd_{date}_{accountId})
 * ============================================================ */

// setTradeDay: upsert por tradeDayId(date, accountId).
// Si traded:false -> se fuerza pnl:0 (no afecta equity ni estadisticas).
export function setTradeDay(d) {
  const db = getDB();
  d = d || {};
  const accountId = str(d.accountId);
  if (!accountId) return null;
  const date = normDate(d.date);
  const id = tradeDayId(date, accountId);

  const traded = (d.traded === undefined) ? true : bool(d.traded, true);
  const pnl = traded ? usdRound(num(d.pnl, 0)) : 0;
  const trades = Math.max(0, Math.round(num(d.trades, 0)));
  const note = str(d.note);
  const tag = (d.tag === undefined || d.tag === null || d.tag === '') ? null : str(d.tag);
  const ts = nowISO();

  const i = indexById(db.trading.days, id);
  if (i !== -1) {
    const day = db.trading.days[i];
    day.accountId = accountId;
    day.date = date;
    day.traded = traded;
    day.pnl = pnl;
    day.trades = trades;
    day.note = note;
    day.tag = tag;
    day.currency = 'USD';
    day.updatedAt = ts;
    commit();
    return day;
  }

  const day = {
    id,
    accountId,
    date,
    pnl,
    currency: 'USD',
    trades,
    note,
    tag,
    traded,
    createdAt: ts,
    updatedAt: ts
  };
  db.trading.days.push(day);
  commit();
  return day;
}

export function deleteTradeDay(date, accountId) {
  const db = getDB();
  const id = tradeDayId(normDate(date), str(accountId));
  const i = indexById(db.trading.days, id);
  if (i === -1) return false;
  db.trading.days.splice(i, 1);
  commit();
  return true;
}

// getTradeDays(filters): {accountId,from,to,month}
export function getTradeDays(filters) {
  const db = getDB();
  filters = filters || {};

  const accountId = filters.accountId;
  const from = isISODate(filters.from) ? filters.from : null;
  const to = isISODate(filters.to) ? filters.to : null;
  const month = isMonthKey(filters.month) ? filters.month : null;

  const rows = [];
  const src = db.trading.days;
  for (let i = 0; i < src.length; i++) {
    const day = src[i];
    if (!day) continue;
    if (accountId && day.accountId !== accountId) continue;
    if (month && monthOf(day.date) !== month) continue;
    if (from && day.date < from) continue;
    if (to && day.date > to) continue;
    rows.push(day);
  }

  // Orden cronologico ascendente (util para equity); desempate por createdAt.
  rows.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.createdAt < b.createdAt) ? -1 : (a.createdAt > b.createdAt ? 1 : 0);
  });

  return rows;
}

/* ============================================================
 *  MOVIMIENTOS DE CAJA (depositos / retiros)
 * ============================================================ */

export function addTradingMovement(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('trm');
  const movement = {
    id,
    accountId: str(d.accountId),
    type: isTradingMovementType(d.type) ? d.type : 'deposit',
    amount: usdRound(Math.abs(num(d.amount, 0))),
    currency: 'USD',
    date: normDate(d.date),
    note: str(d.note),
    createdAt: nowISO()
  };
  db.trading.movements.push(movement);
  commit();
  return movement;
}

export function deleteTradingMovement(id) {
  const db = getDB();
  const i = indexById(db.trading.movements, id);
  if (i === -1) return false;
  db.trading.movements.splice(i, 1);
  commit();
  return true;
}

// getTradingMovements(filters): {accountId,from,to}
export function getTradingMovements(filters) {
  const db = getDB();
  filters = filters || {};

  const accountId = filters.accountId;
  const from = isISODate(filters.from) ? filters.from : null;
  const to = isISODate(filters.to) ? filters.to : null;

  const rows = [];
  const src = db.trading.movements;
  for (let i = 0; i < src.length; i++) {
    const m = src[i];
    if (!m) continue;
    if (accountId && m.accountId !== accountId) continue;
    if (from && m.date < from) continue;
    if (to && m.date > to) continue;
    rows.push(m);
  }

  rows.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt < b.createdAt) ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
  });

  return rows;
}
