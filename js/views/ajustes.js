// ============================================================================
// XAURA · js/views/ajustes.js  →  #/ajustes  (SPEC §6.5)
//
// Lista agrupada estilo iOS:
//   · PERFIL: nombre, avatar con inicial.
//   · MONEDA Y TASA: editar tasa USD/COP (setFxRate), toggle "Mostrar COP".
//   · APARIENCIA: tema oscuro/claro/auto, acento.
//   · DATOS: Exportar JSON, Importar (con confirmación), Exportar CSV por
//     entidad, Borrar todo (confirmDestructive → resetDB).
//   · PRESUPUESTO: presupuesto mensual personal.
//   · TRADING: balance inicial, fecha inicio, meta mensual %, etiquetas.
//   · INSTALAR APP: acordeón iOS/Android + beforeinstallprompt.
//   · ACERCA DE: versión, privacidad, créditos.
//
// Contrato de vista: export render(params) / export unmount(). Pinta en #view,
// usa setHeader(). Tras cambios refresca la vista y dispara el bus.
// ============================================================================

import { setHeader } from '../ui/header.js';

import {
  fmtCOP, fmtUSD, fmtPct, toNum,
} from '../core/currency.js';

import { hoy, formatDateEs, parseLocalDate } from '../core/dates.js';

import {
  getSettings, updateSettings, setFxRate, getFxRate,
} from '../core/settings.js';

import { autoUpdateRate } from '../core/fx.js';

import {
  getTradingAccounts, updateTradingAccount, addTradingAccount,
} from '../core/trading.js';

import {
  downloadBackup, triggerImport, downloadCSV, CSV_ENTITIES,
} from '../core/backup.js';

import { resetDB } from '../core/store.js';
import { APP_VERSION } from '../core/schema.js';

import { openSheet, closeSheet } from '../ui/sheet.js';
import { openModal, confirmDestructive, promptText } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { attachAmountInput } from '../ui/keypad.js';

/* ============================================================================
 *  ICONOS
 * ========================================================================== */
const ICON = {
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.5 2.5 0 0 1-2.5-1.5"/><path d="M12 6.5v1M12 16.5v1"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.6 1.5-1.4 0-.4-.2-.8-.4-1-.3-.3-.4-.6-.4-1 0-.8.6-1.4 1.4-1.4H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  budget: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1"/><path d="M3 7v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3"/><path d="M21 11h-4a2 2 0 0 0 0 4h4z"/></svg>',
  candle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v17a1 1 0 0 0 1 1h16"/><rect x="8" y="9" width="3" height="6" rx="1"/><path d="M9.5 6v3M9.5 15v2"/></svg>',
  install: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="M8 13l4-4 4 4"/><path d="M5 5h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/></svg>',
  apple: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4.5a3.5 3.5 0 0 0-3 2"/><path d="M12 8c-2.5 0-5 1.7-5 5.5C7 17 9 21 12 21c1 0 1.3-.5 2.5-.5s1.5.5 2.5.5c1.6 0 3-2.3 3.5-4-2.5-1-2.5-4.5 0-5.5C19.5 9.5 18 8 16 8c-1.3 0-1.7.5-2.5.5S13.3 8 12 8z"/></svg>',
  android: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V11a7 7 0 0 1 14 0v5"/><path d="M3 16h18"/><path d="M8 8 6 5M16 8l2-3"/><path d="M9 20v1M15 20v1"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 13v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6"/></svg>',
};

/* ============================================================================
 *  ESTADO
 * ========================================================================== */
let _busOff = null;
let _fileInput = null;

/* ---- helpers ------------------------------------------------------------- */
function elh(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function viewEl() { return document.getElementById('view'); }
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getBus() {
  try { return (window.XAURA && window.XAURA.bus) || null; } catch (_e) { return null; }
}
function emitChanged(action) {
  const bus = getBus();
  if (bus) { try { bus.emit('data:changed', { area: 'settings', action }); } catch (_e) { /* noop */ } }
}
function emitFx(rate) {
  const bus = getBus();
  if (bus) { try { bus.emit('fx:changed', { usdToCop: rate, date: hoy() }); } catch (_e) { /* noop */ } }
}
function applyThemeSafe(theme) {
  try {
    if (window.XAURA && typeof window.XAURA.applyTheme === 'function') {
      window.XAURA.applyTheme(theme);
      return;
    }
  } catch (_e) { /* noop */ }
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}
function installAvailable() {
  try { return !!(window.XAURA && window.XAURA.isInstallAvailable && window.XAURA.isInstallAvailable()); } catch (_e) { return false; }
}
function promptInstallSafe() {
  try {
    if (window.XAURA && typeof window.XAURA.promptInstall === 'function') return window.XAURA.promptInstall();
  } catch (_e) { /* noop */ }
  return Promise.resolve({ ok: false, reason: 'unavailable' });
}

// Detección de plataforma para la sección Instalar.
function isIOS() {
  try {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
  } catch (_e) { return false; }
}
function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  } catch (_e) { return false; }
}

