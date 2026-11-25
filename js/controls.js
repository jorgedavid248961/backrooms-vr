/* ==========================================================================
   controls.js — Movimiento del jugador
   Fuentes de entrada (todas combinables):
     • Control Bluetooth del VR Box (Gamepad API: joystick, cruceta, botones)
     • Teclado: WASD / flechas (PC y mandos que emulan teclado)
     • Mantener tocada la pantalla (1 dedo = avanzar, 2 dedos = retroceder)
     • Gatillo del visor en modo WebXR (evento "select")
     • Mirar el botón flotante del suelo ~1 s para activar/detener la caminata
   Siempre se camina hacia donde mira la cámara (giroscopio 3DoF / ratón).
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;

  var C = window.BRControls = {
    keys: {},
    touches: 0,
    xrSelect: false,
    autoWalk: false,
    gazeProgress: 0,
    gazeArmed: true,
    gamepadName: '',
    moving: false,
    speed: 2.4,
    runMult: 1.6,
    stamina: 100,
    running: false,
    padRun: false,
    noise: 0,      // 0 quieto, 1 caminando, 2 corriendo (la entidad lo oye)
    radius: 0.3
  };
  function flash() { window.dispatchEvent(new CustomEvent('br-flash')); }

  function action(src) { window.dispatchEvent(new CustomEvent('br-action', { detail: src })); }

  /* ---------- Teclado ---------- */
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    C.keys[k] = true;
    if (k === ' ' || k === 'enter' || k === 'r') action('key');
    if (k === 'f' && !e.repeat) flash();
    if (k.indexOf('arrow') === 0 || k === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { C.keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function () { C.keys = {}; C.touches = 0; });

  /* ---------- Pantalla táctil (mantener para caminar) ---------- */
  function isUI(t) { return t && t.closest && t.closest('button, a, .ui'); }
  document.addEventListener('touchstart', function (e) {
    if (isUI(e.target)) return;
    C.touches = e.touches.length;
    action('touch');
  }, { passive: true });
  document.addEventListener('touchend', function (e) { C.touches = e.touches.length; }, { passive: true });
  document.addEventListener('touchcancel', function () { C.touches = 0; }, { passive: true });
  // Ratón: clic para acción (reiniciar) en PC.
  document.addEventListener('mousedown', function (e) { if (!isUI(e.target)) action('mouse'); });

  /* ---------- Gamepad (control Bluetooth del VR Box) ---------- */
  var prevButtons = [];
  function readGamepad() {
    var out = { x: 0, y: 0, run: false };
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var gp = pads[i];
      if (!gp || !gp.connected) continue;
      // Ignorar mandos de XR sin ejes útiles (p.ej. el "botón" del Cardboard).
      C.gamepadName = gp.id;
      var ax = gp.axes || [];
      // Elegir el par de ejes con más desplazamiento (algunos mandos usan 2/3).
      var bx = 0, by = 0, best = 0;
      for (var a = 0; a + 1 < ax.length; a += 2) {
        var m = Math.abs(ax[a]) + Math.abs(ax[a + 1]);
        if (m > best) { best = m; bx = ax[a]; by = ax[a + 1]; }
      }
      // Hat switch codificado en un solo eje (mandos genéricos chinos: eje 9).
      if (ax.length > 9 && ax[9] >= -1 && ax[9] <= 1 && Math.abs(ax[9]) < 1.2 && best < 0.25) {
        var hv = ax[9];
        if (hv > -1.05 && hv < -0.95) { by = -1; }            // arriba
        else if (hv > -0.5 && hv < -0.35) { bx = 1; }         // derecha
        else if (hv > 0.1 && hv < 0.2) { by = 1; }            // abajo
        else if (hv > 0.65 && hv < 0.75) { bx = -1; }         // izquierda
      }
      out.x += bx; out.y += by;
      var b = gp.buttons || [];
      // Cruceta estándar.
      if (b[12] && b[12].pressed) out.y -= 1;
      if (b[13] && b[13].pressed) out.y += 1;
      if (b[14] && b[14].pressed) out.x -= 1;
      if (b[15] && b[15].pressed) out.x += 1;
      // Botones de acción (flanco de subida) => reiniciar / alternar caminata.
      var prev = prevButtons[i] || [];
      for (var k = 0; k < Math.min(b.length, 12); k++) {
        var p = b[k] && b[k].pressed;
        if (p && !prev[k]) {
          action('gamepad');
          if (k === 0 || k === 2 || k === 3) flash();   // A / X / Y: linterna
        }
        prev[k] = p;
      }
      prevButtons[i] = prev;
      // B, gatillos y bumpers: correr mientras se mantienen.
      [1, 4, 5, 6, 7].forEach(function (bi) { if (b[bi] && b[bi].pressed) out.run = true; });
    }
    var dz = 0.22;
    out.x = Math.abs(out.x) < dz ? 0 : Math.max(-1, Math.min(1, out.x));
    out.y = Math.abs(out.y) < dz ? 0 : Math.max(-1, Math.min(1, out.y));
    return out;
  }
  window.addEventListener('gamepadconnected', function (e) {
    C.gamepadName = e.gamepad.id;
    window.dispatchEvent(new CustomEvent('br-gamepad', { detail: e.gamepad.id }));
  });

  /* ---------- Componente A-Frame en el "rig" del jugador ---------- */
  AFRAME.registerComponent('br-controls', {
    schema: { camera: { type: 'selector' } },

    init: function () {
      this.fwd = new THREE.Vector3();
      this.right = new THREE.Vector3();
      this.raw = new THREE.Vector3();
      this.camPos = new THREE.Vector3();
      this.stepDist = 0;
      this.bob = 0;
      var self = this, scene = this.el.sceneEl;

      // Botón flotante del suelo ("mira aquí para caminar").
      this.gaze = BRTextures.gazeButton();
      this.gazeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.75),
        new THREE.MeshBasicMaterial({ map: this.gaze.texture, transparent: true, depthWrite: false, toneMapped: false, fog: false })
      );
      this.gazeMesh.rotation.x = -Math.PI / 2;
      this.gazeMesh.renderOrder = 5;
      scene.object3D.add(this.gazeMesh);

      // Gatillo del visor en WebXR (Cardboard) => caminar mientras se mantiene.
      scene.addEventListener('enter-vr', function () {
        var s = scene.xrSession;
        if (!s) return;
        s.addEventListener('selectstart', function () { C.xrSelect = true; action('xr'); });
        s.addEventListener('selectend', function () { C.xrSelect = false; });
      });
      scene.addEventListener('exit-vr', function () { C.xrSelect = false; self.el.object3D.position.y = 0; });
    },

    // Cámara que realmente está renderizando (XR o normal).
    viewCamera: function () {
      var scene = this.el.sceneEl, r = scene.renderer;
      if (r && r.xr && r.xr.isPresenting) return r.xr.getCamera();
      return scene.camera;
    },

    tick: function (t, dtMs) {
      var dt = Math.min(0.05, (dtMs || 16) / 1000);
      var game = window.BRGame;
      var rig = this.el.object3D;
      var scene = this.el.sceneEl;
      var xr = scene.renderer && scene.renderer.xr && scene.renderer.xr.isPresenting;
      var cam = this.viewCamera();
      if (!cam) return;

      cam.getWorldDirection(this.raw);
      cam.getWorldPosition(this.camPos);

      // Corrección de altura de ojos en WebXR 3DoF (algunos visores reportan y = 0).
      if (xr) {
        var headLocal = this.camPos.y - rig.position.y;
        var target = Math.max(-1.6, Math.min(1.6, 1.6 - headLocal));
        rig.position.y += (target - rig.position.y) * Math.min(1, dt * 5);
      }

      var gp = readGamepad();
      C.pad = gp;
      var playing = game && game.state === 'playing' && !game.calibrating;

      // Botón de mirada en el suelo.
      this.gazeMesh.position.set(rig.position.x, 0.03, rig.position.z);
      this.gazeMesh.visible = playing;
      if (playing) {
        var lookingDown = this.raw.y < -0.8;
        if (lookingDown && C.gazeArmed) {
          C.gazeProgress += dt / 1.1;
          if (C.gazeProgress >= 1) {
            C.autoWalk = !C.autoWalk;
            C.gazeProgress = 0;
            C.gazeArmed = false;
          }
        } else {
          C.gazeProgress = Math.max(0, C.gazeProgress - dt * 2);
          if (this.raw.y > -0.55) C.gazeArmed = true;
        }
        this.gaze.draw(C.gazeProgress, C.autoWalk);
      }

      if (!playing) { C.moving = false; C.noise = 0; return; }

      // Ejes de movimiento combinados.
      var k = C.keys, f = 0, s = 0;
      if (k.w || k.arrowup) f += 1;
      if (k.s || k.arrowdown) f -= 1;
      if (k.d || k.arrowright) s += 1;
      if (k.a || k.arrowleft) s -= 1;
      f += -gp.y; s += gp.x;
      if (C.touches === 1 || C.xrSelect) f += 1;
      if (C.touches >= 2) f -= 1;
      if (C.autoWalk && this.raw.y > -0.8) f += 1;
      f = Math.max(-1, Math.min(1, f)); s = Math.max(-1, Math.min(1, s));

      this.fwd.set(this.raw.x, 0, this.raw.z);
      if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
      this.fwd.normalize();
      this.right.set(-this.fwd.z, 0, this.fwd.x);

      var vx = (this.fwd.x * f + this.right.x * s), vz = (this.fwd.z * f + this.right.z * s);
      var len = Math.sqrt(vx * vx + vz * vz);
      if (len > 1) { vx /= len; vz /= len; len = 1; }
      var p = rig.position;
      var ox = p.x, oz = p.z;
      var inWater = !!(game.maze && game.maze.isWater && game.maze.isWater(p.x, p.z));
      C.inWater = inWater;
      // Correr (Shift o botón B/gatillo del control): gasta aliento y hace ruido.
      var wantRun = (k.shift || gp.run) && f > 0.3 && C.stamina > 3;
      C.running = wantRun;
      C.stamina = Math.max(0, Math.min(100, C.stamina + (wantRun ? -28 : 16) * dt));
      var spd = C.speed * (inWater ? 0.7 : 1) * (wantRun ? C.runMult : 1);
      if (len > 0.01) {
        p.x += vx * spd * dt;
        p.z += vz * spd * dt;
      }
      if (game.maze) game.maze.resolve(p, C.radius);
      var moved = Math.sqrt((p.x - ox) * (p.x - ox) + (p.z - oz) * (p.z - oz));
      C.moving = moved > 0.002;
      C.noise = !C.moving ? 0 : (C.running ? 2 : 1);

      // Pasos sincronizados con la distancia recorrida.
      this.stepDist += moved;
      if (this.stepDist > (inWater ? 0.6 : (C.running ? 1.0 : 0.78))) {
        this.stepDist = 0;
        if (window.BRAudio) BRAudio.footstep(C.running ? 1.6 : 1, inWater);
      }

      // Balanceo de cabeza sólo en pantalla normal (en VR marea).
      var camEl = this.data.camera;
      if (camEl && !xr && !(game && game.stereo)) {
        if (C.moving) this.bob += moved * 7.5;
        var targetY = (inWater ? 1.5 : 1.6) + (C.moving ? Math.sin(this.bob) * 0.03 : 0);
        var cp = camEl.object3D.position;
        cp.y += (targetY - cp.y) * Math.min(1, dt * 10);
      }
    }
  });
})();
