/* ==========================================================================
   textures.js — Generador procedural de texturas (HTML5 Canvas)
   Todas las texturas del juego se dibujan aquí: cero imágenes externas.
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;

  // PRNG determinista (mulberry32) para que las texturas sean estables.
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Ruido por píxel (grano). amount = amplitud en niveles de 0-255.
  function grain(ctx, w, h, amount, r, colorJitter) {
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (r() - 0.5) * amount;
      var cj = colorJitter ? (r() - 0.5) * colorJitter : 0;
      d[i] = clamp(d[i] + n + cj);
      d[i + 1] = clamp(d[i + 1] + n);
      d[i + 2] = clamp(d[i + 2] + n - cj);
    }
    ctx.putImageData(img, 0, 0);
  }
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // Dibuja una mancha irregular, repitiéndola en los bordes para que sea "tileable".
  function blot(ctx, w, h, x, y, rad, rgb, alpha, r, wrapY) {
    var offs = [[0, 0], [w, 0], [-w, 0]];
    if (wrapY) offs.push([0, h], [0, -h], [w, h], [-w, -h], [w, -h], [-w, h]);
    var lobes = 5 + Math.floor(r() * 6);
    var pts = [];
    for (var k = 0; k < lobes; k++) {
      pts.push([x + (r() - 0.5) * rad * 1.2, y + (r() - 0.5) * rad * 1.2, rad * (0.35 + r() * 0.6)]);
    }
    offs.forEach(function (o) {
      pts.forEach(function (p) {
        var g = ctx.createRadialGradient(p[0] + o[0], p[1] + o[1], 0, p[0] + o[0], p[1] + o[1], p[2]);
        g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
        g.addColorStop(0.65, 'rgba(' + rgb + ',' + (alpha * 0.5) + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p[0] + o[0], p[1] + o[1], p[2], 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  // Anillo de humedad (borde marcado y centro más claro), típico de techos.
  function waterRing(ctx, w, h, x, y, rad, r) {
    var offs = [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h], [w, h], [-w, -h], [w, -h], [-w, h]];
    offs.forEach(function (o) {
      var cx = x + o[0], cy = y + o[1];
      var g = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
      g.addColorStop(0, 'rgba(150,120,60,0.08)');
      g.addColorStop(0.8, 'rgba(140,105,45,0.22)');
      g.addColorStop(0.93, 'rgba(110,80,30,0.45)');
      g.addColorStop(1, 'rgba(110,80,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad, rad * (0.7 + r() * 0.3), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function toTexture(canvas, repeatS, repeatT) {
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = repeatT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /* ---------- Papel tapiz amarillo (256 x 512 = 1.6 m x 3.2 m de pared) ---------- */
  function wallpaper() {
    var w = 256, h = 512, r = rng(1337);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');

    ctx.fillStyle = '#c9b562';
    ctx.fillRect(0, 0, w, h);

    // Franjas verticales alternas (8 franjas = tileable).
    for (var s = 0; s < 8; s++) {
      ctx.fillStyle = s % 2 ? 'rgba(120,95,30,0.07)' : 'rgba(255,240,170,0.06)';
      ctx.fillRect(s * 32, 0, 32, h);
      ctx.fillStyle = 'rgba(110,85,25,0.12)';
      ctx.fillRect(s * 32, 0, 1, h);
    }

    // Patrón geométrico sutil: rombos con punto central y "chevrons".
    ctx.lineWidth = 1.2;
    for (var y = 0; y < h; y += 32) {
      for (var x = 0; x < w; x += 32) {
        var cx = x + 16, cy = y + 16 + ((x / 32) % 2 ? 16 : 0);
        ctx.strokeStyle = 'rgba(125,100,35,0.22)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 7, cy); ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(125,100,35,0.25)';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
        ctx.strokeStyle = 'rgba(255,245,190,0.10)';
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 14); ctx.lineTo(cx, cy - 11); ctx.lineTo(cx + 5, cy - 14);
        ctx.stroke();
      }
    }

    grain(ctx, w, h, 14, r, 6);

    // Manchas de humedad aleatorias en la parte media.
    for (var i = 0; i < 5; i++) {
      blot(ctx, w, h, r() * w, h * 0.2 + r() * h * 0.5, 18 + r() * 30, '120,95,35', 0.10 + r() * 0.08, r, false);
    }

    // Desgaste y humedad en la parte inferior (el suelo es y = h).
    var g = ctx.createLinearGradient(0, h * 0.62, 0, h);
    g.addColorStop(0, 'rgba(90,70,20,0)');
    g.addColorStop(0.6, 'rgba(90,70,20,0.18)');
    g.addColorStop(1, 'rgba(60,45,12,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    for (var j = 0; j < 14; j++) {
      blot(ctx, w, h, r() * w, h - r() * 70, 14 + r() * 34, '85,62,18', 0.14 + r() * 0.12, r, false);
    }
    // Chorreados verticales que suben desde el zócalo.
    for (var k = 0; k < 10; k++) {
      var sx = r() * w, len = 30 + r() * 110, sw = 2 + r() * 5;
      var sg = ctx.createLinearGradient(0, h - len, 0, h);
      sg.addColorStop(0, 'rgba(80,60,15,0)');
      sg.addColorStop(1, 'rgba(80,60,15,0.28)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx, h - len, sw, len);
      ctx.fillRect(sx - w, h - len, sw, len);
    }
    // Zócalo sucio.
    ctx.fillStyle = 'rgba(70,52,18,0.75)';
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = 'rgba(40,30,10,0.6)';
    ctx.fillRect(0, h - 11, w, 1);
    // Leve oscurecimiento junto al techo.
    var tg = ctx.createLinearGradient(0, 0, 0, 30);
    tg.addColorStop(0, 'rgba(80,65,25,0.25)');
    tg.addColorStop(1, 'rgba(80,65,25,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, w, 30);

    return toTexture(c, true, false);
  }

  /* ---------- Alfombra mostaza húmeda (256 x 256 = 2 m x 2 m) ---------- */
  function carpet() {
    var w = 256, h = 256, r = rng(4242);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#86703a';
    ctx.fillRect(0, 0, w, h);

    // Variación de baja frecuencia (zonas más claras/oscuras).
    for (var i = 0; i < 26; i++) {
      var light = r() > 0.5;
      blot(ctx, w, h, r() * w, r() * h, 20 + r() * 40, light ? '170,145,80' : '70,55,25', 0.10, r, true);
    }
    // Manchas húmedas oscuras.
    for (var j = 0; j < 6; j++) {
      blot(ctx, w, h, r() * w, r() * h, 16 + r() * 28, '55,42,18', 0.22 + r() * 0.15, r, true);
    }
    // Grano fuerte de fibras.
    grain(ctx, w, h, 46, r, 10);
    // Fibras sueltas (pequeños trazos).
    for (var k = 0; k < 1400; k++) {
      var x = r() * w, y = r() * h, a = r() * Math.PI;
      ctx.strokeStyle = r() > 0.5 ? 'rgba(190,165,95,0.25)' : 'rgba(50,38,15,0.3)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5);
      ctx.stroke();
    }
    return toTexture(c, true, true);
  }

  /* ---------- Techo de placas acústicas (256 x 256 = 2 x 2 placas = 1.2 m) ---------- */
  function ceiling() {
    var w = 256, h = 256, r = rng(777);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#d6cfae';
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 16, r, 4);

    // Perforaciones acústicas.
    for (var i = 0; i < 2200; i++) {
      ctx.fillStyle = 'rgba(90,80,55,' + (0.15 + r() * 0.25) + ')';
      var s = r() > 0.85 ? 2 : 1;
      ctx.fillRect(r() * w, r() * h, s, s);
    }
    // Manchas de agua.
    for (var j = 0; j < 3; j++) waterRing(ctx, w, h, r() * w, r() * h, 16 + r() * 30, r);
    blot(ctx, w, h, r() * w, r() * h, 22, '120,100,50', 0.15, r, true);

    // Rejilla en T (perfiles metálicos) en los bordes de cada placa.
    ctx.fillStyle = '#b9b39d';
    for (var g = 0; g < 2; g++) {
      ctx.fillRect(g * 128, 0, 3, h);
      ctx.fillRect(0, g * 128, w, 3);
    }
    ctx.fillStyle = 'rgba(60,55,40,0.35)';
    for (var g2 = 0; g2 < 2; g2++) {
      ctx.fillRect(g2 * 128 + 3, 0, 1, h);
      ctx.fillRect(0, g2 * 128 + 3, w, 1);
    }
    return toTexture(c, true, true);
  }

  /* ---------- Panel fluorescente ---------- */
  function lightPanel() {
    var w = 128, h = 64;
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#9d9a88';
    ctx.fillRect(0, 0, w, h);
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fffbe6'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#fffbe6');
    ctx.fillStyle = g;
    ctx.fillRect(5, 5, w - 10, h - 10);
    ctx.strokeStyle = 'rgba(160,155,130,0.6)';
    ctx.lineWidth = 1;
    for (var x = 5; x < w - 5; x += 6) { ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x, h - 5); ctx.stroke(); }
    for (var y = 5; y < h - 5; y += 6) { ctx.beginPath(); ctx.moveTo(5, y); ctx.lineTo(w - 5, y); ctx.stroke(); }
    return toTexture(c, false, false);
  }

  /* ---------- Letrero EXIT verde ---------- */
  function exitSign(locked) {
    var w = 256, h = 128;
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = locked ? '#160606' : '#06140a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = locked ? '#6b1d1d' : '#1d6b33';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.font = 'bold 78px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = locked ? '#ff3a2a' : '#4dff7a';
    ctx.shadowBlur = 22;
    ctx.fillStyle = locked ? '#ff6a5a' : '#7dff9b';
    ctx.fillText('EXIT', w / 2, h / 2 + 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = locked ? '#ffd8d0' : '#d8ffe0';
    ctx.fillText('EXIT', w / 2, h / 2 + 4);
    return toTexture(c, false, false);
  }

  /* ---------- Puerta metálica ---------- */
  function door() {
    var w = 128, h = 256, r = rng(99);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#5b5a50';
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 20, r, 0);
    ctx.strokeStyle = 'rgba(25,25,20,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 16, w - 28, 90);
    ctx.strokeRect(14, 124, w - 28, 112);
    // Barra antipánico.
    ctx.fillStyle = '#2b2b27';
    ctx.fillRect(10, 112, w - 20, 9);
    ctx.fillStyle = '#9a988b';
    ctx.fillRect(10, 112, w - 20, 3);
    // Óxido y suciedad abajo.
    blot(ctx, w, h, 30, 240, 30, '90,55,25', 0.4, r, false);
    blot(ctx, w, h, 100, 230, 25, '90,55,25', 0.3, r, false);
    return toTexture(c, false, false);
  }

  /* ---------- Rostro del susto ---------- */
  function scareFace() {
    var w = 512, h = 512, r = rng(666);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Cabeza alargada.
    var g = ctx.createRadialGradient(256, 230, 20, 256, 230, 240);
    g.addColorStop(0, '#1a1712'); g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(256, 240, 150, 230, 0, 0, Math.PI * 2); ctx.fill();
    // Ojos vacíos que brillan.
    [[190, 200], [322, 196]].forEach(function (e) {
      var eg = ctx.createRadialGradient(e[0], e[1], 2, e[0], e[1], 40);
      eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.3, '#fff4c8'); eg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(e[0], e[1], 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(e[0], e[1], 5, 0, Math.PI * 2); ctx.fill();
    });
    // Boca desgarrada.
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#3a0000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(150, 330);
    for (var x = 150; x <= 362; x += 12) ctx.lineTo(x, 330 + (r() - 0.5) * 30 + Math.sin(x / 30) * 12);
    for (var x2 = 362; x2 >= 150; x2 -= 12) ctx.lineTo(x2, 400 + (r() - 0.5) * 40);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Zarcillos / bacteria.
    ctx.strokeStyle = 'rgba(20,18,15,0.9)';
    for (var i = 0; i < 40; i++) {
      ctx.lineWidth = 1 + r() * 5;
      ctx.beginPath();
      var sx = 256 + (r() - 0.5) * 260, sy = 40 + r() * 80;
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + (r() - 0.5) * 200, sy - 80, sx + (r() - 0.5) * 300, sy - 40, sx + (r() - 0.5) * 400, -20);
      ctx.stroke();
    }
    // Líneas de interferencia.
    for (var l = 0; l < 60; l++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (r() * 0.12) + ')';
      ctx.fillRect(0, r() * h, w, 1 + r() * 3);
    }
    return toTexture(c, false, false);
  }

  /* ---------- HUD (texto en una textura dinámica) ---------- */
  function hudCanvas() {
    var c = makeCanvas(1024, 512);
    var tex = toTexture(c, false, false);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return { canvas: c, ctx: c.getContext('2d'), texture: tex };
  }
  function drawHud(hud, title, lines, color) {
    var ctx = hud.ctx, w = hud.canvas.width, h = hud.canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (title) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      roundRect(ctx, 40, 40, w - 80, h - 80, 30);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 96px Arial, Helvetica, sans-serif';
      ctx.shadowColor = color; ctx.shadowBlur = 25;
      ctx.fillStyle = color;
      ctx.fillText(title, w / 2, 150);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#eee6c8';
      ctx.font = '44px Arial, Helvetica, sans-serif';
      (lines || []).forEach(function (t, i) { ctx.fillText(t, w / 2, 270 + i * 62); });
    }
    hud.texture.needsUpdate = true;
  }
  function roundRect(ctx, x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  /* ---------- Botón de "mirar para caminar" en el suelo ---------- */
  function gazeButton() {
    var c = makeCanvas(256, 256);
    var tex = toTexture(c, false, false);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    var obj = { canvas: c, ctx: c.getContext('2d'), texture: tex, last: -1, lastWalk: null };
    obj.draw = function (progress, walking) {
      var p = Math.round(progress * 20) / 20;
      if (p === obj.last && walking === obj.lastWalk) return;
      obj.last = p; obj.lastWalk = walking;
      var ctx = obj.ctx;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(128, 128, 110, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(255,240,180,0.35)';
      ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI * 2); ctx.stroke();
      if (p > 0) {
        ctx.strokeStyle = '#ffe680';
        ctx.beginPath(); ctx.arc(128, 128, 100, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = walking ? '#ff8a6a' : '#fff2b0';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (walking) {
        ctx.fillRect(98, 90, 20, 56); ctx.fillRect(138, 90, 20, 56);
      } else {
        ctx.beginPath(); ctx.moveTo(128, 70); ctx.lineTo(170, 130); ctx.lineTo(86, 130); ctx.closePath(); ctx.fill();
        ctx.fillRect(116, 128, 24, 30);
      }
      ctx.font = 'bold 26px Arial, Helvetica, sans-serif';
      ctx.fillText(walking ? 'DETENER' : 'CAMINAR', 128, 186);
      tex.needsUpdate = true;
    };
    obj.draw(0, false);
    return obj;
  }

  /* =====================  LAS PISCINAS (Poolrooms)  ===================== */
  // Azulejos cuadrados con junta. tiles = azulejos por lado del lienzo.
  function tiles(seed, base, grout, tilesN, grime) {
    var w = 256, h = 256, r = rng(seed);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    var ts = w / tilesN;
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, w, h);
    for (var ty = 0; ty < tilesN; ty++) {
      for (var tx = 0; tx < tilesN; tx++) {
        var v = (r() - 0.5) * 10;
        ctx.fillStyle = shade(base, v);
        ctx.fillRect(tx * ts + 1.5, ty * ts + 1.5, ts - 3, ts - 3);
        // Brillo esmaltado.
        var g = ctx.createLinearGradient(tx * ts, ty * ts, tx * ts + ts, ty * ts + ts);
        g.addColorStop(0, 'rgba(255,255,255,0.22)');
        g.addColorStop(0.5, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.05)');
        ctx.fillStyle = g;
        ctx.fillRect(tx * ts + 1.5, ty * ts + 1.5, ts - 3, ts - 3);
      }
    }
    grain(ctx, w, h, 6, r, 0);
    if (grime) {
      for (var i = 0; i < 4; i++) blot(ctx, w, h, r() * w, r() * h, 10 + r() * 20, '120,140,130', 0.08, r, true);
    }
    return toTexture(c, true, true);
  }
  function shade(hex, v) {
    var n = parseInt(hex.slice(1), 16);
    var rr = clamp(((n >> 16) & 255) + v), gg = clamp(((n >> 8) & 255) + v), bb = clamp((n & 255) + v);
    return 'rgb(' + (rr | 0) + ',' + (gg | 0) + ',' + (bb | 0) + ')';
  }
  function poolWall() { return tiles(31, '#e9f1f0', '#b7c6c5', 8, true); }
  function poolFloor() { return tiles(32, '#e4eeee', '#aebfbe', 8, true); }
  function poolBottom() { return tiles(33, '#78c8dc', '#4f9fb3', 8, false); }
  function poolCeiling() { return tiles(34, '#f2f6f4', '#c9d3d1', 4, false); }

  // Cáusticas: red luminosa tipo reflejo de agua (se anima desplazando la textura).
  function caustics() {
    var w = 256, h = 256, r = rng(55);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#4fb8cf';
    ctx.fillRect(0, 0, w, h);
    var pts = [];
    for (var i = 0; i < 28; i++) pts.push([r() * w, r() * h]);
    ctx.strokeStyle = 'rgba(225,255,255,0.55)';
    for (var a = 0; a < pts.length; a++) {
      // Conecta cada punto con sus 3 vecinos más cercanos (con repetición en los bordes).
      var near = [];
      for (var b = 0; b < pts.length; b++) {
        if (a === b) continue;
        for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
          var bx = pts[b][0] + ox * w, by = pts[b][1] + oy * h;
          var d = (bx - pts[a][0]) * (bx - pts[a][0]) + (by - pts[a][1]) * (by - pts[a][1]);
          near.push([d, bx, by]);
        }
      }
      near.sort(function (x, y) { return x[0] - y[0]; });
      for (var k = 0; k < 3; k++) {
        ctx.lineWidth = 1.5 + r() * 2.5;
        ctx.beginPath();
        var mx = (pts[a][0] + near[k][1]) / 2 + (r() - 0.5) * 14, my = (pts[a][1] + near[k][2]) / 2 + (r() - 0.5) * 14;
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.quadraticCurveTo(mx, my, near[k][1], near[k][2]);
        ctx.stroke();
      }
    }
    return toTexture(c, true, true);
  }

  /* ---------- Cartón de las cajas (bodega) ---------- */
  function cardboard() {
    var w = 256, h = 256, r = rng(808);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#9b7a4c';
    ctx.fillRect(0, 0, w, h);
    for (var y = 0; y < h; y += 3) { ctx.fillStyle = 'rgba(70,50,25,' + (0.04 + r() * 0.05) + ')'; ctx.fillRect(0, y, w, 1); }
    grain(ctx, w, h, 22, r, 6);
    ctx.fillStyle = 'rgba(210,190,150,0.55)'; ctx.fillRect(0, 118, w, 20); // cinta
    for (var i = 0; i < 4; i++) blot(ctx, w, h, r() * w, r() * h, 20 + r() * 30, '60,40,20', 0.15, r, true);
    ctx.fillStyle = 'rgba(40,30,20,0.5)'; ctx.font = 'bold 22px Arial'; ctx.fillText('FRÁGIL ↑↑', 20, 60);
    return toTexture(c, true, true);
  }

  /* ---------- Nota coleccionable ---------- */
  function note(index) {
    var w = 128, h = 160, r = rng(900 + index);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#efe6c8'; ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 18, r, 4);
    blot(ctx, w, h, r() * w, r() * h, 30, '150,120,60', 0.2, r, false);
    ctx.strokeStyle = 'rgba(40,40,80,0.75)'; ctx.lineWidth = 1.5;
    for (var y = 28; y < h - 12; y += 13) {
      ctx.beginPath(); ctx.moveTo(12, y);
      for (var x = 12; x < w - 12; x += 6) ctx.lineTo(x, y + (r() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#7a1010'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
    ctx.fillText(String(index + 1), w / 2, 20);
    return toTexture(c, false, false);
  }

  /* ---------- HUD de estado (batería, linterna, notas) ---------- */
  function statusHud() {
    var c = makeCanvas(512, 128);
    var tex = toTexture(c, false, false);
    tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    var o = { canvas: c, ctx: c.getContext('2d'), texture: tex, key: '' };
    o.draw = function (st) {
      var key = [Math.round(st.battery), st.on, st.notes, st.total, Math.round(st.stamina / 5), st.msg || ''].join('|');
      if (key === o.key) return;
      o.key = key;
      var ctx = o.ctx;
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, 8, 70, 496, 50, 14); ctx.fill();
      // Batería.
      ctx.strokeStyle = '#e9e2c4'; ctx.lineWidth = 3; ctx.strokeRect(24, 82, 120, 26); ctx.fillStyle = '#e9e2c4'; ctx.fillRect(144, 89, 6, 12);
      var b = Math.max(0, st.battery) / 100;
      ctx.fillStyle = b > 0.5 ? '#7dff9b' : b > 0.2 ? '#ffd45a' : '#ff5a4a';
      ctx.fillRect(27, 85, 114 * b, 20);
      ctx.font = 'bold 22px Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = st.on ? '#fff3c8' : '#8a8470';
      ctx.fillText(st.on ? '🔦 ON' : '🔦 OFF', 160, 96);
      // Notas.
      if (st.total) { ctx.fillStyle = st.notes >= st.total ? '#7dff9b' : '#efe6c8'; ctx.fillText('📄 ' + st.notes + '/' + st.total, 270, 96); }
      // Aliento.
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(380, 90, 110, 10);
      ctx.fillStyle = '#9fd3ff'; ctx.fillRect(380, 90, 110 * st.stamina / 100, 10);
      if (st.msg) {
        ctx.textAlign = 'center'; ctx.font = 'bold 26px Arial';
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, 40, 10, 432, 46, 12); ctx.fill();
        ctx.fillStyle = '#fff3c8'; ctx.fillText(st.msg, 256, 34);
      }
      tex.needsUpdate = true;
    };
    return o;
  }

  window.BRTextures = {
    rng: rng,
    wallpaper: wallpaper,
    carpet: carpet,
    ceiling: ceiling,
    lightPanel: lightPanel,
    exitSign: exitSign,
    door: door,
    scareFace: scareFace,
    hudCanvas: hudCanvas,
    drawHud: drawHud,
    gazeButton: gazeButton,
    poolWall: poolWall,
    poolFloor: poolFloor,
    poolBottom: poolBottom,
    poolCeiling: poolCeiling,
    caustics: caustics,
    cardboard: cardboard,
    note: note,
    statusHud: statusHud
  };
})();
