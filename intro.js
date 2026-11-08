// Welcome intro: plays on load — the stadium wallpaper are thrown up onto the stage,
// then LORD KNOWS slaps on letter by letter — each letter with a slam and a jolt.
(() => {
  const intro = document.querySelector('.intro');
  if (!intro) return;
  const stage = intro.querySelector('.intro-stage');
  const word = intro.querySelector('.intro-word');
  const models = [...intro.querySelectorAll('.intro-wall')];
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
      play(landAt, slamTimes) {
        if (!ctx) return;
        const t0 = ctx.currentTime + 0.02;
        whoosh(t0, landAt);
        boom(t0 + landAt, 110, 30, 1.1, 1.1); noise(t0 + landAt, 0.4, 'lowpass', 700, 0.5);
        slamTimes.forEach((s) => {
          const t = t0 + s;
          boom(t, 190, 45, 0.32, 1); noise(t, 0.09, 'highpass', 2000, 0.4); noise(t, 0.18, 'bandpass', 380, 0.35);
        });
      },
      fadeOut() { if (ctx) out.gain.setTargetAtTime(0, ctx.currentTime, 0.15); },
    };
  })();

  // ---- Build the letters ----
  const TEXT = 'LORD KNOWS';
  word.innerHTML = [...TEXT].map((ch, i) =>
    ch === ' ' ? '<span class="gap"></span>' : `<span style="--i:${i};--r:${i % 2 ? 9 : -9}">${ch}</span>`
  ).join('');

  // Matches the CSS: the wallpaper lands 70% into 1.25s; each letter starts at 1.55s + i × .13s
  // and hits the screen 60% into its .42s slap.
  const LAND_AT = 0.875;
  // Arch the letters like the chest print: each line bows up in the middle,
  // letters tilt outwards. Uses the individual translate/rotate properties so it
  // composes with the slap animation's transform.
  const tall = matchMedia('(max-aspect-ratio: 3 / 4)');
  function arch() {
    const lines = tall.matches ? TEXT.split(' ') : [TEXT];
    const spans = [...word.children];
    let k = 0;
    lines.forEach((line, li) => {
      const n = line.length;
      const lift = tall.matches ? 0.14 : 0.26;   // em
      const tilt = tall.matches ? 10 : 13;       // deg at the ends
      [...line].forEach((ch, i) => {
        const el = spans[k++];
        const x = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; // -1 … 1
        el.style.setProperty('--y', `${(-lift * (1 - x * x)).toFixed(3)}em`);
        el.style.setProperty('--a', `${(x * tilt).toFixed(2)}deg`);
      });
      if (li < lines.length - 1) k++; // skip the gap span between lines
    });
  }
  arch();
  tall.addEventListener?.('change', arch);

  const SLAM_TIMES = [...TEXT].map((ch, i) => (ch === ' ' ? null : 1.55 + i * 0.13 + 0.25)).filter((t) => t !== null).concat(2.9 + 0.25);

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
  const HOLD = reduceMotion ? 2200 : 5600; // welcome stays up this long, then the site slides in

  function play() {
    if (playing) return;
    playing = true;
    // Sound only plays if the browser allows it without a tap (e.g. a returning visitor)
    const ctx = Sound.unlock();
    if (ctx && ctx.state === 'running' && !reduceMotion) Sound.play(LAND_AT, SLAM_TIMES);
    intro.classList.add('is-playing');
    if (!reduceMotion) {
      timers.push(setTimeout(() => jolt(12, 220), LAND_AT * 1000));
      SLAM_TIMES.forEach((s) => timers.push(setTimeout(() => jolt(7, 150), s * 1000)));
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

  // Start as soon as the wallpaper is loaded (or after 2.5s on a slow connection)
  const pending = models.filter((m) => !m.complete);
  if (!pending.length) play();
  else {
    let left = pending.length;
    pending.forEach((m) => {
      const ok = () => { if (--left === 0) play(); };
      m.addEventListener('load', ok, { once: true });
      m.addEventListener('error', ok, { once: true });
    });
    setTimeout(play, 2500);
  }

  // Tap, click or any key skips straight to the site
  intro.addEventListener('click', enter);
  window.addEventListener('keydown', function onKey(e) {
    if (done) { window.removeEventListener('keydown', onKey); return; }
    if (['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    enter();
  });
})();
