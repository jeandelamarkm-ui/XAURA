// ============================================================================
// XAURA · js/core/backup.js
// Copia de seguridad y portabilidad (SPEC §4.6):
//   - exportJSON()                 → string envuelto {app,type,schemaVersion,exportedAt,data}
//   - importJSON(str,{mode})       → valida, migra y aplica replace|merge
//   - exportCSV(entity)            → CSV UTF-8 con BOM (solo salida)
//   - downloadFile(name,content,mime) → dispara la descarga en el navegador
//   - triggerImport(file)          → lee un File y delega en importJSON
//
// Sin dependencias externas. Todo se serializa desde xaura:db en vivo; el
// import reescribe el DB y fuerza commit() para persistir de inmediato.
// ============================================================================

import {
  getDB, saveDB, commit, resetDB, migrate, CURRENT_SCHEMA,
} from './store.js';
import { APP_NAME, isValidDBShape, nowISO } from './schema.js';
import { hoy } from './dates.js';

/* ============================================================================
 *  CONSTANTES DE ENVOLTURA
 * ========================================================================== */
const BACKUP_TYPE = 'backup';
const BOM = '﻿'; // marca de orden de bytes para que Excel lea UTF-8.

/* ============================================================================
 *  EXPORT JSON
 *  Envuelve el DB completo con metadatos de identificación y versión.
 * ========================================================================== */
export function exportJSON() {
  const db = getDB();
  const wrapper = {
    app: APP_NAME,            // 'XAURA'
    type: BACKUP_TYPE,        // 'backup'
    schemaVersion: CURRENT_SCHEMA,
    exportedAt: nowISO(),
    data: db,                 // xaura:db completo
  };
  return JSON.stringify(wrapper, null, 2);
}

/* ============================================================================
 *  IMPORT JSON
 *  Valida la envoltura, migra el payload y aplica el modo solicitado.
 *  @param {string} str
 *  @param {{mode?:'replace'|'merge'}} [opts]
 *  @returns {{ok:boolean, error?:string, mode?:string, schemaVersion?:number}}
 * ========================================================================== */
export function importJSON(str, opts = {}) {
  const mode = opts.mode === 'merge' ? 'merge' : 'replace';

  // 1) Parseo seguro.
  let parsed;
  try {
    parsed = JSON.parse(str);
  } catch (_e) {
    return { ok: false, error: 'json_invalido' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'formato_invalido' };
  }

  // 2) Validación de la envoltura. Acepta también un DB "desnudo" (sin wrapper)
  //    siempre que tenga la forma estructural correcta (tolerancia razonable).
  let payload;
  if (parsed.app === APP_NAME && parsed.type === BACKUP_TYPE && parsed.data) {
    payload = parsed.data;
  } else if (isValidDBShape(parsed)) {
    payload = parsed; // backup "desnudo"
  } else {
    return { ok: false, error: 'no_es_backup_xaura' };
  }

  // 3) Forma mínima del payload antes de migrar.
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'datos_corruptos' };
  }

  // 4) Migración al esquema actual (idempotente, no muta el objeto en runtime).
  let incoming;
  try {
    // Clona para no alterar el objeto recibido si la UI lo reutiliza.
    incoming = migrate(JSON.parse(JSON.stringify(payload)));
  } catch (_e) {
    return { ok: false, error: 'migracion_fallida' };
  }
  if (!isValidDBShape(incoming)) {
    return { ok: false, error: 'datos_corruptos' };
  }

  // 5) Aplicación.
  if (mode === 'replace') {
    resetDB();           // limpia el estado en memoria y persistido
    saveDB(incoming);    // adopta el DB importado
    commit();            // persistencia inmediata
    return { ok: true, mode, schemaVersion: incoming.schemaVersion };
  }

  // merge: une por id en cada colección, conservando lo existente y agregando
  // lo nuevo del backup (los IDs duplicados del backup NO sobrescriben).
  const current = getDB();
  const merged = mergeDB(current, incoming);
  saveDB(merged);
  commit();
  return { ok: true, mode, schemaVersion: merged.schemaVersion };
}

/* ----------------------------------------------------------------------------
 *  mergeDB(base, incoming): une colecciones por id sin duplicar.
 *  - Para cada arreglo de entidades: mantiene las de `base` y añade las de
 *    `incoming` cuyo id NO exista ya en base.
 *  - settings: se conservan los de `base` (no se pisan preferencias locales).
 *  - counters: se toma el máximo por clave para evitar colisión de IDs futuros.
 * -------------------------------------------------------------------------- */
