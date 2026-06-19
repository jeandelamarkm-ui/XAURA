// XAURA · js/core/seed.js
// Carga un DB de ejemplo COHERENTE (SPEC §4.7). Cifras objetivo:
//  - Patrimonio personal = 8.353.000 COP  (Sum de saldos COP)
//  - Boda: utilidad = 1.800.000 COP, margen = 12,9% (quoted 14.000.000, costos 12.200.000),
//          por cobrar = 14.000.000 (abonado 0)
//  - Trading: P&L total = +1.640,50 USD, balance = 101.640,50, win rate = 66,7% (8/12)
// Fechas relativas al mes actual usando new Date() en runtime.
//
// Exporta: loadSeed()  -> rellena db en memoria y persiste
//          DEMO_FLAG   -> bandera de datos de ejemplo
//          isDemo()    -> true si el db actual fue sembrado como demo

import { getDB, saveDB, commit, resetDB, nextId, budgetId, tradeDayId, newGroupId } from './store.js';
import { isoDate, nowISO, roundMoney } from './schema.js';

/* ============================================================
 *  BANDERA DEMO
 * ============================================================ */
export const DEMO_FLAG = 'xaura:seed:demo';

export function isDemo() {
  try {
    return localStorage.getItem(DEMO_FLAG) === '1';
  } catch (_e) {
    return false;
  }
}

/* ============================================================
 *  AYUDANTES DE FECHA (mes actual)
 * ============================================================ */
function pad2(n) { return String(n).padStart(2, '0'); }

// Fecha del mes actual en el dia indicado (clamp a fin de mes). Devuelve ISO local.
function dayOfThisMonth(day) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const last = new Date(y, m + 1, 0).getDate();
  const d = Math.min(Math.max(1, day), last);
  return y + '-' + pad2(m + 1) + '-' + pad2(d);
}

// Fecha N dias en el futuro desde hoy (para eventos proximos). ISO local.
function todayPlusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// Clave de mes actual YYYY-MM.
function thisMonthKey() {
  const now = new Date();
  return now.getFullYear() + '-' + pad2(now.getMonth() + 1);
}

/* ============================================================
 *  CARGA DEL SEED
 * ============================================================ */
