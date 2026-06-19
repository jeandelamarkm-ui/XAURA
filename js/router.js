// ============================================================================
// XAURA · js/router.js
// Router por hash (SPEC §5.2). Tabla de rutas -> módulo de vista (import dinámico
// lazy). Cada vista cumple el contrato { render(params), unmount() }.
//
// Al cambiar de hash:
//   1. parsea ruta base + subruta + query (?fecha=&id=&tab=…)
//   2. si la ruta es '#/registrar' -> abre overlay de registro SIN tocar la
//      vista de fondo (la vista previa permanece montada).
//   3. si no, desmonta la vista saliente, limpia #view, monta la entrante,
//      marca el item activo del nav y hace scroll-to-top.
//   4. ruta por defecto: '#/inicio'.
//
// Exports:
//   startRouter()  -> arranca la escucha de hashchange y resuelve el hash actual
//   navigate(hash) -> cambia el hash (helper)
//   currentRoute() -> { name, sub, params } de la vista de fondo activa
//   parseHash(hash)-> utilidad de parseo (expuesta para pruebas/llamadas)
// ============================================================================

import { setActive } from './ui/nav.js';

/* ============================================================================
 *  TABLA DE RUTAS  (SPEC §5.2)
 *  Cada entrada: () => import dinámico del módulo de vista.
 *  Cada módulo expone { render(params), unmount() }.
 * ========================================================================== */
const ROUTES = {
  inicio: () => import('./views/dashboard.js'),
  personal: () => import('./views/personal.js'),
  eventos: () => import('./views/eventos.js'),
  trading: () => import('./views/trading.js'),
  ajustes: () => import('./views/ajustes.js'),
};

const DEFAULT_ROUTE = 'inicio';
const VIEW_EL_ID = 'view';

/* ============================================================================
 *  ESTADO INTERNO
 * ========================================================================== */
let _currentView = null;     // módulo de vista actualmente montado
let _currentName = null;     // nombre de ruta base montado (ej. 'personal')
let _currentParams = null;   // params con los que se montó
let _registroOpen = false;   // overlay de registro abierto
let _navToken = 0;           // token para descartar navegaciones obsoletas (async)
let _started = false;

/* ============================================================================
 *  PARSEO DEL HASH
 *  '#/personal/stats?fecha=2026-06-19&id=evt_000001&tab=movimientos'
 *  -> { name:'personal', sub:'stats', params:{ fecha, id, tab, sub:'stats' } }
 * ========================================================================== */
