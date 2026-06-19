// ============================================================================
// XAURA · js/ui/keypad.js
// Ayuda de entrada de montos: formateo en vivo del input mientras se escribe.
//   - COP: separador de miles (punto), sin decimales.
//   - USD: separador de miles (coma), hasta 2 decimales (punto decimal).
// Establece inputmode="decimal", filtra caracteres y mantiene el cursor estable.
// Reutiliza toNum/round2 de core/currency.js para el parseo robusto.
//
// Exports:
//   attachAmountInput(inputEl, { currency, onChange, max }) → controlador
//   parseAmount(str, currency) → number
//   formatLiveAmount(str|number, currency) → string  (formato visible)
// ============================================================================

import { toNum, round2 } from '../core/currency.js';

// ---------------------------------------------------------------------------
// parseAmount — convierte la cadena visible del input a número plano.
// COP → entero; USD → 2 decimales. Protegido contra NaN.
// ---------------------------------------------------------------------------
export function parseAmount(str, currency = 'COP') {
  const cur = String(currency).toUpperCase();
  if (typeof str === 'number') {
    return cur === 'USD' ? round2(str) : Math.round(toNum(str));
  }
  const s = String(str == null ? '' : str).trim();
  if (s === '') return 0;

  let raw;
  if (cur === 'USD') {
    // Formato en-US visible: "1,025.40". Coma = miles, punto = decimal.
    raw = s.replace(/[^\d.]/g, '');           // quita comas de miles y símbolos
    const firstDot = raw.indexOf('.');
    if (firstDot > -1) {
      // Conserva solo el primer punto como decimal.
      raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    }
    const n = parseFloat(raw);
    return Number.isFinite(n) ? round2(n) : 0;
  }
  // COP: formato es-CO "2.000.000". Punto = miles, sin decimales.
  raw = s.replace(/[^\d]/g, '');
  if (raw === '') return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// formatLiveAmount — formatea el valor para mostrarlo en el input.
// Acepta el string crudo del usuario o un número.
// Devuelve la cadena visible (sin símbolo de moneda; el símbolo va aparte
// en .amount-line__cur).
// ---------------------------------------------------------------------------
export function formatLiveAmount(input, currency = 'COP') {
  const cur = String(currency).toUpperCase();

  if (cur === 'USD') {
    return formatUsdLive(input);
  }
  return formatCopLive(input);
}

// --- COP: solo dígitos, agrupa miles con punto. ---
function formatCopLive(input) {
  let digits;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return '';
    digits = String(Math.round(Math.abs(input)));
  } else {
    digits = String(input == null ? '' : input).replace(/[^\d]/g, '');
  }
  // Evita ceros a la izquierda múltiples ("007" → "7"), pero conserva "0".
  digits = digits.replace(/^0+(?=\d)/, '');
  if (digits === '') return '';
  return groupThousands(digits, '.');
}

// --- USD: dígitos + 1 punto decimal (máx 2 decimales), miles con coma. ---
function formatUsdLive(input) {
  let s;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return '';
    const v = round2(Math.abs(input));
    // Representación con punto decimal.
    s = v.toString();
  } else {
    s = String(input == null ? '' : input);
    // Conserva dígitos y el primer punto.
    s = s.replace(/[^\d.]/g, '');
    const firstDot = s.indexOf('.');
    if (firstDot > -1) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    }
  }

  let [intPart = '', decPart] = s.split('.');
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const hasDot = s.indexOf('.') > -1;
  if (intPart === '' && (hasDot || decPart != null)) intPart = '0';

  const groupedInt = intPart === '' ? '' : groupThousands(intPart, ',');

  if (hasDot) {
    const dec = (decPart || '').slice(0, 2);
    return groupedInt + '.' + dec;
  }
  return groupedInt;
}

