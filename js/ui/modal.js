// ============================================================================
// XAURA · js/ui/modal.js
// Modales centrados: confirmaciones, prompt de texto y confirmación destructiva
// tipo "Escribe BORRAR" (el botón solo se habilita si el texto coincide).
// Se monta en #overlays (fallback: body). Foco-trap básico, Escape, backdrop.
//
// Usa las clases reales de components.css:
//   .modal-backdrop .modal .modal__icon .modal__icon--danger .modal__title
//   .modal__text .modal__actions .btn .input .field
//
// Exports:
//   openModal({ title, content, confirmText, cancelText, danger,
//               onConfirm, onCancel, icon }) → instance
//   closeModal()                                  // cierra el modal activo
//   confirmDestructive({ title, message, word, confirmText, onConfirm }) → Promise<bool>
//   promptText({ title, label, placeholder, value, confirmText, validate }) → Promise<string|null>
// ============================================================================

const CLOSE_MS = 220;
const stack = [];

function host() {
  return document.getElementById('overlays') || document.body;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE))
    .filter((el) => !el.disabled);
}

// Iconos de línea inline.
const ICONS = {
  info:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
  warn:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>',
};

function resolveContent(content) {
  if (content == null) return null;
  if (content instanceof Node) return content;
  if (typeof content === 'function') {
    const r = content();
    return r instanceof Node ? r : textNode(r);
  }
  return textNode(content);
}

function textNode(str) {
  const p = document.createElement('p');
  p.className = 'modal__text';
  p.innerHTML = String(str);
  return p;
}

// ---------------------------------------------------------------------------
// openModal — modal de confirmación / contenido genérico.
// ---------------------------------------------------------------------------
export function openModal(opts = {}) {
  const {
    title = '',
    content = '',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    danger = false,
    onConfirm = null,
    onCancel = null,
    icon = danger ? 'warn' : null,
    showCancel = true,
  } = opts;

  const reduce = prefersReducedMotion();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const titleId = 'modal-title-' + Math.random().toString(36).slice(2, 8);
  if (title) modal.setAttribute('aria-labelledby', titleId);

  // Icono (opcional).
  if (icon) {
    const ic = document.createElement('div');
    ic.className = 'modal__icon' + (danger ? ' modal__icon--danger' : '');
    ic.innerHTML = ICONS[icon] || ICONS.info;
    modal.appendChild(ic);
  }

  if (title) {
    const h = document.createElement('h2');
    h.className = 'modal__title';
    h.id = titleId;
    h.textContent = title;
    modal.appendChild(h);
  }

  const contentNode = resolveContent(content);
  if (contentNode) modal.appendChild(contentNode);

  // Acciones.
  const actions = document.createElement('div');
  actions.className = 'modal__actions';

  let confirmBtn = null;
  let cancelBtn = null;
  const prevFocus = document.activeElement;
  let instance;

  if (showCancel) {
    cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn--ghost';
    cancelBtn.textContent = cancelText;
    cancelBtn.addEventListener('click', () => {
      if (typeof onCancel === 'function') onCancel();
      instance.close({ confirmed: false });
    });
    actions.appendChild(cancelBtn);
  }

  confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn ' + (danger ? 'btn--danger' : 'btn--primary');
  confirmBtn.textContent = confirmText;
  confirmBtn.addEventListener('click', () => {
    let keepOpen = false;
    if (typeof onConfirm === 'function') keepOpen = onConfirm(instance) === false;
    if (!keepOpen) instance.close({ confirmed: true });
  });
  actions.appendChild(confirmBtn);

  modal.appendChild(actions);
  backdrop.appendChild(modal);

  let closing = false;
  function close(result) {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKeydown, true);

    const finalize = () => {
      backdrop.remove();
      const idx = stack.indexOf(instance);
      if (idx > -1) stack.splice(idx, 1);
      if (stack.length === 0) document.documentElement.classList.remove('x-modal-open');
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus({ preventScroll: true }); } catch (_) { prevFocus.focus(); }
      }
    };

    if (reduce) { finalize(); return; }
    backdrop.classList.remove('is-open');
    let done = false;
    const onEnd = (e) => {
      if (e && e.target !== backdrop && e.target !== modal) return;
      if (done) return;
      done = true;
      backdrop.removeEventListener('transitionend', onEnd);
      finalize();
    };
    backdrop.addEventListener('transitionend', onEnd);
    setTimeout(() => onEnd(), CLOSE_MS + 80);
  }

  function onKeydown(e) {
    if (stack[stack.length - 1] !== instance) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (cancelBtn) {
        if (typeof onCancel === 'function') onCancel();
        close({ confirmed: false });
      } else {
        close({ confirmed: false });
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter confirma salvo que el foco esté en un textarea.
      const ae = document.activeElement;
      if (ae && ae.tagName === 'TEXTAREA') return;
      if (!confirmBtn.disabled) {
        e.preventDefault();
        confirmBtn.click();
      }
      return;
    }
    if (e.key === 'Tab') {
      const items = focusable(modal);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !modal.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      if (typeof onCancel === 'function') onCancel();
      close({ confirmed: false });
    }
  });

  instance = {
    el: modal,
    backdrop,
    confirmBtn,
    cancelBtn,
    close,
    setConfirmEnabled(enabled) { confirmBtn.disabled = !enabled; },
  };

  host().appendChild(backdrop);
  stack.push(instance);
  document.documentElement.classList.add('x-modal-open');
  document.addEventListener('keydown', onKeydown, true);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
  });

  // Foco inicial: primer input si existe, si no el botón de confirmar.
  setTimeout(() => {
    const firstInput = modal.querySelector('input, textarea, select');
    const target = firstInput || confirmBtn;
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
      if (firstInput && typeof firstInput.select === 'function') {
        try { firstInput.select(); } catch (_) { /* noop */ }
      }
    }
  }, reduce ? 0 : 120);

  return instance;
}

