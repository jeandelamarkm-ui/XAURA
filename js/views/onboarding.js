// ============================================================================
// XAURA · js/views/onboarding.js
// Carrusel de onboarding (SPEC §9). Se dispara desde app.js cuando
// settings.onboarded !== true.
//
// CÓMO LO LLAMA app.js (ver js/app.js · startOnboarding):
//   import('./views/onboarding.js').then(mod => mod.startOnboarding({
//     onFinish,   // callback: app.js re-muestra nav+header y arranca el router
//     bus,        // bus de eventos de la app (emit/on/off)
//     applyTheme, // aplica data-theme
//   }))
//
// app.js acepta `mod.startOnboarding` o, como alternativa, `mod.render`. Por eso
// se exportan AMBOS: startOnboarding(ctx) y render(ctx) (alias), más un mount()
// de conveniencia. Cuando el usuario termina:
//   1. settings.onboarded = true, userName, fxRate (setFxRate → fxHistory)
//   2. si dio capital de trading: crea cuenta + su depósito inicial
//   3. personalBudgetMonthly
//   4. si eligió "ejemplo": loadSeed() (que ya marca onboarded/seed propios)
//   5. llama onFinish() (si existe) y navega a #/inicio
//
// Pasos (SPEC §9):
//   0 Bienvenida · 1 Nombre · 2 Tasa USD/COP (4000) · 3 Capital trading USD
//   (omitible) · 4 Presupuesto mensual COP (omitible) · 5 Empezar vacío /
//   Cargar ejemplo · ✓ Listo
//
// Usa las clases reales de css/views.css:
//   .onboarding .onboarding__progress .onboarding__dot(--done/--active)
//   .onboarding__track .onboarding__slide .onboarding__logo(.aura)
//   .onboarding__title .onboarding__text .onboarding__field .onboarding__choice
//   .onboarding__foot .onboarding__skip
// y de components.css: .field .field__label .field__hint .input .btn …
// ============================================================================

import { getSettings, updateSettings, setFxRate } from '../core/settings.js';
import { addTradingAccount, addTradingMovement } from '../core/trading.js';
import { loadSeed } from '../core/seed.js';
import { hoy } from '../core/dates.js';
import { fmtCOP, fmtUSD, toNum } from '../core/currency.js';

// ---------------------------------------------------------------------------
// Estado del módulo (un onboarding activo a la vez).
// ---------------------------------------------------------------------------
let _root = null;          // nodo raíz .onboarding
let _ctx = null;           // { onFinish, bus, applyTheme }
let _step = 0;             // índice del paso visible
let _finished = false;

// Datos recogidos a lo largo del carrusel.
const _data = {
  userName: '',
  fxRate: 4000,
  tradingCapital: 0,
  budget: 0,
  loadDemo: false,
};

const TOTAL_STEPS = 7; // 0..6 (6 = pantalla de cierre "Listo")

// ---------------------------------------------------------------------------
// Iconos de línea inline.
// ---------------------------------------------------------------------------
const ICONS = {
  spark:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  empty:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>',
  demo:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
};

// ---------------------------------------------------------------------------
// Helpers de creación de DOM.
// ---------------------------------------------------------------------------
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined && html !== null) n.innerHTML = html;
  return n;
}

function host() {
  return document.getElementById('overlays') || document.body;
}

function reduceMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_e) { return false; }
}

// ---------------------------------------------------------------------------
// Definición declarativa de los pasos.
// Cada paso devuelve el contenido del slide y, opcionalmente, el campo a enfocar.
// ---------------------------------------------------------------------------
function buildSlide(index) {
  const slide = el('div', 'onboarding__slide');
  slide.dataset.step = String(index);

  switch (index) {
    case 0:
      return slideBienvenida(slide);
    case 1:
      return slideNombre(slide);
    case 2:
      return slideTasa(slide);
    case 3:
      return slideCapital(slide);
    case 4:
      return slidePresupuesto(slide);
    case 5:
      return slideDatos(slide);
    case 6:
    default:
      return slideListo(slide);
  }
}

/* --- Paso 0: bienvenida --------------------------------------------------- */
function slideBienvenida(slide) {
  const logo = el('div', 'onboarding__logo', 'X<span class="aura">A</span>URA');
  const title = el('h1', 'onboarding__title', 'Tu patrimonio, en un solo lugar.');
  const text = el('p', 'onboarding__text',
    'Finanzas personales, eventos y trading. Privado, sin nube y siempre contigo.');
  slide.append(logo, title, text);
  return { slide, focus: null };
}

