// XAURA · js/core/schema.js
// Esquema, enums, constantes y validadores ligeros del nucleo de datos (SPEC §4).
// Fuente unica de verdad para la version del esquema y la estructura raiz por defecto.

/* ============================================================
 *  VERSION DE ESQUEMA
 * ============================================================ */
export const CURRENT_SCHEMA = 1;

export const APP_VERSION = '1.0.0';
export const APP_NAME = 'XAURA';

/* ============================================================
 *  CLAVES DE localStorage
 * ============================================================ */
export const LS_KEYS = Object.freeze({
  DB: 'xaura:db',
  META: 'xaura:meta',
  BAK_PREFIX: 'xaura:db.bak.v',      // + n  -> backup pre-migracion
  CORRUPT_PREFIX: 'xaura:db.corrupt.' // + ts -> copia de db corrupta
});

/* ============================================================
 *  ENUMERACIONES (centralizadas)
 * ============================================================ */

// account.type
export const ACCOUNT_TYPES = Object.freeze(['cash', 'bank', 'card', 'savings', 'wallet']);

// category.kind
export const CATEGORY_KINDS = Object.freeze(['income', 'expense']);

// transaction.type
export const TRANSACTION_TYPES = Object.freeze(['income', 'expense', 'transfer']);

// transaction.method
export const TRANSACTION_METHODS = Object.freeze(['efectivo', 'transferencia', 'tarjeta', 'debito', 'otro']);

// event.eventType
export const EVENT_TYPES = Object.freeze([
  'boda', 'corporativo', 'cumpleanos', 'quinceanera',
  'grado', 'aniversario', 'social', 'otro'
]);

// event.status
export const EVENT_STATUSES = Object.freeze([
  'cotizado', 'confirmado', 'realizado', 'pagado', 'cancelado'
]);

// eventIncome.method
export const EVENT_INCOME_METHODS = Object.freeze(['efectivo', 'transferencia', 'tarjeta', 'otro']);

// eventCost.category  (las 9 categorias canonicas de costo, SPEC §4.3)
export const EVENT_COST_CATEGORIES = Object.freeze([
  'lugar', 'catering', 'decoracion', 'sonido', 'fotografia',
  'personal', 'transporte', 'papeleria', 'imprevistos'
]);

// tradingMovement.type
export const TRADING_MOVEMENT_TYPES = Object.freeze(['deposit', 'withdrawal']);

// Monedas
export const CURRENCIES = Object.freeze(['COP', 'USD']);

// Tema
export const THEMES = Object.freeze(['dark', 'light', 'auto']);

// Etiquetas de sesion de trading por defecto
export const DEFAULT_TRADING_TAGS = Object.freeze([
  'Londres', 'Nueva York', 'Asia', 'Forex', 'Indices', 'Cripto', 'Acciones', 'Dia sin operar'
]);

