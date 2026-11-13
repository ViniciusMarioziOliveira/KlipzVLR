/* =====================================================================
   KlipzVLR · EASTER EGG 🤫
   Uma tela secreta de "seleção de agente" com os criadores do site.

   Como abrir:
     • Código Konami no teclado:  ↑ ↑ ↓ ↓ ← → ← → B A
     • Digitar "meupato" ou "dkt1" em qualquer lugar da página
     • Clicar 5x seguidas no logo (na página inicial)
     • Clicar 3x em "feito por 2 agentes" no rodapé
   ===================================================================== */
(function () {
  'use strict';

  const KZ = window.KZ || (window.KZ = {});

  const DEVS = {
    julio: {
      nick: 'meuPATO',
      name: 'Julio',
      img: 'img/julio.jpg',
      role: 'Duelista',
      abilities: [
        ['C', 'Quack Sônico', 'Revela os bugs inimigos num raio de 20 metros.'],
        ['Q', 'Patada', 'Empurra o deploy direto pra produção.'],
        ['E', 'Lagoa de Café', 'Recupera a energia a cada commit.'],
        ['X', 'Pato Contratado', 'Ultimate: assina com o time e carrega o projeto nas costas.'],
      ],
    },
    vini: {
      nick: 'dkT1',
      name: 'Vini',
      img: 'img/vini.jpg',
      role: 'Sentinela',
      abilities: [
        ['C', 'Óculos Táticos', 'Enxerga 1 pixel desalinhado no CSS a qualquer distância.'],
        ['Q', 'Debug Preciso', 'One tap no erro antes dele virar issue.'],
        ['E', 'Ctrl+Z Tático', 'Volta no tempo para antes do bug existir.'],
        ['X', 'Clutch no Prazo', 'Ultimate: entrega o projeto 1v5 às 23:59.'],
      ],
    },
  };

  const PICK_SECONDS = 30;
  let root = null;
  let isOpen = false;
  let selected = null;
  let locked = false;
  let timer = null;
  let secondsLeft = PICK_SECONDS;
  let opener = null;

  /* ── Montagem da tela ─────────────────────────────────────────── */
  const cardHtml = (key, d) => `
    <button class="egg-card" type="button" data-dev="${key}" aria-pressed="false">
      <span class="egg-card__shape">
        <span class="egg-card__inner">
          <span class="egg-card__img"><img src="${d.img}" alt="${d.name}, o ${d.nick}" draggable="false"></span>
          <span class="egg-card__body">
            <span class="egg-card__role">${d.role} · Criador</span>
            <strong class="egg-card__nick">${d.nick}</strong>
            <span class="egg-card__name">${d.name}</span>
            <span class="egg-card__abilities">
              ${d.abilities
                .map(([k, n, t]) => `<span class="ab"><kbd>${k}</kbd><span><b>${n}</b><small>${t}</small></span></span>`)
                .join('')}
            </span>
          </span>
        </span>
      </span>
      <span class="egg-card__lockmark" aria-hidden="true">Travado</span>
    </button>`;

  function build() {
    root = document.createElement('div');
    root.className = 'egg';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'egg-title');
    root.innerHTML = `
      <div class="egg__fx" aria-hidden="true"></div>
      <header class="egg__top">
        <span class="egg__mode">// Modo secreto desbloqueado</span>
        <h2 class="egg__title" id="egg-title">Escolha seu agente</h2>
        <div class="egg__timer" aria-hidden="true"><span data-egg-timer>${PICK_SECONDS}</span></div>
      </header>
      <div class="egg__cards">
        ${Object.keys(DEVS).map((k) => cardHtml(k, DEVS[k])).join('')}
      </div>
      <footer class="egg__bottom">
        <button class="egg__lock" type="button" data-egg-lock disabled>Travar</button>
        <button class="egg__exit" type="button" data-egg-close>Sair <kbd>Esc</kbd></button>
      </footer>
      <div class="egg__reveal" data-egg-reveal hidden></div>`;
    document.body.appendChild(root);

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-egg-close]')) return close();
      if (e.target.closest('[data-egg-again]')) return restart();
      if (e.target.closest('[data-egg-lock]')) return lock();
      const card = e.target.closest('.egg-card');
      if (card && !locked) select(card.dataset.dev);
    });
    root.addEventListener('dblclick', (e) => {
      if (e.target.closest('.egg-card') && !locked) lock();
    });
  }

  /* ── Fluxo: abrir → escolher → travar → créditos ──────────────── */
  function open(preselect) {
    if (isOpen) return;
    if (!root) build();
    isOpen = true;
    opener = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add('is-locked');
    restart(preselect);
  }

  function restart(preselect) {
    locked = false;
    selected = null;
    root.classList.remove('is-locked');
    root.querySelector('[data-egg-reveal]').hidden = true;
    root.querySelectorAll('.egg-card').forEach((c) => {
      c.classList.remove('is-selected', 'is-dim');
      c.setAttribute('aria-pressed', 'false');
    });
    root.querySelector('[data-egg-lock]').disabled = true;
    if (preselect && DEVS[preselect]) select(preselect);
    startTimer();
    const focusTarget = root.querySelector(preselect ? '[data-egg-lock]' : '.egg-card');
    if (focusTarget) focusTarget.focus();
  }

  function select(key) {
    selected = key;
    root.querySelectorAll('.egg-card').forEach((c) => {
      const on = c.dataset.dev === key;
      c.classList.toggle('is-selected', on);
      c.classList.toggle('is-dim', !on);
      c.setAttribute('aria-pressed', String(on));
    });
    root.querySelector('[data-egg-lock]').disabled = false;
  }

  function startTimer() {
    clearInterval(timer);
    secondsLeft = PICK_SECONDS;
    const el = root.querySelector('[data-egg-timer]');
    const paint = () => {
      el.textContent = String(secondsLeft);
      el.parentElement.classList.toggle('is-low', secondsLeft <= 5);
    };
    paint();
    timer = setInterval(() => {
      secondsLeft -= 1;
      paint();
      if (secondsLeft <= 0) {
        clearInterval(timer);
        if (!locked) {
          if (!selected) select(Math.random() < 0.5 ? 'julio' : 'vini');
          lock();
        }
      }
    }, 1000);
  }

  function lock() {
    if (!selected || locked) return;
    locked = true;
    clearInterval(timer);
    root.classList.add('is-locked');
    lockSound();
    burst();
    setTimeout(() => reveal(selected), KZ.prefersReducedMotion && KZ.prefersReducedMotion() ? 0 : 900);
  }

  function reveal(key) {
    const d = DEVS[key];
    const duo = DEVS[key === 'julio' ? 'vini' : 'julio'];
    const panel = root.querySelector('[data-egg-reveal]');
    panel.innerHTML = `
      <div class="egg-reveal">
        <div class="egg-reveal__card">
          <img src="${d.img}" alt="Card de ${d.name} (${d.nick}) contratado">
          <span class="egg-reveal__stamp">Agente travado</span>
        </div>
        <div class="egg-reveal__text">
          <span class="eyebrow">Créditos finais</span>
          <h3 class="egg-reveal__nick">${d.nick}</h3>
          <p>O <b>KlipzVLR</b> foi criado por <b>Julio "meuPATO"</b> e <b>Vini "dkT1"</b>.
          Dois agentes, um servidor e zero bugs (quase).</p>
          <div class="egg-reveal__duo">
            <span class="egg-reveal__duo-img"><img src="${duo.img}" alt=""></span>
            <span class="egg-reveal__duo-txt"><small>Duo de ${d.nick}</small><b>${duo.nick}</b></span>
          </div>
          <div class="egg-reveal__actions">
            <button class="vbtn" type="button" data-egg-close><span class="vbtn__in"><span>GG WP</span></span></button>
            <button class="vbtn vbtn--ghost" type="button" data-egg-again><span class="vbtn__in"><span>Escolher de novo</span></span></button>
          </div>
        </div>
      </div>`;
    panel.hidden = false;
    const gg = panel.querySelector('[data-egg-close]');
    if (gg) gg.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearInterval(timer);
    root.hidden = true;
    document.documentElement.classList.remove('is-locked');
    if (opener && opener.focus && document.contains(opener)) opener.focus();
  }

  /* ── Efeitos ──────────────────────────────────────────────────── */
  function burst() {
    const fx = document.createElement('div');
    fx.className = 'egg-burst';
    fx.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('i');
      s.style.setProperty('--a', `${Math.round((360 / 22) * i + Math.random() * 12)}deg`);
      s.style.setProperty('--d', `${120 + Math.round(Math.random() * 220)}px`);
      s.style.setProperty('--s', `${0.6 + Math.random() * 0.9}`);
      fx.appendChild(s);
    }
    root.appendChild(fx);
    setTimeout(() => fx.remove(), 1400);
  }

  // som curtinho de "lock in", gerado na hora (sem arquivo de áudio)
  function lockSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      [196, 294, 588].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 2 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.18);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.7);
      });
      setTimeout(() => ctx.close(), 900);
    } catch (_) {
      /* sem áudio, sem problema */
    }
  }

  /* ── Gatilhos ─────────────────────────────────────────────────── */
  const KONAMI = 'arrowup,arrowup,arrowdown,arrowdown,arrowleft,arrowright,arrowleft,arrowright,b,a';
  const keys = [];
  let typed = '';

  document.addEventListener('keydown', (e) => {
    if (isOpen) {
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') KZ.trapFocus(root, e);
      return;
    }
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    const k = String(e.key || '').toLowerCase();
    keys.push(k);
    if (keys.length > 10) keys.shift();
    if (keys.join(',') === KONAMI) {
      keys.length = 0;
      open();
      return;
    }
    if (k.length === 1) {
      typed = (typed + k).slice(-12);
      if (typed.endsWith('meupato')) {
        typed = '';
        open('julio');
      } else if (typed.endsWith('dkt1')) {
        typed = '';
        open('vini');
      }
    }
  });

  let logoClicks = [];
  let footerClicks = [];
  document.addEventListener('click', (e) => {
    const logo = e.target.closest('[data-egg-logo]');
    if (logo && document.body.dataset.page === 'home') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const now = Date.now();
      logoClicks = logoClicks.filter((t) => now - t < 2500);
      logoClicks.push(now);
      logo.classList.remove('is-glitch');
      void logo.offsetWidth; // reinicia a animação
      logo.classList.add('is-glitch');
      if (logoClicks.length >= 5) {
        logoClicks = [];
        open();
      }
      return;
    }

    const foot = e.target.closest('[data-egg-footer]');
    if (foot) {
      const now = Date.now();
      footerClicks = footerClicks.filter((t) => now - t < 2500);
      footerClicks.push(now);
      foot.classList.remove('is-glitch');
      void foot.offsetWidth;
      foot.classList.add('is-glitch');
      if (footerClicks.length >= 3) {
        footerClicks = [];
        open();
      }
    }
  });

  console.log('%cKLIPZVLR', 'font: 32px Anton, Impact, sans-serif; color: #ff4655; letter-spacing: 2px;');
  console.log('%cpsst, agente... ↑ ↑ ↓ ↓ ← → ← → B A', 'color: #ece8e1; background: #0f1923; padding: 4px 8px;');

  KZ.easterEgg = { open, close };
})();