function mergeDB(base, incoming) {
  const out = JSON.parse(JSON.stringify(base));

  const branches = [
    ['personal', ['accounts', 'categories', 'transactions', 'budgets', 'goals']],
    ['events', ['events', 'incomes', 'costs']],
    ['trading', ['accounts', 'days', 'movements']],
  ];

  for (const [branch, lists] of branches) {
    if (!out[branch]) out[branch] = {};
    const inBranch = incoming[branch] || {};
    for (const key of lists) {
      const baseArr = Array.isArray(out[branch][key]) ? out[branch][key] : [];
      const incArr = Array.isArray(inBranch[key]) ? inBranch[key] : [];
      const seen = new Set(baseArr.map((x) => x && x.id));
      const additions = incArr.filter((x) => x && !seen.has(x.id));
      out[branch][key] = baseArr.concat(additions);
    }
  }

  // counters: máximo por clave (asegura que nextId no reuse IDs ya importados).
  out.counters = out.counters || {};
  const incCounters = incoming.counters || {};
  const keys = new Set([...Object.keys(out.counters), ...Object.keys(incCounters)]);
  for (const k of keys) {
    const a = Number(out.counters[k]) || 0;
    const b = Number(incCounters[k]) || 0;
    out.counters[k] = Math.max(a, b);
  }

  out.schemaVersion = CURRENT_SCHEMA;
  return out;
}

/* ============================================================================
 *  EXPORT CSV
 *  Genera CSV (UTF-8 con BOM, separador ',', decimal '.') de una entidad.
 *  El import oficial es JSON; el CSV es sólo salida para hojas de cálculo.
 *
 *  @param {string} entity  'transactions' | 'accounts' | 'categories' |
 *                          'budgets' | 'goals' | 'events' | 'eventIncomes' |
 *                          'eventCosts' | 'tradingAccounts' | 'tradeDays' |
 *                          'tradingMovements'
 *  @returns {string} contenido CSV (con BOM)
 * ========================================================================== */
export function exportCSV(entity) {
  const db = getDB();
  const spec = CSV_SPECS[entity];
  if (!spec) {
    // Entidad desconocida: CSV de una sola celda con aviso (nunca lanza).
    return BOM + 'error\n' + csvCell('Entidad desconocida: ' + String(entity));
  }
  const rows = spec.rows(db) || [];
  const header = spec.columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) =>
    spec.columns.map((c) => csvCell(formatCsvValue(c.get(row, db)))).join(',')
  ).join('\r\n');
  return BOM + header + (body ? '\r\n' + body : '') + '\r\n';
}

// Diccionario auxiliar para resolver nombres en los CSV.
function nameMap(arr) {
  const m = new Map();
  for (const x of (arr || [])) m.set(x.id, x.name || '');
  return m;
}

/* ----------------------------------------------------------------------------
 *  Definición de columnas por entidad. Cada columna: {label, get(row,db)}.
 *  Las cifras se emiten con punto decimal (no formato es-CO) para hojas.
 * -------------------------------------------------------------------------- */
