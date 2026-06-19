// XAURA · js/core/store.js
// Capa de persistencia: carga/guarda el DB unico en localStorage, IDs deterministicos,
// migraciones y manejo de primer arranque. NO persiste saldos/balances/P&L (SPEC §4, §11).

import {
  CURRENT_SCHEMA, APP_VERSION, LS_KEYS,
  emptyDB, emptyCounters, isValidDBShape, nowISO
} from './schema.js';

/* ============================================================
 *  ESTADO EN MEMORIA
 * ============================================================ */
let _db = null;            // instancia viva del DB (fuente de verdad en runtime)
let _saveTimer = null;     // temporizador del debounce de saveDB
let _pendingDirty = false; // hay cambios sin persistir
const SAVE_DEBOUNCE_MS = 350;

/* ============================================================
 *  UTILIDADES INTERNAS
 * ============================================================ */
function pad6(n) {
  return String(n).padStart(6, '0');
}

function safeParse(json) {
  try { return JSON.parse(json); }
  catch (_e) { return undefined; }
}

// Escribe xaura:meta sin necesidad de serializar el db completo al leerlo en arranque.
function writeMeta(extra) {
  try {
    const prev = safeParse(localStorage.getItem(LS_KEYS.META)) || {};
    const meta = Object.assign({}, prev, {
      schemaVersion: CURRENT_SCHEMA,
      appVersion: APP_VERSION,
      updatedAt: nowISO()
    }, extra || {});
    localStorage.setItem(LS_KEYS.META, JSON.stringify(meta));
  } catch (_e) { /* no critico */ }
}

// Persiste el objeto db sin pasar por el debounce (uso interno/migraciones).
function persistNow(db) {
  let serialized;
  try {
    serialized = JSON.stringify(db);
  } catch (_e) {
    return { ok: false, error: 'serialize' };
  }
  try {
    localStorage.setItem(LS_KEYS.DB, serialized);
    writeMeta();
    _pendingDirty = false;
    return { ok: true };
  } catch (err) {
    const name = err && err.name ? err.name : '';
    if (name === 'QuotaExceededError' ||
        name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        (err && err.code === 22)) {
      // Espacio lleno: la UI debe avisar "Espacio lleno, exporta un backup".
      try {
        window.dispatchEvent(new CustomEvent('xaura:quota-exceeded', { detail: { error: err } }));
      } catch (_e) { /* entorno sin window */ }
      return { ok: false, error: 'quota' };
    }
    return { ok: false, error: 'unknown', detail: err };
  }
}

/* ============================================================
 *  MIGRACIONES
 *  migrate(db) lleva cualquier db antiguo a CURRENT_SCHEMA.
 *  Garantiza la presencia de todas las ramas y contadores.
 * ============================================================ */
export function migrate(db) {
  if (!db || typeof db !== 'object') return emptyDB();

  let version = Number(db.schemaVersion) || 0;

  // Respaldo pre-migracion si hubiera saltos de version reales.
  if (version > 0 && version < CURRENT_SCHEMA) {
    try {
      localStorage.setItem(LS_KEYS.BAK_PREFIX + version, JSON.stringify(db));
    } catch (_e) { /* no critico */ }
  }

  // --- v0 -> v1: normalizacion estructural (esquema base) ---
  // No hay versiones anteriores reales todavia; este bloque garantiza forma.
  if (version < 1) {
    version = 1;
  }

  // Saneo estructural idempotente: asegura todas las ramas/arreglos/contadores.
  const base = emptyDB();

  db.settings = Object.assign({}, base.settings, db.settings || {});
  db.settings.ui = Object.assign({}, base.settings.ui, (db.settings && db.settings.ui) || {});
  db.settings.trading = Object.assign({}, base.settings.trading, (db.settings && db.settings.trading) || {});
  if (!db.settings.fxRate || typeof db.settings.fxRate !== 'object') {
    db.settings.fxRate = Object.assign({}, base.settings.fxRate);
  }
  if (!Array.isArray(db.settings.fxHistory)) {
    db.settings.fxHistory = [{ usdToCop: db.settings.fxRate.usdToCop, date: db.settings.fxRate.date }];
  }
  if (!db.settings.streak || typeof db.settings.streak !== 'object') {
    db.settings.streak = { count: 0, lastActiveDate: null };
  }

  db.personal = db.personal || {};
  db.personal.accounts = Array.isArray(db.personal.accounts) ? db.personal.accounts : [];
  db.personal.categories = Array.isArray(db.personal.categories) ? db.personal.categories : [];
  db.personal.transactions = Array.isArray(db.personal.transactions) ? db.personal.transactions : [];
  db.personal.budgets = Array.isArray(db.personal.budgets) ? db.personal.budgets : [];
  db.personal.goals = Array.isArray(db.personal.goals) ? db.personal.goals : [];

  db.events = db.events || {};
  db.events.events = Array.isArray(db.events.events) ? db.events.events : [];
  db.events.incomes = Array.isArray(db.events.incomes) ? db.events.incomes : [];
  db.events.costs = Array.isArray(db.events.costs) ? db.events.costs : [];

  db.trading = db.trading || {};
  db.trading.accounts = Array.isArray(db.trading.accounts) ? db.trading.accounts : [];
  db.trading.days = Array.isArray(db.trading.days) ? db.trading.days : [];
  db.trading.movements = Array.isArray(db.trading.movements) ? db.trading.movements : [];

  db.counters = Object.assign({}, emptyCounters(), db.counters || {});

  db.schemaVersion = CURRENT_SCHEMA;
  db.settings.schemaVersion = CURRENT_SCHEMA;

  return db;
}