/* ============================================================================
 *  ENSURE STYLES (clases locales de Ajustes)
 * ========================================================================== */
function ensureStyles() {
  if (document.getElementById('ajustes-view-style')) return;
  const css = `
.set-avatar{ display:flex; align-items:center; gap:var(--sp-4); padding:var(--sp-5) var(--sp-4); border-radius:var(--r-lg); background:var(--glass-bg); -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(140%); backdrop-filter:blur(var(--glass-blur)) saturate(140%); border:1px solid var(--glass-border); }
.set-avatar__circle{ width:64px; height:64px; border-radius:var(--r-pill); display:inline-flex; align-items:center; justify-content:center; font-family:var(--font-serif); font-weight:600; font-size:30px; color:var(--text-on-gold); background:var(--gradient-gold); box-shadow:var(--sh-gold); flex-shrink:0; }
.set-avatar__body{ flex:1 1 auto; min-width:0; }
.set-avatar__name{ font-family:var(--font-serif); font-weight:500; font-size:var(--fs-h2); color:var(--text-primary); }
.set-avatar__hint{ font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:2px; }
.set-edit{ flex-shrink:0; color:var(--gold); font-size:var(--fs-sm); font-weight:600; background:transparent; padding:var(--sp-2) var(--sp-3); border-radius:var(--r-pill); }
.set-seg-row{ display:flex; align-items:center; justify-content:space-between; gap:var(--sp-3); padding:var(--sp-3) var(--sp-4); }
.set-seg-row__label{ font-size:var(--fs-body); color:var(--text-primary); }
.set-version{ text-align:center; color:var(--text-tertiary); font-size:var(--fs-xs); padding:var(--sp-6) 0 var(--sp-2); }
.set-version__brand{ font-family:var(--font-serif); letter-spacing:0.2em; font-size:var(--fs-h3); color:var(--text-secondary); }
.set-version__brand .aura{ color:var(--gold); }
.set-privacy{ text-align:center; color:var(--text-tertiary); font-size:var(--fs-sm); line-height:var(--lh-normal); max-width:34ch; margin:var(--sp-4) auto 0; }
.set-accent-row{ display:flex; gap:var(--sp-2); padding:var(--sp-3) var(--sp-4); }
.set-accent{ width:30px; height:30px; border-radius:var(--r-pill); border:2px solid transparent; }
.set-accent.is-active{ border-color:var(--text-primary); }
`;
  const tag = document.createElement('style');
  tag.id = 'ajustes-view-style';
  tag.textContent = css;
  document.head.appendChild(tag);
}

/* ============================================================================
 *  RENDER PRINCIPAL
 * ========================================================================== */
export function render(_params) {
  ensureStyles();

  // Input oculto para importar JSON.
  if (!_fileInput) {
    _fileInput = document.createElement('input');
    _fileInput.type = 'file';
    _fileInput.accept = 'application/json,.json';
    _fileInput.style.display = 'none';
    document.body.appendChild(_fileInput);
    _fileInput.addEventListener('change', onFileChosen);
  }

  if (!_busOff) {
    const bus = getBus();
    if (bus) {
      const off1 = bus.on('install:available', () => paint());
      const off2 = bus.on('theme:changed', () => { /* el header no cambia; no re-pintamos para no perder scroll */ });
      _busOff = () => { try { off1(); } catch (_e) {} try { off2(); } catch (_e) {} };
    }
  }

  paint();
}

export function unmount() {
  if (_busOff) { try { _busOff(); } catch (_e) { /* noop */ } _busOff = null; }
  if (_fileInput) {
    try { _fileInput.removeEventListener('change', onFileChosen); } catch (_e) { /* noop */ }
    try { _fileInput.remove(); } catch (_e) { /* noop */ }
    _fileInput = null;
  }
  try { closeSheet(true); } catch (_e) { /* noop */ }
}

function refresh() { if (viewEl()) paint(); }

/* ============================================================================
 *  PINTURA
 * ========================================================================== */
