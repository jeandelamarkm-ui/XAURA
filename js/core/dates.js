// ============================================================================
// XAURA · js/core/dates.js
// Utilidades de fecha en español (Colombia), zona horaria LOCAL.
// Sin librerías. Formato canónico de almacenamiento: 'YYYY-MM-DD'.
//
// Regla anti-desfase: NUNCA usar new Date("YYYY-MM-DD") (se interpreta como
// UTC y puede saltar de día). Siempre parseLocalDate() para construir Dates
// locales a medianoche.
// ============================================================================

// ---- Tablas en español (Colombia) ------------------------------------------

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const MESES_ABBR = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

// getDay(): 0 = domingo … 6 = sábado
const DIAS = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
];

const DIAS_ABBR = [
  'dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb',
];

// ---- Núcleo: parseo y serialización ----------------------------------------

/**
 * Construye un Date LOCAL a medianoche desde 'YYYY-MM-DD' (evita desfase UTC).
 * Acepta también un Date (lo normaliza a medianoche local) o un string ISO
 * con hora (toma solo la parte de fecha).
 * Si la entrada es inválida devuelve null.
 *
 * @param {string|Date} input
 * @returns {Date|null}
 */
export function parseLocalDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (s === '') return null;
  // Captura los primeros tres grupos numéricos: año-mes-día.
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  // Verifica que no haya overflow (p.ej. 31 de febrero → marzo).
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Normaliza cualquier entrada a un Date local válido; si falla, usa hoy.
 * @param {string|Date} [input]
 * @returns {Date}
 */
function toDate(input) {
  if (input === undefined || input === null) return startOfToday();
  const parsed = parseLocalDate(input);
  return parsed || startOfToday();
}

/** Date de hoy a medianoche local. */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Serializa un Date (o string) a 'YYYY-MM-DD' en zona local.
 * @param {string|Date} input
 * @returns {string}
 */
