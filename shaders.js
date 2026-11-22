// Shaders propios que reconoce el dock, por nombre de archivo (sin importar la carpeta).
//
//   sequence    tiene Progreso y Bucle: el dock da Iniciar / Principio / Final y una barra
//   continuous  corre solo: el dock da encender / apagar
//   stinger     transición: el dock no lo muestra
//
// Para agregar un shader nuevo basta una línea aquí. "duration" es el valor por defecto del
// shader, por si el filtro no lo tiene guardado en sus ajustes.
window.SHADER_MANIFEST = [
  { repo: 'obs-loving-spies', label: 'Cañón',              type: 'sequence',   duration: 10, files: ['canon.shader'] },
  { repo: 'obs-loving-spies', label: 'Sangre',             type: 'sequence',   duration: 4,  files: ['sangre.shader'] },
  { repo: 'obs-loving-spies', label: 'Títulos con siluetas', type: 'continuous',            files: ['titulos.shader'] },

  { repo: 'obs-retro-tv',     label: 'Túnel del tiempo',   type: 'sequence',   duration: 8,  files: ['tunel.shader'] },
  { repo: 'obs-retro-tv',     label: 'Dimensión',          type: 'sequence',   duration: 10, files: ['dimension.shader'] },
  { repo: 'obs-retro-tv',     label: 'Teletransportador',  type: 'sequence',   duration: 5,  files: ['teletransportador.shader'] },
  { repo: 'obs-retro-tv',     label: 'Emblema',            type: 'stinger',                 files: ['emblema.shader'] },

  { repo: 'obs-kr36',         label: 'Títulos voladores',  type: 'sequence',   duration: 8,
    files: ['titulos-voladores.shader', 'flying-titles.shader'] },
  { repo: 'obs-kr36',         label: 'Títulos voladores (huecos)', type: 'sequence', duration: 8,
    files: ['titulos-voladores-hueca.shader', 'flying-titles-hollow.shader'] },
  { repo: 'obs-kr36',         label: 'Títulos voladores R4', type: 'sequence', duration: 8,
    files: ['titulos-voladores-r4.shader', 'flying-titles-r4.shader'] },

  { repo: 'obs-liquid-glass', label: 'Liquid glass',       type: 'continuous',              files: ['liquid-glass.shader'] },
  { repo: 'obs-liquid-glass', label: 'Liquid glass (forma)', type: 'continuous',            files: ['liquid-glass-forma.shader', 'liquid-glass-shape.shader'] },

  { repo: 'obs-modern-tv',    label: 'Glitch',             type: 'continuous',              files: ['glitch.shader'] },
];