function paint() {
  const host = viewEl();
  if (!host) return;
  host.replaceChildren();

  setHeader({ title: 'Ajustes', subtitle: 'Configuración' });

  const root = elh('div', 'enter stack-lg');
  host.appendChild(root);

  root.appendChild(sectionPerfil());
  root.appendChild(sectionMoneda());
  root.appendChild(sectionApariencia());
  root.appendChild(sectionDatos());
  root.appendChild(sectionPresupuesto());
  root.appendChild(sectionTrading());
  root.appendChild(sectionInstalar());
  root.appendChild(sectionAcercaDe());
}

/* ---- builders de grupo --------------------------------------------------- */
function groupSection(title) {
  const sec = elh('div', 'section');
  if (title) sec.appendChild(elh('div', 'section__title', title));
  const group = elh('div', 'settings-group');
  sec.appendChild(group);
  sec._group = group;
  return sec;
}

function row({ icon, label, value, onClick, danger, valueColor }) {
  const tag = onClick ? 'button' : 'div';
  const r = elh(tag, 'settings-row' + (danger ? ' settings-row--danger' : '') + (onClick ? ' pressable' : ''));
  if (onClick) { r.type = 'button'; r.style.width = '100%'; }
  if (icon) {
    const ic = elh('span', 'settings-row__ic', icon);
    r.appendChild(ic);
  }
  r.appendChild(elh('span', 'settings-row__label', escapeHtml(label)));
  if (value != null) {
    const v = elh('span', 'settings-row__value', escapeHtml(value));
    if (valueColor) v.style.color = valueColor;
    r.appendChild(v);
  }
  if (onClick) {
    r.appendChild(elh('span', 'settings-row__chevron', ICON.chevron));
    r.addEventListener('click', onClick);
  }
  return r;
}

function switchRow({ icon, label, checked, onChange }) {
  const r = elh('label', 'settings-row');
  if (icon) r.appendChild(elh('span', 'settings-row__ic', icon));
  r.appendChild(elh('span', 'settings-row__label', escapeHtml(label)));
  const sw = elh('span', 'switch');
  const inp = elh('input');
  inp.type = 'checkbox';
  inp.checked = !!checked;
  inp.addEventListener('change', () => onChange(inp.checked));
  sw.appendChild(inp);
  sw.appendChild(elh('span', 'switch__track'));
  r.appendChild(sw);
  return r;
}

/* ============================================================================
 *  SECCIÓN · PERFIL
 * ========================================================================== */
function sectionPerfil() {
  const s = getSettings();
  const name = (s && s.userName) ? s.userName : '';
  const initial = name ? name.trim().charAt(0).toUpperCase() : 'X';

  const sec = elh('div', 'section');
  sec.appendChild(elh('div', 'section__title', 'Perfil'));

  const card = elh('div', 'set-avatar');
  card.appendChild(elh('div', 'set-avatar__circle', escapeHtml(initial)));
  const body = elh('div', 'set-avatar__body');
  body.appendChild(elh('div', 'set-avatar__name', escapeHtml(name || 'Sin nombre')));
  body.appendChild(elh('div', 'set-avatar__hint', 'Tu perfil local'));
  card.appendChild(body);
  const edit = elh('button', 'set-edit pressable', 'Editar');
  edit.type = 'button';
  edit.addEventListener('click', () => {
    promptText({
      title: 'Tu nombre', label: 'Nombre', value: name, placeholder: 'Carlos',
      validate: (v) => (!v.trim() ? 'Escribe tu nombre' : null),
    }).then((v) => {
      if (v === null) return;
      updateSettings({ userName: v.trim() });
      emitChanged('update-name');
      paint();
    });
  });
  card.appendChild(edit);
  sec.appendChild(card);
  return sec;
}

/* ============================================================================
 *  SECCIÓN · MONEDA Y TASA
 * ========================================================================== */
// Texto de estado de la tasa: "19 jun 2026, 1:30 p. m. · automática".
function fxStatusText(fx, fxAuto) {
  let tiempo = '—';
  const when = fx && fx.fetchedAt ? new Date(fx.fetchedAt) : null;
  if (when && !isNaN(when.getTime())) {
    const fecha = formatDateEs(fx.date || when.toISOString().slice(0, 10));
    let hora = '';
    try { hora = when.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }); } catch (_e) {}
    tiempo = hora ? (fecha + ', ' + hora) : fecha;
  } else if (fx && fx.date) {
    tiempo = formatDateEs(fx.date);
  }
  return tiempo + ' · ' + (fxAuto !== false ? 'automática' : 'manual');
}

