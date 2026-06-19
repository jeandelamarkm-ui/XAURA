Voy a unificar las 6 especificaciones en una ESPECIFICACIÃ“N MAESTRA DE CONSTRUCCIÃ“N coherente. Como es una tarea de sÃ­ntesis de diseÃ±o (sin necesidad de explorar archivos), entrego el documento directamente.

Una observaciÃ³n clave que debo resolver: hay dos modelos de datos distintos en las specs (el de `modelo-datos` con `xaura:db` namespaced, y el de los mÃ³dulos individuales con claves planas `xaura.pf.*`, `xaura.eventos`, `xaura.trading.*`). Tomo la decisiÃ³n arquitectÃ³nica de adoptar el modelo unificado `xaura:db` por sus ventajas (atomicidad, export/import trivial, migraciones), y mapeo todas las firmas de los mÃ³dulos a esa estructura.

---

# XAURA â€” ESPECIFICACIÃ“N MAESTRA DE CONSTRUCCIÃ“N

> Fuente Ãºnica de verdad para construir la PWA completa de una sola pasada. PWA estÃ¡tica sin build (HTML + CSS + JS ES modules), datos 100% locales en `localStorage`, grÃ¡ficos a mano en SVG, mobile-first, espaÃ±ol (Colombia). Tres Ã¡reas: **Personal (COP)**, **Eventos (COP)**, **Trading (USD)**.

---

## 1. RESUMEN Y PRINCIPIOS DE DISEÃ‘O

**QuÃ© es XAURA.** App web instalable (iOS/Android), offline, para que UNA persona controle a diario tres Ã¡reas financieras: finanzas personales (COP), firma de eventos (COP) y trading (USD). Seguimiento diario con reportes, estadÃ­sticas y diagramas. Todos los datos viven solo en el dispositivo.

**Principios:**
1. **Lujo tecnolÃ³gico minimalista.** Negro profundo, oro champÃ¡n, vidrio esmerilado, tipografÃ­a fina. Cada pantalla respira; nada chillÃ³n.
2. **Mobile-first nativo.** Bottom nav flotante, FAB central de registro, bottom sheets, safe-area iOS, zonas tocables â‰¥44px, feedback `scale(0.97)` en `:active`, hÃ¡ptica opcional.
3. **Registro diario en â‰¤3 taps.** El acto de registrar es el corazÃ³n: foco automÃ¡tico en el monto, defaults inteligentes, memoria de Ãºltimos usados, chips en vez de dropdowns.
4. **Cifras impecables.** Toda cifra monetaria, %, fecha numÃ©rica o mÃ©trica usa fuente mono con `tabular-nums`. COP sin decimales; USD con 2.
5. **Offline-first verdadero.** Sin dependencias externas en runtime: fuentes y grÃ¡ficos autoalojados; service worker cachea el app-shell.
6. **Datos del usuario, del usuario.** Una sola clave raÃ­z `xaura:db`, export/import JSON trivial, sin nube ni cuentas.
7. **RetenciÃ³n por racha.** Streak diaria como motor de hÃ¡bito, con recordatorio in-app honesto sobre lÃ­mites de push en iOS.
8. **Determinismo.** Saldos, balances y P&L NUNCA se persisten: se recalculan en cada render desde los datos primarios. Cero `NaN`, cero divisiÃ³n por cero (todos los denominadores protegidos).

**Decisiones de conflicto resueltas (resumen):**
- **Modelo de datos:** se adopta el objeto Ãºnico namespaced `xaura:db` (de `modelo-datos`), descartando las claves planas `xaura.pf.*`/`xaura.eventos`/`xaura.trading.*` de las specs de mÃ³dulo. Las firmas CRUD de cada mÃ³dulo se mapean a esta estructura.
- **NavegaciÃ³n:** bottom nav de 5 con FAB central (de `dashboard-navegacion`). **Eventos** NO es tab inferior; se accede vÃ­a segmented control en Personal y tarjeta en Dashboard.
- **Tasa USD/COP:** una sola tasa editable en `settings.fxRate` + `fxHistory`. Se usa la vigente para display; el consolidado de patrimonio usa la tasa actual.
- **Paleta:** la de `identidad-visual` (oro `#D4AF37`) es la oficial; los hex sueltos de otras specs (`#C9A24B`, `#16C784`, etc.) se descartan en favor de las variables CSS.
- **IDs:** contador incremental persistido (`prefix_000001`), no timestamps ni random, salvo `transferGroupId` (UUID).

---

## 2. SISTEMA DE DISEÃ‘O FINAL

Archivo `css/tokens.css` (cargar primero). Tema oscuro por defecto; claro opcional vÃ­a `data-theme="light"`.

