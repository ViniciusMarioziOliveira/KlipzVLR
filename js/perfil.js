/* =====================================================================
   KlipzVLR · perfil
   perfil.html          → o seu perfil (precisa estar logado)
   perfil.html?u=nick   → perfil público de qualquer jogador
   ===================================================================== */
(function () {
  'use strict';

  const KZ = window.KZ;
  const { $, esc } = KZ;

  const head = $('#profile-head');
  const statsEl = $('#stats');
  const grid = $('#clip-grid');
  const clipsTitle = $('#clips-title');
  const postBtn = $('#profile-post');
  const bgWord = $('#profile-bg-word');

  const cache = new Map();
  let profile = null;
  let isOwner = false;

  function mostCommon(list) {
    const counts = new Map();
    list.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    let best = null;
    let max = 0;
    counts.forEach((n, v) => {
      if (n > max) {
        best = v;
        max = n;
      }
    });
    return best;
  }

  function renderStats() {
    const clips = Array.from(cache.values());
    const stats = [
      ['Clipes', String(clips.length).padStart(2, '0')],
      ['Agente favorito', mostCommon(clips.map((c) => c.agent)) || '-'],
      ['Mapa favorito', mostCommon(clips.map((c) => c.map)) || '-'],
      ['Jogada mais comum', mostCommon(clips.map((c) => c.highlight)) || '-'],
    ];
    statsEl.innerHTML = stats
      .map(([label, value]) => `<div class="stat"><span class="stat__label">${label}</span><strong class="stat__value">${esc(value)}</strong></div>`)
      .join('');
  }

  function emptyHtml() {
    return isOwner
      ? KZ.emptyStateHtml({
          title: 'Seu arsenal está vazio',
          text: 'Posta aquele clutch que só você viu. A comunidade quer ver.',
          action: '<a class="vbtn vbtn--dark" href="postar.html"><span class="vbtn__in"><span>Postar meu primeiro clipe</span></span></a>',
        })
      : KZ.emptyStateHtml({ title: 'Nenhum clipe ainda', text: `${profile.username} ainda não postou nenhuma jogada.` });
  }

  function renderHead() {
    const name = profile.username;
    document.title = `${name} · KlipzVLR`;
    bgWord.textContent = name;
    head.innerHTML = `
      ${KZ.avatar(name, 'xl')}
      <div class="profile-head__text">
        <span class="eyebrow">${isOwner ? 'Seu perfil' : 'Perfil do agente'}</span>
        <h1 class="profile-head__name">${esc(name)}</h1>
        <p class="profile-head__since">No servidor desde ${esc(KZ.fmtDate(profile.created_at, { month: 'long', year: 'numeric' }))}</p>
      </div>
      <div class="profile-head__actions">
        <button class="vbtn vbtn--ghost vbtn--sm" type="button" data-share><span class="vbtn__in">${KZ.icons.link}<span>Copiar link</span></span></button>
        ${isOwner ? `<button class="vbtn vbtn--ghost vbtn--sm" type="button" data-logout-profile><span class="vbtn__in">${KZ.icons.logout}<span>Sair</span></span></button>` : ''}
      </div>`;
    clipsTitle.textContent = isOwner ? 'Meus clipes' : `Clipes de ${name}`;
    postBtn.hidden = !isOwner;
  }

  head.addEventListener('click', async (e) => {
    if (e.target.closest('[data-share]') && profile) {
      const ok = await KZ.copy(KZ.pageUrl(`perfil.html?u=${encodeURIComponent(profile.username)}`));
      KZ.toast(ok ? 'Link do perfil copiado!' : 'Não deu pra copiar o link.', ok ? 'ok' : 'error');
    }
    if (e.target.closest('[data-logout-profile]')) KZ.signOut();
  });

  function onDeleted(clip) {
    cache.delete(clip.id);
    const card = grid.querySelector(`[data-clip-id="${CSS.escape(clip.id)}"]`);
    if (card) card.remove();
    renderStats();
    if (!cache.size) grid.innerHTML = emptyHtml();
  }

  KZ.bindClipGrid(grid, (id) => cache.get(id), { onDeleted });

  function notFound(nick) {
    document.title = 'Agente não encontrado · KlipzVLR';
    bgWord.textContent = '404';
    head.innerHTML = `
      <div class="profile-head__text">
        <span class="eyebrow">Erro 404</span>
        <h1 class="profile-head__name profile-head__name--caps">Agente não encontrado</h1>
        <p class="profile-head__since">Ninguém com o nick "${esc(nick)}" por aqui.</p>
      </div>`;
    statsEl.hidden = true;
    clipsTitle.textContent = 'Nada pra ver';
    grid.innerHTML = KZ.emptyStateHtml({
      title: 'Esse jogador deu dodge',
      text: 'Confira o nick ou volte para o feed.',
      action: '<a class="vbtn vbtn--dark" href="index.html#clipes"><span class="vbtn__in"><span>Ver clipes</span></span></a>',
    });
  }

  KZ.ready.then(async (st) => {
    if (!KZ.sb) {
      head.innerHTML = '';
      statsEl.hidden = true;
      grid.innerHTML = KZ.setupStateHtml();
      return;
    }

    const nick = (KZ.param('u') || '').trim();
    if (nick) {
      const { data, error } = await KZ.sb
        .from('profiles')
        .select('id, username, created_at')
        .ilike('username', nick.replace(/[\\%_]/g, '\\$&'))
        .maybeSingle();
      if (error) {
        grid.innerHTML = KZ.errorStateHtml(error);
        return;
      }
      profile = data;
    } else {
      const auth = await KZ.requireAuth();
      if (!auth) return;
      profile = auth.profile;
    }

    if (!profile) return notFound(nick);
    isOwner = !!(st.user && st.user.id === profile.id);
    renderHead();
    grid.innerHTML = KZ.skeletons(4);

    const { data: clips, error } = await KZ.sb
      .from('clips')
      .select(KZ.CLIP_FIELDS)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      grid.innerHTML = KZ.errorStateHtml(error);
      return;
    }

    clips.forEach((clip) => cache.set(clip.id, clip));
    renderStats();
    grid.innerHTML = clips.length ? clips.map((clip) => KZ.clipCard(clip, { canDelete: isOwner })).join('') : emptyHtml();

    const shared = KZ.param('clip');
    if (shared) KZ.openClip(cache.get(shared) || shared, { onDeleted });
  });
})();