// Lanza una actualización forzada de la tasa y refresca la vista.
function refreshRateNow() {
  toast('Buscando tasa del mercado…');
  autoUpdateRate({ force: true }).then((r) => {
    if (r && r.ok) {
      emitFx(r.rate);
      toast('Tasa actualizada: US$1 = ' + fmtCOP(r.rate), { type: 'success' });
    } else if (r && r.reason === 'offline') {
      toast('Sin conexión: se conserva la última tasa', { type: 'error' });
    } else {
      toast('No se pudo obtener la tasa', { type: 'error' });
    }
    paint();
  }).catch(() => toast('No se pudo obtener la tasa', { type: 'error' }));
}

function sectionMoneda() {
  const s = getSettings();
  const sec = groupSection('Moneda y tasa');
  const g = sec._group;

  const fx = (s && s.fxRate) ? s.fxRate : { usdToCop: getFxRate(), date: hoy() };

  // Tasa actual (clic para editar manualmente).
  g.appendChild(row({
    icon: ICON.coin,
    label: 'Tasa USD / COP',
    value: 'US$1 = ' + fmtCOP(fx.usdToCop),
    onClick: openRateSheet,
  }));

  // Toggle: actualización automática desde el mercado.
  g.appendChild(switchRow({
    icon: ICON.refresh,
    label: 'Actualizar al dólar automáticamente',
    checked: s.fxAuto !== false,
    onChange: (checked) => {
      updateSettings({ fxAuto: checked });
      if (checked) refreshRateNow();
      else paint();
    },
  }));

  // Estado de la tasa (fecha/hora + modo).
  const stRow = elh('div', 'settings-row');
  stRow.appendChild(elh('span', 'settings-row__ic', ICON.info));
  stRow.appendChild(elh('span', 'settings-row__label', 'Actualizada'));
  stRow.appendChild(elh('span', 'settings-row__value', fxStatusText(fx, s.fxAuto)));
  g.appendChild(stRow);

  // Botón: actualizar ahora.
  g.appendChild(row({
    icon: ICON.refresh,
    label: 'Actualizar ahora',
    onClick: refreshRateNow,
  }));

  // Toggle mostrar COP en trading.
  g.appendChild(switchRow({
    icon: ICON.coin,
    label: 'Mostrar COP en Trading',
    checked: !!(s.ui && s.ui.showCop),
    onChange: (checked) => {
      updateSettings({ ui: { showCop: checked } });
      emitChanged('toggle-showcop');
      // no re-pintamos toda la vista para preservar scroll; el bus avisa a otras.
    },
  }));

  return sec;
}

function openRateSheet() {
  const s = getSettings();
  const current = (s && s.fxRate && s.fxRate.usdToCop) ? s.fxRate.usdToCop : getFxRate();

  const wrap = elh('div', 'stack');

  const field = elh('div', 'field');
  field.appendChild(elh('label', 'field__label', 'Pesos por 1 dólar (USD → COP)'));
  const line = elh('div', 'amount-line');
  line.appendChild(elh('span', 'amount-line__cur', '$'));
  const input = document.createElement('input');
  input.className = 'input input--amount';
  input.placeholder = '4.000';
  field.appendChild(line);
  line.appendChild(input);
  wrap.appendChild(field);

  const ctrl = attachAmountInput(input, { currency: 'COP' });
  ctrl.setValue(Math.round(current));

  const hint = elh('div', 'field__hint');
  hint.style.textAlign = 'center';
  hint.textContent = 'US$1 = ' + fmtCOP(current);
  wrap.appendChild(hint);
  input.addEventListener('input', () => {
    const v = ctrl.getValue();
    hint.textContent = v > 0 ? 'US$1 = ' + fmtCOP(v) : 'Ingresa una tasa válida';
  });

  openSheet({
    title: 'Editar tasa USD/COP',
    content: wrap,
    height: '46dvh',
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Guardar', variant: 'primary',
        onClick: () => {
          const v = ctrl.getValue();
          if (v <= 0) { toast('Ingresa una tasa válida', { type: 'error' }); return false; }
          // Edición manual: fija la tasa y desactiva el modo automático para
          // que no se sobrescriba sola.
          updateSettings({ fxAuto: false });
          setFxRate(v, hoy(), { manual: true });
          emitFx(v);
          emitChanged('set-fx');
          try { ctrl.destroy(); } catch (_e) { /* noop */ }
          toast('Tasa actualizada', { type: 'success' });
          paint();
          return true;
        },
      },
    ],
    onClose: () => { try { ctrl.destroy(); } catch (_e) { /* noop */ } },
  });
}

/* ============================================================================
 *  SECCIÓN · APARIENCIA
 * ========================================================================== */