const CSV_SPECS = {
  transactions: {
    rows: (db) => db.personal.transactions,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'fecha', get: (r) => r.date },
      { label: 'tipo', get: (r) => r.type },
      { label: 'cuenta', get: (r, db) => nameMap(db.personal.accounts).get(r.accountId) || r.accountId },
      { label: 'categoria', get: (r, db) => (r.categoryId ? (nameMap(db.personal.categories).get(r.categoryId) || r.categoryId) : '') },
      { label: 'monto', get: (r) => r.amount },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'metodo', get: (r) => r.method || '' },
      { label: 'nota', get: (r) => r.note || '' },
      { label: 'etiquetas', get: (r) => (Array.isArray(r.tags) ? r.tags.join('|') : '') },
      { label: 'grupoTransferencia', get: (r) => r.transferGroupId || '' },
    ],
  },
  accounts: {
    rows: (db) => db.personal.accounts,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'nombre', get: (r) => r.name },
      { label: 'tipo', get: (r) => r.type },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'saldoInicial', get: (r) => r.initialBalance },
      { label: 'archivada', get: (r) => (r.archived ? 'si' : 'no') },
    ],
  },
  categories: {
    rows: (db) => db.personal.categories,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'nombre', get: (r) => r.name },
      { label: 'clase', get: (r) => r.kind },
      { label: 'topeMensual', get: (r) => (r.monthlyBudget == null ? '' : r.monthlyBudget) },
      { label: 'archivada', get: (r) => (r.archived ? 'si' : 'no') },
    ],
  },
  budgets: {
    rows: (db) => db.personal.budgets,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'mes', get: (r) => r.month },
      { label: 'categoria', get: (r, db) => nameMap(db.personal.categories).get(r.categoryId) || r.categoryId },
      { label: 'monto', get: (r) => r.amount },
      { label: 'moneda', get: (r) => r.currency },
    ],
  },
  goals: {
    rows: (db) => db.personal.goals,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'nombre', get: (r) => r.name },
      { label: 'objetivo', get: (r) => r.targetAmount },
      { label: 'actual', get: (r) => r.currentAmount },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'limite', get: (r) => r.deadline || '' },
      { label: 'archivada', get: (r) => (r.archived ? 'si' : 'no') },
    ],
  },
  events: {
    rows: (db) => db.events.events,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'nombre', get: (r) => r.name },
      { label: 'cliente', get: (r) => (r.client && r.client.name) || '' },
      { label: 'telefono', get: (r) => (r.client && r.client.phone) || '' },
      { label: 'tipo', get: (r) => r.eventType },
      { label: 'fecha', get: (r) => r.eventDate || '' },
      { label: 'hora', get: (r) => r.hora || '' },
      { label: 'lugar', get: (r) => r.venue || '' },
      { label: 'ciudad', get: (r) => r.ciudad || '' },
      { label: 'invitados', get: (r) => r.guests },
      { label: 'estado', get: (r) => r.status },
      { label: 'cotizado', get: (r) => r.quotedAmount },
      { label: 'moneda', get: (r) => r.currency },
    ],
  },
  eventIncomes: {
    rows: (db) => db.events.incomes,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'evento', get: (r, db) => nameMap(db.events.events).get(r.eventId) || r.eventId },
      { label: 'concepto', get: (r) => r.concept || '' },
      { label: 'monto', get: (r) => r.amount },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'fecha', get: (r) => r.date },
      { label: 'metodo', get: (r) => r.method || '' },
    ],
  },
  eventCosts: {
    rows: (db) => db.events.costs,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'evento', get: (r, db) => nameMap(db.events.events).get(r.eventId) || r.eventId },
      { label: 'categoria', get: (r) => r.category },
      { label: 'proveedor', get: (r) => r.supplier || '' },
      { label: 'concepto', get: (r) => r.concept || '' },
      { label: 'monto', get: (r) => r.amount },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'fecha', get: (r) => r.date },
      { label: 'pagado', get: (r) => (r.paid ? 'si' : 'no') },
    ],
  },
  tradingAccounts: {
    rows: (db) => db.trading.accounts,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'nombre', get: (r) => r.name },
      { label: 'broker', get: (r) => r.broker || '' },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'saldoInicial', get: (r) => r.initialBalance },
      { label: 'fechaInicio', get: (r) => r.startDate || '' },
      { label: 'archivada', get: (r) => (r.archived ? 'si' : 'no') },
    ],
  },
  tradeDays: {
    rows: (db) => db.trading.days,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'cuenta', get: (r, db) => nameMap(db.trading.accounts).get(r.accountId) || r.accountId },
      { label: 'fecha', get: (r) => r.date },
      { label: 'pnl', get: (r) => r.pnl },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'operaciones', get: (r) => r.trades },
      { label: 'etiqueta', get: (r) => r.tag || '' },
      { label: 'operado', get: (r) => (r.traded ? 'si' : 'no') },
      { label: 'nota', get: (r) => r.note || '' },
    ],
  },
  tradingMovements: {
    rows: (db) => db.trading.movements,
    columns: [
      { label: 'id', get: (r) => r.id },
      { label: 'cuenta', get: (r, db) => nameMap(db.trading.accounts).get(r.accountId) || r.accountId },
      { label: 'tipo', get: (r) => r.type },
      { label: 'monto', get: (r) => r.amount },
      { label: 'moneda', get: (r) => r.currency },
      { label: 'fecha', get: (r) => r.date },
      { label: 'nota', get: (r) => r.note || '' },
    ],
  },
};

