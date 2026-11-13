/* =====================================================================
   KlipzVLR · login e cadastro
   ===================================================================== */
(function () {
  'use strict';

  const KZ = window.KZ;
  const { $, $$ } = KZ;

  const loginForm = $('#form-login');
  const signupForm = $('#form-signup');
  const tabLogin = $('#tab-login');
  const tabSignup = $('#tab-signup');
  const title = $('#auth-title');
  const notice = $('#auth-notice');
  const nickInput = signupForm.elements.username;
  const nickStatus = $('#nick-status');
  const NICK_RE = /^[A-Za-z0-9_.]{3,20}$/;

  // para onde ir depois de entrar (só páginas do próprio site)
  const nextParam = KZ.param('next') || '';
  const next = /^[\w-]+\.html(?:[?#][^\s]*)?$/i.test(nextParam) ? nextParam : 'index.html';

  /* ── Abas ─────────────────────────────────────────────────────── */
  function setMode(mode, focus) {
    const signup = mode === 'signup';
    loginForm.hidden = signup;
    signupForm.hidden = !signup;
    notice.hidden = true;
    tabLogin.setAttribute('aria-selected', String(!signup));
    tabSignup.setAttribute('aria-selected', String(signup));
    tabLogin.tabIndex = signup ? -1 : 0;
    tabSignup.tabIndex = signup ? 0 : -1;
    title.textContent = signup ? 'Criar conta' : 'Entrar';
    document.title = `${signup ? 'Criar conta' : 'Entrar'} · KlipzVLR`;
    if (focus) (signup ? signupForm : loginForm).querySelector('input').focus();
  }

  tabLogin.addEventListener('click', () => setMode('login', true));
  tabSignup.addEventListener('click', () => setMode('signup', true));
  $('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const toSignup = tabLogin.getAttribute('aria-selected') === 'true';
    setMode(toSignup ? 'signup' : 'login');
    (toSignup ? tabSignup : tabLogin).focus();
  });
  $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.goto, true)));
  setMode(KZ.param('modo') === 'cadastro' ? 'signup' : 'login');

  /* ── Mostrar / ocultar senha ──────────────────────────────────── */
  $$('.pw__toggle').forEach((btn) => {
    btn.innerHTML = KZ.icons.eye;
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('is-on', show);
      btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    });
  });

  /* ── Helpers de formulário ────────────────────────────────────── */
  function message(form, text, type) {
    const el = form.querySelector('.form-msg');
    el.textContent = text;
    el.className = `form-msg form-msg--${type || 'error'}`;
    el.hidden = !text;
  }

  function busy(form, on) {
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = on;
    btn.classList.toggle('is-busy', on);
    form.setAttribute('aria-busy', String(on));
  }

  /* ── Checagem do nick ─────────────────────────────────────────── */
  let nickFree = null;
  function setNick(state, text) {
    nickFree = state;
    nickStatus.textContent = text;
    nickStatus.dataset.state = state === true ? 'ok' : state === false ? 'bad' : '';
  }

  const checkNick = KZ.debounce(async () => {
    const value = nickInput.value.trim();
    if (!value) return setNick(null, '');
    if (!NICK_RE.test(value)) return setNick(false, '3 a 20 caracteres: letras, números, _ ou .');
    if (!KZ.sb) return setNick(null, '');
    setNick(null, 'Verificando...');
    const { data, error } = await KZ.sb.rpc('username_available', { p_username: value });
    if (nickInput.value.trim() !== value) return; // usuário continuou digitando
    if (error) return setNick(null, '');
    setNick(!!data, data ? 'Nick disponível' : 'Esse nick já está em uso');
  }, 400);
  nickInput.addEventListener('input', checkNick);

  /* ── Login ────────────────────────────────────────────────────── */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!KZ.sb) return message(loginForm, 'Configure o Supabase no js/config.js primeiro.');
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;
    if (!email || !password) return message(loginForm, 'Preencha e-mail e senha.');

    message(loginForm, '');
    busy(loginForm, true);
    const { error } = await KZ.sb.auth.signInWithPassword({ email, password });
    busy(loginForm, false);
    if (error) return message(loginForm, KZ.translateError(error));

    KZ.flash('Bem-vindo de volta, agente.');
    location.replace(next);
  });

  /* ── Cadastro ─────────────────────────────────────────────────── */
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!KZ.sb) return message(signupForm, 'Configure o Supabase no js/config.js primeiro.');
    const f = signupForm.elements;
    const username = f.username.value.trim();
    const email = f.email.value.trim();
    const password = f.password.value;
    const confirm = f.confirm.value;

    if (!NICK_RE.test(username)) return message(signupForm, 'Nick inválido: use 3 a 20 letras, números, _ ou .');
    if (nickFree === false) return message(signupForm, 'Esse nick já está em uso. Escolhe outro.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return message(signupForm, 'Digite um e-mail válido.');
    if (password.length < 8) return message(signupForm, 'A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return message(signupForm, 'As senhas não batem.');

    message(signupForm, '');
    busy(signupForm, true);

    // confere de novo: alguém pode ter pego o nick nesse meio tempo
    const avail = await KZ.sb.rpc('username_available', { p_username: username });
    if (!avail.error && avail.data === false) {
      busy(signupForm, false);
      setNick(false, 'Esse nick já está em uso');
      return message(signupForm, 'Esse nick acabou de ser pego. Escolhe outro.');
    }

    const options = { data: { username } };
    if (/^https?:$/.test(location.protocol)) options.emailRedirectTo = KZ.pageUrl('index.html');
    const { data, error } = await KZ.sb.auth.signUp({ email, password, options });
    busy(signupForm, false);
    if (error) return message(signupForm, KZ.translateError(error));

    // com "Confirm email" ligado, e-mail repetido volta sem identities
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return message(signupForm, 'Esse e-mail já tem conta. Tente entrar.');
    }

    if (data.session) {
      KZ.flash(`Conta criada! Bem-vindo ao servidor, ${username}.`);
      location.replace(next === 'index.html' ? 'postar.html' : next);
      return;
    }

    // "Confirm email" ligado no Supabase: precisa clicar no link do e-mail
    signupForm.reset();
    setNick(null, '');
    setMode('login');
    notice.innerHTML = `<strong>Confirme seu e-mail</strong>Enviamos um link para <b>${KZ.esc(email)}</b>. Clique nele e depois entre aqui.`;
    notice.hidden = false;
  });

  /* ── Já está logado? Vai direto ───────────────────────────────── */
  KZ.ready.then((st) => {
    if (!KZ.sb) {
      notice.innerHTML =
        '<strong>Supabase não configurado</strong>Preencha o <code>js/config.js</code> para liberar login e cadastro.';
      notice.hidden = false;
      return;
    }
    if (st.user) location.replace(next);
  });
})();
