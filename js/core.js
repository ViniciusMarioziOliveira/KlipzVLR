/* =====================================================================
   KlipzVLR · núcleo compartilhado
   Cliente Supabase, sessão do usuário, header/rodapé, toasts e utilidades.
   Todas as páginas carregam este arquivo antes do script da própria página.
   ===================================================================== */
(function () {
  'use strict';

  const KZ = (window.KZ = window.KZ || {});
  const raw = window.KLIPZ_CONFIG || {};

  /* ── Configuração ─────────────────────────────────────────────── */
  KZ.config = {
    // aceita a URL copiada com /rest/v1 no final (a lib já adiciona isso sozinha)
    url: String(raw.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, ''),
    key: String(raw.SUPABASE_KEY || '').trim(),
    bucket: String(raw.BUCKET || 'clips'),
    maxUploadMB: Number(raw.MAX_UPLOAD_MB) || 50,
  };

  KZ.isConfigured =
    /^https?:\/\/\S+$/i.test(KZ.config.url) &&
    !/SEU-PROJETO/i.test(KZ.config.url) &&
    KZ.config.key.length > 20 &&
    !/COLE_AQUI/i.test(KZ.config.key);

  KZ.libLoaded = !!(window.supabase && typeof window.supabase.createClient === 'function');

  KZ.sb = null;
  if (KZ.isConfigured && KZ.libLoaded) {
    try {
      KZ.sb = window.supabase.createClient(KZ.config.url, KZ.config.key);
    } catch (err) {
      console.error('[KlipzVLR] Não foi possível criar o cliente Supabase:', err);
    }
  }

  /* ── Dados do jogo (atualize quando sair agente ou mapa novo) ──── */
  KZ.AGENTS = {
    Duelistas: ['Hush', 'Iso', 'Jett', 'Neon', 'Phoenix', 'Raze', 'Reyna', 'Waylay', 'Yoru'],
    Iniciadores: ['Breach', 'Fade', 'Gekko', 'KAY/O', 'Skye', 'Sova', 'Tejo'],
    Controladores: ['Astra', 'Brimstone', 'Clove', 'Harbor', 'Miks', 'Omen', 'Viper'],
    Sentinelas: ['Chamber', 'Cypher', 'Deadlock', 'Killjoy', 'Sage', 'Veto', 'Vyse'],
  };

  KZ.MAPS = {
    Mapas: ['Abyss', 'Ascent', 'Bind', 'Breeze', 'Corrode', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Summit', 'Sunset'],
    'Outros modos': ['Mata-mata', 'Campo de treino', 'Outro'],
  };

  KZ.HIGHLIGHTS = ['ACE', 'CLUTCH', 'MULTI-KILL', 'ONE TAP', 'FLICK', 'WALLBANG', 'THRIFTY', 'JOGADA', 'ENGRAÇADO'];

  // extensão → tipo MIME enviado ao Storage (o bucket só aceita estes)
  KZ.VIDEO_TYPES = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    ogv: 'video/ogg',
  };

  /* ── Utilidades ───────────────────────────────────────────────── */
  KZ.$ = (sel, root) => (root || document).querySelector(sel);
  KZ.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  KZ.esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);

  KZ.param = (name) => new URLSearchParams(location.search).get(name);

  KZ.debounce = (fn, ms) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  KZ.prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  KZ.fmtDuration = (sec) => {
    const s = Math.round(Number(sec));
    if (!Number.isFinite(s) || s <= 0) return '';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  KZ.fmtBytes = (bytes) => {
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  KZ.fmtDate = (iso, opts) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', opts || { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const RTF = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }) : null;
  const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  KZ.timeAgo = (iso) => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = (t - Date.now()) / 1000;
    for (const [unit, secs] of UNITS) {
      if (Math.abs(diff) >= secs) return RTF ? RTF.format(Math.round(diff / secs), unit) : KZ.fmtDate(iso);
    }
    return 'agora mesmo';
  };

  KZ.uuid = () => {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  KZ.slug = (text) =>
    String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);

  const AV_COLORS = ['#ff4655', '#3fe0b8', '#f5c451', '#9d7bff', '#4ca3ff', '#ff8a3d'];
  KZ.colorFor = (name) => {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  };

  KZ.avatar = (name, size) =>
    `<span class="avatar${size ? ` avatar--${size}` : ''}" style="--av:${KZ.colorFor(name)}" aria-hidden="true"><span>${KZ.esc(
      String(name || '?').charAt(0).toUpperCase()
    )}</span></span>`;

  KZ.publicUrl = (path, downloadName) => {
    if (!KZ.sb || !path) return '';
    const opts = downloadName ? { download: downloadName } : undefined;
    return KZ.sb.storage.from(KZ.config.bucket).getPublicUrl(path, opts).data.publicUrl;
  };

  KZ.pageUrl = (relative) => new URL(relative, location.href).href;

  // preenche um <select> a partir de uma lista ou de grupos { 'Grupo': [...] }
  KZ.fillSelect = (select, source, placeholder) => {
    const opt = (v) => `<option value="${KZ.esc(v)}">${KZ.esc(v)}</option>`;
    let html = `<option value="">${KZ.esc(placeholder)}</option>`;
    if (Array.isArray(source)) html += source.map(opt).join('');
    else
      for (const [label, items] of Object.entries(source))
        html += `<optgroup label="${KZ.esc(label)}">${items.map(opt).join('')}</optgroup>`;
    select.innerHTML = html;
  };

  KZ.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (__) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  };

  // mantém o foco do teclado dentro de um modal
  KZ.trapFocus = (container, event) => {
    if (event.key !== 'Tab') return;
    const focusables = KZ.$$(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
      container
    ).filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ── Ícones (SVG inline) ──────────────────────────────────────── */
  const svg = (body, viewBox, cls) =>
    `<svg class="${cls || 'icon'}" viewBox="${viewBox || '0 0 24 24'}" aria-hidden="true" focusable="false">${body}</svg>`;
  const line = (d) =>
    svg(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>`);

  KZ.icons = {
    logo: svg(
      '<path d="M10 6h8v36H6V10z" fill="currentColor"/><path d="M21 24 38 6h9L30 24l17 18h-9z" fill="#ff4655"/>',
      '0 0 48 48',
      'brand__mark'
    ),
    play: svg('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
    close: line('M5 5l14 14M19 5L5 19'),
    trash: line('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'),
    link: line('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'),
    download: line('M12 4v11M7 10l5 5 5-5M4 20h16'),
    upload: line('M12 16V5M7 10l5-5 5 5M4 20h16'),
    search: line('M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16 16l5 5'),
    eye: line('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'),
    arrow: line('M4 12h15M13 6l6 6-6 6'),
    plug: line('M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4'),
    logout: line('M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10'),
    crosshair: svg(
      '<path d="M24 4v13M24 31v13M4 24h13M31 24h13" fill="none" stroke="currentColor" stroke-width="2"/><rect x="22" y="22" width="4" height="4" fill="currentColor"/>',
      '0 0 48 48',
      'icon icon--cross'
    ),
    gun: svg(
      '<path d="M1 9 12 7h32v1h19v2H44v2h-8l1 7h-6l-1-7h-3l-1 6h-5l1-6h-8L1 15z" fill="currentColor"/>',
      '0 0 64 20',
      'kf-gun'
    ),
    spike: svg(
      '<path d="M32 3 59 18.5v43L32 77 5 61.5v-43z" fill="none" stroke="currentColor" stroke-width="3"/>' +
        '<path d="M32 14 50 24.5v31L32 66 14 55.5v-31z" fill="currentColor" opacity=".18"/>' +
        '<path d="M29 22h6v36h-6z" fill="currentColor"/>' +
        '<path d="M20 30h4v20h-4zM40 30h4v20h-4z" fill="currentColor" opacity=".55"/>',
      '0 0 64 80',
      'spike'
    ),
  };

  /* ── Mensagens de erro em português ───────────────────────────── */
  const ERRORS = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/email not confirmed/i, 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).'],
    [/user already registered|already been registered|email_exists|user_already_exists/i, 'Esse e-mail já tem conta. Tente entrar.'],
    [/password should be at least|weak_password|weak password/i, 'Senha fraca: use pelo menos 8 caracteres misturando letras e números.'],
    [/database error saving new user/i, 'Não deu pra criar seu perfil. Tente outro nick.'],
    [/signups? not allowed|signup.*disabled/i, 'O cadastro de novos usuários está desativado no Supabase.'],
    [/over_email_send_rate_limit|email rate limit/i, 'Limite de e-mails do Supabase atingido. Desative "Confirm email" no painel (veja o README).'],
    [/rate limit|too many requests/i, 'Muitas tentativas seguidas. Espere um pouco e tente de novo.'],
    [/unable to validate email|invalid format|email address .* is invalid|email_address_invalid/i, 'Esse e-mail não parece válido.'],
    [/exceeded the maximum allowed size|payload too large|entity too large/i, 'O arquivo passou do limite de tamanho do servidor.'],
    [/mime type|invalid_mime_type/i, 'O servidor recusou esse formato de vídeo.'],
    [/bucket not found/i, 'Bucket "clips" não encontrado. Rode o supabase/schema.sql no SQL Editor.'],
    [/could not find the table|relation .* does not exist|PGRST205/i, 'Tabelas não encontradas. Rode o supabase/schema.sql no SQL Editor.'],
    [/could not find the function|PGRST202/i, 'Função do banco não encontrada. Rode o supabase/schema.sql de novo.'],
    [/permission denied/i, 'Sem permissão no banco. Rode o supabase/schema.sql completo (ele tem os GRANTs).'],
    [/row-level security|violates row-level/i, 'Permissão negada. Saia e entre de novo na sua conta.'],
    [/jwt expired|invalid jwt|session.*missing|auth session missing/i, 'Sua sessão expirou. Entre de novo.'],
    [/invalid api key|no api key|apikey/i, 'Chave do Supabase inválida. Confira o js/config.js.'],
    [/duplicate key|23505/i, 'Esse nick já está em uso.'],
    [/failed to fetch|networkerror|network request failed|load failed/i, 'Falha de conexão. Confira sua internet e a URL do Supabase no js/config.js.'],
  ];

  KZ.translateError = (err) => {
    const msg = String((err && (err.message || err.error_description || err.msg || err.error)) || err || '');
    const code = String((err && (err.code || err.error_code)) || '');
    for (const [re, text] of ERRORS) if (re.test(msg) || (code && re.test(code))) return text;
    return msg || 'Algo deu errado. Tente de novo.';
  };

  /* ── Toasts ───────────────────────────────────────────────────── */
  const TOAST_TITLES = { ok: 'GG', error: 'Erro', info: 'Aviso' };
  KZ.toast = (message, type, title) => {
    const kind = type || 'info';
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.innerHTML = `<strong class="toast__title">${KZ.esc(title || TOAST_TITLES[kind] || 'Aviso')}</strong><p class="toast__msg">${KZ.esc(message)}</p>`;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 400);
    }, kind === 'error' ? 6000 : 4200);
  };

  // mensagem que aparece depois de mudar de página (ex.: "conta criada")
  KZ.flash = (message, type) => {
    try {
      sessionStorage.setItem('kz_flash', JSON.stringify({ message, type: type || 'ok' }));
    } catch (_) {
      /* sem sessionStorage: ignora */
    }
  };

  function showFlash() {
    try {
      const flash = JSON.parse(sessionStorage.getItem('kz_flash') || 'null');
      if (flash) {
        sessionStorage.removeItem('kz_flash');
        setTimeout(() => KZ.toast(flash.message, flash.type), 250);
      }
    } catch (_) {
      /* ignora */
    }
  }

  /* ── Diálogo de confirmação (substitui o confirm() do navegador) ── */
  KZ.confirm = ({ title, text, confirmLabel }) =>
    new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'dialog';
      wrap.innerHTML = `
        <div class="dialog__backdrop" data-act="no"></div>
        <div class="dialog__box corners" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-text">
          <span class="eyebrow">Confirmação</span>
          <h3 class="dialog__title" id="dlg-title">${KZ.esc(title)}</h3>
          <p class="dialog__text" id="dlg-text">${KZ.esc(text)}</p>
          <div class="dialog__actions">
            <button class="vbtn vbtn--ghost vbtn--sm" type="button" data-act="no"><span class="vbtn__in"><span>Cancelar</span></span></button>
            <button class="vbtn vbtn--sm" type="button" data-act="yes"><span class="vbtn__in"><span>${KZ.esc(confirmLabel || 'Confirmar')}</span></span></button>
          </div>
        </div>`;
      const previous = document.activeElement;
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close(false);
        } else KZ.trapFocus(wrap, e);
      };
      function close(value) {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        if (previous && previous.focus) previous.focus();
        resolve(value);
      }
      wrap.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (act) close(act.dataset.act === 'yes');
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-act="no"].vbtn').focus();
    });

  /* ── Estados prontos para listas ──────────────────────────────── */
  KZ.setupStateHtml = () => `
    <div class="state state--setup">
      <span class="state__icon">${KZ.icons.plug}</span>
      <h3 class="state__title">Conecte o Supabase</h3>
      <p>Edite <code>js/config.js</code> com a URL e a Publishable key do seu projeto e rode o
      <code>supabase/schema.sql</code> no SQL Editor. O passo a passo está no <code>README.md</code>.</p>
    </div>`;

  KZ.errorStateHtml = (err) => `
    <div class="state state--error">
      <span class="state__icon">${KZ.icons.crosshair}</span>
      <h3 class="state__title">Defuse falhou</h3>
      <p>${KZ.esc(KZ.translateError(err))}</p>
    </div>`;

  /* ── Header, menu do usuário e rodapé ─────────────────────────── */
  function currentPage() {
    const file = decodeURIComponent(location.pathname.split('/').pop() || '');
    return /^[\w-]+\.html$/i.test(file) ? file : 'index.html';
  }

  KZ.renderHeader = () => {
    const el = document.getElementById('topbar');
    if (!el) return;
    let page = document.body.dataset.page || '';
    if (page === 'perfil' && KZ.param('u')) page = '';
    const link = (href, label, key, extra) =>
      `<a href="${href}" class="nav__link${key === page ? ' is-active' : ''}"${key === page ? ' aria-current="page"' : ''}${extra || ''}>${label}</a>`;

    el.innerHTML = `
      <div class="container topbar__in">
        <a class="brand" href="index.html" data-egg-logo aria-label="KlipzVLR, página inicial">
          ${KZ.icons.logo}<span class="brand__word">KLIPZ</span><span class="brand__tag">VLR</span>
        </a>
        <nav class="nav" id="main-nav" aria-label="Navegação principal">
          ${link('index.html#clipes', 'Clipes', 'home')}
          ${link('postar.html', 'Postar', 'postar')}
          ${link('perfil.html', 'Meu perfil', 'perfil', ' data-auth-only hidden')}
        </nav>
        <div class="topbar__right">
          <div class="auth-slot" id="auth-slot"><span class="auth-slot__ph"></span></div>
          <button class="nav-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="main-nav"><span></span></button>
        </div>
      </div>`;

    const toggle = el.querySelector('.nav-toggle');
    const setOpen = (open) => {
      el.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    toggle.addEventListener('click', () => setOpen(!el.classList.contains('is-open')));
    el.querySelector('.nav').addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });

    const onScroll = () => el.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  };

  KZ.renderAuthSlot = () => {
    const slot = document.getElementById('auth-slot');
    if (!slot) return;
    const { user, profile } = KZ.state;
    KZ.$$('[data-auth-only]').forEach((node) => {
      node.hidden = !user;
    });

    if (!user) {
      // na própria página de login o botão seria redundante
      if (document.body.dataset.page === 'entrar') {
        slot.innerHTML = '';
        return;
      }
      const next = `?next=${encodeURIComponent(currentPage() + location.search)}`;
      slot.innerHTML = `<a class="vbtn vbtn--sm" href="entrar.html${next}"><span class="vbtn__in"><span>Entrar</span></span></a>`;
      return;
    }

    const name = (profile && profile.username) || (user.user_metadata && user.user_metadata.username) || 'agente';
    slot.innerHTML = `
      <div class="user-menu">
        <button class="user-chip" type="button" aria-haspopup="menu" aria-expanded="false">
          ${KZ.avatar(name, 'sm')}
          <span class="user-chip__name">${KZ.esc(name)}</span>
          <svg class="user-chip__caret" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <div class="user-menu__panel" role="menu" hidden>
          <a role="menuitem" href="perfil.html">Meu perfil</a>
          <a role="menuitem" href="postar.html">Postar clipe</a>
          <button role="menuitem" type="button" data-logout>${KZ.icons.logout}Sair</button>
        </div>
      </div>`;
  };

  // menu do usuário: eventos registrados uma vez só (o HTML é refeito no login/logout)
  function setUserMenu(open) {
    const chip = document.querySelector('.user-chip');
    const panel = document.querySelector('.user-menu__panel');
    if (!chip || !panel) return;
    panel.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('.user-chip')) {
      const panel = document.querySelector('.user-menu__panel');
      setUserMenu(!!panel && panel.hidden);
      return;
    }
    if (e.target.closest('[data-logout]')) {
      KZ.signOut();
      return;
    }
    if (!e.target.closest('.user-menu')) setUserMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    const panel = document.querySelector('.user-menu__panel');
    if (e.key === 'Escape' && panel && !panel.hidden) {
      setUserMenu(false);
      document.querySelector('.user-chip').focus();
    }
  });

  KZ.renderFooter = () => {
    const el = document.getElementById('footer');
    if (!el) return;
    el.innerHTML = `
      <div class="container footer__grid">
        <div class="footer__brand">
          <a class="brand" href="index.html" aria-label="KlipzVLR, página inicial">${KZ.icons.logo}<span class="brand__word">KLIPZ</span><span class="brand__tag">VLR</span></a>
          <p>Seu ace merece plateia. Poste, assista e compartilhe as melhores jogadas de Valorant.</p>
        </div>
        <nav class="footer__nav" aria-label="Rodapé">
          <a href="index.html#clipes">Clipes</a>
          <a href="postar.html">Postar clipe</a>
          <a href="perfil.html">Meu perfil</a>
          <a href="entrar.html">Entrar / Criar conta</a>
        </nav>
        <p class="footer__legal">KlipzVLR é um projeto de fã, sem afiliação com a Riot Games. VALORANT e os nomes relacionados são marcas da Riot Games, Inc.</p>
      </div>
      <div class="footer__bottom">
        <div class="container footer__bottom-in">
          <span>© ${new Date().getFullYear()} KlipzVLR</span>
          <button class="footer__egg" type="button" data-egg-footer>feito por 2 agentes <i></i><i></i></button>
        </div>
      </div>`;
  };

  KZ.renderSetupBanner = () => {
    if (document.querySelector('.setup-banner')) return;
    const div = document.createElement('div');
    div.className = 'setup-banner';
    div.setAttribute('role', 'alert');
    div.innerHTML = !KZ.isConfigured
      ? '<strong>Supabase não configurado</strong><span>Abra <code>js/config.js</code> e cole a URL e a Publishable key do seu projeto. Passo a passo no <code>README.md</code>.</span>'
      : '<strong>Sem conexão com o Supabase</strong><span>A biblioteca não carregou (sem internet?). Recarregue a página.</span>';
    const header = document.getElementById('topbar');
    if (header) header.after(div);
    else document.body.prepend(div);
  };

  /* ── Sessão ───────────────────────────────────────────────────── */
  KZ.state = { session: null, user: null, profile: null };

  const NICK_CLEAN = /[^A-Za-z0-9_.]/g;
  const fallbackProfile = (user) => ({
    id: user.id,
    username: (user.user_metadata && user.user_metadata.username) || 'agente',
    created_at: user.created_at,
    fallback: true,
  });

  // busca o perfil do usuário; se não existir (conta antiga), cria na hora
  KZ.ensureProfile = async (user) => {
    const fields = 'id, username, created_at';
    const { data, error } = await KZ.sb.from('profiles').select(fields).eq('id', user.id).maybeSingle();
    if (error) {
      console.warn('[KlipzVLR] perfil:', error.message);
      return fallbackProfile(user);
    }
    if (data) return data;

    let base = String((user.user_metadata && user.user_metadata.username) || (user.email || '').split('@')[0]).replace(NICK_CLEAN, '');
    if (base.length < 3) base = `agente_${user.id.slice(0, 4)}`;
    base = base.slice(0, 20);
    for (let i = 0; i < 3; i++) {
      const username = i === 0 ? base : `${base.slice(0, 15)}_${Math.random().toString(36).slice(2, 6)}`;
      const ins = await KZ.sb.from('profiles').insert({ id: user.id, username }).select(fields).single();
      if (!ins.error) return ins.data;
      if (ins.error.code !== '23505') break;
    }
    return fallbackProfile(user);
  };

  async function applySession(session) {
    KZ.state.session = session || null;
    KZ.state.user = (session && session.user) || null;
    KZ.state.profile = KZ.state.user ? await KZ.ensureProfile(KZ.state.user) : null;
  }

  KZ.signOut = async () => {
    if (KZ.sb) await KZ.sb.auth.signOut();
    KZ.flash('Você saiu. Até a próxima rodada!', 'info');
    location.href = 'index.html';
  };

  // páginas que exigem login chamam isso; se não estiver logado, vai pro login
  KZ.requireAuth = async () => {
    const st = await KZ.ready;
    if (!KZ.sb) return null;
    if (!st.user) {
      location.replace(`entrar.html?next=${encodeURIComponent(currentPage() + location.search)}`);
      return null;
    }
    return st;
  };

  // KZ.ready: Promise que resolve quando header + sessão estão prontos
  KZ.ready = (async function boot() {
    if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    KZ.renderHeader();
    KZ.renderFooter();
    showFlash();

    if (!KZ.sb) {
      KZ.renderSetupBanner();
      KZ.renderAuthSlot();
      return KZ.state;
    }

    try {
      const { data } = await KZ.sb.auth.getSession();
      await applySession(data.session);
    } catch (err) {
      console.error('[KlipzVLR] sessão:', err);
    }
    KZ.renderAuthSlot();

    KZ.sb.auth.onAuthStateChange((event, session) => {
      // a lib recomenda não chamar o Supabase direto dentro deste callback
      setTimeout(async () => {
        const before = KZ.state.user ? KZ.state.user.id : null;
        const after = session && session.user ? session.user.id : null;
        KZ.state.session = session || null;
        if (before === after) return;
        await applySession(session);
        KZ.renderAuthSlot();
        document.dispatchEvent(new CustomEvent('kz:auth', { detail: KZ.state }));
      }, 0);
    });

    return KZ.state;
  })();
})();