export function loadSeed() {
  // Parte de un DB limpio para evitar mezclas e IDs colisionados.
  resetDB();
  const db = getDB();
  const ts = nowISO();
  const month = thisMonthKey();

  /* ------------------------------------------------------------------
   *  PERSONAL — CUENTAS  (init total = 6.508.000)
   * ------------------------------------------------------------------ */
  const accCash = nextId('acc');
  const accBank = nextId('acc');
  const accNequi = nextId('acc');
  const accSavings = nextId('acc');

  db.personal.accounts.push(
    { id: accCash, name: 'Efectivo', type: 'cash', currency: 'COP', initialBalance: 508000, color: '#D4AF37', icon: 'ti-cash', archived: false, createdAt: ts, updatedAt: ts },
    { id: accBank, name: 'Bancolombia', type: 'bank', currency: 'COP', initialBalance: 2500000, color: '#5E9DF6', icon: 'ti-building-bank', archived: false, createdAt: ts, updatedAt: ts },
    { id: accNequi, name: 'Nequi', type: 'wallet', currency: 'COP', initialBalance: 500000, color: '#C084FC', icon: 'ti-wallet', archived: false, createdAt: ts, updatedAt: ts },
    { id: accSavings, name: 'Ahorros', type: 'savings', currency: 'COP', initialBalance: 3000000, color: '#34D399', icon: 'ti-pig-money', archived: false, createdAt: ts, updatedAt: ts }
  );

  /* ------------------------------------------------------------------
   *  PERSONAL — CATEGORIAS (contexto colombiano)
   * ------------------------------------------------------------------ */
  // Ingreso
  const catSalario = nextId('cat');
  const catHonorarios = nextId('cat');
  const catOtrosIng = nextId('cat');
  // Gasto
  const catArriendo = nextId('cat');
  const catMercado = nextId('cat');
  const catServicios = nextId('cat');
  const catRestaurante = nextId('cat');
  const catTransporte = nextId('cat');
  const catSalud = nextId('cat');
  const catEntretenimiento = nextId('cat');
  const catRopa = nextId('cat');
  const catSuscripciones = nextId('cat');

  db.personal.categories.push(
    { id: catSalario, name: 'Salario', kind: 'income', color: '#34D399', icon: 'ti-businessplan', monthlyBudget: null, archived: false, createdAt: ts },
    { id: catHonorarios, name: 'Honorarios', kind: 'income', color: '#5E9DF6', icon: 'ti-briefcase', monthlyBudget: null, archived: false, createdAt: ts },
    { id: catOtrosIng, name: 'Otros ingresos', kind: 'income', color: '#C084FC', icon: 'ti-coin', monthlyBudget: null, archived: false, createdAt: ts },

    { id: catArriendo, name: 'Arriendo', kind: 'expense', color: '#F87171', icon: 'ti-home', monthlyBudget: 1800000, archived: false, createdAt: ts },
    { id: catMercado, name: 'Mercado', kind: 'expense', color: '#FBBF24', icon: 'ti-shopping-cart', monthlyBudget: 800000, archived: false, createdAt: ts },
    { id: catServicios, name: 'Servicios', kind: 'expense', color: '#5E9DF6', icon: 'ti-bolt', monthlyBudget: 400000, archived: false, createdAt: ts },
    { id: catRestaurante, name: 'Restaurantes', kind: 'expense', color: '#C084FC', icon: 'ti-tools-kitchen-2', monthlyBudget: 250000, archived: false, createdAt: ts },
    { id: catTransporte, name: 'Transporte', kind: 'expense', color: '#34D399', icon: 'ti-car', monthlyBudget: 300000, archived: false, createdAt: ts },
    { id: catSalud, name: 'Salud', kind: 'expense', color: '#F4D58D', icon: 'ti-heartbeat', monthlyBudget: 250000, archived: false, createdAt: ts },
    { id: catEntretenimiento, name: 'Entretenimiento', kind: 'expense', color: '#D4AF37', icon: 'ti-device-gamepad-2', monthlyBudget: 200000, archived: false, createdAt: ts },
    { id: catRopa, name: 'Ropa', kind: 'expense', color: '#C8A24B', icon: 'ti-shirt', monthlyBudget: 300000, archived: false, createdAt: ts },
    { id: catSuscripciones, name: 'Suscripciones', kind: 'expense', color: '#9A9AA4', icon: 'ti-repeat', monthlyBudget: 100000, archived: false, createdAt: ts }
  );

  /* ------------------------------------------------------------------
   *  PERSONAL — TRANSACCIONES (varios dias del mes actual)
   *  Ingresos = 5.880.000 · Gastos = 4.035.000 · neto = +1.845.000
   *  Patrimonio = init(6.508.000) + neto(1.845.000) = 8.353.000
   * ------------------------------------------------------------------ */
  function txn(type, accountId, categoryId, amount, day, note, method) {
    db.personal.transactions.push({
      id: nextId('txn'),
      type, accountId, categoryId,
      amount: roundMoney(amount, 'COP'),
      currency: 'COP',
      date: dayOfThisMonth(day),
      note: note || '',
      tags: [],
      transferGroupId: null,
      method: method || 'transferencia',
      recurring: false,
      createdAt: ts, updatedAt: ts
    });
  }

  // Ingresos (total 5.880.000)
  txn('income', accBank, catSalario, 4500000, 1, 'Salario mensual', 'transferencia');
  txn('income', accBank, catHonorarios, 1200000, 8, 'Proyecto de diseño', 'transferencia');
  txn('income', accNequi, catOtrosIng, 180000, 12, 'Reembolso', 'transferencia');

  // Gastos (total 4.035.000)
  txn('expense', accBank, catArriendo, 1800000, 2, 'Arriendo apartamento', 'transferencia');
  txn('expense', accBank, catMercado, 620000, 3, 'Mercado quincena', 'tarjeta');
  txn('expense', accBank, catServicios, 340000, 5, 'Energia + agua + internet', 'transferencia');
  txn('expense', accCash, catRestaurante, 95000, 6, 'Almuerzo trabajo', 'efectivo');
  txn('expense', accNequi, catTransporte, 120000, 7, 'Recargas transporte', 'transferencia');
  txn('expense', accBank, catEntretenimiento, 130000, 9, 'Gimnasio', 'tarjeta');
  txn('expense', accBank, catSuscripciones, 47000, 10, 'Streaming', 'tarjeta');
  txn('expense', accBank, catSalud, 230000, 11, 'EPS y medicamentos', 'transferencia');
  txn('expense', accBank, catRopa, 280000, 13, 'Ropa', 'tarjeta');
  txn('expense', accBank, catMercado, 175000, 15, 'Mercado complementario', 'tarjeta');
  txn('expense', accCash, catRestaurante, 38000, 16, 'Cafe', 'efectivo');
  txn('expense', accNequi, catTransporte, 160000, 18, 'Gasolina', 'transferencia');

  // Transferencia de ejemplo (neta a 0 en patrimonio): Bancolombia -> Ahorros 500.000
  const grp = newGroupId();
  db.personal.transactions.push(
    {
      id: nextId('txn'), type: 'transfer', accountId: accBank, categoryId: null,
      amount: 500000, currency: 'COP', date: dayOfThisMonth(4),
      note: 'Ahorro programado', tags: [], transferGroupId: grp,
      method: 'transferencia', recurring: false, createdAt: ts, updatedAt: ts
    },
    {
      id: nextId('txn'), type: 'transfer', accountId: accSavings, categoryId: null,
      amount: 500000, currency: 'COP', date: dayOfThisMonth(4),
      note: 'Ahorro programado', tags: [], transferGroupId: grp,
      method: 'transferencia', recurring: false, createdAt: ts, updatedAt: ts
    }
  );

  /* ------------------------------------------------------------------
   *  PERSONAL — PRESUPUESTOS (override del mes actual)
   * ------------------------------------------------------------------ */
  function budget(categoryId, amount) {
    db.personal.budgets.push({
      id: budgetId(month, categoryId),
      month, categoryId,
      amount: roundMoney(amount, 'COP'),
      currency: 'COP',
      createdAt: ts
    });
  }
  budget(catArriendo, 1800000);
  budget(catMercado, 800000);
  budget(catServicios, 400000);
  budget(catRestaurante, 250000);
  budget(catTransporte, 300000);
  budget(catEntretenimiento, 200000);

  /* ------------------------------------------------------------------
   *  PERSONAL — METAS
   * ------------------------------------------------------------------ */
  db.personal.goals.push(
    {
      id: nextId('goal'), name: 'Viaje a Cartagena', targetAmount: 5000000, currentAmount: 1800000,
      currency: 'COP', accountId: accSavings, deadline: todayPlusDays(120),
      color: '#D4AF37', icon: 'ti-plane', archived: false, createdAt: ts, updatedAt: ts
    },
    {
      id: nextId('goal'), name: 'Fondo de emergencia', targetAmount: 10000000, currentAmount: 3000000,
      currency: 'COP', accountId: accSavings, deadline: todayPlusDays(300),
      color: '#34D399', icon: 'ti-shield', archived: false, createdAt: ts, updatedAt: ts
    }
  );

  /* ------------------------------------------------------------------
   *  EVENTOS — 3 eventos en distintos estados
   *  Boda (realizado): quoted 14.000.000, costos 12.200.000 -> utilidad 1.800.000,
   *  margen 12,857% (~12,9%), abonado 0 -> por cobrar 14.000.000.
   * ------------------------------------------------------------------ */
  const evBoda = nextId('evt');
  const evCorp = nextId('evt');
  const evQuince = nextId('evt');

  db.events.events.push(
    {
      id: evBoda, name: 'Boda Valentina & Andres',
      client: { name: 'Valentina Restrepo', phone: '+573001112233', email: 'valentina@example.com' },
      eventType: 'boda', eventDate: dayOfThisMonth(10), hora: '16:00',
      venue: 'Hacienda El Roble', ciudad: 'Medellin', guests: 180,
      status: 'realizado', currency: 'COP', quotedAmount: 14000000,
      notes: 'Montaje completo, catering premium.', createdAt: ts, updatedAt: ts
    },
    {
      id: evCorp, name: 'Cena corporativa TechCo',
      client: { name: 'TechCo S.A.S.', phone: '+573004445566', email: 'eventos@techco.co' },
      eventType: 'corporativo', eventDate: todayPlusDays(20), hora: '19:00',
      venue: 'Salon Plaza Mayor', ciudad: 'Medellin', guests: 90,
      status: 'confirmado', currency: 'COP', quotedAmount: 9500000,
      notes: 'Cena de fin de año, abono recibido.', createdAt: ts, updatedAt: ts
    },
    {
      id: evQuince, name: 'Quince de Mariana',
      client: { name: 'Carolina Gomez', phone: '+573007778899', email: 'carolina@example.com' },
      eventType: 'quinceanera', eventDate: todayPlusDays(45), hora: '18:00',
      venue: 'Club Campestre', ciudad: 'Rionegro', guests: 120,
      status: 'cotizado', currency: 'COP', quotedAmount: 7800000,
      notes: 'En cotizacion, pendiente confirmar.', createdAt: ts, updatedAt: ts
    }
  );

  // Costos de la boda (9 categorias, total = 12.200.000)
  function cost(eventId, category, supplier, concept, amount, day, paid) {
    db.events.costs.push({
      id: nextId('evc'), eventId, category, supplier, concept,
      amount: roundMoney(amount, 'COP'), currency: 'COP',
      date: dayOfThisMonth(day), paid: !!paid, createdAt: ts
    });
  }
  cost(evBoda, 'lugar', 'Hacienda El Roble', 'Alquiler del lugar', 3500000, 5, true);
  cost(evBoda, 'catering', 'Sabores Gourmet', 'Catering 180 personas', 4200000, 6, true);
  cost(evBoda, 'decoracion', 'Flores y Mas', 'Decoracion floral', 1800000, 7, true);
  cost(evBoda, 'sonido', 'AudioPro', 'Sonido e iluminacion', 950000, 7, true);
  cost(evBoda, 'fotografia', 'Luz Studio', 'Fotografia y video', 1100000, 8, false);
  cost(evBoda, 'personal', 'Staff Eventos', 'Meseros y logistica', 380000, 9, true);
  cost(evBoda, 'transporte', 'TransVan', 'Transporte de montaje', 120000, 9, true);
  cost(evBoda, 'papeleria', 'Imprenta Fina', 'Invitaciones y menus', 90000, 4, true);
  cost(evBoda, 'imprevistos', 'Varios', 'Imprevistos del montaje', 60000, 10, false);
  // Suma boda: 3.500.000+4.200.000+1.800.000+950.000+1.100.000+380.000+120.000+90.000+60.000 = 12.200.000

  // Costos del corporativo (parciales, para pipeline)
  cost(evCorp, 'lugar', 'Plaza Mayor', 'Reserva de salon', 2200000, 12, false);
  cost(evCorp, 'catering', 'Sabores Gourmet', 'Cena 90 personas', 2600000, 13, false);

  // Ingresos (abonos) de eventos.
  // Boda: abonado 0 -> por cobrar 14.000.000 (no se registran abonos).
  // Corporativo: abono parcial (no afecta la cifra objetivo de la boda).
  db.events.incomes.push(
    {
      id: nextId('evi'), eventId: evCorp, concept: 'Anticipo 50%',
      amount: 4750000, currency: 'COP', date: dayOfThisMonth(14),
      method: 'transferencia', createdAt: ts
    }
  );

  /* ------------------------------------------------------------------
   *  TRADING — cuenta + deposito inicial 100.000 + 12 dias traded
   *  P&L total = +1.640,50 · balance = 101.640,50 · win rate 8/12 = 66,7%
   * ------------------------------------------------------------------ */
  const tracc = nextId('tracc');
  const startDate = dayOfThisMonth(1);
  db.trading.accounts.push({
    id: tracc, name: 'Cuenta principal', broker: 'FTMO', currency: 'USD',
    initialBalance: 0, startDate, color: '#5E9DF6',
    archived: false, createdAt: ts, updatedAt: ts
  });

  // Deposito inicial (define baseCapital). B0 = 0 porque hay deposits.
  db.trading.movements.push({
    id: nextId('trm'), accountId: tracc, type: 'deposit',
    amount: 100000, currency: 'USD', date: startDate,
    note: 'Deposito inicial', createdAt: ts
  });

  // 12 dias operados: 8 verdes, 4 rojos. Suma = +1.640,50
  // verdes: 320 + 215.50 + 480 + 150 + 95 + 410 + 260 + 365 = 2.295,50
  // rojos:  -185 -240 -120 -110 = -655,00
  // total: 1.640,50
  const tradeDays = [
    { day: 1,  pnl: 320.00,  trades: 4, tag: 'Londres' },
    { day: 2,  pnl: -185.00, trades: 3, tag: 'Nueva York' },
    { day: 3,  pnl: 215.50,  trades: 2, tag: 'Forex' },
    { day: 4,  pnl: 480.00,  trades: 5, tag: 'Indices' },
    { day: 5,  pnl: -240.00, trades: 4, tag: 'Nueva York' },
    { day: 8,  pnl: 150.00,  trades: 3, tag: 'Londres' },
    { day: 9,  pnl: 95.00,   trades: 2, tag: 'Forex' },
    { day: 10, pnl: 410.00,  trades: 6, tag: 'Indices' },
    { day: 11, pnl: -120.00, trades: 3, tag: 'Cripto' },
    { day: 12, pnl: 260.00,  trades: 4, tag: 'Londres' },
    { day: 15, pnl: -110.00, trades: 2, tag: 'Nueva York' },
    { day: 16, pnl: 365.00,  trades: 5, tag: 'Indices' }
  ];
  for (const t of tradeDays) {
    const date = dayOfThisMonth(t.day);
    db.trading.days.push({
      id: tradeDayId(date, tracc),
      accountId: tracc, date,
      pnl: roundMoney(t.pnl, 'USD'),
      currency: 'USD', trades: t.trades,
      note: '', tag: t.tag, traded: true,
      createdAt: ts, updatedAt: ts
    });
  }
  // Un dia "sin operar" (traded:false, pnl 0) -> excluido de estadisticas
  const flatDate = dayOfThisMonth(17);
  db.trading.days.push({
    id: tradeDayId(flatDate, tracc),
    accountId: tracc, date: flatDate,
    pnl: 0, currency: 'USD', trades: 0,
    note: 'Sin oportunidades claras', tag: 'Dia sin operar', traded: false,
    createdAt: ts, updatedAt: ts
  });

  /* ------------------------------------------------------------------
   *  SETTINGS del demo
   * ------------------------------------------------------------------ */
  db.settings.userName = 'Carlos';
  db.settings.onboarded = true;
  db.settings.personalBudgetMonthly = 4035000;
  db.settings.fxRate = { usdToCop: 4050, date: isoDate(), manual: true };
  db.settings.fxHistory = [{ usdToCop: 4050, date: isoDate() }];
  db.settings.trading.monthlyTargetPct = 8;
  db.settings.streak = { count: 5, lastActiveDate: isoDate() };
  db.settings.updatedAt = ts;

  // Persistencia inmediata y bandera demo.
  saveDB(db);
  commit();
  try { localStorage.setItem(DEMO_FLAG, '1'); } catch (_e) { /* no critico */ }

  return db;
}
