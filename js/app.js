// ============================================================================
// XAURA · js/app.js
// Bootstrap de la aplicación (SPEC §3, §5, §9, §10).
//
// Responsabilidades:
//   1. Cargar el DB (loadDB ya migra/repara forma) y dejarlo listo.
//   2. Registrar el service worker (./sw.js) para offline.
//   3. Aplicar el tema (data-theme en <html>), respetando 'auto'.
//   4. Montar nav + header.
//   5. Gate de onboarding: si settings.onboarded !== true, montar
//      views/onboarding.js (import dinámico) ANTES de arrancar el router.
//   6. Si ya está onboardeado, arrancar el router.
//   7. Capturar 'beforeinstallprompt' y guardarlo para Ajustes.
//   8. Refrescar la racha al abrir (getStreak; banner si falta registrar hoy).
//   9. Exponer un bus de eventos simple (emit/on/off) para refrescar vistas
//      tras registros (p.ej. 'data:changed', 'fx:changed', 'theme:changed').
//
// El bus se expone como export del módulo Y en window.XAURA para que módulos
// no-ESM o la consola puedan suscribirse.
// ============================================================================

import { loadDB, getDB, flush } from './core/store.js';
import { getSettings } from './core/settings.js';
import { autoUpdateRate } from './core/fx.js';
import { hoy } from './core/dates.js';
import { getStreak, needsTodayRegister } from './core/streak.js';
import { startRouter } from './router.js';
import { mountNav } from './ui/nav.js';
import { clearHeader } from './ui/header.js';
import { setupAutoFit } from './ui/fit.js';

/* ============================================================================
 *  BUS DE EVENTOS SIMPLE
 *  Permite a las vistas reaccionar a cambios de datos sin acoplarse.
 *  Eventos convencionales:
 *    'data:changed'  { area, action }   -> hubo un registro/edición/borrado
 *    'fx:changed'    { usdToCop, date } -> cambió la tasa
 *    'theme:changed' { theme }          -> cambió el tema aplicado
 *    'streak:milestone' { count }       -> se alcanzó un hito de racha
 *    'install:available' { }            -> hay prompt de instalación disponible
 * ========================================================================== */
function createBus() {
  const listeners = new Map(); // evento -> Set<fn>

  function on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => off(event, fn);
  }
  function off(event, fn) {
    const set = listeners.get(event);
    if (set) set.delete(fn);
  }
  function once(event, fn) {
    const unsub = on(event, (payload) => {
      unsub();
      fn(payload);
    });
    return unsub;
  }
  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    // Copia para tolerar des-suscripciones durante el disparo.
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (err) {
        if (typeof console !== 'undefined') console.error('[bus]', event, err);
      }
    }
  }
  return { on, off, once, emit };
}

export const bus = createBus();

/* ============================================================================
 *  ESTADO DE INSTALACIÓN (beforeinstallprompt)
 *  Se guarda para que Ajustes pueda ofrecer "Instalar XAURA" (Android).
 * ========================================================================== */
const installState = {
  deferredPrompt: null,
  available: false,
  installed: false,
};

// API pública usada por Ajustes para disparar el prompt nativo.
export async function promptInstall() {
  if (!installState.deferredPrompt) return { ok: false, reason: 'unavailable' };
  const evt = installState.deferredPrompt;
  installState.deferredPrompt = null;
  installState.available = false;
  try {
    evt.prompt();
    const choice = await evt.userChoice;
    const accepted = choice && choice.outcome === 'accepted';
    if (accepted) installState.installed = true;
    bus.emit('install:available', { available: false });
    return { ok: true, accepted };
  } catch (err) {
    return { ok: false, reason: 'error', error: err };
  }
}

export function isInstallAvailable() {
  return !!installState.available;
}

/* ============================================================================
 *  TEMA  (aplica data-theme; 'auto' sigue prefers-color-scheme)
 * ========================================================================== */
let _mql = null; // MediaQueryList para 'auto'

export function applyTheme(theme) {
  const root = document.documentElement;
  let t = theme;
  if (t !== 'dark' && t !== 'light' && t !== 'auto') {
    const s = getSettings();
    t = (s && s.theme) ? s.theme : 'dark';
  }

  // Limpia el listener previo de 'auto'.
  if (_mql) {
    try { _mql.removeEventListener('change', onSystemThemeChange); } catch (_e) { /* legacy */ }
    _mql = null;
  }

  let effective = t;
  if (t === 'auto') {
    _mql = window.matchMedia('(prefers-color-scheme: light)');
    effective = _mql.matches ? 'light' : 'dark';
    try { _mql.addEventListener('change', onSystemThemeChange); } catch (_e) {
      // Safari < 14
      try { _mql.addListener(onSystemThemeChange); } catch (_e2) { /* sin soporte */ }
    }
  }

  root.setAttribute('data-theme', effective);
  updateThemeColorMeta(effective);
  bus.emit('theme:changed', { theme: t, effective });
}

function onSystemThemeChange(e) {
  const effective = e.matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', effective);
  updateThemeColorMeta(effective);
  bus.emit('theme:changed', { theme: 'auto', effective });
}

// Mantiene <meta name="theme-color"> coherente con el tema activo.
function updateThemeColorMeta(effective) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute('content', effective === 'light' ? '#F7F5F0' : '#0A0A0B');
}