function sectionApariencia() {
  const s = getSettings();
  const sec = groupSection('Apariencia');
  const g = sec._group;

  // Tema (segmented oscuro/claro/auto).
  const themeRow = elh('div', 'set-seg-row');
  themeRow.appendChild(elh('span', 'set-seg-row__label', 'Tema'));
  const seg = elh('div', 'segmented');
  seg.style.maxWidth = '210px';
  const current = (s && s.theme) ? s.theme : 'dark';
  [['dark', 'Oscuro'], ['light', 'Claro'], ['auto', 'Auto']].forEach(([key, lbl]) => {
    const b = elh('button', 'segmented__item' + (current === key ? ' segmented__item--active' : ''), lbl);
    b.type = 'button';
    b.addEventListener('click', () => {
      updateSettings({ theme: key });
      applyThemeSafe(key);
      emitChanged('set-theme');
      // Repintamos solo el segmented (marca activa) sin recargar toda la vista.
      seg.querySelectorAll('.segmented__item').forEach((it) => it.classList.remove('segmented__item--active'));
      b.classList.add('segmented__item--active');
    });
    seg.appendChild(b);
  });
  themeRow.appendChild(seg);
  g.appendChild(themeRow);

  // Acento (Dorado por defecto — un único acento en esta versión).
  const accentRow = elh('div', 'set-accent-row');
  accentRow.style.alignItems = 'center';
  accentRow.appendChild(elh('span', 'settings-row__label', 'Acento'));
  const goldDot = elh('span', 'set-accent is-active');
  goldDot.style.background = 'var(--gradient-gold)';
  goldDot.style.marginLeft = 'auto';
  goldDot.title = 'Dorado';
  accentRow.appendChild(goldDot);
  g.appendChild(accentRow);

  return sec;
}

/* ============================================================================
 *  SECCIÓN · DATOS
 * ========================================================================== */
function sectionDatos() {
  const sec = groupSection('Datos');
  const g = sec._group;

  // Exportar JSON.
  g.appendChild(row({
    icon: ICON.download,
    label: 'Exportar copia (JSON)',
    onClick: () => {
      const res = downloadBackup();
      if (res && res.ok) toast('Copia exportada: ' + res.name, { type: 'success' });
      else toast('No se pudo exportar', { type: 'error' });
    },
  }));

  // Importar JSON.
  g.appendChild(row({
    icon: ICON.upload,
    label: 'Importar copia (JSON)',
    onClick: () => {
      openModal({
        title: 'Importar copia',
        content: 'Al importar se <strong>reemplazarán</strong> todos los datos actuales por los del archivo. Esta acción no se puede deshacer.<br><br>¿Quieres continuar?',
        confirmText: 'Elegir archivo',
        icon: 'info',
        onConfirm: () => {
          if (_fileInput) { try { _fileInput.value = ''; _fileInput.click(); } catch (_e) { /* noop */ } }
        },
      });
    },
  }));

  // Exportar CSV por entidad.
  g.appendChild(row({
    icon: ICON.table,
    label: 'Exportar CSV por entidad',
    onClick: openCsvSheet,
  }));

  // Borrar todo.
  g.appendChild(row({
    icon: ICON.trash,
    label: 'Borrar todos los datos',
    danger: true,
    onClick: () => {
      confirmDestructive({
        title: '¿Borrar todo?',
        message: 'Se eliminarán todas tus cuentas, movimientos, eventos y operaciones de este dispositivo. Tip: exporta una copia antes.',
        word: 'BORRAR',
        confirmText: 'Borrar todo',
      }).then((ok) => {
        if (!ok) return;
        resetDB();
        emitChanged('reset');
        emitFx(getFxRate());
        toast('Todos los datos fueron borrados', { type: 'info' });
        // Tras borrar, el usuario vuelve a estado inicial: recarga a inicio.
        try { location.hash = '#/inicio'; } catch (_e) { /* noop */ }
        paint();
      });
    },
  }));

  return sec;
}

function onFileChosen(e) {
  const file = e && e.target && e.target.files && e.target.files[0];
  if (!file) return;
  triggerImport(file, { mode: 'replace' }).then((res) => {
    if (res && res.ok) {
      emitChanged('import');
      emitFx(getFxRate());
      toast('Copia importada correctamente', { type: 'success' });
      try { location.hash = '#/inicio'; } catch (_e) { /* noop */ }
      paint();
    } else {
      const map = {
        json_invalido: 'El archivo no es un JSON válido.',
        formato_invalido: 'Formato no reconocido.',
        no_es_backup_xaura: 'No es una copia de XAURA.',
        datos_corruptos: 'Los datos están dañados.',
        migracion_fallida: 'No se pudo migrar la copia.',
        lectura_fallida: 'No se pudo leer el archivo.',
        sin_archivo: 'No se eligió ningún archivo.',
      };
      const msg = (res && map[res.error]) || 'No se pudo importar la copia.';
      toast(msg, { type: 'error' });
    }
  });
}

