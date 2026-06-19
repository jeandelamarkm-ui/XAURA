// ============================================================================
// XAURA · js/views/registro.js
// Flujo de registro rápido global (el que abre el FAB / ruta '#/registrar').
//
// El router (js/router.js, openRegistroOverlay) hace:
//   import('./views/registro.js').then(m => m.openRegistro({ ...params, back }))
// donde `back` es el hash de la vista de fondo a restaurar al cerrar.
//
// openRegistro(params):
//   - Sin params.tipo  → CHOOSER con 4 opciones grandes:
//       Ingreso (COP) · Gasto (COP) · Evento/Abono (COP) · Día de trading (USD).
//   - Con params.tipo (ingreso|gasto|evento|trading) o tras elegir en el chooser
//     → formulario correspondiente, con foco automático en el monto.
//
// Edición: si llega params.id (+ tipo) se precarga la entidad y se guarda con
// el update*/setTradeDay correspondiente.
//
// Al guardar (alta o edición válida):
//   toast de éxito → touchStreak() (+ hito) → cerrar sheet → volver al hash
//   previo (params.back) → disparar refresco de la vista de fondo.
//
// Sin dependencias externas. ES modules. Todo en español (Colombia).
// ============================================================================

import { openSheet, closeSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { attachAmountInput } from '../ui/keypad.js';

import { hoy } from '../core/dates.js';
import { fmtCOP } from '../core/currency.js';
import { LABELS } from '../core/schema.js';

import { touchStreak } from '../core/streak.js';
import { getSettings } from '../core/settings.js';

import {
  getCategories, getAccounts,
  addTransaction, updateTransaction,
  getTransactions,
} from '../core/personal.js';

import {
  getEvents, addEvent, addEventIncome,
  getEventIncomes,
} from '../core/events.js';

import {
  getTradingAccounts, addTradingAccount,
  setTradeDay, getTradeDays,
  addTradingMovement,
} from '../core/trading.js';

/* ============================================================================
 *  CONSTANTES Y ESTADO DE MÓDULO
 * ========================================================================== */

const HASH_REGISTRAR = '#/registrar';

// Tipos válidos del flujo.
const TIPOS = ['ingreso', 'gasto', 'evento', 'trading'];

// Una sola instancia activa a la vez (el overlay es único).
let _activeSheet = null;
let _backHash = '#/inicio';
let _navigatedAway = false; // evita doble-navegación al cerrar

/* ============================================================================
 *  ESTILOS PROPIOS DEL FLUJO (auto-contenidos, inyectados una sola vez).
 *  Solo layout/espaciado de los contenedores reg-*; el resto reutiliza las
 *  clases de components.css (.field, .input, .chip, .typetoggle, .switch…).
 * ========================================================================== */
const STYLE_ID = 'xaura-registro-styles';
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = [
    '.reg-form{display:flex;flex-direction:column;gap:var(--sp-4);}',
    '.reg-sec{display:flex;flex-direction:column;gap:var(--sp-4);}',
    '.reg-grid2{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);}',
    '.reg-chooser{display:flex;flex-direction:column;gap:var(--sp-3);padding-bottom:var(--sp-2);}',
    '.reg-choice{display:flex;align-items:center;gap:var(--sp-3);width:100%;',
    'min-height:68px;padding:var(--sp-3) var(--sp-4);text-align:left;',
    'border-radius:var(--r-lg);background:var(--bg-surface-2);',
    'border:1px solid var(--border-subtle);color:var(--text-primary);',
    'transition:transform var(--dur-fast) var(--ease-soft),background var(--dur-base) var(--ease-soft),border-color var(--dur-base) var(--ease-soft);}',
    '.reg-choice:active{transform:scale(0.98);background:var(--bg-surface-3);}',
    '.reg-choice__ic{width:46px;height:46px;flex-shrink:0;display:inline-flex;',
    'align-items:center;justify-content:center;border-radius:var(--r-md);',
    'background:var(--gold-100);color:var(--gold);}',
    '.reg-choice__ic svg{width:22px;height:22px;}',
    '.reg-choice--pos .reg-choice__ic{background:var(--positive-bg);color:var(--positive);}',
    '.reg-choice--neg .reg-choice__ic{background:var(--negative-bg);color:var(--negative);}',
    '.reg-choice--evt .reg-choice__ic{background:var(--area-eventos-bg,var(--gold-100));color:var(--area-eventos,var(--gold));}',
    '.reg-choice--trd .reg-choice__ic{background:var(--area-trading-bg,var(--gold-100));color:var(--area-trading,var(--neutral));}',
    '.reg-choice__txt{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;}',
    '.reg-choice__title{font-family:var(--font-sans);font-size:var(--fs-h3);font-weight:600;color:var(--text-primary);}',
    '.reg-choice__sub{font-size:var(--fs-xs);color:var(--text-tertiary);letter-spacing:var(--ls-wide);text-transform:uppercase;}',
    '.reg-choice__chev{color:var(--text-tertiary);flex-shrink:0;display:inline-flex;}',
    '.reg-choice__chev svg{width:20px;height:20px;}',
    '.reg-evsummary{font-family:var(--font-mono);font-variant-numeric:tabular-nums;',
    'font-size:var(--fs-xs);color:var(--text-secondary);line-height:1.4;',
    'margin-top:calc(var(--sp-2) * -1);}',
    '.reg-switch-row{display:flex;align-items:center;justify-content:space-between;',
    'gap:var(--sp-3);padding:var(--sp-3) var(--sp-4);border-radius:var(--r-md);',
    'background:var(--bg-surface-2);border:1px solid var(--border-subtle);}',
    '.reg-switch-row__label{font-family:var(--font-sans);font-size:var(--fs-body);',
    'font-weight:500;color:var(--text-primary);}',
  ].join('');
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = css;
  document.head.appendChild(tag);
}