/* ============================================================================
 *  SERVICE WORKER
 * ========================================================================== */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Registro tras 'load' para no competir con el primer render.
  const doRegister = () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Aviso de actualización disponible (la UI puede decidir refrescar).
      if (reg && reg.addEventListener) {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              bus.emit('sw:update', {});
            }
          });
        });
      }
    }).catch((err) => {
      if (typeof console !== 'undefined') console.warn('[sw] registro falló', err);
    });
  };
  if (document.readyState === 'complete') doRegister();
  else window.addEventListener('load', doRegister, { once: true });
}

/* ============================================================================
 *  EVENTOS GLOBALES (instalación, quota, persistencia al salir)
 * ========================================================================== */
function wireGlobalEvents() {
  // beforeinstallprompt: guarda el evento para Ajustes.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installState.deferredPrompt = e;
    installState.available = true;
    bus.emit('install:available', { available: true });
  });

  window.addEventListener('appinstalled', () => {
    installState.installed = true;
    installState.available = false;
    installState.deferredPrompt = null;
    bus.emit('install:available', { available: false });
  });

  // Persistencia segura al ocultar/cerrar (vacía el debounce pendiente).
  const persist = () => { try { flush(); } catch (_e) { /* tolerante */ } };
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
    else syncFxRate(false); // al volver a la app, refresca la tasa (throttled)
  });

  // Al recuperar conexión, intenta actualizar la tasa.
  window.addEventListener('online', () => syncFxRate(false));

  // Aviso de almacenamiento lleno (lo emite store.js).
  window.addEventListener('xaura:quota-exceeded', () => {
    bus.emit('storage:full', {});
  });
}

/* ============================================================================
 *  RACHA AL ABRIR
 *  No incrementa (eso lo hace touchStreak al registrar); solo lee el estado
 *  y avisa por el bus si conviene mostrar el banner "registra hoy".
 * ========================================================================== */
function refreshStreakOnOpen() {
  const streak = getStreak();
  const needsToday = needsTodayRegister();
  bus.emit('streak:open', { streak, needsToday });
  return streak;
}

/* ============================================================================
 *  GATE DE ONBOARDING + ARRANQUE DE LA APP
 * ========================================================================== */
function isOnboarded() {
  const s = getSettings();
  return !!(s && s.onboarded === true);
}

function startApp() {
  // Nav + header base ya disponibles para todas las vistas.
  mountNav();
  clearHeader();
  refreshStreakOnOpen();
  startRouter();
  // Auto-ajuste global de cifras (evita que los números se partan en 2 líneas).
  setupAutoFit(document.getElementById('view'));
}

function startOnboarding() {
  // Durante el onboarding ocultamos nav y header de fondo.
  const nav = document.getElementById('bottomnav');
  if (nav) nav.classList.add('hidden');
  const header = document.getElementById('appheader');
  if (header) header.classList.add('hidden');

  import('./views/onboarding.js')
    .then((mod) => {
      const start = mod && (typeof mod.startOnboarding === 'function'
        ? mod.startOnboarding
        : (typeof mod.render === 'function' ? mod.render : null));
      if (!start) {
        // Sin módulo de onboarding: degrada arrancando la app directamente.
        if (nav) nav.classList.remove('hidden');
        if (header) header.classList.remove('hidden');
        startApp();
        return;
      }
      // onFinish: el onboarding marca onboarded=true y nos devuelve el control.
      start({
        onFinish: () => {
          if (nav) nav.classList.remove('hidden');
          if (header) header.classList.remove('hidden');
          startApp();
        },
        bus,
        applyTheme,
      });
    })
    .catch((err) => {
      if (typeof console !== 'undefined') console.error('[app] onboarding', err);
      if (nav) nav.classList.remove('hidden');
      if (header) header.classList.remove('hidden');
      startApp();
    });
}

/* ============================================================================
 *  BOOTSTRAP
 * ========================================================================== */
// Pide al navegador almacenamiento PERSISTENTE para que no se desaloje
// localStorage bajo presión (mejora durabilidad en móvil). Best-effort.
function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then((already) => {
        if (!already) navigator.storage.persist().catch(() => {});
      }).catch(() => {});
    }
  } catch (_e) { /* entorno sin storage API */ }
}

// Sincroniza la tasa USD/COP con el mercado (no bloquea). Al lograrlo, emite
// 'fx:changed' para que Dashboard y Trading refresquen sus conversiones.
function syncFxRate(force) {
  autoUpdateRate({ force: !!force })
    .then((r) => {
      if (r && r.ok) bus.emit('fx:changed', { usdToCop: r.rate, date: hoy(), source: r.source });
    })
    .catch(() => { /* sin red u otro error: se conserva la última tasa */ });
}

function boot() {
  // 1) DB lista (loadDB migra/repara forma y persiste primer arranque).
  loadDB();
  requestPersistentStorage();
  // Tasa de cambio en vivo (best-effort, asíncrona).
  syncFxRate(false);

  // 2) Tema desde settings.
  const s = getSettings();
  applyTheme(s && s.theme ? s.theme : 'dark');

  // 3) Eventos globales + service worker.
  wireGlobalEvents();
  registerSW();

  // 4) Gate de onboarding.
  if (isOnboarded()) {
    startApp();
  } else {
    startOnboarding();
  }
}

// Exponer utilidades en window para Ajustes / consola / módulos no-ESM.
window.XAURA = Object.assign(window.XAURA || {}, {
  bus,
  applyTheme,
  promptInstall,
  isInstallAvailable,
  getDB,
});

// Arranque cuando el DOM esté listo.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