function openCsvSheet() {
  const list = elh('div', 'settings-group');
  CSV_ENTITIES.forEach((ent) => {
    const r = elh('button', 'settings-row pressable');
    r.type = 'button';
    r.style.width = '100%';
    r.appendChild(elh('span', 'settings-row__ic', ICON.table));
    r.appendChild(elh('span', 'settings-row__label', escapeHtml(ent.label)));
    r.appendChild(elh('span', 'settings-row__chevron', ICON.download));
    r.addEventListener('click', () => {
      const res = downloadCSV(ent.key);
      if (res && res.ok) toast('CSV exportado: ' + res.name, { type: 'success' });
      else toast('No se pudo exportar', { type: 'error' });
    });
    list.appendChild(r);
  });
  openSheet({ title: 'Exportar CSV', content: list, height: '70dvh' });
}

/* ============================================================================
 *  SECCIÓN · PRESUPUESTO MENSUAL PERSONAL
 * ========================================================================== */
function sectionPresupuesto() {
  const s = getSettings();
  const sec = groupSection('Presupuesto');
  const g = sec._group;

  const budget = toNum(s && s.personalBudgetMonthly, 0);
  g.appendChild(row({
    icon: ICON.budget,
    label: 'Presupuesto mensual personal',
    value: budget > 0 ? fmtCOP(budget) : 'Sin definir',
    onClick: () => {
      const wrap = elh('div', 'stack');
      const field = elh('div', 'field');
      field.appendChild(elh('label', 'field__label', 'Tope total de gasto mensual (COP)'));
      const line = elh('div', 'amount-line');
      line.appendChild(elh('span', 'amount-line__cur', '$'));
      const input = document.createElement('input');
      input.className = 'input input--amount';
      input.placeholder = '0';
      line.appendChild(input);
      field.appendChild(line);
      wrap.appendChild(field);
      const ctrl = attachAmountInput(input, { currency: 'COP' });
      if (budget > 0) ctrl.setValue(budget);

      openSheet({
        title: 'Presupuesto mensual',
        content: wrap,
        height: '46dvh',
        actions: [
          { label: 'Cancelar', variant: 'ghost' },
          {
            label: 'Guardar', variant: 'primary',
            onClick: () => {
              updateSettings({ personalBudgetMonthly: ctrl.getValue() });
              emitChanged('set-budget');
              try { ctrl.destroy(); } catch (_e) { /* noop */ }
              toast('Presupuesto actualizado', { type: 'success' });
              paint();
              return true;
            },
          },
        ],
        onClose: () => { try { ctrl.destroy(); } catch (_e) { /* noop */ } },
      });
    },
  }));

  return sec;
}

/* ============================================================================
 *  SECCIÓN · TRADING
 *  balance inicial · fecha inicio · meta mensual % · etiquetas
 * ========================================================================== */
