/* ==========================================================================
   stereo.js — Modo VR Box v2: render estereoscópico calibrable
   • Cada ojo se dibuja centrado en SU lente (no en la mitad de la pantalla),
     con separación y altura ajustables en milímetros.
   • Corrección de distorsión de barril (k1, k2) para compensar los lentes.
   • Campo de visión y tamaño de imagen ajustables.
   • Perfiles de visores comunes y guardado en el celular (localStorage).
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;
  var KEY = 'br-vrbox-calib-v2';

  // Píxeles CSS por milímetro: la mayoría de celulares están entre 6 y 6.6.
  var PX_PER_MM = 6.3;

  var PROFILES = {
    vrbox:      { name: 'VR Box (genérico)', sep: 62, offY: 0, zoom: 1.0, k1: 0.30, k2: 0.15, fov: 88 },
    cardboard2: { name: 'Google Cardboard v2', sep: 64, offY: 0, zoom: 1.0, k1: 0.34, k2: 0.55, fov: 90 },
    cardboard1: { name: 'Google Cardboard v1', sep: 60, offY: 0, zoom: 1.0, k1: 0.441, k2: 0.156, fov: 80 },
    plain:      { name: 'Sin distorsión', sep: 62, offY: 0, zoom: 1.0, k1: 0, k2: 0, fov: 80 }
  };

  var PARAMS = [
    { key: 'sep',  label: 'Separación de lentes', min: 45, max: 80, step: 0.5, unit: ' mm', dec: 1 },
    { key: 'offY', label: 'Altura de la imagen',  min: -25, max: 25, step: 0.5, unit: ' mm', dec: 1 },
    { key: 'zoom', label: 'Tamaño de la imagen',  min: 0.6, max: 1.6, step: 0.02, unit: 'x', dec: 2 },
    { key: 'k1',   label: 'Curvatura de lente k1', min: 0, max: 0.9, step: 0.01, unit: '', dec: 2 },
    { key: 'k2',   label: 'Curvatura de lente k2', min: 0, max: 0.9, step: 0.01, unit: '', dec: 2 },
    { key: 'fov',  label: 'Campo de visión',      min: 60, max: 115, step: 1, unit: '°', dec: 0 }
  ];

  var S = window.BRStereo = {
    PROFILES: PROFILES,
    PARAMS: PARAMS,
    settings: null,
    profile: 'vrbox',
    hasSaved: false,
    calibrating: false
  };

  /* ---------- Guardado ---------- */
  S.load = function () {
    var p = PROFILES.vrbox, saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    S.settings = {};
    PARAMS.forEach(function (pp) { S.settings[pp.key] = p[pp.key]; });
    if (saved && saved.settings) {
      PARAMS.forEach(function (pp) {
        var v = Number(saved.settings[pp.key]);
        if (isFinite(v)) S.settings[pp.key] = Math.min(pp.max, Math.max(pp.min, v));
      });
      S.profile = saved.profile || 'custom';
      S.hasSaved = true;
    }
  };
  S.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify({ profile: S.profile, settings: S.settings })); S.hasSaved = true; } catch (e) { /* modo privado */ }
  };
  S.applyProfile = function (id) {
    var p = PROFILES[id];
    if (!p) return;
    S.profile = id;
    PARAMS.forEach(function (pp) { S.settings[pp.key] = p[pp.key]; });
  };
  S.set = function (key, value) {
    var pp = PARAMS.filter(function (x) { return x.key === key; })[0];
    if (!pp) return;
    S.settings[key] = Math.min(pp.max, Math.max(pp.min, Math.round(value / pp.step) * pp.step));
    S.profile = 'custom';
  };
  S.format = function (pp) { return Number(S.settings[pp.key]).toFixed(pp.dec) + pp.unit; };
  S.load();

  /* ---------- Shader de composición con distorsión ---------- */
  var postMat = new THREE.ShaderMaterial({
    uniforms: {
      tL: { value: null }, tR: { value: null },
      res: { value: new THREE.Vector2(1, 1) },
      cL: { value: new THREE.Vector2() }, cR: { value: new THREE.Vector2() },
      halfW: { value: 1 }, radius: { value: 1 },
      k1: { value: 0 }, k2: { value: 0 },
      calib: { value: 0 }, lineW: { value: 1.5 }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tL; uniform sampler2D tR;',
      'uniform vec2 res; uniform vec2 cL; uniform vec2 cR;',
      'uniform float halfW; uniform float radius; uniform float k1; uniform float k2;',
      'uniform float calib; uniform float lineW;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 p = vUv * res;',
      '  bool left = p.x < halfW;',
      '  vec2 c = left ? cL : cR;',
      '  vec2 d = (p - c) / radius;',
      '  float r2 = dot(d, d);',
      '  vec2 s = d * (1.0 + k1 * r2 + k2 * r2 * r2);',
      '  vec2 uv = s * 0.5 + 0.5;',
      '  vec4 col = vec4(0.0, 0.0, 0.0, 1.0);',
      '  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {',
      '    col = left ? texture2D(tL, uv) : texture2D(tR, uv);',
      '    float e = max(abs(s.x), abs(s.y));',
      '    col.rgb *= 1.0 - smoothstep(0.92, 1.0, e);', // borde suave
      '  }',
      '  if (calib > 0.5) {',
      '    vec2 q = p - c; float rr = length(q);',
      '    bool cross = (abs(q.x) < lineW || abs(q.y) < lineW) && rr < radius * 0.9;',
      '    bool ring1 = abs(rr - radius * 0.25) < lineW;',
      '    bool ring2 = abs(rr - radius * 0.6) < lineW;',
      '    if (cross || ring1 || ring2) col = vec4(0.2, 1.0, 0.45, 1.0);',
      '    if (abs(p.x - halfW) < lineW) col = vec4(1.0, 0.3, 0.2, 1.0);',
      '  }',
      '  gl_FragColor = col;',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n'),
    depthTest: false,
    depthWrite: false
  });
  var postScene = new THREE.Scene();
  var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  quad.frustumCulled = false;
  postScene.add(quad);
  var postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var rtL = null, rtR = null, rtSize = 0;
  function ensureTargets(size) {
    if (size === rtSize && rtL) return;
    if (rtL) { rtL.dispose(); rtR.dispose(); }
    var opts = { depthBuffer: true, stencilBuffer: false };
    rtL = new THREE.WebGLRenderTarget(size, size, opts);
    rtR = new THREE.WebGLRenderTarget(size, size, opts);
    if ('colorSpace' in rtL.texture) { rtL.texture.colorSpace = THREE.SRGBColorSpace; rtR.texture.colorSpace = THREE.SRGBColorSpace; }
    rtSize = size;
  }

  var eyeL = new THREE.PerspectiveCamera(80, 1, 0.05, 60);
  var eyeR = new THREE.PerspectiveCamera(80, 1, 0.05, 60);
  [eyeL, eyeR].forEach(function (e) { e.matrixAutoUpdate = false; e.matrixWorldAutoUpdate = false; });
  var offset = new THREE.Matrix4(), size = new THREE.Vector2(), buf = new THREE.Vector2();

  // Geometría de cada ojo en píxeles del framebuffer.
  S.layout = function (renderer) {
    renderer.getSize(size);           // px CSS
    renderer.getDrawingBufferSize(buf); // px reales
    var dpr = buf.x / Math.max(1, size.x);
    var st = S.settings, mm = PX_PER_MM * dpr;
    var halfW = buf.x / 2;
    var sepPx = st.sep * mm;
    var cy = buf.y / 2 + st.offY * mm;
    var radius = 0.5 * Math.min(halfW, buf.y) * st.zoom;
    return { halfW: halfW, cL: new THREE.Vector2(halfW - sepPx / 2, cy), cR: new THREE.Vector2(halfW + sepPx / 2, cy), radius: radius, buf: buf.clone(), dpr: dpr };
  };

  /* ---------- Render principal ---------- */
  S.render = function (renderer, origRender, scene, camera) {
    if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
    if (camera.parent === null) camera.updateMatrixWorld();
    var L = S.layout(renderer), st = S.settings;

    // Resolución de cada ojo según el tamaño en pantalla (limitada para móviles).
    var target = Math.min(1280, Math.max(256, Math.round(L.radius * 2 * 1.15 / 64) * 64));
    ensureTargets(target);

    var half = 0.032; // media distancia interpupilar para la paralaje (m)
    [[eyeL, -half], [eyeR, half]].forEach(function (pair) {
      var e = pair[0];
      e.fov = st.fov; e.aspect = 1; e.near = camera.near; e.far = camera.far;
      e.updateProjectionMatrix();
      offset.makeTranslation(pair[1], 0, 0);
      e.matrixWorld.multiplyMatrices(camera.matrixWorld, offset);
      e.matrixWorldInverse.copy(e.matrixWorld).invert();
    });

    var prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(rtL); origRender(scene, eyeL);
    renderer.setRenderTarget(rtR); origRender(scene, eyeR);
    renderer.setRenderTarget(prevTarget);

    var u = postMat.uniforms;
    u.tL.value = rtL.texture; u.tR.value = rtR.texture;
    u.res.value.copy(L.buf);
    u.cL.value.copy(L.cL); u.cR.value.copy(L.cR);
    u.halfW.value = L.halfW; u.radius.value = L.radius;
    u.k1.value = st.k1; u.k2.value = st.k2;
    u.calib.value = S.calibrating ? 1 : 0;
    u.lineW.value = 1.2 * L.dpr;
    origRender(postScene, postCam);
  };
})();
