// ============================================================================
// XAURA · js/ui/empty.js
// Estados vacíos premium (SPEC §9): icono de línea + frase breve + 1 CTA.
// Sin dependencias. Iconos SVG de línea inline. Accesible.
//
// Usa las clases reales de components.css:
//   .empty .empty__icon .empty__title .empty__text .empty__actions
//   .btn .btn--primary .btn--ghost .btn--outline
//
// Exports:
//   emptyState(el, { icon, title, message, ctaLabel, onCta, actions }) → node
// ============================================================================

// ---------------------------------------------------------------------------
// Biblioteca de iconos de línea (24x24, stroke currentColor, redondeado).
// Pensados para los estados vacíos descritos en el SPEC.
// ---------------------------------------------------------------------------
const ICONS = {
  // Rombo / "aura" (Dashboard sin datos).
  diamond:
    '<path d="M12 3l8 9-8 9-8-9z"/><path d="M12 3v18"/><path d="M4 12h16"/>',
  // Cartera (Personal sin movimientos).
  wallet:
    '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1"/><path d="M3 7v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3"/><path d="M21 11h-4a2 2 0 0 0 0 4h4z"/>',
  // Recibo / movimiento.
  receipt:
    '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  // Vela japonesa (Trading sin días).
  candle:
    '<path d="M8 4v4M8 16v4"/><rect x="6" y="8" width="4" height="8" rx="1"/><path d="M16 6v3M16 15v3"/><rect x="14" y="9" width="4" height="6" rx="1"/>',
  // Calendario (Eventos / calendario).
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  // Gráfico de líneas (Reportes / tendencias).
  chart:
    '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/>',
  // Estrella / evento destacado.
  star:
    '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z"/>',
  // Meta / diana.
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  // Caja / depósitos.
  box:
    '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  // Búsqueda (sin resultados de filtro).
  search:
    '<circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/>',
  // Carpeta vacía (genérico).
  folder:
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  // Sobre / mensaje.
  inbox:
    '<path d="M4 5h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
};

const ICON_ALIASES = {
  personal: 'wallet',
  eventos: 'star',
  trading: 'candle',
  movimiento: 'receipt',
  movimientos: 'receipt',
  reporte: 'chart',
  reportes: 'chart',
  meta: 'target',
  metas: 'target',
  caja: 'box',
  filtro: 'search',
  default: 'diamond',
};

function iconSvg(name) {
  const key = ICON_ALIASES[name] || name || 'diamond';
  const path = ICONS[key] || ICONS[ICON_ALIASES.default] || ICONS.diamond;
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' + path + '</svg>'
  );
}

// ---------------------------------------------------------------------------
// emptyState — pinta el estado vacío dentro de `el` (lo vacía primero).
// opts:
//   icon:     clave de ICONS o alias (default 'diamond')
//   title:    título editorial opcional (serif)
//   message:  frase breve (requerida idealmente)
//   ctaLabel: etiqueta del CTA principal
//   onCta:    callback del CTA principal
//   actions:  [{ label, onClick, variant }]  CTAs adicionales (o en vez del simple)
// Devuelve el nodo `.empty` creado.
// ---------------------------------------------------------------------------
export function emptyState(el, opts = {}) {
  const {
    icon = 'diamond',
    title = '',
    message = '',
    ctaLabel = '',
    onCta = null,
    actions = null,
  } = opts;

  const node = document.createElement('div');
  node.className = 'empty';
  node.setAttribute('role', 'status');

  // Icono.
  const ic = document.createElement('div');
  ic.className = 'empty__icon';
  ic.innerHTML = iconSvg(icon);
  node.appendChild(ic);

  // Título (opcional).
  if (title) {
    const h = document.createElement('div');
    h.className = 'empty__title';
    h.textContent = title;
    node.appendChild(h);
  }

  // Mensaje.
  if (message) {
    const p = document.createElement('p');
    p.className = 'empty__text';
    p.textContent = message;
    node.appendChild(p);
  }

  // Acciones.
  const actsList = [];
  if (Array.isArray(actions) && actions.length) {
    actions.forEach((a) => { if (a) actsList.push(a); });
  } else if (ctaLabel) {
    actsList.push({ label: ctaLabel, onClick: onCta, variant: 'primary' });
  }

  if (actsList.length) {
    const acts = document.createElement('div');
    acts.className = 'empty__actions';
    actsList.forEach((a) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--sm btn--' + (a.variant || 'primary');
      // Icono opcional dentro del botón.
      if (a.icon && ICONS[ICON_ALIASES[a.icon] || a.icon]) {
        btn.innerHTML = iconSvg(a.icon) + '<span>' + escapeHtml(a.label || '') + '</span>';
      } else {
        btn.textContent = a.label || '';
      }
      if (typeof a.onClick === 'function') {
        btn.addEventListener('click', (ev) => a.onClick(ev));
      }
      acts.appendChild(btn);
    });
    node.appendChild(acts);
  }

  // Montar: vaciar el contenedor y colocar el estado vacío.
  if (el) {
    el.innerHTML = '';
    el.appendChild(node);
  }

  return node;
}

// Escapa texto para uso en innerHTML cuando combinamos con SVG.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default { emptyState };
