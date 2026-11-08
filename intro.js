// Welcome intro: the fallen angel tumbles out of the sky and crashes, the angel
// dives down and lands on him, then LORDKNOWS slaps on letter by letter —
// each letter with a slam and a jolt. Plays on load; tap or any key skips.
(() => {
  const intro = document.querySelector('.intro');
  if (!intro) return;
  const stage = intro.querySelector('.intro-stage');
  const models = [...intro.querySelectorAll('.ia')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Sound: synthesised with Web Audio, no files. Needs the first tap. ----
  const Sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx, out, noiseBuf;
    function init() {
      if (!AC) return null;
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      out = ctx.createGain(); out.gain.value = 0.9;
      out.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return ctx;
    }
    function env(t, a, peak, dec) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
      return g;
    }
    function noise(t, dur, type, freq, peak) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      s.connect(f).connect(env(t, 0.003, peak, dur)).connect(out);
      s.start(t); s.stop(t + dur + 0.05);
    }
    function boom(t, from, to, dur, peak) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
      o.connect(env(t, 0.004, peak, dur)).connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function whoosh(t, dur) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(220, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
      s.connect(f).connect(g).connect(out);
      s.start(t); s.stop(t + dur + 0.2);
    }
    return {
      unlock: init,
      play(falls, slamTimes, chimeAt) {
        if (!ctx) return;
        const t0 = ctx.currentTime + 0.02;
        falls.forEach(([from, land]) => {
          whoosh(t0 + from, land - from);
          boom(t0 + land, 110, 30, 1.1, 1.1); noise(t0 + land, 0.4, 'lowpass', 700, 0.5);
        });
        [0, 0.09, 0.18].forEach((d, i) => {          // little shimmer as the stars appear
          const o = ctx.createOscillator(); o.type = 'sine';
          o.frequency.value = [1568, 2093, 2637][i];
          o.connect(env(t0 + chimeAt + d, 0.01, 0.12, 0.9)).connect(out);
          o.start(t0 + chimeAt + d); o.stop(t0 + chimeAt + d + 1);
        });
        slamTimes.forEach((s) => {
          const t = t0 + s;
          boom(t, 190, 45, 0.32, 1); noise(t, 0.09, 'highpass', 2000, 0.4); noise(t, 0.18, 'bandpass', 380, 0.35);
        });
      },
      fadeOut() { if (ctx) out.gain.setTargetAtTime(0, ctx.currentTime, 0.15); },
    };
  })();

  // ---- Timings: these match intro.css ----
  // fallen angel: starts .15s, lands 80% into 1.15s; angel: starts .6s, lands 82% into 1.45s
  const FALLS = [[0.15, 0.15 + 1.15 * 0.8], [0.6, 0.6 + 1.45 * 0.82]];
  // letter i starts at 2s + i × .12s and hits 60% into its .42s slap
  const SLAM_TIMES = Array.from({ length: 9 }, (_, i) => 2 + i * 0.12 + 0.25);
  const CHIME_AT = 3.5;

  function jolt(px, duration) {
    if (reduceMotion) return;
    stage.animate([
      { transform: 'translate(0,0)' },
      { transform: `translate(${-px}px,${px * 0.7}px)` },
      { transform: `translate(${px * 0.7}px,${-px * 0.6}px)` },
      { transform: 'translate(0,0)' },
    ], { duration });
  }

  let playing = false, done = false;
  const timers = [];
  const HOLD = reduceMotion ? 2600 : 6900; // the finished artwork holds, then the site slides in

  function play() {
    if (playing) return;
    playing = true;
    // Sound only plays if the browser allows it without a tap (e.g. a returning visitor)
    const ctx = Sound.unlock();
    if (ctx && ctx.state === 'running' && !reduceMotion) Sound.play(FALLS, SLAM_TIMES, CHIME_AT);
    intro.classList.add('is-playing');
    if (!reduceMotion) {
      FALLS.forEach(([, land], k) => timers.push(setTimeout(() => jolt(k ? 10 : 14, 240), land * 1000)));
      SLAM_TIMES.forEach((s) => timers.push(setTimeout(() => jolt(5, 140), s * 1000)));
    }
    timers.push(setTimeout(enter, HOLD));
  }

  function enter() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    Sound.fadeOut();
    intro.classList.add('is-leaving');
    document.documentElement.classList.remove('intro-open');
    // Replay the runway's own reveal now that it's actually being seen
    const rw = document.querySelector('runway-section');
    if (rw && !reduceMotion) {
      rw.classList.remove('is-revealed');
      void rw.offsetWidth;
      setTimeout(() => rw.classList.add('is-revealed'), 250);
    }
    const remove = () => intro.remove();
    intro.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 1400);
  }

  // Start once every layer is loaded (or after 3s on a slow connection)
  const pending = models.filter((m) => !m.complete);
  if (!pending.length) play();
  else {
    let left = pending.length;
    pending.forEach((m) => {
      const ok = () => { if (--left === 0) play(); };
      m.addEventListener('load', ok, { once: true });
      m.addEventListener('error', ok, { once: true });
    });
    setTimeout(play, 3000);
  }

  // Tap, click or any key skips straight to the site
  intro.addEventListener('click', enter);
  window.addEventListener('keydown', function onKey(e) {
    if (done) { window.removeEventListener('keydown', onKey); return; }
    if (['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    enter();
  });
})();
