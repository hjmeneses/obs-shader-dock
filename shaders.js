// Shaders propios que reconoce el dock, por nombre de archivo (sin importar la carpeta).
// Own shaders the dock recognizes, by file name (whatever the folder).
//
//   sequence    tiene Progreso y Bucle: el dock da Iniciar / Principio / Final y una barra
//               has Progress and Loop: the dock shows Play / Start / End and a progress bar
//   continuous  corre solo: el dock da encender / apagar  ·  runs on its own: on / off switch
//   stinger     transición: el dock no lo muestra  ·  transition: not listed
//
// "files" incluye la versión en español y la de la carpeta en/. "duration" es el valor por
// defecto del shader, por si el filtro no lo tiene guardado en sus ajustes.
// "files" lists the Spanish file and the one in the en/ folder. "duration" is the shader
// default, used when the filter has not stored it.
window.SHADER_MANIFEST = [
  { repo: 'obs-loving-spies', label: 'Cañón', label_en: 'Gun barrel', type: 'sequence', duration: 10,
    files: ['canon.shader', 'gun-barrel.shader'] },
  { repo: 'obs-loving-spies', label: 'Sangre', label_en: 'Blood', type: 'sequence', duration: 4,
    files: ['sangre.shader', 'blood.shader'] },
  { repo: 'obs-loving-spies', label: 'Títulos con siluetas', label_en: 'Silhouette titles', type: 'continuous',
    files: ['titulos.shader', 'silhouette-titles.shader'] },

  { repo: 'obs-retro-tv', label: 'Túnel del tiempo', label_en: 'Time tunnel', type: 'sequence', duration: 8,
    files: ['tunel.shader', 'time-tunnel.shader'] },
  { repo: 'obs-retro-tv', label: 'Dimensión', label_en: 'Dimension', type: 'sequence', duration: 10,
    files: ['dimension.shader'] },
  { repo: 'obs-retro-tv', label: 'Teletransportador', label_en: 'Teleporter', type: 'sequence', duration: 5,
    files: ['teletransportador.shader', 'teleporter.shader'] },
  { repo: 'obs-retro-tv', label: 'Emblema', label_en: 'Emblem', type: 'stinger',
    files: ['emblema.shader', 'emblem.shader'] },

  { repo: 'obs-kr36', label: 'Títulos voladores', label_en: 'Flying titles', type: 'sequence', duration: 8,
    files: ['titulos-voladores.shader', 'flying-titles.shader'] },
  { repo: 'obs-kr36', label: 'Títulos voladores (huecos)', label_en: 'Flying titles (hollow)', type: 'sequence', duration: 8,
    files: ['titulos-voladores-hueca.shader', 'flying-titles-hollow.shader'] },
  { repo: 'obs-kr36', label: 'Títulos voladores R4', label_en: 'Flying titles R4', type: 'sequence', duration: 8,
    files: ['titulos-voladores-r4.shader', 'flying-titles-r4.shader'] },

  { repo: 'obs-liquid-glass', label: 'Liquid glass', label_en: 'Liquid glass', type: 'continuous',
    files: ['liquid-glass.shader'] },
  { repo: 'obs-liquid-glass', label: 'Liquid glass (forma)', label_en: 'Liquid glass (shape)', type: 'continuous',
    files: ['liquid-glass-forma.shader', 'liquid-glass-shape.shader'] },

  { repo: 'obs-modern-tv', label: 'Glitch', label_en: 'Glitch', type: 'continuous',
    files: ['glitch.shader'] },
];
