// ============================================================================
// XAURA · js/ui/charts.js
// Motor de gráficos SVG hecho a mano (catálogo §7 de SPEC.md).
// Sin librerías. Genera SVG inline con createElementNS, responsivo
// (viewBox + width:100%), grid horizontal 0.5px var(--chart-grid) sin grid
// vertical, líneas 2px stroke-linecap round, área con gradiente
// oro→transparente, punto activo dorado con halo, ejes en font-mono 11px
// var(--chart-axis-text). Usa variables CSS para colores. Animación de trazo
// opcional respetando prefers-reduced-motion. Tooltip táctil donde aplica.
// Cada función limpia el contenedor y maneja datos vacíos (estado vacío sutil).
//
// Catálogo (§7):
//   sparkline, donut, lineArea, barsNet, groupedBars, progressBars,
//   progressRing, mirrorBars, hbarsRanked, funnel, stackedBar,
//   heatmapCal, histogram, monthCalendar
// ============================================================================

import {
  fmtCOP,
  fmtUSD,
  fmtPct,
  formatNum,
  toNum,
} from '../core/currency.js';
import {
  parseLocalDate,
  formatDateEs,
  daysInMonth,
  NOMBRES_DIA_ABBR,
} from '../core/dates.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

// Contador global para IDs únicos de gradientes/clips/filtros por instancia.
let _uid = 0;
function uid(prefix) {
  _uid += 1;
  return `${prefix}_${_uid.toString(36)}`;
}

// Paleta dorada de respaldo para segmentos sin color (donut/funnel/stacked).
const FALLBACK_PALETTE = [
  'var(--gold)',
  'var(--gold-soft)',
  'var(--gold-deep)',
  '#C084FC',
  '#5E9DF6',
  '#34D399',
  '#FBBF24',
  '#F87171',
  '#8E8E98',
  '#E6C45E',
];

// ---------------------------------------------------------------------------
// Helpers de bajo nivel
// ---------------------------------------------------------------------------

/** Indica si el usuario prefiere movimiento reducido. */
function reduceMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_e) {
    return false;
  }
}

/** Crea un elemento SVG con atributos. */
function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  if (attrs) {
    for (const k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      node.setAttribute(k, String(v));
    }
  }
  return node;
}

/** Crea el <svg> raíz responsivo con viewBox. */
function createSvg(w, h, opts = {}) {
  const svg = el('svg', {
    viewBox: `0 0 ${w} ${h}`,
    width: '100%',
    height: opts.height || null,
    preserveAspectRatio: opts.preserveAspectRatio || 'xMidYMid meet',
    role: 'img',
    fill: 'none',
    xmlns: NS,
  });
  svg.style.display = 'block';
  svg.style.width = '100%';
  if (opts.cssHeight) svg.style.height = opts.cssHeight;
  svg.style.overflow = 'visible';
  svg.style.touchAction = 'manipulation';
  return svg;
}

/** Limpia un contenedor (acepta elemento o selector). */
function resolveContainer(target) {
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) return null;
  node.innerHTML = '';
  return node;
}

/** Texto SVG con tipografía de eje (font-mono 11px var(--chart-axis-text)). */
function axisText(x, y, str, opts = {}) {
  const t = el('text', {
    x,
    y,
    'text-anchor': opts.anchor || 'middle',
    'dominant-baseline': opts.baseline || 'middle',
  });
  t.style.fontFamily = 'var(--font-mono)';
  t.style.fontSize = (opts.size || 11) + 'px';
  t.style.fontVariantNumeric = 'tabular-nums';
  t.style.fill = opts.fill || 'var(--chart-axis-text)';
  t.style.letterSpacing = '0.01em';
  if (opts.weight) t.style.fontWeight = String(opts.weight);
  t.textContent = str == null ? '' : String(str);
  return t;
}

/** Línea de grid horizontal 0.5px var(--chart-grid). */
function gridLine(x1, x2, y) {
  return el('line', {
    x1, x2, y1: y, y2: y,
    stroke: 'var(--chart-grid)',
    'stroke-width': 0.5,
    'shape-rendering': 'crispEdges',
  });
}

/** Construye un path "d" para una polilínea suavizada (Catmull-Rom → Bézier). */
function smoothPath(points, smoothing = 0.18) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  }
  const p = points;
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * smoothing;
    const c1y = p1[1] + (p2[1] - p0[1]) * smoothing;
    const c2x = p2[0] - (p3[0] - p1[0]) * smoothing;
    const c2y = p2[1] - (p3[1] - p1[1]) * smoothing;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Path recto (polilínea). */