function sectionTrading() {
  const s = getSettings();
  const sec = groupSection('Trading');
  const g = sec._group;

  const accs = getTradingAccounts({ includeArchived: false });
  const acc = accs[0] || null;

  // Balance inicial.
  g.appendChild(row({
    icon: ICON.candle,
    label: 'Balance inicial',
    value: acc ? fmtUSD(acc.initialBalance) : 'Sin cuenta',
    onClick: () => {
      if (!acc) { createTradingAccountQuick(); return; }
      promptText({
        title: 'Balance inicial (USD)', label: 'Capital base de la cuenta',
        value: String(acc.initialBalance || ''), inputmode: 'decimal',
        validate: (v) => (toNum(v) < 0 ? 'No puede ser negativo' : null),
      }).then((v) => {
        if (v === null) return;
        updateTradingAccount(acc.id, { initialBalance: toNum(v) });
        emitChanged('update-account');
        toast('Balance inicial actualizado', { type: 'success' });
        paint();
      });
    },
  }));

  // Fecha de inicio.
  g.appendChild(row({
    icon: ICON.candle,
    label: 'Fecha de inicio',
    value: acc && acc.startDate ? formatDateEs(acc.startDate) : '—',
    onClick: () => {
      if (!acc) { createTradingAccountQuick(); return; }
      openDateSheet('Fecha de inicio', acc.startDate || hoy(), (d) => {
        updateTradingAccount(acc.id, { startDate: d });
        emitChanged('update-account');
        toast('Fecha de inicio actualizada', { type: 'success' });
        paint();
      });
    },
  }));

  // Meta mensual %.
  g.appendChild(row({
    icon: ICON.candle,
    label: 'Meta mensual',
    value: fmtPct(toNum(s.trading && s.trading.monthlyTargetPct), 0),
    onClick: () => {
      promptText({
        title: 'Meta mensual (%)', label: 'Retorno objetivo por mes',
        value: String((s.trading && s.trading.monthlyTargetPct) || ''), inputmode: 'decimal',
        validate: (v) => (toNum(v) < 0 ? 'No puede ser negativo' : null),
      }).then((v) => {
        if (v === null) return;
        updateSettings({ trading: { monthlyTargetPct: toNum(v) } });
        emitChanged('update-settings');
        toast('Meta actualizada', { type: 'success' });
        paint();
      });
    },
  }));

  // Etiquetas de sesión.
  const tags = (s.trading && Array.isArray(s.trading.tags)) ? s.trading.tags : [];
  g.appendChild(row({
    icon: ICON.candle,
    label: 'Etiquetas de sesión',
    value: String(tags.length) + ' etiquetas',
    onClick: openTagsSheet,
  }));

  return sec;
}

function createTradingAccountQuick() {
  promptText({ title: 'Nueva cuenta', label: 'Nombre de la cuenta', placeholder: 'Mi cuenta de trading' }).then((name) => {
    if (name === null) return;
    addTradingAccount({ name: name.trim() || 'Cuenta de trading', startDate: hoy() });
    emitChanged('add-account');
    toast('Cuenta creada', { type: 'success' });
    paint();
  });
}

function openTagsSheet() {
  const s = getSettings();
  let tags = (s.trading && Array.isArray(s.trading.tags)) ? s.trading.tags.slice() : [];

  const wrap = elh('div', 'stack');
  const listWrap = elh('div', 'settings-group');
  wrap.appendChild(listWrap);

  function repaintList() {
    listWrap.replaceChildren();
    if (!tags.length) {
      const empty = elh('div', 'settings-row');
      empty.appendChild(elh('span', 'settings-row__label', 'Sin etiquetas'));
      listWrap.appendChild(empty);
    }
    tags.forEach((t, idx) => {
      const r = elh('div', 'settings-row');
      r.appendChild(elh('span', 'settings-row__label', escapeHtml(t)));
      const del = elh('button', 'btn--icon-bare pressable', ICON.trash);
      del.type = 'button';
      del.setAttribute('aria-label', 'Eliminar etiqueta');
      del.style.color = 'var(--negative)';
      del.addEventListener('click', () => {
        tags.splice(idx, 1);
        commitTags();
        repaintList();
      });
      r.appendChild(del);
      listWrap.appendChild(r);
    });
  }

  function commitTags() {
    updateSettings({ trading: { tags: tags.slice() } });
    emitChanged('update-tags');
  }

  const addBtn = elh('button', 'btn btn--outline btn--full pressable', 'Añadir etiqueta');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    promptText({ title: 'Nueva etiqueta', placeholder: 'Ej. Londres' }).then((v) => {
      if (!v) return;
      if (!tags.includes(v)) tags.push(v);
      commitTags();
      repaintList();
    });
  });
  wrap.appendChild(addBtn);

  repaintList();

  openSheet({
    title: 'Etiquetas de sesión',
    content: wrap,
    height: '70dvh',
    onClose: () => paint(),
  });
}

/* ============================================================================
 *  SECCIÓN · INSTALAR APP (acordeón iOS / Android + beforeinstallprompt)
 * ========================================================================== */