/* ============================================================================
 *  ICONOS DE LÍNEA (inline, sin dependencias)
 * ========================================================================== */
const SVG = {
  income:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
  expense:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M18 13l-6 6-6-6"/></svg>',
  event:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.4 5.8L20 9.3l-4.4 3.8L17 19l-5-3-5 3 1.4-5.9L4 9.3l5.6-.5z"/></svg>',
  trading:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5" rx="0.6"/><rect x="14" y="7" width="3" height="9" rx="0.6"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
};

/* ============================================================================
 *  HELPERS DOM
 * ========================================================================== */
function el(tag, opts) {
  const node = document.createElement(tag);
  opts = opts || {};
  if (opts.class) node.className = opts.class;
  if (opts.id) node.id = opts.id;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.html != null) node.innerHTML = opts.html;
  if (opts.type) node.type = opts.type;
  if (opts.attrs) {
    for (const k in opts.attrs) {
      if (Object.prototype.hasOwnProperty.call(opts.attrs, k)) {
        const v = opts.attrs[k];
        if (v != null) node.setAttribute(k, String(v));
      }
    }
  }
  if (opts.style) node.setAttribute('style', opts.style);
  return node;
}

// Campo etiquetado (.field + .field__label + control).
function field(labelText, control, hintText) {
  const wrap = el('div', { class: 'field' });
  if (labelText) {
    const lab = el('label', { class: 'field__label', text: labelText });
    if (control && control.id) lab.setAttribute('for', control.id);
    wrap.appendChild(lab);
  }
  wrap.appendChild(control);
  if (hintText) wrap.appendChild(el('div', { class: 'field__hint', text: hintText }));
  return wrap;
}

// id único corto para asociar label/control.
let _uid = 0;
function uid(prefix) { _uid += 1; return (prefix || 'x') + '-' + _uid; }

/* ============================================================================
 *  CICLO DE VIDA DEL OVERLAY
 * ========================================================================== */

// Importa el bus de app.js de forma perezosa y tolerante para emitir refrescos.
function emitDataChanged(detail) {
  // 1) Evento de ventana (siempre disponible, lo escuche quien lo escuche).
  try {
    window.dispatchEvent(new CustomEvent('xaura:data-changed', { detail: detail || {} }));
  } catch (_e) { /* noop */ }
  // 2) Bus interno de la app, si está cargado.
  import('../app.js')
    .then((mod) => {
      const bus = mod && (mod.bus || (mod.default && mod.default.bus));
      if (bus && typeof bus.emit === 'function') bus.emit('data:changed', detail || {});
    })
    .catch(() => { /* sin app.js no pasa nada */ });
}

