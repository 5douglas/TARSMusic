// Desktop (web) only: horizontal carousels (Home, Discover, artist pages...) scroll by
// dragging with the mouse and with ‹ › buttons shown at their edges on hover, as in the
// Spotify desktop app; Shift+wheel already scrolls them natively. Also gives the app thin,
// dark scrollbars instead of the light Windows default.
//
// The buttons live in document.body, outside React's tree, positioned over the carousel
// under the pointer, so no app component has to change.

const DRAG_THRESHOLD = 6;

function isHorizontalScroller(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.scrollWidth <= el.clientWidth + 4) return false;
  const style = getComputedStyle(el);
  return (style.overflowX === 'auto' || style.overflowX === 'scroll') && style.overflowY !== 'auto' && style.overflowY !== 'scroll';
}

function scrollerAt(target) {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (isHorizontalScroller(el)) return el;
  }
  return null;
}

function installScrollbarStyle() {
  const style = document.createElement('style');
  style.setAttribute('data-desktop', 'scrollbars');
  style.textContent = `
    /* Only ::-webkit-scrollbar rules: Chromium ignores them once scrollbar-color or
       scrollbar-width is set anywhere on the element. */
    ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
    ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
    ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
    ::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.12); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
    *:hover::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.28); }
    ::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.45) !important; }
    .tars-hscroll-btn {
      position: fixed; z-index: 2147483000; width: 36px; height: 36px; border-radius: 18px;
      border: none; background: rgba(18,18,18,0.88); color: #fff; font-size: 22px; line-height: 34px;
      text-align: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      display: none; padding: 0; font-family: system-ui, sans-serif; user-select: none;
    }
    .tars-hscroll-btn:hover { background: rgba(40,40,40,0.95); transform: scale(1.06); }
  `;
  document.head.appendChild(style);
}

function installButtons() {
  const make = (label, dir) => {
    const b = document.createElement('button');
    b.className = 'tars-hscroll-btn';
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', dir < 0 ? 'Voltar' : 'Avançar');
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!current) return;
      current.scrollBy({ left: dir * Math.max(200, current.clientWidth * 0.8), behavior: 'smooth' });
      setTimeout(place, 350);
    });
    document.body.appendChild(b);
    return b;
  };
  const left = make('‹', -1);
  const right = make('›', 1);
  let current = null;

  function hide() {
    left.style.display = 'none';
    right.style.display = 'none';
  }

  function place() {
    if (!current || !current.isConnected) {
      current = null;
      hide();
      return;
    }
    const r = current.getBoundingClientRect();
    if (r.width < 120 || r.height < 60) {
      hide();
      return;
    }
    const top = r.top + Math.min(r.height / 2, 110) - 18;
    const canLeft = current.scrollLeft > 2;
    const canRight = current.scrollLeft + current.clientWidth < current.scrollWidth - 2;
    left.style.top = right.style.top = `${top}px`;
    left.style.left = `${r.left + 8}px`;
    right.style.left = `${r.right - 44}px`;
    left.style.display = canLeft ? 'block' : 'none';
    right.style.display = canRight ? 'block' : 'none';
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      if (e.target === left || e.target === right) return;
      const found = scrollerAt(e.target);
      if (found !== current) current = found;
      place();
    },
    { passive: true },
  );
  document.addEventListener('scroll', place, { capture: true, passive: true });
  window.addEventListener('blur', hide);
  document.addEventListener('mouseleave', hide);
}

function installDrag() {
  let drag = null;
  let suppressClick = false;

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const el = scrollerAt(e.target);
    if (!el) return;
    drag = { el, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
  });

  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.style.cursor = 'grabbing';
      drag.el.style.userSelect = 'none';
    }
    drag.el.scrollLeft = drag.startLeft - dx;
    e.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.moved) {
      suppressClick = true;
      drag.el.style.cursor = '';
      drag.el.style.userSelect = '';
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
    drag = null;
  });

  // A drag must not also open the card it started on.
  document.addEventListener(
    'click',
    (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    },
    true,
  );
  // Images and links inside cards would start a native drag instead.
  document.addEventListener('dragstart', (e) => {
    if (scrollerAt(e.target)) e.preventDefault();
  });
}

if (typeof document !== 'undefined') {
  const start = () => {
    installScrollbarStyle();
    installButtons();
    installDrag();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}

module.exports = { isHorizontalScroller, scrollerAt };
