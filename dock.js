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
    if (manualClose) return;
    setStatus('wait', 'reconnecting');
    showMessage('lost', 'retrying');
    retryTimer = setTimeout(() => connect(session || currentConfig(), false), RETRY_MS);
  });

  ws.addEventListener('obs-event', (ev) => {
    if (REFRESH_EVENTS.has(ev.detail.eventType)) scheduleRefresh();
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

  function render() {
    refs.clear();
    const list = $('list');
    const visible = items.filter((i) => i.own || showOthers.checked);
    if (!visible.length) {
      const hidden = items.length - visible.length;
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

  const labelOf = (it) => (it.entry ? (I18N.lang === 'en' && it.entry.label_en) || it.entry.label : it.filterName);

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
    }
    return box;
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