export function parseHash(hash) {
  let h = typeof hash === 'string' ? hash : (location.hash || '');
  h = h.replace(/^#/, '');
  if (!h) h = '/' + DEFAULT_ROUTE;

  const qIdx = h.indexOf('?');
  const pathPart = qIdx === -1 ? h : h.slice(0, qIdx);
  const queryPart = qIdx === -1 ? '' : h.slice(qIdx + 1);

  const segments = pathPart.split('/').filter(Boolean);
  const name = segments[0] || DEFAULT_ROUTE;
  const sub = segments[1] || null;
  const rest = segments.slice(2);

  // Query -> objeto
  const params = {};
  if (queryPart) {
    const sp = new URLSearchParams(queryPart);
    for (const [k, v] of sp.entries()) params[k] = v;
  }

  // Conveniencias: subruta y segmentos crudos disponibles para la vista.
  params.sub = sub;
  params.segments = segments.slice(1); // todo después del nombre base
  params.rest = rest;

  return { name, sub, params, raw: h };
}

/* ============================================================================
 *  navigate(hash) — cambia el hash de forma segura.
 * ========================================================================== */
export function navigate(hash) {
  let target = String(hash || '');
  if (!target.startsWith('#')) target = '#' + (target.startsWith('/') ? target : '/' + target);
  if (location.hash === target) {
    // Mismo hash: re-dispara la resolución manualmente.
    resolve();
  } else {
    location.hash = target;
  }
}

export function currentRoute() {
  return { name: _currentName, sub: _currentParams ? _currentParams.sub : null, params: _currentParams };
}

/* ============================================================================
 *  startRouter() — engancha la escucha y resuelve el estado inicial.
 * ========================================================================== */
export function startRouter() {
  if (_started) {
    resolve();
    return;
  }
  _started = true;
  window.addEventListener('hashchange', resolve);
  // Si no hay hash, fija el por defecto (dispara hashchange y resuelve).
  if (!location.hash) {
    location.replace('#/' + DEFAULT_ROUTE);
  }
  resolve();
}

/* ============================================================================
 *  resolve() — núcleo: lee el hash, decide overlay vs vista y conmuta.
 * ========================================================================== */
function resolve() {
  const { name, params } = parseHash(location.hash);

  // --- Caso overlay de registro: NO cambia la vista de fondo ---
  if (name === 'registrar') {
    openRegistroOverlay(params);
    // El nav no marca "registrar" como activo (mantiene el de fondo).
    setActive(location.hash);
    return;
  }

  // Si veníamos del overlay de registro, ya no aplica.
  _registroOpen = false;

  // --- Ruta desconocida: redirige al default sin romper ---
  const loader = ROUTES[name] ? ROUTES[name] : ROUTES[DEFAULT_ROUTE];
  const resolvedName = ROUTES[name] ? name : DEFAULT_ROUTE;

  mountView(resolvedName, loader, params);
}

/* ============================================================================
 *  mountView() — desmonta la saliente y monta la entrante (async-safe).
 * ========================================================================== */
function mountView(name, loader, params) {
  const token = ++_navToken;

  // 1) Desmonta la vista saliente (siempre, aunque sea la misma ruta: las
  //    vistas se re-renderizan limpio para reflejar params nuevos).
  teardownCurrent();

  // 2) Marca el item activo del nav de inmediato (respuesta visual).
  setActive(name);

  // 3) Carga perezosa del módulo de vista.
  loader()
    .then((mod) => {
      // Navegación obsoleta (el usuario ya cambió de ruta): descarta.
      if (token !== _navToken) return;

      const view = mod && (mod.default && typeof mod.default.render === 'function' ? mod.default : mod);
      if (!view || typeof view.render !== 'function') {
        renderError('Vista no disponible: ' + name);
        return;
      }

      _currentView = view;
      _currentName = name;
      _currentParams = params;

      try {
        view.render(params);
      } catch (err) {
        renderError('Error al mostrar la vista.');
        // eslint-disable-next-line no-console
        if (typeof console !== 'undefined') console.error('[router] render', name, err);
      }

      scrollTop();
    })
    .catch((err) => {
      if (token !== _navToken) return;
      renderError('No se pudo cargar la sección.');
      if (typeof console !== 'undefined') console.error('[router] import', name, err);
    });
}

/* ---- desmonta la vista actual y limpia el contenedor --------------------- */
function teardownCurrent() {
  if (_currentView && typeof _currentView.unmount === 'function') {
    try { _currentView.unmount(); } catch (_e) { /* tolerante */ }
  }
  _currentView = null;
  _currentName = null;
  _currentParams = null;

  const view = document.getElementById(VIEW_EL_ID);
  if (view) view.replaceChildren();
}

/* ---- scroll al tope del contenedor de vistas y de la ventana -------------- */
function scrollTop() {
  const view = document.getElementById(VIEW_EL_ID);
  if (view && typeof view.scrollTo === 'function') {
    try { view.scrollTo({ top: 0, behavior: 'auto' }); } catch (_e) { view.scrollTop = 0; }
  }
  try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (_e) { window.scrollTo(0, 0); }
}

/* ---- mensaje de error mínimo dentro del contenedor de vistas -------------- */
function renderError(msg) {
  const view = document.getElementById(VIEW_EL_ID);
  if (!view) return;
  view.replaceChildren();
  const box = document.createElement('div');
  box.className = 'route-error enter';
  box.innerHTML =
    '<p class="x-h3" style="margin-bottom:8px;">Algo salió mal</p>' +
    '<p class="x-body">' + escapeHtml(msg) + '</p>' +
    '<button type="button" class="btn btn--ghost pressable" style="margin-top:16px;">Volver a Inicio</button>';
  const btn = box.querySelector('button');
  if (btn) btn.addEventListener('click', () => navigate('#/inicio'));
  view.appendChild(box);
}

/* ============================================================================
 *  OVERLAY DE REGISTRO  ('#/registrar')
 *  Import dinámico de views/registro.js -> openRegistro(params).
 *  Al cerrarse, la vista de registro debe devolver el hash al previo
 *  (responsabilidad del módulo de registro); si no existe el módulo todavía,
 *  degradamos volviendo a la vista de fondo sin romper la app.
 * ========================================================================== */
function openRegistroOverlay(params) {
  if (_registroOpen) return;
  _registroOpen = true;

  // Recuerda el hash de fondo para que el registro pueda restaurarlo al cerrar.
  const back = (_currentName ? '#/' + _currentName : '#/' + DEFAULT_ROUTE);

  import('./views/registro.js')
    .then((mod) => {
      const open = mod && (typeof mod.openRegistro === 'function'
        ? mod.openRegistro
        : (mod.default && typeof mod.default.openRegistro === 'function' ? mod.default.openRegistro : null));
      if (!open) {
        _registroOpen = false;
        navigate(back);
        return;
      }
      // Pasa el hash de retorno para que el sheet lo restaure al cerrar.
      const enriched = Object.assign({}, params, { back });
      try {
        open(enriched);
      } catch (err) {
        _registroOpen = false;
        if (typeof console !== 'undefined') console.error('[router] openRegistro', err);
        navigate(back);
      }
    })
    .catch((err) => {
      _registroOpen = false;
      if (typeof console !== 'undefined') console.error('[router] import registro', err);
      navigate(back);
    });
}

/* ---- escape HTML ---------------------------------------------------------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
