/* ==========================================================================
   audio.js — Motor de audio 100% procedural (Web Audio API)
   Zumbido fluorescente, pasos, chispazos eléctricos, ruidos lejanos,
   estática de amenaza y susto final. Sin archivos de audio externos.
   ========================================================================== */
(function () {
  'use strict';

  var A = {
    ctx: null,
    ready: false,
    playerPos: { x: 0, y: 1.6, z: 0 },
    playing: false
  };
  var master, sfxBus, reverb, reverbSend, humGain, threatGain, threatLowGain, noiseBuf, ambientTimer;

  function now() { return A.ctx.currentTime; }

  /* ---------- Inicialización / desbloqueo (debe llamarse en un gesto del usuario) ---------- */
  A.init = function () {
    if (A.ctx) { A.ctx.resume(); return A.ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    A.ctx = new AC();
    var ctx = A.ctx;

    // Desbloqueo en iOS: reproducir un buffer silencioso dentro del gesto.
    var silent = ctx.createBuffer(1, 1, 22050);
    var s = ctx.createBufferSource();
    s.buffer = silent; s.connect(ctx.destination); s.start(0);
    if (ctx.state === 'suspended') ctx.resume();

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);

    sfxBus = ctx.createGain(); sfxBus.connect(master);

    // Buffer de ruido blanco reutilizable (2 s).
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Reverb sintética (impulso de ruido con decaimiento) para el espacio vacío.
    reverb = ctx.createConvolver();
    var len = Math.floor(ctx.sampleRate * 2.6);
    var ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var data = ir.getChannelData(ch);
      for (var j = 0; j < len; j++) data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.6);
    }
    reverb.buffer = ir;
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0.55;
    reverbSend.connect(reverb); reverb.connect(master);

    A.ready = true;
    return ctx;
  };

  function noiseSource(loop) {
    var src = A.ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = !!loop;
    return src;
  }

  // Panner 3D sencillo (equalpower: barato en móvil).
  function panner(pos) {
    var p = A.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 2.5;
    p.rolloffFactor = 1.1;
    p.maxDistance = 80;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  // Salida opcionalmente posicional + envío a reverb.
  function output(pos, wet) {
    var g = A.ctx.createGain();
    if (pos) { var p = panner(pos); g.connect(p); p.connect(sfxBus); if (wet) { var w = A.ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(reverbSend); } }
    else { g.connect(sfxBus); if (wet) { var w2 = A.ctx.createGain(); w2.gain.value = wet; g.connect(w2); w2.connect(reverbSend); } }
    return g;
  }

  /* ---------- Listener (sigue a la cámara) ---------- */
  A.updateListener = function (pos, fwd) {
    if (!A.ready) return;
    A.playerPos = pos;
    var l = A.ctx.listener, t = now();
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  };

  /* ---------- Zumbido de fluorescentes: 60 Hz + armónicos ---------- */
  A.theme = 'level0';
  A.startHum = function (theme) {
    if (!A.ready || humGain) return;
    A.theme = theme || 'level0';
    var ctx = A.ctx;
    if (A.theme === 'pools') { startWater(); return; }
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    var humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass'; humFilter.frequency.value = 900;
    humGain.connect(humFilter); humFilter.connect(master);

    var harmonics = [[60, 0.32], [120, 0.42], [180, 0.12], [240, 0.10], [300, 0.04], [360, 0.05], [480, 0.02]];
    harmonics.forEach(function (h) {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = h[0] * (1 + (Math.random() - 0.5) * 0.002);
      var g = ctx.createGain(); g.gain.value = h[1];
      o.connect(g); g.connect(humGain); o.start();
    });
    // Zumbido "sucio" del balasto (diente de sierra a 120 Hz filtrado).
    var buzz = ctx.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 120;
    var bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 3;
    var bg = ctx.createGain(); bg.gain.value = 0.05;
    buzz.connect(bf); bf.connect(bg); bg.connect(master); buzz.start();
    // Siseo eléctrico muy suave.
    var hiss = noiseSource(true);
    var hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 5200; hf.Q.value = 0.8;
    var hg = ctx.createGain(); hg.gain.value = 0.012;
    hiss.connect(hf); hf.connect(hg); hg.connect(master); hiss.start();
    // Ondulación lenta del volumen.
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    var lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(humGain.gain); lfo.start();
    humGain.gain.setTargetAtTime(A.theme === 'warehouse' ? 0.07 : 0.16, now(), 0.8);
    if (A.theme === 'warehouse') {
      // Ventilación industrial lejana.
      var vn = noiseSource(true), vf = ctx.createBiquadFilter();
      vf.type = 'lowpass'; vf.frequency.value = 180;
      var vg = ctx.createGain(); vg.gain.value = 0.3;
      vn.connect(vf); vf.connect(vg); vg.connect(master); vn.start();
      var vl = ctx.createOscillator(); vl.frequency.value = 0.07;
      var vlg = ctx.createGain(); vlg.gain.value = 0.12;
      vl.connect(vlg); vlg.connect(vg.gain); vl.start();
    }

    startThreat(ctx);
  };

  // Estática / distorsión de amenaza (controlada por cercanía de la entidad).
  function startThreat(ctx) {
    var st = noiseSource(true);
    var sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 1700; sbp.Q.value = 0.6;
    var shaper = ctx.createWaveShaper(); shaper.curve = distortionCurve(60);
    threatGain = ctx.createGain(); threatGain.gain.value = 0;
    st.connect(sbp); sbp.connect(shaper); shaper.connect(threatGain); threatGain.connect(master); st.start();
    var low = ctx.createOscillator(); low.type = 'sawtooth'; low.frequency.value = 41;
    var lowf = ctx.createBiquadFilter(); lowf.type = 'lowpass'; lowf.frequency.value = 160;
    threatLowGain = ctx.createGain(); threatLowGain.gain.value = 0;
    low.connect(lowf); lowf.connect(threatLowGain); threatLowGain.connect(master); low.start();
  }

  /* ---------- Las Piscinas: agua que se mece, bomba lejana y eco ---------- */
  function startWater() {
    var ctx = A.ctx;
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    humGain.connect(master);
    var wet = ctx.createGain(); wet.gain.value = 0.5; humGain.connect(wet); wet.connect(reverbSend);
    // Oleaje suave: ruido filtrado con dos LFO lentos.
    var n = noiseSource(true);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    var lap = ctx.createGain(); lap.gain.value = 0.35;
    n.connect(lp); lp.connect(lap); lap.connect(humGain); n.start();
    [[0.17, 0.2], [0.29, 0.12]].forEach(function (l) {
      var o = ctx.createOscillator(); o.frequency.value = l[0];
      var g = ctx.createGain(); g.gain.value = l[1];
      o.connect(g); g.connect(lap.gain); o.start();
    });
    var fm = ctx.createOscillator(); fm.frequency.value = 0.11;
    var fmg = ctx.createGain(); fmg.gain.value = 180;
    fm.connect(fmg); fmg.connect(lp.frequency); fm.start();
    // Bomba de la piscina, muy grave y lejana.
    var pump = ctx.createOscillator(); pump.type = 'sine'; pump.frequency.value = 50;
    var pg = ctx.createGain(); pg.gain.value = 0.12;
    pump.connect(pg); pg.connect(humGain); pump.start();
    humGain.gain.setTargetAtTime(0.5, now(), 1.2);
    startThreat(ctx);
  }

  A.drip = function (pos) {
    var ctx = A.ctx, t = now(), f = 900 + Math.random() * 1400;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.06);
    var g = output(pos, 1.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); o.start(t); o.stop(t + 0.15);
  };

  A.splash = function (pos) {
    var ctx = A.ctx, t = now(), dur = 0.5 + Math.random() * 0.6;
    var n = noiseSource(false), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    var g = output(pos, 1.0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(400, t + dur);
    n.connect(bp); bp.connect(g); n.start(t, Math.random(), dur + 0.05);
  };

  // Baja/sube el zumbido cuando las lámparas cercanas se apagan.
  A.setHumLevel = function (lvl) {
    if (!humGain || A.theme === 'pools') return;
    humGain.gain.setTargetAtTime((A.theme === 'warehouse' ? 0.07 : 0.16) * lvl, now(), 0.05);
  };

  function distortionCurve(k) {
    var n = 2048, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return curve;
  }

  /* ---------- Amenaza: 0 (lejos) .. 1 (encima) ---------- */
  A.setThreat = function (t) {
    if (!threatGain) return;
    var j = 0.6 + Math.random() * 0.4; // chisporroteo irregular
    threatGain.gain.setTargetAtTime(t * t * 0.22 * j, now(), 0.04);
    threatLowGain.gain.setTargetAtTime(t * 0.35, now(), 0.2);
  };

  /* ---------- Pasos suaves sobre alfombra húmeda ---------- */
  A.footstep = function (intensity, wet) {
    if (!A.ready) return;
    if (wet) { waterStep(); return; }
    var ctx = A.ctx, t = now(), vol = 0.22 * (intensity || 1) * (0.8 + Math.random() * 0.4);
    var src = noiseSource(false);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380 + Math.random() * 260; lp.Q.value = 0.9;
    var g = output(null, 0.15);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(lp); lp.connect(g);
    src.start(t, Math.random() * 1.5, 0.2);
    // "Chapoteo" húmedo.
    var src2 = noiseSource(false);
    var hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 1.5;
    var g2 = output(null, 0);
    g2.gain.setValueAtTime(0, t + 0.03);
    g2.gain.linearRampToValueAtTime(vol * 0.12, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src2.connect(hp); hp.connect(g2);
    src2.start(t + 0.03, Math.random() * 1.5, 0.15);
  };

  // Paso dentro del agua: chapoteo corto.
  function waterStep() {
    var ctx = A.ctx, t = now(), vol = 0.28 * (0.8 + Math.random() * 0.4);
    var n = noiseSource(false), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(1600 + Math.random() * 600, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    var g = output(null, 0.35);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(bp); bp.connect(g); n.start(t, Math.random() * 1.5, 0.4);
  }

  /* ---------- Chispazo eléctrico de una lámpara (sincronizado con el parpadeo) ---------- */
  A.zap = function (pos, vol) {
    if (!A.ready) return;
    var ctx = A.ctx, t = now();
    var g = output(pos, 0.3);
    g.gain.value = 0;
    var src = noiseSource(false);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2800 + Math.random() * 1500; bp.Q.value = 1.4;
    src.connect(bp); bp.connect(g);
    var sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = 120;
    var sg = ctx.createGain(); sg.gain.value = 0.35;
    sq.connect(sg); sg.connect(g);
    var bursts = 2 + Math.floor(Math.random() * 4), tt = t;
    for (var i = 0; i < bursts; i++) {
      var dur = 0.01 + Math.random() * 0.03;
      g.gain.setValueAtTime(vol * (0.5 + Math.random() * 0.5), tt);
      g.gain.setValueAtTime(0, tt + dur);
      tt += dur + Math.random() * 0.04;
    }
    src.start(t, Math.random(), tt - t + 0.05);
    sq.start(t); sq.stop(tt + 0.05);
  };

  /* ---------- Ruidos ambientales lejanos ---------- */
  function randomFarPos() {
    var a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 18;
    return { x: A.playerPos.x + Math.cos(a) * d, y: 1.5, z: A.playerPos.z + Math.sin(a) * d };
  }

  A.metalBang = function (pos) {
    var ctx = A.ctx, t = now(), base = 70 + Math.random() * 90;
    var g = output(pos, 1.2);
    g.gain.value = 1;
    [1, 2.76, 5.4, 8.93, 13.3].forEach(function (m, i) {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = base * m * (1 + (Math.random() - 0.5) * 0.02);
      var og = ctx.createGain();
      var dec = 2.4 / (i + 1);
      og.gain.setValueAtTime(0.5 / (i + 1), t);
      og.gain.exponentialRampToValueAtTime(0.0005, t + dec);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dec + 0.1);
    });
    var n = noiseSource(false), nf = ctx.createBiquadFilter();
    nf.type = 'lowpass'; nf.frequency.value = 1800;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.8, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(nf); nf.connect(ng); ng.connect(g); n.start(t, 0, 0.2);
  };

  A.staticBurst = function (pos) {
    var ctx = A.ctx, t = now(), dur = 0.6 + Math.random() * 1.4;
    var g = output(pos, 0.6);
    var n = noiseSource(false), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 2000; bp.Q.value = 0.5;
    g.gain.setValueAtTime(0, t);
    for (var tt = t; tt < t + dur; tt += 0.03 + Math.random() * 0.06) g.gain.setValueAtTime(Math.random() * 0.5, tt);
    g.gain.setValueAtTime(0, t + dur);
    n.connect(bp); bp.connect(g); n.start(t, 0, dur + 0.05);
  };

  A.knocks = function (pos) {
    var ctx = A.ctx, t = now(), count = 2 + Math.floor(Math.random() * 4);
    for (var i = 0; i < count; i++) {
      var tt = t + i * (0.35 + Math.random() * 0.25);
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, tt); o.frequency.exponentialRampToValueAtTime(55, tt + 0.12);
      var g = output(pos, 1.0);
      g.gain.setValueAtTime(0.9, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.25);
      o.connect(g); o.start(tt); o.stop(tt + 0.3);
    }
  };

  A.groan = function (pos) {
    var ctx = A.ctx, t = now(), dur = 2.5 + Math.random() * 2;
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    var f0 = 55 + Math.random() * 30;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + dur);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    var g = output(pos, 1.0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp); lp.connect(g); o.start(t); o.stop(t + dur + 0.1);
  };

  A.distantSteps = function (pos) {
    var ctx = A.ctx, t = now(), count = 4 + Math.floor(Math.random() * 5);
    for (var i = 0; i < count; i++) {
      var tt = t + i * 0.55;
      var n = noiseSource(false), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 450;
      var g = output(pos, 1.0);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.7, tt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, tt + 0.18);
      n.connect(lp); lp.connect(g); n.start(tt, Math.random(), 0.2);
    }
  };

  function scheduleAmbient() {
    clearTimeout(ambientTimer);
    ambientTimer = setTimeout(function () {
      if (A.playing && A.ready && A.theme === 'pools') {
        var rp = Math.random(), pp = randomFarPos();
        if (rp < 0.5) { A.drip(pp); setTimeout(function () { A.drip(pp); }, 300 + Math.random() * 900); }
        else if (rp < 0.75) A.splash(pp);
        else if (rp < 0.9) A.distantSteps(pp);
        else A.groan(pp);
      } else if (A.playing && A.ready) {
        var r = Math.random(), pos = randomFarPos();
        if (r < 0.3) A.metalBang(pos);
        else if (r < 0.5) A.staticBurst(pos);
        else if (r < 0.7) A.knocks(pos);
        else if (r < 0.85) A.distantSteps(pos);
        else A.groan(pos);
      }
      scheduleAmbient();
    }, A.theme === 'pools' ? 2500 + Math.random() * 6000 : 7000 + Math.random() * 14000);
  }

  A.startAmbient = function () { A.playing = true; scheduleAmbient(); };
  A.stopAmbient = function () { A.playing = false; };

  /* ---------- Susto (entidad atrapa al jugador) ---------- */
  A.jumpscare = function () {
    if (!A.ready) return;
    var ctx = A.ctx, t = now(), dur = 1.3;
    var shaper = ctx.createWaveShaper(); shaper.curve = distortionCurve(120);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.75, t + 0.02);
    g.gain.setValueAtTime(0.75, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    shaper.connect(g); g.connect(master);
    [310, 437, 622, 880, 1240].forEach(function (f) {
      var o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.45, t + dur);
      var og = ctx.createGain(); og.gain.value = 0.18;
      o.connect(og); og.connect(shaper); o.start(t); o.stop(t + dur);
    });
    var n = noiseSource(false), ng = ctx.createGain(); ng.gain.value = 0.6;
    n.connect(ng); ng.connect(shaper); n.start(t, 0, dur);
    A.setThreat(0);
  };

  /* ---------- Interfaz: clic de linterna y recoger objetos ---------- */
  A.click = function () {
    if (!A.ready) return;
    var ctx = A.ctx, t = now();
    var n = noiseSource(false), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    var g = output(null, 0.1);
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(hp); hp.connect(g); n.start(t, Math.random(), 0.05);
  };
  A.pickup = function (isNote) {
    if (!A.ready) return;
    var ctx = A.ctx, t = now();
    (isNote ? [392, 523.3, 659.3] : [660, 990]).forEach(function (f, i) {
      var o = ctx.createOscillator(); o.type = isNote ? 'triangle' : 'square'; o.frequency.value = f;
      var g = output(null, 0.3);
      g.gain.setValueAtTime(0, t + i * 0.07); g.gain.linearRampToValueAtTime(isNote ? 0.12 : 0.05, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + (isNote ? 0.6 : 0.15));
      o.connect(g); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.7);
    });
  };
  // Cerrojo de la salida que se abre (golpe metálico grave + chirrido).
  A.unlock = function () {
    if (!A.ready) return;
    A.metalBang({ x: A.playerPos.x, y: 1.5, z: A.playerPos.z + 3 });
  };

  /* ---------- Victoria ---------- */
  A.win = function () {
    if (!A.ready) return;
    var ctx = A.ctx, t = now();
    if (humGain) humGain.gain.setTargetAtTime(0, t, 1.0);
    A.setThreat(0);
    [261.6, 329.6, 392.0, 523.3].forEach(function (f, i) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      var g = output(null, 0.8);
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.12 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3);
      o.connect(g); o.start(t + i * 0.12); o.stop(t + 3.1);
    });
  };

  A.restoreHum = function () {
    if (humGain) humGain.gain.setTargetAtTime(A.theme === 'pools' ? 0.5 : A.theme === 'warehouse' ? 0.07 : 0.16, now(), 0.5);
  };

  window.BRAudio = A;
})();
