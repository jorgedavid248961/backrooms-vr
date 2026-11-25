/* ==========================================================================
   game.js — Orquestación: estados del juego, pantalla de inicio, permisos,
   HUD dentro de la escena (visible en VR), susto, victoria, reinicio y
   "Modo VR Box" (pantalla dividida estereoscópica que funciona en cualquier
   celular, incluido iPhone, aunque el navegador no soporte WebXR).
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;

  var G = window.BRGame = {
    state: 'menu',     // menu | playing | caught | won
    stereo: false,
    time: 0,
    maze: null,
    entity: null,
    restartAt: 0
  };

  function $(id) { return document.getElementById(id); }
  function isVRView(scene) { return G.stereo || (scene.renderer && scene.renderer.xr && scene.renderer.xr.isPresenting); }

  AFRAME.registerComponent('br-game', {
    init: function () {
      var self = this, scene = this.el;
      if (scene.hasLoaded) this.setup(); else scene.addEventListener('loaded', function () { self.setup(); });
    },

    setup: function () {
      var scene = this.el;
      this.rig = $('rig');
      this.camEl = $('cam');
      this.playerPos = new THREE.Vector3();
      this.camWorld = new THREE.Vector3();
      this.camDir = new THREE.Vector3();

      // Mundo.
      var root = new THREE.Group();
      scene.object3D.add(root);
      G.maze = BRMaze.build(root);

      // Iluminación base (la luz dinámica viene del pool de maze.js).
      root.add(new THREE.AmbientLight(0xfff1c4, 0.42));
      root.add(new THREE.HemisphereLight(0xfff6d8, 0x6b5a2a, 0.35));

      G.entity = BREntity.create(root, G.maze);
      this.placePlayer();
      G.entity.reset(G.maze.startCell);

      // HUD y susto pegados a la cámara (se ven en pantalla normal, VR Box y WebXR).
      var cam3 = this.camEl.getObject3D('camera');
      this.hud = BRTextures.hudCanvas();
      this.hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5),
        new THREE.MeshBasicMaterial({ map: this.hud.texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
      this.hudMesh.position.set(0, 0, -1.1);
      this.hudMesh.renderOrder = 999;
      this.hudMesh.visible = false;
      cam3.add(this.hudMesh);

      this.scareMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshBasicMaterial({ map: BRTextures.scareFace(), depthTest: false, depthWrite: false, fog: false, toneMapped: false, transparent: true }));
      this.scareMesh.position.set(0, 0, -0.55);
      this.scareMesh.renderOrder = 1000;
      this.scareMesh.visible = false;
      cam3.add(this.scareMesh);

      this.installStereo();
      this.bindUI();
      this.buildCalibUI();
      this.ready = true;
    },

    placePlayer: function () {
      var m = G.maze;
      this.rig.object3D.position.set(m.start.x, this.rig.object3D.position.y, m.start.z);
      this.rig.object3D.rotation.set(0, THREE.MathUtils.degToRad(m.startYaw), 0);
    },

    /* ---------- Pantalla de inicio y permisos ---------- */
    bindUI: function () {
      var self = this;
      function enter(withStereo) {
        // 1) Permisos de orientación en iOS 13+ (debe ocurrir dentro del gesto).
        try {
          if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().catch(function () {});
          }
          if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().catch(function () {});
          }
        } catch (e) { /* noop */ }
        // 2) Desbloquear el AudioContext y arrancar el zumbido.
        BRAudio.init();
        BRAudio.startHum();
        BRAudio.startAmbient();
        // 3) Ocultar el menú y empezar.
        $('menu').classList.add('hidden');
        document.body.classList.add('in-game');
        self.startGame();
        if (withStereo) self.setStereo(true);
        self.showHint();
      }
      $('btn-enter').addEventListener('click', function () { enter(false); });
      $('btn-enter-vrbox').addEventListener('click', function () { enter(true); });
      $('btn-vrbox').addEventListener('click', function () { self.setStereo(!G.stereo); });
      $('btn-exit-stereo').addEventListener('click', function () { self.setStereo(false); });
      $('btn-restart').addEventListener('click', function () { self.restart(); });

      window.addEventListener('br-action', function (e) {
        if (G.calibrating) {
          if (e.detail === 'gamepad' || e.detail === 'key') self.closeCalib();
          return;
        }
        if ((G.state === 'caught' || G.state === 'won') && performance.now() > G.restartAt) self.restart();
      });
      window.addEventListener('br-gamepad', function (e) {
        var el = $('pad-status');
        if (el) { el.textContent = '🎮 Control conectado: ' + e.detail; el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 4000); }
      });
      document.addEventListener('fullscreenchange', function () {
        if (!document.fullscreenElement && G.stereo) self.setStereo(false);
      });
      document.addEventListener('webkitfullscreenchange', function () {
        if (!document.webkitFullscreenElement && G.stereo) self.setStereo(false);
      });
      this.el.addEventListener('enter-vr', function () { if (G.stereo) self.setStereo(false); self.syncOverlays(); });
      this.el.addEventListener('exit-vr', function () { self.syncOverlays(); });
    },

    showHint: function () {
      var h = $('hint');
      h.classList.add('show');
      setTimeout(function () { h.classList.remove('show'); }, 7000);
    },

    startGame: function () {
      G.state = 'playing';
      G.time = 0;
      BRControls.autoWalk = false;
      this.hudMesh.visible = false;
      this.scareMesh.visible = false;
      $('end').classList.add('hidden');
    },

    restart: function () {
      this.placePlayer();
      G.entity.reset(G.maze.startCell);
      BRAudio.restoreHum();
      BRAudio.startAmbient();
      this.startGame();
    },

    /* ---------- Modo VR Box: render estereoscópico calibrable (ver stereo.js) ---------- */
    installStereo: function () {
      var renderer = this.el.renderer;
      var orig = renderer.render.bind(renderer);
      renderer.render = function (scene, camera) {
        if (!G.stereo || renderer.xr.isPresenting || renderer.getRenderTarget() !== null) return orig(scene, camera);
        BRStereo.render(renderer, orig, scene, camera);
      };
    },

    /* ---------- Calibración del visor ---------- */
    buildCalibUI: function () {
      var self = this, list = $('calib-params'), sel = $('calib-profile');
      Object.keys(BRStereo.PROFILES).forEach(function (id) {
        var o = document.createElement('option');
        o.value = id; o.textContent = BRStereo.PROFILES[id].name;
        sel.appendChild(o);
      });
      var o2 = document.createElement('option');
      o2.value = 'custom'; o2.textContent = 'Personalizado';
      sel.appendChild(o2);
      sel.addEventListener('change', function () {
        if (sel.value !== 'custom') { BRStereo.applyProfile(sel.value); self.refreshCalib(); }
      });
      // Un solo deslizador visible a la vez (panel compacto para pantallas en horizontal).
      list.innerHTML =
        '<div class="calib-nav"><button class="calib-prev" type="button">◀</button>' +
        '<div class="calib-name"><span class="calib-label"></span> <span class="calib-val"></span></div>' +
        '<button class="calib-next" type="button">▶</button></div>' +
        '<div class="calib-slider"><button class="calib-minus" type="button">−</button><input type="range"><button class="calib-plus" type="button">+</button></div>';
      var inp = list.querySelector('input');
      this.calibEls = { label: list.querySelector('.calib-label'), val: list.querySelector('.calib-val'), input: inp };
      function sel(d) { var n = BRStereo.PARAMS.length; self.calibSel = (self.calibSel + d + n) % n; self.refreshCalib(); }
      function nudge(d) { var pp = BRStereo.PARAMS[self.calibSel]; BRStereo.set(pp.key, BRStereo.settings[pp.key] + d * pp.step); self.refreshCalib(); }
      list.querySelector('.calib-prev').addEventListener('click', function () { sel(-1); });
      list.querySelector('.calib-next').addEventListener('click', function () { sel(1); });
      list.querySelector('.calib-minus').addEventListener('click', function () { nudge(-1); });
      list.querySelector('.calib-plus').addEventListener('click', function () { nudge(1); });
      inp.addEventListener('input', function () {
        BRStereo.set(BRStereo.PARAMS[self.calibSel].key, Number(inp.value));
        self.refreshCalib();
      });
      $('btn-calib').addEventListener('click', function () { self.openCalib(); });
      $('btn-calib-menu').addEventListener('click', function () { self.openCalib(true); });
      $('btn-calib-done').addEventListener('click', function () { self.closeCalib(); });
      $('btn-calib-reset').addEventListener('click', function () { BRStereo.applyProfile('vrbox'); self.refreshCalib(); });
      this.calibSel = 0;
      this.calibRepeat = 0;
    },

    openCalib: function (fromMenu) {
      if (fromMenu) {
        BRAudio.init();
        $('menu').classList.add('hidden');
        document.body.classList.add('in-game');
        if (G.state === 'menu') { BRAudio.startHum(); BRAudio.startAmbient(); this.startGame(); }
      }
      G.calibrating = true;
      BRStereo.calibrating = true;
      document.body.classList.add('calibrating');
      if (!G.stereo) this.setStereo(true);
      this.refreshCalib();
    },

    closeCalib: function () {
      G.calibrating = false;
      BRStereo.calibrating = false;
      BRStereo.save();
      document.body.classList.remove('calibrating');
      this.hudMesh.position.y = 0;
      this.hudMesh.visible = false;
      this.syncOverlays();
    },

    refreshCalib: function () {
      var self = this;
      $('calib-profile').value = BRStereo.PROFILES[BRStereo.profile] ? BRStereo.profile : 'custom';
      var cp = BRStereo.PARAMS[this.calibSel], ce = this.calibEls;
      ce.label.textContent = (this.calibSel + 1) + '/' + BRStereo.PARAMS.length + ' · ' + cp.label;
      ce.val.textContent = BRStereo.format(cp);
      ce.input.min = cp.min; ce.input.max = cp.max; ce.input.step = cp.step;
      ce.input.value = BRStereo.settings[cp.key];
      // HUD dentro del visor (para ajustar con el control puesto).
      var lines = [];
      var pp = BRStereo.PARAMS[this.calibSel];
      lines.push('▶ ' + pp.label + ': ' + BRStereo.format(pp));
      lines.push('Joystick ↑↓ elegir · ←→ ajustar');
      lines.push('Junta las dos cruces verdes en una');
      lines.push('Botón del control: terminar');
      BRTextures.drawHud(this.hud, 'CALIBRAR VISOR', lines, '#5dff86');
      this.hudMesh.position.y = 0.34; // arriba de las cruces
      this.hudMesh.visible = true;
    },

    // Navegación de la calibración con control Bluetooth o flechas.
    calibTick: function (dt) {
      var pad = BRControls.pad || { x: 0, y: 0 }, k = BRControls.keys;
      var x = pad.x + ((k.arrowright || k.d) ? 1 : 0) - ((k.arrowleft || k.a) ? 1 : 0);
      var y = pad.y + ((k.arrowdown || k.s) ? 1 : 0) - ((k.arrowup || k.w) ? 1 : 0);
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) { this.calibRepeat = 0; this.calibHeld = false; return; }
      this.calibRepeat -= dt;
      if (this.calibRepeat > 0) return;
      this.calibRepeat = this.calibHeld ? 0.08 : 0.35;
      this.calibHeld = true;
      var n = BRStereo.PARAMS.length;
      if (Math.abs(y) >= Math.abs(x)) {
        this.calibSel = (this.calibSel + (y > 0 ? 1 : -1) + n) % n;
        this.calibRepeat = 0.3;
      } else {
        var pp = BRStereo.PARAMS[this.calibSel];
        BRStereo.set(pp.key, BRStereo.settings[pp.key] + (x > 0 ? pp.step : -pp.step));
      }
      this.refreshCalib();
    },

    setStereo: function (on) {
      if (!on && G.calibrating) this.closeCalib();
      G.stereo = on;
      document.body.classList.toggle('stereo', on);
      if (on) {
        var de = document.documentElement;
        var req = de.requestFullscreen || de.webkitRequestFullscreen;
        if (req) {
          try {
            var p = req.call(de);
            if (p && p.then) p.then(function () {
              if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
            }).catch(function () {});
          } catch (e) { /* iPhone: sin API de pantalla completa */ }
        }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      this.syncOverlays();
      // Primera vez en modo VR Box: abrir la calibración automáticamente.
      if (on && !BRStereo.hasSaved && !G.calibrating) this.openCalib();
    },

    // HUD en DOM para pantalla normal; HUD 3D cuando se está en VR.
    syncOverlays: function () {
      var vr = isVRView(this.el);
      var ended = G.state === 'caught' || G.state === 'won';
      if (ended && performance.now() > G.restartAt - 1200) {
        this.hudMesh.visible = vr;
        $('end').classList.toggle('hidden', vr);
      }
    },

    showEnd: function (title, lines, color, cls) {
      BRTextures.drawHud(this.hud, title, lines, color);
      $('end-title').textContent = title;
      $('end-sub').innerHTML = lines.join('<br>');
      $('end').className = 'overlay ' + cls;
      this.syncOverlays();
    },

    /* ---------- Bucle principal ---------- */
    tick: function (t, dtMs) {
      if (!this.ready) return;
      var dt = Math.min(0.05, (dtMs || 16) / 1000);
      var rig = this.rig.object3D;
      var p = this.playerPos.set(rig.position.x, 1.6, rig.position.z);
      var cam = this.el.renderer.xr.isPresenting ? this.el.renderer.xr.getCamera() : this.el.camera;
      cam.getWorldPosition(this.camWorld);
      cam.getWorldDirection(this.camDir);
      BRAudio.updateListener(this.camWorld, this.camDir);

      if (G.calibrating) {
        this.calibTick(dt);
        G.maze.update(dt, p, null);
      } else if (G.state === 'playing') {
        G.time += dt;
        var grace = G.time < 8;
        var caught = G.entity.update(dt, p, BRControls.moving, grace);
        G.maze.update(dt, p, G.entity.pos);
        BRAudio.setThreat(G.entity.threat);

        var ex = G.maze.exit, dx = p.x - ex.x, dz = p.z - ex.z;
        if (dx * dx + dz * dz < 1.4 * 1.4) this.win();
        else if (caught) this.caught();
      } else {
        G.maze.update(dt, G.state === 'menu' ? null : p, G.state === 'caught' ? G.entity.pos : null);
      }

      // Animación del susto.
      if (this.scareMesh.visible) {
        this.scareT += dt;
        var s = 1 + this.scareT * 0.9;
        this.scareMesh.scale.set(s, s, s);
        this.scareMesh.position.x = (Math.random() - 0.5) * 0.06;
        this.scareMesh.position.y = (Math.random() - 0.5) * 0.06;
        this.scareMesh.material.opacity = Math.random() < 0.15 ? 0.3 : 1;
        if (this.scareT > 1.1) {
          this.scareMesh.visible = false;
          $('flash').classList.remove('on');
          this.syncOverlays();
        }
      }
    },

    caught: function () {
      G.state = 'caught';
      BRAudio.stopAmbient();
      BRAudio.jumpscare();
      this.scareT = 0;
      this.scareMesh.visible = true;
      this.scareMesh.scale.set(1, 1, 1);
      $('flash').classList.add('on');
      if (navigator.vibrate) navigator.vibrate([200, 60, 300]);
      G.restartAt = performance.now() + 1700;
      this.hudMesh.visible = false;
      this.showEnd('TE ATRAPÓ', [
        'Sobreviviste ' + Math.floor(G.time) + ' segundos en el Nivel 0.',
        'Toca la pantalla, pulsa un botón',
        'del control o la tecla R para reiniciar.'
      ], '#ff4a3a', 'lose');
      $('end').classList.add('hidden');
      this.hudMesh.visible = false;
    },

    win: function () {
      G.state = 'won';
      BRAudio.stopAmbient();
      BRAudio.win();
      G.restartAt = performance.now() + 1500;
      var secs = Math.floor(G.time), mm = Math.floor(secs / 60), ss = ('0' + (secs % 60)).slice(-2);
      this.showEnd('¡ESCAPASTE!', [
        'Encontraste la salida en ' + mm + ':' + ss + '.',
        'Toca la pantalla, pulsa un botón',
        'o la tecla R para jugar otra vez.'
      ], '#5dff86', 'win');
      G.restartAt = performance.now() + 1500;
      this.hudMesh.visible = isVRView(this.el);
      $('end').classList.toggle('hidden', isVRView(this.el));
    }
  });
})();
