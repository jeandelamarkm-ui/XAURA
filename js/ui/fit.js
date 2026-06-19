// ============================================================================
// XAURA · js/ui/fit.js
// Auto-ajuste de cifras: reduce el tamaño de fuente de los valores numéricos
// (KPI, mini-stats, hero) hasta que quepan en su tarjeta SIN partirse en dos
// líneas. Funciona en cualquier ancho (3-up, 2-up, móvil estrecho) y es pura
// medición del DOM, sin depender de breakpoints frágiles.
//
// Se invoca automáticamente desde app.js mediante un MutationObserver sobre
// #view (ver setupAutoFit). El observer NO escucha cambios de atributos, así
// que los ajustes de font-size que hacemos aquí jamás se realimentan.
// ============================================================================

// Elementos cuyo contenido es una cifra que no debe partirse en dos líneas.
// Genérico por convención BEM (*__value) para cubrir kpi__value, ministat__value,
// stat-card__value y cualquier tarjeta futura, más un opt-in explícito [data-fit].
const SELECTOR = '[class*="__value"], [data-fit]';

// Piso de tamaño por tipo de elemento (px). Evita cifras ilegibles.
function floorFor(el) {
  if (el.classList.contains('kpi__value--lg')) return 17;
  return 11;
}

// Ajusta un solo elemento.
function fitOne(el) {
  if (!el || !el.isConnected) return;
  // El fitter es autosuficiente: fuerza una sola línea para poder MEDIR el
  // desbordamiento horizontal aunque el CSS de la clase no lo declare.
  // overflow 'visible' a propósito: JAMÁS recortar dígitos.
  // (El MutationObserver ignora 'attributes', así que esto no se realimenta.)
  el.style.whiteSpace = 'nowrap';
  el.style.overflow = 'visible';
  el.style.maxWidth = '100%';
  // Reinicia al tamaño natural definido por CSS para volver a medir desde cero
  // (permite re-crecer si ahora hay más espacio, p.ej. al girar el dispositivo).
  el.style.fontSize = '';
  // Si no desborda, no tocamos nada.
  if (el.scrollWidth <= el.clientWidth + 1) return;

  const cs = getComputedStyle(el);
  let size = parseFloat(cs.fontSize) || 20;
  const min = floorFor(el);

  // Reduce de a poco hasta que quepa o lleguemos al piso.
  let guard = 0;
  while (el.scrollWidth > el.clientWidth + 1 && size > min && guard < 60) {
    size -= 0.5;
    el.style.fontSize = size + 'px';
    guard++;
  }

  // Si ni en el piso cabe en una línea (cifras dobles muy largas), permite
  // envolver a dos líneas: mejor eso que perder un dígito.
  if (el.scrollWidth > el.clientWidth + 1) {
    el.style.whiteSpace = 'normal';
  }
}

// Ajusta todos los valores dentro de un contenedor (por defecto, el documento).
export function fitAll(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const nodes = scope.querySelectorAll(SELECTOR);
  for (const el of nodes) fitOne(el);
}

// Programa un ajuste en el próximo frame (coalesciendo múltiples llamadas).
let _scheduled = false;
export function scheduleFit(root) {
  if (_scheduled) return;
  _scheduled = true;
  const run = () => {
    _scheduled = false;
    fitAll(root || document.getElementById('view') || document);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

// Conecta el ajuste automático a #view: cada vez que cambia su contenido
// (render de vista, cambio de pestaña, count-up de cifras) re-ajusta. También
// re-ajusta al redimensionar la ventana y cuando terminan de cargar las fuentes.
let _observer = null;
export function setupAutoFit(viewEl) {
  const target = viewEl || document.getElementById('view');
  if (!target) return;

  if (_observer) _observer.disconnect();
  _observer = new MutationObserver(() => scheduleFit(target));
  // OJO: sin 'attributes' -> nuestros cambios de style.fontSize no se realimentan.
  _observer.observe(target, { childList: true, subtree: true, characterData: true });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => fitAll(target));
  });
  window.addEventListener('orientationchange', () => scheduleFit(target));

  // Re-ajuste tras cargar fuentes web (cambian las métricas de las cifras).
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => fitAll(target)).catch(() => {});
  }

  // Primer ajuste.
  scheduleFit(target);
}
