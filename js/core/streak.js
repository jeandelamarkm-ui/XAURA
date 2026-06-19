// ============================================================================
// XAURA · js/core/streak.js
// Racha diaria (SPEC §9): días calendario consecutivos con ≥1 registro en
// CUALQUIER módulo. Persiste en settings.streak = { count, lastActiveDate }.
//
// Reglas (SPEC §9):
//   - Al abrir / registrar:
//       hoy === lastActiveDate           → sin cambio
//       hoy === lastActiveDate + 1 día   → count++ (continúa la racha)
//       hoy  >  lastActiveDate + 1 día   → racha rota → count = 1 (hoy cuenta)
//       lastActiveDate === null          → count = 1
//   - Hitos 7 / 30 / 100 → se exponen para disparar toast dorado en la UI.
//
// touchStreak() se llama al CREAR cualquier registro (transacción, abono/costo
// de evento, día de trading, movimiento de caja, meta…). getStreak() sólo lee
// y evalúa si la racha sigue viva respecto a hoy (para mostrar/avisar).
// ============================================================================

import { getSettings, updateSettings } from './settings.js';
import { hoy, diffDays } from './dates.js';

// Hitos que disparan celebración (toast dorado en la UI).
export const STREAK_MILESTONES = Object.freeze([7, 30, 100]);

/* ============================================================================
 *  LECTURA DEFENSIVA DEL ESTADO PERSISTIDO
 * ========================================================================== */
function readState() {
  const s = getSettings() || {};
  const st = s.streak && typeof s.streak === 'object' ? s.streak : {};
  const count = Number.isFinite(st.count) ? st.count : Number(st.count) || 0;
  const lastActiveDate = (typeof st.lastActiveDate === 'string' && st.lastActiveDate)
    ? st.lastActiveDate
    : null;
  return { count: count < 0 ? 0 : count, lastActiveDate };
}

/* ============================================================================
 *  getStreak() — estado actual SIN registrar actividad.
 *  Evalúa si la racha sigue "viva" respecto a hoy:
 *    - active: true si lastActiveDate es hoy (ya registró hoy).
 *    - alive : true si la racha aún puede continuarse hoy (último activo = hoy
 *              o ayer). Si se saltó ≥1 día completo sin registrar, está rota
 *              (se reportará count efectivo 0) hasta que se registre hoy.
 *
 *  NOTA: getStreak NO persiste. Sólo touchStreak modifica el almacenamiento.
 * ========================================================================== */
export function getStreak() {
  const { count, lastActiveDate } = readState();
  const today = hoy();

  if (!lastActiveDate) {
    return {
      count: 0,
      lastActiveDate: null,
      active: false,     // no hay registro hoy
      alive: false,      // no hay racha en curso
      registeredToday: false,
      gap: null,
    };
  }

  const gap = diffDays(lastActiveDate, today); // días desde el último activo

  // gap === 0 → registró hoy; gap === 1 → registró ayer (racha viva, sin sumar
  // todavía hoy); gap >= 2 → racha rota (se mostrará como 0 hasta registrar).
  const registeredToday = gap === 0;
  const alive = gap <= 1;
  const effectiveCount = alive ? count : 0;

  return {
    count: effectiveCount,
    lastActiveDate,
    active: registeredToday,
    alive,
    registeredToday,
    gap,
  };
}

/* ============================================================================
 *  touchStreak() — registra actividad de HOY y actualiza la racha.
 *  Idempotente dentro del mismo día: si ya se tocó hoy, no incrementa.
 *
 *  @returns {{count, lastActiveDate, changed, incremented, reset,
 *             milestone:number|null, registeredToday:true}}
 *     - changed     : hubo cambio en el estado persistido.
 *     - incremented : la racha aumentó en 1 (día consecutivo).
 *     - reset       : la racha se reinició a 1 (se había roto o era nueva).
 *     - milestone   : 7|30|100 si el nuevo count alcanzó un hito, o null.
 * ========================================================================== */
export function touchStreak() {
  const { count, lastActiveDate } = readState();
  const today = hoy();

  let newCount = count;
  let incremented = false;
  let reset = false;
  let changed = false;

  if (lastActiveDate === today) {
    // Ya se registró actividad hoy: sin cambios en el contador.
    return {
      count,
      lastActiveDate: today,
      changed: false,
      incremented: false,
      reset: false,
      milestone: null,
      registeredToday: true,
    };
  }

  if (!lastActiveDate) {
    newCount = 1;
    reset = true;        // primera actividad registrada
    changed = true;
  } else {
    const gap = diffDays(lastActiveDate, today);
    if (gap === 1) {
      // Día calendario consecutivo: continúa la racha.
      newCount = count + 1;
      incremented = true;
      changed = true;
    } else if (gap >= 2) {
      // Se saltó al menos un día completo: racha rota; hoy reinicia en 1.
      newCount = 1;
      reset = true;
      changed = true;
    } else {
      // gap <= 0 (fecha futura/reloj desfasado): trata hoy como nuevo activo
      // sin reducir la racha; al menos garantiza 1.
      newCount = count > 0 ? count : 1;
      changed = newCount !== count || lastActiveDate !== today;
    }
  }

  updateSettings({ streak: { count: newCount, lastActiveDate: today } });

  const milestone = STREAK_MILESTONES.indexOf(newCount) !== -1 ? newCount : null;

  return {
    count: newCount,
    lastActiveDate: today,
    changed,
    incremented,
    reset,
    milestone,
    registeredToday: true,
  };
}

/* ============================================================================
 *  needsTodayRegister() — ¿conviene mostrar el banner "registra hoy"?
 *  true si la racha está viva pero aún no se registró nada hoy (SPEC §9).
 * ========================================================================== */
export function needsTodayRegister() {
  const s = getStreak();
  return s.alive && !s.registeredToday;
}

/* ============================================================================
 *  resetStreak() — limpia la racha (uso en borrado total / pruebas).
 * ========================================================================== */
export function resetStreak() {
  updateSettings({ streak: { count: 0, lastActiveDate: null } });
  return { count: 0, lastActiveDate: null };
}