function sectionInstalar() {
  const sec = elh('div', 'section');
  sec.appendChild(elh('div', 'section__title', 'Instalar app'));

  if (isStandalone()) {
    const group = elh('div', 'settings-group');
    const r = elh('div', 'settings-row');
    r.appendChild(elh('span', 'settings-row__ic', ICON.install));
    r.appendChild(elh('span', 'settings-row__label', 'XAURA ya está instalada ✓'));
    group.appendChild(r);
    sec.appendChild(group);
    return sec;
  }

  // Botón directo para Android si hay beforeinstallprompt disponible.
  if (installAvailable()) {
    const btn = elh('button', 'btn btn--primary btn--full pressable', ICON.install + '<span>Instalar XAURA</span>');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      promptInstallSafe().then((res) => {
        if (res && res.ok && res.accepted) toast('Instalando XAURA…', { type: 'success' });
        else if (res && res.ok && !res.accepted) toast('Instalación cancelada', { type: 'info' });
        paint();
      });
    });
    sec.appendChild(btn);
  }

  // Acordeón iOS.
  sec.appendChild(buildAccordion({
    icon: ICON.apple,
    title: 'En iPhone / iPad (Safari)',
    open: isIOS(),
    steps: [
      'Abre XAURA en Safari.',
      'Toca el botón Compartir (el cuadro con la flecha hacia arriba).',
      'Desliza y elige “Añadir a pantalla de inicio”.',
      'Confirma con “Añadir”. XAURA quedará como una app.',
    ],
  }));

  // Acordeón Android.
  sec.appendChild(buildAccordion({
    icon: ICON.android,
    title: 'En Android (Chrome)',
    open: !isIOS() && !installAvailable(),
    steps: [
      'Abre XAURA en Chrome.',
      'Toca el menú (⋮) arriba a la derecha.',
      'Elige “Instalar app” o “Añadir a pantalla principal”.',
      'Confirma. Si ves el botón “Instalar XAURA” arriba, úsalo directamente.',
    ],
  }));

  return sec;
}

function buildAccordion({ icon, title, steps, open }) {
  const acc = elh('div', 'accordion' + (open ? ' is-open' : ''));
  acc.style.marginTop = 'var(--sp-3)';
  const head = elh('button', 'accordion__head pressable');
  head.type = 'button';
  head.style.width = '100%';
  const left = elh('span');
  left.style.display = 'inline-flex';
  left.style.alignItems = 'center';
  left.style.gap = 'var(--sp-3)';
  const ic = elh('span', 'settings-row__ic', icon);
  left.appendChild(ic);
  left.appendChild(elh('span', null, escapeHtml(title)));
  head.appendChild(left);
  head.appendChild(elh('span', null, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'));
  acc.appendChild(head);

  const bodyWrap = elh('div', 'accordion__body');
  const inner = elh('div', 'accordion__inner');
  const ol = document.createElement('ol');
  steps.forEach((stp) => {
    const li = document.createElement('li');
    li.textContent = stp;
    ol.appendChild(li);
  });
  inner.appendChild(ol);
  bodyWrap.appendChild(inner);
  acc.appendChild(bodyWrap);

  head.addEventListener('click', () => acc.classList.toggle('is-open'));
  return acc;
}

/* ============================================================================
 *  SECCIÓN · ACERCA DE
 * ========================================================================== */
function sectionAcercaDe() {
  const sec = groupSection('Acerca de');
  const g = sec._group;

  g.appendChild(row({ icon: ICON.info, label: 'Versión', value: 'XAURA ' + APP_VERSION }));

  g.appendChild(row({
    icon: ICON.info,
    label: 'Privacidad',
    onClick: () => {
      openModal({
        title: 'Privacidad',
        content: 'Tus datos viven solo en este dispositivo. Sin nube, sin cuentas, sin rastreo. Exporta una copia cuando quieras desde Ajustes › Datos.',
        confirmText: 'Entendido', showCancel: false, icon: 'info',
      });
    },
  }));

  // Pie de versión / marca.
  const foot = elh('div', 'set-version');
  foot.appendChild(elh('div', 'set-version__brand', 'X<span class="aura">A</span>URA'));
  foot.appendChild(elh('div', null, 'Versión ' + APP_VERSION));
  const priv = elh('p', 'set-privacy', 'Tus datos viven solo en este dispositivo. Sin nube, sin cuentas.');
  foot.appendChild(priv);
  sec.appendChild(foot);

  return sec;
}

/* ============================================================================
 *  SHEET · SELECTOR DE FECHA (reutilizable para Trading en Ajustes)
 * ========================================================================== */
function openDateSheet(title, currentISO, onPick) {
  const wrap = elh('div', 'stack');
  let value = (currentISO && parseLocalDate(currentISO)) ? currentISO : hoy();

  const field = elh('div', 'field');
  field.appendChild(elh('label', 'field__label', 'Selecciona la fecha'));
  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'date';
  input.value = value;
  input.max = hoy();
  field.appendChild(input);
  wrap.appendChild(field);

  openSheet({
    title: title || 'Fecha',
    content: wrap,
    height: '42dvh',
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Aceptar', variant: 'primary',
        onClick: () => {
          const picked = (input.value && parseLocalDate(input.value)) ? input.value : value;
          if (typeof onPick === 'function') onPick(picked);
          return true;
        },
      },
    ],
  });
}

export default { render, unmount };
