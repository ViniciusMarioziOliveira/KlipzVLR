/* =====================================================================
   KlipzVLR · cards de clipe, player (modal) e exclusão
   Usado pela home (index.html) e pelo perfil (perfil.html).
   ===================================================================== */
(function () {
  'use strict';

  const KZ = window.KZ;
  const { esc } = KZ;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const HOT = new Set(['ACE', 'CLUTCH']);

  // colunas buscadas + nick do autor (join com profiles)
  KZ.CLIP_FIELDS =
    'id, user_id, title, description, agent, map, highlight, video_path, thumb_path, duration, created_at, author:profiles(username)';

  KZ.authorOf = (clip) => (clip && clip.author && clip.author.username) || 'agente';

  const profileHref = (name) => `perfil.html?u=${encodeURIComponent(name)}`;
  const tagHtml = (h, extra) =>
    h ? `<span class="tag${HOT.has(h) ? ' tag--hot' : ''}${extra ? ` ${extra}` : ''}">${esc(h)}</span>` : '';

  /* ── Card ─────────────────────────────────────────────────────── */
  KZ.clipCard = (clip, opts) => {
    const canDelete = !!(opts && opts.canDelete);
    const author = KZ.authorOf(clip);
    const thumb = clip.thumb_path ? KZ.publicUrl(clip.thumb_path) : '';
    const dur = KZ.fmtDuration(clip.duration);
    const media = thumb
      ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async">`
      : `<span class="clip-card__ph" aria-hidden="true"><span>${esc(clip.agent || clip.map || 'KLIPZ')}</span></span>`;
    const chips = [clip.agent, clip.map]
      .filter(Boolean)
      .map((c) => `<span class="chip-sm">${esc(c)}</span>`)
      .join('');

    return `
      <article class="clip-card" data-clip-id="${esc(clip.id)}">
        <button class="clip-card__media" type="button" aria-label="Assistir: ${esc(clip.title)}">
          ${media}
          ${tagHtml(clip.highlight, 'clip-card__tag')}
          ${dur ? `<span class="clip-card__dur">${dur}</span>` : ''}
          <span class="clip-card__play" aria-hidden="true">${KZ.icons.play}</span>
        </button>
        <div class="clip-card__body">
          <h3 class="clip-card__title">${esc(clip.title)}</h3>
          <p class="clip-card__meta">
            <a href="${profileHref(author)}">@${esc(author)}</a>
            <span aria-hidden="true">·</span>
            <time datetime="${esc(clip.created_at)}">${esc(KZ.timeAgo(clip.created_at))}</time>
          </p>
          ${chips || canDelete ? `<div class="clip-card__foot"><div class="clip-card__chips">${chips}</div>${
            canDelete
              ? `<button class="clip-card__del" type="button" data-del aria-label="Apagar o clipe ${esc(clip.title)}">${KZ.icons.trash}<span>Apagar</span></button>`
              : ''
          }</div>` : ''}
        </div>
      </article>`;
  };

  KZ.skeletons = (n) =>
    Array.from(
      { length: n || 8 },
      () => `
      <div class="clip-card clip-card--skeleton" aria-hidden="true">
        <div class="clip-card__media"></div>
        <div class="clip-card__body"><span class="sk sk--title"></span><span class="sk sk--meta"></span></div>
      </div>`
    ).join('');

  KZ.emptyStateHtml = ({ title, text, action }) => `
    <div class="state state--empty">
      <span class="state__icon">${KZ.icons.crosshair}</span>
      <h3 class="state__title">${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${action || ''}
    </div>`;

  /* ── Exclusão (banco + arquivos do Storage) ───────────────────── */
  KZ.deleteClip = async (clip) => {
    const ok = await KZ.confirm({
      title: 'Apagar clipe?',
      text: `"${clip.title}" vai sumir pra sempre. Sem replay.`,
      confirmLabel: 'Apagar',
    });
    if (!ok) return false;

    const { data, error } = await KZ.sb.from('clips').delete().eq('id', clip.id).select('id');
    if (error) {
      KZ.toast(KZ.translateError(error), 'error');
      return false;
    }
    if (!data || !data.length) {
      KZ.toast('Você só pode apagar os seus próprios clipes.', 'error');
      return false;
    }
    const files = [clip.video_path, clip.thumb_path].filter(Boolean);
    const rm = await KZ.sb.storage.from(KZ.config.bucket).remove(files);
    if (rm.error) console.warn('[KlipzVLR] arquivos não removidos do Storage:', rm.error.message);
    KZ.toast('Clipe apagado.', 'ok');
    return true;
  };

  /* ── Player (modal) ───────────────────────────────────────────── */
  let modal = null;
  let current = null;
  let opener = null;
  let onDeleted = null;

  function setClipParam(id) {
    try {
      const url = new URL(location.href);
      if (id) url.searchParams.set('clip', id);
      else url.searchParams.delete('clip');
      history.replaceState(history.state, '', url);
    } catch (_) {
      /* file:// ou navegador antigo: ignora */
    }
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="clip-modal-title">
        <button class="modal__close" type="button" data-close aria-label="Fechar">${KZ.icons.close}</button>
        <div class="modal__stage">
          <video class="modal__video" controls playsinline preload="metadata"></video>
          <div class="modal__fail" hidden>
            <strong>Formato não suportado</strong>
            <p>Seu navegador não conseguiu reproduzir esse arquivo. Baixe para assistir no seu player.</p>
            <a class="vbtn vbtn--sm" data-fail-dl href="#" download><span class="vbtn__in">${KZ.icons.download}<span>Baixar clipe</span></span></a>
          </div>
        </div>
        <aside class="modal__info">
          <div class="modal__tags"></div>
          <h2 class="modal__title" id="clip-modal-title"></h2>
          <div class="modal__author"></div>
          <p class="modal__desc"></p>
          <dl class="modal__specs"></dl>
          <div class="modal__actions">
            <button class="vbtn vbtn--ghost vbtn--sm" type="button" data-copy><span class="vbtn__in">${KZ.icons.link}<span>Copiar link</span></span></button>
            <a class="vbtn vbtn--ghost vbtn--sm" data-dl href="#" download><span class="vbtn__in">${KZ.icons.download}<span>Baixar</span></span></a>
            <button class="vbtn vbtn--danger vbtn--sm" type="button" data-del hidden><span class="vbtn__in">${KZ.icons.trash}<span>Apagar</span></span></button>
          </div>
        </aside>
      </div>`;
    document.body.appendChild(modal);

    const video = modal.querySelector('video');
    video.addEventListener('error', () => {
      if (!video.getAttribute('src')) return;
      video.hidden = true;
      modal.querySelector('.modal__fail').hidden = false;
    });

    modal.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) return KZ.closeClip();
      if (e.target.closest('[data-copy]') && current) {
        const ok = await KZ.copy(KZ.pageUrl(`index.html?clip=${current.id}`));
        KZ.toast(ok ? 'Link copiado! Manda no grupo do time.' : 'Não deu pra copiar o link.', ok ? 'ok' : 'error');
      }
      if (e.target.closest('[data-del]') && current) {
        const clip = current;
        if (await KZ.deleteClip(clip)) {
          KZ.closeClip();
          if (onDeleted) onDeleted(clip);
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!modal || modal.hidden) return;
      if (e.key === 'Escape') KZ.closeClip();
      else KZ.trapFocus(modal, e);
    });
  }

  function fill(clip) {
    const author = KZ.authorOf(clip);
    const video = modal.querySelector('video');
    const fail = modal.querySelector('.modal__fail');
    fail.hidden = true;
    video.hidden = false;
    video.poster = clip.thumb_path ? KZ.publicUrl(clip.thumb_path) : '';
    video.src = KZ.publicUrl(clip.video_path);

    const ext = (String(clip.video_path).split('.').pop() || 'mp4').toLowerCase();
    const dl = KZ.publicUrl(clip.video_path, `${KZ.slug(clip.title) || 'clipe'}.${ext}`);
    modal.querySelector('[data-dl]').href = dl;
    modal.querySelector('[data-fail-dl]').href = dl;

    modal.querySelector('.modal__tags').innerHTML =
      tagHtml(clip.highlight) + `<span class="modal__ext">.${esc(ext)}</span>`;
    modal.querySelector('.modal__title').textContent = clip.title;
    modal.querySelector('.modal__author').innerHTML = `
      ${KZ.avatar(author)}
      <div>
        <a href="${profileHref(author)}">@${esc(author)}</a>
        <span><time datetime="${esc(clip.created_at)}">${esc(KZ.timeAgo(clip.created_at))}</time> · ${esc(KZ.fmtDate(clip.created_at))}</span>
      </div>`;

    const desc = modal.querySelector('.modal__desc');
    desc.textContent = clip.description || '';
    desc.hidden = !clip.description;

    const specs = [
      ['Agente', clip.agent],
      ['Mapa', clip.map],
      ['Duração', KZ.fmtDuration(clip.duration)],
    ].filter(([, v]) => v);
    const specsEl = modal.querySelector('.modal__specs');
    specsEl.innerHTML = specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    specsEl.hidden = !specs.length;

    const isOwner = !!(KZ.state.user && KZ.state.user.id === clip.user_id);
    modal.querySelector('[data-del]').hidden = !isOwner;
  }

  // abre o player com um objeto de clipe ou com o id (link compartilhado)
  KZ.openClip = async (clipOrId, opts) => {
    if (!KZ.sb) return;
    if (!modal) buildModal();
    let clip = clipOrId;
    if (typeof clipOrId === 'string') {
      if (!UUID_RE.test(clipOrId)) return;
      const { data, error } = await KZ.sb.from('clips').select(KZ.CLIP_FIELDS).eq('id', clipOrId).maybeSingle();
      if (error || !data) {
        KZ.toast(error ? KZ.translateError(error) : 'Esse clipe não existe mais.', 'error');
        setClipParam(null);
        return;
      }
      clip = data;
    }
    if (!clip) return;

    current = clip;
    onDeleted = (opts && opts.onDeleted) || null;
    if (modal.hidden) opener = document.activeElement;
    fill(clip);
    modal.hidden = false;
    document.documentElement.classList.add('is-locked');
    setClipParam(clip.id);
    modal.querySelector('.modal__close').focus();
    modal.querySelector('video').play().catch(() => {
      /* autoplay bloqueado: o usuário aperta play */
    });
  };

  KZ.closeClip = () => {
    if (!modal || modal.hidden) return;
    const video = modal.querySelector('video');
    video.pause();
    video.removeAttribute('src');
    video.load();
    modal.hidden = true;
    document.documentElement.classList.remove('is-locked');
    setClipParam(null);
    current = null;
    if (opener && opener.focus && document.contains(opener)) opener.focus();
  };

  /* ── Liga uma grade de cards ao player / exclusão ─────────────── */
  KZ.bindClipGrid = (grid, getClip, opts) => {
    const deleted = (opts && opts.onDeleted) || null;
    grid.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-clip-id]');
      if (!card || e.target.closest('a')) return;
      const clip = getClip(card.dataset.clipId);
      if (!clip) return;
      if (e.target.closest('[data-del]')) {
        if ((await KZ.deleteClip(clip)) && deleted) deleted(clip);
        return;
      }
      KZ.openClip(clip, { onDeleted: deleted });
    });
  };
})();
