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
  function fmtTime(secs) { return Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2); }
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

      BRItems.initFlashlight(cam3, this.el.object3D);
      BRItems.setHudVisible(false);
      this.installStereo();
      this.bindUI();
      this.buildCalibUI();
      this.ready = true;
    },

    /* ---------- Construcción del nivel elegido en el menú ---------- */
    buildLevel: function (theme, withEntity) {
      var scene = this.el.object3D;
      this.destroyLevel();
      var root = new THREE.Group();
      scene.add(root);
      this.root = root;
      G.level = theme;
      G.withEntity = withEntity;
      // Semilla nueva en cada partida: el mapa nunca es igual.
      G.maze = BRMaze.build(root, { theme: theme, seed: (Math.random() * 1e9) | 1, envMap: theme === 'warehouse' ? this.getEnvMap() : null });
      var fogColor, density;
      if (theme === 'warehouse') {
        root.add(new THREE.AmbientLight(0xffe2bf, 0.16));
        root.add(new THREE.HemisphereLight(0xd8d4cc, 0x2a2620, 0.18));
        fogColor = 0x13110d; density = 0.055;
      } else if (theme === 'pools') {
        root.add(new THREE.AmbientLight(0xeef6f8, 0.42));
        root.add(new THREE.HemisphereLight(0xffffff, 0xa9bcbf, 0.28));
        fogColor = 0xcfe3e4; density = 0.032;
      } else {
        root.add(new THREE.AmbientLight(0xfff1c4, 0.42));
        root.add(new THREE.HemisphereLight(0xfff6d8, 0x6b5a2a, 0.35));
        fogColor = 0x262110; density = 0.065;
      }
      scene.fog = new THREE.FogExp2(fogColor, density);
      scene.background = new THREE.Color(fogColor);
      G.entity = withEntity ? BREntity.create(root, G.maze) : null;
      this.placePlayer();
      if (G.entity) G.entity.reset(G.maze.startCell);
      BRItems.populate(root, G.maze, true);
    },

    // Libera el nivel anterior (geometrías, materiales y texturas).
    destroyLevel: function () {
      if (!this.root) return;
      this.el.object3D.remove(this.root);
      this.root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            ['map', 'normalMap', 'roughnessMap'].forEach(function (k) { if (m[k]) m[k].dispose(); });
            m.dispose();
          });
        }
      });
      this.root = null;
    },

    // Mapa de entorno para reflejos (charcos, metal): una sala oscura con lámparas, prefiltrada.
    getEnvMap: function () {
      if (this.envMap) return this.envMap;
      var r = this.el.renderer;
      var envScene = new THREE.Scene();
      var room = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 20), new THREE.MeshBasicMaterial({ color: 0x2b2722, side: THREE.BackSide }));
      envScene.add(room);
      var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe0b0 });
      for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
        var lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), lampMat);
        lamp.rotation.x = Math.PI / 2; lamp.position.set(i * 6, 2.9, j * 6);
        envScene.add(lamp);
      }
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x15130f }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -2.9; envScene.add(floor);
      var pm = new THREE.PMREMGenerator(r);
      this.envMap = pm.fromScene(envScene, 0.02).texture;
      pm.dispose();
      return this.envMap;
    },

    placePlayer: function () {
      var m = G.maze;
      this.rig.object3D.position.set(m.start.x, this.rig.object3D.position.y, m.start.z);
      this.rig.object3D.rotation.set(0, THREE.MathUtils.degToRad(m.startYaw), 0);
    },

    /* ---------- Pantalla de inicio y permisos ---------- */
    bindUI: function () {
      var self = this;
      // Selección de nivel y entidad (se recuerda en el celular).
      var prefs = { level: 'level0', entity: true };
      try { var sp = JSON.parse(localStorage.getItem('br-menu') || 'null'); if (sp) prefs = sp; } catch (e) { /* noop */ }
      function paintMenu() {
        document.querySelectorAll('.level-card').forEach(function (c) { c.classList.toggle('sel', c.dataset.level === prefs.level); });
        $('opt-entity').checked = !!prefs.entity;
        document.body.dataset.level = prefs.level;
      }
      document.querySelectorAll('.level-card').forEach(function (c) {
        c.addEventListener('click', function () { prefs.level = c.dataset.level; paintMenu(); });
      });
      $('opt-entity').addEventListener('change', function () { prefs.entity = $('opt-entity').checked; });
      paintMenu();
      function paintRecords() {
        document.querySelectorAll('[data-rec]').forEach(function (el) {
          var best = self.getRecord(el.dataset.rec);
          el.textContent = best ? 'Récord: ' + fmtTime(best) : 'Sin récord aún';
        });
      }
      paintRecords();

      function enter(withStereo, calib) {
        try { localStorage.setItem('br-menu', JSON.stringify(prefs)); } catch (e) { /* noop */ }
        if (!G.maze) self.buildLevel(prefs.level, prefs.entity);
        paintRecords();
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
        BRAudio.startHum(G.level);
        BRAudio.startAmbient();
        // 3) Ocultar el menú y empezar.
        $('menu').classList.add('hidden');
        document.body.classList.add('in-game');
        self.startGame();
        if (calib) self.openCalib();
        else if (withStereo) self.setStereo(true);
        self.showHint();
      }
      this.enter = enter;
      $('btn-enter').addEventListener('click', function () { enter(false); });
      $('btn-enter-vrbox').addEventListener('click', function () { enter(true); });
      $('btn-vrbox').addEventListener('click', function () { self.setStereo(!G.stereo); });
      $('btn-exit-stereo').addEventListener('click', function () { self.setStereo(false); });
      $('btn-restart').addEventListener('click', function () { self.restart(); });
      $('btn-menu').addEventListener('click', function () { location.reload(); });

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

    /* ---------- Récords por nivel (guardados en el celular) ---------- */
    getRecord: function (level) {
      try { return (JSON.parse(localStorage.getItem('br-records') || '{}'))[level] || 0; } catch (e) { return 0; }
    },
    saveRecord: function (level, secs) {
      var rec = {};
      try { rec = JSON.parse(localStorage.getItem('br-records') || '{}'); } catch (e) { rec = {}; }
      var isNew = !rec[level] || secs < rec[level];
      if (isNew) { rec[level] = secs; try { localStorage.setItem('br-records', JSON.stringify(rec)); } catch (e) { /* noop */ } }
      return isNew;
    },

    startGame: function () {
      BRItems.setHudVisible(true);
      G.state = 'playing';
      G.time = 0;
      BRControls.autoWalk = false;
      this.hudMesh.visible = false;
      this.scareMesh.visible = false;
      $('end').classList.add('hidden');
    },

    restart: function () {
      // Mapa nuevo en cada partida.
      this.buildLevel(G.level, G.withEntity);
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
      $('btn-calib-menu').addEventListener('click', function () { self.enter(true, true); });
      $('btn-calib-done').addEventListener('click', function () { self.closeCalib(); });
      $('btn-calib-reset').addEventListener('click', function () { BRStereo.applyProfile('vrbox'); self.refreshCalib(); });
      this.calibSel = 0;
      this.calibRepeat = 0;
    },

    openCalib: function () {
      G.calibrating = true;
      BRStereo.calibrating = true;
      document.body.classList.add('calibrating');
      if (!G.stereo) this.setStereo(true);
      this.refreshCalib();
    },

    closeCalib: function () {
      G.calibrating = false;
      BRItems.setHudVisible(G.state === 'playing');
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
      if (!this.ready || !G.maze) return;
      var dt = Math.min(0.05, (dtMs || 16) / 1000);
      var rig = this.rig.object3D;
      var p = this.playerPos.set(rig.position.x, 1.6, rig.position.z);
      var cam = this.el.renderer.xr.isPresenting ? this.el.renderer.xr.getCamera() : this.el.camera;
      cam.getWorldPosition(this.camWorld);
      cam.getWorldDirection(this.camDir);
      BRAudio.updateListener(this.camWorld, this.camDir);

      if (G.calibrating) {
        this.calibTick(dt);
        BRItems.setHudVisible(false);
        G.maze.update(dt, p, null);
      } else if (G.state === 'playing') {
        G.time += dt;
        var grace = G.time < 8;
        var info = { noise: BRControls.noise, visible: BRItems.on || !G.maze.isDark(p.x, p.z) };
        var caught = G.entity ? G.entity.update(dt, p, info, grace) : false;
        G.maze.update(dt, p, G.entity ? G.entity.pos : null);
        BRAudio.setThreat(G.entity ? G.entity.threat : 0);
        if (BRItems.update(dt, p, t, G.maze)) BRAudio.unlock();

        var ex = G.maze.exit, dx = p.x - ex.x, dz = p.z - ex.z, near = dx * dx + dz * dz < 1.4 * 1.4;
        if (near && ex.open) this.win();
        else if (caught) this.caught();
        else if (near && !this.lockedMsg) {
          this.lockedMsg = true;
          BRItems.say('Cerrada: faltan ' + (BRItems.total - BRItems.notes) + ' notas');
        } else if (!near) this.lockedMsg = false;
      } else {
        G.maze.update(dt, G.state === 'menu' ? null : p, G.state === 'caught' && G.entity ? G.entity.pos : null);
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
      BRItems.setHudVisible(false);
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
        'Sobreviviste ' + Math.floor(G.time) + ' s · notas ' + BRItems.notes + '/' + BRItems.total + '.',
        'Toca la pantalla, pulsa un botón',
        'del control o la tecla R para reiniciar.'
      ], '#ff4a3a', 'lose');
      $('end').classList.add('hidden');
      this.hudMesh.visible = false;
    },

    win: function () {
      G.state = 'won';
      BRItems.setHudVisible(false);
      BRAudio.stopAmbient();
      BRAudio.win();
      G.restartAt = performance.now() + 1500;
      var secs = Math.max(1, Math.floor(G.time));
      var isNew = this.saveRecord(G.level, secs);
      this.showEnd('¡ESCAPASTE!', [
        'Tiempo: ' + fmtTime(secs) + (isNew ? '  ·  ¡NUEVO RÉCORD!' : '  ·  récord ' + fmtTime(this.getRecord(G.level))),
        'Toca la pantalla, pulsa un botón',
        'o la tecla R para jugar otra vez.'
      ], '#5dff86', 'win');
      G.restartAt = performance.now() + 1500;
      this.hudMesh.visible = isVRView(this.el);
      $('end').classList.toggle('hidden', isVRView(this.el));
    }
  });
})();