function linePath(points) {
  if (!points.length) return '';
  return 'M ' + points.map((pt) => `${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join(' L ');
}

/** Define un <linearGradient> vertical oro→transparente para áreas. */
function areaGradient(defs, id, from, to) {
  const grad = el('linearGradient', {
    id, x1: 0, y1: 0, x2: 0, y2: 1,
  });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': from || 'var(--chart-area-from)' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': to || 'var(--chart-area-to)' }));
  defs.appendChild(grad);
  return id;
}

/** Aplica animación de trazo (draw) a un path si no hay reduced-motion. */
function animateDraw(pathNode, duration = 900) {
  if (reduceMotion()) return;
  let len = 0;
  try {
    len = pathNode.getTotalLength();
  } catch (_e) {
    len = 0;
  }
  if (!len || !Number.isFinite(len)) return;
  pathNode.style.strokeDasharray = `${len} ${len}`;
  pathNode.style.strokeDashoffset = String(len);
  pathNode.style.transition = `stroke-dashoffset ${duration}ms var(--ease-out)`;
  // Forzar reflow para que arranque la transición.
  // eslint-disable-next-line no-unused-expressions
  pathNode.getBoundingClientRect();
  requestAnimationFrame(() => {
    pathNode.style.strokeDashoffset = '0';
  });
}

/** Aplica fade-in a un nodo (área, barras) salvo reduced-motion. */
function animateFade(node, delay = 0, duration = 500) {
  if (reduceMotion()) return;
  node.style.opacity = '0';
  node.style.transition = `opacity ${duration}ms var(--ease-out) ${delay}ms`;
  requestAnimationFrame(() => {
    node.style.opacity = node.dataset.targetOpacity || '1';
  });
}

/** Animación de crecimiento vertical para barras. */
function animateGrow(rect, baselineY, finalY, finalH, delay = 0) {
  if (reduceMotion()) {
    rect.setAttribute('y', finalY);
    rect.setAttribute('height', finalH);
    return;
  }
  rect.setAttribute('y', baselineY);
  rect.setAttribute('height', 0.01);
  rect.style.transition = `y 520ms var(--ease-out) ${delay}ms, height 520ms var(--ease-out) ${delay}ms`;
  requestAnimationFrame(() => {
    rect.setAttribute('y', finalY);
    rect.setAttribute('height', finalH);
  });
}

/** Estado vacío sutil: línea punteada + mensaje centrado. */
function emptyState(container, message, opts = {}) {
  const w = 300;
  const h = opts.h || 120;
  const svg = createSvg(w, h, { cssHeight: opts.cssHeight });
  // Línea base punteada tenue.
  svg.appendChild(el('line', {
    x1: 20, x2: w - 20, y1: h - 28, y2: h - 28,
    stroke: 'var(--chart-grid)',
    'stroke-width': 1,
    'stroke-dasharray': '3 5',
  }));
  // Glifo sutil (rombo hueco).
  const cx = w / 2;
  const cy = h / 2 - 8;
  const r = 9;
  svg.appendChild(el('path', {
    d: `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`,
    stroke: 'var(--gold-300)',
    'stroke-width': 1,
    fill: 'none',
  }));
  const txt = axisText(cx, h - 10, message || 'Sin datos', {
    fill: 'var(--text-tertiary)',
    size: 11,
  });
  svg.appendChild(txt);
  container.appendChild(svg);
  return svg;
}

/** Crea un tooltip flotante HTML reutilizable anclado al contenedor. */
function makeTooltip(container) {
  const tip = document.createElement('div');
  tip.className = 'x-chart-tooltip';
  Object.assign(tip.style, {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: '20',
    padding: '6px 9px',
    borderRadius: 'var(--r-sm, 8px)',
    background: 'var(--glass-bg-strong, rgba(20,20,23,0.92))',
    border: '1px solid var(--glass-border, rgba(212,175,55,0.22))',
    boxShadow: 'var(--sh-md, 0 8px 24px rgba(0,0,0,0.45))',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'var(--text-primary, #F5F5F7)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    lineHeight: '1.35',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    opacity: '0',
    transform: 'translate(-50%, -120%)',
    transition: reduceMotion() ? 'none' : 'opacity 120ms var(--ease-out)',
  });
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(tip);
  return {
    node: tip,
    show(html, xPct, yPct) {
      tip.innerHTML = html;
      tip.style.left = xPct + '%';
      tip.style.top = yPct + '%';
      tip.style.opacity = '1';
    },
    showAt(html, xPx, yPx) {
      tip.innerHTML = html;
      tip.style.left = xPx + 'px';
      tip.style.top = yPx + 'px';
      tip.style.opacity = '1';
    },
    hide() {
      tip.style.opacity = '0';
    },
  };
}

/** Escala lineal de dominio→rango. */
function scaleLinear(d0, d1, r0, r1) {
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** "Nice" max para ejes: redondea hacia arriba a un múltiplo agradable. */
function niceCeil(value) {
  const v = Math.abs(value);
  if (v === 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const frac = v / base;
  let nice;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 2.5) nice = 2.5;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

/** Formateador por moneda según opts. */
function moneyFmt(opts = {}) {
  if (opts.format && typeof opts.format === 'function') return opts.format;
  if (opts.currency === 'USD') return fmtUSD;
  return fmtCOP;
}

/** Color semántico positivo/negativo. */
function posNegColor(v) {
  return v >= 0 ? 'var(--chart-pos)' : 'var(--chart-neg)';
}

/** Etiqueta corta de eje monetario. */
function axisMoney(v, opts = {}) {
  return formatNum(v, { currency: opts.currency === 'USD' ? 'USD' : 'COP' });
}

/** Recorta texto a un ancho aproximado de caracteres. */
function truncate(str, max) {
  const s = String(str == null ? '' : str);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

// ===========================================================================
// 1. sparkline(el, data)
//    Mini-línea sin ejes. data: [number]. Dashboard (×3).
// ===========================================================================
export function sparkline(target, data, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const values = Array.isArray(data) ? data.map((d) => toNum(d)) : [];
  const W = opts.width || 120;
  const H = opts.height || 36;
  const padX = 2;
  const padY = 4;

  if (values.length < 2) {
    // Estado vacío sutil: línea base tenue centrada.
    const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
    svg.appendChild(el('line', {
      x1: padX, x2: W - padX, y1: H / 2, y2: H / 2,
      stroke: 'var(--chart-grid)', 'stroke-width': 1, 'stroke-dasharray': '2 4',
    }));
    container.appendChild(svg);
    return svg;
  }

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }

  const sx = scaleLinear(0, values.length - 1, padX, W - padX);
  const sy = scaleLinear(min, max, H - padY, padY);
  const points = values.map((v, i) => [sx(i), sy(v)]);

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const defs = el('defs');
  svg.appendChild(defs);

  const stroke = opts.color || 'var(--chart-line)';
  const last = values[values.length - 1];
  const first = values[0];
  const trendColor = opts.colorByTrend
    ? (last >= first ? 'var(--chart-pos)' : 'var(--chart-neg)')
    : stroke;

  // Área tenue bajo la curva (opcional, por defecto sí, sutil).
  if (opts.area !== false) {
    const gid = areaGradient(defs, uid('spk'),
      opts.colorByTrend ? (last >= first ? 'rgba(52,211,153,0.16)' : 'rgba(248,113,113,0.16)') : 'var(--chart-area-from)',
      'var(--chart-area-to)');
    const areaD = smoothPath(points) + ` L ${(W - padX).toFixed(2)} ${H} L ${padX.toFixed(2)} ${H} Z`;
    const area = el('path', { d: areaD, fill: `url(#${gid})` });
    svg.appendChild(area);
  }

  const path = el('path', {
    d: smoothPath(points),
    stroke: trendColor,
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    fill: 'none',
  });
  svg.appendChild(path);

  // Punto final dorado con halo.
  const endP = points[points.length - 1];
  svg.appendChild(el('circle', {
    cx: endP[0], cy: endP[1], r: 4.5,
    fill: trendColor, 'fill-opacity': 0.18,
  }));
  svg.appendChild(el('circle', {
    cx: endP[0], cy: endP[1], r: 2,
    fill: trendColor,
  }));

  container.appendChild(svg);
  animateDraw(path, 800);
  return svg;
}

// ===========================================================================
// 2. donut(el, segments, opts)
//    Dona con centro. segments: [{label,value,color}]. Tooltip al tocar.
//    Dashboard (patrimonio), Personal (gastos/cat), Eventos (costos/cat).
// ===========================================================================
export function donut(target, segments, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const segs = (Array.isArray(segments) ? segments : [])
    .map((s, i) => ({
      label: s && s.label != null ? String(s.label) : `Segmento ${i + 1}`,
      value: Math.max(0, toNum(s && s.value)),
      color: (s && s.color) || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
    }))
    .filter((s) => s.value > 0);

  const total = segs.reduce((a, s) => a + s.value, 0);

  const SIZE = opts.size || 200;
  const thickness = opts.thickness || 26;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = (SIZE - thickness) / 2 - 4;

  if (segs.length === 0 || total <= 0) {
    const svg = createSvg(SIZE, SIZE, { cssHeight: opts.cssHeight });
    svg.appendChild(el('circle', {
      cx, cy, r,
      stroke: 'var(--chart-bar-track)', 'stroke-width': thickness, fill: 'none',
    }));
    const t = axisText(cx, cy, opts.emptyText || 'Sin datos', {
      fill: 'var(--text-tertiary)', size: 11,
    });
    svg.appendChild(t);
    container.appendChild(svg);
    return svg;
  }

  const svg = createSvg(SIZE, SIZE, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);

  // Pista de fondo.
  svg.appendChild(el('circle', {
    cx, cy, r,
    stroke: 'var(--chart-bar-track)', 'stroke-width': thickness, fill: 'none',
  }));

  const circumference = 2 * Math.PI * r;
  const gapPx = segs.length > 1 ? Math.min(3, circumference * 0.004) : 0;
  let acc = 0;
  const arcs = [];

  segs.forEach((s, i) => {
    const frac = s.value / total;
    const dash = Math.max(0, frac * circumference - gapPx);
    const arc = el('circle', {
      cx, cy, r,
      stroke: s.color,
      'stroke-width': thickness,
      fill: 'none',
      'stroke-linecap': gapPx > 0 ? 'butt' : 'butt',
      'stroke-dasharray': `${dash} ${circumference - dash}`,
      'stroke-dashoffset': -acc,
      transform: `rotate(-90 ${cx} ${cy})`,
    });
    arc.style.transition = reduceMotion() ? 'none' : 'opacity 160ms var(--ease-out)';
    arc.style.cursor = 'pointer';
    const pct = (frac * 100);

    const onEnter = () => {
      arcs.forEach((a) => { a.node.style.opacity = a === arcs[i] ? '1' : '0.32'; });
      // Posición del tooltip: punto medio del arco.
      const midAngle = (acc + dash / 2) / circumference * 2 * Math.PI - Math.PI / 2;
      const tx = ((cx + Math.cos(midAngle) * r) / SIZE) * 100;
      const ty = ((cy + Math.sin(midAngle) * r) / SIZE) * 100;
      const valStr = opts.currency === 'USD' ? fmtUSD(s.value) : fmtCOP(s.value);
      tip.show(
        `<span style="color:${s.color}">●</span> ${truncate(s.label, 22)}<br>` +
        `<b>${valStr}</b> · ${fmtPct(pct, 1)}`,
        tx, ty,
      );
    };
    const onLeave = () => {
      arcs.forEach((a) => { a.node.style.opacity = '1'; });
      tip.hide();
    };
    arc.addEventListener('mouseenter', onEnter);
    arc.addEventListener('mouseleave', onLeave);
    arc.addEventListener('touchstart', (e) => { e.preventDefault(); onEnter(); }, { passive: false });
    arc.addEventListener('touchend', onLeave);

    svg.appendChild(arc);
    arcs.push({ node: arc, seg: s });
    acc += frac * circumference;
  });

  // Centro: valor + etiqueta.
  if (opts.center) {
    const c = opts.center;
    const vNode = el('text', { x: cx, y: cy - 4, 'text-anchor': 'middle' });
    vNode.style.fontFamily = 'var(--font-mono)';
    vNode.style.fontVariantNumeric = 'tabular-nums';
    vNode.style.fontWeight = '600';
    vNode.style.fontSize = (c.valueSize || 19) + 'px';
    vNode.style.fill = c.valueColor || 'var(--text-primary)';
    vNode.textContent = c.value != null ? String(c.value) : '';
    svg.appendChild(vNode);

    if (c.label) {
      const lNode = el('text', { x: cx, y: cy + 15, 'text-anchor': 'middle' });
      lNode.style.fontFamily = 'var(--font-sans)';
      lNode.style.fontSize = '10px';
      lNode.style.letterSpacing = '0.08em';
      lNode.style.textTransform = 'uppercase';
      lNode.style.fill = 'var(--text-tertiary)';
      lNode.textContent = String(c.label);
      svg.appendChild(lNode);
    }
  }

  container.appendChild(svg);

  // Animación de aparición de arcos (giro de offset).
  if (!reduceMotion()) {
    arcs.forEach((a, i) => {
      a.node.style.transition = 'stroke-dasharray 700ms var(--ease-out) ' + (i * 70) + 'ms';
      const finalDash = a.node.getAttribute('stroke-dasharray');
      a.node.setAttribute('stroke-dasharray', `0 ${circumference}`);
      requestAnimationFrame(() => {
        a.node.setAttribute('stroke-dasharray', finalDash);
      });
    });
  }

  return svg;
}

// ===========================================================================
// 3. lineArea(el, series, opts)
//    Línea + área + grid. series: [{date,value}] o {a:[...],b:[...]}.
//    opts: { currency, peak, dd:{from,to}, target, color }. Tooltip táctil.
//    Personal (saldo), Trading (equity).
// ===========================================================================
export function lineArea(target, series, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  // Normaliza: acepta [{date,value}] o [number].
  const raw = Array.isArray(series) ? series : [];
  const pts = raw.map((d, i) => {
    if (d && typeof d === 'object') {
      return { date: d.date || null, value: toNum(d.value), label: d.label };
    }
    return { date: null, value: toNum(d), label: null, _i: i };
  });

  const W = opts.width || 340;
  const H = opts.height || 180;
  const padL = opts.padL != null ? opts.padL : 8;
  const padR = opts.padR != null ? opts.padR : 8;
  const padT = 14;
  const padB = 22;

  if (pts.length < 2) {
    return emptyState(container, opts.emptyText || 'Sin datos suficientes', {
      h: H, cssHeight: opts.cssHeight,
    });
  }

  const values = pts.map((p) => p.value);
  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  if (opts.baselineZero && minV > 0) minV = 0;
  if (minV === maxV) { minV -= 1; maxV += 1; }
  // Margen vertical suave.
  const pad = (maxV - minV) * 0.08;
  minV -= pad;
  maxV += pad;

  const x0 = padL;
  const x1 = W - padR;
  const y0 = H - padB;
  const y1 = padT;

  const sx = scaleLinear(0, pts.length - 1, x0, x1);
  const sy = scaleLinear(minV, maxV, y0, y1);
  const points = pts.map((p, i) => [sx(i), sy(p.value)]);

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const defs = el('defs');
  svg.appendChild(defs);

  // --- Grid horizontal + etiquetas de eje Y (4 líneas).
  const gridCount = opts.gridLines || 4;
  for (let g = 0; g <= gridCount; g++) {
    const val = minV + (maxV - minV) * (g / gridCount);
    const gy = sy(val);
    svg.appendChild(gridLine(x0, x1, gy));
    if (opts.yLabels !== false) {
      const t = axisText(x0 + 1, gy - 3, axisMoney(val, opts), {
        anchor: 'start', baseline: 'baseline', size: 10,
      });
      t.style.opacity = '0.7';
      svg.appendChild(t);
    }
  }

  // --- Sombra de drawdown (entre dos índices).
  if (opts.dd && Number.isFinite(opts.dd.from) && Number.isFinite(opts.dd.to)) {
    const a = Math.max(0, Math.min(pts.length - 1, opts.dd.from));
    const b = Math.max(0, Math.min(pts.length - 1, opts.dd.to));
    const xa = sx(Math.min(a, b));
    const xb = sx(Math.max(a, b));
    svg.appendChild(el('rect', {
      x: xa, y: y1, width: Math.max(0, xb - xa), height: y0 - y1,
      fill: 'var(--negative-bg, rgba(248,113,113,0.12))',
    }));
  }

  // --- Área bajo la curva.
  const gid = areaGradient(defs, uid('la'),
    opts.areaFrom || 'var(--chart-area-from)', opts.areaTo || 'var(--chart-area-to)');
  const lineD = smoothPath(points);
  const areaD = lineD + ` L ${points[points.length - 1][0].toFixed(2)} ${y0} L ${points[0][0].toFixed(2)} ${y0} Z`;
  const area = el('path', { d: areaD, fill: `url(#${gid})` });
  area.dataset.targetOpacity = '1';
  svg.appendChild(area);

  // --- Línea meta (target) opcional.
  if (Number.isFinite(opts.target)) {
    const ty = sy(opts.target);
    if (ty >= y1 && ty <= y0) {
      svg.appendChild(el('line', {
        x1: x0, x2: x1, y1: ty, y2: ty,
        stroke: 'var(--gold-300)', 'stroke-width': 1, 'stroke-dasharray': '4 4',
      }));
    }
  }

  // --- Línea principal.
  const stroke = opts.color || 'var(--chart-line)';
  const path = el('path', {
    d: lineD, stroke, 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none',
  });
  svg.appendChild(path);

  // --- Marcador de pico dorado.
  if (Number.isFinite(opts.peak)) {
    const pk = Math.max(0, Math.min(pts.length - 1, opts.peak));
    const px = sx(pk); const py = sy(pts[pk].value);
    svg.appendChild(el('circle', { cx: px, cy: py, r: 6, fill: 'var(--gold-glow)', 'fill-opacity': 0.5 }));
    svg.appendChild(el('circle', { cx: px, cy: py, r: 3, fill: 'var(--gold)' }));
  }

  // --- Interacción: línea guía + punto + tooltip.
  const tip = makeTooltip(container);
  const guide = el('line', {
    x1: 0, x2: 0, y1: y1, y2: y0,
    stroke: 'var(--gold-300)', 'stroke-width': 1,
  });
  guide.style.opacity = '0';
  svg.appendChild(guide);
  const halo = el('circle', { cx: 0, cy: 0, r: 6, fill: 'var(--gold-glow)', 'fill-opacity': 0.5 });
  const dot = el('circle', { cx: 0, cy: 0, r: 3.2, fill: 'var(--gold)', stroke: 'var(--bg-base)', 'stroke-width': 1 });
  halo.style.opacity = '0'; dot.style.opacity = '0';
  svg.appendChild(halo); svg.appendChild(dot);

  const fmt = moneyFmt(opts);
  function moveTo(clientX) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((relX - x0) / (x1 - x0) * (pts.length - 1))));
    const cx = points[i][0]; const cyp = points[i][1];
    guide.setAttribute('x1', cx); guide.setAttribute('x2', cx);
    guide.style.opacity = '1';
    halo.setAttribute('cx', cx); halo.setAttribute('cy', cyp); halo.style.opacity = '1';
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cyp); dot.style.opacity = '1';
    const dlabel = pts[i].date ? formatDateEs(pts[i].date, { year: false }) : (pts[i].label || `#${i + 1}`);
    tip.show(`${dlabel}<br><b>${fmt(pts[i].value)}</b>`, (cx / W) * 100, (cyp / H) * 100);
  }
  function clearHover() {
    guide.style.opacity = '0'; halo.style.opacity = '0'; dot.style.opacity = '0';
    tip.hide();
  }
  svg.style.cursor = 'crosshair';
  svg.addEventListener('mousemove', (e) => moveTo(e.clientX));
  svg.addEventListener('mouseleave', clearHover);
  svg.addEventListener('touchstart', (e) => { if (e.touches[0]) { e.preventDefault(); moveTo(e.touches[0].clientX); } }, { passive: false });
  svg.addEventListener('touchmove', (e) => { if (e.touches[0]) { e.preventDefault(); moveTo(e.touches[0].clientX); } }, { passive: false });
  svg.addEventListener('touchend', clearHover);

  container.appendChild(svg);
  animateDraw(path, 950);
  animateFade(area, 200, 600);
  return svg;
}