// Etiquetas legibles (es-CO) para enums usados en UI
export const LABELS = Object.freeze({
  accountType: {
    cash: 'Efectivo', bank: 'Banco', card: 'Tarjeta', savings: 'Ahorros', wallet: 'Billetera'
  },
  categoryKind: { income: 'Ingreso', expense: 'Gasto' },
  transactionType: { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia' },
  transactionMethod: {
    efectivo: 'Efectivo', transferencia: 'Transferencia',
    tarjeta: 'Tarjeta', debito: 'Debito', otro: 'Otro'
  },
  eventType: {
    boda: 'Boda', corporativo: 'Corporativo', cumpleanos: 'Cumpleanos',
    quinceanera: 'Quinceanera', grado: 'Grado', aniversario: 'Aniversario',
    social: 'Social', otro: 'Otro'
  },
  eventStatus: {
    cotizado: 'Cotizado', confirmado: 'Confirmado', realizado: 'Realizado',
    pagado: 'Pagado', cancelado: 'Cancelado'
  },
  eventCostCategory: {
    lugar: 'Lugar', catering: 'Catering', decoracion: 'Decoracion',
    sonido: 'Sonido', fotografia: 'Fotografia', personal: 'Personal',
    transporte: 'Transporte', papeleria: 'Papeleria', imprevistos: 'Imprevistos'
  },
  tradingMovementType: { deposit: 'Deposito', withdrawal: 'Retiro' }
});

/* ============================================================
 *  PREFIJOS DE ID -> claves del contador (counters)
 * ============================================================ */
export const ID_PREFIXES = Object.freeze({
  acc: 'acc',    // account
  cat: 'cat',    // category
  txn: 'txn',    // transaction
  bud: 'bud',    // budget (id deterministico, contador no usado)
  goal: 'goal',  // goal
  evt: 'evt',    // event
  evi: 'evi',    // eventIncome
  evc: 'evc',    // eventCost
  tracc: 'tracc',// tradingAccount
  trd: 'trd',    // tradeDay (id deterministico, contador no usado)
  trm: 'trm',    // tradingMovement
  grp: 'grp'     // transferGroupId (UUID, contador opcional)
});

/* ============================================================
 *  CONTADORES POR DEFECTO
 * ============================================================ */
export function emptyCounters() {
  return {
    acc: 0, cat: 0, txn: 0, bud: 0, goal: 0,
    evt: 0, evi: 0, evc: 0, tracc: 0, trd: 0, trm: 0, grp: 0
  };
}

/* ============================================================
 *  AYUDANTES DE FECHA / NUMERO (sin dependencias)
 * ============================================================ */
function pad2(n) { return String(n).padStart(2, '0'); }

// ISO local YYYY-MM-DD (no UTC) para la fecha dada o "hoy".
export function isoDate(d = new Date()) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// Marca de tiempo ISO completa.
export function nowISO() {
  return new Date().toISOString();
}

// Redondeo monetario: COP enteros, USD 2 decimales.
export function roundMoney(x, currency = 'COP') {
  const n = Number(x);
  if (!isFinite(n)) return 0;
  if (currency === 'USD') return Math.round(n * 100) / 100;
  return Math.round(n);
}

/* ============================================================
 *  ESTRUCTURA RAIZ POR DEFECTO  (SPEC §4.2)
 * ============================================================ */
export function defaultSettings() {
  const today = isoDate();
  const ts = nowISO();
  return {
    schemaVersion: CURRENT_SCHEMA,
    userName: '',
    theme: 'dark',
    locale: 'es-CO',
    primaryCurrency: 'COP',
    fxRate: { usdToCop: 4000, date: today, manual: true },
    fxHistory: [{ usdToCop: 4000, date: today }],
    ui: {
      defaultModule: 'personal',
      hideBalances: false,
      firstDayOfMonth: 1,
      showCop: true,
      accent: 'gold'
    },
    trading: {
      monthlyTargetPct: 8,
      tags: DEFAULT_TRADING_TAGS.slice()
    },
    personalBudgetMonthly: 0,
    onboarded: false,
    streak: { count: 0, lastActiveDate: null },
    createdAt: ts,
    updatedAt: ts
  };
}

export function emptyDB() {
  return {
    schemaVersion: CURRENT_SCHEMA,
    settings: defaultSettings(),
    personal: {
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      goals: []
    },
    events: {
      events: [],
      incomes: [],
      costs: []
    },
    trading: {
      accounts: [],
      days: [],
      movements: []
    },
    counters: emptyCounters()
  };
}

/* ============================================================
 *  VALIDADORES LIGEROS
 *  Devuelven booleanos; no lanzan. Usados por la capa de datos
 *  para sanear entradas antes de persistir.
 * ============================================================ */
export function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export function isFiniteNumber(v) {
  return typeof v === 'number' && isFinite(v);
}

export function isISODate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isMonthKey(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
}

export function isOneOf(v, list) {
  return Array.isArray(list) && list.indexOf(v) !== -1;
}

export function isAccountType(v) { return isOneOf(v, ACCOUNT_TYPES); }
export function isCategoryKind(v) { return isOneOf(v, CATEGORY_KINDS); }
export function isTransactionType(v) { return isOneOf(v, TRANSACTION_TYPES); }
export function isTransactionMethod(v) { return isOneOf(v, TRANSACTION_METHODS); }
export function isEventType(v) { return isOneOf(v, EVENT_TYPES); }
export function isEventStatus(v) { return isOneOf(v, EVENT_STATUSES); }
export function isEventIncomeMethod(v) { return isOneOf(v, EVENT_INCOME_METHODS); }
export function isEventCostCategory(v) { return isOneOf(v, EVENT_COST_CATEGORIES); }
export function isTradingMovementType(v) { return isOneOf(v, TRADING_MOVEMENT_TYPES); }
export function isCurrency(v) { return isOneOf(v, CURRENCIES); }

// Validacion estructural minima de la raiz del DB (para deteccion de corrupcion).
export function isValidDBShape(db) {
  if (!db || typeof db !== 'object') return false;
  if (!db.settings || typeof db.settings !== 'object') return false;
  const p = db.personal, e = db.events, t = db.trading;
  if (!p || !Array.isArray(p.accounts) || !Array.isArray(p.categories) ||
      !Array.isArray(p.transactions) || !Array.isArray(p.budgets) || !Array.isArray(p.goals)) return false;
  if (!e || !Array.isArray(e.events) || !Array.isArray(e.incomes) || !Array.isArray(e.costs)) return false;
  if (!t || !Array.isArray(t.accounts) || !Array.isArray(t.days) || !Array.isArray(t.movements)) return false;
  if (!db.counters || typeof db.counters !== 'object') return false;
  return true;
}

// Coercion segura a numero finito con valor por defecto.
export function num(v, def = 0) {
  const n = Number(v);
  return isFinite(n) ? n : def;
}

// Coercion segura a string recortada.
export function str(v, def = '') {
  if (v === null || v === undefined) return def;
  return String(v);
}

// Coercion a booleano.
export function bool(v, def = false) {
  if (typeof v === 'boolean') return v;
  if (v === undefined || v === null) return def;
  return Boolean(v);
}
