/** Play an NBA-style basketball shot clock buzzer — loud, flat, ~2 seconds */

// Global suppression: when set to a future timestamp, playBuzzer() is a no-op.
let _buzzerSuppressedUntil = 0;

export function suppressBuzzerFor(ms: number) {
  _buzzerSuppressedUntil = Date.now() + ms;
}

export function playBuzzer() {
  try {
    if (Date.now() < _buzzerSuppressedUntil) return;

    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const duration = 2.0;

    // Master output with sharp attack and abrupt cutoff
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.8, now + 0.02);   // near-instant attack
    master.gain.setValueAtTime(0.8, now + duration - 0.05);  // hold until the end
    master.gain.linearRampToValueAtTime(0, now + duration);   // hard stop
    master.connect(ctx.destination);

    // Compressor — keeps it loud and flat like a PA horn
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 12;
    comp.attack.value = 0.001;
    comp.release.value = 0.05;
    comp.connect(master);

    // Band-pass filter — basketball buzzers sit in a narrow mid-range band
    // centered around 300-400 Hz with no highs and limited lows
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 370;
    bpf.Q.value = 2.0;
    bpf.connect(comp);

    // Primary tone — sawtooth at ~260 Hz (the core "EHHHHH" frequency)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 260;
    const g1 = ctx.createGain();
    g1.gain.value = 0.55;
    osc1.connect(g1);
    g1.connect(bpf);

    // Second voice — slightly detuned for that thick, beating quality
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 263; // 3 Hz beat against osc1
    const g2 = ctx.createGain();
    g2.gain.value = 0.55;
    osc2.connect(g2);
    g2.connect(bpf);

    // Square wave one octave down for weight
    const osc3 = ctx.createOscillator();
    osc3.type = 'square';
    osc3.frequency.value = 130;
    const g3 = ctx.createGain();
    g3.gain.value = 0.3;
    osc3.connect(g3);
    g3.connect(bpf);

    // Start and stop all oscillators
    [osc1, osc2, osc3].forEach(o => {
      o.start(now);
      o.stop(now + duration);
    });

    // Clean up
    setTimeout(() => ctx.close().catch(() => {}), (duration + 0.5) * 1000);
  } catch {
    // Silently fail if audio isn't available
  }
}
