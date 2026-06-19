// ============================================================================
// XAURA · js/core/currency.js
// Formato de moneda, porcentajes y números. Español (Colombia).
// COP sin decimales · USD con 2 decimales · cifras mono/tabular.
// Sin dependencias externas. Protegido contra NaN / Infinity / null.
// ============================================================================

const MASK = '••••••';

/**
 * Normaliza cualquier entrada numérica a un número finito.
 * Acepta number, string ("1.025,40" o "1025.40"), null, undefined.
 * Devuelve `fallback` (0 por defecto) si no se puede interpretar.
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function toNum(value, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return fallback;
    // Interpreta formato local: quita separadores de miles y normaliza coma decimal.
    // Heurística: si hay coma y punto, el último símbolo es el decimal.
    let normalized = s.replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        // coma decimal (es-CO): "1.025,40"
        normalized = normalized.replace(/\./g, '').replace(',', '.');
      } else {
        // punto decimal (en-US): "1,025.40"
        normalized = normalized.replace(/,/g, '');
      }
    } else if (lastComma > -1) {
      // solo coma: tratar como decimal si hay 1-2 dígitos tras ella, si no como miles
      const after = normalized.length - lastComma - 1;
      normalized = after > 0 && after <= 2
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    } else {
      // solo punto o sin separadores: dejar el punto como decimal
      // (no se eliminan puntos para no romper "1025.40")
    }
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/**
 * Redondeo seguro a 2 decimales (para USD).
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  const v = toNum(n);
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Formatea pesos colombianos: "$2.000.000" (es-CO, sin decimales).
 * @param {number} n
 * @returns {string}
 */
export function fmtCOP(n) {
  const v = Math.round(toNum(n));
  // Usa el valor absoluto para el formateo y antepone el signo manualmente,
  // garantizando "-$1.000" en vez de "$-1.000".
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return sign + '$' + abs.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Formatea dólares: "US$1,025.40" (en-US, 2 decimales).
 * @param {number} n
 * @returns {string}
 */
export function fmtUSD(n) {
  const v = round2(n);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return sign + 'US$' + abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea porcentaje en es-CO: "32,5 %".
 * @param {number} n  valor en puntos porcentuales (32.5 → "32,5 %")
 * @param {number} [d=1] decimales
 * @returns {string}
 */
export function fmtPct(n, d = 1) {
  const v = toNum(n);
  const dec = Math.max(0, Math.min(6, d | 0));
  return v.toLocaleString('es-CO', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }) + ' %';
}

/**
 * Antepone el signo explícito para valores positivos.
 * Envuelve un formateador (fmtCOP/fmtUSD/fmtPct) o un número.
 *
 *   fmtSigned(1500, fmtCOP)   → "+$1.500"
 *   fmtSigned(-1500, fmtCOP)  → "-$1.500"
 *   fmtSigned(0, fmtCOP)      → "$0"   (cero sin signo)
 *   fmtSigned(8.4, fmtPct)    → "+8,4 %"
 *
 * @param {number} n
 * @param {(x:number)=>string} [formatter=fmtCOP]
 * @returns {string}
 */
export function fmtSigned(n, formatter = fmtCOP) {
  const v = toNum(n);
  const fmt = typeof formatter === 'function' ? formatter : fmtCOP;
  if (v > 0) return '+' + fmt(v);
  // Los formateadores ya producen el "-" para negativos.
  return fmt(v);
}

/**
 * Convierte USD a COP con la tasa indicada (número plano, sin formato).
 * @param {number} usd
 * @param {number} rate  usdToCop
 * @returns {number} COP (redondeado a entero)
 */
export function convertUsdToCop(usd, rate) {
  const u = toNum(usd);
  const r = toNum(rate);
  if (r <= 0) return 0;
  return Math.round(u * r);
}

/**
 * Devuelve la máscara de saldo oculto si corresponde, o el valor formateado.
 *
 *   maskValue(2000000, fmtCOP, settings)  → "$2.000.000"  o  "••••••"
 *
 * Respeta settings.ui.hideBalances. `settings` puede ser:
 *   - el objeto settings completo ({ ui: { hideBalances } })
 *   - directamente un booleano (true = ocultar)
 *   - undefined (no oculta)
 *
 * @param {number} n
 * @param {(x:number)=>string} [formatter=fmtCOP]
 * @param {object|boolean} [settings]
 * @returns {string}
 */
export function maskValue(n, formatter = fmtCOP, settings) {
  const fmt = typeof formatter === 'function' ? formatter : fmtCOP;
  let hide = false;
  if (typeof settings === 'boolean') {
    hide = settings;
  } else if (settings && settings.ui && typeof settings.ui.hideBalances === 'boolean') {
    hide = settings.ui.hideBalances;
  }
  return hide ? MASK : fmt(toNum(n));
}

/**
 * Formato compacto para ejes de gráficos (abreviaturas k / M / MM para COP).
 * Pensado para etiquetas de eje, no para cifras de detalle.
 *
 *   formatNum(2500000)   → "$2,5 M"
 *   formatNum(45000)     → "$45 k"
 *   formatNum(980)       → "$980"
 *   formatNum(-1200000)  → "-$1,2 M"
 *   formatNum(1025.4, { currency: 'USD' }) → "US$1.025"
 *   formatNum(45000, { prefix: false })    → "45 k"
 *
 * @param {number} n
 * @param {object} [opts]
 * @param {'COP'|'USD'} [opts.currency='COP']
 * @param {boolean} [opts.prefix=true]  anteponer símbolo de moneda
 * @returns {string}
 */
export function formatNum(n, opts = {}) {
  const { currency = 'COP', prefix = true } = opts;
  const v = toNum(n);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const sym = prefix ? (currency === 'USD' ? 'US$' : '$') : '';

  const fmtShort = (val, suffix, decimals) => {
    // Una decimal solo si aporta (evita "2,0 M" → "2 M").
    const rounded = Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const isInt = rounded === Math.trunc(rounded);
    const txt = rounded.toLocaleString('es-CO', {
      minimumFractionDigits: isInt ? 0 : decimals,
      maximumFractionDigits: decimals,
    });
    return sign + sym + txt + suffix;
  };

  if (abs >= 1e12) return fmtShort(abs / 1e12, ' B', 1);   // billón (10^12)
  if (abs >= 1e9)  return fmtShort(abs / 1e9, ' MM', 1);   // mil millones
  if (abs >= 1e6)  return fmtShort(abs / 1e6, ' M', 1);    // millón
  if (abs >= 1e3)  return fmtShort(abs / 1e3, ' k', abs >= 1e4 ? 0 : 1);

  // Menores a mil: entero, sin abreviar.
  return sign + sym + Math.round(abs).toLocaleString('es-CO');
}

// Conveniencia: símbolo de máscara reutilizable.
export const BALANCE_MASK = MASK;
