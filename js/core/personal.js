// XAURA · js/core/personal.js
// CRUD del modulo Personal (COP): cuentas, categorias, transacciones,
// transferencias, presupuestos y metas (SPEC §4.4).
// Reglas: cada mutacion llama commit(). Los saldos NUNCA se persisten:
// getAccountBalance se recalcula siempre desde las transacciones primarias.

import {
  getDB, commit, nextId, budgetId, newGroupId
} from './store.js';

import {
  roundMoney, isoDate, nowISO,
  num, str, bool,
  isAccountType, isCategoryKind, isTransactionType, isTransactionMethod,
  isISODate, isMonthKey
} from './schema.js';

/* ============================================================
 *  UTILIDADES INTERNAS
 * ============================================================ */

// COP: enteros. Toda la rama personal opera en COP.
function copRound(x) {
  return roundMoney(x, 'COP');
}

// monthKey de una fecha "YYYY-MM-DD" -> "YYYY-MM".
function monthOf(dateStr) {
  return (typeof dateStr === 'string' && dateStr.length >= 7) ? dateStr.slice(0, 7) : '';
}

// Normaliza un valor de fecha a "YYYY-MM-DD" valido; si no, hoy.
function normDate(v) {
  return isISODate(v) ? v : isoDate();
}

// tags -> array de strings limpias.
function normTags(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const t = str(v[i]).trim();
    if (t) out.push(t);
  }
  return out;
}

// Busca por id en un arreglo; devuelve indice o -1.
function indexById(arr, id) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].id === id) return i;
  }
  return -1;
}

/* ============================================================
 *  CUENTAS
 * ============================================================ */

export function addAccount(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('acc');
  const ts = nowISO();
  const account = {
    id,
    name: str(d.name).trim() || 'Cuenta',
    type: isAccountType(d.type) ? d.type : 'cash',
    currency: 'COP',
    initialBalance: copRound(num(d.initialBalance, 0)),
    color: str(d.color) || '#D4AF37',
    icon: str(d.icon) || 'wallet',
    archived: false,
    createdAt: ts,
    updatedAt: ts
  };
  db.personal.accounts.push(account);
  commit();
  return account;
}

export function updateAccount(id, patch) {
  const db = getDB();
  const i = indexById(db.personal.accounts, id);
  if (i === -1) return null;
  const acc = db.personal.accounts[i];
  patch = patch || {};

  if (patch.name !== undefined) acc.name = str(patch.name).trim() || acc.name;
  if (patch.type !== undefined && isAccountType(patch.type)) acc.type = patch.type;
  if (patch.initialBalance !== undefined) acc.initialBalance = copRound(num(patch.initialBalance, acc.initialBalance));
  if (patch.color !== undefined) acc.color = str(patch.color) || acc.color;
  if (patch.icon !== undefined) acc.icon = str(patch.icon) || acc.icon;
  if (patch.archived !== undefined) acc.archived = bool(patch.archived, acc.archived);
  acc.currency = 'COP';
  acc.updatedAt = nowISO();

  commit();
  return acc;
}

export function archiveAccount(id) {
  const db = getDB();
  const i = indexById(db.personal.accounts, id);
  if (i === -1) return null;
  db.personal.accounts[i].archived = true;
  db.personal.accounts[i].updatedAt = nowISO();
  commit();
  return db.personal.accounts[i];
}

export function getAccounts(opts) {
  const db = getDB();
  const includeArchived = !!(opts && opts.includeArchived);
  const out = [];
  for (let i = 0; i < db.personal.accounts.length; i++) {
    const a = db.personal.accounts[i];
    if (!a) continue;
    if (!includeArchived && a.archived) continue;
    out.push(a);
  }
  return out;
}

// getAccountBalance = initialBalance + Σ income − Σ expense ± transferencias.
// SIEMPRE recalculado, nunca persistido.
export function getAccountBalance(id) {
  const db = getDB();
  const i = indexById(db.personal.accounts, id);
  if (i === -1) return 0;

  let bal = num(db.personal.accounts[i].initialBalance, 0);
  const txns = db.personal.transactions;
  for (let k = 0; k < txns.length; k++) {
    const t = txns[k];
    if (!t || t.accountId !== id) continue;
    const amt = num(t.amount, 0);
    if (t.type === 'income') {
      bal += amt;
    } else if (t.type === 'expense') {
      bal -= amt;
    } else if (t.type === 'transfer') {
      // En transferencia el signo del monto indica direccion:
      // monto negativo = salida (origen), monto positivo = entrada (destino).
      bal += amt;
    }
  }
  return copRound(bal);
}

/* ============================================================
 *  CATEGORIAS
 * ============================================================ */