// Cierra el overlay y restaura el hash de fondo (una sola vez).
function dismissAndReturn() {
  if (_navigatedAway) return;
  _navigatedAway = true;
  _activeSheet = null;

  // Si el hash sigue siendo el del overlay, devuélvelo al de fondo.
  if ((location.hash || '') === HASH_REGISTRAR || (location.hash || '') === '') {
    if (location.hash === _backHash) {
      // Mismo hash: re-dispara la resolución para limpiar el estado del router.
      try { window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (_e) { /* noop */ }
    } else {
      location.hash = _backHash;
    }
  }
}

// Guarda y finaliza el flujo: toast + racha + refresco + cierre.
function finishSave(successMsg) {
  // Racha: el registro de hoy cuenta para el hábito.
  let milestone = null;
  try {
    const r = touchStreak();
    milestone = r && r.milestone ? r.milestone : null;
  } catch (_e) { milestone = null; }

  toast(successMsg || 'Registro guardado', { type: 'success' });

  if (milestone) {
    // Hito de racha (7/30/100): celebración adicional.
    setTimeout(() => {
      toast('¡Racha de ' + milestone + ' días! 🔥', { type: 'success' });
    }, 350);
  }

  emitDataChanged({ source: 'registro' });

  // Cerrar el sheet activo y volver al fondo.
  closeSheet();
  dismissAndReturn();
}

/* ============================================================================
 *  PUNTO DE ENTRADA
 * ========================================================================== */

/**
 * openRegistro(params)
 * params: {
 *   tipo?: 'ingreso'|'gasto'|'evento'|'trading',
 *   id?: string,                 // edición (transacción o ingreso de evento)
 *   fecha?: 'YYYY-MM-DD',        // fecha por defecto del formulario
 *   eventId?: string,            // pre-selección de evento (flujo evento)
 *   accountId?: string,          // pre-selección de cuenta
 *   back?: string,               // hash de retorno (lo pasa el router)
 * }
 */
export function openRegistro(params) {
  params = params || {};
  ensureStyles();
  _navigatedAway = false;
  _backHash = (typeof params.back === 'string' && params.back) ? params.back : '#/inicio';

  // Si ya hay un sheet abierto del flujo, ciérralo antes de re-abrir.
  if (_activeSheet) {
    try { _activeSheet.close(); } catch (_e) { /* noop */ }
    _activeSheet = null;
  }

  const tipo = TIPOS.indexOf(params.tipo) !== -1 ? params.tipo : null;

  if (tipo) {
    openForm(tipo, params);
  } else {
    openChooser(params);
  }
}

/* ============================================================================
 *  onClose del sheet — al cerrar por gesto/backdrop/Escape, volver al fondo.
 * ========================================================================== */
function sheetOnClose() {
  _activeSheet = null;
  dismissAndReturn();
}

/* ============================================================================
 *  CHOOSER — 4 opciones grandes
 * ========================================================================== */
function openChooser(params) {
  const list = el('div', { class: 'reg-chooser' });

  const options = [
    { tipo: 'ingreso', icon: SVG.income, mod: 'pos', title: 'Ingreso', sub: 'Personal · COP' },
    { tipo: 'gasto', icon: SVG.expense, mod: 'neg', title: 'Gasto', sub: 'Personal · COP' },
    { tipo: 'evento', icon: SVG.event, mod: 'evt', title: 'Evento / Abono', sub: 'Eventos · COP' },
    { tipo: 'trading', icon: SVG.trading, mod: 'trd', title: 'Día de trading', sub: 'Trading · USD' },
  ];

  options.forEach((opt) => {
    const btn = el('button', {
      type: 'button',
      class: 'reg-choice pressable reg-choice--' + opt.mod,
      attrs: { 'aria-label': opt.title },
    });
    btn.appendChild(el('span', { class: 'reg-choice__ic', html: opt.icon }));
    const txt = el('span', { class: 'reg-choice__txt' });
    txt.appendChild(el('span', { class: 'reg-choice__title', text: opt.title }));
    txt.appendChild(el('span', { class: 'reg-choice__sub', text: opt.sub }));
    btn.appendChild(txt);
    btn.appendChild(el('span', { class: 'reg-choice__chev', html: SVG.chevron }));

    btn.addEventListener('click', () => {
      // Reemplaza el chooser por el formulario (cierra y reabre sin tocar el hash).
      if (_activeSheet) {
        try { _activeSheet.close(); } catch (_e) { /* noop */ }
        _activeSheet = null;
      }
      // Pequeño respiro para la animación de cierre antes de abrir el form.
      setTimeout(() => { openForm(opt.tipo, params); }, 60);
    });

    list.appendChild(btn);
  });

  _activeSheet = openSheet({
    title: '¿Qué registramos?',
    content: list,
    onClose: () => {
      // Sólo vuelve al fondo si no se está abriendo un formulario encima.
      // (openForm reasigna _activeSheet; si sigue null aquí, fue un cierre real)
      setTimeout(() => { if (!_activeSheet) sheetOnClose(); }, 0);
    },
  });
}

/* ============================================================================
 *  DISPATCH DE FORMULARIO
 * ========================================================================== */
function openForm(tipo, params) {
  if (tipo === 'ingreso' || tipo === 'gasto') {
    openFormPersonal(tipo, params);
  } else if (tipo === 'evento') {
    openFormEvento(params);
  } else if (tipo === 'trading') {
    openFormTrading(params);
  } else {
    openChooser(params);
  }
}

/* ============================================================================
 *  FORMULARIO: INGRESO / GASTO  (Personal, COP)
 * ========================================================================== */
function openFormPersonal(tipo, params) {
  const kind = tipo === 'ingreso' ? 'income' : 'expense'; // categoría kind / tx type
  const isEdit = !!params.id;

  // Datos a precargar en edición.
  let editTxn = null;
  if (isEdit) {
    editTxn = findTransactionById(params.id);
  }

  // --- Bloque monto ---
  const amountInput = el('input', {
    id: uid('amount'),
    class: 'input--amount',
    type: 'text',
    attrs: { inputmode: 'decimal', placeholder: '0', 'aria-label': 'Monto en pesos' },
  });
  const amountLine = el('div', { class: 'amount-line' });
  amountLine.appendChild(el('span', { class: 'amount-line__cur', text: '$' }));
  amountLine.appendChild(amountInput);

  const amountCtl = attachAmountInput(amountInput, { currency: 'COP' });

  // --- Categorías (chips) ---
  const cats = safeArr(getCategories({ kind }));
  const catRow = el('div', { class: 'chip-row chip-row--scroll', attrs: { role: 'listbox', 'aria-label': 'Categoría' } });
  let selectedCatId = null;

  function renderCatChips() {
    catRow.replaceChildren();
    if (cats.length === 0) {
      catRow.appendChild(el('span', { class: 'field__hint', text: 'Sin categorías. Puedes crearlas en Personal.' }));
      return;
    }
    cats.forEach((c) => {
      const chip = el('button', {
        type: 'button',
        class: 'chip' + (selectedCatId === c.id ? ' chip--active' : ''),
        attrs: { role: 'option', 'aria-selected': selectedCatId === c.id ? 'true' : 'false' },
      });
      chip.appendChild(el('span', { class: 'chip__dot', style: 'background:' + (c.color || 'var(--gold)') }));
      chip.appendChild(document.createTextNode(c.name || 'Categoría'));
      chip.addEventListener('click', () => {
        selectedCatId = (selectedCatId === c.id) ? null : c.id;
        renderCatChips();
      });
      catRow.appendChild(chip);
    });
  }

  // --- Cuenta (select) ---
  const accounts = safeArr(getAccounts());
  const accSelect = el('select', { id: uid('acc'), class: 'select' });
  if (accounts.length === 0) {
    accSelect.appendChild(el('option', { text: 'Sin cuentas', attrs: { value: '' } }));
    accSelect.disabled = true;
  } else {
    accounts.forEach((a) => {
      accSelect.appendChild(el('option', { text: a.name || 'Cuenta', attrs: { value: a.id } }));
    });
  }

  // --- Fecha ---
  const dateInput = el('input', {
    id: uid('date'), class: 'input', type: 'date',
    attrs: { value: defaultDate(params) },
  });

  // --- Método (select) ---
  const methodSelect = el('select', { id: uid('method'), class: 'select' });
  Object.keys(LABELS.transactionMethod).forEach((m) => {
    methodSelect.appendChild(el('option', { text: LABELS.transactionMethod[m], attrs: { value: m } }));
  });

  // --- Nota ---
  const noteInput = el('textarea', {
    id: uid('note'), class: 'textarea',
    attrs: { placeholder: 'Nota (opcional)', rows: '2' },
  });

  // Precarga de edición.
  if (editTxn) {
    amountCtl.setValue(Math.abs(Number(editTxn.amount) || 0));
    selectedCatId = editTxn.categoryId || null;
    if (editTxn.accountId) accSelect.value = editTxn.accountId;
    if (editTxn.date) dateInput.value = editTxn.date;
    if (editTxn.method) methodSelect.value = editTxn.method;
    if (editTxn.note) noteInput.value = editTxn.note;
  } else if (params.accountId && accounts.some((a) => a.id === params.accountId)) {
    accSelect.value = params.accountId;
  }

  renderCatChips();

  // --- Ensamblado ---
  const body = el('div', { class: 'reg-form' });
  body.appendChild(amountLine);
  body.appendChild(field('Categoría', catRow));
  if (accounts.length > 0) body.appendChild(field('Cuenta', accSelect));
  const grid = el('div', { class: 'reg-grid2' });
  grid.appendChild(field('Fecha', dateInput));
  grid.appendChild(field('Método', methodSelect));
  body.appendChild(grid);
  body.appendChild(field('Nota', noteInput));

  const titleTxt = (isEdit ? 'Editar ' : '') + (tipo === 'ingreso' ? 'ingreso' : 'gasto');

  _activeSheet = openSheet({
    title: cap(titleTxt),
    content: body,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: () => { /* cierra solo */ } },
      {
        label: isEdit ? 'Guardar cambios' : 'Guardar',
        variant: 'primary',
        onClick: () => {
          const amount = amountCtl.getValue();
          if (!(amount > 0)) {
            toast('Ingresa un monto mayor a 0', { type: 'error' });
            try { amountInput.focus(); } catch (_e) { /* noop */ }
            return false; // mantener abierto
          }
          const payload = {
            type: kind === 'income' ? 'income' : 'expense',
            accountId: accounts.length > 0 ? (accSelect.value || null) : null,
            categoryId: selectedCatId,
            amount,
            date: dateInput.value || hoy(),
            note: (noteInput.value || '').trim(),
            method: methodSelect.value || 'efectivo',
          };
          if (isEdit && editTxn) {
            updateTransaction(editTxn.id, payload);
            finishSave('Movimiento actualizado');
          } else {
            addTransaction(payload);
            finishSave(tipo === 'ingreso' ? 'Ingreso registrado' : 'Gasto registrado');
          }
          return false; // ya cerramos manualmente en finishSave
        },
      },
    ],
    onClose: () => { setTimeout(() => { if (!_activeSheet) sheetOnClose(); }, 0); },
  });

  focusAmount(amountInput);
}

