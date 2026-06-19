// ============================================================================
// XAURA · js/core/aggregations.js
// Capa de cálculo analítico: KPIs y series para gráficos (SPEC §4.5, §6).
//
// PRINCIPIOS (SPEC §1, §11):
//  - Nada se persiste aquí: todo se recalcula desde xaura:db en cada llamada.
//  - Cero NaN, cero división por cero: TODOS los denominadores protegidos.
//    Convención de retorno cuando no hay base: number→0, ratio/%→null,
//    arrays→[], profitFactor→'∞' (sólo ganancias) o '—' (sin operaciones).
//  - COP enteros; USD a 2 decimales (roundMoney).
//  - Fórmulas de trading: §6.4 (equity con cashflow, drawdown sobre pico
//    ajustado por depósitos/retiros, profit factor con casos ∞ / —).
//
// Lee el DB en vivo (getDB) y los settings (tasa USD/COP) sin acoplarse a la
// capa CRUD: opera sobre las formas de datos canónicas (SPEC §4.3 / seed.js).
// ============================================================================

import { getDB } from './store.js';
import { roundMoney, num } from './schema.js';
import { getFxRate } from './settings.js';
import {
  hoy, monthKey, rangeForMonth, daysInMonth,
  startOfMonth, endOfMonth, addMonths, diffDays, parseLocalDate
} from './dates.js';

/* ============================================================================
 *  AYUDANTES INTERNOS
 * ========================================================================== */

const cop = (x) => roundMoney(x, 'COP');
const usd = (x) => roundMoney(x, 'USD');

// División protegida: devuelve `fallback` (null por defecto) si el denominador
// es 0 / no finito. Nunca produce NaN ni Infinity.
function safeDiv(numer, denom, fallback = null) {
  const a = num(numer, 0);
  const b = num(denom, 0);
  if (!isFinite(b) || b === 0) return fallback;
  const r = a / b;
  return isFinite(r) ? r : fallback;
}

// % protegido: (numer/denom)*100, o `fallback` si denom inválido.
function safePct(numer, denom, fallback = null) {
  const r = safeDiv(numer, denom, null);
  return r === null ? fallback : r * 100;
}

// Suma de un campo numérico sobre un arreglo.
function sumBy(arr, getter) {
  let acc = 0;
  for (let i = 0; i < arr.length; i++) acc += num(getter(arr[i]), 0);
  return acc;
}