export function addCategory(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('cat');
  const mb = (d.monthlyBudget === undefined || d.monthlyBudget === null || d.monthlyBudget === '')
    ? null
    : copRound(num(d.monthlyBudget, 0));
  const category = {
    id,
    name: str(d.name).trim() || 'Categoria',
    kind: isCategoryKind(d.kind) ? d.kind : 'expense',
    color: str(d.color) || '#D4AF37',
    icon: str(d.icon) || 'tag',
    monthlyBudget: mb,
    archived: false,
    createdAt: nowISO()
  };
  db.personal.categories.push(category);
  commit();
  return category;
}

export function updateCategory(id, patch) {
  const db = getDB();
  const i = indexById(db.personal.categories, id);
  if (i === -1) return null;
  const cat = db.personal.categories[i];
  patch = patch || {};

  if (patch.name !== undefined) cat.name = str(patch.name).trim() || cat.name;
  if (patch.kind !== undefined && isCategoryKind(patch.kind)) cat.kind = patch.kind;
  if (patch.color !== undefined) cat.color = str(patch.color) || cat.color;
  if (patch.icon !== undefined) cat.icon = str(patch.icon) || cat.icon;
  if (patch.monthlyBudget !== undefined) {
    cat.monthlyBudget = (patch.monthlyBudget === null || patch.monthlyBudget === '')
      ? null
      : copRound(num(patch.monthlyBudget, 0));
  }
  if (patch.archived !== undefined) cat.archived = bool(patch.archived, cat.archived);

  commit();
  return cat;
}

export function archiveCategory(id) {
  const db = getDB();
  const i = indexById(db.personal.categories, id);
  if (i === -1) return null;
  db.personal.categories[i].archived = true;
  commit();
  return db.personal.categories[i];
}

export function getCategories(opts) {
  const db = getDB();
  opts = opts || {};
  const includeArchived = !!opts.includeArchived;
  const kind = opts.kind;
  const out = [];
  for (let i = 0; i < db.personal.categories.length; i++) {
    const c = db.personal.categories[i];
    if (!c) continue;
    if (!includeArchived && c.archived) continue;
    if (kind && c.kind !== kind) continue;
    out.push(c);
  }
  return out;
}

/* ============================================================
 *  TRANSACCIONES
 * ============================================================ */

export function addTransaction(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('txn');
  const ts = nowISO();
  const type = isTransactionType(d.type) ? d.type : 'expense';
  const txn = {
    id,
    type,
    accountId: str(d.accountId) || null,
    categoryId: (d.categoryId === undefined || d.categoryId === null || d.categoryId === '')
      ? null
      : str(d.categoryId),
    amount: copRound(num(d.amount, 0)),
    currency: 'COP',
    date: normDate(d.date),
    note: str(d.note),
    tags: normTags(d.tags),
    transferGroupId: (d.transferGroupId === undefined || d.transferGroupId === null || d.transferGroupId === '')
      ? null
      : str(d.transferGroupId),
    method: isTransactionMethod(d.method) ? d.method : 'efectivo',
    recurring: bool(d.recurring, false),
    createdAt: ts,
    updatedAt: ts
  };
  db.personal.transactions.push(txn);
  commit();
  return txn;
}

// addTransfer: crea 2 transacciones type:"transfer" con el mismo transferGroupId.
// Origen lleva amount negativo; destino, amount positivo (COP).
export function addTransfer(d) {
  const db = getDB();
  d = d || {};
  const fromAccountId = str(d.fromAccountId) || null;
  const toAccountId = str(d.toAccountId) || null;
  const amount = Math.abs(copRound(num(d.amount, 0)));
  const date = normDate(d.date);
  const note = str(d.note);
  const groupId = newGroupId();
  const ts = nowISO();

  const out = { groupId: groupId, from: null, to: null };

  if (fromAccountId) {
    const idOut = nextId('txn');
    const txOut = {
      id: idOut,
      type: 'transfer',
      accountId: fromAccountId,
      categoryId: null,
      amount: -amount,
      currency: 'COP',
      date,
      note,
      tags: [],
      transferGroupId: groupId,
      method: 'transferencia',
      recurring: false,
      createdAt: ts,
      updatedAt: ts
    };
    db.personal.transactions.push(txOut);
    out.from = txOut;
  }

  if (toAccountId) {
    const idIn = nextId('txn');
    const txIn = {
      id: idIn,
      type: 'transfer',
      accountId: toAccountId,
      categoryId: null,
      amount: amount,
      currency: 'COP',
      date,
      note,
      tags: [],
      transferGroupId: groupId,
      method: 'transferencia',
      recurring: false,
      createdAt: ts,
      updatedAt: ts
    };
    db.personal.transactions.push(txIn);
    out.to = txIn;
  }

  commit();
  return out;
}

