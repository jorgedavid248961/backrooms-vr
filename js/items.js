/* ==========================================================================
   items.js — Objetos del nivel (v3)
   • Linterna con batería que se gasta (SpotLight pegada a la cámara).
   • Pilas escondidas por el mapa (más en las zonas oscuras).
   • Notas que hay que juntar para que se abra la salida.
   • HUD de estado dentro de la escena (se ve también en el visor).
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;

  var NOTES = 5, BATTERIES = 9;
  var DRAIN = 1.1;          // % de batería por segundo con la linterna encendida
  var PICKUP_CHARGE = 40;   // % que recarga cada pila
  var PICK_RADIUS = 1.1;

  var I = window.BRItems = { battery: 100, on: true, notes: 0, total: NOTES, msg: '', msgT: 0 };

  /* ---------- Linterna (se crea una sola vez, pegada a la cámara) ---------- */
  I.initFlashlight = function (cam3, scene) {
    var spot = new THREE.SpotLight(0xfff1d8, 0, 18, 0.42, 0.55, 1.3);
    spot.position.set(0.08, -0.12, 0);
    var target = new THREE.Object3D();
    target.position.set(0, -0.15, -4);
    cam3.add(spot); cam3.add(target);
    spot.target = target;
    I.spot = spot;

    I.hud = BRTextures.statusHud();
    var m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155),
      new THREE.MeshBasicMaterial({ map: I.hud.texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    m.position.set(0, -0.36, -1.0);
    m.renderOrder = 998;
    cam3.add(m);
    I.hudMesh = m;
    window.addEventListener('br-flash', function () {
      if (!window.BRGame || BRGame.state !== 'playing' || BRGame.calibrating) return;
      if (I.battery <= 0) { I.say('Sin batería: busca pilas'); return; }
      I.on = !I.on;
      if (window.BRAudio && BRAudio.click) BRAudio.click();
    });
  };

  I.say = function (text) { I.msg = text; I.msgT = 2.5; };

  /* ---------- Colocar notas y pilas en un nivel recién creado ---------- */
  I.populate = function (root, maze, needNotes) {
    I.battery = 100; I.on = true; I.notes = 0; I.msg = ''; I.msgT = 0;
    I.total = needNotes ? NOTES : 0;
    I.items = [];
    var start = maze.startCell, N = maze.N;
    var dist = maze.bfs(start.cx, start.cz).dist;
    var cells = [];
    for (var id = 0; id < N * N; id++) {
      var cx = id % N, cz = (id / N) | 0;
      if (dist[id] < 3) continue;
      if (cx === maze.exit.cell.cx && cz === maze.exit.cell.cz) continue;
      cells.push({ cx: cx, cz: cz, d: dist[id] });
    }
    var used = {};
    function key(c) { return c.cx + ',' + c.cz; }

    // Notas: muestreo "punto más lejano" para que queden repartidas por todo el mapa.
    if (needNotes) {
      var chosen = [start];
      for (var n = 0; n < NOTES; n++) {
        var best = null, bestScore = -1;
        cells.forEach(function (c) {
          if (used[key(c)] || c.d < 5) return;
          var mind = 1e9;
          chosen.forEach(function (o) { mind = Math.min(mind, Math.abs(o.cx - c.cx) + Math.abs(o.cz - c.cz)); });
          var score = mind + Math.random() * 2.5;
          if (score > bestScore) { bestScore = score; best = c; }
        });
        if (!best) break;
        used[key(best)] = 1; chosen.push(best);
        I.items.push(makeNote(root, maze, best, n));
      }
      I.total = I.items.length;
    }

    // Pilas: la mitad en zonas oscuras, el resto en cualquier parte.
    var dark = cells.filter(function (c) { var p = maze.center(c.cx, c.cz); return maze.isDark(p.x, p.z) && !used[key(c)]; });
    var any = cells.filter(function (c) { return !used[key(c)]; });
    for (var b = 0; b < BATTERIES; b++) {
      var pool = (b % 2 === 0 && dark.length) ? dark : any;
      var c = pool[Math.floor(Math.random() * pool.length)];
      if (!c || used[key(c)]) { b--; if (any.length < 2) break; any = any.filter(function (x) { return !used[key(x)]; }); dark = dark.filter(function (x) { return !used[key(x)]; }); continue; }
      used[key(c)] = 1;
      I.items.push(makeBattery(root, maze, c));
    }
    maze.setExitOpen(I.total === 0);
  };

  function offsetPos(maze, c) {
    var p = maze.center(c.cx, c.cz);
    return { x: p.x + (Math.random() - 0.5) * 1.2, z: p.z + (Math.random() - 0.5) * 1.2 };
  }

  function makeNote(root, maze, c, index) {
    var p = offsetPos(maze, c);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.33),
      new THREE.MeshBasicMaterial({ map: BRTextures.note(index), side: THREE.DoubleSide, color: 0xdddddd }));
    mesh.position.set(p.x, 1.2, p.z);
    root.add(mesh);
    return { type: 'note', mesh: mesh, x: p.x, z: p.z, ph: Math.random() * 6, alive: true };
  }

  var battGeo = null, battMat = null, capMat = null, haloMat = null;
  function makeBattery(root, maze, c) {
    if (!battGeo) {
      battGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10);
      battMat = new THREE.MeshBasicMaterial({ color: 0x1f6b2e });
      capMat = new THREE.MeshBasicMaterial({ color: 0xd9d4c0 });
      haloMat = new THREE.MeshBasicMaterial({ color: 0x9dff9d, transparent: true, opacity: 0.25, depthWrite: false });
    }
    var p = offsetPos(maze, c);
    var g = new THREE.Group();
    var body = new THREE.Mesh(battGeo, battMat);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), capMat);
    cap.position.y = 0.075;
    var halo = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.13, 20), haloMat);
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.55;
    g.add(body); g.add(cap); g.add(halo);
    g.position.set(p.x, 0.62, p.z);
    root.add(g);
    return { type: 'battery', mesh: g, x: p.x, z: p.z, ph: Math.random() * 6, alive: true };
  }

  /* ---------- Bucle ---------- */
  // Devuelve true si se acaban de juntar todas las notas.
  I.update = function (dt, player, t, maze) {
    var opened = false;
    // Batería.
    if (I.on) {
      I.battery = Math.max(0, I.battery - DRAIN * dt);
      if (I.battery <= 0) { I.on = false; I.say('La linterna se apagó'); }
    }
    if (I.spot) {
      var inten = I.on ? 9 : 0;
      if (I.on && I.battery < 15 && Math.random() < 0.08 + (15 - I.battery) / 60) inten *= Math.random() * 0.4;
      I.spot.intensity = inten;
    }
    // Objetos.
    (I.items || []).forEach(function (it) {
      if (!it.alive) return;
      it.ph += dt;
      if (it.type === 'note') { it.mesh.rotation.y += dt * 1.2; it.mesh.position.y = 1.2 + Math.sin(it.ph * 2) * 0.06; }
      else { it.mesh.rotation.y += dt * 2; it.mesh.position.y = 0.62 + Math.sin(it.ph * 3) * 0.04; }
      var dx = it.x - player.x, dz = it.z - player.z;
      if (dx * dx + dz * dz < PICK_RADIUS * PICK_RADIUS) {
        it.alive = false;
        it.mesh.visible = false;
        if (it.type === 'battery') {
          I.battery = Math.min(100, I.battery + PICKUP_CHARGE);
          if (!I.on) I.on = true;
          I.say('+ Pila (' + Math.round(I.battery) + '%)');
          if (window.BRAudio && BRAudio.pickup) BRAudio.pickup(false);
        } else {
          I.notes++;
          if (window.BRAudio && BRAudio.pickup) BRAudio.pickup(true);
          if (I.notes >= I.total) {
            I.say('¡Todas las notas! La salida se abrió');
            maze.setExitOpen(true);
            opened = true;
          } else I.say('Nota ' + I.notes + ' de ' + I.total);
        }
      }
    });
    if (I.msgT > 0) { I.msgT -= dt; if (I.msgT <= 0) I.msg = ''; }
    if (I.hud) I.hud.draw({ battery: I.battery, on: I.on, notes: I.notes, total: I.total, stamina: BRControls.stamina, msg: I.msg });
    return opened;
  };

  I.setHudVisible = function (v) { if (I.hudMesh) I.hudMesh.visible = v; };
})();
