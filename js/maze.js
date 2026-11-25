/* ==========================================================================
   maze.js — Generador de niveles (Nivel 0, Piscinas, Bodega): laberinto, salas con pilares,
   geometría combinada (1 draw call por material), colisiones con
   deslizamiento, paneles fluorescentes y luces con parpadeo.
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;

  var N = 18;          // celdas por lado (>= 16)
  var CELL = 3;        // metros por celda
  var T = 0.2;         // grosor de pared
  var LIGHT_POOL = 4;  // luces dinámicas que siguen a las lámparas cercanas

  // Direcciones: 0 = +x (este), 1 = -x (oeste), 2 = +z (sur), 3 = -z (norte)
  var DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];

  function build(root, opts) {
    opts = opts || {};
    var seed = opts.seed || (Math.random() * 1e9) | 0;
    var r = BRTextures.rng(seed);
    var theme = (opts.theme === 'pools' || opts.theme === 'warehouse') ? opts.theme : 'level0';
    // Configuración de cada nivel. dead = fracción aproximada de zonas sin luz (la linterna importa ahí).
    var CFG = {
      pools: {
        H: 4.2, extraOpen: 0.32, rooms: 8, roomMin: 3, roomMax: 5, pillarProb: 0.9, pillarHalf: 0.3, faulty: 2,
        lightColor: 0xf2f8ff, lightPower: 0.85, deadSeeds: 2, panelTint: [1, 1, 1]
      },
      level0: {
        H: 3.2, extraOpen: 0.09, rooms: 5, roomMin: 3, roomMax: 4, pillarProb: 0.8, pillarHalf: 0.3, faulty: 14,
        lightColor: 0xfff0c0, lightPower: 1.5, deadSeeds: 5, panelTint: [1, 1, 0.95]
      },
      warehouse: {
        H: 4.5, extraOpen: 0.35, rooms: 6, roomMin: 3, roomMax: 5, pillarProb: 0.75, pillarHalf: 0.4, faulty: 8,
        lightColor: 0xffd6a0, lightPower: 2.2, deadSeeds: 9, panelTint: [1, 0.86, 0.62]
      }
    }[theme];
    var H = CFG.H;
    var M = { N: N, CELL: CELL, H: H, seed: seed, theme: theme };

    /* ------------------------------------------------------------------
       1) Laberinto: backtracker recursivo (pasillos y callejones sin salida)
       hW[z][x]: pared horizontal en el borde norte de la fila z (z = 0..N)
       vW[z][x]: pared vertical en el borde oeste de la columna x (x = 0..N)
       ------------------------------------------------------------------ */
    var hW = [], vW = [], z, x;
    for (z = 0; z <= N; z++) { hW.push([]); for (x = 0; x < N; x++) hW[z].push(true); }
    for (z = 0; z < N; z++) { vW.push([]); for (x = 0; x <= N; x++) vW[z].push(true); }

    function canMove(cx, cz, d) {
      if (d === 0) return cx < N - 1 && !vW[cz][cx + 1];
      if (d === 1) return cx > 0 && !vW[cz][cx];
      if (d === 2) return cz < N - 1 && !hW[cz + 1][cx];
      return cz > 0 && !hW[cz][cx];
    }
    function openWall(cx, cz, d) {
      if (d === 0) vW[cz][cx + 1] = false;
      else if (d === 1) vW[cz][cx] = false;
      else if (d === 2) hW[cz + 1][cx] = false;
      else hW[cz][cx] = false;
    }

    var visited = new Uint8Array(N * N);
    var stack = [[0, 0]];
    visited[0] = 1;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var opts2 = [];
      for (var d = 0; d < 4; d++) {
        var nx = cur[0] + DX[d], nz = cur[1] + DZ[d];
        if (nx >= 0 && nz >= 0 && nx < N && nz < N && !visited[nz * N + nx]) opts2.push(d);
      }
      if (!opts2.length) { stack.pop(); continue; }
      var dd = opts2[Math.floor(r() * opts2.length)];
      openWall(cur[0], cur[1], dd);
      var nc = [cur[0] + DX[dd], cur[1] + DZ[dd]];
      visited[nc[1] * N + nc[0]] = 1;
      stack.push(nc);
    }

    // Algunos bucles extra para que no sea un árbol perfecto (sigue habiendo callejones).
    for (z = 1; z < N; z++) for (x = 0; x < N; x++) if (hW[z][x] && r() < CFG.extraOpen) hW[z][x] = false;
    for (z = 0; z < N; z++) for (x = 1; x < N; x++) if (vW[z][x] && r() < CFG.extraOpen) vW[z][x] = false;

    /* ------------------------------------------------------------------
       2) Salas abiertas con pilares
       ------------------------------------------------------------------ */
    var pillars = [];
    var rooms = [];
    var tries = 0;
    while (rooms.length < CFG.rooms && tries++ < 300) {
      var span = CFG.roomMax - CFG.roomMin + 1;
      var rw = CFG.roomMin + Math.floor(r() * span), rh = CFG.roomMin + Math.floor(r() * span);
      var rx = 1 + Math.floor(r() * (N - rw - 2)), rz = 1 + Math.floor(r() * (N - rh - 2));
      // Lejos del inicio y de la salida.
      if (rx < 4 && rz < 4) continue;
      if (rx + rw > N - 4 && rz + rh > N - 4) continue;
      var overlap = rooms.some(function (o) {
        return rx < o.x + o.w + 1 && rx + rw + 1 > o.x && rz < o.z + o.h + 1 && rz + rh + 1 > o.z;
      });
      if (overlap) continue;
      rooms.push({ x: rx, z: rz, w: rw, h: rh });
    }
    rooms.forEach(function (o) {
      for (var zz = o.z; zz < o.z + o.h; zz++) {
        for (var xx = o.x; xx < o.x + o.w; xx++) {
          if (xx > o.x) vW[zz][xx] = false;
          if (zz > o.z) hW[zz][xx] = false;
        }
      }
      for (var pz = o.z + 1; pz < o.z + o.h; pz++) {
        for (var px = o.x + 1; px < o.x + o.w; px++) {
          if (r() < CFG.pillarProb) pillars.push([px * CELL, pz * CELL]);
        }
      }
    });
    M.rooms = rooms;

    /* ------------------------------------------------------------------
       3) Colisionadores (segmentos colineales combinados)
       ------------------------------------------------------------------ */
    var boxes = [];
    for (z = 0; z <= N; z++) {
      x = 0;
      while (x < N) {
        if (!hW[z][x]) { x++; continue; }
        var x0 = x;
        while (x < N && hW[z][x]) x++;
        boxes.push({ minX: x0 * CELL - T / 2, maxX: x * CELL + T / 2, minZ: z * CELL - T / 2, maxZ: z * CELL + T / 2 });
      }
    }
    for (x = 0; x <= N; x++) {
      z = 0;
      while (z < N) {
        if (!vW[z][x]) { z++; continue; }
        var z0 = z;
        while (z < N && vW[z][x]) z++;
        boxes.push({ minX: x * CELL - T / 2, maxX: x * CELL + T / 2, minZ: z0 * CELL - T / 2, maxZ: z * CELL + T / 2 });
      }
    }
    var PH = CFG.pillarHalf;
    pillars.forEach(function (p) {
      boxes.push({ minX: p[0] - PH, maxX: p[0] + PH, minZ: p[1] - PH, maxZ: p[1] + PH, pillar: true });
    });
    var wallBoxCount = boxes.length; // paredes + pilares (los estantes se dibujan aparte)

    // Estanterías de la bodega: pegadas a una pared, sin tapar el centro de la celda.
    var racks = [];
    if (theme === 'warehouse') {
      for (var rk = 0; rk < 70 && racks.length < 34; rk++) {
        var rcx = Math.floor(r() * N), rcz = Math.floor(r() * N);
        if ((rcx < 3 && rcz < 3) || (rcx > N - 3 && rcz > N - 3)) continue;
        var side = Math.floor(r() * 4), b0 = null;
        var x0c = rcx * CELL, z0c = rcz * CELL;
        if (side === 0 && hW[rcz][rcx]) b0 = { minX: x0c + 0.3, maxX: x0c + 2.7, minZ: z0c + 0.12, maxZ: z0c + 0.82, dir: 2 };
        if (side === 1 && hW[rcz + 1][rcx]) b0 = { minX: x0c + 0.3, maxX: x0c + 2.7, minZ: z0c + 2.18, maxZ: z0c + 2.88, dir: 3 };
        if (side === 2 && vW[rcz][rcx]) b0 = { minX: x0c + 0.12, maxX: x0c + 0.82, minZ: z0c + 0.3, maxZ: z0c + 2.7, dir: 0 };
        if (side === 3 && vW[rcz][rcx + 1]) b0 = { minX: x0c + 2.18, maxX: x0c + 2.88, minZ: z0c + 0.3, maxZ: z0c + 2.7, dir: 1 };
        if (!b0) continue;
        if (racks.some(function (o) { return o.cx === rcx && o.cz === rcz; })) continue;
        b0.cx = rcx; b0.cz = rcz;
        racks.push(b0);
        boxes.push({ minX: b0.minX, maxX: b0.maxX, minZ: b0.minZ, maxZ: b0.maxZ, rack: true });
      }
    }
    M.racks = racks;

    // Índice espacial por celda.
    var cellCols = [];
    for (var i = 0; i < N * N; i++) cellCols.push([]);
    boxes.forEach(function (b, bi) {
      var c0x = Math.max(0, Math.floor((b.minX - 0.6) / CELL)), c1x = Math.min(N - 1, Math.floor((b.maxX + 0.6) / CELL));
      var c0z = Math.max(0, Math.floor((b.minZ - 0.6) / CELL)), c1z = Math.min(N - 1, Math.floor((b.maxZ + 0.6) / CELL));
      for (var cz = c0z; cz <= c1z; cz++) for (var cx = c0x; cx <= c1x; cx++) cellCols[cz * N + cx].push(bi);
    });

    /* Colisión círculo vs AABB con empuje por la normal => deslizamiento suave
       a lo largo de las paredes, sin atravesarlas ni quedar atascado. */
    function resolve(pos, rad) {
      var cx = Math.min(N - 1, Math.max(0, Math.floor(pos.x / CELL)));
      var cz = Math.min(N - 1, Math.max(0, Math.floor(pos.z / CELL)));
      var list = cellCols[cz * N + cx];
      for (var it = 0; it < 3; it++) {
        var moved = false;
        for (var k = 0; k < list.length; k++) {
          var b = boxes[list[k]];
          var px = Math.max(b.minX, Math.min(pos.x, b.maxX));
          var pz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
          var dx = pos.x - px, dz = pos.z - pz;
          var d2 = dx * dx + dz * dz;
          if (d2 >= rad * rad) continue;
          if (d2 > 1e-8) {
            var dist = Math.sqrt(d2), push = (rad - dist) + 0.0005;
            pos.x += dx / dist * push; pos.z += dz / dist * push;
          } else {
            // Centro dentro de la caja: sacar por el eje de menor penetración.
            var l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
            var m = Math.min(l, rr, t, bt);
            if (m === l) pos.x = b.minX - rad; else if (m === rr) pos.x = b.maxX + rad;
            else if (m === t) pos.z = b.minZ - rad; else pos.z = b.maxZ + rad;
          }
          moved = true;
        }
        if (!moved) break;
      }
      // Límite absoluto del mapa (red de seguridad).
      pos.x = Math.max(T / 2 + rad, Math.min(N * CELL - T / 2 - rad, pos.x));
      pos.z = Math.max(T / 2 + rad, Math.min(N * CELL - T / 2 - rad, pos.z));
      return pos;
    }

    /* ------------------------------------------------------------------
       3b) Zonas sin luz + "luz horneada" (vertex colors)
       Algunas lámparas están muertas en grupos: esos pasillos quedan oscuros
       y sólo la linterna los ilumina. La luz se precalcula en una rejilla y
       se pinta en los vértices (gratis en el celular).
       ------------------------------------------------------------------ */
    var dead = new Uint8Array(N * N);
    for (var ds = 0; ds < CFG.deadSeeds; ds++) {
      var dcx = Math.floor(r() * N), dcz = Math.floor(r() * N), rad = 1 + Math.floor(r() * 2);
      for (var zz2 = dcz - rad; zz2 <= dcz + rad; zz2++) for (var xx2 = dcx - rad; xx2 <= dcx + rad; xx2++) {
        if (xx2 < 0 || zz2 < 0 || xx2 >= N || zz2 >= N) continue;
        if (Math.abs(xx2 - dcx) + Math.abs(zz2 - dcz) > rad + 1) continue;
        if (xx2 + zz2 < 3) continue;                 // el inicio siempre iluminado
        if (xx2 >= N - 2 && zz2 >= N - 2) continue;  // y la salida también
        dead[zz2 * N + xx2] = 1;
      }
    }
    // Campo de luz por celda (suavizado 3x3) y por esquina de la rejilla.
    var cellLight = new Float32Array(N * N);
    for (var lz = 0; lz < N; lz++) for (var lx = 0; lx < N; lx++) {
      var sum = 0, cnt = 0;
      for (var oz = -1; oz <= 1; oz++) for (var ox = -1; ox <= 1; ox++) {
        var qx = lx + ox, qz = lz + oz;
        if (qx < 0 || qz < 0 || qx >= N || qz >= N) continue;
        sum += dead[qz * N + qx] ? 0 : (ox === 0 && oz === 0 ? 2 : 1); cnt += (ox === 0 && oz === 0 ? 2 : 1);
      }
      cellLight[lz * N + lx] = sum / cnt;
    }
    var floorLevel = theme === 'warehouse' ? 0.08 : 0.16; // luz mínima en zonas muertas
    var corner = new Float32Array((N + 1) * (N + 1));
    for (var gz = 0; gz <= N; gz++) for (var gx = 0; gx <= N; gx++) {
      var s2 = 0, c2 = 0;
      for (var az = gz - 1; az <= gz; az++) for (var ax = gx - 1; ax <= gx; ax++) {
        if (ax < 0 || az < 0 || ax >= N || az >= N) continue;
        s2 += cellLight[az * N + ax]; c2++;
      }
      var v = c2 ? s2 / c2 : 1;
      corner[gz * (N + 1) + gx] = floorLevel + (1 - floorLevel) * Math.pow(v, 1.3);
    }
    function lightAt(px, pz) {
      var fx2 = Math.max(0, Math.min(N - 0.0001, px / CELL)), fz2 = Math.max(0, Math.min(N - 0.0001, pz / CELL));
      var ix = Math.floor(fx2), iz = Math.floor(fz2), tx = fx2 - ix, tz = fz2 - iz;
      var a = corner[iz * (N + 1) + ix], b = corner[iz * (N + 1) + ix + 1];
      var c = corner[(iz + 1) * (N + 1) + ix], d = corner[(iz + 1) * (N + 1) + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    }
    M.lightAt = lightAt;
    M.isDark = function (px, pz) { return lightAt(px, pz) < 0.45; };

    /* ------------------------------------------------------------------
       4) Geometría combinada de paredes y pilares
       ------------------------------------------------------------------ */
    var P = [], NR = [], UV = [], IDX = [], COL = [];
    var AO_BOTTOM = theme === 'warehouse' ? 0.5 : 0.7; // oclusión junto al suelo
    var UW = 1.6; // metros por repetición horizontal del papel tapiz
    function quad(a, b, c, d, n, ua, ub) {
      var base = P.length / 3;
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      for (var q = 0; q < 4; q++) NR.push(n[0], n[1], n[2]);
      UV.push(ua, a[1] / H, ub, b[1] / H, ub, c[1] / H, ua, d[1] / H);
      [a, b, c, d].forEach(function (pt) {
        var lv = lightAt(pt[0] + n[0] * 0.3, pt[2] + n[2] * 0.3) * (pt[1] < 0.01 ? AO_BOTTOM : 1);
        COL.push(lv, lv, lv);
      });
      IDX.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // Divide cajas largas en tramos de una celda para que la luz horneada tenga resolución.
    function addBox(b) {
      var len = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      if (len > CELL + 0.5) {
        var alongX = (b.maxX - b.minX) > (b.maxZ - b.minZ);
        var start = alongX ? b.minX : b.minZ, end = alongX ? b.maxX : b.maxZ;
        for (var s0 = start; s0 < end - 0.001; s0 += CELL) {
          var s1 = Math.min(end, s0 + CELL);
          addBoxRaw(alongX ? { minX: s0, maxX: s1, minZ: b.minZ, maxZ: b.maxZ } : { minX: b.minX, maxX: b.maxX, minZ: s0, maxZ: s1 });
        }
      } else addBoxRaw(b);
    }
    function addBoxRaw(b) {
      var x0 = b.minX, x1 = b.maxX, z0 = b.minZ, z1 = b.maxZ;
      quad([x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1], [0, 0, 1], x0 / UW, x1 / UW);       // +z
      quad([x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0], [0, 0, -1], -x1 / UW, -x0 / UW);    // -z
      quad([x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1], [1, 0, 0], -z1 / UW, -z0 / UW);     // +x
      quad([x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0], [-1, 0, 0], z0 / UW, z1 / UW);      // -x
    }
    for (var bi2 = 0; bi2 < wallBoxCount; bi2++) addBox(boxes[bi2]);
    var wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
    wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(COL, 3));
    wallGeo.setIndex(IDX);
    wallGeo.computeBoundingSphere();

    var W = N * CELL;
    // Suelo y techo subdivididos por celda, con la luz horneada en los vértices.
    function gridPlane(y, up) {
      var g = new THREE.PlaneGeometry(W, W, N, N);
      g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
      g.translate(W / 2, y, W / 2);
      var pos = g.attributes.position, col = [];
      for (var vi = 0; vi < pos.count; vi++) {
        var lv = lightAt(pos.getX(vi), pos.getZ(vi)) * (up ? 1 : 0.9);
        col.push(lv, lv, lv);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    }

    var wallMat, floorMat, ceilMat;
    if (theme === 'warehouse') {
      // Nivel realista: materiales PBR (color + relieve + rugosidad) y reflejos de entorno.
      var env = opts.envMap || null;
      var pbr = function (name, rx, ry, extra) {
        var L = new THREE.TextureLoader(), base = 'assets/level1/' + name, V = '.jpg?v=' + (window.BR_ASSET_V || '3.0');
        var col = L.load(base + '_color' + V), nrm = L.load(base + '_normal' + V), rgh = L.load(base + '_rough' + V);
        [col, nrm, rgh].forEach(function (t) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
        });
        if ('colorSpace' in col) col.colorSpace = THREE.SRGBColorSpace;
        var m = new THREE.MeshStandardMaterial(Object.assign({
          map: col, normalMap: nrm, roughnessMap: rgh, roughness: 1, metalness: 0,
          envMap: env, envMapIntensity: 0.55, vertexColors: true
        }, extra || {}));
        m.normalScale.set(0.45, 0.45);
        return m;
      };
      wallMat = pbr('wall', 1.6 / 2.4, H / 2.4);
      floorMat = pbr('floor', W / 3, W / 3, { envMapIntensity: 0.9 });
      ceilMat = pbr('ceil', W / 3, W / 3, { envMapIntensity: 0.2 });
    } else {
      var wallTex;
      if (theme === 'pools') { wallTex = BRTextures.poolWall(); wallTex.repeat.set(1, H / 1.6); }
      else wallTex = BRTextures.wallpaper();
      wallMat = new THREE.MeshLambertMaterial({ map: wallTex, vertexColors: true });
      var carpetTex = theme === 'pools' ? BRTextures.poolFloor() : BRTextures.carpet();
      carpetTex.repeat.set(W / 2, W / 2);
      floorMat = new THREE.MeshLambertMaterial({ map: carpetTex, vertexColors: true });
      var ceilTex = theme === 'pools' ? BRTextures.poolCeiling() : BRTextures.ceiling();
      ceilTex.repeat.set(W / 1.2, W / 1.2);
      ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex, vertexColors: true });
    }
    var walls = new THREE.Mesh(wallGeo, wallMat);
    walls.matrixAutoUpdate = false;
    root.add(walls);
    root.add(new THREE.Mesh(gridPlane(0, true), floorMat));
    root.add(new THREE.Mesh(gridPlane(H, false), ceilMat));

    /* ------------------------------------------------------------------
       4b) Bodega: estanterías metálicas con cajas, charcos y goteras
       ------------------------------------------------------------------ */
    M.leaks = [];
    if (theme === 'warehouse') buildWarehouseProps();

    function boxInto(A, x0, x1, y0, y1, z0, z1, uvs, lvl) {
      var faces = [
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], x1 - x0, y1 - y0],
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], x1 - x0, y1 - y0],
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], z1 - z0, y1 - y0],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], z1 - z0, y1 - y0],
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], x1 - x0, z1 - z0],
        [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], x1 - x0, z1 - z0]
      ];
      faces.forEach(function (f) {
        var base = A.P.length / 3;
        for (var q = 0; q < 4; q++) { A.P.push(f[q][0], f[q][1], f[q][2]); A.N.push(f[4][0], f[4][1], f[4][2]); A.C.push(lvl, lvl, lvl); }
        var su = f[5] / uvs, sv = f[6] / uvs;
        A.U.push(0, 0, su, 0, su, sv, 0, sv);
        A.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
    }
    function meshFrom(A, mat) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A.P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(A.N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(A.U, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(A.C, 3));
      g.setIndex(A.I);
      g.computeBoundingSphere();
      return new THREE.Mesh(g, mat);
    }
    function buildWarehouseProps() {
      var metal = { P: [], N: [], U: [], C: [], I: [] }, card = { P: [], N: [], U: [], C: [], I: [] };
      racks.forEach(function (rkb) {
        var lv = lightAt((rkb.minX + rkb.maxX) / 2, (rkb.minZ + rkb.maxZ) / 2);
        var x0 = rkb.minX, x1 = rkb.maxX, z0 = rkb.minZ, z1 = rkb.maxZ, p = 0.06;
        // Postes.
        [[x0, z0], [x1 - p, z0], [x0, z1 - p], [x1 - p, z1 - p]].forEach(function (c) {
          boxInto(metal, c[0], c[0] + p, 0, 3.0, c[1], c[1] + p, 1, lv * 0.8);
        });
        // Repisas y cajas.
        [0.12, 0.95, 1.8, 2.65].forEach(function (y, si) {
          boxInto(metal, x0, x1, y, y + 0.05, z0, z1, 1, lv * (si === 0 ? 0.6 : 0.9));
          if (si === 3 && r() < 0.5) return;
          var alongX = (x1 - x0) > (z1 - z0), len = alongX ? x1 - x0 : z1 - z0, t = 0.15;
          while (t < len - 0.3) {
            var bw = 0.35 + r() * 0.35, bh = 0.25 + r() * 0.45, bd = 0.4 + r() * 0.25;
            if (t + bw > len - 0.1) break;
            if (r() < 0.8) {
              var depth = alongX ? z1 - z0 : x1 - x0, off = (depth - Math.min(bd, depth - 0.1)) / 2;
              bd = Math.min(bd, depth - 0.1);
              if (alongX) boxInto(card, x0 + t, x0 + t + bw, y + 0.05, y + 0.05 + bh, z0 + off, z0 + off + bd, 0.6, lv * (0.75 + r() * 0.25));
              else boxInto(card, x0 + off, x0 + off + bd, y + 0.05, y + 0.05 + bh, z0 + t, z0 + t + bw, 0.6, lv * (0.75 + r() * 0.25));
            }
            t += bw + 0.05 + r() * 0.2;
          }
        });
      });
      var metalMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.55, metalness: 0.6, envMap: opts.envMap || null, envMapIntensity: 0.6, vertexColors: true });
      var cardMat = new THREE.MeshStandardMaterial({ map: BRTextures.cardboard(), roughness: 0.9, metalness: 0, vertexColors: true });
      if (racks.length) { root.add(meshFrom(metal, metalMat)); root.add(meshFrom(card, cardMat)); }

      // Goteras con charcos que reflejan.
      var puddleMat = new THREE.MeshStandardMaterial({
        color: 0x15130f, roughness: 0.03, metalness: 0.1, envMap: opts.envMap || null, envMapIntensity: 1.4,
        transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
      });
      var dropMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.8 });
      var dropGeo = new THREE.SphereGeometry(0.025, 6, 4); dropGeo.scale(1, 2.2, 1);
      for (var lk = 0; lk < 16; lk++) {
        var lcx = Math.floor(r() * N), lcz = Math.floor(r() * N);
        if (lcx + lcz < 2) continue;
        var px = lcx * CELL + 0.7 + r() * 1.6, pz = lcz * CELL + 0.7 + r() * 1.6, pr = 0.5 + r() * 0.9;
        var pud = new THREE.Mesh(new THREE.CircleGeometry(pr, 28), puddleMat);
        pud.rotation.x = -Math.PI / 2; pud.scale.set(1, 0.6 + r() * 0.5, 1);
        pud.position.set(px, 0.006, pz); pud.renderOrder = 1;
        root.add(pud);
        var drop = new THREE.Mesh(dropGeo, dropMat);
        drop.position.set(px, H - 0.05, pz);
        root.add(drop);
        M.leaks.push({ x: px, z: pz, drop: drop, t: r() * 2, period: 0.9 + r() * 1.6 });
      }
    }

    /* ------------------------------------------------------------------
       5b) Piscinas (sólo en el nivel de las Piscinas)
       ------------------------------------------------------------------ */
    var pools = [];
    M.waterTex = null;
    if (theme === 'pools') {
      rooms.forEach(function (o) {
        if (r() < 0.85) pools.push({ minX: o.x * CELL + 0.5, maxX: (o.x + o.w) * CELL - 0.5, minZ: o.z * CELL + 0.5, maxZ: (o.z + o.h) * CELL - 0.5 });
      });
      for (var pc = 0; pc < 8; pc++) {
        var px0 = 2 + Math.floor(r() * (N - 5)), pz0 = 2 + Math.floor(r() * (N - 5));
        if (px0 > N - 5 && pz0 > N - 5) continue;
        var horiz = r() < 0.5;
        pools.push({ minX: px0 * CELL + 0.35, maxX: (px0 + (horiz ? 2 : 1)) * CELL - 0.35, minZ: pz0 * CELL + 0.35, maxZ: (pz0 + (horiz ? 1 : 2)) * CELL - 0.35 });
      }
      var bottomTex = BRTextures.poolBottom();
      var waterTex = BRTextures.caustics();
      M.waterTex = waterTex;
      var bottomMat = new THREE.MeshLambertMaterial({ map: bottomTex });
      var waterMat = new THREE.MeshLambertMaterial({ color: 0xbff4ff, map: waterTex, transparent: true, opacity: 0.55, depthWrite: false });
      pools.forEach(function (pl) {
        var w = pl.maxX - pl.minX, d = pl.maxZ - pl.minZ;
        var bt = bottomTex.clone(); bt.needsUpdate = true; bt.repeat.set(w / 1.6, d / 1.6);
        var bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: bt }));
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.set((pl.minX + pl.maxX) / 2, 0.004, (pl.minZ + pl.maxZ) / 2);
        root.add(bottom);
        var wgeo = new THREE.PlaneGeometry(w, d);
        var uv = wgeo.attributes.uv;
        for (var ui = 0; ui < uv.count; ui++) uv.setXY(ui, uv.getX(ui) * w / 3, uv.getY(ui) * d / 3);
        var water = new THREE.Mesh(wgeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set((pl.minX + pl.maxX) / 2, 0.3, (pl.minZ + pl.maxZ) / 2);
        water.renderOrder = 2;
        root.add(water);
      });
      bottomMat.dispose();
    }
    M.pools = pools;
    M.isWater = function (x, z) {
      for (var i = 0; i < pools.length; i++) {
        var pl = pools[i];
        if (x > pl.minX && x < pl.maxX && z > pl.minZ && z < pl.maxZ) return true;
      }
      return false;
    };

    /* ------------------------------------------------------------------
       5) Paneles fluorescentes (InstancedMesh: 1 draw call) + luces
       ------------------------------------------------------------------ */
    var fixtures = [];
    for (z = 0; z < N; z++) for (x = 0; x < N; x++) {
      fixtures.push({
        x: x * CELL + CELL / 2, z: z * CELL + CELL / 2, cx: x, cz: z,
        faulty: false, on: true, bright: 1, shown: -1, timer: r() * 3, burst: 0
      });
    }
    // Lámparas defectuosas: 2 junto al inicio (para notarlas pronto) + varias al azar.
    function fx(cx, cz) { return fixtures[cz * N + cx]; }
    if (theme === 'level0') { fx(1, 0).faulty = true; fx(0, 2).faulty = true; fx(2, 1).faulty = true; }
    for (var f = 0; f < CFG.faulty; f++) fixtures[Math.floor(r() * fixtures.length)].faulty = true;
    fixtures.forEach(function (fi) { if (dead[fi.cz * N + fi.cx]) { fi.dead = true; fi.faulty = false; fi.on = false; fi.bright = 0; } });

    var panelGeo = new THREE.PlaneGeometry(1.2, 0.6);
    panelGeo.rotateX(Math.PI / 2); // mirando hacia abajo
    var panelMat = new THREE.MeshBasicMaterial({ map: BRTextures.lightPanel(), toneMapped: false });
    var panels = new THREE.InstancedMesh(panelGeo, panelMat, fixtures.length);
    var tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
    fixtures.forEach(function (fi, k) {
      tmpM.makeTranslation(fi.x, H - 0.01, fi.z);
      panels.setMatrixAt(k, tmpM);
      panels.setColorAt(k, tmpC.setRGB(1, 1, 1));
    });
    panels.instanceMatrix.needsUpdate = true;
    root.add(panels);

    var lights = [];
    for (var li = 0; li < LIGHT_POOL; li++) {
      var pl = new THREE.PointLight(CFG.lightColor, 0, 10, 1.6);
      pl.position.set(-100, H - 0.3, -100);
      pl.userData = { fixture: null, fade: 0 };
      root.add(pl);
      lights.push(pl);
    }

    /* ------------------------------------------------------------------
       6) Puerta de salida con letrero EXIT verde (extremo opuesto al inicio)
       ------------------------------------------------------------------ */
    var exitCell = { cx: N - 1, cz: N - 1 };
    var exitX = N * CELL - T / 2 - 0.02, exitZ = exitCell.cz * CELL + CELL / 2;
    var exitGroup = new THREE.Group();
    var door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.15), new THREE.MeshLambertMaterial({ map: BRTextures.door() }));
    door.rotation.y = -Math.PI / 2;
    door.position.set(exitX - 0.04, 1.075, exitZ);
    exitGroup.add(door);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 1.3), new THREE.MeshLambertMaterial({ color: 0x3a3428 }));
    frame.position.set(exitX + 0.02, 1.15, exitZ);
    exitGroup.add(frame);
    var signOpen = BRTextures.exitSign(), signLocked = BRTextures.exitSign(true);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: signOpen, toneMapped: false, fog: false }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(exitX - 0.05, 2.55, exitZ);
    exitGroup.add(sign);
    var exitLight = new THREE.PointLight(0x40ff70, 2.5, 6, 1.5);
    exitLight.position.set(exitX - 0.6, 2.4, exitZ);
    exitGroup.add(exitLight);
    root.add(exitGroup);
    M.exit = { x: exitX - 0.3, z: exitZ, cell: exitCell, open: true };
    M.setExitOpen = function (open) {
      M.exit.open = open;
      sign.material.map = open ? signOpen : signLocked;
      sign.material.needsUpdate = true;
      exitLight.color.setHex(open ? 0x40ff70 : 0xff3020);
    };

    /* ------------------------------------------------------------------
       Utilidades de navegación (usadas por la entidad)
       ------------------------------------------------------------------ */
    function cellOf(px, pz) {
      return { cx: Math.min(N - 1, Math.max(0, Math.floor(px / CELL))), cz: Math.min(N - 1, Math.max(0, Math.floor(pz / CELL))) };
    }
    function center(cx, cz) { return { x: cx * CELL + CELL / 2, z: cz * CELL + CELL / 2 }; }

    // BFS completo desde una celda: devuelve distancias y predecesores.
    function bfs(sx, sz) {
      var dist = new Int16Array(N * N).fill(-1), prev = new Int16Array(N * N).fill(-1);
      var q = [sz * N + sx]; dist[q[0]] = 0;
      for (var h = 0; h < q.length; h++) {
        var id = q[h], cx = id % N, cz = (id / N) | 0;
        for (var d = 0; d < 4; d++) {
          if (!canMove(cx, cz, d)) continue;
          var nid = (cz + DZ[d]) * N + cx + DX[d];
          if (dist[nid] >= 0) continue;
          dist[nid] = dist[id] + 1; prev[nid] = id; q.push(nid);
        }
      }
      return { dist: dist, prev: prev };
    }
    function path(fromCx, fromCz, toCx, toCz) {
      var res = bfs(toCx, toCz); // BFS desde el destino => reconstrucción directa
      var out = [], id = fromCz * N + fromCx;
      if (res.dist[id] < 0) return out;
      while (id !== -1) { out.push({ cx: id % N, cz: (id / N) | 0 }); id = res.prev[id]; }
      return out; // incluye origen y destino
    }
    // Línea de visión simple: misma fila/columna sin paredes entre medio.
    function lineOfSight(a, b) {
      var s, e, i2;
      if (a.cz === b.cz) {
        s = Math.min(a.cx, b.cx); e = Math.max(a.cx, b.cx);
        for (i2 = s; i2 < e; i2++) if (!canMove(i2, a.cz, 0)) return false;
        return true;
      }
      if (a.cx === b.cx) {
        s = Math.min(a.cz, b.cz); e = Math.max(a.cz, b.cz);
        for (i2 = s; i2 < e; i2++) if (!canMove(a.cx, i2, 2)) return false;
        return true;
      }
      return false;
    }

    // Orientación inicial: mirar hacia el pasillo abierto.
    M.startCell = { cx: 0, cz: 0 };
    M.start = center(0, 0);
    M.startYaw = canMove(0, 0, 0) ? -90 : 180;

    /* ------------------------------------------------------------------
       7) Actualización de luces: parpadeo + pool de luces dinámicas
       ------------------------------------------------------------------ */
    var assignTimer = 0, zapCooldown = 0, colorDirty = false;
    function update(dt, player, entity) {
      zapCooldown -= dt;
      if (M.waterTex) { M.waterTex.offset.x += dt * 0.018; M.waterTex.offset.y += dt * 0.011; }
      // Gotas que caen del techo; suenan al tocar el charco (sólo las cercanas).
      for (var lq = 0; lq < M.leaks.length; lq++) {
        var lk = M.leaks[lq];
        lk.t += dt;
        var fall = lk.t / lk.period, near = !player || (Math.abs(lk.x - player.x) < 16 && Math.abs(lk.z - player.z) < 16);
        lk.drop.visible = near;
        if (fall >= 1) {
          lk.t = 0;
          if (near && player && window.BRAudio) BRAudio.drip({ x: lk.x, y: 0.1, z: lk.z });
        }
        lk.drop.position.y = (H - 0.05) - (H - 0.05) * Math.min(1, fall * fall * 1.6);
      }
      for (var k = 0; k < fixtures.length; k++) {
        var fi = fixtures[k];
        var threat = 0;
        if (entity) {
          var ex = fi.x - entity.x, ez = fi.z - entity.z;
          var ed = Math.sqrt(ex * ex + ez * ez);
          if (ed < 10) threat = 1 - ed / 10;
        }
        if (fi.dead) {
          // Lámpara muerta: apagada siempre.
        } else if (fi.faulty || threat > 0) {
          fi.timer -= dt;
          if (fi.timer <= 0) {
            if (fi.on) {
              fi.on = false;
              fi.timer = 0.03 + r() * (threat > 0.3 ? 0.08 : 0.16);
            } else {
              fi.on = true;
              if (fi.burst > 0) { fi.burst--; fi.timer = 0.03 + r() * 0.15; }
              else { fi.burst = 1 + Math.floor(r() * 5); fi.timer = (fi.faulty ? 1 + r() * 5 : 2 + r() * 4); }
              if (threat > 0) fi.timer *= (1 - threat * 0.92);
              // Chispazo sincronizado al volver a encenderse.
              if (player && zapCooldown <= 0) {
                var pdx = fi.x - player.x, pdz = fi.z - player.z;
                var pd = Math.sqrt(pdx * pdx + pdz * pdz);
                if (pd < 13 && window.BRAudio) {
                  BRAudio.zap({ x: fi.x, y: H - 0.1, z: fi.z }, 0.5 * (1 - pd / 13) + 0.05);
                  zapCooldown = 0.07;
                }
              }
            }
          }
          fi.bright = fi.on ? 1 : 0.06 + r() * 0.1;
        } else if (!fi.on || fi.bright !== 1) {
          fi.on = true; fi.bright = 1;
        }
        if (fi.bright !== fi.shown) {
          fi.shown = fi.bright;
          var b = fi.dead ? 0.07 : 0.25 + fi.bright * 0.75, tn = CFG.panelTint;
          panels.setColorAt(k, tmpC.setRGB(b * tn[0], b * tn[1], b * tn[2]));
          colorDirty = true;
        }
      }
      if (colorDirty) { panels.instanceColor.needsUpdate = true; colorDirty = false; }

      if (!player) return;
      // Reasignar el pool de luces a las lámparas más cercanas (priorizando defectuosas).
      assignTimer -= dt;
      if (assignTimer <= 0) {
        assignTimer = 0.25;
        var pc = cellOf(player.x, player.z), cand = [];
        for (var cz = pc.cz - 2; cz <= pc.cz + 2; cz++) for (var cx = pc.cx - 2; cx <= pc.cx + 2; cx++) {
          if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
          var fo = fx(cx, cz), ddx = fo.x - player.x, ddz = fo.z - player.z;
          if (fo.dead) continue;
          cand.push({ f: fo, s: Math.sqrt(ddx * ddx + ddz * ddz) - (fo.faulty ? 1.5 : 0) });
        }
        cand.sort(function (a, b) { return a.s - b.s; });
        var chosen = cand.slice(0, LIGHT_POOL).map(function (c) { return c.f; });
        var free = [];
        lights.forEach(function (l) {
          var idx = chosen.indexOf(l.userData.fixture);
          if (idx >= 0) chosen.splice(idx, 1); else free.push(l);
        });
        free.forEach(function (l, j) {
          var nf = chosen[j];
          if (!nf) return;
          l.userData.fixture = nf; l.userData.fade = 0;
          l.position.set(nf.x, H - 0.35, nf.z);
        });
      }
      var sum = 0;
      lights.forEach(function (l) {
        var fo = l.userData.fixture;
        if (!fo) return;
        l.userData.fade = Math.min(1, l.userData.fade + dt * 3);
        l.intensity = CFG.lightPower * fo.bright * l.userData.fade;
        sum += fo.bright;
      });
      if (window.BRAudio) BRAudio.setHumLevel(0.55 + 0.45 * (sum / LIGHT_POOL));
    }

    M.resolve = resolve;
    M.canMove = canMove;
    M.cellOf = cellOf;
    M.center = center;
    M.bfs = bfs;
    M.path = path;
    M.lineOfSight = lineOfSight;
    M.update = update;
    M.fixtures = fixtures;
    M.boxes = boxes;
    return M;
  }

  window.BRMaze = { build: build };
})();