export function updateTransaction(id, patch) {
  const db = getDB();
  const i = indexById(db.personal.transactions, id);
  if (i === -1) return null;
  const t = db.personal.transactions[i];
  patch = patch || {};

  if (patch.type !== undefined && isTransactionType(patch.type)) t.type = patch.type;
  if (patch.accountId !== undefined) t.accountId = str(patch.accountId) || null;
  if (patch.categoryId !== undefined) {
    t.categoryId = (patch.categoryId === null || patch.categoryId === '')
      ? null
      : str(patch.categoryId);
  }
  if (patch.amount !== undefined) {
    // Preserva el signo si la transaccion es transfer (direccion).
    if (t.type === 'transfer') {
      const sign = num(t.amount, 0) < 0 ? -1 : 1;
      t.amount = sign * Math.abs(copRound(num(patch.amount, t.amount)));
    } else {
      t.amount = copRound(num(patch.amount, t.amount));
    }
  }
  if (patch.date !== undefined) t.date = normDate(patch.date);
  if (patch.note !== undefined) t.note = str(patch.note);
  if (patch.tags !== undefined) t.tags = normTags(patch.tags);
  if (patch.method !== undefined && isTransactionMethod(patch.method)) t.method = patch.method;
  if (patch.recurring !== undefined) t.recurring = bool(patch.recurring, t.recurring);
  t.currency = 'COP';
  t.updatedAt = nowISO();

  commit();
  return t;
}

// deleteTransaction: si pertenece a una transferencia, borra ambas patas del grupo.
export function deleteTransaction(id) {
  const db = getDB();
  const i = indexById(db.personal.transactions, id);
  if (i === -1) return false;
  const t = db.personal.transactions[i];
  const groupId = t.transferGroupId;

  if (groupId) {
    db.personal.transactions = db.personal.transactions.filter(function (x) {
      return !(x && x.transferGroupId === groupId);
    });
  } else {
    db.personal.transactions.splice(i, 1);
  }

  commit();
  return true;
}

// getTransactions(filters):
// {module,type,accountId,categoryId,from,to,month,tag,search,excludeTransfers,limit,offset,sort}
// (module se acepta por compat con el sheet de registro; aqui todo es personal.)
export function getTransactions(filters) {
  const db = getDB();
  filters = filters || {};

  const type = filters.type;
  const accountId = filters.accountId;
  const categoryId = filters.categoryId;
  const from = isISODate(filters.from) ? filters.from : null;
  const to = isISODate(filters.to) ? filters.to : null;
  const month = isMonthKey(filters.month) ? filters.month : null;
  const tag = filters.tag ? String(filters.tag) : null;
  const search = filters.search ? String(filters.search).trim().toLowerCase() : '';
  const excludeTransfers = !!filters.excludeTransfers;

  let rows = [];
  const src = db.personal.transactions;
  for (let i = 0; i < src.length; i++) {
    const t = src[i];
    if (!t) continue;

    if (excludeTransfers && t.type === 'transfer') continue;
    if (type && t.type !== type) continue;
    if (accountId && t.accountId !== accountId) continue;
    if (categoryId && t.categoryId !== categoryId) continue;
    if (month && monthOf(t.date) !== month) continue;
    if (from && t.date < from) continue;
    if (to && t.date > to) continue;
    if (tag && (!Array.isArray(t.tags) || t.tags.indexOf(tag) === -1)) continue;
    if (search) {
      const note = (t.note || '').toLowerCase();
      const tagsStr = Array.isArray(t.tags) ? t.tags.join(' ').toLowerCase() : '';
      if (note.indexOf(search) === -1 && tagsStr.indexOf(search) === -1) continue;
    }
    rows.push(t);
  }

  // Orden: por defecto fecha descendente, desempate por createdAt descendente.
  const sort = filters.sort || 'date-desc';
  rows.sort(function (a, b) {
    if (sort === 'date-asc') {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt < b.createdAt) ? -1 : (a.createdAt > b.createdAt ? 1 : 0);
    }
    if (sort === 'amount-desc') {
      return Math.abs(num(b.amount, 0)) - Math.abs(num(a.amount, 0));
    }
    if (sort === 'amount-asc') {
      return Math.abs(num(a.amount, 0)) - Math.abs(num(b.amount, 0));
    }
    // date-desc (default)
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt < b.createdAt) ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
  });

  // Paginacion.
  const offset = Math.max(0, Number(filters.offset) || 0);
  if (offset > 0) rows = rows.slice(offset);
  if (filters.limit !== undefined && filters.limit !== null) {
    const lim = Math.max(0, Number(filters.limit) || 0);
    rows = rows.slice(0, lim);
  }

  return rows;
}

/* ============================================================
 *  PRESUPUESTOS  (id deterministico bud_{month}_{categoryId})
 * ============================================================ */

