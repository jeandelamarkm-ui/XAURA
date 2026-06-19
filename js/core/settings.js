// XAURA · js/core/settings.js
// Operaciones sobre db.settings: preferencias, tema, moneda y tasa USD/COP (SPEC §4.4, §8).

import { getDB, saveDB } from './store.js';
import { isoDate, nowISO, num } from './schema.js';

/* ============================================================
 *  LECTURA
 * ============================================================ */
export function getSettings() {
  return getDB().settings;
}

/* ============================================================
 *  ACTUALIZACION GENERICA (merge superficial + sub-objetos)
 * ============================================================ */
export function updateSettings(patch) {
  const db = getDB();
  const s = db.settings;
  if (patch && typeof patch === 'object') {
    // Sub-objetos conocidos: merge profundo de un nivel para no perder claves.
    if (patch.ui && typeof patch.ui === 'object') {
      s.ui = Object.assign({}, s.ui, patch.ui);
    }
    if (patch.trading && typeof patch.trading === 'object') {
      s.trading = Object.assign({}, s.trading, patch.trading);
    }
    if (patch.streak && typeof patch.streak === 'object') {
      s.streak = Object.assign({}, s.streak, patch.streak);
    }
    if (patch.fxRate && typeof patch.fxRate === 'object') {
      s.fxRate = Object.assign({}, s.fxRate, patch.fxRate);
    }
    // Resto de claves escalares (excluye las ya fusionadas).
    for (const k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      if (k === 'ui' || k === 'trading' || k === 'streak' || k === 'fxRate') continue;
      s[k] = patch[k];
    }
  }
  s.updatedAt = nowISO();
  saveDB(db);
  return s;
}

/* ============================================================
 *  TASA USD -> COP
 * ============================================================ */
// setFxRate(usdToCop, date): fija la tasa vigente y la apila en fxHistory.
export function setFxRate(usdToCop, date) {
  const db = getDB();
  const s = db.settings;
  const rate = num(usdToCop, s.fxRate ? s.fxRate.usdToCop : 4000);
  const safeRate = rate > 0 ? rate : (s.fxRate ? s.fxRate.usdToCop : 4000);
  const d = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : isoDate();

  s.fxRate = { usdToCop: safeRate, date: d, manual: true };

  if (!Array.isArray(s.fxHistory)) s.fxHistory = [];
  // Si ya hay una entrada para esa fecha, se reemplaza; si no, se apila.
  const idx = s.fxHistory.findIndex(h => h && h.date === d);
  if (idx !== -1) {
    s.fxHistory[idx] = { usdToCop: safeRate, date: d };
  } else {
    s.fxHistory.push({ usdToCop: safeRate, date: d });
  }
  // Orden ascendente por fecha para getFxRate.
  s.fxHistory.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  s.updatedAt = nowISO();
  saveDB(db);
  return s.fxRate;
}

// getFxRate(date): tasa vigente a la fecha (la mas reciente <= date). Si no se pasa
// fecha o no hay historico aplicable, devuelve la tasa actual.
export function getFxRate(date) {
  const s = getDB().settings;
  const current = (s.fxRate && num(s.fxRate.usdToCop)) > 0 ? s.fxRate.usdToCop : 4000;

  if (!date || typeof date !== 'string') return current;

  const hist = Array.isArray(s.fxHistory) ? s.fxHistory : [];
  let best = null;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (!h || typeof h.date !== 'string') continue;
    if (h.date <= date) {
      if (best === null || h.date > best.date) best = h;
    }
  }
  if (best && num(best.usdToCop) > 0) return best.usdToCop;
  return current;
}

// convertUsdToCop(amountUsd, date): convierte usando la tasa vigente a esa fecha.
export function convertUsdToCop(amountUsd, date) {
  const usd = num(amountUsd, 0);
  const rate = getFxRate(date);
  return usd * rate;
}