/* ============================================================
 *  CARGA / PRIMER ARRANQUE
 * ============================================================ */
export function loadDB() {
  const raw = localStorage.getItem(LS_KEYS.DB);

  // Primer arranque: no existe db.
  if (raw === null || raw === undefined) {
    _db = emptyDB();
    persistNow(_db);
    return _db;
  }

  const parsed = safeParse(raw);

  // Corrupcion: no parsea o forma invalida -> se archiva y se reinicia limpio.
  if (parsed === undefined || !isValidDBShape(parsed)) {
    try {
      localStorage.setItem(LS_KEYS.CORRUPT_PREFIX + Date.now(), raw);
    } catch (_e) { /* no critico */ }
    _db = emptyDB();
    persistNow(_db);
    return _db;
  }

  // Migracion si la version es anterior.
  _db = migrate(parsed);
  if (Number(parsed.schemaVersion) !== CURRENT_SCHEMA) {
    persistNow(_db);
  }
  return _db;
}

/* ============================================================
 *  ACCESO EN MEMORIA
 * ============================================================ */
export function getDB() {
  if (_db === null) return loadDB();
  return _db;
}

/* ============================================================
 *  GUARDADO (debounced) + commit (persiste el db en memoria)
 * ============================================================ */
export function saveDB(db) {
  if (db && db !== _db) {
    _db = db;
  }
  _pendingDirty = true;
  if (_saveTimer !== null) {
    clearTimeout(_saveTimer);
  }
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    if (_db) persistNow(_db);
  }, SAVE_DEBOUNCE_MS);
}

// commit(): fuerza la persistencia inmediata del db en memoria (cancela debounce).
export function commit() {
  if (_saveTimer !== null) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  if (_db === null) _db = loadDB();
  return persistNow(_db);
}

// Persiste de inmediato cualquier guardado pendiente (util en pagehide/visibilitychange).
export function flush() {
  if (_pendingDirty || _saveTimer !== null) {
    return commit();
  }
  return { ok: true };
}

/* ============================================================
 *  RESET
 * ============================================================ */
export function resetDB() {
  if (_saveTimer !== null) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  _db = emptyDB();
  persistNow(_db);
  return _db;
}

/* ============================================================
 *  IDENTIFICADORES
 * ============================================================ */
// nextId(prefix) -> "prefix_000001" usando los contadores persistidos.
export function nextId(prefix) {
  const db = getDB();
  if (!db.counters || typeof db.counters !== 'object') {
    db.counters = emptyCounters();
  }
  const current = Number(db.counters[prefix]) || 0;
  const next = current + 1;
  db.counters[prefix] = next;
  saveDB(db);
  return prefix + '_' + pad6(next);
}

// id deterministico de presupuesto: "bud_{YYYY-MM}_{categoryId}"
export function budgetId(month, categoryId) {
  return 'bud_' + month + '_' + categoryId;
}

// id deterministico de dia de trading: "trd_{YYYY-MM-DD}_{accountId}"
export function tradeDayId(date, accountId) {
  return 'trd_' + date + '_' + accountId;
}

// UUID para grupos (transferencias). crypto.randomUUID con fallback robusto.
export function newGroupId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_e) { /* sigue al fallback */ }

  // Fallback: UUID v4 con crypto.getRandomValues si existe, si no Math.random.
  let bytes;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
    }
  } catch (_e) { bytes = undefined; }

  if (!bytes) {
    bytes = new Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
  const hex = [];
  for (let i = 0; i < 16; i++) hex.push((bytes[i] + 0x100).toString(16).slice(1));
  return (
    hex[0] + hex[1] + hex[2] + hex[3] + '-' +
    hex[4] + hex[5] + '-' +
    hex[6] + hex[7] + '-' +
    hex[8] + hex[9] + '-' +
    hex[10] + hex[11] + hex[12] + hex[13] + hex[14] + hex[15]
  );
}

/* ============================================================
 *  RE-EXPORTS UTILES
 * ============================================================ */
export { CURRENT_SCHEMA, LS_KEYS };