/* --- Paso 1: nombre ------------------------------------------------------- */
function slideNombre(slide) {
  const title = el('h2', 'onboarding__title', '¿Cómo te llamas?');
  const text = el('p', 'onboarding__text', 'Lo usaremos para saludarte cada día.');

  const field = el('div', 'onboarding__field field');
  field.appendChild(el('label', 'field__label', 'Nombre'));
  const input = el('input', 'input');
  input.type = 'text';
  input.placeholder = 'Tu nombre';
  input.autocomplete = 'given-name';
  input.value = _data.userName;
  input.setAttribute('enterkeyhint', 'next');
  input.maxLength = 40;
  input.addEventListener('input', () => { _data.userName = input.value; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goNext(); }
  });
  field.appendChild(input);

  slide.append(title, text, field);
  return { slide, focus: input };
}

/* --- Paso 2: tasa USD/COP ------------------------------------------------- */
function slideTasa(slide) {
  const title = el('h2', 'onboarding__title', 'Tasa del dólar');
  const text = el('p', 'onboarding__text',
    'Para convertir tu trading (USD) a pesos. Puedes cambiarla luego en Ajustes.');

  const field = el('div', 'onboarding__field field');
  field.appendChild(el('label', 'field__label', 'USD → COP'));
  const input = el('input', 'input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.placeholder = '4000';
  input.value = _data.fxRate ? String(_data.fxRate) : '';
  input.setAttribute('enterkeyhint', 'next');
  const hint = el('div', 'field__hint', '1 USD = ' + fmtCOP(_data.fxRate || 4000));
  input.addEventListener('input', () => {
    const v = toNum(input.value, 0);
    _data.fxRate = v > 0 ? v : 0;
    hint.textContent = '1 USD = ' + fmtCOP(_data.fxRate || 4000);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goNext(); }
  });
  field.appendChild(input);
  field.appendChild(hint);

  slide.append(title, text, field);
  return { slide, focus: input };
}

/* --- Paso 3: capital de trading (omitible) -------------------------------- */
function slideCapital(slide) {
  const title = el('h2', 'onboarding__title', 'Capital de trading');
  const text = el('p', 'onboarding__text',
    '¿Con cuánto operas? En dólares. Si no haces trading, puedes omitirlo.');

  const field = el('div', 'onboarding__field field');
  field.appendChild(el('label', 'field__label', 'Capital inicial (USD)'));
  const input = el('input', 'input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.placeholder = '0.00';
  input.value = _data.tradingCapital ? String(_data.tradingCapital) : '';
  input.setAttribute('enterkeyhint', 'next');
  const hint = el('div', 'field__hint', _data.tradingCapital > 0
    ? fmtUSD(_data.tradingCapital)
    : 'Opcional');
  input.addEventListener('input', () => {
    const v = toNum(input.value, 0);
    _data.tradingCapital = v > 0 ? v : 0;
    hint.textContent = _data.tradingCapital > 0 ? fmtUSD(_data.tradingCapital) : 'Opcional';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goNext(); }
  });
  field.appendChild(input);
  field.appendChild(hint);

  slide.append(title, text, field);
  return { slide, focus: input, omitible: true };
}

/* --- Paso 4: presupuesto mensual (omitible) ------------------------------- */
function slidePresupuesto(slide) {
  const title = el('h2', 'onboarding__title', 'Presupuesto mensual');
  const text = el('p', 'onboarding__text',
    'Un tope de gasto al mes (en pesos) para cuidar tus finanzas. Opcional.');

  const field = el('div', 'onboarding__field field');
  field.appendChild(el('label', 'field__label', 'Presupuesto (COP)'));
  const input = el('input', 'input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.placeholder = '0';
  input.value = _data.budget ? String(_data.budget) : '';
  input.setAttribute('enterkeyhint', 'next');
  const hint = el('div', 'field__hint', _data.budget > 0 ? fmtCOP(_data.budget) : 'Opcional');
  input.addEventListener('input', () => {
    const v = toNum(input.value, 0);
    _data.budget = v > 0 ? v : 0;
    hint.textContent = _data.budget > 0 ? fmtCOP(_data.budget) : 'Opcional';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goNext(); }
  });
  field.appendChild(input);
  field.appendChild(hint);

  slide.append(title, text, field);
  return { slide, focus: input, omitible: true };
}