export function toISO(input) {
  const d = toDate(input);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Fecha de hoy en 'YYYY-MM-DD' (zona local).
 * @returns {string}
 */
export function hoy() {
  return toISO(startOfToday());
}

// ---- Formato humano (es-CO) -------------------------------------------------

/**
 * Formatea una fecha en español: '19 jun 2026'. Con opciones para incluir
 * el día de la semana o el mes completo.
 *
 *   formatDateEs('2026-06-19')                          → "19 jun 2026"
 *   formatDateEs('2026-06-19', { weekday: true })       → "vie, 19 jun 2026"
 *   formatDateEs('2026-06-19', { long: true })          → "19 de junio de 2026"
 *   formatDateEs('2026-06-19', { weekday: true, long: true })
 *                                              → "viernes, 19 de junio de 2026"
 *   formatDateEs('2026-06-19', { year: false })         → "19 jun"
 *
 * @param {string|Date} date
 * @param {object} [opts]
 * @param {boolean} [opts.weekday=false]
 * @param {boolean} [opts.long=false]    mes completo y conectores "de"
 * @param {boolean} [opts.year=true]
 * @returns {string}
 */
export function formatDateEs(date, opts = {}) {
  const { weekday = false, long = false, year = true } = opts;
  const d = toDate(date);
  const dd = d.getDate();
  const mes = long ? MESES[d.getMonth()] : MESES_ABBR[d.getMonth()];
  const yyyy = d.getFullYear();

  let core;
  if (long) {
    core = year ? `${dd} de ${mes} de ${yyyy}` : `${dd} de ${mes}`;
  } else {
    core = year ? `${dd} ${mes} ${yyyy}` : `${dd} ${mes}`;
  }

  if (weekday) {
    const wd = long ? DIAS[d.getDay()] : DIAS_ABBR[d.getDay()];
    return `${wd}, ${core}`;
  }
  return core;
}

/** Nombre del mes en español. monthName(5) → "junio" (1-based). */
export function monthName(month, { abbr = false } = {}) {
  const idx = ((toNum(month, 1) - 1) % 12 + 12) % 12;
  return abbr ? MESES_ABBR[idx] : MESES[idx];
}

/** Nombre corto del día de semana. weekdayShort(date) → "vie". */
export function weekdayShort(date) {
  return DIAS_ABBR[toDate(date).getDay()];
}

/** Nombre completo del día de semana. weekdayLong(date) → "viernes". */
export function weekdayLong(date) {
  return DIAS[toDate(date).getDay()];
}

// ---- Claves de mes y rangos -------------------------------------------------

/**
 * Clave de mes 'YYYY-MM'.
 *   monthKey('2026-06-19') → "2026-06"
 *   monthKey(2026, 6)      → "2026-06"   (año, mes 1-based)
 *
 * @param {string|Date|number} dateOrYear
 * @param {number} [month]  si se pasa, dateOrYear es el año (mes 1-based)
 * @returns {string}
 */
export function monthKey(dateOrYear, month) {
  if (typeof dateOrYear === 'number' && typeof month === 'number') {
    const y = dateOrYear;
    const mo = String(((month - 1) % 12 + 12) % 12 + 1).padStart(2, '0');
    return `${y}-${mo}`;
  }
  const d = toDate(dateOrYear);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mo}`;
}

/** Días del mes. daysInMonth(2026, 6) → 30 (mes 1-based). */
export function daysInMonth(year, month) {
  const y = toNum(year, startOfToday().getFullYear());
  const mIdx = ((toNum(month, 1) - 1) % 12 + 12) % 12; // 0-based
  // El día 0 del mes siguiente es el último del mes actual.
  return new Date(y, mIdx + 1, 0).getDate();
}

/** Primer día del mes de `date` como 'YYYY-MM-DD'. */
export function startOfMonth(date) {
  const d = toDate(date);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Último día del mes de `date` como 'YYYY-MM-DD'. */
export function endOfMonth(date) {
  const d = toDate(date);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/**
 * Rango [from, to] del mes que contiene `date` (o de la clave 'YYYY-MM').
 * @param {string|Date} date  acepta 'YYYY-MM' o 'YYYY-MM-DD' o Date
 * @returns {{from:string, to:string, year:number, month:number, key:string}}
 */
export function rangeForMonth(date) {
  let d;
  if (typeof date === 'string' && /^\d{4}-\d{1,2}$/.test(date.trim())) {
    const [y, m] = date.trim().split('-').map(Number);
    d = new Date(y, m - 1, 1);
  } else {
    d = toDate(date);
  }
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    from: toISO(from),
    to: toISO(to),
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    key: monthKey(from),
  };
}

/**
 * Devuelve las claves de los últimos N meses, de más antiguo a más reciente,
 * incluyendo el mes de `ref` (hoy por defecto).
 *   lastNMonths(3) → ["2026-04","2026-05","2026-06"]
 *
 * @param {number} n
 * @param {string|Date} [ref]
 * @returns {Array<{key:string, year:number, month:number, label:string}>}
 */
export function lastNMonths(n, ref) {
  const count = Math.max(0, toNum(n, 0) | 0);
  const base = toDate(ref);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({
      key: monthKey(d),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: MESES_ABBR[d.getMonth()],
    });
  }
  return out;
}

// ---- Aritmética de fechas ---------------------------------------------------

/**
 * Suma `n` días (puede ser negativo). Devuelve 'YYYY-MM-DD'.
 * @param {string|Date} date
 * @param {number} n
 * @returns {string}
 */
export function addDays(date, n) {
  const d = toDate(date);
  d.setDate(d.getDate() + (toNum(n, 0) | 0));
  return toISO(d);
}

/**
 * Suma `n` meses (puede ser negativo). Ajusta el día si desborda el mes
 * destino (p.ej. 31 ene + 1 mes → 28/29 feb). Devuelve 'YYYY-MM-DD'.
 * @param {string|Date} date
 * @param {number} n
 * @returns {string}
 */
export function addMonths(date, n) {
  const d = toDate(date);
  const targetDay = d.getDate();
  const targetMonthFirst = new Date(d.getFullYear(), d.getMonth() + (toNum(n, 0) | 0), 1);
  const maxDay = daysInMonth(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth() + 1);
  targetMonthFirst.setDate(Math.min(targetDay, maxDay));
  return toISO(targetMonthFirst);
}

/** Día anterior. prevDay('2026-06-19') → "2026-06-18". */
export function prevDay(date) {
  return addDays(date, -1);
}

/** Día siguiente. nextDay('2026-06-19') → "2026-06-20". */
export function nextDay(date) {
  return addDays(date, 1);
}

// ---- Comparaciones ----------------------------------------------------------

/**
 * ¿Mismo día calendario? Compara por 'YYYY-MM-DD' local.
 * @param {string|Date} a
 * @param {string|Date} b
 * @returns {boolean}
 */
export function isSameDay(a, b) {
  return toISO(a) === toISO(b);
}

/** ¿`date` es hoy? */
export function isToday(date) {
  return toISO(date) === hoy();
}

/**
 * Diferencia en días enteros entre dos fechas (b − a). Positivo si b es
 * posterior. Usa UTC de las medianoches locales para evitar errores DST.
 * @param {string|Date} a
 * @param {string|Date} b
 * @returns {number}
 */
export function diffDays(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

// ---- Helper numérico local (sin dependencias) -------------------------------

function toNum(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---- Constantes exportadas (por si la UI las necesita) ----------------------

export const NOMBRES_MES = MESES.slice();
export const NOMBRES_MES_ABBR = MESES_ABBR.slice();
export const NOMBRES_DIA = DIAS.slice();
export const NOMBRES_DIA_ABBR = DIAS_ABBR.slice();
