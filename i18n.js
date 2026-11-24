// Textos del dock en español e inglés. / Dock strings in Spanish and English.
(function () {
  'use strict';

  const STR = {
    es: {
      title: 'Shaders',
      refresh: 'Actualizar lista',
      settings: 'Conexión',
      showOthers: 'Mostrar otros shaders',
      liveOnly: 'Solo escena en vivo',
      liveOnlyTip: 'Solo los filtros de la escena al aire, incluidos grupos y escenas anidadas (y de la vista previa en modo estudio). Si no tiene ninguno, se muestran todos.',
      onAir: 'En vivo',
      inPreview: 'Vista previa',
      language: 'Idioma',
      dlgTitle: 'Conectar con OBS',
      dlgHelp: 'En OBS: Herramientas → Ajustes del servidor WebSocket. Activa el servidor y copia el puerto y la contraseña.',
      host: 'Host',
      port: 'Puerto',
      password: 'Contraseña',
      remember: 'Recordar en este dock',
      forget: 'Olvidar datos',
      cancel: 'Cancelar',
      connect: 'Conectar',
      forgotten: 'Datos olvidados.',
      connecting: 'Conectando…',
      disconnected: 'Desconectado',
      connectedTo: 'Conectado a {0}',
      reconnecting: 'Reconectando…',
      obsDown: 'OBS no responde',
      retryingEvery: 'Reintentando cada pocos segundos…',
      lost: 'Se perdió la conexión con OBS',
      retrying: 'Reintentando…',
      noConnection: 'Sin conexión',
      configure: 'Configura el puerto y la contraseña del WebSocket de OBS.',
      noShaders: 'No hay shaders en esta colección',
      hiddenOthers: 'Hay {0} shader(s) de otros autores; activa "Mostrar otros shaders".',
      addOne: 'Agrega uno con Filtros → + → User-defined shader → Load shader text from file.',
      inlineShader: 'shader escrito en el filtro',
      tabFx: 'Efectos',
      tabGeo: 'Geometría',
      noGeometry: 'No hay filtros de geometría',
      addGeometry: 'Agrega un filtro 3D Effect, o un User-defined shader con perspectiva.shader.',
      turnOff: 'Apagar filtro',
      turnOn: 'Encender filtro',
      turnOnName: 'Encender {0}',
      toStart: 'Llevar al principio',
      play: 'Iniciar ({0} s)',
      stop: 'Detener',
      toEnd: 'Llevar al final',
      progressOf: 'Progreso de {0}',
      loop: 'Bucle',
      loopTip: 'Repetir la secuencia sola (Reproducir en bucle)',
      fx3d: 'Efecto 3D',
      fx3dHelp: 'Arrastra: girar X/Y · Shift: girar Z · Ctrl: mover · Rueda: acercar · Doble clic: reiniciar',
      fx3dAria: 'Girar {0} en 3D',
      fx3dReset: 'Volver a 0 (giro y posición)',
      fx3dResetAxis: 'Regresar el giro en {0} a 0',
      cpHelp: 'Arrastra una esquina para moverla · Shift: perspectiva (la esquina vecina en espejo) · Arrastra adentro o Alt: mover todo · Doble clic: reiniciar',
      cpAria: 'Esquinas de {0}',
      cpReset: 'Regresar las esquinas a su lugar',
      cpExpand: 'Dejar salir la imagen del recuadro (activa Expandir del filtro: media fuente a cada lado; la fuente se recorre en la escena)',
      cpShrink: 'Quitar el margen (Expandir a 0): lo que salga del recuadro se vuelve a cortar',
      err_auth_required: 'OBS pide contraseña.',
      err_auth_failed: 'Contraseña incorrecta.',
      err_unreachable: 'No se pudo conectar. Revisa que OBS esté abierto y que el servidor WebSocket esté activado en ese puerto.',
      err_no_crypto: 'Este navegador no permite la autenticación. Abre el dock como archivo local o desde 127.0.0.1.',
      err_bad_url: 'Host o puerto no válidos.',
    },
    en: {
      title: 'Shaders',
      refresh: 'Refresh list',
      settings: 'Connection',
      showOthers: 'Show other shaders',
      liveOnly: 'Live scene only',
      liveOnlyTip: 'Only the filters in the scene on air, including groups and nested scenes (and the preview scene in Studio Mode). If it has none, everything is shown.',
      onAir: 'Live',
      inPreview: 'Preview',
      language: 'Language',
      dlgTitle: 'Connect to OBS',
      dlgHelp: 'In OBS: Tools → WebSocket Server Settings. Enable the server and copy the port and password.',
      host: 'Host',
      port: 'Port',
      password: 'Password',
      remember: 'Remember in this dock',
      forget: 'Forget',
      cancel: 'Cancel',
      connect: 'Connect',
      forgotten: 'Saved details removed.',
      connecting: 'Connecting…',
      disconnected: 'Disconnected',
      connectedTo: 'Connected to {0}',
      reconnecting: 'Reconnecting…',
      obsDown: 'OBS is not responding',
      retryingEvery: 'Retrying every few seconds…',
      lost: 'Lost the connection to OBS',
      retrying: 'Retrying…',
      noConnection: 'Not connected',
      configure: 'Set the OBS WebSocket port and password.',
      noShaders: 'No shaders in this scene collection',
      hiddenOthers: 'There are {0} shader(s) from other authors; turn on "Show other shaders".',
      addOne: 'Add one with Filters → + → User-defined shader → Load shader text from file.',
      inlineShader: 'shader typed into the filter',
      tabFx: 'Effects',
      tabGeo: 'Geometry',
      noGeometry: 'No geometry filters',
      addGeometry: 'Add a 3D Effect filter, or a User-defined shader with perspective.shader.',
      turnOff: 'Turn filter off',
      turnOn: 'Turn filter on',
      turnOnName: 'Turn on {0}',
      toStart: 'Go to start',
      play: 'Play ({0} s)',
      stop: 'Stop',
      toEnd: 'Go to end',
      progressOf: 'Progress of {0}',
      loop: 'Loop',
      loopTip: 'Repeat the sequence on its own (Loop playback)',
      fx3d: '3D Effect',
      fx3dHelp: 'Drag: rotate X/Y · Shift: rotate Z · Ctrl: move · Wheel: zoom · Double-click: reset',
      fx3dAria: 'Rotate {0} in 3D',
      fx3dReset: 'Reset to 0 (rotation and position)',
      fx3dResetAxis: 'Reset {0} rotation to 0',
      cpHelp: 'Drag a corner to move it · Shift: perspective (the neighbouring corner mirrors it) · Drag inside or Alt: move everything · Double-click: reset',
      cpAria: 'Corners of {0}',
      cpReset: 'Put the corners back',
      cpExpand: 'Let the image go past the source bounds (turns on the filter\'s Expand: half the source on each side; the source shifts in the scene)',
      cpShrink: 'Remove the margin (Expand to 0): anything past the bounds is clipped again',
      err_auth_required: 'OBS requires a password.',
      err_auth_failed: 'Wrong password.',
      err_unreachable: 'Could not connect. Check that OBS is open and the WebSocket server is enabled on that port.',
      err_no_crypto: 'This browser does not allow authentication. Open the dock as a local file or from 127.0.0.1.',
      err_bad_url: 'Invalid host or port.',
    },
  };

  let lang = 'es';
  try { lang = JSON.parse(localStorage.getItem('obsShaderDock.lang')) || ''; } catch { lang = ''; }
  if (!STR[lang]) lang = (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';

  function t(key, ...args) {
    const s = (STR[lang] && STR[lang][key]) || STR.es[key] || key;
    return s.replace(/\{(\d)\}/g, (_, i) => (args[i] != null ? args[i] : ''));
  }

  // Aplica los textos fijos del HTML: data-i18n (texto), data-i18n-title, data-i18n-aria
  function apply() {
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }

  function setLang(next) {
    if (!STR[next]) return;
    lang = next;
    try { localStorage.setItem('obsShaderDock.lang', JSON.stringify(lang)); } catch { /* sin almacenamiento */ }
    apply();
  }

  window.I18N = { t, apply, setLang, get lang() { return lang; } };
})();
