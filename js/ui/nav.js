// ============================================================================
// XAURA · js/ui/nav.js
// Bottom nav flotante de 5 con FAB central de registro (SPEC §5.1).
// Items: Inicio · Personal · [+ Registrar (FAB)] · Trading · Ajustes.
// Iconos SVG inline estilo lineal (Tabler). Estado activo con punto dorado.
//
// Exports:
//   mountNav()           -> pinta el <nav id="bottomnav">
//   setActive(route)     -> marca el item correspondiente a la ruta/hash
// ============================================================================

const NAV_ID = 'bottomnav';

/* ---- iconos lineales (Tabler) -------------------------------------------- */
const ICONS = {
  inicio:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h6v8H4z"/><path d="M4 16h6v4H4z"/><path d="M14 4h6v4h-6z"/><path d="M14 12h6v8h-6z"/></svg>',
  personal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h12a2 2 0 0 1 2 2v2"/><path d="M20 12v4h-4a2 2 0 0 1 0-4z"/><path d="M5 7v10a2 2 0 0 0 2 2h13v-3"/></svg>',
  trading:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v17a1 1 0 0 0 1 1h16"/><path d="M9 14v-3a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v3"/><path d="M10 8v2"/><path d="M10 15v2"/><path d="M16 11V8a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v3"/><path d="M17 5v2"/><path d="M17 12v2"/></svg>',
  ajustes:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.3a1.9 1.9 0 0 1 3.4 0 1.9 1.9 0 0 0 2.8 1.2 1.9 1.9 0 0 1 2.6 2.6 1.9 1.9 0 0 0 1.2 2.8 1.9 1.9 0 0 1 0 3.4 1.9 1.9 0 0 0-1.2 2.8 1.9 1.9 0 0 1-2.6 2.6 1.9 1.9 0 0 0-2.8 1.2 1.9 1.9 0 0 1-3.4 0 1.9 1.9 0 0 0-2.8-1.2 1.9 1.9 0 0 1-2.6-2.6 1.9 1.9 0 0 0-1.2-2.8 1.9 1.9 0 0 1 0-3.4 1.9 1.9 0 0 0 1.2-2.8 1.9 1.9 0 0 1 2.6-2.6 1.9 1.9 0 0 0 2.8-1.2z"/><circle cx="12" cy="12" r="3"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
};

/* ---- definición de los 4 items + el FAB ---------------------------------- */
// El FAB ('registrar') se intercala en la posición central (índice 2).
const ITEMS = [
  { key: 'inicio', route: '#/inicio', label: 'Inicio', icon: ICONS.inicio },
  { key: 'personal', route: '#/personal', label: 'Personal', icon: ICONS.personal },
  { key: 'registrar', route: '#/registrar', label: 'Registrar', fab: true, icon: ICONS.plus },
  { key: 'trading', route: '#/trading', label: 'Trading', icon: ICONS.trading },
  { key: 'ajustes', route: '#/ajustes', label: 'Ajustes', icon: ICONS.ajustes },
];

// Mapea cualquier hash a la clave de item activo (Eventos resalta Personal).
const ROUTE_TO_KEY = {
  inicio: 'inicio',
  personal: 'personal',
  eventos: 'personal',
  trading: 'trading',
  ajustes: 'ajustes',
};

function getNav() {
  return document.getElementById(NAV_ID);
}

// Navega cambiando el hash (deja al router hacer el resto).
function go(route) {
  if (location.hash === route) {
    // Mismo destino: fuerza un refresco suave volviendo arriba.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = route;
}

/* ============================================================================
 *  mountNav() — construye el contenido del bottom nav una sola vez.
 * ========================================================================== */
export function mountNav() {
  const nav = getNav();
  if (!nav) return;

  nav.replaceChildren();

  for (const item of ITEMS) {
    if (item.fab) {
      nav.appendChild(buildFab(item));
    } else {
      nav.appendChild(buildNavItem(item));
    }
  }

  // Estado activo inicial según el hash vigente.
  setActive(location.hash || '#/inicio');
}

/* ---- item normal ---------------------------------------------------------- */
function buildNavItem(item) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'navitem';
  btn.dataset.key = item.key;
  btn.dataset.route = item.route;
  btn.setAttribute('aria-label', item.label);

  const icon = document.createElement('span');
  icon.className = 'navitem__icon';
  icon.innerHTML = item.icon;

  const label = document.createElement('span');
  label.className = 'navitem__label';
  label.textContent = item.label;

  btn.appendChild(icon);
  btn.appendChild(label);
  btn.addEventListener('click', () => go(item.route));
  return btn;
}

/* ---- FAB central ---------------------------------------------------------- */
function buildFab(item) {
  // Slot que ocupa la celda central del grid; el FAB flota sobre la barra.
  const slot = document.createElement('div');
  slot.className = 'navfab__slot';

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'navfab pressable';
  fab.dataset.key = item.key;
  fab.setAttribute('aria-label', item.label);
  fab.innerHTML = item.icon;
  fab.addEventListener('click', () => {
    // Háptica opcional al abrir el registro.
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (_e) { /* sin háptica */ }
    go(item.route);
  });

  slot.appendChild(fab);
  return slot;
}

/* ============================================================================
 *  setActive(route) — marca .navitem--active según el hash/ruta.
 *  Acepta "#/personal/stats", "personal", "/personal", etc.
 * ========================================================================== */
export function setActive(route) {
  const nav = getNav();
  if (!nav) return;

  const key = keyForRoute(route);

  const items = nav.querySelectorAll('.navitem');
  items.forEach((el) => {
    if (el.dataset.key === key) {
      el.classList.add('navitem--active');
      el.setAttribute('aria-current', 'page');
    } else {
      el.classList.remove('navitem--active');
      el.removeAttribute('aria-current');
    }
  });
}

// Extrae el segmento base del hash y lo mapea a la clave de item activo.
function keyForRoute(route) {
  let r = String(route || '').trim();
  r = r.replace(/^#/, '').replace(/^\//, ''); // quita "#" y "/" inicial
  const seg = r.split(/[/?]/)[0] || 'inicio';  // primer segmento
  return ROUTE_TO_KEY[seg] || (seg === 'registrar' ? null : 'inicio');
}
