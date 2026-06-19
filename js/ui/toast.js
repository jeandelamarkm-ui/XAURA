// ============================================================================
// XAURA · js/ui/toast.js
// Toasts dorados (2s) sobre el bottom-nav y snackbar de "deshacer".
// Sin dependencias. Accesible (role/aria-live). Respeta prefers-reduced-motion.
//
// Usa las clases reales de components.css:
//   .toast-stack .toast .toast__icon .toast__msg .toast--pos .toast--neg
//   .snackbar .snackbar__action
//
// Exports: toast(msg, {type}) · snackbarUndo(msg, onUndo, {duration})
// ============================================================================

const DEFAULT_DURATION = 2000;     // toasts: 2s (SPEC §9)
const SNACKBAR_DURATION = 5000;    // ventana de deshacer más amplia
const OUT_MS = 220;                // debe acompañar a --dur-base

// ---------------------------------------------------------------------------
// Iconos de línea inline (sin dependencias). 24x24, stroke currentColor.
// ---------------------------------------------------------------------------
const ICONS = {
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
  pos:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  neg:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/></svg>',
  undo:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
};

// Mapa de tipo → { claseModificadora, iconKey }
const TYPE_MAP = {
  info:    { cls: '', icon: 'info' },
  success: { cls: 'toast--pos', icon: 'pos' },
  pos:     { cls: 'toast--pos', icon: 'pos' },
  positive:{ cls: 'toast--pos', icon: 'pos' },
  error:   { cls: 'toast--neg', icon: 'neg' },
  neg:     { cls: 'toast--neg', icon: 'neg' },
  negative:{ cls: 'toast--neg', icon: 'neg' },
  warning: { cls: 'toast--neg', icon: 'neg' },
};

// ---------------------------------------------------------------------------
// Contenedor único (#toast-stack). Se crea perezosamente.
// ---------------------------------------------------------------------------
function getStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    // Montar dentro de #overlays si existe; si no, al body.
    const host = document.getElementById('overlays') || document.body;
    host.appendChild(stack);
  }
  return stack;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Háptica suave opcional (no rompe si no existe).
function haptic(ms = 8) {
  try {
    if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch (_) { /* noop */ }
}

// Retira un nodo con animación de salida y limpia el timer asociado.
function dismissNode(node) {
  if (!node || node.__dismissing) return;
  node.__dismissing = true;
  if (node.__timer) {
    clearTimeout(node.__timer);
    node.__timer = null;
  }
  if (prefersReducedMotion()) {
    node.remove();
    return;
  }
  node.classList.add('is-out');
  let removed = false;
  const finish = () => {
    if (removed) return;
    removed = true;
    node.remove();
  };
  node.addEventListener('animationend', finish, { once: true });
  // Respaldo por si animationend no dispara.
  setTimeout(finish, OUT_MS + 60);
}

// ---------------------------------------------------------------------------
// toast(msg, { type })
// type: "info" (default) | "success"/"pos" | "error"/"neg" | "warning"
// ---------------------------------------------------------------------------
export function toast(msg, opts = {}) {
  const { type = 'info', duration = DEFAULT_DURATION } = opts || {};
  const conf = TYPE_MAP[type] || TYPE_MAP.info;
  const stack = getStack();

  const node = document.createElement('div');
  node.className = 'toast' + (conf.cls ? ' ' + conf.cls : '');
  node.setAttribute('role', 'status');

  const ic = document.createElement('span');
  ic.className = 'toast__icon';
  ic.setAttribute('aria-hidden', 'true');
  ic.innerHTML = ICONS[conf.icon] || ICONS.info;

  const span = document.createElement('span');
  span.className = 'toast__msg';
  span.textContent = String(msg == null ? '' : msg);

  node.append(ic, span);
  stack.appendChild(node);

  haptic(type === 'error' || type === 'neg' || type === 'negative' ? 16 : 8);

  // Auto-cierre.
  node.__timer = setTimeout(() => dismissNode(node), Math.max(800, duration));

  // Toque para descartar antes de tiempo.
  node.addEventListener('click', () => dismissNode(node));

  return {
    dismiss: () => dismissNode(node),
    el: node,
  };
}

// ---------------------------------------------------------------------------
// snackbarUndo(msg, onUndo, { duration })
// Muestra un snackbar con botón "Deshacer". Si el usuario lo pulsa, ejecuta
// onUndo() y cierra. Si expira el tiempo, simplemente se cierra (la acción
// destructiva original ya se confirmó por el llamador).
// ---------------------------------------------------------------------------
export function snackbarUndo(msg, onUndo, opts = {}) {
  const { duration = SNACKBAR_DURATION, actionLabel = 'Deshacer' } = opts || {};
  const stack = getStack();

  const node = document.createElement('div');
  node.className = 'snackbar';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');

  const span = document.createElement('span');
  span.className = 'toast__msg';
  span.textContent = String(msg == null ? '' : msg);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'snackbar__action';
  btn.textContent = actionLabel;
  btn.setAttribute('aria-label', actionLabel);

  node.append(span, btn);
  stack.appendChild(node);
  haptic(8);

  let done = false;
  const close = () => dismissNode(node);

  btn.addEventListener('click', () => {
    if (done) return;
    done = true;
    if (node.__timer) { clearTimeout(node.__timer); node.__timer = null; }
    haptic(12);
    try {
      if (typeof onUndo === 'function') onUndo();
    } finally {
      close();
    }
  });

  node.__timer = setTimeout(() => {
    if (done) return;
    done = true;
    close();
  }, Math.max(1500, duration));

  return {
    dismiss: () => { if (!done) { done = true; close(); } },
    el: node,
  };
}

export default { toast, snackbarUndo };