// Agrupa una cadena de dígitos con el separador indicado.
function groupThousands(digits, sep) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// ---------------------------------------------------------------------------
// attachAmountInput — engancha el formateo en vivo a un <input>.
// opts:
//   currency: 'COP' | 'USD'           (default 'COP')
//   onChange(value:number, raw:string) callback opcional en cada cambio
//   max: número máximo permitido (recorta si se excede)
// Devuelve un controlador con: { getValue, setValue, setCurrency, destroy }.
// ---------------------------------------------------------------------------
export function attachAmountInput(inputEl, opts = {}) {
  if (!inputEl) {
    return {
      getValue: () => 0,
      setValue: () => {},
      setCurrency: () => {},
      destroy: () => {},
    };
  }

  let currency = String(opts.currency || 'COP').toUpperCase();
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
  const max = typeof opts.max === 'number' && Number.isFinite(opts.max) ? opts.max : null;

  // Configurar atributos de teclado/entrada nativos.
  inputEl.setAttribute('inputmode', 'decimal');
  inputEl.setAttribute('autocomplete', 'off');
  inputEl.setAttribute('spellcheck', 'false');
  inputEl.setAttribute('enterkeyhint', 'done');
  // Pista de patrón: para USD permite punto decimal.
  inputEl.setAttribute('pattern', currency === 'USD' ? '[0-9.,]*' : '[0-9.]*');
  if (!inputEl.getAttribute('aria-label')) {
    inputEl.setAttribute('aria-label', currency === 'USD' ? 'Monto en dólares' : 'Monto en pesos');
  }

  // Reformatea respetando la posición del cursor (cuenta de dígitos a la izquierda).
  function reformat() {
    const el = inputEl;
    const prev = el.value;
    const selStart = el.selectionStart == null ? prev.length : el.selectionStart;

    // Cuántos caracteres "de contenido" (dígitos y punto decimal) hay antes del cursor.
    const isContent = (ch) => /[\d.]/.test(ch);
    let contentBefore = 0;
    for (let i = 0; i < selStart && i < prev.length; i++) {
      if (isContent(prev[i])) contentBefore++;
    }

    const formatted = formatLiveAmount(prev, currency);

    // Reaplicar tope máximo si corresponde.
    let finalStr = formatted;
    if (max != null) {
      const v = parseAmount(formatted, currency);
      if (v > max) finalStr = formatLiveAmount(max, currency);
    }

    if (finalStr !== prev) {
      el.value = finalStr;
      // Reposicionar el cursor tras el mismo número de caracteres de contenido.
      let pos = 0;
      let seen = 0;
      while (pos < finalStr.length && seen < contentBefore) {
        if (isContent(finalStr[pos])) seen++;
        pos++;
      }
      try { el.setSelectionRange(pos, pos); } catch (_) { /* noop */ }
    }

    if (onChange) onChange(parseAmount(el.value, currency), el.value);
  }

  function onInput() { reformat(); }

  function onBlur() {
    // Normaliza al salir (p.ej. "1." → "1", "0" → "" si vacío lógico se mantiene).
    const v = parseAmount(inputEl.value, currency);
    if (inputEl.value.trim() !== '' && v === 0 && currency === 'COP') {
      inputEl.value = '';
    } else if (inputEl.value.trim() !== '') {
      inputEl.value = formatLiveAmount(inputEl.value, currency);
    }
    if (onChange) onChange(parseAmount(inputEl.value, currency), inputEl.value);
  }

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('blur', onBlur);

  // Valor inicial (si el input ya trae algo).
  if (inputEl.value && inputEl.value.trim() !== '') {
    inputEl.value = formatLiveAmount(inputEl.value, currency);
  }

  return {
    getValue: () => parseAmount(inputEl.value, currency),
    setValue: (n) => {
      const num = currency === 'USD' ? round2(n) : Math.round(toNum(n));
      inputEl.value = num === 0 ? '' : formatLiveAmount(num, currency);
      if (onChange) onChange(parseAmount(inputEl.value, currency), inputEl.value);
    },
    setCurrency: (newCur) => {
      const cur = String(newCur || 'COP').toUpperCase();
      if (cur === currency) return;
      const current = parseAmount(inputEl.value, currency); // valor numérico actual
      currency = cur;
      inputEl.setAttribute('pattern', currency === 'USD' ? '[0-9.,]*' : '[0-9.]*');
      const num = currency === 'USD' ? round2(current) : Math.round(current);
      inputEl.value = num === 0 ? '' : formatLiveAmount(num, currency);
      if (onChange) onChange(parseAmount(inputEl.value, currency), inputEl.value);
    },
    destroy: () => {
      inputEl.removeEventListener('input', onInput);
      inputEl.removeEventListener('blur', onBlur);
    },
  };
}

export default { attachAmountInput, parseAmount, formatLiveAmount };