```css
/* ===== FUENTES (autoalojar .woff2 en /assets/fonts para offline real;
   este @import es el fallback de desarrollo) ===== */
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Sora:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  /* ===== SUPERFICIES OSCURAS ===== */
  --bg-base:        #0A0A0B;
  --bg-surface-1:   #141417;
  --bg-surface-2:   #1E1E23;
  --bg-surface-3:   #28282F;
  --bg-elevated:    #34343C;

  /* Vidrio */
  --glass-bg:        rgba(30, 30, 35, 0.55);
  --glass-bg-strong: rgba(20, 20, 23, 0.72);
  --glass-border:    rgba(212, 175, 55, 0.22);
  --glass-border-n:  rgba(255, 255, 255, 0.07);

  /* ===== TEXTO ===== */
  --text-primary:   #F5F5F7;
  --text-secondary: #9A9AA4;
  --text-tertiary:  #6E6E78;
  --text-on-gold:   #1A1408;

  /* ===== ACENTO DORADO (el "aura") ===== */
  --gold:           #D4AF37;
  --gold-soft:      #F4D58D;
  --gold-deep:      #C8A24B;
  --gold-100:       rgba(212, 175, 55, 0.10);
  --gold-200:       rgba(212, 175, 55, 0.18);
  --gold-300:       rgba(212, 175, 55, 0.30);
  --gold-glow:      rgba(212, 175, 55, 0.35);
  --gradient-gold:  linear-gradient(180deg, #E6C45E 0%, #C8A24B 100%);
  --gradient-aura:  radial-gradient(120% 120% at 50% 0%, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0) 60%);

  /* ===== SEMÃNTICOS ===== */
  --positive:    #34D399;  --positive-bg: rgba(52, 211, 153, 0.12);
  --negative:    #F87171;  --negative-bg: rgba(248, 113, 113, 0.12);
  --neutral:     #5E9DF6;  --neutral-bg:  rgba(94, 157, 246, 0.12);
  --warning:     #FBBF24;  --warning-bg:  rgba(251, 191, 36, 0.12);

  /* Acentos por Ã¡rea */
  --area-personal: #D4AF37;  /* oro */
  --area-eventos:  #C084FC;  /* pÃºrpura */
  --area-trading:  #5E9DF6;  /* azul-tech (USD) */

  /* ===== BORDES / LÃNEAS ===== */
  --border-subtle: #26262C;
  --border-strong: #3A3A42;
  --grid-line:     rgba(255, 255, 255, 0.06);

  /* ===== TIPOGRAFÃA ===== */
  --font-serif: 'Cormorant Garamond', Georgia, serif;
  --font-sans:  'Sora', -apple-system, system-ui, sans-serif;
  --font-mono:  'JetBrains Mono', 'SF Mono', monospace;

  --fs-display: 34px; --fs-h1: 26px; --fs-h2: 21px; --fs-h3: 17px;
  --fs-body: 15px; --fs-sm: 13px; --fs-xs: 11px;
  --lh-tight: 1.15; --lh-normal: 1.5;
  --ls-wide: 0.14em; --ls-num: 0.01em;

  /* ===== ESPACIADO / RADIOS / SOMBRAS ===== */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;

  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 22px; --r-pill: 999px;

  --sh-sm: 0 1px 2px rgba(0,0,0,0.4);
  --sh-md: 0 8px 24px rgba(0,0,0,0.45);
  --sh-lg: 0 20px 48px rgba(0,0,0,0.55);
  --sh-gold: 0 6px 22px rgba(212,175,55,0.22);

  /* ===== GRÃFICOS ===== */
  --chart-line:      #D4AF37;
  --chart-line-2:    #5E9DF6;
  --chart-area-from: rgba(212,175,55,0.18);
  --chart-area-to:   rgba(212,175,55,0.00);
  --chart-bar:       #C8A24B;
  --chart-bar-track: rgba(255,255,255,0.05);
  --chart-pos:       #34D399;
  --chart-neg:       #F87171;
  --chart-grid:      rgba(255,255,255,0.06);
  --chart-axis-text: #6E6E78;

  /* ===== MOVIMIENTO ===== */
  --ease-out:  cubic-bezier(0.16, 1, 0.3, 1);
  --ease-soft: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms; --dur-base: 220ms; --dur-slow: 400ms;
}

/* ===== TEMA CLARO (opcional) ===== */
:root[data-theme="light"] {
  --bg-base: #F7F5F0; --bg-surface-1: #FFFFFF; --bg-surface-2: #FBFAF6;
  --bg-surface-3: #F1EEE6; --bg-elevated: #FFFFFF;
  --glass-bg: rgba(255,255,255,0.65); --glass-bg-strong: rgba(251,250,246,0.80);
  --glass-border: rgba(180,142,40,0.28); --glass-border-n: rgba(0,0,0,0.06);
  --text-primary: #1A1A1E; --text-secondary: #5C5C66; --text-tertiary: #8E8E98;
  --gold: #B8901F; --gold-soft: #9A7615; --gold-deep: #A07E1C;
  --gold-100: rgba(184,144,31,0.10); --gold-300: rgba(184,144,31,0.35);
  --positive: #0F9D6B; --negative: #DC4C4C; --neutral: #2F7BD6; --warning: #C98A06;
  --border-subtle: #E5E1D8; --border-strong: #D2CDC0; --grid-line: rgba(0,0,0,0.06);
}

@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
@supports not (backdrop-filter: blur(1px)) { .x-glass, .x-glass--bar { background: var(--bg-surface-2) !important; } }
```

**Regla de oro tipogrÃ¡fica:** tÃ­tulos editoriales â†’ `--font-serif`; UI/cuerpo â†’ `--font-sans`; toda cifra â†’ `--font-mono` con `font-variant-numeric: tabular-nums`. Clases utilitarias `.x-display .x-h1 .x-h2 .x-h3 .x-body .x-label .x-num (.x-num--lg/.x-num--pos/.x-num--neg)`, `.x-glass`, `.x-glass--bar`, `.pressable`, `.enter`, `.pulse-aura` van en `tokens.css`/`components.css` exactamente como en la spec de identidad visual.

---

## 3. ARQUITECTURA DE ARCHIVOS FINAL

