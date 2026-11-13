/* =====================================================================
   KlipzVLR · página inicial (hero, kill feed e feed de clipes)
   ===================================================================== */
(function () {
  'use strict';

  const KZ = window.KZ;
  const { $, esc } = KZ;
  const PAGE_SIZE = 12;

  const grid = $('#clip-grid');
  const moreBtn = $('#load-more');
  const countEl = $('#feed-count');
  const kf = $('#killfeed');
  const form = $('#filters');
  const fSearch = $('#f-search');
  const fAgent = $('#f-agent');
  const fMap = $('#f-map');
  const fType = $('#f-type');

  KZ.fillSelect(fAgent, KZ.AGENTS, 'Todos os agentes');
  KZ.fillSelect(fMap, KZ.MAPS, 'Todos os mapas');
  KZ.fillSelect(fType, KZ.HIGHLIGHTS, 'Todas as jogadas');

  // filtros podem vir da URL: ?agente=Jett&mapa=Ascent&tipo=ACE&q=texto
  const setIfValid = (select, value) => {
    if (value && Array.from(select.options).some((o) => o.value === value)) select.value = value;
  };
  fSearch.value = KZ.param('q') || '';
  setIfValid(fAgent, KZ.param('agente'));
  setIfValid(fMap, KZ.param('mapa'));
  setIfValid(fType, KZ.param('tipo'));

  const cache = new Map();
  const kfCache = new Map();
  let page = 0;
  let requestId = 0;

  const filters = () => ({
    q: fSearch.value.trim(),
    agent: fAgent.value,
    map: fMap.value,
    type: fType.value,
  });
  const hasFilters = () => Object.values(filters()).some(Boolean);

  function syncUrl() {
    const f = filters();
    try {
      const url = new URL(location.href);
      const set = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
      set('q', f.q);
      set('agente', f.agent);
      set('mapa', f.map);
      set('tipo', f.type);
      history.replaceState(history.state, '', url);
    } catch (_) {
      /* ignora */
    }
  }

  function removeCard(id) {
    cache.delete(id);
    const card = grid.querySelector(`[data-clip-id="${CSS.escape(id)}"]`);
    if (card) card.remove();
    if (!grid.querySelector('.clip-card')) load(true);
    loadStats();
    loadKillfeed();
  }

  KZ.bindClipGrid(grid, (id) => cache.get(id), { onDeleted: (clip) => removeCard(clip.id) });

  /* ── Feed ─────────────────────────────────────────────────────── */
  function buildQuery() {
    const f = filters();
    let q = KZ.sb
      .from('clips')
      .select(KZ.CLIP_FIELDS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (f.agent) q = q.eq('agent', f.agent);
    if (f.map) q = q.eq('map', f.map);
    if (f.type) q = q.eq('highlight', f.type);
    if (f.q) q = q.ilike('title', `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
    return q;
  }

  async function load(reset) {
    if (!KZ.sb) return;
    const id = ++requestId;
    if (reset) {
      page = 0;
      cache.clear();
      grid.innerHTML = KZ.skeletons(8);
      grid.setAttribute('aria-busy', 'true');
      moreBtn.hidden = true;
    } else {
      moreBtn.disabled = true;
    }

    const { data, error, count } = await buildQuery();
    if (id !== requestId) return; // chegou uma resposta mais nova
    grid.removeAttribute('aria-busy');
    moreBtn.disabled = false;

    if (error) {
      if (reset) grid.innerHTML = KZ.errorStateHtml(error);
      else KZ.toast(KZ.translateError(error), 'error');
      return;
    }

    if (reset) grid.innerHTML = '';
    data.forEach((clip) => cache.set(clip.id, clip));
    grid.insertAdjacentHTML('beforeend', data.map((clip) => KZ.clipCard(clip)).join(''));

    if (reset && !data.length) {
      grid.innerHTML = hasFilters()
        ? KZ.emptyStateHtml({
            title: 'Nenhum clipe com esses filtros',
            text: 'Tenta outro agente, outro mapa ou limpa a busca.',
          })
        : KZ.emptyStateHtml({
            title: 'O servidor tá vazio... por enquanto',
            text: 'Ninguém postou ainda. Seja o primeiro a dar o ace na comunidade.',
            action: '<a class="vbtn vbtn--dark" href="postar.html"><span class="vbtn__in"><span>Postar o primeiro clipe</span></span></a>',
          });
    }

    const total = typeof count === 'number' ? count : cache.size;
    countEl.textContent = `${total} ${total === 1 ? 'clipe' : 'clipes'}`;
    moreBtn.hidden = cache.size >= total || data.length < PAGE_SIZE;
    page += 1;
  }

  const reload = () => {
    syncUrl();
    load(true);
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  fSearch.addEventListener('input', KZ.debounce(reload, 350));
  [fAgent, fMap, fType].forEach((s) => s.addEventListener('change', reload));
  form.addEventListener('reset', () => setTimeout(reload, 0));
  moreBtn.addEventListener('click', () => load(false));

  /* ── HUD do hero: placar + kill feed ──────────────────────────── */
  function countUp(el, to) {
    if (!el) return;
    const pad = (n) => String(n).padStart(2, '0');
    if (KZ.prefersReducedMotion() || to <= 0) {
      el.textContent = pad(to);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 900);
      el.textContent = pad(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function loadStats() {
    const [clips, players] = await Promise.all([
      KZ.sb.from('clips').select('id', { count: 'exact', head: true }),
      KZ.sb.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    countUp($('[data-stat="clips"]'), clips.count || 0);
    countUp($('[data-stat="players"]'), players.count || 0);
  }

  const KF_GHOSTS = [
    ['Você', 'ACE', 'Seu clipe pode estar aqui'],
    ['???', 'CLUTCH', 'Esperando o primeiro clutch'],
    ['Agente', 'ONE TAP', 'O servidor tá vazio... por enquanto'],
    ['Você', 'FLICK', 'Posta logo esse replay'],
  ];

  function kfPlaceholder() {
    kf.innerHTML = KF_GHOSTS.map(
      ([who, what, title], i) => `
      <div class="kf-row is-ghost${i % 2 ? ' kf-row--enemy' : ''}" style="--i:${i}">
        <span class="kf-row__who">${who}</span>${KZ.icons.gun}<span class="kf-row__what">${what}</span>
        <span class="kf-row__title">${title}</span>
      </div>`
    ).join('');
  }

  async function loadKillfeed() {
    const { data, error } = await KZ.sb
      .from('clips')
      .select(KZ.CLIP_FIELDS)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error || !data || !data.length) return kfPlaceholder();
    kfCache.clear();
    data.forEach((clip) => kfCache.set(clip.id, clip));
    kf.innerHTML = data
      .map(
        (clip, i) => `
      <button type="button" class="kf-row${i % 2 ? ' kf-row--enemy' : ''}" style="--i:${i}" data-clip-id="${esc(clip.id)}">
        <span class="kf-row__who">${esc(KZ.authorOf(clip))}</span>${KZ.icons.gun}<span class="kf-row__what">${esc(
          clip.highlight || clip.agent || 'Clipe'
        )}</span>
        <span class="kf-row__title">${esc(clip.title)}</span>
      </button>`
      )
      .join('');
  }

  kf.addEventListener('click', (e) => {
    const row = e.target.closest('[data-clip-id]');
    if (row && kfCache.has(row.dataset.clipId)) {
      KZ.openClip(kfCache.get(row.dataset.clipId), { onDeleted: (clip) => removeCard(clip.id) });
    }
  });

  // cronômetro decorativo do placar (1:40, igual início de rodada)
  (function hudTimer() {
    const el = $('#hud-timer');
    if (!el || KZ.prefersReducedMotion()) return;
    let t = 100;
    setInterval(() => {
      t = t <= 0 ? 100 : t - 1;
      el.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      el.classList.toggle('is-low', t <= 10);
    }, 1000);
  })();

  /* ── Início ───────────────────────────────────────────────────── */
  KZ.ready.then(() => {
    if (!KZ.sb) {
      grid.innerHTML = KZ.setupStateHtml();
      kfPlaceholder();
      countEl.textContent = '';
      return;
    }
    kfPlaceholder();
    loadStats();
    loadKillfeed();
    load(true);
    const shared = KZ.param('clip');
    if (shared) KZ.openClip(shared, { onDeleted: (clip) => removeCard(clip.id) });
  });
})();