// Lista de entidades exportables a CSV (para poblar la UI de Ajustes).
export const CSV_ENTITIES = Object.freeze([
  { key: 'transactions', label: 'Transacciones' },
  { key: 'accounts', label: 'Cuentas' },
  { key: 'categories', label: 'Categorías' },
  { key: 'budgets', label: 'Presupuestos' },
  { key: 'goals', label: 'Metas' },
  { key: 'events', label: 'Eventos' },
  { key: 'eventIncomes', label: 'Abonos de eventos' },
  { key: 'eventCosts', label: 'Costos de eventos' },
  { key: 'tradingAccounts', label: 'Cuentas de trading' },
  { key: 'tradeDays', label: 'Días de trading' },
  { key: 'tradingMovements', label: 'Movimientos de caja' },
]);

/* ----------------------------------------------------------------------------
 *  Helpers CSV: escape RFC-4180 y normalización de valores.
 * -------------------------------------------------------------------------- */
function formatCsvValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (!isFinite(v)) return '';
    return String(v); // punto decimal nativo de JS, sin separador de miles
  }
  if (typeof v === 'boolean') return v ? 'si' : 'no';
  return String(v);
}

// Envuelve en comillas si contiene coma, comillas, salto de línea o BOM, y
// duplica las comillas internas (RFC-4180).
function csvCell(value) {
  const s = String(value === null || value === undefined ? '' : value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/* ============================================================================
 *  DESCARGA EN NAVEGADOR
 *  Crea un Blob y dispara la descarga vía <a download>. No-op fuera del DOM.
 *  @param {string} name  nombre de archivo sugerido
 *  @param {string} content
 *  @param {string} [mime='application/octet-stream']
 *  @returns {boolean} true si se disparó la descarga
 * ========================================================================== */
export function downloadFile(name, content, mime = 'application/octet-stream') {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Limpieza diferida para no cancelar la descarga en navegadores lentos.
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (_e) { /* ya removido */ }
      try { URL.revokeObjectURL(url); } catch (_e) { /* ya revocado */ }
    }, 0);
    return true;
  } catch (_e) {
    return false;
  }
}

/* ============================================================================
 *  ATAJOS DE DESCARGA CON NOMBRE CANÓNICO
 * ========================================================================== */
// Nombre del backup JSON: xaura-backup-YYYY-MM-DD.json
export function backupFileName() {
  return 'xaura-backup-' + hoy() + '.json';
}

// Exporta y descarga el backup JSON completo en un solo paso.
export function downloadBackup() {
  const content = exportJSON();
  const name = backupFileName();
  const ok = downloadFile(name, content, 'application/json');
  return { ok, name };
}

// Exporta y descarga un CSV de la entidad indicada.
export function downloadCSV(entity) {
  const content = exportCSV(entity);
  const name = 'xaura-' + String(entity) + '-' + hoy() + '.csv';
  const ok = downloadFile(name, content, 'text/csv');
  return { ok, name };
}

/* ============================================================================
 *  IMPORTAR DESDE UN File (input type=file)
 *  Lee el archivo como texto y delega en importJSON.
 *  @param {File} file
 *  @param {{mode?:'replace'|'merge'}} [opts]
 *  @returns {Promise<{ok:boolean, error?:string, mode?:string}>}
 * ========================================================================== */
export function triggerImport(file, opts = {}) {
  return new Promise((resolve) => {
    if (!file) {
      resolve({ ok: false, error: 'sin_archivo' });
      return;
    }
    // Vía moderna: File.text() (devuelve Promise<string>).
    if (typeof file.text === 'function') {
      file.text()
        .then((txt) => resolve(importJSON(txt, opts)))
        .catch(() => resolve({ ok: false, error: 'lectura_fallida' }));
      return;
    }
    // Fallback: FileReader.
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const txt = reader.result != null ? String(reader.result) : '';
        resolve(importJSON(txt, opts));
      };
      reader.onerror = () => resolve({ ok: false, error: 'lectura_fallida' });
      reader.readAsText(file, 'utf-8');
    } catch (_e) {
      resolve({ ok: false, error: 'lectura_fallida' });
    }
  });
}

/* ============================================================================
 *  RE-EXPORTS ÚTILES (para la vista de Ajustes)
 * ========================================================================== */
export { CURRENT_SCHEMA };