// ===========================================================================
// 4. barsNet(el, data)
//    Barras con eje 0 centrado (verde/rojo). data: [{label,value}].
//    Personal (flujo diario), Trading (P&L diario). Tooltip táctil.
// ===========================================================================
export function barsNet(target, data, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const rows = (Array.isArray(data) ? data : []).map((d) => ({
    label: d && d.label != null ? String(d.label) : '',
    value: toNum(d && d.value),
  }));

  const W = opts.width || 340;
  const H = opts.height || 160;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 18;

  if (rows.length === 0) {
    return emptyState(container, opts.emptyText || 'Sin movimientos', { h: H, cssHeight: opts.cssHeight });
  }

  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const niceMax = niceCeil(maxAbs);

  const x0 = padL; const x1 = W - padR;
  const y0 = padT; const y1 = H - padB;
  const zeroY = (y0 + y1) / 2;
  const half = (y1 - y0) / 2;

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);

  // Grid: línea 0 marcada + líneas a ±niceMax tenues.
  svg.appendChild(gridLine(x0, x1, y0));
  svg.appendChild(gridLine(x0, x1, y1));
  // Eje cero más visible.
  svg.appendChild(el('line', {
    x1: x0, x2: x1, y1: zeroY, y2: zeroY,
    stroke: 'var(--chart-axis-text)', 'stroke-width': 0.75, 'stroke-opacity': 0.5,
    'shape-rendering': 'crispEdges',
  }));
  // Etiquetas eje Y (max y -max).
  const tTop = axisText(x0, y0 + 7, axisMoney(niceMax, opts), { anchor: 'start', size: 10 });
  tTop.style.opacity = '0.7';
  svg.appendChild(tTop);

  const n = rows.length;
  const slot = (x1 - x0) / n;
  const bw = Math.max(2, Math.min(slot * 0.62, 22));

  rows.forEach((r, i) => {
    const cx = x0 + slot * i + slot / 2;
    const h = (Math.abs(r.value) / niceMax) * half;
    const isPos = r.value >= 0;
    const y = isPos ? zeroY - h : zeroY;
    const color = isPos ? 'var(--chart-pos)' : 'var(--chart-neg)';
    const rect = el('rect', {
      x: cx - bw / 2, y, width: bw, height: Math.max(0.5, h),
      rx: Math.min(2, bw / 3), fill: color, 'fill-opacity': 0.92,
    });
    rect.style.cursor = 'pointer';
    const show = () => {
      rect.setAttribute('fill-opacity', '1');
      const fmt = moneyFmt(opts);
      tip.show(`${r.label}<br><b style="color:${color}">${fmt(r.value)}</b>`, (cx / W) * 100, ((isPos ? y : zeroY + h) / H) * 100);
    };
    const hide = () => { rect.setAttribute('fill-opacity', '0.92'); tip.hide(); };
    rect.addEventListener('mouseenter', show);
    rect.addEventListener('mouseleave', hide);
    rect.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
    rect.addEventListener('touchend', hide);
    svg.appendChild(rect);
    animateGrow(rect, zeroY, y, Math.max(0.5, h), i * 18);
  });

  // Etiquetas X opcionales (primer, medio, último para no saturar).
  if (opts.xLabels !== false && n > 0) {
    const idxs = n <= 7 ? rows.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
    idxs.forEach((i) => {
      const cx = x0 + slot * i + slot / 2;
      const t = axisText(cx, H - 5, rows[i].label, { size: 10 });
      svg.appendChild(t);
    });
  }

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 5. groupedBars(el, data, opts)
//    Barras agrupadas (a,b) + línea opcional. data: [{label,a,b,line?}].
//    Personal (ingresos vs gastos), Eventos (ingresos/costos/utilidad).
// ===========================================================================
export function groupedBars(target, data, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const rows = (Array.isArray(data) ? data : []).map((d) => ({
    label: d && d.label != null ? String(d.label) : '',
    a: toNum(d && d.a),
    b: toNum(d && d.b),
    line: d && d.line != null ? toNum(d.line) : null,
  }));

  const W = opts.width || 360;
  const H = opts.height || 190;
  const padL = 6; const padR = 6; const padT = 22; const padB = 22;

  if (rows.length === 0) {
    return emptyState(container, opts.emptyText || 'Sin datos del periodo', { h: H, cssHeight: opts.cssHeight });
  }

  const colorA = opts.colorA || 'var(--chart-pos)';
  const colorB = opts.colorB || 'var(--chart-neg)';
  const colorLine = opts.colorLine || 'var(--chart-line)';
  const labelA = opts.labelA || 'A';
  const labelB = opts.labelB || 'B';

  const hasLine = rows.some((r) => r.line != null);
  const maxBar = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b)));
  const lineVals = rows.filter((r) => r.line != null).map((r) => r.line);
  const maxAll = hasLine ? Math.max(maxBar, ...lineVals) : maxBar;
  const minLine = hasLine ? Math.min(0, ...lineVals) : 0;
  const niceMax = niceCeil(maxAll);
  const niceMin = minLine < 0 ? -niceCeil(Math.abs(minLine)) : 0;

  const x0 = padL; const x1 = W - padR;
  const y0 = padT; const y1 = H - padB;

  const sy = scaleLinear(niceMin, niceMax, y1, y0);
  const zeroY = sy(0);

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);

  // Grid.
  const gridCount = 4;
  for (let g = 0; g <= gridCount; g++) {
    const val = niceMin + (niceMax - niceMin) * (g / gridCount);
    const gy = sy(val);
    svg.appendChild(gridLine(x0, x1, gy));
    const t = axisText(x0, gy - 3, axisMoney(val, opts), { anchor: 'start', baseline: 'baseline', size: 9 });
    t.style.opacity = '0.65';
    svg.appendChild(t);
  }

  const n = rows.length;
  const slot = (x1 - x0) / n;
  const gap = Math.min(3, slot * 0.06);
  const bw = Math.max(3, (slot - gap * 3) / 2);

  const fmt = moneyFmt(opts);
  const linePts = [];

  rows.forEach((r, i) => {
    const sCx = x0 + slot * i;
    const xa = sCx + slot / 2 - bw - gap / 2;
    const xb = sCx + slot / 2 + gap / 2;

    [['a', xa, colorA, labelA], ['b', xb, colorB, labelB]].forEach(([key, xx, color, lab]) => {
      const val = r[key];
      const h = Math.abs(sy(0) - sy(val));
      const yy = val >= 0 ? sy(val) : zeroY;
      const rect = el('rect', {
        x: xx, y: yy, width: bw, height: Math.max(0.5, h),
        rx: Math.min(2, bw / 3), fill: color, 'fill-opacity': 0.9,
      });
      rect.style.cursor = 'pointer';
      const show = () => {
        rect.setAttribute('fill-opacity', '1');
        tip.show(`${r.label} · ${lab}<br><b style="color:${color}">${fmt(val)}</b>`, (xx + bw / 2) / W * 100, (yy / H) * 100);
      };
      const hide = () => { rect.setAttribute('fill-opacity', '0.9'); tip.hide(); };
      rect.addEventListener('mouseenter', show);
      rect.addEventListener('mouseleave', hide);
      rect.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
      rect.addEventListener('touchend', hide);
      svg.appendChild(rect);
      animateGrow(rect, zeroY, yy, Math.max(0.5, h), i * 30);
    });

    if (r.line != null) linePts.push([sCx + slot / 2, sy(r.line)]);
    // Etiqueta X.
    const t = axisText(sCx + slot / 2, H - 5, truncate(r.label, 6), { size: 9 });
    svg.appendChild(t);
  });

  // Línea de utilidad superpuesta.
  if (hasLine && linePts.length >= 1) {
    if (linePts.length >= 2) {
      const lp = el('path', {
        d: smoothPath(linePts), stroke: colorLine, 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none',
      });
      svg.appendChild(lp);
      animateDraw(lp, 900);
    }
    linePts.forEach((p) => {
      svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 2.6, fill: colorLine, stroke: 'var(--bg-base)', 'stroke-width': 1 }));
    });
  }

  // Leyenda superior.
  const legend = [[labelA, colorA], [labelB, colorB]];
  if (hasLine && opts.lineLabel) legend.push([opts.lineLabel, colorLine]);
  let lx = x0;
  legend.forEach(([lab, color]) => {
    svg.appendChild(el('rect', { x: lx, y: 4, width: 8, height: 8, rx: 2, fill: color }));
    const t = axisText(lx + 12, 8, lab, { anchor: 'start', size: 10, fill: 'var(--text-secondary)' });
    svg.appendChild(t);
    lx += 14 + String(lab).length * 6.2;
  });

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 6. progressBars(el, rows)
//    Barras de progreso horizontales con estado. rows: [{label,pct,state}].
//    state: ok | alert | over.  Personal (presupuestos).
// ===========================================================================
export function progressBars(target, rows, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const data = (Array.isArray(rows) ? rows : []).map((r) => ({
    label: r && r.label != null ? String(r.label) : '',
    pct: Math.max(0, toNum(r && r.pct)),
    state: (r && r.state) || (toNum(r && r.pct) > 100 ? 'over' : toNum(r && r.pct) >= 80 ? 'alert' : 'ok'),
    value: r && r.value != null ? r.value : null,
    budget: r && r.budget != null ? r.budget : null,
  }));

  if (data.length === 0) {
    const wrap = document.createElement('div');
    emptyState(wrap, opts.emptyText || 'Sin presupuestos', { h: 90 });
    container.appendChild(wrap.firstChild);
    return;
  }

  const STATE_COLOR = {
    ok: 'var(--chart-pos)',
    alert: 'var(--warning, #FBBF24)',
    over: 'var(--chart-neg)',
  };

  const rowH = 44;
  const W = opts.width || 340;
  const H = data.length * rowH + 6;
  const barH = 8;
  const trackX = 4;
  const trackW = W - 8;

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });

  data.forEach((r, i) => {
    const yTop = i * rowH + 8;
    const color = STATE_COLOR[r.state] || STATE_COLOR.ok;

    // Etiqueta izquierda.
    const lab = el('text', { x: trackX, y: yTop, 'text-anchor': 'start' });
    lab.style.fontFamily = 'var(--font-sans)';
    lab.style.fontSize = '12px';
    lab.style.fill = 'var(--text-secondary)';
    lab.textContent = truncate(r.label, 22);
    svg.appendChild(lab);

    // Porcentaje derecha (mono).
    const pctNode = axisText(trackX + trackW, yTop, fmtPct(r.pct, 0), {
      anchor: 'end', baseline: 'alphabetic', size: 12, fill: color, weight: 600,
    });
    svg.appendChild(pctNode);

    // Pista.
    const barY = yTop + 9;
    svg.appendChild(el('rect', {
      x: trackX, y: barY, width: trackW, height: barH, rx: barH / 2,
      fill: 'var(--chart-bar-track)',
    }));

    // Relleno (clamp visual a 100%, indicador de exceso si >100).
    const fillW = Math.max(0, Math.min(1, r.pct / 100)) * trackW;
    const fill = el('rect', {
      x: trackX, y: barY, width: fillW, height: barH, rx: barH / 2, fill: color,
    });
    if (!reduceMotion()) {
      fill.setAttribute('width', 0);
      fill.style.transition = `width 700ms var(--ease-out) ${i * 60}ms`;
      requestAnimationFrame(() => fill.setAttribute('width', fillW));
    }
    svg.appendChild(fill);

    // Marca de exceso (>100%): pequeño triángulo al final.
    if (r.pct > 100) {
      const ex = trackX + trackW;
      svg.appendChild(el('path', {
        d: `M ${ex - 5} ${barY - 2} L ${ex} ${barY + barH / 2} L ${ex - 5} ${barY + barH + 2} Z`,
        fill: 'var(--chart-neg)',
      }));
    }
  });

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 7. progressRing(el, pct, opts)
//    Anillo de progreso. opts: { label, days, color, centerText, size }.
//    Personal (metas), Eventos (% cobro).
// ===========================================================================
export function progressRing(target, pct, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const value = Math.max(0, Math.min(100, toNum(pct)));
  const overflow = toNum(pct) > 100;
  const SIZE = opts.size || 132;
  const thickness = opts.thickness || 11;
  const cx = SIZE / 2; const cy = SIZE / 2;
  const r = (SIZE - thickness) / 2 - 2;
  const C = 2 * Math.PI * r;
  const color = opts.color || (overflow ? 'var(--chart-pos)' : 'var(--gold)');

  const svg = createSvg(SIZE, SIZE, { cssHeight: opts.cssHeight });
  const defs = el('defs');
  svg.appendChild(defs);

  // Pista.
  svg.appendChild(el('circle', {
    cx, cy, r, fill: 'none', stroke: 'var(--chart-bar-track)', 'stroke-width': thickness,
  }));

  // Arco de progreso.
  const dash = (value / 100) * C;
  const arc = el('circle', {
    cx, cy, r, fill: 'none', stroke: color, 'stroke-width': thickness,
    'stroke-linecap': 'round',
    'stroke-dasharray': `${dash} ${C - dash}`,
    'stroke-dashoffset': 0,
    transform: `rotate(-90 ${cx} ${cy})`,
  });
  svg.appendChild(arc);

  if (!reduceMotion()) {
    arc.style.transition = 'stroke-dasharray 850ms var(--ease-out)';
    arc.setAttribute('stroke-dasharray', `0 ${C}`);
    requestAnimationFrame(() => arc.setAttribute('stroke-dasharray', `${dash} ${C - dash}`));
  }

  // Texto central.
  const centerVal = opts.centerText != null ? String(opts.centerText) : fmtPct(value, 0);
  const vNode = el('text', { x: cx, y: opts.days || opts.label ? cy - 3 : cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
  vNode.style.fontFamily = 'var(--font-mono)';
  vNode.style.fontVariantNumeric = 'tabular-nums';
  vNode.style.fontWeight = '600';
  vNode.style.fontSize = (opts.valueSize || 22) + 'px';
  vNode.style.fill = color;
  vNode.textContent = centerVal;
  svg.appendChild(vNode);

  const sub = opts.days != null
    ? (toNum(opts.days) >= 0 ? `${Math.round(toNum(opts.days))} días` : 'vencido')
    : (opts.label || null);
  if (sub) {
    const lNode = el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    lNode.style.fontFamily = 'var(--font-sans)';
    lNode.style.fontSize = '10px';
    lNode.style.fill = 'var(--text-tertiary)';
    lNode.textContent = String(sub);
    svg.appendChild(lNode);
  }

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 8. mirrorBars(el, data)
//    Barras espejo (actual vs previo) por categoría. data: [{label,actual,prev}].
//    Personal (mes vs mes).
// ===========================================================================
export function mirrorBars(target, data, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const rows = (Array.isArray(data) ? data : []).map((d) => ({
    label: d && d.label != null ? String(d.label) : '',
    actual: Math.max(0, toNum(d && d.actual)),
    prev: Math.max(0, toNum(d && d.prev)),
  }));

  const W = opts.width || 340;
  const rowH = 40;
  const H = Math.max(60, rows.length * rowH + 18);
  const colActual = opts.colorActual || 'var(--gold)';
  const colPrev = opts.colorPrev || 'var(--text-tertiary)';
  const labelActual = opts.labelActual || 'Actual';
  const labelPrev = opts.labelPrev || 'Anterior';

  if (rows.length === 0) {
    return emptyState(container, opts.emptyText || 'Sin comparación disponible', { h: 100, cssHeight: opts.cssHeight });
  }

  const center = W / 2;
  const labelGap = 4;
  const sideW = center - 8;
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.prev)));
  const niceMax = niceCeil(maxV);

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);
  const fmt = moneyFmt(opts);

  // Eje central.
  svg.appendChild(el('line', { x1: center, x2: center, y1: 16, y2: H - 4, stroke: 'var(--chart-grid)', 'stroke-width': 0.75 }));

  // Leyenda.
  svg.appendChild(el('rect', { x: 0, y: 4, width: 8, height: 8, rx: 2, fill: colPrev }));
  svg.appendChild(axisText(12, 8, labelPrev, { anchor: 'start', size: 10, fill: 'var(--text-secondary)' }));
  svg.appendChild(el('rect', { x: W - 70, y: 4, width: 8, height: 8, rx: 2, fill: colActual }));
  svg.appendChild(axisText(W - 56, 8, labelActual, { anchor: 'start', size: 10, fill: 'var(--text-secondary)' }));

  const barH = 13;
  rows.forEach((r, i) => {
    const yTop = 22 + i * rowH;
    const barY = yTop + 6;

    // Previo: izquierda (crece hacia la izquierda desde el centro).
    const wPrev = (r.prev / niceMax) * sideW;
    const pRect = el('rect', {
      x: center - labelGap - wPrev, y: barY, width: Math.max(0.5, wPrev), height: barH,
      rx: 2, fill: colPrev, 'fill-opacity': 0.55,
    });
    // Actual: derecha.
    const wAct = (r.actual / niceMax) * sideW;
    const aRect = el('rect', {
      x: center + labelGap, y: barY, width: Math.max(0.5, wAct), height: barH,
      rx: 2, fill: colActual, 'fill-opacity': 0.92,
    });

    [[pRect, r.prev, labelPrev, colPrev, 'left'], [aRect, r.actual, labelActual, colActual, 'right']].forEach(([rect, val, lab, color, side]) => {
      rect.style.cursor = 'pointer';
      const show = () => {
        rect.setAttribute('fill-opacity', '1');
        const bx = side === 'left' ? (center - labelGap - (val / niceMax) * sideW) / W * 100 : (center + labelGap + (val / niceMax) * sideW) / W * 100;
        tip.show(`${r.label} · ${lab}<br><b style="color:${color}">${fmt(val)}</b>`, bx, (barY / H) * 100);
      };
      const hide = () => { rect.setAttribute('fill-opacity', side === 'left' ? '0.55' : '0.92'); tip.hide(); };
      rect.addEventListener('mouseenter', show);
      rect.addEventListener('mouseleave', hide);
      rect.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
      rect.addEventListener('touchend', hide);
      svg.appendChild(rect);
    });

    if (!reduceMotion()) {
      [pRect, aRect].forEach((rect, k) => {
        const fw = rect.getAttribute('width');
        const fx = parseFloat(rect.getAttribute('x'));
        rect.setAttribute('width', 0);
        if (k === 0) rect.setAttribute('x', center - labelGap);
        rect.style.transition = `width 600ms var(--ease-out) ${i * 50}ms, x 600ms var(--ease-out) ${i * 50}ms`;
        requestAnimationFrame(() => { rect.setAttribute('width', fw); rect.setAttribute('x', fx); });
      });
    }

    // Etiqueta de categoría centrada sobre el eje.
    const cat = axisText(center, yTop + 1, truncate(r.label, 18), { size: 10, fill: 'var(--text-secondary)' });
    svg.appendChild(cat);
  });

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 9. hbarsRanked(el, rows)
//    Barras horizontales ordenadas. rows: [{label,value,color}].
//    Eventos (margen por evento). Tooltip táctil.
// ===========================================================================
export function hbarsRanked(target, rows, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  let data = (Array.isArray(rows) ? rows : []).map((r, i) => ({
    label: r && r.label != null ? String(r.label) : '',
    value: toNum(r && r.value),
    color: (r && r.color) || null,
    sub: r && r.sub != null ? String(r.sub) : null,
  }));

  if (opts.sort !== false) data.sort((a, b) => b.value - a.value);
  if (opts.limit) data = data.slice(0, opts.limit);

  const W = opts.width || 340;
  const rowH = 34;
  const H = Math.max(60, data.length * rowH + 8);

  if (data.length === 0) {
    return emptyState(container, opts.emptyText || 'Sin elementos para rankear', { h: 100, cssHeight: opts.cssHeight });
  }

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const niceMax = niceCeil(maxAbs);
  const hasNeg = data.some((d) => d.value < 0);

  const labelW = opts.labelW || Math.min(110, W * 0.34);
  const x0 = labelW + 6;
  const x1 = W - 6;
  const trackW = x1 - x0;
  const zeroX = hasNeg ? x0 + trackW / 2 : x0;
  const halfW = hasNeg ? trackW / 2 : trackW;

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);
  const fmt = moneyFmt(opts);

  if (hasNeg) {
    svg.appendChild(el('line', { x1: zeroX, x2: zeroX, y1: 4, y2: H - 4, stroke: 'var(--chart-grid)', 'stroke-width': 0.75 }));
  }

  data.forEach((d, i) => {
    const yTop = i * rowH + 4;
    const barH = 14;
    const barY = yTop + 6;

    // Etiqueta.
    const lab = el('text', { x: labelW, y: barY + barH / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    lab.style.fontFamily = 'var(--font-sans)';
    lab.style.fontSize = '11.5px';
    lab.style.fill = 'var(--text-secondary)';
    lab.textContent = truncate(d.label, Math.floor(labelW / 7));
    svg.appendChild(lab);

    const w = (Math.abs(d.value) / niceMax) * halfW;
    const isPos = d.value >= 0;
    const color = d.color || (hasNeg ? posNegColor(d.value) : 'var(--chart-bar)');
    const bx = isPos ? zeroX : zeroX - w;

    const rect = el('rect', {
      x: bx, y: barY, width: Math.max(0.5, w), height: barH, rx: 3, fill: color, 'fill-opacity': 0.92,
    });
    rect.style.cursor = 'pointer';
    const show = () => {
      rect.setAttribute('fill-opacity', '1');
      const html = `${truncate(d.label, 24)}<br><b style="color:${color}">${fmt(d.value)}</b>` + (d.sub ? `<br><span style="color:var(--text-tertiary)">${d.sub}</span>` : '');
      tip.show(html, ((bx + w / 2) / W) * 100, ((barY) / H) * 100);
    };
    const hide = () => { rect.setAttribute('fill-opacity', '0.92'); tip.hide(); };
    rect.addEventListener('mouseenter', show);
    rect.addEventListener('mouseleave', hide);
    rect.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
    rect.addEventListener('touchend', hide);
    svg.appendChild(rect);

    if (!reduceMotion()) {
      rect.setAttribute('width', 0);
      if (!isPos) rect.setAttribute('x', zeroX);
      rect.style.transition = `width 600ms var(--ease-out) ${i * 55}ms, x 600ms var(--ease-out) ${i * 55}ms`;
      requestAnimationFrame(() => { rect.setAttribute('width', Math.max(0.5, w)); rect.setAttribute('x', bx); });
    }

    // Valor al final de la barra (mono).
    const vx = isPos ? Math.min(x1, bx + w + 4) : Math.max(x0, bx - 4);
    const vNode = axisText(vx, barY + barH / 2, formatNum(d.value, { currency: opts.currency === 'USD' ? 'USD' : 'COP' }), {
      anchor: isPos ? 'start' : 'end', baseline: 'middle', size: 10, fill: 'var(--text-tertiary)',
    });
    svg.appendChild(vNode);
  });

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 10. funnel(el, stages)
//     Embudo de pipeline. stages: [{status,count,amount}].
//     Eventos (pipeline por estado). Tooltip táctil.
// ===========================================================================
export function funnel(target, stages, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const rows = (Array.isArray(stages) ? stages : []).map((s, i) => ({
    status: s && s.status != null ? String(s.status) : `Etapa ${i + 1}`,
    count: Math.max(0, toNum(s && s.count)),
    amount: toNum(s && s.amount),
    color: (s && s.color) || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
  }));

  const W = opts.width || 340;
  const stageH = 38;
  const gap = 6;
  const H = Math.max(80, rows.length * (stageH + gap) + 6);

  if (rows.length === 0) {
    return emptyState(container, opts.emptyText || 'Sin eventos en pipeline', { h: 120, cssHeight: opts.cssHeight });
  }

  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const cx = W / 2;
  const maxBarW = W - 12;
  const minBarW = Math.max(40, maxBarW * 0.18);

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);

  rows.forEach((r, i) => {
    const yTop = i * (stageH + gap) + 2;
    const frac = r.count / maxCount;
    const bw = minBarW + (maxBarW - minBarW) * frac;
    const x = cx - bw / 2;

    // Trapecio sutil: usamos rect redondeado para legibilidad.
    const rect = el('rect', {
      x, y: yTop, width: bw, height: stageH, rx: 8,
      fill: r.color, 'fill-opacity': 0.85,
    });
    rect.style.cursor = 'pointer';
    const show = () => {
      rect.setAttribute('fill-opacity', '1');
      const amtStr = opts.currency === 'USD' ? fmtUSD(r.amount) : fmtCOP(r.amount);
      tip.show(`${r.status}<br><b>${r.count}</b> · ${amtStr}`, (cx / W) * 100, ((yTop + stageH / 2) / H) * 100);
    };
    const hide = () => { rect.setAttribute('fill-opacity', '0.85'); tip.hide(); };
    rect.addEventListener('mouseenter', show);
    rect.addEventListener('mouseleave', hide);
    rect.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
    rect.addEventListener('touchend', hide);
    svg.appendChild(rect);

    if (!reduceMotion()) {
      rect.setAttribute('width', 0); rect.setAttribute('x', cx);
      rect.style.transition = `width 600ms var(--ease-out) ${i * 70}ms, x 600ms var(--ease-out) ${i * 70}ms`;
      requestAnimationFrame(() => { rect.setAttribute('width', bw); rect.setAttribute('x', x); });
    }

    // Texto: estado (izq) + conteo (centro).
    const lab = el('text', { x: cx, y: yTop + stageH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    lab.style.fontFamily = 'var(--font-sans)';
    lab.style.fontSize = '12px';
    lab.style.fontWeight = '500';
    lab.style.fill = 'var(--text-on-gold, #1A1408)';
    lab.style.pointerEvents = 'none';
    lab.textContent = `${truncate(r.status, 16)} · ${r.count}`;
    svg.appendChild(lab);
  });

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 11. stackedBar(el, rows)
//     Barra apilada (horizontal por defecto). rows: [{label,parts:[{value,color,label}]}].
//     Eventos (recaudo vs pendiente). Tooltip táctil.
// ===========================================================================
export function stackedBar(target, rows, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const data = (Array.isArray(rows) ? rows : []).map((r) => ({
    label: r && r.label != null ? String(r.label) : '',
    parts: (r && Array.isArray(r.parts) ? r.parts : []).map((p, j) => ({
      value: Math.max(0, toNum(p && p.value)),
      color: (p && p.color) || FALLBACK_PALETTE[j % FALLBACK_PALETTE.length],
      label: p && p.label != null ? String(p.label) : `Parte ${j + 1}`,
    })),
  })).filter((r) => r.parts.length > 0);

  const W = opts.width || 340;
  const rowH = opts.rowH || 46;
  const H = Math.max(60, data.length * rowH + 8);

  if (data.length === 0) {
    return emptyState(container, opts.emptyText || 'Sin datos para apilar', { h: 90, cssHeight: opts.cssHeight });
  }

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);
  const fmt = moneyFmt(opts);
  const x0 = 4; const trackW = W - 8; const barH = 16;

  data.forEach((r, i) => {
    const yTop = i * rowH + 6;
    const total = r.parts.reduce((a, p) => a + p.value, 0);
    const barY = yTop + 16;

    // Etiqueta.
    const lab = el('text', { x: x0, y: yTop + 6, 'text-anchor': 'start' });
    lab.style.fontFamily = 'var(--font-sans)';
    lab.style.fontSize = '12px';
    lab.style.fill = 'var(--text-secondary)';
    lab.textContent = truncate(r.label, 30);
    svg.appendChild(lab);

    // Pista.
    svg.appendChild(el('rect', { x: x0, y: barY, width: trackW, height: barH, rx: barH / 2, fill: 'var(--chart-bar-track)' }));

    if (total <= 0) return;
    let acc = 0;
    r.parts.forEach((p, j) => {
      const w = (p.value / total) * trackW;
      const isFirst = acc === 0;
      const isLast = acc + p.value >= total - 1e-9;
      const seg = el('rect', {
        x: x0 + acc / total * trackW, y: barY, width: Math.max(0.5, w), height: barH,
        fill: p.color, 'fill-opacity': 0.95,
        rx: (isFirst || isLast) ? barH / 2 : 0,
      });
      seg.style.cursor = 'pointer';
      const segX = x0 + (acc / total) * trackW;
      const show = () => {
        seg.setAttribute('fill-opacity', '1');
        const pct = total > 0 ? (p.value / total) * 100 : 0;
        tip.show(`<span style="color:${p.color}">●</span> ${p.label}<br><b>${fmt(p.value)}</b> · ${fmtPct(pct, 0)}`, ((segX + w / 2) / W) * 100, (barY / H) * 100);
      };
      const hide = () => { seg.setAttribute('fill-opacity', '0.95'); tip.hide(); };
      seg.addEventListener('mouseenter', show);
      seg.addEventListener('mouseleave', hide);
      seg.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
      seg.addEventListener('touchend', hide);
      svg.appendChild(seg);

      if (!reduceMotion()) {
        const fw = Math.max(0.5, w); const fx = segX;
        seg.setAttribute('width', 0); seg.setAttribute('x', x0);
        seg.style.transition = `width 650ms var(--ease-out) ${i * 60 + j * 40}ms, x 650ms var(--ease-out) ${i * 60 + j * 40}ms`;
        requestAnimationFrame(() => { seg.setAttribute('width', fw); seg.setAttribute('x', fx); });
      }
      acc += p.value;
    });

    // Total a la derecha de la etiqueta (mono).
    const tNode = axisText(x0 + trackW, yTop + 6, fmt(total), { anchor: 'end', baseline: 'alphabetic', size: 11, fill: 'var(--text-primary)', weight: 600 });
    svg.appendChild(tNode);
  });

  // Leyenda global (toma las parts de la primera fila).
  if (opts.legend !== false && data[0]) {
    const legendWrap = document.createElement('div');
    Object.assign(legendWrap.style, {
      display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
      marginTop: '6px', fontFamily: 'var(--font-sans)', fontSize: '11px',
      color: 'var(--text-tertiary)',
    });
    data[0].parts.forEach((p) => {
      const item = document.createElement('span');
      item.style.display = 'inline-flex';
      item.style.alignItems = 'center';
      item.style.gap = '5px';
      item.innerHTML = `<span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block"></span>${p.label}`;
      legendWrap.appendChild(item);
    });
    container.appendChild(svg);
    container.appendChild(legendWrap);
    return svg;
  }

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 12. heatmapCal(el, days, opts)
//     Heatmap calendario por cuantiles de |pnl|. days: [{date,pnl,traded}].
//     Trading (calendario). Tooltip táctil.
// ===========================================================================
export function heatmapCal(target, days, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const list = (Array.isArray(days) ? days : [])
    .map((d) => ({
      date: d && d.date ? String(d.date) : null,
      pnl: toNum(d && d.pnl),
      traded: !!(d && d.traded),
    }))
    .filter((d) => d.date && parseLocalDate(d.date));

  if (list.length === 0) {
    return emptyState(container, opts.emptyText || 'Sin operaciones registradas', { h: 130, cssHeight: opts.cssHeight });
  }

  // Determina mes/año del primer registro (o opts.month: 'YYYY-MM').
  let year; let month;
  if (opts.month && /^\d{4}-\d{1,2}$/.test(String(opts.month))) {
    const [y, m] = String(opts.month).split('-').map(Number);
    year = y; month = m - 1;
  } else {
    const d0 = parseLocalDate(list[0].date);
    year = d0.getFullYear(); month = d0.getMonth();
  }

  const byDate = new Map();
  list.forEach((d) => byDate.set(d.date, d));

  // Cuantiles de |pnl| sobre días traded con pnl != 0.
  const magnitudes = list.filter((d) => d.traded && d.pnl !== 0).map((d) => Math.abs(d.pnl)).sort((a, b) => a - b);
  function quantile(arr, q) {
    if (!arr.length) return 0;
    const pos = (arr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return arr[base + 1] !== undefined ? arr[base] + rest * (arr[base + 1] - arr[base]) : arr[base];
  }
  const q25 = quantile(magnitudes, 0.25);
  const q50 = quantile(magnitudes, 0.50);
  const q75 = quantile(magnitudes, 0.75);

  // Intensidad 1..4 según cuantil.
  function intensity(mag) {
    if (mag <= q25) return 1;
    if (mag <= q50) return 2;
    if (mag <= q75) return 3;
    return 4;
  }
  const POS_FILL = ['rgba(52,211,153,0.18)', 'rgba(52,211,153,0.35)', 'rgba(52,211,153,0.6)', 'rgba(52,211,153,0.92)'];
  const NEG_FILL = ['rgba(248,113,113,0.18)', 'rgba(248,113,113,0.35)', 'rgba(248,113,113,0.6)', 'rgba(248,113,113,0.92)'];

  // Layout calendario.
  const cols = 7;
  const firstDow = (parseLocalDate(`${year}-${String(month + 1).padStart(2, '0')}-01`).getDay() + 6) % 7; // lunes=0
  const dim = daysInMonth(year, month + 1);
  const totalCells = firstDow + dim;
  const rowsN = Math.ceil(totalCells / cols);

  const W = opts.width || 322;
  const headH = 18;
  const cell = Math.floor((W - 6) / cols);
  const gap = 3;
  const cellSize = cell - gap;
  const H = headH + rowsN * cell + 4;

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);

  // Cabecera de días (L M M J V S D).
  const dowLabels = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  for (let c = 0; c < cols; c++) {
    const x = 3 + c * cell + cellSize / 2;
    svg.appendChild(axisText(x, 9, dowLabels[c].charAt(0).toUpperCase(), { size: 10, fill: 'var(--text-tertiary)' }));
  }

  for (let day = 1; day <= dim; day++) {
    const cellIdx = firstDow + (day - 1);
    const col = cellIdx % cols;
    const row = Math.floor(cellIdx / cols);
    const x = 3 + col * cell;
    const y = headH + row * cell;
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rec = byDate.get(iso);

    let fill = 'var(--chart-bar-track)';
    let strokeC = 'transparent';
    if (rec) {
      if (!rec.traded) {
        fill = 'var(--bg-surface-3, #28282F)';
      } else if (rec.pnl === 0) {
        fill = 'var(--chart-bar-track)';
        strokeC = 'var(--text-tertiary)';
      } else {
        const lvl = intensity(Math.abs(rec.pnl));
        fill = rec.pnl > 0 ? POS_FILL[lvl - 1] : NEG_FILL[lvl - 1];
      }
    }

    const rect = el('rect', {
      x, y, width: cellSize, height: cellSize, rx: 4,
      fill, stroke: strokeC, 'stroke-width': strokeC === 'transparent' ? 0 : 1,
    });

    // Número de día tenue.
    const num = el('text', { x: x + 3, y: y + 10, 'text-anchor': 'start' });
    num.style.fontFamily = 'var(--font-mono)';
    num.style.fontSize = '8px';
    num.style.fill = 'var(--text-tertiary)';
    num.style.pointerEvents = 'none';
    num.style.opacity = '0.8';
    num.textContent = String(day);

    if (rec) {
      rect.style.cursor = 'pointer';
      const show = () => {
        rect.setAttribute('stroke', 'var(--gold)');
        rect.setAttribute('stroke-width', '1.5');
        let body;
        if (!rec.traded) body = 'Sin operar';
        else {
          const pnlStr = (opts.currency === 'COP' ? fmtCOP(rec.pnl) : fmtUSD(rec.pnl));
          body = `<b style="color:${rec.pnl >= 0 ? 'var(--chart-pos)' : 'var(--chart-neg)'}">${pnlStr}</b>`;
        }
        tip.show(`${formatDateEs(iso, { year: false })}<br>${body}`, ((x + cellSize / 2) / W) * 100, (y / H) * 100);
      };
      const hide = () => {
        rect.setAttribute('stroke', strokeC);
        rect.setAttribute('stroke-width', strokeC === 'transparent' ? 0 : 1);
        tip.hide();
      };
      rect.addEventListener('mouseenter', show);
      rect.addEventListener('mouseleave', hide);
      rect.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
      rect.addEventListener('touchend', hide);
    }

    svg.appendChild(rect);
    svg.appendChild(num);
  }

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 13. histogram(el, bins, opts)
//     Histograma de distribución + líneas media/mediana.
//     bins: [{binLabel,count,from,to}]. opts: { mean, median }.
//     Trading (distribución de P&L). Tooltip táctil.
// ===========================================================================
export function histogram(target, bins, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const data = (Array.isArray(bins) ? bins : []).map((b, i) => ({
    binLabel: b && b.binLabel != null ? String(b.binLabel) : `${i + 1}`,
    count: Math.max(0, toNum(b && b.count)),
    from: b && b.from != null ? toNum(b.from) : null,
    to: b && b.to != null ? toNum(b.to) : null,
  }));

  const W = opts.width || 340;
  const H = opts.height || 180;
  const padL = 6; const padR = 6; const padT = 14; const padB = 26;

  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return emptyState(container, opts.emptyText || 'Sin distribución disponible', { h: H, cssHeight: opts.cssHeight });
  }

  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const niceMax = niceCeil(maxCount);

  const x0 = padL; const x1 = W - padR;
  const y0 = padT; const y1 = H - padB;
  const sy = scaleLinear(0, niceMax, y1, y0);

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });
  const tip = makeTooltip(container);

  // Grid Y.
  for (let g = 0; g <= 3; g++) {
    const val = (niceMax / 3) * g;
    const gy = sy(val);
    svg.appendChild(gridLine(x0, x1, gy));
    const t = axisText(x0, gy - 3, String(Math.round(val)), { anchor: 'start', baseline: 'baseline', size: 9 });
    t.style.opacity = '0.6';
    svg.appendChild(t);
  }

  const n = data.length;
  const slot = (x1 - x0) / n;
  const bw = Math.max(2, slot * 0.82);

  // Determina color: bins con rango negativo → rojo, positivo → verde.
  function binColor(b) {
    if (b.from != null && b.to != null) {
      const mid = (b.from + b.to) / 2;
      return mid >= 0 ? 'var(--chart-pos)' : 'var(--chart-neg)';
    }
    return 'var(--chart-bar)';
  }

  data.forEach((b, i) => {
    const cx = x0 + slot * i + slot / 2;
    const h = Math.abs(sy(0) - sy(b.count));
    const y = sy(b.count);
    const color = binColor(b);
    const rect = el('rect', {
      x: cx - bw / 2, y, width: bw, height: Math.max(0.5, h),
      rx: 2, fill: color, 'fill-opacity': 0.78,
    });
    rect.style.cursor = 'pointer';
    const show = () => {
      rect.setAttribute('fill-opacity', '1');
      tip.show(`${b.binLabel}<br><b>${b.count}</b> ${b.count === 1 ? 'día' : 'días'}`, (cx / W) * 100, (y / H) * 100);
    };
    const hide = () => { rect.setAttribute('fill-opacity', '0.78'); tip.hide(); };
    rect.addEventListener('mouseenter', show);
    rect.addEventListener('mouseleave', hide);
    rect.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
    rect.addEventListener('touchend', hide);
    svg.appendChild(rect);
    animateGrow(rect, y1, y, Math.max(0.5, h), i * 25);

    // Etiqueta X (rota si hay muchas).
    if (n <= 9) {
      const t = axisText(cx, H - 14, truncate(b.binLabel, 7), { size: 8.5 });
      svg.appendChild(t);
    }
  });

  // Mapea un valor de dominio (pnl) a X usando from/to de los bins.
  function valueToX(val) {
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (b.from != null && b.to != null && val >= b.from && val <= b.to) {
        const frac = (b.to - b.from) === 0 ? 0.5 : (val - b.from) / (b.to - b.from);
        return x0 + slot * i + frac * slot;
      }
    }
    return null;
  }

  // Líneas media / mediana.
  [['mean', opts.mean, 'var(--gold)', 'media'], ['median', opts.median, 'var(--neutral, #5E9DF6)', 'mediana']].forEach(([, val, color, lab]) => {
    if (!Number.isFinite(val)) return;
    const mx = valueToX(val);
    if (mx == null) return;
    svg.appendChild(el('line', {
      x1: mx, x2: mx, y1: y0, y2: y1,
      stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
    }));
    const t = axisText(mx, H - 4, lab, { size: 9, fill: color });
    svg.appendChild(t);
  });

  container.appendChild(svg);
  return svg;
}

// ===========================================================================
// 14. monthCalendar(el, events, opts)
//     Grid mensual con puntos de color. events: [{date,dots:[color]}].
//     opts: { month:'YYYY-MM', onSelect(date), selected }. Eventos / date picker.
// ===========================================================================
export function monthCalendar(target, events, opts = {}) {
  const container = resolveContainer(target);
  if (!container) return;

  const evMap = new Map();
  (Array.isArray(events) ? events : []).forEach((e) => {
    if (!e || !e.date) return;
    const iso = String(e.date);
    if (!parseLocalDate(iso)) return;
    const dots = Array.isArray(e.dots) ? e.dots.slice(0, 4) : (e.color ? [e.color] : ['var(--gold)']);
    if (evMap.has(iso)) evMap.set(iso, evMap.get(iso).concat(dots).slice(0, 4));
    else evMap.set(iso, dots);
  });

  // Mes a mostrar.
  let year; let month;
  if (opts.month && /^\d{4}-\d{1,2}$/.test(String(opts.month))) {
    const [y, m] = String(opts.month).split('-').map(Number);
    year = y; month = m - 1;
  } else {
    const base = parseLocalDate(opts.refDate) || new Date();
    year = base.getFullYear(); month = base.getMonth();
  }

  const cols = 7;
  const firstDow = (parseLocalDate(`${year}-${String(month + 1).padStart(2, '0')}-01`).getDay() + 6) % 7; // lunes=0
  const dim = daysInMonth(year, month + 1);
  const totalCells = firstDow + dim;
  const rowsN = Math.ceil(totalCells / cols);

  const W = opts.width || 322;
  const headH = 20;
  const cell = Math.floor((W - 4) / cols);
  const H = headH + rowsN * cell + 6;
  const todayIso = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();
  const selected = opts.selected ? String(opts.selected) : null;

  const svg = createSvg(W, H, { cssHeight: opts.cssHeight });

  // Cabecera días de semana.
  const dowLabels = NOMBRES_DIA_ABBR ? ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] : [];
  for (let c = 0; c < cols; c++) {
    const x = 2 + c * cell + cell / 2;
    const t = axisText(x, 10, dowLabels[c], { size: 9.5, fill: 'var(--text-tertiary)' });
    svg.appendChild(t);
  }

  for (let day = 1; day <= dim; day++) {
    const cellIdx = firstDow + (day - 1);
    const col = cellIdx % cols;
    const row = Math.floor(cellIdx / cols);
    const x = 2 + col * cell;
    const y = headH + row * cell;
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = iso === todayIso;
    const isSelected = iso === selected;
    const dots = evMap.get(iso);

    const cellPad = 2;
    const cw = cell - cellPad * 2;

    // Fondo de celda (selección / hoy).
    if (isSelected) {
      svg.appendChild(el('rect', { x: x + cellPad, y: y + cellPad, width: cw, height: cw, rx: 8, fill: 'var(--gold-200)', stroke: 'var(--gold)', 'stroke-width': 1 }));
    } else if (isToday) {
      svg.appendChild(el('rect', { x: x + cellPad, y: y + cellPad, width: cw, height: cw, rx: 8, fill: 'var(--gold-100)', stroke: 'var(--gold-300)', 'stroke-width': 0.75 }));
    }

    // Número de día.
    const num = el('text', { x: x + cell / 2, y: y + cell / 2 - 4, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    num.style.fontFamily = 'var(--font-mono)';
    num.style.fontVariantNumeric = 'tabular-nums';
    num.style.fontSize = '12px';
    num.style.fill = (isToday || isSelected) ? 'var(--gold-soft)' : 'var(--text-secondary)';
    num.style.pointerEvents = 'none';
    num.textContent = String(day);
    svg.appendChild(num);

    // Puntos de eventos.
    if (dots && dots.length) {
      const dotR = 1.8;
      const dotGap = 5;
      const totalW = dots.length * dotGap - (dotGap - dotR * 2);
      let dxStart = x + cell / 2 - totalW / 2 + dotR;
      dots.forEach((c) => {
        svg.appendChild(el('circle', { cx: dxStart, cy: y + cell - 8, r: dotR, fill: c || 'var(--gold)' }));
        dxStart += dotGap;
      });
    }

    // Zona táctil/clic.
    if (typeof opts.onSelect === 'function') {
      const hit = el('rect', { x, y, width: cell, height: cell, fill: 'transparent' });
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => opts.onSelect(iso));
      svg.appendChild(hit);
    }
  }

  container.appendChild(svg);
  return svg;
}

// ---------------------------------------------------------------------------
// Export agrupado (conveniencia para imports namespace).
// ---------------------------------------------------------------------------
export default {
  sparkline,
  donut,
  lineArea,
  barsNet,
  groupedBars,
  progressBars,
  progressRing,
  mirrorBars,
  hbarsRanked,
  funnel,
  stackedBar,
  heatmapCal,
  histogram,
  monthCalendar,
};
