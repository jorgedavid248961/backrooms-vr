/* ==========================================================================
   entity.js — La entidad acechadora ("Bacteria")
   Silueta oscura, alta y delgada que patrulla el laberinto.
   IA: patrulla aleatoria por BFS -> detecta (vista / oído / cercanía)
   -> persecución -> búsqueda en la última posición conocida.
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;

  function create(root, maze) {
    var E = {
      state: 'wander',
      pos: { x: 0, z: 0 },
      yaw: 0,
      path: [],
      target: null,
      pause: 0,
      lastSeen: -999,
      time: 0,
      repath: 0,
      threat: 0
    };

    /* ---------- Modelo minimalista y perturbador ---------- */
    var g = new THREE.Group();
    var dark = new THREE.MeshBasicMaterial({ color: 0x060504 });
    function limb(len, r0, r1) {
      var geo = new THREE.CylinderGeometry(r0, r1, len, 5, 1);
      geo.translate(0, -len / 2, 0); // pivote en el extremo superior
      return new THREE.Mesh(geo, dark);
    }
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.25, 6), dark);
    torso.position.y = 1.65; g.add(torso);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 4), dark);
    neck.position.y = 2.4; g.add(neck);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), dark);
    head.scale.set(0.8, 1.7, 0.9);
    head.position.y = 2.68; g.add(head);
    // Zarcillos de la cabeza.
    var tendrils = [];
    for (var i = 0; i < 9; i++) {
      var t = limb(0.45 + Math.random() * 0.5, 0.012, 0.035);
      t.position.y = 2.78;
      t.rotation.set(Math.PI + (Math.random() - 0.5) * 1.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 1.6);
      t.userData.base = t.rotation.clone();
      t.userData.ph = Math.random() * 10;
      g.add(t); tendrils.push(t);
    }
    // Ojos tenues.
    var eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0, toneMapped: false });
    [-0.045, 0.045].forEach(function (ex) {
      var e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), eyeMat);
      e.position.set(ex, 2.7, -0.11); g.add(e);
    });
    // Brazos larguísimos y piernas.
    var armL = limb(1.55, 0.035, 0.015); armL.position.set(-0.13, 2.2, 0); g.add(armL);
    var armR = limb(1.55, 0.035, 0.015); armR.position.set(0.13, 2.2, 0); g.add(armR);
    var legL = limb(1.08, 0.045, 0.02); legL.position.set(-0.06, 1.05, 0); g.add(legL);
    var legR = limb(1.08, 0.045, 0.02); legR.position.set(0.06, 1.05, 0); g.add(legR);
    // Dedos/garras.
    [armL, armR].forEach(function (a) {
      for (var k = 0; k < 3; k++) {
        var c = limb(0.28, 0.008, 0.003);
        c.position.y = -1.55;
        c.rotation.set((k - 1) * 0.35, 0, (Math.random() - 0.5) * 0.4);
        a.add(c);
      }
    });
    root.add(g);
    E.object = g;

    /* ---------- Utilidades ---------- */
    function dist2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }

    function spawnFar(fromCell, minDist) {
      var res = maze.bfs(fromCell.cx, fromCell.cz), cands = [];
      for (var id = 0; id < res.dist.length; id++) if (res.dist[id] >= minDist) cands.push(id);
      if (!cands.length) cands.push(res.dist.length - 1);
      var pick = cands[Math.floor(Math.random() * cands.length)];
      var c = maze.center(pick % maze.N, (pick / maze.N) | 0);
      E.pos.x = c.x; E.pos.z = c.z;
    }

    function randomTarget() {
      return { cx: Math.floor(Math.random() * maze.N), cz: Math.floor(Math.random() * maze.N) };
    }

    function setPathTo(cell) {
      var ec = maze.cellOf(E.pos.x, E.pos.z);
      E.path = maze.path(ec.cx, ec.cz, cell.cx, cell.cz);
      E.target = cell;
    }

    // Siguiente punto al que caminar siguiendo centros de celdas (nunca atraviesa paredes).
    function nextWaypoint() {
      if (!E.path.length) return null;
      var c0 = maze.center(E.path[0].cx, E.path[0].cz);
      if (E.path.length > 1) {
        var c1 = maze.center(E.path[1].cx, E.path[1].cz);
        var onSeg = (Math.abs(c0.x - c1.x) < 0.01 && Math.abs(E.pos.x - c0.x) < 0.2) ||
                    (Math.abs(c0.z - c1.z) < 0.01 && Math.abs(E.pos.z - c0.z) < 0.2);
        if (onSeg || dist2(E.pos, c0) < 0.04) { E.path.shift(); return c1; }
      } else if (dist2(E.pos, c0) < 0.04) { E.path.shift(); return null; }
      return c0;
    }

    E.reset = function (startCell) {
      spawnFar(startCell, 12);
      E.state = 'wander';
      E.path = []; E.pause = 0; E.lastSeen = -999; E.repath = 0; E.time = 0; E.threat = 0; E.stateTime = 0; E.lastKnown = null;
      g.position.set(E.pos.x, 0, E.pos.z);
    };

    /* ---------- Bucle de IA ----------
       Estados: wander (patrulla) -> investigate (fue a donde oyó un ruido)
                -> chase (te ve) -> search (busca alrededor de donde te vio).
       info = { noise: 0 quieto | 1 caminando | 2 corriendo, visible: linterna encendida o zona iluminada } */
    function setState(st) { E.state = st; E.stateTime = 0; }
    E.update = function (dt, player, info, grace) {
      if (typeof info !== 'object') info = { noise: info ? 1 : 0, visible: true };
      E.time += dt;
      E.stateTime = (E.stateTime || 0) + dt;
      var pc = maze.cellOf(player.x, player.z), ec = maze.cellOf(E.pos.x, E.pos.z);
      var d = Math.sqrt(dist2(E.pos, player));

      // Percepción (cada 0.3 s).
      E.repath -= dt;
      if (E.repath <= 0) {
        E.repath = 0.3;
        var res = maze.bfs(pc.cx, pc.cz);
        var pathLen = res.dist[ec.cz * maze.N + ec.cx];
        // Vista: línea recta. En la oscuridad y con la linterna apagada te ve sólo de cerca.
        var sees = maze.lineOfSight(ec, pc) && (d < 4.5 || (info.visible && d < 20));
        // Oído: caminar se oye a 2 celdas; correr, a 7.
        var hearRange = info.noise === 2 ? 7 : info.noise === 1 ? 2 : 0;
        var hears = pathLen >= 0 && pathLen <= hearRange;
        if (!grace && (sees || d < 2.5)) {
          if (E.state !== 'chase') setState('chase');
          E.lastSeen = E.time; E.lastKnown = pc; E.pause = 0;
          setPathTo(pc);
        } else if (!grace && hears && E.state !== 'chase') {
          setState('investigate'); E.lastKnown = pc; E.pause = 0;
          setPathTo(pc);
        } else if (E.state === 'chase') {
          if (E.time - E.lastSeen > 3) { setState('search'); setPathTo(E.lastKnown); }
          else setPathTo(pc);
        } else if ((E.state === 'investigate' || E.state === 'search') && !E.path.length) {
          // Llegó: revisa celdas cercanas a la última posición conocida.
          if (E.stateTime > 12) { setState('wander'); }
          else {
            if (E.state === 'investigate') setState('search');
            var k = E.lastKnown || pc;
            setPathTo({
              cx: Math.max(0, Math.min(maze.N - 1, k.cx + Math.floor(Math.random() * 7) - 3)),
              cz: Math.max(0, Math.min(maze.N - 1, k.cz + Math.floor(Math.random() * 7) - 3))
            });
          }
        }
      }

      var speed = { chase: 2.6, investigate: 1.9, search: 1.6, wander: 1.25 }[E.state] || 1.25;
      if (E.state === 'wander') {
        if (E.pause > 0) { E.pause -= dt; speed = 0; }
        else if (!E.path.length) {
          if (Math.random() < 0.35) E.pause = 1 + Math.random() * 2.5;
          setPathTo(randomTarget());
        }
      }

      // Movimiento.
      var moving = false;
      if (speed > 0) {
        var wp;
        if (E.state === 'chase' && ec.cx === pc.cx && ec.cz === pc.cz) wp = { x: player.x, z: player.z };
        else wp = nextWaypoint();
        if (wp) {
          var dx = wp.x - E.pos.x, dz = wp.z - E.pos.z, l = Math.sqrt(dx * dx + dz * dz);
          if (l > 0.001) {
            var step = Math.min(l, speed * dt);
            E.pos.x += dx / l * step; E.pos.z += dz / l * step;
            var wantYaw = Math.atan2(-dx, -dz);
            var dy = wantYaw - E.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            E.yaw += dy * Math.min(1, dt * 6);
            moving = true;
          }
        }
      }
      if (E.state === 'chase' && d < 6) {
        // Mira fijamente al jugador al acercarse.
        var fy = Math.atan2(-(player.x - E.pos.x), -(player.z - E.pos.z));
        var dy2 = fy - E.yaw;
        while (dy2 > Math.PI) dy2 -= Math.PI * 2;
        while (dy2 < -Math.PI) dy2 += Math.PI * 2;
        E.yaw += dy2 * Math.min(1, dt * 8);
      }

      /* Animación: balanceo, espasmos y "glitch" de posición */
      var tt = E.time, gl = (Math.random() < (E.state === 'chase' ? 0.06 : 0.015)) ? 0.08 : 0;
      g.position.set(E.pos.x + (Math.random() - 0.5) * gl, 0, E.pos.z + (Math.random() - 0.5) * gl);
      g.rotation.y = E.yaw;
      var walk = moving ? Math.sin(tt * speed * 3.2) : 0;
      legL.rotation.x = walk * 0.45; legR.rotation.x = -walk * 0.45;
      armL.rotation.x = -walk * 0.25 + Math.sin(tt * 1.3) * 0.05; armR.rotation.x = walk * 0.25;
      armL.rotation.z = -0.08 + (Math.random() < 0.03 ? (Math.random() - 0.5) * 0.6 : 0);
      armR.rotation.z = 0.08 + (Math.random() < 0.03 ? (Math.random() - 0.5) * 0.6 : 0);
      head.rotation.z = Math.sin(tt * 0.7) * 0.25 + (Math.random() < 0.02 ? (Math.random() - 0.5) : 0);
      torso.rotation.z = Math.sin(tt * 0.9) * 0.05;
      tendrils.forEach(function (te) {
        var b = te.userData.base, ph = te.userData.ph;
        te.rotation.x = b.x + Math.sin(tt * 2.1 + ph) * 0.15;
        te.rotation.z = b.z + Math.cos(tt * 1.7 + ph) * 0.15;
      });

      // Amenaza 0..1 para audio y luces.
      var raw = Math.max(0, 1 - d / 14);
      E.threat += (raw - E.threat) * Math.min(1, dt * 3);

      return d < 0.85;
    };

    return E;
  }

  window.BREntity = { create: create };
})();
