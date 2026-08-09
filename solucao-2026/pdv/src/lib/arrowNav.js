// Navegação por setas ← → dentro de uma seção, imitando Tab / Shift+Tab.
//
// Caixa de supermercado trabalha com a mão no teclado numérico, onde as setas
// ficam à mão e o Tab não. As setas verticais já são do carrinho e das listas,
// então quem anda entre campos são as horizontais.
//
// A navegação é por SEÇÃO, não pela tela toda: a grade de produtos tem dezenas
// de botões, e uma seta que atravessasse todos eles seria inútil. Cada área
// navegável se marca com `data-nav-section`; fora delas a seta não faz nada e
// o comportamento nativo do navegador continua valendo.

export const SECTION_ATTR = 'data-nav-section';

/** Seção que contém o elemento, ou null se ele estiver fora de qualquer uma. */
export function sectionOf(el) {
  if (!el || typeof el.closest !== 'function') return null;
  return el.closest(`[${SECTION_ATTR}]`);
}

const FOCUSABLE = [
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'button',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elementos navegáveis do container, na ordem visual, só os utilizáveis. */
export function focusablesIn(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    if (el.tabIndex === -1) return false;
    // offsetParent nulo cobre display:none e ancestral escondido
    return el.offsetParent !== null;
  });
}

const TEXTUAL = new Set(['text', 'search', 'tel', 'url', 'email', 'password', 'number']);

function isTextField(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXTUAL.has(el.type);
}

/**
 * A seta só rouba o campo de texto quando não há para onde levar o cursor:
 * ← na primeira posição, → na última. No meio de um texto a seta continua
 * sendo do texto, que é o que qualquer pessoa espera.
 *
 * `type="number"` não expõe selectionStart no Chrome; nesses campos vale o
 * conteúdo vazio como sinal de que não há cursor a mover.
 */
export function arrowShouldNavigate(el, direction) {
  if (!isTextField(el)) return true;

  const value = el.value ?? '';
  if (value === '') return true;

  let caret = null;
  try {
    caret = el.selectionStart;
  } catch {
    caret = null; // input number no Chrome
  }
  if (caret === null) return false;

  // Com trecho selecionado, a seta colapsa a seleção — deixa passar
  if (el.selectionEnd !== caret) return false;

  return direction < 0 ? caret === 0 : caret === value.length;
}

/**
 * Move o foco `direction` posições dentro do container. Sem envolver as
 * pontas: no fim da seção a seta para, em vez de saltar para o começo — o
 * operador percebe a borda pelo tato, e o salto seria desorientador.
 * Devolve true se moveu.
 */
export function moveFocus(container, direction) {
  const items = focusablesIn(container);
  if (items.length === 0) return false;

  const current = items.indexOf(document.activeElement);
  const next = current === -1
    ? (direction < 0 ? items.length - 1 : 0)
    : current + direction;

  if (next < 0 || next >= items.length) return false;

  const el = items[next];
  el.focus();
  if (isTextField(el) && typeof el.select === 'function') {
    try { el.select(); } catch { /* number nem sempre deixa */ }
  }
  return true;
}