/* ============================================================================
 *  FORMULARIO: EVENTO / ABONO  (Eventos, COP)
 *  Dos modos: abono a evento existente (default) o crear evento mínimo.
 * ========================================================================== */
function openFormEvento(params) {
  const events = safeArr(getEvents({ sort: 'date-desc' }))
    .filter((e) => e && e.status !== 'cancelado');

  // Modo: 'abono' (a evento existente) o 'nuevo' (crear evento mínimo).
  let mode = (events.length > 0) ? 'abono' : 'nuevo';

  const body = el('div', { class: 'reg-form' });

  // --- Conmutador de modo (typetoggle) ---
  const toggle = el('div', { class: 'typetoggle', style: 'margin-bottom: var(--sp-2);' });
  const btnAbono = el('button', {
    type: 'button',
    class: 'typetoggle__btn' + (mode === 'abono' ? ' is-active typetoggle__btn--pos' : ''),
    text: 'Abono a evento',
  });
  const btnNuevo = el('button', {
    type: 'button',
    class: 'typetoggle__btn' + (mode === 'nuevo' ? ' is-active typetoggle__btn--pos' : ''),
    text: 'Nuevo evento',
  });
  toggle.appendChild(btnAbono);
  toggle.appendChild(btnNuevo);
  if (events.length === 0) btnAbono.disabled = true;

  // --- Bloque monto (compartido) ---
  const amountInput = el('input', {
    id: uid('amount'), class: 'input--amount', type: 'text',
    attrs: { inputmode: 'decimal', placeholder: '0', 'aria-label': 'Monto en pesos' },
  });
  const amountLine = el('div', { class: 'amount-line' });
  amountLine.appendChild(el('span', { class: 'amount-line__cur', text: '$' }));
  amountLine.appendChild(amountInput);
  const amountCtl = attachAmountInput(amountInput, { currency: 'COP' });

  // --- Sección ABONO ---
  const abonoSec = el('div', { class: 'reg-sec' });
  const evSelect = el('select', { id: uid('ev'), class: 'select' });
  events.forEach((e) => {
    const cli = e.client && e.client.name ? ' · ' + e.client.name : '';
    evSelect.appendChild(el('option', {
      text: (e.name || 'Evento') + cli, attrs: { value: e.id },
    }));
  });
  if (params.eventId && events.some((e) => e.id === params.eventId)) {
    evSelect.value = params.eventId;
  }

  // Resumen de saldo del evento seleccionado.
  const evSummary = el('div', { class: 'reg-evsummary x-num', attrs: { 'aria-live': 'polite' } });
  function refreshEvSummary() {
    const ev = events.find((e) => e.id === evSelect.value);
    if (!ev) { evSummary.textContent = ''; return; }
    const quoted = Number(ev.quotedAmount) || 0;
    const abonado = safeArr(getEventIncomes(ev.id)).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const saldo = quoted - abonado;
    evSummary.textContent = 'Cotizado ' + fmtCOP(quoted) + ' · Abonado ' + fmtCOP(abonado) +
      ' · Saldo ' + fmtCOP(saldo > 0 ? saldo : 0);
  }
  evSelect.addEventListener('change', refreshEvSummary);

  const conceptInput = el('input', {
    id: uid('concept'), class: 'input', type: 'text',
    attrs: { placeholder: 'Concepto (ej. abono inicial)', value: 'Abono' },
  });

  const dateInputA = el('input', {
    id: uid('dateA'), class: 'input', type: 'date',
    attrs: { value: defaultDate(params) },
  });

  const methodSelectA = el('select', { id: uid('methodA'), class: 'select' });
  Object.keys(LABELS.transactionMethod).forEach((m) => {
    // El income de evento admite: efectivo|transferencia|tarjeta|otro.
    if (m === 'debito') return;
    methodSelectA.appendChild(el('option', { text: LABELS.transactionMethod[m], attrs: { value: m } }));
  });
  methodSelectA.value = 'transferencia';

  abonoSec.appendChild(field('Evento', evSelect));
  abonoSec.appendChild(evSummary);
  abonoSec.appendChild(field('Concepto', conceptInput));
  const gridA = el('div', { class: 'reg-grid2' });
  gridA.appendChild(field('Fecha', dateInputA));
  gridA.appendChild(field('Método', methodSelectA));
  abonoSec.appendChild(gridA);

  // --- Sección NUEVO EVENTO ---
  const nuevoSec = el('div', { class: 'reg-sec' });
  const evNameInput = el('input', {
    id: uid('evname'), class: 'input', type: 'text',
    attrs: { placeholder: 'Nombre del evento' },
  });
  const cliNameInput = el('input', {
    id: uid('cliname'), class: 'input', type: 'text',
    attrs: { placeholder: 'Cliente (opcional)' },
  });
  const evTypeSelect = el('select', { id: uid('evtype'), class: 'select' });
  Object.keys(LABELS.eventType).forEach((t) => {
    evTypeSelect.appendChild(el('option', { text: LABELS.eventType[t], attrs: { value: t } }));
  });
  evTypeSelect.value = 'otro';
  const evDateInput = el('input', {
    id: uid('evdate'), class: 'input', type: 'date',
    attrs: { value: defaultDate(params) },
  });

  nuevoSec.appendChild(field('Evento', evNameInput));
  nuevoSec.appendChild(field('Cliente', cliNameInput));
  const gridN = el('div', { class: 'reg-grid2' });
  gridN.appendChild(field('Tipo', evTypeSelect));
  gridN.appendChild(field('Fecha del evento', evDateInput));
  nuevoSec.appendChild(gridN);
  nuevoSec.appendChild(el('div', {
    class: 'field__hint',
    text: 'El monto se registra como cotización del evento.',
  }));

  // El label del monto cambia según el modo (Abono vs Cotización).
  const amountLabel = el('div', { class: 'field__label', text: 'Monto del abono', style: 'text-align:center; margin-bottom: calc(var(--sp-2) * -1);' });

  function applyMode(next) {
    mode = next;
    const abono = mode === 'abono';
    btnAbono.classList.toggle('is-active', abono);
    btnAbono.classList.toggle('typetoggle__btn--pos', abono);
    btnNuevo.classList.toggle('is-active', !abono);
    btnNuevo.classList.toggle('typetoggle__btn--pos', !abono);
    abonoSec.style.display = abono ? '' : 'none';
    nuevoSec.style.display = abono ? 'none' : '';
    amountLabel.textContent = abono ? 'Monto del abono' : 'Cotización del evento';
    if (abono) refreshEvSummary();
    focusAmount(amountInput);
  }

  btnAbono.addEventListener('click', () => { if (!btnAbono.disabled) applyMode('abono'); });
  btnNuevo.addEventListener('click', () => applyMode('nuevo'));

  body.appendChild(toggle);
  body.appendChild(amountLabel);
  body.appendChild(amountLine);
  body.appendChild(abonoSec);
  body.appendChild(nuevoSec);

  applyMode(mode); // setea visibilidad inicial

  _activeSheet = openSheet({
    title: 'Evento / Abono',
    content: body,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: () => { /* cierra solo */ } },
      {
        label: 'Guardar',
        variant: 'primary',
        onClick: () => {
          const amount = amountCtl.getValue();
          if (!(amount > 0)) {
            toast('Ingresa un monto mayor a 0', { type: 'error' });
            try { amountInput.focus(); } catch (_e) { /* noop */ }
            return false;
          }

          if (mode === 'abono') {
            const evId = evSelect.value;
            if (!evId) {
              toast('Selecciona un evento', { type: 'error' });
              return false;
            }
            addEventIncome({
              eventId: evId,
              concept: (conceptInput.value || '').trim() || 'Abono',
              amount,
              date: dateInputA.value || hoy(),
              method: methodSelectA.value || 'transferencia',
            });
            finishSave('Abono registrado');
          } else {
            const name = (evNameInput.value || '').trim();
            if (!name) {
              toast('Escribe el nombre del evento', { type: 'error' });
              try { evNameInput.focus(); } catch (_e) { /* noop */ }
              return false;
            }
            addEvent({
              name,
              client: { name: (cliNameInput.value || '').trim() },
              eventType: evTypeSelect.value || 'otro',
              eventDate: evDateInput.value || hoy(),
              status: 'cotizado',
              quotedAmount: amount,
            });
            finishSave('Evento creado');
          }
          return false;
        },
      },
    ],
    onClose: () => { setTimeout(() => { if (!_activeSheet) sheetOnClose(); }, 0); },
  });

  focusAmount(amountInput);
}

