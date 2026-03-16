/** Play a realistic train horn (Nathan K5LA style) — 5 seconds */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function makeDistortionCurve(amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export function playBuzzer() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 5;

    // Compressor for loudness
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 3;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.05;
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(compressor);

    // Waveshaper for brass-like harmonic richness
    const distortion = ctx.createWaveShaper();
    distortion.curve = makeDistortionCurve(8) as any;
    distortion.oversample = '4x';
    distortion.connect(master);

    // Low-pass filter to tame harsh highs — train horns are bassy
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1200;
    lpf.Q.value = 0.7;
    lpf.connect(distortion);

    // Nathan K5LA frequencies: 5 chime horns
    // Real pitches roughly: Db3, F3, Ab3, Db4, F4
    const horns = [
      { freq: 139, gain: 0.6, delay: 0 },       // Db3 — lowest, starts first
      { freq: 175, gain: 0.5, delay: 0.08 },     // F3
      { freq: 208, gain: 0.45, delay: 0.15 },    // Ab3
      { freq: 277, gain: 0.4, delay: 0.25 },     // Db4
      { freq: 349, gain: 0.35, delay: 0.35 },    // F4 — highest, last to join
    ];

    horns.forEach(({ freq, gain: vol, delay }) => {
      // Main tone — sawtooth for brass character
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      // Slight pitch bend up on attack (air pressure building)
      osc.frequency.setValueAtTime(freq * 0.94, now + delay);
      osc.frequency.linearRampToValueAtTime(freq, now + delay + 0.4);

      // Sub-harmonic for body
      const sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.value = freq * 0.5;

      // Vibrato — slow wobble from air turbulence
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vib.frequency.value = 4 + Math.random() * 2;
      vibGain.gain.value = freq * 0.012;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      vibGain.connect(sub.frequency);

      // Per-horn gain envelope
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + delay);
      // Slow build-up like air pressure filling the horn
      gain.gain.linearRampToValueAtTime(vol * 0.3, now + delay + 0.15);
      gain.gain.linearRampToValueAtTime(vol, now + delay + 0.6);
      // Sustain
      gain.gain.setValueAtTime(vol, now + duration - 0.8);
      // Fade out — air releasing
      gain.gain.linearRampToValueAtTime(vol * 0.4, now + duration - 0.2);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      const subGain = ctx.createGain();
      subGain.gain.value = 0.3;

      osc.connect(gain);
      sub.connect(subGain);
      subGain.connect(gain);
      gain.connect(lpf);

      osc.start(now + delay);
      osc.stop(now + duration);
      sub.start(now + delay);
      sub.stop(now + duration);
      vib.start(now + delay);
      vib.stop(now + duration);
    });
  } catch {
    // Silently fail if audio isn't available
  }
}
