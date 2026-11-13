/* =====================================================================
   KlipzVLR · postar clipe
   Fluxo: escolhe o vídeo → gera capa no navegador → envia o vídeo para
   o Storage (com barra de progresso) → envia a capa → grava no banco.
   ===================================================================== */
(function () {
  'use strict';

  const KZ = window.KZ;
  const { $, $$, esc } = KZ;
  const MAX_BYTES = KZ.config.maxUploadMB * 1024 * 1024;
  const EXTS = Object.keys(KZ.VIDEO_TYPES);

  const gate = $('#gate');
  const form = $('#upload-form');
  const drop = $('#dropzone');
  const fileInput = $('#f-file');
  const preview = $('#preview');
  const previewVideo = $('#preview-video');
  const fileInfo = $('#file-info');
  const fileWarn = $('#file-warn');
  const thumbImg = $('#thumb-img');
  const thumbStatus = $('#thumb-status');
  const title = $('#f-title');
  const desc = $('#f-desc');
  const agent = $('#f-agent');
  const map = $('#f-map');
  const chips = $('#f-type');
  const plant = $('#plant');

  let file = null;
  let ext = '';
  let mime = '';
  let meta = { blob: null, duration: null, playable: true };
  let previewUrl = null;
  let thumbUrl = null;
  let xhr = null;
  let uploading = false;

  /* ── Montagem do formulário ───────────────────────────────────── */
  KZ.fillSelect(agent, KZ.AGENTS, 'Qual agente?');
  KZ.fillSelect(map, KZ.MAPS, 'Qual mapa?');
  chips.innerHTML = KZ.HIGHLIGHTS.map(
    (h) => `<label class="chip"><input type="radio" name="highlight" value="${esc(h)}"><span><b>${esc(h)}</b></span></label>`
  ).join('');
  fileInput.accept = `${EXTS.map((e) => `.${e}`).join(',')},video/*`;
  $$('[data-formats]').forEach((el) => {
    el.textContent = EXTS.map((e) => e.toUpperCase()).join(', ');
  });
  $$('[data-max-mb]').forEach((el) => {
    el.textContent = KZ.config.maxUploadMB;
  });

  // clicar de novo numa tag já marcada desmarca
  chips.addEventListener('click', (e) => {
    const radio = e.target.closest('input[type="radio"]');
    if (!radio) return;
    if (radio.dataset.was === '1') {
      radio.checked = false;
      radio.dataset.was = '';
    } else {
      $$('input', chips).forEach((r) => {
        r.dataset.was = '';
      });
      radio.dataset.was = '1';
    }
  });
  chips.addEventListener('change', () => {
    $$('input', chips).forEach((r) => {
      r.dataset.was = r.checked ? '1' : '';
    });
  });

  $$('[data-count-for]').forEach((out) => {
    const input = document.getElementById(out.dataset.countFor);
    const update = () => {
      out.textContent = `${input.value.length}/${input.maxLength}`;
    };
    input.addEventListener('input', update);
    update();
  });

  /* ── Capa automática + duração (lidas do próprio arquivo) ─────── */
  function captureThumb(f) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(f);
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        resolve(result);
      };
      const timeout = setTimeout(() => finish({ blob: null, duration: null, playable: false }), 12000);

      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('error', () => finish({ blob: null, duration: null, playable: false }));
      video.addEventListener('loadedmetadata', () => {
        const d = video.duration;
        video.currentTime = Number.isFinite(d) && d > 0 ? Math.min(Math.max(d * 0.25, 0.1), 3) : 0.1;
      });
      video.addEventListener(
        'seeked',
        () => {
          const duration = Number.isFinite(video.duration) ? video.duration : null;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (!vw || !vh) return finish({ blob: null, duration, playable: false });
          try {
            const w = 640;
            const h = 360;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const scale = Math.max(w / vw, h / vh);
            const sw = w / scale;
            const sh = h / scale;
            canvas.getContext('2d').drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
            canvas.toBlob((blob) => finish({ blob, duration, playable: true }), 'image/jpeg', 0.82);
          } catch (_) {
            finish({ blob: null, duration, playable: true });
          }
        },
        { once: true }
      );
      video.src = url;
    });
  }

  /* ── Escolha do arquivo ───────────────────────────────────────── */
  function pickFile(f) {
    if (!f || uploading) return;
    const e = (f.name.split('.').pop() || '').toLowerCase();
    if (!KZ.VIDEO_TYPES[e]) {
      KZ.toast(`Formato ".${e}" não é aceito. Use ${EXTS.map((x) => x.toUpperCase()).join(', ')}.`, 'error');
      return;
    }
    if (f.size === 0) {
      KZ.toast('Esse arquivo está vazio.', 'error');
      return;
    }
    if (f.size > MAX_BYTES) {
      KZ.toast(
        `Esse clipe tem ${KZ.fmtBytes(f.size)} e o limite é ${KZ.config.maxUploadMB} MB. Corte ou comprima o vídeo (dicas ao lado).`,
        'error'
      );
      return;
    }

    file = f;
    ext = e;
    mime = KZ.VIDEO_TYPES[e];
    meta = { blob: null, duration: null, playable: true };

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    previewVideo.src = previewUrl;
    drop.hidden = true;
    preview.hidden = false;
    fileWarn.hidden = true;
    fileInfo.innerHTML = `<strong>${esc(f.name)}</strong><span>${KZ.fmtBytes(f.size)}</span><span data-dur></span>`;

    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = null;
    thumbImg.hidden = true;
    thumbStatus.hidden = false;
    thumbStatus.textContent = 'Gerando capa...';

    captureThumb(f).then((result) => {
      if (file !== f) return; // trocou de arquivo nesse meio tempo
      meta = result;
      const dur = KZ.fmtDuration(result.duration);
      const durEl = fileInfo.querySelector('[data-dur]');
      if (durEl) durEl.textContent = dur;
      if (result.blob) {
        thumbUrl = URL.createObjectURL(result.blob);
        thumbImg.src = thumbUrl;
        thumbImg.hidden = false;
        thumbStatus.hidden = true;
      } else {
        thumbStatus.textContent = 'Sem capa (o card vai usar o nome do agente)';
      }
      if (!result.playable) {
        fileWarn.textContent =
          'Seu navegador não conseguiu abrir esse vídeo. Ele pode ser enviado, mas talvez não toque para todo mundo. Prefira MP4 (H.264).';
        fileWarn.hidden = false;
      }
    });
  }

  function clearFile() {
    file = null;
    ext = '';
    mime = '';
    meta = { blob: null, duration: null, playable: true };
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewVideo.load();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    previewUrl = null;
    thumbUrl = null;
    fileInput.value = '';
    preview.hidden = true;
    drop.hidden = false;
  }

  fileInput.addEventListener('change', () => pickFile(fileInput.files[0]));
  $('#change-file').addEventListener('click', () => {
    clearFile();
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach((type) =>
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    })
  );
  ['dragleave', 'dragend', 'drop'].forEach((type) =>
    drop.addEventListener(type, () => drop.classList.remove('is-over'))
  );
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    pickFile(e.dataTransfer && e.dataTransfer.files[0]);
  });
  // soltar o arquivo fora da área não abre o vídeo no navegador
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  /* ── Upload do vídeo com progresso (API REST do Storage) ──────── */
  function uploadVideo(path, token, onProgress) {
    return new Promise((resolve, reject) => {
      const url = `${KZ.config.url}/storage/v1/object/${encodeURIComponent(KZ.config.bucket)}/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
      xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', KZ.config.key);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let body = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch (_) {
          body = {};
        }
        const err = new Error(body.message || body.error || `Erro ${xhr.status} no upload`);
        err.code = body.error || String(body.statusCode || xhr.status);
        reject(err);
      };
      xhr.onerror = () => reject(new Error('Failed to fetch'));
      xhr.onabort = () => {
        const err = new Error('Upload cancelado');
        err.name = 'AbortError';
        reject(err);
      };
      // mesmo formato que a biblioteca oficial usa (multipart)
      const body = new FormData();
      body.append('cacheControl', '3600');
      body.append('', new Blob([file], { type: mime }), path.split('/').pop());
      xhr.send(body);
    });
  }

  /* ── Tela "plantando a spike" ─────────────────────────────────── */
  const P = {
    label: $('#plant-label'),
    pct: $('#plant-pct'),
    bar: $('#plant-bar'),
    file: $('#plant-file'),
    msg: $('#plant-msg'),
    actions: $('#plant-actions'),
  };

  function setProgress(ratio) {
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    P.pct.textContent = `${pct}%`;
    P.bar.style.width = `${pct}%`;
    plant.style.setProperty('--p', ratio);
  }

  function showPlant(state, info) {
    plant.hidden = false;
    plant.dataset.state = state;
    document.documentElement.classList.add('is-locked');
    if (state === 'progress') {
      P.label.textContent = 'Plantando a spike...';
      setProgress(0);
      P.file.textContent = `${file.name} · ${KZ.fmtBytes(file.size)}`;
      P.msg.textContent = 'Não feche esta aba até terminar.';
      P.actions.innerHTML =
        '<button type="button" class="vbtn vbtn--ghost vbtn--sm" data-plant="abort"><span class="vbtn__in"><span>Abortar</span></span></button>';
    } else if (state === 'done') {
      P.label.textContent = 'Spike plantada!';
      setProgress(1);
      P.msg.textContent = 'Seu clipe já está no ar. GG!';
      P.actions.innerHTML = `
        <a class="vbtn" href="index.html?clip=${encodeURIComponent(info.id)}"><span class="vbtn__in"><span>Ver clipe</span></span></a>
        <button type="button" class="vbtn vbtn--ghost" data-plant="close"><span class="vbtn__in"><span>Postar outro</span></span></button>`;
    } else {
      P.label.textContent = 'Plant interrompido';
      P.msg.textContent = (info && info.message) || 'Algo deu errado.';
      P.actions.innerHTML =
        '<button type="button" class="vbtn" data-plant="close"><span class="vbtn__in"><span>Voltar e tentar de novo</span></span></button>';
    }
    const first = P.actions.querySelector('a, button');
    if (first) first.focus();
  }

  function hidePlant() {
    plant.hidden = true;
    document.documentElement.classList.remove('is-locked');
  }

  plant.addEventListener('click', (e) => {
    const act = e.target.closest('[data-plant]');
    if (!act) return;
    if (act.dataset.plant === 'abort' && xhr) xhr.abort();
    if (act.dataset.plant === 'close') hidePlant();
  });
  document.addEventListener('keydown', (e) => {
    if (plant.hidden) return;
    if (e.key === 'Escape' && plant.dataset.state !== 'progress') hidePlant();
    else KZ.trapFocus(plant, e);
  });
  window.addEventListener('beforeunload', (e) => {
    if (!uploading) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ── Publicar ─────────────────────────────────────────────────── */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (uploading) return;
    const t = title.value.trim();
    if (!file) {
      KZ.toast('Escolha o vídeo do clipe primeiro.', 'error');
      fileInput.focus();
      return;
    }
    if (t.length < 3) {
      KZ.toast('O título precisa ter pelo menos 3 caracteres.', 'error');
      title.focus();
      return;
    }

    const { data } = await KZ.sb.auth.getSession();
    const session = data.session;
    if (!session) {
      location.replace('entrar.html?next=postar.html');
      return;
    }

    const uid = session.user.id;
    const id = KZ.uuid();
    const videoPath = `${uid}/${id}.${ext}`;
    let thumbPath = meta.blob ? `${uid}/${id}.jpg` : null;
    const checked = chips.querySelector('input:checked');

    uploading = true;
    showPlant('progress');
    try {
      await uploadVideo(videoPath, session.access_token, (ratio) => {
        setProgress(ratio);
        if (ratio >= 1) P.label.textContent = 'Processando...';
      });

      if (thumbPath) {
        P.label.textContent = 'Gerando capa...';
        const up = await KZ.sb.storage
          .from(KZ.config.bucket)
          .upload(thumbPath, meta.blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) {
          console.warn('[KlipzVLR] capa não enviada:', up.error.message);
          thumbPath = null;
        }
      }

      P.label.textContent = 'Registrando jogada...';
      const row = {
        id,
        user_id: uid,
        title: t,
        description: desc.value.trim() || null,
        agent: agent.value || null,
        map: map.value || null,
        highlight: checked ? checked.value : null,
        video_path: videoPath,
        thumb_path: thumbPath,
        duration: Number.isFinite(meta.duration) ? Math.round(meta.duration * 10) / 10 : null,
      };
      const { error } = await KZ.sb.from('clips').insert(row);
      if (error) {
        await KZ.sb.storage.from(KZ.config.bucket).remove([videoPath, thumbPath].filter(Boolean));
        throw error;
      }

      uploading = false;
      showPlant('done', { id });
      form.reset();
      $$('input', chips).forEach((r) => {
        r.dataset.was = '';
      });
      title.dispatchEvent(new Event('input'));
      desc.dispatchEvent(new Event('input'));
      clearFile();
    } catch (err) {
      uploading = false;
      if (err && err.name === 'AbortError') {
        hidePlant();
        KZ.toast('Upload cancelado.', 'info');
      } else {
        showPlant('error', { message: KZ.translateError(err) });
      }
    } finally {
      uploading = false;
      xhr = null;
    }
  });

  /* ── Só entra quem está logado ────────────────────────────────── */
  KZ.ready.then(async () => {
    if (!KZ.sb) {
      gate.innerHTML = KZ.setupStateHtml();
      return;
    }
    const st = await KZ.requireAuth();
    if (!st) return;
    $('#upload-who').textContent = (st.profile && st.profile.username) || 'agente';
    gate.hidden = true;
    form.hidden = false;
  });
})();
