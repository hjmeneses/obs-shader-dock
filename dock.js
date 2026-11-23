// obs-shader-dock: lista los filtros de shader propios (ver shaders.js) en todas las escenas y
// fuentes de OBS y da controles para cada uno.
(function () {
  'use strict';

  const STORE = 'obsShaderDock.';
  const TICK_MS = 16;            // ~60 actualizaciones por segundo mientras corre una secuencia
  const RETRY_MS = 3000;
  const REFRESH_EVENTS = new Set([
    'SourceFilterCreated', 'SourceFilterRemoved', 'SourceFilterNameChanged',
    'SourceFilterEnableStateChanged', 'SourceFilterListReindexed',
    'InputCreated', 'InputRemoved', 'InputNameChanged',
    'SceneCreated', 'SceneRemoved', 'SceneNameChanged',
    'CurrentSceneCollectionChanged',
  ]);

  const $ = (id) => document.getElementById(id);
  const t = I18N.t;
  const ws = new ObsWs();
  let items = [];                // filtros encontrados
  const anims = new Map();       // key → animación en curso
  const refs = new Map();        // key → elementos de la interfaz
  let retryTimer = 0;
  let refreshTimer = 0;
  let manualClose = false;
  let session = null;            // datos con los que se conectó (aunque no se guarden)

  // ------------------------------------------------------------------ almacenamiento
  function load(name, fallback) {
    try {
      const v = localStorage.getItem(STORE + name);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  }
  function save(name, value) {
    try { localStorage.setItem(STORE + name, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }
  function forget(name) {
    try { localStorage.removeItem(STORE + name); } catch { /* sin almacenamiento */ }
  }

  // ------------------------------------------------------------------ manifiesto
  const byFile = new Map();
  for (const entry of window.SHADER_MANIFEST || []) {
    for (const f of entry.files) byFile.set(f.toLowerCase(), entry);
  }
  const baseName = (path) => (path || '').split(/[\\/]/).pop().toLowerCase();

  // ------------------------------------------------------------------ estado de conexión
  // Se guardan las claves de texto (no el texto) para poder cambiar de idioma en vivo
  let statusState = ['bad', 'disconnected', []];
  let messageState = null;

  function setStatus(kind, key, ...args) {
    statusState = [kind, key, args];
    const dot = $('status-dot');
    dot.className = 'dot' + (kind === 'ok' ? ' ok' : kind === 'wait' ? ' wait' : '');
    dot.title = t(key, ...args);
  }

  function showMessage(titleKey, textKey, ...args) {
    messageState = [titleKey, textKey, args];
    const list = $('list');
    list.replaceChildren();
    const div = el('div', 'empty');
    div.append(el('b', null, t(titleKey)));
    if (textKey) div.append(document.createTextNode(t(textKey, ...args)));
    list.append(div);
  }

  const errorText = (code) => (t('err_' + code) !== 'err_' + code ? t('err_' + code) : code);

  function currentConfig() {
    const saved = load('conn', null) || {};
    const q = new URLSearchParams(location.search);
    return {
      host: q.get('host') || saved.host || '127.0.0.1',
      port: Number(q.get('port') || saved.port || 4455),
      password: q.get('password') ?? saved.password ?? '',
      remember: saved.remember ?? true,
      known: !!(saved.host || q.get('port') || q.get('password')),
    };
  }

  async function connect(conf, fromDialog) {
    clearTimeout(retryTimer);
    manualClose = false;
    setStatus('wait', 'connecting');
    if (!fromDialog) showMessage('connecting');
    try {
      await ws.connect(`ws://${conf.host}:${conf.port}`, conf.password);
    } catch (err) {
      setStatus('bad', 'disconnected');
      const msg = errorText(err.message);
      if (fromDialog) {
        $('f-error').textContent = msg;
      } else if (err.message === 'unreachable') {
        showMessage('obsDown', 'retryingEvery');
        retryTimer = setTimeout(() => connect(session || currentConfig(), false), RETRY_MS);
      } else {
        openDialog(msg);
      }
      return false;
    }
    if (conf.remember) {
      save('conn', { host: conf.host, port: conf.port, password: conf.password, remember: true });
    } else {
      save('conn', { host: conf.host, port: conf.port, remember: false });
    }
    session = conf;
    setStatus('ok', 'connectedTo', `${conf.host}:${conf.port}`);
    if ($('dlg').open) $('dlg').close();
    await refresh();
    return true;
  }

  ws.addEventListener('closed', () => {
    stopAll();
    $('count-fx').textContent = '';
    $('count-geo').textContent = '';
    if (manualClose) return;
    setStatus('wait', 'reconnecting');
    showMessage('lost', 'retrying');
    retryTimer = setTimeout(() => connect(session || currentConfig(), false), RETRY_MS);
  });

  ws.addEventListener('obs-event', (ev) => {
    const d = ev.detail;
    if (REFRESH_EVENTS.has(d.eventType)) scheduleRefresh();
    else if (d.eventType === 'SourceFilterSettingsChanged') onFilterSettings(d.eventData || {});
  });

  // ------------------------------------------------------------------ ventana de conexión
  function openDialog(error) {
    const c = currentConfig();
    $('f-host').value = c.host;
    $('f-port').value = c.port;
    $('f-pass').value = c.password;
    $('f-remember').checked = c.remember;
    $('f-error').textContent = error || '';
    if (!$('dlg').open) $('dlg').showModal();
    setTimeout(() => (c.password ? $('f-connect') : $('f-pass')).focus(), 0);
  }

  $('conn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('f-error').textContent = '';
    connect({
      host: $('f-host').value.trim() || '127.0.0.1',
      port: Number($('f-port').value) || 4455,
      password: $('f-pass').value,
      remember: $('f-remember').checked,
    }, true);
  });
  $('f-cancel').addEventListener('click', () => $('dlg').close());
  $('f-forget').addEventListener('click', () => {
    forget('conn');
    session = null;
    $('f-pass').value = '';
    $('f-error').textContent = t('forgotten');
  });
  $('btn-settings').addEventListener('click', () => openDialog());
  $('btn-refresh').addEventListener('click', () => { if (ws.connected) refresh(); else connect(currentConfig(), false); });

  const showOthers = $('show-others');
  showOthers.checked = load('showOthers', false);
  showOthers.addEventListener('change', () => { save('showOthers', showOthers.checked); render(); });

  // Idioma: cambia los textos fijos y vuelve a pintar la lista o el mensaje actual
  const langSel = $('lang');
  langSel.value = I18N.lang;
  I18N.apply();
  langSel.addEventListener('change', () => {
    I18N.setLang(langSel.value);
    setStatus(statusState[0], statusState[1], ...statusState[2]);
    if (ws.connected && items.length) render();
    else if (messageState) showMessage(messageState[0], messageState[1], ...messageState[2]);
    else render();
  });

  // ------------------------------------------------------------------ lista de filtros
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 250);
  }

  async function refresh() {
    if (!ws.connected) return;
    let names = [];
    try {
      const [scenes, inputs, groups] = await Promise.all([
        ws.call('GetSceneList'),
        ws.call('GetInputList'),
        ws.call('GetGroupList').catch(() => ({ groups: [] })),
      ]);
      names = [
        ...scenes.scenes.slice().reverse().map((s) => s.sceneName),   // en el orden de OBS
        ...(groups.groups || []),
        ...inputs.inputs.map((i) => i.inputName),
      ];
    } catch {
      return;
    }
    names = [...new Set(names)];

    const lists = await Promise.all(names.map((sourceName) =>
      ws.call('GetSourceFilterList', { sourceName })
        .then((r) => ({ sourceName, filters: r.filters || [] }))
        .catch(() => ({ sourceName, filters: [] }))));

    const next = [];
    for (const { sourceName, filters } of lists) {
      for (const f of filters) {
        if (f.filterKind === FX3D.kind) {
          next.push(FX3D.item(sourceName, f));
          continue;
        }
        if (!String(f.filterKind).startsWith('shader_filter')) continue;
        const s = f.filterSettings || {};
        const file = s.from_file ? baseName(s.shader_file_name) : '';
        const entry = file ? byFile.get(file) : null;
        if (entry && entry.type === 'stinger') continue;
        const type = entry ? entry.type : ('progress' in s ? 'sequence' : 'continuous');
        next.push({
          key: sourceName + '\u0000' + f.filterName,
          sourceName,
          filterName: f.filterName,
          enabled: f.filterEnabled,
          own: !!entry,
          entry,
          detail: entry ? entry.repo : (file || null),
          type,
          duration: Number(s.duration) > 0 ? Number(s.duration) : (entry && entry.duration) || 8,
          progress: typeof s.progress === 'number' ? s.progress : 0,
          autoPlay: typeof s.auto_play === 'boolean' ? s.auto_play : true,
          corners: type === 'corners' ? CORNERS.read(s) : null,
          expand: type === 'corners' ? CORNERS.readExpand(s) : null,
        });
      }
    }
    items = next;
    // Detiene animaciones de filtros que ya no existen
    for (const key of anims.keys()) if (!items.some((i) => i.key === key)) stop(key);
    render();
  }

  // ------------------------------------------------------------------ interfaz
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const ICONS = {
    start: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
    play: 'M8 5v14l11-7z',
    stop: 'M6 6h12v12H6z',
    end: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
    reset: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
    expand: 'M4 4h6v2H7.4l3.3 3.3-1.4 1.4L6 7.4V10H4zm16 0v6h-2V7.4l-3.3 3.3-1.4-1.4L16.6 6H14V4zM4 20v-6h2v2.6l3.3-3.3 1.4 1.4L7.4 18H10v2zm16 0h-6v-2h2.6l-3.3-3.3 1.4-1.4 3.3 3.3V14h2z',
  };
  function iconButton(icon, title, cls) {
    const b = el('button', 'icon-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ICONS[icon]}"/></svg>`;
    return b;
  }
  function setIcon(btn, icon, title) {
    btn.querySelector('path').setAttribute('d', ICONS[icon]);
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }

  // ------------------------------------------------------------------ pestañas
  const isGeo = (i) => i.type === '3d' || i.type === 'corners';
  let tab = load('tab', 'fx') === 'geo' ? 'geo' : 'fx';
  const tabButtons = [...document.querySelectorAll('.tab')];

  function setTab(next, focus) {
    tab = next;
    save('tab', tab);
    for (const b of tabButtons) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    if (ws.connected) render();
  }
  for (const b of tabButtons) {
    b.addEventListener('click', () => setTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setTab(tab === 'fx' ? 'geo' : 'fx', true);
    });
  }
  setTab(tab);

  function updateCounts(visible) {
    const geo = visible.filter(isGeo).length;
    $('count-fx').textContent = ws.connected ? String(visible.length - geo) : '';
    $('count-geo').textContent = ws.connected ? String(geo) : '';
  }

  function render() {
    refs.clear();
    const list = $('list');
    const all = items.filter((i) => i.own || showOthers.checked);
    updateCounts(all);
    const visible = all.filter((i) => isGeo(i) === (tab === 'geo'));
    if (!visible.length) {
      if (tab === 'geo') {
        showMessage('noGeometry', 'addGeometry');
        return;
      }
      const hidden = items.filter((i) => !isGeo(i)).length - visible.length;
      showMessage('noShaders', hidden ? 'hiddenOthers' : 'addOne', hidden);
      return;
    }

    const groups = new Map();
    for (const it of visible) {
      if (!groups.has(it.sourceName)) groups.set(it.sourceName, []);
      groups.get(it.sourceName).push(it);
    }

    const frag = document.createDocumentFragment();
    for (const [sourceName, group] of groups) {
      const card = el('section', 'source');
      const h = el('h2', null, sourceName);
      h.title = sourceName;
      card.append(h);
      for (const it of group) card.append(renderFilter(it));
      frag.append(card);
    }
    list.replaceChildren(frag);
  }

  const labelOf = (it) => {
    if (it.type === '3d') return t('fx3d');
    return it.entry ? (I18N.lang === 'en' && it.entry.label_en) || it.entry.label : it.filterName;
  };

  function renderFilter(it) {
    const label = labelOf(it);
    const detail = it.detail || t('inlineShader');
    const box = el('div', 'filter' + (it.enabled ? '' : ' off'));
    const row = el('div', 'row');

    const sw = el('label', 'switch');
    sw.title = it.enabled ? t('turnOff') : t('turnOn');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = it.enabled;
    cb.setAttribute('aria-label', t('turnOnName', it.filterName));
    cb.addEventListener('change', () => setEnabled(it, cb.checked, box, sw));
    sw.append(cb, el('span'));

    const name = el('div', 'name');
    const title = el('b', null, label);
    const sub = it.filterName !== label ? `${it.filterName} · ${detail}` : detail;
    title.title = it.filterName;
    name.append(title, el('small', null, sub));
    row.append(sw, name);
    box.append(row);

    if (it.type === 'sequence') {
      const controls = el('div', 'controls');
      const bStart = iconButton('start', t('toStart'));
      const playing = anims.has(it.key);
      const bPlay = iconButton(playing ? 'stop' : 'play', playing ? t('stop') : t('play', fmt(it.duration)), 'play' + (playing ? ' playing' : ''));
      const bEnd = iconButton('end', t('toEnd'));
      const range = el('input');
      range.type = 'range';
      range.min = 0; range.max = 100; range.step = 0.1;
      range.value = it.progress;
      range.setAttribute('aria-label', t('progressOf', it.filterName));
      const pct = el('span', 'pct', `${Math.round(it.progress)}%`);
      const loop = el('label', 'loop');
      loop.title = t('loopTip');
      const loopCb = el('input');
      loopCb.type = 'checkbox';
      loopCb.checked = it.autoPlay;
      loop.append(loopCb, document.createTextNode(t('loop')));

      bStart.addEventListener('click', () => jump(it, 0));
      bEnd.addEventListener('click', () => jump(it, 100));
      bPlay.addEventListener('click', () => (anims.has(it.key) ? stop(it.key) : play(it)));
      range.addEventListener('input', () => scrub(it, Number(range.value)));
      loopCb.addEventListener('change', () => setLoop(it, loopCb.checked));

      controls.append(bStart, bPlay, bEnd, range, pct, loop);
      box.append(controls);
      refs.set(it.key, { range, pct, bPlay, loopCb });
    } else if (it.type === '3d') {
      box.append(FX3D.pad(it));
    } else if (it.type === 'corners') {
      box.append(CORNERS.pad(it));
    }
    return box;
  }

  // Envía solo el último valor de cada filtro: si OBS no ha contestado, el siguiente reemplaza al pendiente
  const sendQueue = new Map();
  function sendLatest(it, settings) {
    const q = sendQueue.get(it.key) || { busy: false, pending: null };
    sendQueue.set(it.key, q);
    q.pending = settings;
    if (q.busy) return;
    const flush = () => {
      if (!q.pending) { q.busy = false; return; }
      const s = q.pending;
      q.pending = null;
      q.busy = true;
      send(it, s).finally(flush);
    };
    flush();
  }

  // ------------------------------------------------------------------ Perspectiva (corner pin)
  // Pad con la imagen de la fuente y cuatro anclas, como Distorsionar / Perspectiva en Photoshop:
  //   arrastrar una esquina = moverla libre · Shift = perspectiva (la esquina vecina se mueve en espejo)
  //   arrastrar dentro o Alt = mover todo · doble clic = reiniciar
  const CORNERS = (() => {
    const KEYS = [['tl_x', 'tl_y'], ['tr_x', 'tr_y'], ['br_x', 'br_y'], ['bl_x', 'bl_y']];
    const DEF = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const VIEW_MIN = -30;            // el pad muestra de -30 % a 130 % para poder sacar esquinas
    const VIEW_SPAN = 160;
    const HIT = 12;                  // radio de las anclas para atraparlas, en px CSS
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const r2 = (v) => Math.round(v * 100) / 100;
    const clampPct = (v) => Math.min(150, Math.max(-50, v));

    const read = (s) => KEYS.map(([kx, ky], i) => [num(s[kx], DEF[i][0]), num(s[ky], DEF[i][1])]);
    // Expandir de obs-shaderfilter, en pixeles: margen transparente alrededor de la fuente
    const readExpand = (s) => ({
      l: num(s.expand_left, 0), r: num(s.expand_right, 0), t: num(s.expand_top, 0), b: num(s.expand_bottom, 0),
    });
    const expanded = (x) => x.l > 0 || x.r > 0 || x.t > 0 || x.b > 0;
    const settingsOf = (c) => {
      const o = {};
      KEYS.forEach(([kx, ky], i) => { o[kx] = r2(c[i][0]); o[ky] = r2(c[i][1]); });
      return o;
    };

    // La misma homografía que el shader (cuadrado unitario → esquinas), para dibujar la rejilla
    function homography(p) {
      const [p0, p1, p2, p3] = p;
      const sx = p0[0] - p1[0] + p2[0] - p3[0], sy = p0[1] - p1[1] + p2[1] - p3[1];
      const d1x = p1[0] - p2[0], d1y = p1[1] - p2[1], d2x = p3[0] - p2[0], d2y = p3[1] - p2[1];
      const den = d1x * d2y - d2x * d1y;
      let g = 0, h = 0;
      if (Math.abs(den) > 1e-9) { g = (sx * d2y - d2x * sy) / den; h = (d1x * sy - sx * d1y) / den; }
      const a = p1[0] - p0[0] + g * p1[0], b = p3[0] - p0[0] + h * p3[0];
      const d = p1[1] - p0[1] + g * p1[1], e = p3[1] - p0[1] + h * p3[1];
      return (u, v) => {
        const w = g * u + h * v + 1;
        return [(a * u + b * v + p0[0]) / w, (d * u + e * v + p0[1]) / w];
      };
    }

    function inside(pt, c) {
      // Punto dentro del cuadrilátero (convexo o no): regla par-impar
      let ins = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const [xi, yi] = c[i], [xj, yj] = c[j];
        if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    }

    function pad(it) {
      const wrapEl = el('div', 'cp');
      const canvas = el('canvas', 'cp-canvas');
      canvas.tabIndex = 0;
      canvas.title = t('cpHelp');
      canvas.setAttribute('aria-label', t('cpAria', it.filterName));
      const out = el('div', 'fx3d-out');
      const grow = iconButton('expand', t('cpExpand'));
      const reset = iconButton('reset', t('cpReset'));
      const foot = el('div', 'fx3d-foot');
      foot.append(out, grow, reset);
      wrapEl.append(canvas, foot);

      const ctx = canvas.getContext('2d');
      const img = new Image();
      let aspect = 9 / 16;           // alto / ancho de la fuente; se corrige con la captura
      let base = null;               // tamaño de la fuente en pixeles (captura completa menos Expandir)

      const showGrow = () => {
        const on = expanded(it.expand);
        grow.classList.toggle('on', on);
        grow.disabled = !base && !on;
        const tip = on ? t('cpShrink') : t('cpExpand');
        grow.title = tip;
        grow.setAttribute('aria-label', tip);
      };
      let hover = -1;
      let drag = null;

      const size = () => {
        const w = canvas.clientWidth || 280;
        return { w, h: Math.round(w * aspect) };
      };
      const toPx = (pt, s) => [((pt[0] - VIEW_MIN) / VIEW_SPAN) * s.w, ((pt[1] - VIEW_MIN) / VIEW_SPAN) * s.h];
      const toPct = (x, y, s) => [(x / s.w) * VIEW_SPAN + VIEW_MIN, (y / s.h) * VIEW_SPAN + VIEW_MIN];

      function draw() {
        const s = size();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(s.w * dpr) || canvas.height !== Math.round(s.h * dpr)) {
          canvas.width = Math.round(s.w * dpr);
          canvas.height = Math.round(s.h * dpr);
          canvas.style.height = s.h + 'px';
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const css = getComputedStyle(document.documentElement);
        const col = (n) => css.getPropertyValue(n).trim();
        ctx.fillStyle = col('--bg');
        ctx.fillRect(0, 0, s.w, s.h);

        // La captura ya trae el filtro aplicado y, con Expandir, también el margen alrededor
        const [x0, y0] = toPx([0, 0], s);
        const [x1, y1] = toPx([100, 100], s);
        if (img.complete && img.naturalWidth) {
          const e = it.expand;
          const m = base ? [-e.l / base.w * 100, -e.t / base.h * 100, 100 + e.r / base.w * 100, 100 + e.b / base.h * 100] : [0, 0, 100, 100];
          const [ix0, iy0] = toPx([m[0], m[1]], s);
          const [ix1, iy1] = toPx([m[2], m[3]], s);
          ctx.drawImage(img, ix0, iy0, ix1 - ix0, iy1 - iy0);
        }
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = col('--line');
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
        ctx.setLineDash([]);

        // Rejilla en perspectiva 4×4 y contorno
        const c = it.corners;
        const H = homography(c);
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.shadowColor = 'rgba(0,0,0,.7)';
        ctx.shadowBlur = 2;
        ctx.beginPath();
        for (let k = 1; k < 4; k++) {
          const u = k / 4;
          for (const [a, b] of [[[u, 0], [u, 1]], [[0, u], [1, u]]]) {
            const pa = toPx(H(...a), s), pb = toPx(H(...b), s);
            ctx.moveTo(pa[0], pa[1]);
            ctx.lineTo(pb[0], pb[1]);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = col('--accent');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        c.forEach((p, i) => { const q = toPx(p, s); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        ctx.closePath();
        ctx.stroke();

        // Anclas
        c.forEach((p, i) => {
          const [x, y] = toPx(p, s);
          const on = drag ? drag.idx === i || drag.partner === i || drag.idx === 'all' : hover === i;
          ctx.fillStyle = on ? col('--accent') : '#fff';
          ctx.strokeStyle = on ? '#fff' : col('--accent');
          ctx.lineWidth = 1.5;
          ctx.fillRect(x - 4.5, y - 4.5, 9, 9);
          ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
        });

        out.textContent = c.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`).join('  ');
      }

      // La primera captura va a tamaño completo para conocer los pixeles de la fuente; las demás, chicas
      let shotTimer = 0;
      function refreshShot(delay) {
        clearTimeout(shotTimer);
        shotTimer = setTimeout(() => {
          const req = { sourceName: it.sourceName, imageFormat: 'jpg', imageCompressionQuality: 80 };
          if (base) req.imageWidth = 480;
          ws.call('GetSourceScreenshot', req)
            .then((r) => {
              if (!r.imageData) return;
              if (!base) {
                const probe = new Image();
                probe.onload = () => {
                  const e = it.expand;
                  const w = probe.naturalWidth - e.l - e.r, h = probe.naturalHeight - e.t - e.b;
                  if (w > 0 && h > 0) { base = { w, h }; aspect = h / w; }
                  showGrow();
                  img.src = r.imageData;
                };
                probe.src = r.imageData;
              } else {
                img.src = r.imageData;
              }
            })
            .catch(() => { /* sin captura: solo anclas y rejilla */ });
        }, delay);
      }
      img.onload = () => draw();

      // Ampliar el lienzo: media fuente de margen a cada lado, justo el rango de las esquinas (-50..150 %)
      grow.addEventListener('click', () => {
        const on = expanded(it.expand);
        if (!on && !base) return;
        it.expand = on ? { l: 0, r: 0, t: 0, b: 0 }
          : { l: Math.round(base.w / 2), r: Math.round(base.w / 2), t: Math.round(base.h / 2), b: Math.round(base.h / 2) };
        send(it, { expand_left: it.expand.l, expand_right: it.expand.r, expand_top: it.expand.t, expand_bottom: it.expand.b });
        showGrow();
        draw();
        refreshShot(300);
      });
      showGrow();

      const local = (e) => {
        const b = canvas.getBoundingClientRect();
        return [e.clientX - b.left, e.clientY - b.top];
      };
      const nearest = (x, y, s) => {
        let best = -1, bd = HIT;
        it.corners.forEach((p, i) => {
          const [px, py] = toPx(p, s);
          const d = Math.hypot(px - x, py - y);
          if (d <= bd) { bd = d; best = i; }
        });
        return best;
      };

      canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const s = size();
        const [x, y] = local(e);
        let idx = e.altKey ? -1 : nearest(x, y, s);
        if (idx < 0) {
          if (!e.altKey && !inside(toPct(x, y, s), it.corners)) return;
          idx = 'all';
        }
        canvas.setPointerCapture(e.pointerId);
        drag = { idx, partner: -1, start: toPct(x, y, s), base: it.corners.map((p) => p.slice()) };
        it.dragging = true;
        canvas.classList.add('active');
        draw();
      });

      canvas.addEventListener('pointermove', (e) => {
        const s = size();
        const [x, y] = local(e);
        if (!drag) {
          const h = nearest(x, y, s);
          if (h !== hover) { hover = h; draw(); }
          canvas.style.cursor = h >= 0 ? 'crosshair' : inside(toPct(x, y, s), it.corners) ? 'move' : 'default';
          return;
        }
        const p = toPct(x, y, s);
        const dx = p[0] - drag.start[0];
        const dy = p[1] - drag.start[1];
        const c = drag.base.map((q) => q.slice());
        drag.partner = -1;
        if (drag.idx === 'all') {
          for (const q of c) { q[0] += dx; q[1] += dy; }
        } else if (e.shiftKey) {
          // Perspectiva: la esquina se mueve sobre un eje y su vecina del mismo lado, en espejo
          const i = drag.idx;
          if (Math.abs(dx) >= Math.abs(dy)) {
            const j = [1, 0, 3, 2][i];           // misma fila: tl↔tr, br↔bl
            c[i][0] += dx;
            c[j][0] -= dx;
            drag.partner = j;
          } else {
            const j = [3, 2, 1, 0][i];           // misma columna: tl↔bl, tr↔br
            c[i][1] += dy;
            c[j][1] -= dy;
            drag.partner = j;
          }
        } else {
          c[drag.idx][0] += dx;
          c[drag.idx][1] += dy;
        }
        it.corners = c.map((q) => [clampPct(q[0]), clampPct(q[1])]);
        draw();
        sendLatest(it, settingsOf(it.corners));
      });

      const end = () => {
        if (!drag) return;
        drag = null;
        it.dragging = false;
        canvas.classList.remove('active');
        draw();
        refreshShot(250);
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('pointerleave', () => { if (!drag && hover !== -1) { hover = -1; draw(); } });

      const zero = () => {
        it.corners = DEF.map((q) => q.slice());
        draw();
        sendLatest(it, settingsOf(it.corners));
        refreshShot(250);
      };
      canvas.addEventListener('dblclick', zero);
      reset.addEventListener('click', zero);

      refs.set(it.key, { show: () => { showGrow(); draw(); refreshShot(250); } });
      requestAnimationFrame(draw);
      refreshShot(0);
      if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(canvas);
      return wrapEl;
    }

    return { read, readExpand, pad };
  })();

  // ------------------------------------------------------------------ 3D Effect (Exeldro)
  // Pad para girar el filtro "3D Effect" arrastrando con el mouse:
  //   arrastrar = rotación X/Y · Shift + arrastrar = rotación Z · Ctrl + arrastrar = mover X/Y
  //   rueda = acercar/alejar (posición Z) · doble clic = volver a 0
  const FX3D = (() => {
    const DEG_PER_PX = 0.5;
    const MOVE_PX_PER_PX = 4;
    const WHEEL_Z = 40;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;   // siempre en -180..180, como los sliders
    const r2 = (v) => Math.round(v * 100) / 100;

    function item(sourceName, f) {
      const s = f.filterSettings || {};
      return {
        key: sourceName + '\u0000' + f.filterName,
        sourceName,
        filterName: f.filterName,
        enabled: f.filterEnabled,
        own: true,
        entry: null,
        detail: 'Exeldro',
        type: '3d',
        rx: num(s.rot_x, 0), ry: num(s.rot_y, 0), rz: num(s.rot_z, 0),
        px: num(s.pos_x, 0), py: num(s.pos_y, 0), pz: num(s.pos_z, 0),
        dragging: false,
      };
    }

    function push(it) {
      sendLatest(it, {
        rot_x: r2(it.rx), rot_y: r2(it.ry), rot_z: r2(it.rz),
        pos_x: Math.round(it.px), pos_y: Math.round(it.py), pos_z: Math.round(it.pz),
      });
    }

    function readout(it, out) {
      out.textContent = `X ${Math.round(it.rx)}°  Y ${Math.round(it.ry)}°  Z ${Math.round(it.rz)}°` +
        (it.px || it.py || it.pz ? `   ·   ${Math.round(it.px)}, ${Math.round(it.py)}, ${Math.round(it.pz)} px` : '');
    }

    // Plano de referencia con la misma rotación (CSS 3D). OBS y CSS usan y hacia abajo y la regla
    // de la mano derecha. El filtro apila rot X, Y, Z en la pila de matrices, así que al vértice se
    // le aplica Z, luego Y, luego X; en CSS "rotateX rotateY rotateZ" da exactamente ese orden.
    function preview(it, card) {
      card.style.transform = `rotateX(${it.rx}deg) rotateY(${it.ry}deg) rotateZ(${it.rz}deg)`;
    }

    function pad(it) {
      const wrapEl = el('div', 'fx3d');
      const area = el('div', 'fx3d-pad');
      area.tabIndex = 0;
      area.title = t('fx3dHelp');
      area.setAttribute('aria-label', t('fx3dAria', it.filterName));
      const stage = el('div', 'fx3d-stage');
      const card = el('div', 'fx3d-card');
      stage.append(card);
      area.append(stage);
      const out = el('div', 'fx3d-out');
      const reset = iconButton('reset', t('fx3dReset'));
      const foot = el('div', 'fx3d-foot');
      foot.append(out, reset);
      wrapEl.append(area, foot);

      const show = () => { readout(it, out); preview(it, card); };
      show();
      refs.set(it.key, { show });

      let last = null;
      area.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        area.setPointerCapture(e.pointerId);
        last = { x: e.clientX, y: e.clientY };
        it.dragging = true;
        area.classList.add('active');
      });
      area.addEventListener('pointermove', (e) => {
        if (!last) return;
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        if (e.ctrlKey) {
          it.px += dx * MOVE_PX_PER_PX;
          it.py += dy * MOVE_PX_PER_PX;
        } else if (e.shiftKey) {
          it.rz = wrap(it.rz + dx * DEG_PER_PX);
        } else {
          it.ry = wrap(it.ry + dx * DEG_PER_PX);
          it.rx = wrap(it.rx + dy * DEG_PER_PX);
        }
        show();
        push(it);
      });
      const end = () => { last = null; it.dragging = false; area.classList.remove('active'); };
      area.addEventListener('pointerup', end);
      area.addEventListener('pointercancel', end);
      area.addEventListener('wheel', (e) => {
        e.preventDefault();
        it.pz += (e.deltaY < 0 ? 1 : -1) * WHEEL_Z;
        show();
        push(it);
      }, { passive: false });
      const zero = () => {
        it.rx = it.ry = it.rz = 0;
        it.px = it.py = it.pz = 0;
        show();
        push(it);
      };
      area.addEventListener('dblclick', zero);
      reset.addEventListener('click', zero);
      // Flechas: 5° por pulsación (Shift: eje Z)
      area.addEventListener('keydown', (e) => {
        const step = 5;
        const k = e.key;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
        e.preventDefault();
        if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) it.rz = wrap(it.rz + (k === 'ArrowRight' ? step : -step));
        else if (k === 'ArrowLeft' || k === 'ArrowRight') it.ry = wrap(it.ry + (k === 'ArrowRight' ? step : -step));
        else it.rx = wrap(it.rx + (k === 'ArrowDown' ? step : -step));
        show();
        push(it);
      });
      return wrapEl;
    }

    return { kind: '3d_effect_filter', item, pad };
  })();

  // Si los sliders de OBS cambian el 3D Effect, el pad se pone al día (salvo mientras se arrastra)
  function onFilterSettings(d) {
    const it = items.find((i) => (i.type === '3d' || i.type === 'corners') && i.sourceName === d.sourceName && i.filterName === d.filterName);
    if (!it || it.dragging) return;
    const s = d.filterSettings || {};
    if (it.type === 'corners') {
      it.corners = CORNERS.read(s);
      it.expand = CORNERS.readExpand(s);
      const r = refs.get(it.key);
      if (r && r.show) r.show();
      return;
    }
    const num = (v, f) => (typeof v === 'number' && isFinite(v) ? v : f);
    it.rx = num(s.rot_x, 0); it.ry = num(s.rot_y, 0); it.rz = num(s.rot_z, 0);
    it.px = num(s.pos_x, 0); it.py = num(s.pos_y, 0); it.pz = num(s.pos_z, 0);
    const r = refs.get(it.key);
    if (r && r.show) r.show();
  }

  const fmt = (n) => (Math.round(n * 10) / 10).toString();

  function showProgress(it, p) {
    it.progress = p;
    const r = refs.get(it.key);
    if (!r) return;
    r.range.value = p;
    r.pct.textContent = `${Math.round(p)}%`;
  }

  function showPlaying(it, playing) {
    const r = refs.get(it.key);
    if (!r) return;
    setIcon(r.bPlay, playing ? 'stop' : 'play', playing ? t('stop') : t('play', fmt(it.duration)));
    r.bPlay.classList.toggle('playing', playing);
  }

  function showLoop(it, on) {
    it.autoPlay = on;
    const r = refs.get(it.key);
    if (r) r.loopCb.checked = on;
  }

  // ------------------------------------------------------------------ acciones
  function send(it, filterSettings) {
    return ws.call('SetSourceFilterSettings', {
      sourceName: it.sourceName,
      filterName: it.filterName,
      filterSettings,
      overlay: true,
    }).catch((err) => console.warn('[shader-dock]', it.filterName, err.message));
  }

  function setEnabled(it, on, box, sw) {
    it.enabled = on;
    box.classList.toggle('off', !on);
    sw.title = on ? t('turnOff') : t('turnOn');
    ws.call('SetSourceFilterEnabled', { sourceName: it.sourceName, filterName: it.filterName, filterEnabled: on })
      .catch((err) => console.warn('[shader-dock]', err.message));
  }

  // Inicia la secuencia: apaga el bucle y mueve Progreso de 0 a 100 en la duración del filtro
  function play(it) {
    stop(it.key);
    const a = { t0: performance.now(), dur: it.duration, timer: 0, busy: false };
    anims.set(it.key, a);
    showLoop(it, false);
    showPlaying(it, true);
    showProgress(it, 0);
    send(it, { auto_play: false, progress: 0 });

    const tick = () => {
      if (anims.get(it.key) !== a) return;
      const p = Math.min(100, (performance.now() - a.t0) / (a.dur * 10));
      showProgress(it, p);
      if (p >= 100) {
        anims.delete(it.key);
        showPlaying(it, false);
        send(it, { progress: 100 });
        return;
      }
      // Si OBS aún no contesta la petición anterior, se salta este cuadro en vez de encolar
      if (!a.busy) {
        a.busy = true;
        send(it, { progress: p }).finally(() => { a.busy = false; });
      }
      a.timer = setTimeout(tick, TICK_MS);
    };
    a.timer = setTimeout(tick, TICK_MS);
  }

  function stop(key) {
    const a = anims.get(key);
    if (!a) return;
    clearTimeout(a.timer);
    anims.delete(key);
    const it = items.find((i) => i.key === key);
    if (it) showPlaying(it, false);
  }

  function stopAll() {
    for (const key of [...anims.keys()]) stop(key);
  }

  function jump(it, p) {
    stop(it.key);
    showLoop(it, false);
    showProgress(it, p);
    send(it, { auto_play: false, progress: p });
  }

  let scrubPending = null;
  let scrubBusy = false;
  function scrub(it, p) {
    stop(it.key);
    showLoop(it, false);
    showProgress(it, p);
    scrubPending = { it, p };
    if (scrubBusy) return;
    const flush = () => {
      if (!scrubPending) { scrubBusy = false; return; }
      const { it: t, p: v } = scrubPending;
      scrubPending = null;
      scrubBusy = true;
      send(t, { auto_play: false, progress: v }).finally(flush);
    };
    flush();
  }

  function setLoop(it, on) {
    if (on) stop(it.key);
    showLoop(it, on);
    send(it, { auto_play: on });
  }

  // ------------------------------------------------------------------ arranque
  const conf = currentConfig();
  if (conf.known) connect(conf, false);
  else { showMessage('noConnection', 'configure'); openDialog(); }
})();