// Comparador de fechas ISO 'YYYY-MM-DD' (orden lexicográfico = cronológico).
function byDateAsc(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

// ¿La fecha ISO `d` cae dentro de [from, to] (ambos inclusive, ISO o null)?
function inRange(d, from, to) {
  if (typeof d !== 'string') return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// Devuelve {from,to,key} del mes pedido o del mes en curso si no se indica.
function resolveMonth(month) {
  const key = (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month))
    ? month
    : monthKey(hoy());
  const r = rangeForMonth(key);
  return { key, from: r.from, to: r.to, year: r.year, month: r.month };
}

/* ============================================================================
 *  ACCESO A RAMAS DEL DB (defensivo)
 * ========================================================================== */
function P() {
  const db = getDB();
  return db.personal || { accounts: [], categories: [], transactions: [], budgets: [], goals: [] };
}
function E() {
  const db = getDB();
  return db.events || { events: [], incomes: [], costs: [] };
}
function T() {
  const db = getDB();
  return db.trading || { accounts: [], days: [], movements: [] };
}

// Transacciones NO archivadas/canceladas: en este modelo todas cuentan; sólo se
// excluyen transferencias cuando se pide (no son ingreso ni gasto real).
function realTxns({ type, excludeTransfers } = {}) {
  const all = P().transactions || [];
  return all.filter((t) => {
    if (!t) return false;
    if (excludeTransfers && t.type === 'transfer') return false;
    if (type && t.type !== type) return false;
    return true;
  });
}

/* ============================================================================
 *  PERSONAL
 * ========================================================================== */

/**
 * Suma de transacciones agrupada por categoría para un mes y tipo (kind).
 * @param {{month?:string, kind?:'income'|'expense'}} opts
 * @returns {Array<{categoryId,name,color,total,pct}>}  ordenado desc por total
 */
export function sumByCategory({ month, kind = 'expense' } = {}) {
  const { from, to } = resolveMonth(month);
  const cats = P().categories || [];
  const catById = new Map(cats.map((c) => [c.id, c]));

  const txns = realTxns({ type: kind, excludeTransfers: true })
    .filter((t) => inRange(t.date, from, to));

  const acc = new Map();
  let grand = 0;
  for (const t of txns) {
    const id = t.categoryId || '__sin__';
    const prev = acc.get(id) || 0;
    const v = num(t.amount, 0);
    acc.set(id, prev + v);
    grand += v;
  }

  const rows = [];
  for (const [id, total] of acc.entries()) {
    const c = catById.get(id);
    rows.push({
      categoryId: id === '__sin__' ? null : id,
      name: c ? c.name : 'Sin categoría',
      color: c ? c.color : '#6E6E78',
      total: cop(total),
      pct: safePct(total, grand, 0),
    });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

/**
 * Flujo de caja mensual de un año: 12 entradas {month,income,expense,net}.
 * `month` aquí es 1..12. Excluye transferencias.
 * @param {number} year
 */
export function monthlyCashflow(year) {
  const y = num(year, parseLocalDate(hoy()).getFullYear());
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const key = monthKey(y, m);
    const { from, to } = rangeForMonth(key);
    const inc = realTxns({ type: 'income', excludeTransfers: true })
      .filter((t) => inRange(t.date, from, to));
    const exp = realTxns({ type: 'expense', excludeTransfers: true })
      .filter((t) => inRange(t.date, from, to));
    const income = cop(sumBy(inc, (t) => t.amount));
    const expense = cop(sumBy(exp, (t) => t.amount));
    out.push({ month: m, key, income, expense, net: cop(income - expense) });
  }
  return out;
}

/**
 * Flujo de caja diario de un mes: una entrada por día con corte (1..D_mes).
 * Incluye `cumulative` (saldo neto acumulado dentro del mes).
 * @param {string} month  'YYYY-MM' (mes en curso por defecto)
 * @returns {Array<{day,date,income,expense,net,cumulative}>}
 */
export function dailyCashflow(month) {
  const { key, from, year, month: mo } = resolveMonth(month);
  const nDays = daysInMonth(year, mo);

  const inc = realTxns({ type: 'income', excludeTransfers: true })
    .filter((t) => monthKey(t.date) === key);
  const exp = realTxns({ type: 'expense', excludeTransfers: true })
    .filter((t) => monthKey(t.date) === key);

  const incByDay = new Map();
  const expByDay = new Map();
  for (const t of inc) {
    const d = parseLocalDate(t.date);
    if (!d) continue;
    const day = d.getDate();
    incByDay.set(day, (incByDay.get(day) || 0) + num(t.amount, 0));
  }
  for (const t of exp) {
    const d = parseLocalDate(t.date);
    if (!d) continue;
    const day = d.getDate();
    expByDay.set(day, (expByDay.get(day) || 0) + num(t.amount, 0));
  }

  const out = [];
  let cum = 0;
  const yPad = from.slice(0, 7); // 'YYYY-MM'
  for (let day = 1; day <= nDays; day++) {
    const income = cop(incByDay.get(day) || 0);
    const expense = cop(expByDay.get(day) || 0);
    const net = cop(income - expense);
    cum += net;
    out.push({
      day,
      date: yPad + '-' + String(day).padStart(2, '0'),
      income, expense, net,
      cumulative: cop(cum),
    });
  }
  return out;
}

/**
 * Presupuesto vs ejecutado por categoría de gasto para un mes.
 * Tope efectivo = override del mes (budgets) o category.monthlyBudget.
 * estado: ok (<80%) · alert (80–100%) · over (>100%).
 * @param {string} month
 * @returns {Array<{categoryId,name,color,budget,actual,pct,state}>}
 */
export function budgetVsActual(month) {
  const { key, from, to } = resolveMonth(month);
  const cats = (P().categories || []).filter((c) => c.kind === 'expense' && !c.archived);
  const budgets = (P().budgets || []).filter((b) => b.month === key);
  const budgetByCat = new Map(budgets.map((b) => [b.categoryId, num(b.amount, 0)]));

  const spent = new Map();
  const exp = realTxns({ type: 'expense', excludeTransfers: true })
    .filter((t) => inRange(t.date, from, to));
  for (const t of exp) {
    const id = t.categoryId || '__sin__';
    spent.set(id, (spent.get(id) || 0) + num(t.amount, 0));
  }

  const rows = [];
  for (const c of cats) {
    const budget = budgetByCat.has(c.id)
      ? budgetByCat.get(c.id)
      : num(c.monthlyBudget, 0);
    if (budget <= 0) continue; // sin tope definido → no entra al control
    const actual = spent.get(c.id) || 0;
    const pct = safePct(actual, budget, 0);
    let state = 'ok';
    if (pct > 100) state = 'over';
    else if (pct >= 80) state = 'alert';
    rows.push({
      categoryId: c.id, name: c.name, color: c.color,
      budget: cop(budget), actual: cop(actual),
      pct, state,
    });
  }
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

/**
 * Saldo de una cuenta personal: initialBalance + ingresos − gastos
 * + transferencias entrantes − transferencias salientes.
 * En una transferencia, la cuenta origen y destino comparten transferGroupId;
 * el monto en la cuenta destino es entrante, en la origen saliente. Como ambas
 * filas se registran por cuenta con su `accountId`, se interpretan así:
 *   - type 'transfer' en la cuenta que ENVÍA: resta (es la primera del grupo).
 *   - type 'transfer' en la cuenta que RECIBE: suma.
 * Para distinguir sentido sin un flag, se usa el orden del par por grupo.
 * @param {string} accountId
 * @returns {number} COP
 */
export function accountBalance(accountId) {
  const accs = P().accounts || [];
  const acc = accs.find((a) => a.id === accountId);
  if (!acc) return 0;
  let bal = num(acc.initialBalance, 0);

  const txns = P().transactions || [];

  // Ingresos / gastos directos de la cuenta.
  for (const t of txns) {
    if (t.accountId !== accountId) continue;
    if (t.type === 'income') bal += num(t.amount, 0);
    else if (t.type === 'expense') bal -= num(t.amount, 0);
  }

  // Transferencias: agrupar por transferGroupId; la primera fila del grupo
  // (por orden de id) es la cuenta ORIGEN (resta), la segunda DESTINO (suma).
  const groups = new Map();
  for (const t of txns) {
    if (t.type !== 'transfer' || !t.transferGroupId) continue;
    if (!groups.has(t.transferGroupId)) groups.set(t.transferGroupId, []);
    groups.get(t.transferGroupId).push(t);
  }
  for (const pair of groups.values()) {
    pair.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const from = pair[0];
    const to = pair[1];
    if (from && from.accountId === accountId) bal -= num(from.amount, 0);
    if (to && to.accountId === accountId) bal += num(to.amount, 0);
  }

  return cop(bal);
}

/**
 * Patrimonio personal = Σ saldos de todas las cuentas COP no archivadas.
 * @returns {number} COP
 */
export function netWorth() {
  const accs = (P().accounts || []).filter((a) => !a.archived);
  let total = 0;
  for (const a of accs) total += accountBalance(a.id);
  return cop(total);
}

/**
 * Progreso de una meta: {current,target,pct,eta,remaining,daysLeft}.
 * eta: fecha estimada (ISO) si hay ritmo de ahorro; null si no se puede estimar.
 * @param {string} goalId
 */
export function goalProgress(goalId) {
  const goals = P().goals || [];
  const g = goals.find((x) => x.id === goalId);
  if (!g) {
    return { current: 0, target: 0, pct: 0, remaining: 0, eta: null, daysLeft: null };
  }
  const current = num(g.currentAmount, 0);
  const target = num(g.targetAmount, 0);
  const pct = safePct(current, target, 0);
  const remaining = cop(Math.max(0, target - current));
  let daysLeft = null;
  if (g.deadline) daysLeft = diffDays(hoy(), g.deadline);
  return {
    current: cop(current),
    target: cop(target),
    pct: Math.min(100, pct === null ? 0 : pct),
    remaining,
    eta: g.deadline || null,
    daysLeft,
  };
}

/**
 * Mayores gastos del mes (transacciones individuales) ordenados desc.
 * @param {{month?:string, limit?:number}} opts
 * @returns {Array<{id,date,amount,note,categoryId,categoryName,color}>}
 */
export function topExpenses({ month, limit = 5 } = {}) {
  const { from, to } = resolveMonth(month);
  const cats = new Map((P().categories || []).map((c) => [c.id, c]));
  const exp = realTxns({ type: 'expense', excludeTransfers: true })
    .filter((t) => inRange(t.date, from, to))
    .slice()
    .sort((a, b) => num(b.amount, 0) - num(a.amount, 0));
  const n = Math.max(0, num(limit, 5) | 0);
  return exp.slice(0, n).map((t) => {
    const c = cats.get(t.categoryId);
    return {
      id: t.id,
      date: t.date,
      amount: cop(t.amount),
      note: t.note || '',
      categoryId: t.categoryId || null,
      categoryName: c ? c.name : 'Sin categoría',
      color: c ? c.color : '#6E6E78',
    };
  });
}

/**
 * Tasa de ahorro del mes = balance/ingresos × 100. null si no hay ingresos.
 * @param {string} month
 * @returns {{ingresos,gastos,balance,tasaAhorro}}
 */
export function savingsRate(month) {
  const { from, to } = resolveMonth(month);
  const ingresos = cop(sumBy(
    realTxns({ type: 'income', excludeTransfers: true }).filter((t) => inRange(t.date, from, to)),
    (t) => t.amount
  ));
  const gastos = cop(sumBy(
    realTxns({ type: 'expense', excludeTransfers: true }).filter((t) => inRange(t.date, from, to)),
    (t) => t.amount
  ));
  const balance = cop(ingresos - gastos);
  return {
    ingresos, gastos, balance,
    tasaAhorro: safePct(balance, ingresos, null), // % o null si ingresos=0
  };
}

/**
 * Comparación del mes vs mes anterior: actual, anterior y delta (Δ absoluto y %).
 * @param {string} month
 * @returns {{actual,anterior,delta}}  cada uno con {ingresos,gastos,balance,tasaAhorro}
 */
export function monthCompare(month) {
  const cur = resolveMonth(month);
  const prevKey = monthKey(addMonths(cur.from, -1));
  const actual = savingsRate(cur.key);
  const anterior = savingsRate(prevKey);

  const delta = {
    ingresos: cop(actual.ingresos - anterior.ingresos),
    gastos: cop(actual.gastos - anterior.gastos),
    balance: cop(actual.balance - anterior.balance),
    // Variación % de gasto vs mes anterior (denominador protegido).
    gastosPct: safePct(actual.gastos - anterior.gastos, anterior.gastos, null),
    ingresosPct: safePct(actual.ingresos - anterior.ingresos, anterior.ingresos, null),
  };
  return { actual, anterior, delta };
}

/* ============================================================================
 *  EVENTOS
 * ========================================================================== */

// Suma de abonos (incomes) de un evento.
function eventTotalAbonado(eventId) {
  const incs = (E().incomes || []).filter((i) => i.eventId === eventId);
  return sumBy(incs, (i) => i.amount);
}

// Suma de costos de un evento.
function eventTotalCostos(eventId) {
  const costs = (E().costs || []).filter((c) => c.eventId === eventId);
  return sumBy(costs, (c) => c.amount);
}

/**
 * P&L de un evento (SPEC §6.3): utilidad = quotedAmount − Σcostos.
 * @param {string} eventId
 * @returns {{income,cost,profit,margin,pctCobrado,saldoPendiente,costoPorPersona,totalAbonado}}
 */
export function eventPL(eventId) {
  const ev = (E().events || []).find((e) => e.id === eventId);
  if (!ev) {
    return {
      income: 0, cost: 0, profit: 0, margin: null,
      pctCobrado: null, saldoPendiente: 0, costoPorPersona: null, totalAbonado: 0,
    };
  }
  const income = num(ev.quotedAmount, 0);
  const cost = eventTotalCostos(eventId);
  const profit = cop(income - cost);
  const abonado = eventTotalAbonado(eventId);
  const guests = num(ev.guests, 0);
  return {
    income: cop(income),
    cost: cop(cost),
    profit,
    margin: safePct(income - cost, income, null),       // null si quoted=0
    totalAbonado: cop(abonado),
    pctCobrado: safePct(abonado, income, null),          // null si quoted=0
    saldoPendiente: cop(Math.max(0, income - abonado)),
    costoPorPersona: guests > 0 ? cop(cost / guests) : null,
  };
}

/**
 * Embudo de pipeline: conteo y monto cotizado por estado (orden de embudo).
 * @returns {Array<{status,label,count,amount}>}
 */
export function eventsPipeline() {
  const ORDER = ['cotizado', 'confirmado', 'realizado', 'pagado', 'cancelado'];
  const LABELS = {
    cotizado: 'Cotizado', confirmado: 'Confirmado', realizado: 'Realizado',
    pagado: 'Pagado', cancelado: 'Cancelado',
  };
  const evs = E().events || [];
  const byStatus = new Map(ORDER.map((s) => [s, { count: 0, amount: 0 }]));
  for (const e of evs) {
    const s = e.status;
    if (!byStatus.has(s)) byStatus.set(s, { count: 0, amount: 0 });
    const slot = byStatus.get(s);
    slot.count += 1;
    slot.amount += num(e.quotedAmount, 0);
  }
  return ORDER.map((s) => ({
    status: s,
    label: LABELS[s] || s,
    count: byStatus.get(s).count,
    amount: cop(byStatus.get(s).amount),
  }));
}

/**
 * Ingresos/costos/utilidad de eventos agrupados por mes en un rango.
 * Se imputa por eventDate del evento. income = quotedAmount, cost = Σcostos.
 * @param {{from?:string,to?:string,groupBy?:'month'}} opts
 * @returns {Array<{month,key,income,cost,profit}>}
 */
export function eventsRevenue({ from, to, groupBy = 'month' } = {}) {
  const evs = E().events || [];
  const costs = E().costs || [];

  // Mapa de costos por evento (una pasada).
  const costByEvent = new Map();
  for (const c of costs) {
    costByEvent.set(c.eventId, (costByEvent.get(c.eventId) || 0) + num(c.amount, 0));
  }

  const acc = new Map(); // key 'YYYY-MM' -> {income,cost}
  for (const e of evs) {
    if (e.status === 'cancelado') continue;
    if (!e.eventDate) continue;
    if (!inRange(e.eventDate, from, to)) continue;
    const key = monthKey(e.eventDate);
    if (!acc.has(key)) acc.set(key, { income: 0, cost: 0 });
    const slot = acc.get(key);
    slot.income += num(e.quotedAmount, 0);
    slot.cost += costByEvent.get(e.id) || 0;
  }

  const keys = Array.from(acc.keys()).sort();
  return keys.map((key) => {
    const s = acc.get(key);
    return {
      key,
      month: key,
      income: cop(s.income),
      cost: cop(s.cost),
      profit: cop(s.income - s.cost),
    };
  });
}

/**
 * Cuentas por cobrar: eventos {confirmado, realizado} con saldo>0.
 * Vencido = eventDate < hoy y aún con saldo.
 * @returns {{total, rows:[{eventId,cliente,nombre,fecha,valor,abonado,saldo,pctCobrado,vencido,phone}]}}
 */
export function accountsReceivable() {
  const evs = (E().events || []).filter(
    (e) => e.status === 'confirmado' || e.status === 'realizado'
  );
  const today = hoy();
  const rows = [];
  let total = 0;
  for (const e of evs) {
    const valor = num(e.quotedAmount, 0);
    const abonado = eventTotalAbonado(e.id);
    const saldo = valor - abonado;
    if (saldo <= 0) continue;
    total += saldo;
    rows.push({
      eventId: e.id,
      cliente: (e.client && e.client.name) || '',
      nombre: e.name || '',
      fecha: e.eventDate || '',
      valor: cop(valor),
      abonado: cop(abonado),
      saldo: cop(saldo),
      pctCobrado: safePct(abonado, valor, 0),
      vencido: !!(e.eventDate && e.eventDate < today),
      phone: (e.client && e.client.phone) || '',
    });
  }
  // Vencidos primero, luego por fecha ascendente.
  rows.sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
    return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
  });
  return { total: cop(total), rows };
}

/**
 * Utilidad por tipo de evento en un rango (imputada por eventDate).
 * @param {{from?:string,to?:string}} opts
 * @returns {Array<{eventType,label,income,cost,profit,count,pct}>}
 */
export function profitByEventType({ from, to } = {}) {
  const LABELS = {
    boda: 'Boda', corporativo: 'Corporativo', cumpleanos: 'Cumpleaños',
    quinceanera: 'Quinceañera', grado: 'Grado', aniversario: 'Aniversario',
    social: 'Social', otro: 'Otro',
  };
  const evs = E().events || [];
  const costs = E().costs || [];
  const costByEvent = new Map();
  for (const c of costs) {
    costByEvent.set(c.eventId, (costByEvent.get(c.eventId) || 0) + num(c.amount, 0));
  }
  const acc = new Map();
  let grandProfit = 0;
  for (const e of evs) {
    if (e.status === 'cancelado') continue;
    if (!inRange(e.eventDate, from, to)) continue;
    const t = e.eventType || 'otro';
    if (!acc.has(t)) acc.set(t, { income: 0, cost: 0, count: 0 });
    const slot = acc.get(t);
    const inc = num(e.quotedAmount, 0);
    const cst = costByEvent.get(e.id) || 0;
    slot.income += inc;
    slot.cost += cst;
    slot.count += 1;
    grandProfit += inc - cst;
  }
  const rows = [];
  for (const [t, s] of acc.entries()) {
    const profit = s.income - s.cost;
    rows.push({
      eventType: t,
      label: LABELS[t] || t,
      income: cop(s.income),
      cost: cop(s.cost),
      profit: cop(profit),
      count: s.count,
      pct: safePct(profit, grandProfit, 0),
    });
  }
  rows.sort((a, b) => b.profit - a.profit);
  return rows;
}

/**
 * Costos por categoría (las 9 canónicas) en un rango. Se imputa por fecha de
 * costo si está en rango; si no se pasa rango, todos.
 * @param {{from?:string,to?:string}} opts
 * @returns {Array<{category,label,total,pct}>}
 */
export function costsByCategory({ from, to } = {}) {
  const LABELS = {
    lugar: 'Lugar', catering: 'Catering', decoracion: 'Decoración',
    sonido: 'Sonido', fotografia: 'Fotografía', personal: 'Personal',
    transporte: 'Transporte', papeleria: 'Papelería', imprevistos: 'Imprevistos',
  };
  const costs = E().costs || [];
  const acc = new Map();
  let grand = 0;
  for (const c of costs) {
    if ((from || to) && !inRange(c.date, from, to)) continue;
    const cat = c.category || 'imprevistos';
    const v = num(c.amount, 0);
    acc.set(cat, (acc.get(cat) || 0) + v);
    grand += v;
  }
  const rows = [];
  for (const [cat, total] of acc.entries()) {
    rows.push({
      category: cat,
      label: LABELS[cat] || cat,
      total: cop(total),
      pct: safePct(total, grand, 0),
    });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

/**
 * Ranking de eventos por rentabilidad o margen en un rango.
 * @param {{from?:string,to?:string,sort?:'profit'|'margin'}} opts
 * @returns {Array<{eventId,name,cliente,eventType,income,cost,profit,margin}>}
 */
export function eventRanking({ from, to, sort = 'profit' } = {}) {
  const evs = (E().events || []).filter((e) => {
    if (e.status === 'cancelado') return false;
    if ((from || to) && !inRange(e.eventDate, from, to)) return false;
    return true;
  });
  const rows = evs.map((e) => {
    const income = num(e.quotedAmount, 0);
    const cost = eventTotalCostos(e.id);
    const profit = income - cost;
    return {
      eventId: e.id,
      name: e.name || '',
      cliente: (e.client && e.client.name) || '',
      eventType: e.eventType || 'otro',
      income: cop(income),
      cost: cop(cost),
      profit: cop(profit),
      margin: safePct(profit, income, null),
    };
  });
  if (sort === 'margin') {
    // null (sin base) al final.
    rows.sort((a, b) => {
      const ma = a.margin === null ? -Infinity : a.margin;
      const mb = b.margin === null ? -Infinity : b.margin;
      return mb - ma;
    });
  } else {
    rows.sort((a, b) => b.profit - a.profit);
  }
  return rows;
}

/**
 * Próximos eventos (eventDate >= hoy, no cancelados) ordenados por fecha.
 * @param {number} [limit]
 * @returns {Array<{eventId,name,cliente,eventType,eventDate,hora,venue,ciudad,status,quotedAmount,daysLeft}>}
 */
export function upcomingEvents(limit) {
  const today = hoy();
  const evs = (E().events || [])
    .filter((e) => e.status !== 'cancelado' && e.eventDate && e.eventDate >= today)
    .slice()
    .sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));
  const list = (limit === undefined || limit === null)
    ? evs
    : evs.slice(0, Math.max(0, num(limit, 0) | 0));
  return list.map((e) => ({
    eventId: e.id,
    name: e.name || '',
    cliente: (e.client && e.client.name) || '',
    eventType: e.eventType || 'otro',
    eventDate: e.eventDate,
    hora: e.hora || null,
    venue: e.venue || '',
    ciudad: e.ciudad || null,
    status: e.status,
    quotedAmount: cop(e.quotedAmount),
    daysLeft: diffDays(today, e.eventDate),
  }));
}

/**
 * P&L de eventos del mes (convención SPEC §6.3): eventos con eventDate ∈ mes
 * y estado ∈ {realizado, pagado}. Devuelve agregados + recaudado del mes.
 * @param {string} month
 * @returns {{ingresos,costos,utilidad,margen,nEventos,ticketPromedio,recaudadoMes,costoPorPersona}}
 */
export function monthlyEventsPL(month) {
  const { key, from, to } = resolveMonth(month);
  const evs = (E().events || []).filter(
    (e) => monthKey(e.eventDate) === key &&
           (e.status === 'realizado' || e.status === 'pagado')
  );
  let ingresos = 0, costos = 0, guests = 0;
  for (const e of evs) {
    ingresos += num(e.quotedAmount, 0);
    costos += eventTotalCostos(e.id);
    guests += num(e.guests, 0);
  }
  const utilidad = ingresos - costos;
  const n = evs.length;

  // Recaudado del mes = Σ abonos con date ∈ mes (de cualquier evento).
  const recaudadoMes = cop(sumBy(
    (E().incomes || []).filter((i) => inRange(i.date, from, to)),
    (i) => i.amount
  ));

  return {
    ingresos: cop(ingresos),
    costos: cop(costos),
    utilidad: cop(utilidad),
    margen: safePct(utilidad, ingresos, null),
    nEventos: n,
    ticketPromedio: n > 0 ? cop(ingresos / n) : 0,
    recaudadoMes,
    costoPorPersona: guests > 0 ? cop(costos / guests) : null,
  };
}

/* ============================================================================
 *  TRADING  (SPEC §6.4 — fórmulas exactas)
 * ========================================================================== */

// Cuenta de trading por id (o la primera no archivada si no se especifica).
function resolveTradingAccount(accountId) {
  const accs = T().accounts || [];
  if (accountId) return accs.find((a) => a.id === accountId) || null;
  const active = accs.filter((a) => !a.archived);
  return active[0] || accs[0] || null;
}

// Días traded:true de una cuenta dentro de [from,to], ordenados por fecha.
function tradedDaysOf(accountId, from, to) {
  return (T().days || [])
    .filter((d) => d.accountId === accountId && d.traded === true)
    .filter((d) => inRange(d.date, from, to))
    .slice()
    .sort(byDateAsc);
}

// Movimientos de caja de una cuenta dentro de [from,to], ordenados por fecha.
function movementsOf(accountId, from, to) {
  return (T().movements || [])
    .filter((m) => m.accountId === accountId)
    .filter((m) => inRange(m.date, from, to))
    .slice()
    .sort(byDateAsc);
}

/**
 * Balance actual de una cuenta de trading (USD), SPEC §6.4:
 *   B0 = (hay deposits) ? 0 : settings/cuenta.initialBalance
 *   currentBalance = B0 + Σdeposits − Σwithdrawals + Σpnl
 * @param {string} [accountId]
 * @returns {number} USD
 */
export function tradingBalance(accountId) {
  const acc = resolveTradingAccount(accountId);
  if (!acc) return 0;
  const id = acc.id;

  const movs = (T().movements || []).filter((m) => m.accountId === id);
  const deposits = movs.filter((m) => m.type === 'deposit');
  const withdrawals = movs.filter((m) => m.type === 'withdrawal');
  const sumDep = sumBy(deposits, (m) => m.amount);
  const sumWd = sumBy(withdrawals, (m) => m.amount);

  // B0: si hay depósitos, el capital base proviene de ellos (initialBalance=0).
  const B0 = deposits.length > 0 ? 0 : num(acc.initialBalance, 0);

  const pnl = sumBy(
    (T().days || []).filter((d) => d.accountId === id && d.traded === true),
    (d) => d.pnl
  );

  return usd(B0 + sumDep - sumWd + pnl);
}

/**
 * Estadísticas completas de trading (SPEC §6.4 y tarjetas §6.4).
 * Todos los ratios protegen denominador: winRate/payoff/cv → null si no aplica;
 * profitFactor → '∞' (sólo ganancias), '—' (sin operaciones netas), o número.
 * @param {{accountId?:string,from?:string,to?:string}} opts
 */
export function tradingStats({ accountId, from, to } = {}) {
  const acc = resolveTradingAccount(accountId);
  const empty = {
    accountId: acc ? acc.id : null,
    totalPnl: 0, baseCapital: 0, currentBalance: 0,
    returnPct: null, tradedDays: 0, greenDays: 0, redDays: 0, flatDays: 0,
    winRate: null, avgGreen: 0, avgRed: 0, payoff: null,
    grossProfit: 0, grossLoss: 0, profitFactor: '—',
    maxDD: 0, maxDDPct: null, currentDD: 0, currentDDPct: null,
    bestDay: null, worstDay: null,
    currentStreak: 0, maxGreenStreak: 0, maxRedStreak: 0,
    sigma: null, cv: null, mean: 0,
  };
  if (!acc) return empty;
  const id = acc.id;

  const days = tradedDaysOf(id, from, to);

  // Capital base: B0 + Σdeposits (SPEC §6.4). Para returnPct se usa el rango
  // total de la cuenta; se respeta from/to para movimientos también.
  const movsAll = (T().movements || []).filter((m) => m.accountId === id);
  const depsAll = movsAll.filter((m) => m.type === 'deposit');
  const B0 = depsAll.length > 0 ? 0 : num(acc.initialBalance, 0);
  const sumDepAll = sumBy(depsAll, (m) => m.amount);
  const baseCapital = usd(B0 + sumDepAll);

  // Conteos y sumas por color.
  let greenDays = 0, redDays = 0, flatDays = 0;
  let grossProfit = 0, grossLoss = 0; // grossLoss positivo (magnitud)
  let bestDay = null, worstDay = null;
  for (const d of days) {
    const p = num(d.pnl, 0);
    if (p > 0) { greenDays++; grossProfit += p; }
    else if (p < 0) { redDays++; grossLoss += -p; }
    else { flatDays++; }
    if (bestDay === null || p > bestDay.pnl) bestDay = { date: d.date, pnl: usd(p), tag: d.tag || null };
    if (worstDay === null || p < worstDay.pnl) worstDay = { date: d.date, pnl: usd(p), tag: d.tag || null };
  }
  const tradedDays = days.length;
  const totalPnl = usd(grossProfit - grossLoss);

  // returnPct = totalPnl / baseCapital × 100  (null si baseCapital=0)
  const returnPct = safePct(totalPnl, baseCapital, null);

  // winRate = greenDays / (greenDays+redDays+flatDays) × 100
  const denomWin = greenDays + redDays + flatDays;
  const winRate = safePct(greenDays, denomWin, null);

  // Promedios y payoff.
  const avgGreen = greenDays > 0 ? usd(grossProfit / greenDays) : 0;
  const avgRed = redDays > 0 ? usd(grossLoss / redDays) : 0; // magnitud (positivo)
  const payoff = avgRed > 0 ? safeDiv(avgGreen, avgRed, null) : null;

  // profitFactor = grossProfit / grossLoss  (∞ si grossLoss=0 y grossProfit>0;
  // '—' si ambos 0). Si hay pérdidas, número.
  let profitFactor;
  if (grossLoss === 0 && grossProfit === 0) profitFactor = '—';
  else if (grossLoss === 0) profitFactor = '∞';
  else profitFactor = grossProfit / grossLoss;

  // Rachas (sobre la secuencia de días traded ordenada por fecha).
  let currentStreak = 0, maxGreenStreak = 0, maxRedStreak = 0;
  let runColor = 0, runLen = 0;
  for (const d of days) {
    const p = num(d.pnl, 0);
    const color = p > 0 ? 1 : p < 0 ? -1 : 0;
    if (color === 0) { runColor = 0; runLen = 0; continue; }
    if (color === runColor) runLen++;
    else { runColor = color; runLen = 1; }
    if (color === 1 && runLen > maxGreenStreak) maxGreenStreak = runLen;
    if (color === -1 && runLen > maxRedStreak) maxRedStreak = runLen;
  }
  // Racha actual (signo + magnitud) tomada desde el final.
  for (let i = days.length - 1; i >= 0; i--) {
    const p = num(days[i].pnl, 0);
    const color = p > 0 ? 1 : p < 0 ? -1 : 0;
    if (i === days.length - 1) {
      if (color === 0) { currentStreak = 0; break; }
      currentStreak = color; // ±1, se incrementa magnitud abajo
      continue;
    }
    const sign = currentStreak > 0 ? 1 : -1;
    if (color === sign) currentStreak += sign;
    else break;
  }

  // Drawdown sobre la curva de equity CON cashflow (SPEC §6.4):
  //   equity_i   = equity_{i-1} + signedCashFlow_i + pnl_i
  //   peak       += signedCashFlow_i  (el aporte/retiro mueve el pico de
  //                 referencia, así un depósito no se cuenta como recuperación
  //                 ni un retiro como drawdown)
  //   drawdown_i = peak_i − equity_i
  // Como la equity 'full' ya incluye el cashflow, al sumar el mismo cashflow al
  // pico ambos se cancelan en los días de aporte: no generan drawdown espurio.
  // Secuencia por punto: (1) mover el pico por el cashFlow del día, (2) elevar
  // el pico si la equity superó el máximo, (3) medir el drawdown.
  const eq = equityCurve({ accountId: id, from, to, mode: 'full' });
  let peak = eq.base;            // arranca en el capital base (B0)
  let maxDD = 0, peakAtMax = peak;
  for (const pt of eq.points) {
    peak += pt.cashFlow;                     // (1)
    if (pt.equity > peak) peak = pt.equity;  // (2)
    const dd = peak - pt.equity;             // (3)
    if (dd > maxDD) { maxDD = dd; peakAtMax = peak; }
  }
  if (!isFinite(peak)) peak = 0;
  const lastEquity = eq.points.length ? eq.points[eq.points.length - 1].equity : 0;
  const currentDD = usd(Math.max(0, peak - lastEquity));
  const maxDDr = usd(Math.max(0, maxDD));
  const maxDDPct = peakAtMax > 0 ? safePct(maxDDr, peakAtMax, null) : (maxDDr === 0 ? 0 : null);
  const currentDDPct = peak > 0 ? safePct(currentDD, peak, null) : (currentDD === 0 ? 0 : null);

  // Volatilidad: σ poblacional de pnl diario (días traded), cv = σ/|media|.
  let sigma = null, cv = null, mean = 0;
  if (tradedDays > 0) {
    mean = totalPnl / tradedDays;
    let acc2 = 0;
    for (const d of days) {
      const diff = num(d.pnl, 0) - mean;
      acc2 += diff * diff;
    }
    sigma = Math.sqrt(acc2 / tradedDays);
    cv = Math.abs(mean) > 0 ? sigma / Math.abs(mean) : null;
    sigma = usd(sigma);
  }

  // currentBalance = B0 + Σdep − Σwd + totalPnl (SPEC §6.4).
  const sumWdAll = sumBy(movsAll.filter((m) => m.type === 'withdrawal'), (m) => m.amount);
  const balanceClean = usd(B0 + sumDepAll - sumWdAll + totalPnl);

  return {
    accountId: id,
    totalPnl,
    baseCapital,
    currentBalance: balanceClean,
    returnPct,
    tradedDays, greenDays, redDays, flatDays,
    winRate,
    avgGreen, avgRed,
    payoff: payoff === null ? null : Math.round(payoff * 100) / 100,
    grossProfit: usd(grossProfit),
    grossLoss: usd(grossLoss),
    profitFactor: typeof profitFactor === 'number'
      ? Math.round(profitFactor * 100) / 100
      : profitFactor,
    maxDD: maxDDr,
    maxDDPct,
    currentDD,
    currentDDPct,
    bestDay, worstDay,
    currentStreak, maxGreenStreak, maxRedStreak,
    sigma, cv: cv === null ? null : Math.round(cv * 1000) / 1000,
    mean: usd(mean),
  };
}

/**
 * Curva de equity (SPEC §6.4). Combina movimientos de caja y P&L diario en una
 * línea temporal ordenada. mode 'full' incluye depósitos/retiros en la equity;
 * mode 'trading' grafica sólo el efecto del P&L partiendo del capital base
 * (los movimientos sólo desplazan el pico de referencia, vía cashFlow).
 *
 * @param {{accountId?:string,from?:string,to?:string,mode?:'full'|'trading'}} opts
 * @returns {{points:Array<{date,equity,pnl,cashFlow}>, peak:{date,equity}|null, base:number}}
 */
export function equityCurve({ accountId, from, to, mode = 'full' } = {}) {
  const acc = resolveTradingAccount(accountId);
  if (!acc) return { points: [], peak: null, base: 0 };
  const id = acc.id;

  const movs = movementsOf(id, from, to);
  const days = tradedDaysOf(id, from, to);

  // Capital base inicial (antes del primer evento del rango).
  const depsAll = (T().movements || []).filter((m) => m.accountId === id && m.type === 'deposit');
  const B0 = depsAll.length > 0 ? 0 : num(acc.initialBalance, 0);

  // Fusiona eventos por fecha. Cada fecha agrega su cashFlow (dep − wd) y su pnl.
  const byDate = new Map();
  function slot(date) {
    if (!byDate.has(date)) byDate.set(date, { date, cashFlow: 0, pnl: 0 });
    return byDate.get(date);
  }
  for (const m of movs) {
    const s = slot(m.date);
    s.cashFlow += (m.type === 'deposit' ? 1 : -1) * num(m.amount, 0);
  }
  for (const d of days) {
    const s = slot(d.date);
    s.pnl += num(d.pnl, 0);
  }

  const dates = Array.from(byDate.keys()).sort();
  const points = [];
  let equity = B0;
  let peak = null;
  for (const date of dates) {
    const s = byDate.get(date);
    if (mode === 'full') {
      equity += s.cashFlow + s.pnl;
    } else {
      // 'trading': la equity sólo refleja P&L; el cashFlow se reporta aparte
      // para que el consumidor (drawdown) ajuste el pico sin inflar ganancias.
      equity += s.pnl;
    }
    const pt = { date, equity: usd(equity), pnl: usd(s.pnl), cashFlow: usd(s.cashFlow) };
    points.push(pt);
    if (peak === null || pt.equity > peak.equity) peak = { date, equity: pt.equity };
  }

  return { points, peak, base: usd(B0) };
}

/**
 * Calendario de P&L de un mes para una cuenta. Incluye TODOS los días del mes
 * (con pnl 0 y traded:false donde no hay registro) para pintar heatmap/calendario.
 * @param {{accountId?:string,month?:string}} opts
 * @returns {Array<{date,day,pnl,traded,tag}>}
 */
export function pnlCalendar({ accountId, month } = {}) {
  const acc = resolveTradingAccount(accountId);
  const { key, year, month: mo } = resolveMonth(month);
  const nDays = daysInMonth(year, mo);
  const yPad = key; // 'YYYY-MM'

  const byDate = new Map();
  if (acc) {
    for (const d of (T().days || [])) {
      if (d.accountId !== acc.id) continue;
      if (monthKey(d.date) !== key) continue;
      byDate.set(d.date, d);
    }
  }

  const out = [];
  for (let day = 1; day <= nDays; day++) {
    const date = yPad + '-' + String(day).padStart(2, '0');
    const rec = byDate.get(date);
    out.push({
      date, day,
      pnl: rec ? usd(rec.pnl) : 0,
      traded: rec ? !!rec.traded : false,
      tag: rec ? (rec.tag || null) : null,
    });
  }
  return out;
}

/**
 * Distribución (histograma) de P&L diario en bins. Sólo días traded.
 * Usa bins de ancho fijo derivados del rango; centra el 0 cuando hay positivos
 * y negativos. Devuelve también media y mediana para las líneas guía.
 * @param {{accountId?:string,from?:string,to?:string,bins?:number}} opts
 * @returns {{bins:Array<{binLabel,count,from,to}>, mean,median,min,max}}
 */
export function pnlDistribution({ accountId, from, to, bins = 7 } = {}) {
  const acc = resolveTradingAccount(accountId);
  if (!acc) return { bins: [], mean: 0, median: 0, min: 0, max: 0 };

  const days = tradedDaysOf(acc.id, from, to);
  const values = days.map((d) => num(d.pnl, 0));
  if (values.length === 0) return { bins: [], mean: 0, median: 0, min: 0, max: 0 };

  let min = Math.min(...values);
  let max = Math.max(...values);
  const n = Math.max(1, num(bins, 7) | 0);

  // Evita rango cero (todos iguales): crea una banda artificial.
  if (min === max) { min -= 1; max += 1; }

  const width = (max - min) / n;
  const binsArr = [];
  for (let i = 0; i < n; i++) {
    const bFrom = min + i * width;
    const bTo = i === n - 1 ? max : min + (i + 1) * width;
    binsArr.push({ from: usd(bFrom), to: usd(bTo), count: 0 });
  }
  for (const v of values) {
    let idx = width > 0 ? Math.floor((v - min) / width) : 0;
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    binsArr[idx].count += 1;
  }

  const labeled = binsArr.map((b) => ({
    binLabel: fmtBinLabel(b.from, b.to),
    count: b.count,
    from: b.from,
    to: b.to,
  }));

  const mean = usd(values.reduce((a, b) => a + b, 0) / values.length);
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = usd(sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]);

  return { bins: labeled, mean, median, min: usd(min), max: usd(max) };
}