// setBudget: upsert determinista por (month, categoryId).
export function setBudget(d) {
  const db = getDB();
  d = d || {};
  const month = isMonthKey(d.month) ? d.month : monthOf(isoDate());
  const categoryId = str(d.categoryId);
  if (!categoryId) return null;
  const amount = copRound(num(d.amount, 0));
  const id = budgetId(month, categoryId);

  const i = indexById(db.personal.budgets, id);
  if (i !== -1) {
    db.personal.budgets[i].amount = amount;
    db.personal.budgets[i].currency = 'COP';
    commit();
    return db.personal.budgets[i];
  }

  const budget = {
    id,
    month,
    categoryId,
    amount,
    currency: 'COP',
    createdAt: nowISO()
  };
  db.personal.budgets.push(budget);
  commit();
  return budget;
}

export function getBudget(month, categoryId) {
  const db = getDB();
  const id = budgetId(month, str(categoryId));
  const i = indexById(db.personal.budgets, id);
  return i === -1 ? null : db.personal.budgets[i];
}

export function getBudgets(month) {
  const db = getDB();
  const m = isMonthKey(month) ? month : null;
  const out = [];
  for (let i = 0; i < db.personal.budgets.length; i++) {
    const b = db.personal.budgets[i];
    if (!b) continue;
    if (m && b.month !== m) continue;
    out.push(b);
  }
  return out;
}

export function deleteBudget(month, categoryId) {
  const db = getDB();
  const id = budgetId(month, str(categoryId));
  const i = indexById(db.personal.budgets, id);
  if (i === -1) return false;
  db.personal.budgets.splice(i, 1);
  commit();
  return true;
}

/* ============================================================
 *  METAS
 * ============================================================ */

export function addGoal(d) {
  const db = getDB();
  d = d || {};
  const id = nextId('goal');
  const ts = nowISO();
  const goal = {
    id,
    name: str(d.name).trim() || 'Meta',
    targetAmount: copRound(num(d.targetAmount, 0)),
    currentAmount: copRound(num(d.currentAmount, 0)),
    currency: 'COP',
    accountId: (d.accountId === undefined || d.accountId === null || d.accountId === '')
      ? null
      : str(d.accountId),
    deadline: isISODate(d.deadline) ? d.deadline : null,
    color: str(d.color) || '#D4AF37',
    icon: str(d.icon) || 'target',
    archived: false,
    createdAt: ts,
    updatedAt: ts
  };
  db.personal.goals.push(goal);
  commit();
  return goal;
}

export function updateGoal(id, patch) {
  const db = getDB();
  const i = indexById(db.personal.goals, id);
  if (i === -1) return null;
  const g = db.personal.goals[i];
  patch = patch || {};

  if (patch.name !== undefined) g.name = str(patch.name).trim() || g.name;
  if (patch.targetAmount !== undefined) g.targetAmount = copRound(num(patch.targetAmount, g.targetAmount));
  if (patch.currentAmount !== undefined) g.currentAmount = copRound(num(patch.currentAmount, g.currentAmount));
  if (patch.accountId !== undefined) {
    g.accountId = (patch.accountId === null || patch.accountId === '')
      ? null
      : str(patch.accountId);
  }
  if (patch.deadline !== undefined) g.deadline = isISODate(patch.deadline) ? patch.deadline : null;
  if (patch.color !== undefined) g.color = str(patch.color) || g.color;
  if (patch.icon !== undefined) g.icon = str(patch.icon) || g.icon;
  if (patch.archived !== undefined) g.archived = bool(patch.archived, g.archived);
  g.currency = 'COP';
  g.updatedAt = nowISO();

  commit();
  return g;
}

export function archiveGoal(id) {
  const db = getDB();
  const i = indexById(db.personal.goals, id);
  if (i === -1) return null;
  db.personal.goals[i].archived = true;
  db.personal.goals[i].updatedAt = nowISO();
  commit();
  return db.personal.goals[i];
}

// contributeToGoal: suma (o resta, con monto negativo) al currentAmount.
// No baja de 0 ni se persiste saldo de cuenta alguno.
export function contributeToGoal(id, amount) {
  const db = getDB();
  const i = indexById(db.personal.goals, id);
  if (i === -1) return null;
  const g = db.personal.goals[i];
  let next = num(g.currentAmount, 0) + num(amount, 0);
  if (next < 0) next = 0;
  g.currentAmount = copRound(next);
  g.updatedAt = nowISO();
  commit();
  return g;
}

export function getGoals(opts) {
  const db = getDB();
  const includeArchived = !!(opts && opts.includeArchived);
  const out = [];
  for (let i = 0; i < db.personal.goals.length; i++) {
    const g = db.personal.goals[i];
    if (!g) continue;
    if (!includeArchived && g.archived) continue;
    out.push(g);
  }
  return out;
}