```
xaura/
â”œâ”€â”€ index.html                 # shell: <header>, <main id="view">, bottom nav, FAB, contenedor de sheets/modales/toasts
â”œâ”€â”€ manifest.webmanifest       # nombre, iconos, theme_color #0A0A0B, display:standalone, start_url "./?source=pwa"
â”œâ”€â”€ sw.js                      # service worker: precache app-shell + assets, runtime cache, offline fallback
â”œâ”€â”€ offline.html               # fallback offline mÃ­nimo
â”‚
â”œâ”€â”€ assets/
â”‚   â”œâ”€â”€ icon.svg               # monograma XAURA (favicon + base de iconos)
â”‚   â”œâ”€â”€ icons/                 # icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon-180.png
â”‚   â”œâ”€â”€ fonts/                 # Cormorant, Sora, JetBrains Mono en .woff2 (offline real)
â”‚   â””â”€â”€ tabler/                # subset de Tabler Icons usados, como sprite SVG inline
â”‚
â”œâ”€â”€ css/
â”‚   â”œâ”€â”€ tokens.css             # Â§2: variables (colores, tipografÃ­a+@import, espaciado, radios, sombras, glass, motion)
â”‚   â”œâ”€â”€ base.css               # reset, box-sizing, html/body, scroll, safe-area, clases tipogrÃ¡ficas .x-*
â”‚   â”œâ”€â”€ layout.css             # app-shell, bottom-nav, FAB, screenhead, contenedor de vistas
â”‚   â”œâ”€â”€ components.css         # kpi, btn, field, chip, sheet, modal, toast, progress, donut/charts, listas
â”‚   â””â”€â”€ views.css              # estilos especÃ­ficos por vista
â”‚
â”œâ”€â”€ js/
â”‚   â”œâ”€â”€ app.js                 # bootstrap: carga DB, registra SW, monta nav+header, arranca router, onboarding gate
â”‚   â”œâ”€â”€ router.js              # router por hash; tabla de rutas; render(params)/unmount()
â”‚   â”‚
â”‚   â”œâ”€â”€ core/
â”‚   â”‚   â”œâ”€â”€ store.js           # loadDB/saveDB(debounced)/getDB/commit/resetDB; nextId; budgetId; tradeDayId; migrate
â”‚   â”‚   â”œâ”€â”€ schema.js          # enums, constantes, validadores, CURRENT_SCHEMA
â”‚   â”‚   â”œâ”€â”€ seed.js            # datos de ejemplo (Â§4.5)
â”‚   â”‚   â”œâ”€â”€ personal.js        # CRUD personal (cuentas, categorÃ­as, transacciones, presupuestos, metas)
â”‚   â”‚   â”œâ”€â”€ events.js          # CRUD eventos (eventos, ingresos, costos)
â”‚   â”‚   â”œâ”€â”€ trading.js         # CRUD trading (cuentas, dÃ­as, movimientos)
â”‚   â”‚   â”œâ”€â”€ settings.js        # getSettings/updateSettings/setFxRate/getFxRate/convertUsdToCop
â”‚   â”‚   â”œâ”€â”€ aggregations.js    # todas las funciones de Â§4.6 (KPIs y series para grÃ¡ficos)
â”‚   â”‚   â”œâ”€â”€ currency.js        # fmtCOP, fmtUSD, fmtPct, convertUsdToCop, globalSnapshot helpers
â”‚   â”‚   â”œâ”€â”€ dates.js           # hoy, formato es-CO, navegaciÃ³n dÃ­a, monthKey, daysInMonth, etc.
â”‚   â”‚   â”œâ”€â”€ streak.js          # cÃ¡lculo/persistencia de racha
â”‚   â”‚   â””â”€â”€ backup.js          # exportJSON/importJSON/exportCSV
â”‚   â”‚
â”‚   â”œâ”€â”€ ui/
â”‚   â”‚   â”œâ”€â”€ nav.js             # bottom nav + FAB + estado activo
â”‚   â”‚   â”œâ”€â”€ header.js          # screenhead con fecha y navegaciÃ³n de dÃ­a
â”‚   â”‚   â”œâ”€â”€ sheet.js           # bottom sheet genÃ©rico
â”‚   â”‚   â”œâ”€â”€ modal.js           # modales (tasa, confirmaciones, "Escribe BORRAR")
â”‚   â”‚   â”œâ”€â”€ toast.js           # toasts dorados + snackbar undo
â”‚   â”‚   â”œâ”€â”€ charts.js          # render SVG: sparkline, line+area, bars, groupedBars, donut, progress, heatmap, funnel, histogram, mirror
â”‚   â”‚   â”œâ”€â”€ keypad.js          # teclado numÃ©rico/formato en vivo del monto
â”‚   â”‚   â””â”€â”€ empty.js           # estados vacÃ­os premium
â”‚   â”‚
â”‚   â””â”€â”€ views/
â”‚       â”œâ”€â”€ onboarding.js      # carrusel 4 pasos
â”‚       â”œâ”€â”€ dashboard.js       # #/inicio
â”‚       â”œâ”€â”€ personal.js        # #/personal (+ segmented Personal|Eventos)
â”‚       â”œâ”€â”€ eventos.js         # #/eventos y subvistas
â”‚       â”œâ”€â”€ trading.js         # #/trading y subvistas
â”‚       â””â”€â”€ ajustes.js         # #/ajustes
â”‚
â””â”€â”€ README.md
```

---

## 4. MODELO DE DATOS FINAL

### 4.1 Claves de localStorage

```
xaura:db    â†’ objeto Ãºnico namespaced (fuente de verdad)
xaura:meta  â†’ { schemaVersion, lastBackupAt, updatedAt, appVersion }  (leÃ­da al arrancar sin deserializar db)
```

Backups automÃ¡ticos pre-migraciÃ³n: `xaura:db.bak.v{n}`. CorrupciÃ³n: `xaura:db.corrupt.{ts}`.

### 4.2 Estructura de `xaura:db`

```json
{
  "schemaVersion": 1,
  "settings": {
    "schemaVersion": 1, "userName": "Carlos", "theme": "dark", "locale": "es-CO",
    "primaryCurrency": "COP",
    "fxRate": { "usdToCop": 4050, "date": "2026-06-19", "manual": true },
    "fxHistory": [ { "usdToCop": 4050, "date": "2026-06-19" } ],
    "ui": { "defaultModule": "personal", "hideBalances": false, "firstDayOfMonth": 1,
            "showCop": true, "accent": "gold" },
    "trading": { "monthlyTargetPct": 8, "tags": ["Londres","Nueva York","Asia","Forex","Ãndices","Cripto","Acciones","DÃ­a sin operar"] },
    "personalBudgetMonthly": 0,
    "onboarded": false,
    "streak": { "count": 0, "lastActiveDate": null },
    "createdAt": "...", "updatedAt": "..."
  },
  "personal": { "accounts": [], "categories": [], "transactions": [], "budgets": [], "goals": [] },
  "events":   { "events": [], "incomes": [], "costs": [] },
  "trading":  { "accounts": [], "days": [], "movements": [] },
  "counters": { "acc":0,"cat":0,"txn":0,"bud":0,"goal":0,"evt":0,"evi":0,"evc":0,"tracc":0,"trd":0,"trm":0,"grp":0 }
}
```

### 4.3 Entidades (campos definitivos)

Se adoptan Ã­ntegros los esquemas de la spec `modelo-datos`. Resumen de claves canÃ³nicas:

- **account** `{id, name, type(cash|bank|card|savings|wallet), currency:"COP", initialBalance, color, icon, archived, createdAt, updatedAt}` â€” saldo NO se persiste.
- **category** `{id, name, kind(income|expense), color, icon, monthlyBudget|null, archived, createdAt}`.
- **transaction** `{id, type(income|expense|transfer), accountId, categoryId|null, amount, currency:"COP", date:"YYYY-MM-DD", note, tags[], transferGroupId|null, method, recurring:false, createdAt, updatedAt}`. Transferencia = 2 transacciones con mismo `transferGroupId`. *(Se aÃ±aden `method` y `recurring` de la spec de personales).*
- **budget** `{id:"bud_{month}_{categoryId}", month:"YYYY-MM", categoryId, amount, currency:"COP", createdAt}` (upsert determinÃ­stico).
- **goal** `{id, name, targetAmount, currentAmount, currency:"COP", accountId, deadline, color, icon, archived, createdAt, updatedAt}`.
- **event** `{id, name, client:{name,phone,email}, eventType(boda|corporativo|cumpleanos|quinceanera|grado|aniversario|social|otro), eventDate, hora|null, venue, ciudad|null, guests, status(cotizado|confirmado|realizado|pagado|cancelado), currency:"COP", quotedAmount, notes, createdAt, updatedAt}`. **Ingresos y costos NO se embeben**: van en `events.incomes`/`events.costs` referenciando `eventId` (decisiÃ³n: normalizado, coherente con `xaura:db`).
- **eventIncome** `{id, eventId, concept, amount, currency:"COP", date, method(efectivo|transferencia|tarjeta|otro), createdAt}`.
- **eventCost** `{id, eventId, category(lugar|catering|decoracion|sonido|fotografia|personal|transporte|papeleria|imprevistos), supplier, concept, amount, currency:"COP", date, paid:bool, createdAt}`. *(Se unifican las 9 categorÃ­as de la spec de eventos).*
- **tradingAccount** `{id, name, broker, currency:"USD", initialBalance, startDate, color, archived, createdAt, updatedAt}`.
- **tradeDay** `{id:"trd_{date}_{accountId}", accountId, date, pnl, currency:"USD", trades, note, tag|null, traded:bool, createdAt, updatedAt}` (upsert determinÃ­stico). *(Se aÃ±aden `tag` y `traded` de la spec de trading; `traded:false` â†’ excluido de estadÃ­sticas, `pnl:0`).*
- **tradingMovement** `{id, accountId, type(deposit|withdrawal), amount, currency:"USD", date, note, createdAt}`.