// Etiqueta compacta de bin para ejes (sin moneda; el eje la añade).
function fmtBinLabel(a, b) {
  const r = (x) => {
    const v = Math.round(x);
    return Math.abs(v) >= 1000
      ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      : String(v);
  };
  return r(a) + '…' + r(b);
}

/**
 * P&L mensual de un año para una cuenta: 12×{month,pnl,returnPct}.
 * returnPctMes = pnlMes / balanceInicioMes × 100 (denominador protegido).
 * balanceInicioMes = balance acumulado (con cashflow) hasta el cierre del mes
 * anterior; null si es 0.
 * @param {string} accountId
 * @param {number} year
 */
export function monthlyPnl(accountId, year) {
  const acc = resolveTradingAccount(accountId);
  if (!acc) {
    return Array.from({ length: 12 }, (_v, i) => ({ month: i + 1, key: '', pnl: 0, returnPct: null }));
  }
  const id = acc.id;
  const y = num(year, parseLocalDate(hoy()).getFullYear());

  const depsAll = (T().movements || []).filter((m) => m.accountId === id && m.type === 'deposit');
  const B0 = depsAll.length > 0 ? 0 : num(acc.initialBalance, 0);

  // Balance acumulado al inicio de cada mes: recorre cronológicamente todo el
  // historial previo al primer día del mes objetivo.
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const key = monthKey(y, m);
    const from = startOfMonth(key + '-01');
    const to = endOfMonth(key + '-01');

    // pnl del mes (días traded del mes).
    const pnlMes = sumBy(
      (T().days || []).filter((d) => d.accountId === id && d.traded === true && monthKey(d.date) === key),
      (d) => d.pnl
    );

    // balance al inicio del mes = B0 + (deps − wd) + Σpnl, todo con date < from.
    let balInicio = B0;
    for (const mv of (T().movements || [])) {
      if (mv.accountId !== id) continue;
      if (mv.date >= from) continue;
      balInicio += (mv.type === 'deposit' ? 1 : -1) * num(mv.amount, 0);
    }
    for (const d of (T().days || [])) {
      if (d.accountId !== id || d.traded !== true) continue;
      if (d.date >= from) continue;
      balInicio += num(d.pnl, 0);
    }

    out.push({
      month: m,
      key,
      pnl: usd(pnlMes),
      returnPct: safePct(pnlMes, balInicio, null), // null si balInicio=0
    });
  }
  return out;
}

