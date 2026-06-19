// ============================================================================
// XAURA · js/core/fx.js
// Actualización AUTOMÁTICA de la tasa de cambio USD → COP desde APIs públicas
// gratuitas (sin clave, con CORS). Best-effort: tolerante a fallos y a estar
// sin conexión (conserva la última tasa conocida). No bloquea el arranque.
//
// Fuentes (se prueban en orden hasta que una responda):
//   1. open.er-api.com  → { rates: { COP } }
//   2. currency-api (jsDelivr CDN) → { usd: { cop } }
//   3. currency-api (mirror pages.dev) → { usd: { cop } }
//
// Las tasas de estas fuentes son del mercado (referencia diaria/intradía), no
// tick a tick (eso requeriría un feed pago). Para conversión de saldos es lo
// adecuado.
// ============================================================================

import { getSettings, setFxRate } from './settings.js';
import { hoy } from './dates.js';

const SOURCES = [
  {
    name: 'er-api',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (j) => (j && j.rates && Number(j.rates.COP)) || null,
  },
  {
    name: 'currency-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    parse: (j) => (j && j.usd && Number(j.usd.cop)) || null,
  },
  {
    name: 'currency-api-mirror',
    url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
    parse: (j) => (j && j.usd && Number(j.usd.cop)) || null,
  },
];

// No re-consultar en auto si la última actualización automática es muy reciente.
const THROTTLE_MS = 30 * 60 * 1000; // 30 minutos

function isOnline() {
  return !(typeof navigator !== 'undefined' && navigator.onLine === false);
}

// fetchLiveRate(): intenta cada fuente; devuelve { ok, rate, source } o { ok:false }.
export async function fetchLiveRate({ timeoutMs = 7000 } = {}) {
  for (const src of SOURCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(src.url, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res || !res.ok) continue;
      const json = await res.json();
      const rate = src.parse(json);
      if (rate && rate > 0 && isFinite(rate)) {
        return { ok: true, rate: Math.round(rate * 100) / 100, source: src.name };
      }
    } catch (_e) {
      // Timeout/CORS/red → probar la siguiente fuente.
    }
  }
  return { ok: false };
}

// ¿Conviene auto-actualizar ahora? (auto activado, en línea y fuera del throttle)
export function shouldAutoUpdate() {
  const s = getSettings();
  if (s.fxAuto === false) return false;
  if (!isOnline()) return false;
  const fx = s.fxRate || {};
  if (fx.manual === false && fx.fetchedAt) {
    const age = Date.now() - new Date(fx.fetchedAt).getTime();
    if (isFinite(age) && age >= 0 && age < THROTTLE_MS) return false;
  }
  return true;
}

let _inflight = null;

// autoUpdateRate({force}): actualiza la tasa si procede. Con force ignora el
// toggle de auto y el throttle (para el botón "Actualizar ahora"). Devuelve
// { ok, rate, source } | { ok:false, reason }.
export async function autoUpdateRate({ force = false } = {}) {
  if (!isOnline()) return { ok: false, reason: 'offline' };
  if (!force) {
    const s = getSettings();
    if (s.fxAuto === false) return { ok: false, reason: 'disabled' };
    if (!shouldAutoUpdate()) return { ok: false, reason: 'fresh' };
  }
  if (_inflight) return _inflight;

  _inflight = (async () => {
    const r = await fetchLiveRate();
    if (r.ok) {
      setFxRate(r.rate, hoy(), {
        manual: false,
        source: r.source,
        fetchedAt: new Date().toISOString(),
      });
    }
    _inflight = null;
    return r.ok ? { ok: true, rate: r.rate, source: r.source } : { ok: false, reason: 'fetch-failed' };
  })();

  return _inflight;
}