**Enums** centralizados en `schema.js`. **PrecisiÃ³n:** COP enteros; USD redondeado a 2 decimales en escritura y agregaciÃ³n (`Math.round(x*100)/100`).

### 4.4 Firmas de la capa de datos

**store.js**
```
loadDB() Â· saveDB(db) Â· getDB() Â· commit() Â· resetDB()
nextId(prefix) â†’ "prefix_000001"
budgetId(month, categoryId) Â· tradeDayId(date, accountId) Â· newGroupId()
migrate(db) Â· CURRENT_SCHEMA = 1
```

**personal.js**
```
addAccount(d) updateAccount(id,patch) archiveAccount(id) getAccounts({includeArchived}) getAccountBalance(id)
addCategory(d) updateCategory(id,patch) archiveCategory(id) getCategories({kind,includeArchived})
addTransaction(d) addTransfer({fromAccountId,toAccountId,amount,date,note}) updateTransaction(id,patch) deleteTransaction(id)
getTransactions(filters)  // {module,type,accountId,categoryId,from,to,month,tag,search,excludeTransfers,limit,offset,sort}
setBudget({month,categoryId,amount}) getBudget(month,categoryId) getBudgets(month) deleteBudget(month,categoryId)
addGoal(d) updateGoal(id,patch) archiveGoal(id) contributeToGoal(id,amount) getGoals({includeArchived})
```

**events.js**
```
addEvent(d) updateEvent(id,patch) setEventStatus(id,status) deleteEvent(id)  // borra hijos
getEvents(filters)  // {status,eventType,from,to,search,sort}
addEventIncome(d) updateEventIncome(id,patch) deleteEventIncome(id) getEventIncomes(eventId)
addEventCost(d) updateEventCost(id,patch) deleteEventCost(id) getEventCosts(eventId)
```

**trading.js**
```
addTradingAccount(d) updateTradingAccount(id,patch) archiveTradingAccount(id) getTradingAccounts({includeArchived})
setTradeDay({accountId,date,pnl,trades,note,tag,traded}) deleteTradeDay(date,accountId) getTradeDays(filters) // {accountId,from,to,month}
addTradingMovement(d) deleteTradingMovement(id) getTradingMovements({accountId,from,to})
```

**settings.js**
```
getSettings() updateSettings(patch) setFxRate(usdToCop,date) getFxRate(date) convertUsdToCop(amountUsd,date)
```

### 4.5 Agregaciones (`aggregations.js`) â€” alimentan KPIs y grÃ¡ficos

```
// Personal
sumByCategory({month,kind}) â†’ [{categoryId,name,color,total,pct}]
monthlyCashflow(year) â†’ 12Ã—{month,income,expense,net}
dailyCashflow(month) â†’ [{day,income,expense,net,cumulative}]
budgetVsActual(month) â†’ [{categoryId,name,budget,actual,pct,state(ok|alert|over)}]
netWorth() â†’ Î£ saldos COP
goalProgress(goalId) â†’ {current,target,pct,eta}
topExpenses({month,limit}) Â· savingsRate(month) Â· monthCompare(month) // {ingresos,gastos,balance,tasaAhorro} actual vs anterior + Î”

// Eventos
eventPL(eventId) â†’ {income,cost,profit,margin,pctCobrado,saldoPendiente}
eventsPipeline() â†’ [{status,count,amount}]  // embudo
eventsRevenue({from,to,groupBy:"month"}) â†’ [{month,income,cost,profit}]
accountsReceivable() â†’ {total, rows:[{eventId,cliente,nombre,fecha,valor,abonado,saldo,pctCobrado,vencido}]}
profitByEventType({from,to}) Â· costsByCategory({from,to}) â†’ [{category,total,pct}]
eventRanking({from,to,sort:"profit"|"margin"}) Â· upcomingEvents(limit) Â· monthlyEventsPL(month)

// Trading
tradingBalance(accountId) â†’ number USD
tradingStats({accountId,from,to}) â†’ {totalPnl,baseCapital,returnPct,tradedDays,greenDays,redDays,flatDays,winRate,avgGreen,avgRed,payoff,profitFactor,maxDD,maxDDPct,currentDD,currentDDPct,bestDay,worstDay,currentStreak,maxGreenStreak,maxRedStreak,sigma,cv}
equityCurve({accountId,from,to,mode:"full"|"trading"}) â†’ [{date,equity}]
pnlCalendar({accountId,month}) â†’ [{date,pnl,traded}]
pnlDistribution({accountId,from,to}) â†’ [{binLabel,count,from,to}]
monthlyPnl(accountId,year) â†’ 12Ã—{month,pnl,returnPct}
tradingConsistency(accountId) â†’ {monthsGreen,monthsTotal,sigma,cv,score}

// Consolidado
globalSnapshot() â†’ {personalNet, eventsProfit, tradingBalanceCop, tradingBalanceUsd, totalCop, fxRate}
todaySnapshot() â†’ {ingresosCop, gastosCop, tradingUsd, balanceDiaCop}
```

Todas protegen denominadores: `winRate:null`, `margin:null`, `profitFactor:"âˆž"|"â€”"` cuando corresponde; sumas vacÃ­as â†’ `0`, arrays â†’ `[]`.

### 4.6 Export / Import

