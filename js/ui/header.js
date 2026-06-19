// ============================================================================
// XAURA · js/ui/header.js
// Cabecera de pantalla reutilizable. Pinta el <header id="appheader"> con
// título (serif), subtítulo opcional, navegación de día (← fecha →) y acciones
// a la derecha. Cada vista llama a setHeader({...}) en su render() y a
// clearHeader() (o setHeader del entrante) al cambiar.
//
// Firma (SPEC FASE 3):
//   setHeader({ title, subtitle, date, onPrevDay, onNextDay, actions[] })
//   clearHeader()
//
// actions[]: array de descriptores de botón:
//   { icon?: '<svg…>'|nodo, label?: string, onClick: fn, variant?: 'gold'|'ghost' }
// ============================================================================

import { formatDateEs, isToday } from '../core/dates.js';

const HEADER_ID = 'appheader';

/* ---- iconos lineales (Tabler) usados por la navegación de día ------------- */
const ICON_CHEVRON_LEFT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ICON_CHEVRON_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

/* ---- utilidades ----------------------------------------------------------- */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined && html !== null) n.innerHTML = html;
  return n;
}

function getHeader() {
  return document.getElementById(HEADER_ID);
}

/* ============================================================================
 *  setHeader(opts)
 *  Reconstruye el contenido interno del header. Idempotente: cada llamada
 *  reemplaza por completo el .header-inner.
 * ========================================================================== */
export function setHeader(opts) {
  const header = getHeader();
  if (!header) return;

  const o = opts || {};
  const title = typeof o.title === 'string' ? o.title : '';
  const subtitle = typeof o.subtitle === 'string' ? o.subtitle : '';
  const date = (typeof o.date === 'string' && o.date) ? o.date : null;
  const onPrevDay = typeof o.onPrevDay === 'function' ? o.onPrevDay : null;
  const onNextDay = typeof o.onNextDay === 'function' ? o.onNextDay : null;
  const actions = Array.isArray(o.actions) ? o.actions : [];

  header.classList.remove('hidden');

  // Contenedor interno centrado dentro del max-width del shell.
  const inner = el('div', 'header-inner');

  // --- Bloque de títulos (izquierda) ---
  const titles = el('div', 'header-titles');
  if (subtitle) {
    titles.appendChild(el('div', 'header-eyebrow', escapeHtml(subtitle)));
  }
  const h = el('h1', 'header-title', escapeHtml(title));
  titles.appendChild(h);
  inner.appendChild(titles);

  // --- Bloque derecho: daynav (si hay fecha) + acciones ---
  const right = el('div', 'header-actions');

  if (date) {
    right.appendChild(buildDayNav(date, onPrevDay, onNextDay));
  }

  for (let i = 0; i < actions.length; i++) {
    const btn = buildActionButton(actions[i]);
    if (btn) right.appendChild(btn);
  }

  if (right.childNodes.length > 0) inner.appendChild(right);

  // Reemplaza el contenido del header de una sola vez.
  header.replaceChildren(inner);
}

/* ---- navegación de día (← fecha →) --------------------------------------- */
function buildDayNav(date, onPrev, onNext) {
  const nav = el('div', 'daynav');

  const prev = el('button', 'daynav__btn pressable', ICON_CHEVRON_LEFT);
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Día anterior');
  if (onPrev) {
    prev.addEventListener('click', () => onPrev());
  } else {
    prev.disabled = true;
    prev.classList.add('hidden');
  }

  const today = isToday(date);
  const label = el(
    'span',
    'daynav__label' + (today ? ' daynav__label--today' : ''),
    today ? 'Hoy' : escapeHtml(formatDateEs(date, { weekday: true }))
  );

  const next = el('button', 'daynav__btn pressable', ICON_CHEVRON_RIGHT);
  next.type = 'button';
  next.setAttribute('aria-label', 'Día siguiente');
  if (onNext) {
    next.addEventListener('click', () => onNext());
  } else {
    next.disabled = true;
    next.classList.add('hidden');
  }

  nav.appendChild(prev);
  nav.appendChild(label);
  nav.appendChild(next);
  return nav;
}

/* ---- botón de acción de cabecera ----------------------------------------- */
function buildActionButton(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const variant = spec.variant === 'gold' ? ' header-btn--gold' : '';
  const btn = el('button', 'header-btn pressable' + variant);
  btn.type = 'button';

  if (spec.icon) {
    const iconWrap = el('span', 'header-btn__icon');
    if (typeof spec.icon === 'string') iconWrap.innerHTML = spec.icon;
    else if (spec.icon instanceof Node) iconWrap.appendChild(spec.icon);
    btn.appendChild(iconWrap);
  }
  if (spec.label) {
    btn.appendChild(el('span', 'header-btn__label', escapeHtml(spec.label)));
  }
  if (spec.label) btn.setAttribute('aria-label', spec.label);
  else if (spec.ariaLabel) btn.setAttribute('aria-label', spec.ariaLabel);

  if (typeof spec.onClick === 'function') {
    btn.addEventListener('click', (e) => spec.onClick(e));
  }
  return btn;
}

/* ============================================================================
 *  clearHeader() — deja el header en estado base (solo la marca XAURA).
 * ========================================================================== */
export function clearHeader() {
  const header = getHeader();
  if (!header) return;
  const inner = el('div', 'header-inner');
  const brand = el('span', 'app-brand', 'X<span class="brand-aura">A</span>URA');
  inner.appendChild(brand);
  header.replaceChildren(inner);
  header.classList.remove('hidden');
}

/* ---- escape HTML defensivo ------------------------------------------------ */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