/**
 * Consistencia de trading (SPEC §6.4): meses verdes, σ, cv y score.
 * score = clamp(100×(0.5·winRate/100 + 0.3·min(PF/3,1) + 0.2·mesesVerdes/mesesTotales),0,100)
 * @param {string} [accountId]
 * @returns {{monthsGreen,monthsTotal,sigma,cv,score,winRate,profitFactor}}
 */
export function tradingConsistency(accountId) {
  const acc = resolveTradingAccount(accountId);
  if (!acc) return { monthsGreen: 0, monthsTotal: 0, sigma: null, cv: null, score: 0, winRate: null, profitFactor: '—' };
  const id = acc.id;

  // Agrupa pnl por mes (todos los meses con actividad traded).
  const byMonth = new Map();
  for (const d of (T().days || [])) {
    if (d.accountId !== id || d.traded !== true) continue;
    const k = monthKey(d.date);
    byMonth.set(k, (byMonth.get(k) || 0) + num(d.pnl, 0));
  }
  const monthsTotal = byMonth.size;
  let monthsGreen = 0;
  for (const v of byMonth.values()) if (v > 0) monthsGreen++;

  // Métricas globales (todo el historial de la cuenta).
  const stats = tradingStats({ accountId: id });
  const sigma = stats.sigma;
  const cv = stats.cv;
  const winRate = stats.winRate;          // % o null
  const pfRaw = stats.profitFactor;       // número | '∞' | '—'

  // Términos del score, protegidos.
  const wTerm = winRate === null ? 0 : (winRate / 100); // 0..1
  let pfTerm;
  if (pfRaw === '∞') pfTerm = 1;          // sólo ganancias → término al máximo
  else if (pfRaw === '—') pfTerm = 0;     // sin operaciones → 0
  else pfTerm = Math.min(num(pfRaw, 0) / 3, 1);
  const mTerm = safeDiv(monthsGreen, monthsTotal, 0); // 0..1

  let score = 100 * (0.5 * wTerm + 0.3 * pfTerm + 0.2 * mTerm);
  score = Math.max(0, Math.min(100, score));

  return {
    monthsGreen,
    monthsTotal,
    sigma,
    cv,
    score: Math.round(score),
    winRate,
    profitFactor: pfRaw,
  };
}