```
exportJSON() â†’ string  // envoltura {app:"XAURA", type:"backup", schemaVersion, exportedAt, data:<xaura:db completo>}
importJSON(string, {mode:"replace"|"merge"}) â†’ {ok, error?}  // valida app+type; migra si schemaVersion<CURRENT; replace por defecto
exportCSV(entity)  // entity: "transactions"|"events"|"eventCosts"|"tradeDays"|...  (UTF-8 BOM, sep ",", decimal ".")
```
Nombre de archivo: `xaura-backup-YYYY-MM-DD.json`. CSV es solo salida; el import oficial es JSON.

### 4.7 Seed

Se usa Ã­ntegro el seed de la spec `modelo-datos` (Â§5), que produce: patrimonio personal **8.353.000 COP**; boda con utilidad **1.800.000 COP** (margen 12,9%) y por cobrar 14.000.000; trading P&L **+1.640,50 USD**, balance 101.640,50, win rate 66,7%. Se carga solo si `xaura:db` no existe Y el usuario elige "Cargar datos de ejemplo" en onboarding (alternativa: "Empezar vacÃ­o" â†’ db vacÃ­o con counters en 0).

---

## 5. NAVEGACIÃ“N Y ROUTER

### 5.1 Bottom nav (5, con FAB central)

| # | SecciÃ³n | Ruta | Icono Tabler | Estado activo |
|---|---------|------|--------------|---------------|
| 1 | Inicio | `#/inicio` | `ti-layout-dashboard` | oro `--gold-soft` + punto dorado bajo el item |
| 2 | Personal | `#/personal` | `ti-wallet` | idem |
| 3 | **+ Registrar** (FAB) | abre sheet `#/registrar` | `ti-plus` en cÃ­rculo dorado elevado | â€” |
| 4 | Trading | `#/trading` | `ti-chart-candle` | idem |
| 5 | Ajustes | `#/ajustes` | `ti-settings` | idem |

**Eventos** no es tab: se entra desde (a) tarjeta destacada en Dashboard, (b) segmented control `Personal | Eventos` en la cabecera de Personal. Ruta propia `#/eventos`. El nav usa `.bottomnav`/`.navitem`/`.navitem--active` de la spec de identidad. Nav flotante (`left/right: var(--sp-3)`, `bottom: calc(var(--sp-3)+env(safe-area-inset-bottom))`).

### 5.2 Router por hash (`router.js`)

- Escucha `hashchange` y `load`. Parsea `#/ruta/sub?fecha=YYYY-MM-DD&id=evt_000001`.
- Tabla de rutas â†’ vista:
```
#/inicio                  dashboard
#/personal                personal (tab=movimientos por defecto)
#/personal/stats|presupuestos|metas|reporte|categorias   subvistas de personal
#/eventos                 eventos (resumen)
#/eventos/lista|calendario|reportes|:id|nuevo            subvistas de eventos
#/trading                 trading (resumen)
#/trading/equity|diario|stats|caja|reportes|ajustes|nuevo subvistas de trading
#/ajustes                 ajustes
#/registrar               abre bottom sheet de registro (overlay, no cambia vista de fondo)
```
- Cada vista expone `{ render(params), unmount() }`. El router llama `unmount()` de la saliente, limpia `<main id="view">`, llama `render(params)`, actualiza `.navitem--active`, hace scroll-to-top.
- Default `#/inicio`. Si `settings.onboarded !== true` â†’ fuerza `onboarding` antes de cualquier ruta.
- Sheets/modales (`#/registrar`, ediciÃ³n) se montan como overlay sobre la vista actual y se cierran volviendo al hash previo.

---

## 6. PANTALLA POR PANTALLA

Convenciones: `D_mes` = dÃ­as del mes, `D_transcurridos` = dÃ­a actual. Mes en curso salvo selector. `fmtCOP`/`fmtUSD`/`fmtPct` definidos en Â§8.

### 6.1 DASHBOARD `#/inicio`

**Componentes (orden de scroll Aâ†’F):**
- **A. Saludo + racha:** saludo por hora ("Buenos dÃ­as/tardes/noches, {userName}"), fecha es-CO, chip racha (llama + `streak.count`).
- **B. Hero PATRIMONIO TOTAL:** `.kpi` grande glass.
- **C. Snapshot de HOY:** 3 mini-stats (Ingresos COP / Gastos COP / Trading USD) + balance del dÃ­a.
- **D. Accesos rÃ¡pidos:** 4 botones â†’ `[+ Ingreso] [â€“ Gasto] [â—ˆ Evento] [â–® DÃ­a trading]`, cada uno abre el sheet correspondiente con fecha=hoy.
- **E. 3 tarjetas KPI por mÃ³dulo** con sparkline y tapâ†’mÃ³dulo.
- **F. Donut global** de distribuciÃ³n de patrimonio (normalizado a COP).

**KPIs (fÃ³rmulas):**
| KPI | FÃ³rmula |
|-----|---------|
| Patrimonio total (â‰ˆ COP) | `personalNet + eventsProfit + tradingBalanceUsd Ã— fxRate` (`globalSnapshot`) |
| Î”% mes | variaciÃ³n del patrimonio vs cierre mes anterior |
| Ingresos hoy (COP) | `Î£ transactions income con date=hoy` |
| Gastos hoy (COP) | `Î£ transactions expense con date=hoy` |
| Trading hoy (USD) | `tradeDay.pnl del dÃ­a de hoy` |
| Balance del dÃ­a | ingresos âˆ’ gastos (COP) y pnl (USD), por separado |
| Personal â€” % presupuesto usado | `gastosMes / presupuestoTotal Ã— 100` |
| Eventos â€” utilidad del mes + prÃ³ximo evento | `monthlyEventsPL` + `upcomingEvents(1)` |
| Trading â€” win rate mes + P&L acum | `tradingStats` |

**GrÃ¡ficos:** sparkline Ã—3 (gasto diario, ingresos eventos, equity), donut global de patrimonio.
**Acciones:** editar tasa (mini-modal), toggle "Todo en COP / Por moneda" (tap en el hero), accesos rÃ¡pidos, tap en tarjeta â†’ mÃ³dulo.

### 6.2 PERSONAL `#/personal` (COP)

Cabecera con **segmented control `Personal | Eventos`**. Subvistas (tabs internos o secciones): Movimientos (default), Stats, Presupuestos, Metas, Reporte, CategorÃ­as.