// ---------------------------------------------------------------------------
// closeModal — cierra el modal del tope de la pila.
// ---------------------------------------------------------------------------
export function closeModal() {
  if (stack.length === 0) return;
  stack[stack.length - 1].close({ confirmed: false });
}

// ---------------------------------------------------------------------------
// confirmDestructive — modal "Escribe BORRAR". El botón de confirmar solo se
// habilita cuando el texto escrito coincide (sin distinguir mayúsculas/espacios).
// Devuelve Promise<boolean> (true = confirmado).
// ---------------------------------------------------------------------------
export function confirmDestructive(opts = {}) {
  const {
    title = '¿Borrar todo?',
    message = 'Esta acción no se puede deshacer. Tus datos se eliminarán de este dispositivo.',
    word = 'BORRAR',
    confirmText = 'Borrar todo',
    cancelText = 'Cancelar',
  } = opts;

  return new Promise((resolve) => {
    const wrap = document.createElement('div');

    const text = document.createElement('p');
    text.className = 'modal__text';
    text.innerHTML = message + '<br><br>Para confirmar, escribe <strong>' + word + '</strong>.';
    wrap.appendChild(text);

    const field = document.createElement('div');
    field.className = 'field';
    field.style.textAlign = 'left';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'text');
    input.setAttribute('aria-label', 'Escribe ' + word + ' para confirmar');
    input.placeholder = word;
    input.style.textAlign = 'center';
    input.style.fontFamily = 'var(--font-mono)';
    input.style.letterSpacing = '0.2em';

    field.appendChild(input);
    wrap.appendChild(field);

    let settled = false;
    const instance = openModal({
      title,
      content: wrap,
      confirmText,
      cancelText,
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        // Solo se llega aquí si el botón está habilitado.
        settled = true;
        resolve(true);
      },
      onCancel: () => {
        if (!settled) { settled = true; resolve(false); }
      },
    });

    // Deshabilitar inicialmente hasta que coincida la palabra.
    instance.setConfirmEnabled(false);

    const matches = () =>
      input.value.trim().toUpperCase() === String(word).trim().toUpperCase();

    input.addEventListener('input', () => {
      instance.setConfirmEnabled(matches());
    });
    // Garantiza que cerrar por backdrop/Escape resuelva false.
    const origClose = instance.close;
    instance.close = (result) => {
      if (!settled && !(result && result.confirmed)) { settled = true; resolve(false); }
      origClose(result);
    };
  });
}

// ---------------------------------------------------------------------------
// promptText — pide una cadena de texto. Resuelve con el valor o null si cancela.
// validate(value) → string|null  (devuelve mensaje de error o null si es válido)
// ---------------------------------------------------------------------------
export function promptText(opts = {}) {
  const {
    title = 'Editar',
    label = '',
    placeholder = '',
    value = '',
    confirmText = 'Guardar',
    cancelText = 'Cancelar',
    inputmode = 'text',
    validate = null,
    multiline = false,
  } = opts;

  return new Promise((resolve) => {
    const wrap = document.createElement('div');

    const field = document.createElement('div');
    field.className = 'field';
    field.style.textAlign = 'left';

    if (label) {
      const lab = document.createElement('label');
      lab.className = 'field__label';
      lab.textContent = label;
      field.appendChild(lab);
    }

    const input = multiline ? document.createElement('textarea') : document.createElement('input');
    if (!multiline) {
      input.type = 'text';
      input.setAttribute('inputmode', inputmode);
    }
    input.className = multiline ? 'textarea' : 'input';
    input.value = value == null ? '' : String(value);
    input.placeholder = placeholder;
    input.setAttribute('autocomplete', 'off');
    field.appendChild(input);

    const err = document.createElement('div');
    err.className = 'field__error';
    err.style.display = 'none';
    field.appendChild(err);

    wrap.appendChild(field);

    let settled = false;
    const instance = openModal({
      title,
      content: wrap,
      confirmText,
      cancelText,
      danger: false,
      icon: 'edit',
      onConfirm: () => {
        const v = input.value.trim();
        if (typeof validate === 'function') {
          const msg = validate(v);
          if (msg) {
            err.textContent = msg;
            err.style.display = '';
            input.focus();
            return false; // mantener abierto
          }
        }
        settled = true;
        resolve(v);
        return true;
      },
      onCancel: () => {
        if (!settled) { settled = true; resolve(null); }
      },
    });

    const origClose = instance.close;
    instance.close = (result) => {
      if (!settled && !(result && result.confirmed)) { settled = true; resolve(null); }
      origClose(result);
    };

    input.addEventListener('input', () => {
      if (err.style.display !== 'none') err.style.display = 'none';
    });
  });
}

export default { openModal, closeModal, confirmDestructive, promptText };