/* ============================================================================
 *  CONSOLIDADO
 * ========================================================================== */

/**
 * Foto global del patrimonio (SPEC §6.1, §8). Normaliza trading a COP con la
 * tasa vigente. eventsProfit = utilidad acumulada de eventos no cancelados.
 * @returns {{personalNet,eventsProfit,tradingBalanceUsd,tradingBalanceCop,totalCop,fxRate}}
 */
export function globalSnapshot() {
  const personalNet = netWorth();

  // Utilidad de eventos: Σ (quotedAmount − Σcostos) de eventos no cancelados.
  const evs = (E().events || []).filter((e) => e.status !== 'cancelado');
  let eventsProfit = 0;
  for (const e of evs) {
    eventsProfit += num(e.quotedAmount, 0) - eventTotalCostos(e.id);
  }
  eventsProfit = cop(eventsProfit);

  // Balance de trading sumando todas las cuentas no archivadas.
  const accs = (T().accounts || []).filter((a) => !a.archived);
  let tradingUsd = 0;
  for (const a of accs) tradingUsd += tradingBalance(a.id);
  tradingUsd = usd(tradingUsd);

  const fxRate = getFxRate();
  const tradingBalanceCop = cop(tradingUsd * fxRate);
  const totalCop = cop(personalNet + eventsProfit + tradingBalanceCop);

  return {
    personalNet,
    eventsProfit,
    tradingBalanceUsd: tradingUsd,
    tradingBalanceCop,
    totalCop,
    fxRate,
  };
}

/**
 * Foto de HOY (SPEC §6.1): ingresos/gastos COP del día y P&L de trading USD.
 * @returns {{ingresosCop,gastosCop,tradingUsd,balanceDiaCop}}
 */
export function todaySnapshot() {
  const today = hoy();

  const ingresosCop = cop(sumBy(
    realTxns({ type: 'income', excludeTransfers: true }).filter((t) => t.date === today),
    (t) => t.amount
  ));
  const gastosCop = cop(sumBy(
    realTxns({ type: 'expense', excludeTransfers: true }).filter((t) => t.date === today),
    (t) => t.amount
  ));

  // P&L de trading de hoy: suma de pnl de días traded con date=hoy (todas las cuentas).
  const tradingUsd = usd(sumBy(
    (T().days || []).filter((d) => d.traded === true && d.date === today),
    (d) => d.pnl
  ));

  return {
    ingresosCop,
    gastosCop,
    tradingUsd,
    balanceDiaCop: cop(ingresosCop - gastosCop),
  };
}