**KPIs (mes en curso):**
| KPI | FÃ³rmula | Formato |
|-----|---------|---------|
| Ingresos del mes | `Î£ income, mes actual` | `$2.000.000` |
| Gastos del mes | `Î£ expense, mes actual` (excl. transfers) | `$1.350.000` |
| Balance del mes | `Ingresos âˆ’ Gastos` | verdeâ‰¥0/rojo<0 |
| Tasa de ahorro % | `Balance/Ingresos Ã— 100` | `32,5 %` |
| Gasto promedio diario | `Gastos / D_transcurridos` | `$45.000` |
| ProyecciÃ³n gasto fin de mes | `prom_diario Ã— D_mes` | `$1.395.000` |
| Balance proyectado | `Ingresos âˆ’ ProyecciÃ³n` | |
| Presupuesto total | `Î£ topes categorÃ­as (override mes o monthlyBudget)` | |
| Presupuesto restante | `Total âˆ’ Gastos` | |
| % presupuesto consumido | `Gastos/Total Ã— 100` | |
| Disponible hoy | `(Total âˆ’ Gastos)/(D_mes âˆ’ D_transcurridos + 1)` | `$/dÃ­a` |
| CategorÃ­a top de gasto | `argmax sumByCategory` | nombre + monto |
| VariaciÃ³n vs mes anterior | `(Gastos âˆ’ Gastos_ant)/Gastos_ant Ã— 100` | |

**GrÃ¡ficos:** flujo de caja diario (barras neto + lÃ­nea saldo acumulado), donut gastos por categorÃ­a, barras agrupadas ingresos vs gastos (6â€“12 meses), barras de progreso de presupuesto, anillos de metas, barras espejo mes vs mes (reporte).

**Presupuestos â€” estados:** OK `<80%` verde Â· alerta `80â€“100%` Ã¡mbar (banner) Â· excedido `>100%` rojo (alerta al guardar + badge Home). Alerta predictiva de ritmo: si `consumido > tope Ã— (D_transcurridos/D_mes)`.

**Acciones:** registro rÃ¡pido (sheet), swipe editar/eliminar movimiento, filtros (tipo/categorÃ­a/mÃ©todo/fecha/bÃºsqueda), editar topes, abonar a meta, CRUD categorÃ­as, exportar reporte mensual (render a canvas â†’ imagen).

### 6.3 EVENTOS `#/eventos` (COP)

Subvistas: Resumen (default), Lista, Detalle `:id`, Nuevo/Editar, Reportes, Calendario. Acciones rÃ¡pidas: `+ Abono`, `+ Costo`, cambiar estado (sheets/chips).

**KPIs:** convenciÃ³n "del mes" = `eventDate âˆˆ mes` con estado âˆˆ {realizado, pagado}.
| KPI | FÃ³rmula |
|-----|---------|
| Ingresos del mes | `Î£ quotedAmount` (realizado+pagado del mes) |
| Costos del mes | `Î£ eventCost` de esos eventos |
| Utilidad bruta del mes | Ingresos âˆ’ Costos |
| Margen % del mes | `Utilidad/Ingresos Ã— 100` (0 si Ingresos=0) |
| Utilidad por evento | `quotedAmount âˆ’ Î£ costos` |
| Margen por evento | `utilidad/quotedAmount Ã— 100` |
| Ticket promedio | `Î£ quotedAmount / nEventos` |
| # por estado | `count(status=X)` |
| CxC total | `Î£ (quotedAmount âˆ’ totalAbonado)` de {confirmado, realizado} con saldo>0 |
| Recaudado del mes | `Î£ eventIncome con date âˆˆ mes` |
| Evento mÃ¡s rentable | `argmax utilidad` |
| Costo por persona | `Î£ costos / guests` |
| % avance cobro | `totalAbonado/quotedAmount Ã— 100` |

Derivados por evento: `totalAbonado, totalCostos, saldoPendiente, utilidadEvento, margenEvento, costoPorPersona, %cobrado` (en `eventPL`).

**GrÃ¡ficos:** ingresos vs costos + lÃ­nea utilidad (mensual), barras horizontales margen por evento, donut costos por categorÃ­a, embudo pipeline por estado, calendario mensual + prÃ³ximos, barra apilada recaudo vs pendiente (CxC).

**Reportes:** P&L mensual (tabla con desglose por las 9 categorÃ­as de costo), ranking por rentabilidad (ordenable utilidad/margen), cuentas por cobrar (vencidos arriba, botÃ³n WhatsApp con `client.phone`). Exportar CSV/texto.

### 6.4 TRADING `#/trading` (USD)

Subvistas: Resumen (default), Equity, Diario, Stats, Movimientos (caja), Reportes, Ajustes. Nav interno 4: **Resumen Â· Equity Â· Diario Â· Stats**; el resto cuelga de "Â·Â·Â·".

**Regla de exclusiÃ³n:** dÃ­as `traded:false` excluidos de TODOS los conteos estadÃ­sticos; `pnl:0` (no afectan equity); aparecen en calendario como "sin operar" (gris).

**FÃ³rmulas clave (en `tradingStats`/`equityCurve`):**
```
B0 = (hay deposits) ? 0 : settings.initialBalance
netCashFlow = Î£deposits âˆ’ Î£withdrawals
totalPnL = Î£ pnl_i
currentBalance = B0 + netCashFlow + totalPnL
baseCapital = B0 + Î£deposits
returnPctTotal = totalPnL / baseCapital Ã— 100
winRate = greenDays / (greenDays+redDays+flatDays) Ã— 100
avgGreen = Î£pnl(verdes)/greenDays   avgRed = Î£pnl(rojos)/redDays   payoff = avgGreen/|avgRed|
profitFactor = Î£pnl(verdes) / |Î£pnl(rojos)|   // âˆž si grossLoss=0 y grossProfit>0; "â€”" si ambos 0
equity_i = equity_{i-1} + signedCashFlow_i + pnl_i
drawdown_i = peak_i âˆ’ equity_i   // peak ajustado por cashflow: peak += signedCashFlow
maxDD = max(drawdown_i)   maxDDPct = maxDD/peak Ã— 100
currentDD = peak_final âˆ’ equity_final
Ïƒ = sqrt(Î£(pnl_i âˆ’ media)Â²/n)   [dÃ­as traded]   cv = Ïƒ/|media|
returnPctMes = pnlMes / balanceInicioMes Ã— 100
```

**Tarjetas Stats (orden):** 1 Balance (USD/COP) Â· 2 P&L total (USD/COP/%) Â· 3 Retorno del mes (vs meta) Â· 4 Win rate Â· 5 Profit factor Â· 6 Prom verde/rojo (payoff) Â· 7 Mejor/Peor dÃ­a Â· 8 Verdes/rojos/planos Â· 9 Racha actual/mÃ¡x verde/mÃ¡x roja Â· 10 Drawdown mÃ¡x (USD+%) / actual.

