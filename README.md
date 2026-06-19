# XAURA

**Tu patrimonio, en un solo lugar.** App web instalable (PWA) para llevar el control diario de tus finanzas personales, tu firma de eventos y tus operaciones de trading — con reportes, estadísticas y gráficos.

- **Personal** (COP): ingresos, gastos, presupuestos, metas, tasa de ahorro.
- **Eventos** (COP): rentabilidad por evento, costos, pipeline, cuentas por cobrar.
- **Trading** (USD): resultado diario, curva de equity, drawdown, win rate, calendario.

## Características

- 📱 **PWA**: se instala en iOS y Android y funciona **offline**.
- 🔒 **Privada**: tus datos viven **solo en tu dispositivo** (localStorage). Sin nube, sin cuentas.
- 🎨 Diseño minimalista, lujoso y tecnológico (negro + oro champán).
- 📊 Gráficos hechos a mano en SVG, sin dependencias externas.
- 💾 Respaldo: exporta/importa tus datos como JSON o CSV.

## Tecnología

PWA estática sin build: HTML + CSS + JavaScript (ES modules) puro. Datos en `localStorage`. Service worker para offline.

## Cómo usarla localmente

Al ser una app web estática solo necesitas servirla con cualquier servidor HTTP. Por ejemplo:

```bash
# Python
python -m http.server 4178
# luego abre http://localhost:4178
```

> Requiere servirse por `http(s)` (no `file://`) por los ES modules y el service worker.

## Instalar en el celular

1. Abre la URL de la app en el navegador del teléfono.
2. **iPhone (Safari):** Compartir → *Añadir a pantalla de inicio*.
3. **Android (Chrome):** menú ⋮ → *Instalar app*.

---

Privacidad: XAURA no envía datos a ningún servidor. Todo se guarda localmente en tu dispositivo.