/* ============================================================================
 *  FORMULARIO: DÍA DE TRADING  (Trading, USD)
 *  P&L del día (+Ganancia / −Pérdida), "Hoy no operé", etiqueta (chips),
 *  y +Depósito / Retiro de caja.
 * ========================================================================== */
function openFormTrading(params) {
  // Asegura que exista al menos una cuenta de trading (alta mínima si no hay).
  let accounts = safeArr(getTradingAccounts());
  if (accounts.length === 0) {
    addTradingAccount({
      name: 'Trading',
      currency: 'USD',
      initialBalance: 0,
      startDate: hoy(),
    });
    accounts = safeArr(getTradingAccounts());
  }

  const body = el('div', { class: 'reg-form' });

  // --- Conmutador: Día de trading | Caja ---
  const modeToggle = el('div', { class: 'typetoggle', style: 'margin-bottom: var(--sp-3);' });
  const btnDia = el('button', { type: 'button', class: 'typetoggle__btn is-active typetoggle__btn--pos', text: 'Día de trading' });
  const btnCaja = el('button', { type: 'button', class: 'typetoggle__btn', text: 'Depósito / Retiro' });
  modeToggle.appendChild(btnDia);
  modeToggle.appendChild(btnCaja);
  let mode = 'dia'; // 'dia' | 'caja'

  // --- Cuenta (select) ---
  const accSelect = el('select', { id: uid('tracc'), class: 'select' });
  accounts.forEach((a) => {
    accSelect.appendChild(el('option', { text: a.name || 'Cuenta', attrs: { value: a.id } }));
  });
  if (params.accountId && accounts.some((a) => a.id === params.accountId)) {
    accSelect.value = params.accountId;
  }

  // --- Signo del P&L (+Ganancia / −Pérdida) ---
  let pnlSign = 1; // 1 ganancia, -1 pérdida
  const signToggle = el('div', { class: 'typetoggle', style: 'margin-bottom: var(--sp-2);' });
  const btnWin = el('button', {
    type: 'button', class: 'typetoggle__btn typetoggle__btn--pos is-active',
    html: SVG.plus + '<span>Ganancia</span>',
  });
  const btnLoss = el('button', {
    type: 'button', class: 'typetoggle__btn typetoggle__btn--neg',
    html: SVG.minus + '<span>Pérdida</span>',
  });
  signToggle.appendChild(btnWin);
  signToggle.appendChild(btnLoss);

  // --- Monto P&L (USD) ---
  const amountInput = el('input', {
    id: uid('pnl'), class: 'input--amount', type: 'text',
    attrs: { inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'P&L en dólares' },
  });
  const amountLine = el('div', { class: 'amount-line' });
  const curSpan = el('span', { class: 'amount-line__cur', text: 'US$' });
  amountLine.appendChild(curSpan);
  amountLine.appendChild(amountInput);
  const amountCtl = attachAmountInput(amountInput, { currency: 'USD' });

  function applySignStyle() {
    const win = pnlSign > 0;
    btnWin.classList.toggle('is-active', win);
    btnLoss.classList.toggle('is-active', !win);
    amountInput.style.color = win ? 'var(--positive)' : 'var(--negative)';
    curSpan.style.color = win ? 'var(--positive)' : 'var(--negative)';
  }
  btnWin.addEventListener('click', () => { pnlSign = 1; applySignStyle(); focusAmount(amountInput); });
  btnLoss.addEventListener('click', () => { pnlSign = -1; applySignStyle(); focusAmount(amountInput); });
  applySignStyle();

  // --- "Hoy no operé" ---
  const noTradeWrap = el('label', { class: 'reg-switch-row' });
  const noTradeCheck = el('input', { type: 'checkbox' });
  const swSpan = el('span', { class: 'switch' });
  swSpan.appendChild(noTradeCheck);
  swSpan.appendChild(el('span', { class: 'switch__track' }));
  noTradeWrap.appendChild(el('span', { class: 'reg-switch-row__label', text: 'Hoy no operé' }));
  noTradeWrap.appendChild(swSpan);

  // --- Etiquetas (chips) ---
  const settings = getSettings() || {};
  const tags = safeArr(settings.trading && settings.trading.tags).filter(Boolean);
  let selectedTag = null;
  const tagRow = el('div', { class: 'chip-row chip-row--scroll', attrs: { role: 'listbox', 'aria-label': 'Etiqueta' } });
  function renderTagChips() {
    tagRow.replaceChildren();
    tags.forEach((t) => {
      const chip = el('button', {
        type: 'button',
        class: 'chip' + (selectedTag === t ? ' chip--active' : ''),
        text: t,
        attrs: { role: 'option', 'aria-selected': selectedTag === t ? 'true' : 'false' },
      });
      chip.addEventListener('click', () => {
        selectedTag = (selectedTag === t) ? null : t;
        renderTagChips();
      });
      tagRow.appendChild(chip);
    });
  }
  renderTagChips();

  // --- Fecha + número de trades + nota ---
  const dateInput = el('input', {
    id: uid('trdate'), class: 'input', type: 'date',
    attrs: { value: defaultDate(params) },
  });
  const tradesInput = el('input', {
    id: uid('trades'), class: 'input', type: 'number',
    attrs: { inputmode: 'numeric', min: '0', step: '1', placeholder: '0' },
  });
  const noteInput = el('textarea', {
    id: uid('trnote'), class: 'textarea',
    attrs: { placeholder: 'Nota (opcional)', rows: '2' },
  });

  // Precarga: si ya existe un día para esa fecha/cuenta, modo edición implícito.
  function preloadExistingDay() {
    const d = dateInput.value || hoy();
    const accId = accSelect.value;
    const existing = safeArr(getTradeDays({ accountId: accId, from: d, to: d }))[0];
    if (existing) {
      noTradeCheck.checked = existing.traded === false;
      const p = Number(existing.pnl) || 0;
      pnlSign = p < 0 ? -1 : 1;
      amountCtl.setValue(Math.abs(p));
      selectedTag = existing.tag || null;
      if (existing.trades) tradesInput.value = String(existing.trades);
      if (existing.note) noteInput.value = existing.note;
      renderTagChips();
      applySignStyle();
      applyNoTrade();
    }
  }

  // --- Sección caja (depósito / retiro) ---
  const cajaSec = el('div', { class: 'reg-sec' });
  let cajaType = 'deposit';
  const cajaToggle = el('div', { class: 'typetoggle', style: 'margin-bottom: var(--sp-3);' });
  const btnDep = el('button', { type: 'button', class: 'typetoggle__btn typetoggle__btn--pos is-active', text: '+ Depósito' });
  const btnRet = el('button', { type: 'button', class: 'typetoggle__btn typetoggle__btn--neg', text: '− Retiro' });
  cajaToggle.appendChild(btnDep);
  cajaToggle.appendChild(btnRet);

  const cajaAmountInput = el('input', {
    id: uid('caja'), class: 'input--amount', type: 'text',
    attrs: { inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Monto en dólares' },
  });
  const cajaAmountLine = el('div', { class: 'amount-line' });
  cajaAmountLine.appendChild(el('span', { class: 'amount-line__cur', text: 'US$' }));
  cajaAmountLine.appendChild(cajaAmountInput);
  const cajaAmountCtl = attachAmountInput(cajaAmountInput, { currency: 'USD' });

  const cajaDateInput = el('input', {
    id: uid('cajadate'), class: 'input', type: 'date',
    attrs: { value: defaultDate(params) },
  });
  const cajaNoteInput = el('textarea', {
    id: uid('cajanote'), class: 'textarea',
    attrs: { placeholder: 'Nota (opcional)', rows: '2' },
  });

  btnDep.addEventListener('click', () => {
    cajaType = 'deposit';
    btnDep.classList.add('is-active'); btnRet.classList.remove('is-active');
    try { cajaAmountInput.focus(); } catch (_e) { /* noop */ }
  });
  btnRet.addEventListener('click', () => {
    cajaType = 'withdrawal';
    btnRet.classList.add('is-active'); btnDep.classList.remove('is-active');
    try { cajaAmountInput.focus(); } catch (_e) { /* noop */ }
  });

  cajaSec.appendChild(cajaToggle);
  cajaSec.appendChild(cajaAmountLine);
  const cajaGrid = el('div', { class: 'reg-grid2', style: 'margin-top: var(--sp-3);' });
  cajaGrid.appendChild(field('Cuenta', accSelectMirrorFactory()));
  cajaGrid.appendChild(field('Fecha', cajaDateInput));
  cajaSec.appendChild(cajaGrid);
  cajaSec.appendChild(field('Nota', cajaNoteInput));

  // Espejo del select de cuenta para la sección de caja (comparte valor).
  function accSelectMirrorFactory() {
    const sel = el('select', { id: uid('traccCaja'), class: 'select' });
    accounts.forEach((a) => {
      sel.appendChild(el('option', { text: a.name || 'Cuenta', attrs: { value: a.id } }));
    });
    sel.value = accSelect.value;
    sel.addEventListener('change', () => { accSelect.value = sel.value; });
    accSelect.addEventListener('change', () => { sel.value = accSelect.value; });
    return sel;
  }

  // --- Sección día (envuelve los controles de P&L) ---
  const diaSec = el('div', { class: 'reg-sec' });
  diaSec.appendChild(signToggle);
  diaSec.appendChild(amountLine);
  const noTradeBox = el('div', { style: 'margin-top: var(--sp-3);' });
  noTradeBox.appendChild(noTradeWrap);
  diaSec.appendChild(noTradeBox);
  diaSec.appendChild(field('Etiqueta', tagRow));
  const diaGrid = el('div', { class: 'reg-grid2' });
  diaGrid.appendChild(field('Fecha', dateInput));
  diaGrid.appendChild(field('Operaciones', tradesInput));
  diaSec.appendChild(diaGrid);
  diaSec.appendChild(field('Nota', noteInput));

  // "Hoy no operé": desactiva el bloque de P&L.
  function applyNoTrade() {
    const off = noTradeCheck.checked;
    signToggle.style.opacity = off ? '0.4' : '';
    signToggle.style.pointerEvents = off ? 'none' : '';
    amountLine.style.opacity = off ? '0.4' : '';
    amountInput.disabled = off;
    if (off) {
      amountCtl.setValue(0);
      selectedTag = 'Dia sin operar';
      if (tags.indexOf('Dia sin operar') !== -1) renderTagChips();
    }
  }
  noTradeCheck.addEventListener('change', applyNoTrade);

  // Cuenta arriba (común a ambos modos). Con una sola cuenta, el select queda
  // en el DOM (para que accSelect.value funcione) pero oculto.
  body.appendChild(modeToggle);
  if (accounts.length > 1) {
    body.appendChild(field('Cuenta', accSelect));
  } else {
    accSelect.style.display = 'none';
    body.appendChild(accSelect);
  }
  body.appendChild(diaSec);
  body.appendChild(cajaSec);

  // Recalcular precarga al cambiar fecha o cuenta.
  dateInput.addEventListener('change', preloadExistingDay);
  accSelect.addEventListener('change', preloadExistingDay);

  function applyTradingMode(next) {
    mode = next;
    const dia = mode === 'dia';
    btnDia.classList.toggle('is-active', dia);
    btnDia.classList.toggle('typetoggle__btn--pos', dia);
    btnCaja.classList.toggle('is-active', !dia);
    btnCaja.classList.toggle('typetoggle__btn--pos', !dia);
    diaSec.style.display = dia ? '' : 'none';
    cajaSec.style.display = dia ? 'none' : '';
    if (dia) focusAmount(amountInput);
    else setTimeout(() => { try { cajaAmountInput.focus(); } catch (_e) { /* noop */ } }, 30);
  }
  btnDia.addEventListener('click', () => applyTradingMode('dia'));
  btnCaja.addEventListener('click', () => applyTradingMode('caja'));

  applyTradingMode('dia');
  preloadExistingDay();

  _activeSheet = openSheet({
    title: 'Trading',
    content: body,
    height: '88dvh',
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: () => { /* cierra solo */ } },
      {
        label: 'Guardar',
        variant: 'primary',
        onClick: () => {
          const accId = accSelect.value;
          if (!accId) {
            toast('Selecciona una cuenta de trading', { type: 'error' });
            return false;
          }

          if (mode === 'caja') {
            const camt = cajaAmountCtl.getValue();
            if (!(camt > 0)) {
              toast('Ingresa un monto mayor a 0', { type: 'error' });
              try { cajaAmountInput.focus(); } catch (_e) { /* noop */ }
              return false;
            }
            addTradingMovement({
              accountId: accId,
              type: cajaType,
              amount: camt,
              date: cajaDateInput.value || hoy(),
              note: (cajaNoteInput.value || '').trim(),
            });
            finishSave(cajaType === 'deposit' ? 'Depósito registrado' : 'Retiro registrado');
            return false;
          }

          // Modo día.
          const noTrade = noTradeCheck.checked;
          let pnl = 0;
          if (!noTrade) {
            const raw = amountCtl.getValue();
            if (!(raw > 0)) {
              toast('Ingresa el P&L del día (mayor a 0) o marca "Hoy no operé"', { type: 'error' });
              try { amountInput.focus(); } catch (_e) { /* noop */ }
              return false;
            }
            pnl = pnlSign * raw;
          }

          const trades = Math.max(0, parseInt(tradesInput.value, 10) || 0);
          setTradeDay({
            accountId: accId,
            date: dateInput.value || hoy(),
            pnl,
            trades,
            note: (noteInput.value || '').trim(),
            tag: selectedTag,
            traded: !noTrade,
          });
          finishSave(noTrade ? 'Día sin operar guardado' : 'Día de trading guardado');
          return false;
        },
      },
    ],
    onClose: () => { setTimeout(() => { if (!_activeSheet) sheetOnClose(); }, 0); },
  });

  focusAmount(amountInput);
}

/* ============================================================================
 *  UTILIDADES VARIAS
 * ========================================================================== */

// Fecha por defecto: params.fecha válida o hoy.
function defaultDate(params) {
  const f = params && params.fecha;
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  return hoy();
}

// Enfoca el input de monto tras la animación de apertura del sheet.
function focusAmount(input) {
  if (!input) return;
  setTimeout(() => {
    try { input.focus({ preventScroll: true }); } catch (_e) {
      try { input.focus(); } catch (_e2) { /* noop */ }
    }
  }, 260);
}

// Garantiza un array (las funciones core ya devuelven arrays, esto es defensivo).
function safeArr(v) { return Array.isArray(v) ? v : []; }

// Capitaliza la primera letra.
function cap(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Busca una transacción por id sin export dedicado (usa getTransactions).
function findTransactionById(id) {
  if (!id) return null;
  const rows = safeArr(getTransactions({}));
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].id === id) return rows[i];
  }
  return null;
}

export default { openRegistro };