/* --- Paso 5: empezar vacío / cargar ejemplo ------------------------------- */
function slideDatos(slide) {
  const title = el('h2', 'onboarding__title', '¿Cómo empezamos?');
  const text = el('p', 'onboarding__text',
    'Puedes arrancar de cero o explorar con datos de ejemplo (los puedes borrar luego).');

  const choice = el('div', 'onboarding__choice');

  const optEmpty = buildChoiceCard({
    icon: ICONS.empty,
    title: 'Empezar vacío',
    sub: 'Tú registras tus propios datos.',
    selected: !_data.loadDemo,
    onSelect: () => { _data.loadDemo = false; refreshChoice(choice); },
  });
  const optDemo = buildChoiceCard({
    icon: ICONS.demo,
    title: 'Cargar datos de ejemplo',
    sub: 'Patrimonio, una boda y 12 días de trading.',
    selected: _data.loadDemo,
    onSelect: () => { _data.loadDemo = true; refreshChoice(choice); },
  });
  choice.append(optEmpty, optDemo);

  slide.append(title, text, choice);
  return { slide, focus: null };
}

function buildChoiceCard({ icon, title, sub, selected, onSelect }) {
  const card = el('button', 'choice-card pressable' + (selected ? ' is-active' : ''));
  card.type = 'button';
  card.dataset.choiceCard = '1';
  card.setAttribute('aria-pressed', selected ? 'true' : 'false');
  // Estilos inline mínimos (no dependemos de una clase específica del CSS base
  // para esta tarjeta de elección; respeta los tokens de diseño).
  Object.assign(card.style, {
    display: 'flex', alignItems: 'center', gap: '12px',
    width: '100%', textAlign: 'left',
    padding: '16px', borderRadius: 'var(--r-lg)',
    background: selected ? 'var(--gold-100)' : 'var(--bg-surface-2)',
    border: '1px solid ' + (selected ? 'var(--gold)' : 'var(--border-strong)'),
    color: 'var(--text-primary)',
    transition: 'background var(--dur-base) var(--ease-soft), border-color var(--dur-base) var(--ease-soft)',
  });

  const ic = el('span', null, icon);
  Object.assign(ic.style, {
    width: '40px', height: '40px', flexShrink: '0',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--r-md)',
    background: 'var(--gold-100)', color: 'var(--gold)',
  });
  const icSvg = ic.querySelector('svg');
  if (icSvg) { icSvg.style.width = '20px'; icSvg.style.height = '20px'; }

  const body = el('span', null);
  Object.assign(body.style, { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' });
  const t = el('span', null, escapeHtml(title));
  Object.assign(t.style, { fontWeight: '600', fontSize: 'var(--fs-body)' });
  const s = el('span', null, escapeHtml(sub));
  Object.assign(s.style, { fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' });
  body.append(t, s);

  card.append(ic, body);
  card._onSelect = onSelect;
  card.addEventListener('click', () => onSelect());
  return card;
}

function refreshChoice(choiceWrap) {
  const cards = choiceWrap.querySelectorAll('[data-choice-card]');
  cards.forEach((c, i) => {
    const selected = (i === 0) ? !_data.loadDemo : _data.loadDemo;
    c.classList.toggle('is-active', selected);
    c.setAttribute('aria-pressed', selected ? 'true' : 'false');
    c.style.background = selected ? 'var(--gold-100)' : 'var(--bg-surface-2)';
    c.style.borderColor = selected ? 'var(--gold)' : 'var(--border-strong)';
  });
}

/* --- Paso 6: listo -------------------------------------------------------- */
function slideListo(slide) {
  const ic = el('div', null, ICONS.check);
  Object.assign(ic.style, {
    width: '72px', height: '72px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--r-pill)',
    background: 'var(--gold-100)', color: 'var(--gold)',
    border: '1px solid var(--gold-300)',
  });
  const svg = ic.querySelector('svg');
  if (svg) { svg.style.width = '36px'; svg.style.height = '36px'; }

  const nombre = (_data.userName || '').trim();
  const title = el('h2', 'onboarding__title',
    'Todo listo' + (nombre ? ', ' + escapeHtml(nombre) : '') + '.');
  const text = el('p', 'onboarding__text', _data.loadDemo
    ? 'Cargamos un ejemplo para que explores XAURA con datos reales.'
    : 'Empieza registrando tu primer ingreso, gasto o día de trading.');
  slide.append(ic, title, text);
  return { slide, focus: null };
}

// ---------------------------------------------------------------------------
// Construcción de la barra de progreso.
// ---------------------------------------------------------------------------
function buildProgress() {
  const bar = el('div', 'onboarding__progress');
  // Un punto por paso "real" (0..6). El paso de cierre cuenta como último.
  for (let i = 0; i < TOTAL_STEPS; i++) {
    bar.appendChild(el('span', 'onboarding__dot'));
  }
  return bar;
}

function updateProgress() {
  if (!_root) return;
  const dots = _root.querySelectorAll('.onboarding__dot');
  dots.forEach((d, i) => {
    d.classList.remove('onboarding__dot--done', 'onboarding__dot--active');
    if (i < _step) d.classList.add('onboarding__dot--done');
    else if (i === _step) d.classList.add('onboarding__dot--active');
  });
}

// ---------------------------------------------------------------------------
// Construcción del pie (botones Atrás / Omitir / Continuar / Entrar).
// ---------------------------------------------------------------------------
function buildFoot() {
  const foot = el('div', 'onboarding__foot');
  foot.id = 'ob-foot';
  return foot;
}

function renderFoot(stepMeta) {
  const foot = _root.querySelector('#ob-foot');
  if (!foot) return;
  foot.replaceChildren();

  const isLast = _step === TOTAL_STEPS - 1;
  const isFirst = _step === 0;

  // Botón "Atrás" (desde el paso 1 en adelante, excepto pantalla de cierre).
  if (!isFirst && !isLast) {
    const back = el('button', 'btn btn--ghost pressable', 'Atrás');
    back.type = 'button';
    back.addEventListener('click', goPrev);
    foot.appendChild(back);
  }

  // Botón principal.
  const mainLabel = isLast ? 'Entrar' : (isFirst ? 'Comenzar' : 'Continuar');
  const main = el('button', 'btn btn--primary pressable btn--full', mainLabel);
  main.type = 'button';
  main.addEventListener('click', () => { isLast ? finish() : goNext(); });
  foot.appendChild(main);

  // Enlace "Omitir" para pasos omitibles (capital, presupuesto).
  const skipWrap = _root.querySelector('#ob-skip');
  if (skipWrap) {
    if (stepMeta && stepMeta.omitible) {
      skipWrap.style.display = '';
    } else {
      skipWrap.style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// Render del slide visible (un solo slide en el track a la vez).
// ---------------------------------------------------------------------------
function renderStep() {
  const track = _root.querySelector('.onboarding__track');
  if (!track) return;
  track.replaceChildren();

  const meta = buildSlide(_step);
  track.appendChild(meta.slide);

  updateProgress();
  renderFoot(meta);

  // Foco automático en el campo del paso (mejora el registro en ≤3 taps).
  if (meta.focus && typeof meta.focus.focus === 'function') {
    setTimeout(() => {
      try { meta.focus.focus({ preventScroll: true }); } catch (_e) { meta.focus.focus(); }
      if (meta.focus.select) { try { meta.focus.select(); } catch (_e2) { /* noop */ } }
    }, reduceMotion() ? 0 : 220);
  }
}

// ---------------------------------------------------------------------------
// Navegación entre pasos.
// ---------------------------------------------------------------------------
function goNext() {
  if (_step < TOTAL_STEPS - 1) {
    _step += 1;
    renderStep();
  } else {
    finish();
  }
}

function goPrev() {
  if (_step > 0) {
    _step -= 1;
    renderStep();
  }
}

function skipStep() {
  // Omitir = dejar el valor en 0 y avanzar.
  if (_step === 3) _data.tradingCapital = 0;
  if (_step === 4) _data.budget = 0;
  goNext();
}

// ---------------------------------------------------------------------------
// Finalización: persiste settings, crea cuenta de trading, carga seed y sale.
// ---------------------------------------------------------------------------
function finish() {
  if (_finished) return;
  _finished = true;

  const nombre = (_data.userName || '').trim();
  const fx = _data.fxRate > 0 ? _data.fxRate : 4000;
  const capital = _data.tradingCapital > 0 ? _data.tradingCapital : 0;
  const budget = _data.budget > 0 ? _data.budget : 0;

  if (_data.loadDemo) {
    // El seed parte de un DB limpio, fija sus propios settings y marca
    // onboarded=true + bandera demo. Respetamos el nombre si el usuario lo dio.
    loadSeed();
    if (nombre) {
      updateSettings({ userName: nombre });
    }
    // La tasa del usuario tiene prioridad sobre la del seed si la cambió.
    setFxRate(fx, hoy());
  } else {
    // Empezar vacío: persistimos las preferencias del onboarding.
    updateSettings({
      userName: nombre,
      personalBudgetMonthly: budget,
      onboarded: true,
    });
    setFxRate(fx, hoy());

    // Cuenta de trading + su depósito inicial (sólo si dio capital).
    if (capital > 0) {
      const acc = addTradingAccount({
        name: 'Cuenta principal',
        broker: '',
        initialBalance: 0,        // B0=0 porque el capital entra como depósito
        startDate: hoy(),
        color: '#5E9DF6',
      });
      if (acc && acc.id) {
        addTradingMovement({
          accountId: acc.id,
          type: 'deposit',
          amount: capital,
          date: hoy(),
          note: 'Depósito inicial',
        });
      }
    }
  }

  // Avisar al resto de la app que los datos cambiaron.
  if (_ctx && _ctx.bus && typeof _ctx.bus.emit === 'function') {
    _ctx.bus.emit('data:changed', { area: 'onboarding', action: 'finish' });
  }

  teardown();

  // Devolver el control a app.js (re-muestra nav/header y arranca el router).
  if (_ctx && typeof _ctx.onFinish === 'function') {
    _ctx.onFinish();
  }

  // Asegurar la ruta de inicio.
  if (location.hash !== '#/inicio') {
    location.hash = '#/inicio';
  }
}

// ---------------------------------------------------------------------------
// Desmonte: quita el overlay y limpia el estado.
// ---------------------------------------------------------------------------
function teardown() {
  if (_root) {
    if (!reduceMotion()) {
      _root.style.transition = 'opacity var(--dur-base) var(--ease-out)';
      _root.style.opacity = '0';
      const node = _root;
      setTimeout(() => { try { node.remove(); } catch (_e) { /* noop */ } }, 240);
    } else {
      try { _root.remove(); } catch (_e) { /* noop */ }
    }
  }
  _root = null;
  _step = 0;
}

// ---------------------------------------------------------------------------
// API pública.
// ---------------------------------------------------------------------------

/**
 * startOnboarding(ctx) — monta el carrusel de onboarding como overlay fijo.
 * @param {{onFinish?:Function, bus?:object, applyTheme?:Function}} [ctx]
 */
export function startOnboarding(ctx = {}) {
  _ctx = ctx || {};
  _finished = false;
  _step = 0;

  // Si ya estuviera onboardeado (re-entrada accidental), no bloquea: sale.
  const s = getSettings();
  if (s && s.onboarded === true) {
    if (typeof _ctx.onFinish === 'function') _ctx.onFinish();
    return;
  }

  // Precargar defaults desde settings actuales (si existían).
  _data.userName = (s && s.userName) ? s.userName : '';
  _data.fxRate = (s && s.fxRate && s.fxRate.usdToCop > 0) ? s.fxRate.usdToCop : 4000;
  _data.budget = (s && s.personalBudgetMonthly > 0) ? s.personalBudgetMonthly : 0;
  _data.tradingCapital = 0;
  _data.loadDemo = false;

  // Quitar un onboarding previo si quedó montado.
  const prev = document.querySelector('.onboarding');
  if (prev) { try { prev.remove(); } catch (_e) { /* noop */ } }

  _root = el('div', 'onboarding');
  _root.setAttribute('role', 'dialog');
  _root.setAttribute('aria-modal', 'true');
  _root.setAttribute('aria-label', 'Configuración inicial de XAURA');

  _root.appendChild(buildProgress());

  const track = el('div', 'onboarding__track');
  _root.appendChild(track);

  // Enlace "Omitir" (visible sólo en pasos omitibles).
  const skipWrap = el('div', null);
  skipWrap.id = 'ob-skip';
  skipWrap.style.display = 'none';
  const skipBtn = el('button', 'onboarding__skip pressable', 'Omitir este paso');
  skipBtn.type = 'button';
  skipBtn.addEventListener('click', skipStep);
  skipWrap.appendChild(skipBtn);
  _root.appendChild(skipWrap);

  _root.appendChild(buildFoot());

  host().appendChild(_root);

  // Soporte de teclado: Escape no cierra (es bloqueante), Enter avanza.
  _root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      goNext();
    }
  });

  renderStep();
}

/**
 * render(ctx) — alias de startOnboarding (app.js acepta cualquiera de los dos).
 */
export function render(ctx = {}) {
  return startOnboarding(ctx);
}

/**
 * mount(onDone) — variante de conveniencia: recibe directamente el callback.
 * @param {Function} onDone
 */
export function mount(onDone) {
  return startOnboarding({ onFinish: typeof onDone === 'function' ? onDone : null });
}

/**
 * unmount() — desmonta el onboarding si estuviera activo (contrato de vista).
 */
export function unmount() {
  teardown();
}

// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default { startOnboarding, render, mount, unmount };
