// ============================================================================
// XAURA · js/ui/sheet.js
// Bottom sheet genérico: backdrop + panel deslizable con handle arrastrable,
// animación de entrada/salida, foco-trap básico, cierre por gesto / backdrop /
// botón / tecla Escape. Se monta en #overlays (fallback: body).
//
// Usa las clases reales de components.css:
//   .sheet-backdrop .sheet .sheet__handle .sheet__head .sheet__title
//   .sheet__body .sheet__foot .btn .btn--primary .btn--ghost
//
// Exports:
//   openSheet({ title, content, actions, onClose, height, dismissible }) → handle
//   closeSheet()  // cierra el sheet activo (el del tope de la pila)
// ============================================================================

const OPEN_MS = 400;   // acompaña a --dur-slow
const CLOSE_MS = 400;
const DRAG_CLOSE_PX = 110;        // umbral de arrastre para cerrar
const DRAG_VELOCITY = 0.55;       // px/ms para cierre por "flick"

// Pila de sheets abiertos (soporta apilado, p.ej. sub-sheet sobre sheet).
const stack = [];

function host() {
  return document.getElementById('overlays') || document.body;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function haptic(ms = 6) {
  try {
    if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch (_) { /* noop */ }
}

// Elementos enfocables dentro de un contenedor (para el foco-trap).
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

// Normaliza `content` (string HTML | Node | función → Node) a un Node.
function resolveContent(content) {
  let c = content;
  if (typeof c === 'function') c = c();
  if (c == null) {
    const empty = document.createElement('div');
    return empty;
  }
  if (c instanceof Node) return c;
  // String HTML.
  const wrap = document.createElement('div');
  wrap.innerHTML = String(c);
  return wrap;
}

// Construye los botones del pie a partir de `actions`.
// actions: [{ label, onClick, variant:'primary'|'ghost'|'outline'|'danger',
//             closeOnClick:true, disabled }]
function buildFoot(actions, instance) {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const foot = document.createElement('div');
  foot.className = 'sheet__foot';
  actions.forEach((a) => {
    if (!a) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    const variant = a.variant || 'ghost';
    btn.className = 'btn btn--' + variant;
    btn.textContent = a.label || '';
    if (a.disabled) btn.disabled = true;
    btn.addEventListener('click', (ev) => {
      let keepOpen = false;
      if (typeof a.onClick === 'function') {
        // Si onClick devuelve false explícitamente, no cerramos.
        keepOpen = a.onClick(ev, instance) === false;
      }
      if (a.closeOnClick !== false && !keepOpen) instance.close();
    });
    foot.appendChild(btn);
  });
  return foot;
}

// ---------------------------------------------------------------------------
// openSheet
// ---------------------------------------------------------------------------
export function openSheet(opts = {}) {
  const {
    title = '',
    content = '',
    actions = null,
    onClose = null,
    height = null,           // p.ej. "70dvh" o "480px"; por defecto auto (max 92dvh)
    dismissible = true,      // permite cerrar por backdrop/gesto/Escape
    closeLabel = 'Cerrar',
  } = opts;

  const reduce = prefersReducedMotion();

  // --- Backdrop ---
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';

  // --- Panel ---
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  if (height) sheet.style.height = height;

  const titleId = 'sheet-title-' + Math.random().toString(36).slice(2, 8);
  if (title) sheet.setAttribute('aria-labelledby', titleId);

  // Handle arrastrable.
  const handle = document.createElement('div');
  handle.className = 'sheet__handle';
  handle.setAttribute('role', 'button');
  handle.setAttribute('tabindex', dismissible ? '0' : '-1');
  handle.setAttribute('aria-label', closeLabel);

  // Cabecera (título + botón cerrar).
  const head = document.createElement('div');
  head.className = 'sheet__head';
  const h = document.createElement('h2');
  h.className = 'sheet__title';
  h.id = titleId;
  h.textContent = title || '';
  head.appendChild(h);
  if (dismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn--icon-bare';
    closeBtn.setAttribute('aria-label', closeLabel);
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    closeBtn.addEventListener('click', () => instance.close());
    head.appendChild(closeBtn);
  }

  // Cuerpo.
  const body = document.createElement('div');
  body.className = 'sheet__body';
  body.appendChild(resolveContent(content));

  sheet.append(handle, head, body);

  // Pie.
  // instance se referencia desde buildFoot, lo definimos antes con let.
  let instance;

  backdrop.appendChild(sheet);

  // Guardar el foco previo para restaurarlo al cerrar.
  const prevFocus = document.activeElement;

  // --- Lógica de cierre ---
  let closing = false;
  function close(result) {
    if (closing) return;
    closing = true;

    document.removeEventListener('keydown', onKeydown, true);

    const finalize = () => {
      backdrop.remove();
      // Quitar de la pila.
      const idx = stack.indexOf(instance);
      if (idx > -1) stack.splice(idx, 1);
      // Restaurar bloqueo de scroll si no quedan sheets.
      if (stack.length === 0) document.documentElement.classList.remove('x-sheet-open');
      // Restaurar foco.
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus({ preventScroll: true }); } catch (_) { prevFocus.focus(); }
      }
      if (typeof onClose === 'function') onClose(result);
    };

    if (reduce) {
      finalize();
      return;
    }
    backdrop.classList.remove('is-open');
    sheet.classList.remove('is-open');
    sheet.style.transform = 'translateY(100%)';
    let done = false;
    const onEnd = (e) => {
      if (e && e.target !== sheet) return;
      if (done) return;
      done = true;
      sheet.removeEventListener('transitionend', onEnd);
      finalize();
    };
    sheet.addEventListener('transitionend', onEnd);
    setTimeout(() => onEnd(), CLOSE_MS + 80);
  }

  // --- Foco-trap + Escape ---
  function onKeydown(e) {
    // Solo actúa sobre el sheet del tope de la pila.
    if (stack[stack.length - 1] !== instance) return;
    if (e.key === 'Escape' && dismissible) {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const items = focusable(sheet);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // --- Backdrop: cerrar al tocar fuera ---
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop && dismissible) close();
  });

  // --- Gesto de arrastre (handle + cabecera) ---
  let dragging = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let curDY = 0;

  function dragStart(clientY) {
    if (!dismissible) return;
    dragging = true;
    startY = clientY;
    lastY = clientY;
    lastT = performance.now();
    curDY = 0;
    sheet.style.transition = 'none';
  }
  function dragMove(clientY) {
    if (!dragging) return;
    let dy = clientY - startY;
    if (dy < 0) dy = dy * 0.25;            // resistencia hacia arriba
    curDY = dy;
    sheet.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
    // Atenuar backdrop con el arrastre.
    const prog = Math.min(1, Math.max(0, dy) / (sheet.offsetHeight || 400));
    backdrop.style.opacity = String(1 - prog * 0.6);
    lastY = clientY;
    lastT = performance.now();
  }
  function dragEnd(clientY) {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    backdrop.style.opacity = '';
    const dt = Math.max(1, performance.now() - lastT);
    const velocity = (clientY - lastY) / dt; // px/ms (positivo = hacia abajo)
    if (curDY > DRAG_CLOSE_PX || velocity > DRAG_VELOCITY) {
      haptic(10);
      close();
    } else {
      // Vuelve a su sitio.
      sheet.style.transform = '';
    }
  }

  // Pointer events (cubre touch + mouse).
  function onPointerDown(e) {
    // Solo arrastra desde handle o cabecera (no desde el cuerpo scrollable).
    dragStart(e.clientY);
    if (e.target.setPointerCapture && e.pointerId != null) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    }
  }
  function onPointerMove(e) { dragMove(e.clientY); }
  function onPointerUp(e) { dragEnd(e.clientY); }

  [handle, head].forEach((zone) => {
    zone.addEventListener('pointerdown', onPointerDown);
    zone.addEventListener('pointermove', onPointerMove);
    zone.addEventListener('pointerup', onPointerUp);
    zone.addEventListener('pointercancel', onPointerUp);
  });

  // Activar handle con teclado.
  handle.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && dismissible) {
      e.preventDefault();
      close();
    }
  });

  // --- Montaje ---
  instance = {
    el: sheet,
    backdrop,
    body,
    close,
    setActionsDisabled(disabled) {
      sheet.querySelectorAll('.sheet__foot .btn').forEach((b) => { b.disabled = !!disabled; });
    },
  };

  const foot = buildFoot(actions, instance);
  if (foot) sheet.appendChild(foot);

  host().appendChild(backdrop);
  stack.push(instance);
  document.documentElement.classList.add('x-sheet-open');
  document.addEventListener('keydown', onKeydown, true);

  // Animar entrada en el siguiente frame.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      sheet.classList.add('is-open');
    });
  });

  // Foco inicial: primer campo enfocable o el panel.
  setTimeout(() => {
    const items = focusable(sheet);
    const firstInput = items.find((el) =>
      el.matches('input, textarea, select') && !el.disabled);
    const target = firstInput || items[0] || sheet;
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    }
  }, reduce ? 0 : OPEN_MS * 0.5);

  return instance;
}

// ---------------------------------------------------------------------------
// closeSheet — cierra el sheet del tope de la pila (o todos si all=true).
// ---------------------------------------------------------------------------
export function closeSheet(all = false) {
  if (stack.length === 0) return;
  if (all) {
    // Cerrar de arriba hacia abajo.
    [...stack].reverse().forEach((s) => s.close());
    return;
  }
  stack[stack.length - 1].close();
}

export default { openSheet, closeSheet };