**GrÃ¡ficos:** curva de equity (lÃ­nea+Ã¡rea, pico dorado, maxDD sombreado, toggle "con caja/solo trading", rango 1M/3M/6M/1A/Todo), barras P&L diario (eje 0 centrado), heatmap calendario (cuantiles 25/50/75/100 de |pnl|), histograma de distribuciÃ³n (lÃ­neas media+mediana), barras retorno mensual (lÃ­nea meta).

**Reportes:** resumen mensual por tarjeta, consistencia (Ïƒ, CV, meses verdes, score `clamp(100Ã—(0.5Â·winRate/100 + 0.3Â·min(PF/3,1) + 0.2Â·mesesVerdes/mesesTotales),0,100)`), mejor/peor mes. Exportar JSON.

**Acciones:** "Registrar dÃ­a" (sheet: foco en P&L `inputmode="decimal"`, botones `[+ Ganancia][âˆ’ PÃ©rdida]`, chips de etiqueta, "Hoy no operÃ©"), `+ DepÃ³sito/Retiro`, editar dÃ­a (reabre en modo ediciÃ³n si la fecha ya existe), conversiÃ³n COP toggle, editar ajustes del mÃ³dulo.

### 6.5 AJUSTES `#/ajustes`

Lista agrupada estilo iOS:
- **PERFIL:** nombre (editar), avatar con inicial.
- **MONEDA Y TASA:** tasa USD/COP editable (`setFxRate` â†’ push a `fxHistory`), "Tasa actualizada: {fecha}", toggle "Mostrar COP en trading".
- **APARIENCIA:** tema Oscuro/Claro/AutomÃ¡tico (`data-theme`), acento (Dorado default).
- **DATOS:** Exportar (`exportJSON` â†’ descarga), Importar (`importJSON` con confirmaciÃ³n), Exportar CSV por entidad, Borrar todo (modal "Escribe BORRAR" â†’ `resetDB`).
- **PRESUPUESTO:** presupuesto mensual personal (`settings.personalBudgetMonthly`).
- **TRADING:** balance inicial, fecha inicio, meta mensual %, etiquetas de sesiÃ³n editables.
- **INSTALAR APP:** acordeÃ³n iOS (Compartir â†’ AÃ±adir a inicio) / Android (`beforeinstallprompt` â†’ botÃ³n "Instalar XAURA").
- **ACERCA DE:** versiÃ³n `XAURA 1.0.0`, mensaje de privacidad ("Tus datos viven solo en este dispositivo. Sin nube, sin cuentas."), crÃ©ditos.

---

## 7. CATÃLOGO DE GRÃFICOS (SVG/Canvas, sin librerÃ­as) â€” `charts.js`

Lista Ãºnica, sin duplicados. Cada funciÃ³n recibe datos de `aggregations.js` y un contenedor.

| fn | Tipo | Entrada | Usado en |
|----|------|---------|----------|
| `sparkline(el,data)` | mini-lÃ­nea | `[number]` | Dashboard (Ã—3) |
| `donut(el,segments)` | dona | `[{label,value,color}]` + centro | Dashboard (patrimonio), Personal (gastos/categorÃ­a), Eventos (costos/categorÃ­a) |
| `lineArea(el,series,opts)` | lÃ­nea + Ã¡rea + grid | `[{date,value}]`, opts rango/pico/dd | Personal (saldo), Trading (equity) |
| `barsNet(el,data)` | barras con eje 0 centrado | `[{label,value}]` (verde/rojo) | Personal (flujo diario), Trading (P&L diario) |
| `groupedBars(el,data)` | barras agrupadas + lÃ­nea opcional | `[{label,a,b,line?}]` | Personal (ingresos vs gastos), Eventos (ingresos/costos/utilidad) |
| `progressBars(el,rows)` | barras progreso horizontales | `[{label,pct,state}]` | Personal (presupuestos) |
| `progressRing(el,pct)` | anillo de progreso | `pct` + dÃ­as | Personal (metas), Eventos (% cobro) |
| `mirrorBars(el,data)` | barras espejo / dobles | `[{label,actual,prev}]` | Personal (mes vs mes) |
| `hbarsRanked(el,rows)` | barras horizontales ordenadas | `[{label,value,color}]` | Eventos (margen por evento) |
| `funnel(el,stages)` | embudo | `[{status,count,amount}]` | Eventos (pipeline) |
| `stackedBar(el,rows)` | barra apilada | `[{label,parts:[{value,color}]}]` | Eventos (recaudo vs pendiente) |
| `heatmapCal(el,days)` | heatmap calendario (cuantiles) | `[{date,pnl,traded}]` | Trading (calendario) |
| `histogram(el,bins)` | histograma + media/mediana | `[{binLabel,count}]` | Trading (distribuciÃ³n) |
| `monthCalendar(el,events)` | grid mensual con puntos | `[{date,dots:[color]}]` | Eventos (calendario), date picker |

Reglas comunes: grid horizontal 0.5px `--chart-grid` (sin grid vertical), lÃ­nea 2px `stroke-linecap:round`, Ã¡rea con gradiente oroâ†’transparente, punto activo 4px oro con halo, ejes en `--font-mono` 11px `--chart-axis-text`, animaciÃ³n de trazo `draw` 900ms (respeta `prefers-reduced-motion`).

---

## 8. LÃ“GICA MULTI-MONEDA Y FORMATO

**Monedas por mÃ³dulo:** Personal COP Â· Eventos COP Â· Trading USD. Una sola tasa editable `settings.fxRate.usdToCop` (+ `fxHistory`).

**ConsolidaciÃ³n (patrimonio total):**
```js
totalCop = personalNet + eventsProfit + (tradingBalanceUsd * fxRate);
// Se muestra con prefijo â‰ˆ. Trading SIEMPRE muestra USD nativo + equivalente COP en gris.
// Toggle "Todo en COP" â†” "Por moneda" (2 totales nativos sin mezclar).
```

**Formato (`currency.js`):**
```js
const fmtCOP = n => '$' + Math.round(n).toLocaleString('es-CO');           // "$2.000.000"
const fmtUSD = n => 'US$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); // "US$1,025.40"
const fmtPct = (n,d=1) => n.toLocaleString('es-CO',{minimumFractionDigits:d,maximumFractionDigits:d}) + ' %';
const convertUsdToCop = (usd, rate) => usd * rate;
```
- COP: sin decimales, separador de miles punto.
- USD: 2 decimales, separador en-US.
- `settings.ui.showCop=false` â†’ solo USD en trading. La tasa NO se historiza para display (referencial); `fxHistory` se conserva para reportes consolidados futuros. Mostrar `â“˜` "ConversiÃ³n referencial a tasa actual".
- Toda cifra renderizada con `.x-num` (mono + tabular). `hideBalances` enmascara con `â€¢â€¢â€¢â€¢â€¢â€¢`.

---

## 9. ONBOARDING Y ESTADOS VACÃOS

**Onboarding** (`onboarding.js`) â€” se dispara si `settings.onboarded !== true`. Carrusel 4 pasos + cierre, barra de progreso, fondo oscuro:
| Paso | Campo | Default |
|------|-------|---------|
| 0 Bienvenida | logo + "Tu patrimonio, en un solo lugar." â†’ Comenzar | â€” |
| 1 Nombre | texto | "" |
| 2 Tasa USD/COP | numÃ©rico | 4000 |
| 3 Capital de trading (USD) | numÃ©rico (omitible) | 0 |
| 4 Presupuesto mensual (COP) | numÃ©rico (omitible) | 0 |
| âœ“ Listo | "Todo listo, {nombre}." â†’ Entrar | â€” |
Pregunta tambiÃ©n "Empezar vacÃ­o / Cargar datos de ejemplo". Al terminar: setea `settings.onboarded=true`, `userName`, `fxRate`, crea cuenta trading con `initialBalance` (y su depÃ³sito inicial), `personalBudgetMonthly`, entra a Dashboard.

**Estados vacÃ­os** (`empty.js`) â€” icono de lÃ­nea + frase breve + 1 CTA:
| Pantalla | Mensaje + CTA |
|----------|---------------|
| Dashboard sin datos | rombo + "Empieza tu primer registro" + `[+ Registrar]` |
| Personal/Eventos sin movimientos del dÃ­a | "Sin movimientos el {fecha}. Â¿Registramos uno?" + `[+ Ingreso][â€“ Gasto]` |
| Trading sin dÃ­as | "AÃºn no hay operaciones. Registra tu primer dÃ­a." + `[+ DÃ­a]` |
| Reportes sin datos | "Necesitas algunos dÃ­as mÃ¡s para ver tendencias." (skeleton) |
| Calendario | dÃ­as sin datos en gris, sin punto |

**Racha** (`streak.js`): dÃ­as calendario consecutivos con â‰¥1 registro en cualquier mÃ³dulo. Al abrir: `hoy===lastActiveDate`â†’sin cambio; `hoy===last+1` con registroâ†’`count++`; `hoy>last+1`â†’`count=0` (o 1 si registra hoy). Hitos 7/30/100 (toast dorado). Banner si abre sin registrar hoy.

**Notificaciones:** banner in-app siempre; push real solo con PWA instalada + permiso (iOS 16.4+); fallback honesto sin prometer push. Toasts dorados 2s sobre el nav.

---

## 10. CHECKLIST PWA

**`manifest.webmanifest`:**
```json
{
  "name": "XAURA", "short_name": "XAURA", "lang": "es-CO",
  "start_url": "./?source=pwa", "scope": "./", "display": "standalone",
  "orientation": "portrait", "background_color": "#0A0A0B", "theme_color": "#0A0A0B",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "assets/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**`index.html` meta tags (iOS + theming):**
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#0A0A0B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="XAURA">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon-180.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
```

**`sw.js`:** versionar cache (`xaura-v1`); precache app-shell (index.html, css, js, fuentes, iconos, offline.html); estrategia cache-first para assets estÃ¡ticos y network-first con fallback a cache para navegaciÃ³n; limpiar caches viejos en `activate`; `offline.html` como fallback de navegaciÃ³n.

**Iconos:** `icon.svg` (monograma "X" de haces dorados con halo, gradiente `#F4D58Dâ†’#C8A24B` sobre `#0A0A0B`), `icon-192/512.png`, `maskable-512.png` (monograma dentro del 80% de Ã¡rea segura), `apple-touch-icon-180.png`.

**InstalaciÃ³n:** detectar iOS (mostrar instrucciones Compartirâ†’AÃ±adir a inicio); en Android capturar `beforeinstallprompt`, guardar evento, mostrar botÃ³n "Instalar XAURA" en Ajustes.

**Verificaciones:** Lighthouse PWA â‰¥90; funciona sin red tras primera carga; safe-area respetada; `prefers-reduced-motion` honrado; `QuotaExceededError` capturado con aviso "Espacio lleno, exporta un backup".

---

## 11. ORDEN DE CONSTRUCCIÃ“N RECOMENDADO

1. **Fundaciones CSS:** `tokens.css` â†’ `base.css` â†’ `layout.css` â†’ `components.css`. (Validar look glass en un index estÃ¡tico.)
2. **NÃºcleo de datos:** `store.js` (loadDB/saveDB/nextId/migrate) â†’ `schema.js` (enums/validadores) â†’ `seed.js`. Probar persistencia en consola.
3. **CRUD por mÃ³dulo:** `settings.js` â†’ `personal.js` â†’ `events.js` â†’ `trading.js`. Probar cada firma con el seed.
4. **Agregaciones:** `currency.js` + `dates.js` â†’ `aggregations.js`. Verificar contra los resultados esperados del seed (8.353.000 / 1.800.000 / +1.640,50).
5. **Shell y router:** `index.html` (shell + bottom nav + FAB + contenedores) â†’ `app.js` â†’ `router.js` â†’ `nav.js` + `header.js`.
6. **GrÃ¡ficos:** `charts.js` (empezar por sparkline, donut, lineArea, barsNet; luego el resto).
7. **UI transversal:** `sheet.js`, `keypad.js`, `modal.js`, `toast.js`, `empty.js`.
8. **Vistas (en este orden):** `onboarding.js` â†’ `dashboard.js` â†’ `personal.js` â†’ `eventos.js` â†’ `trading.js` â†’ `ajustes.js`.
9. **Funciones de usuario:** `streak.js` + `backup.js` (export/import JSON+CSV).
10. **PWA:** `manifest.webmanifest` â†’ iconos â†’ `sw.js` â†’ `offline.html`. Registrar SW en `app.js`.
11. **Pulido:** micro-interacciones (`pressable`, `enter`, `pulse-aura`, count-up, hÃ¡ptica), estados vacÃ­os, accesibilidad, Lighthouse, prueba offline en mÃ³vil real (iOS/Android).

**Regla de validaciÃ³n continua:** tras los pasos 2â€“4, los tres nÃºmeros del seed deben cuadrar exactos antes de construir UI. Toda la app recalcula desde `xaura:db` en cada render; ningÃºn saldo/balance/P&L se persiste.
