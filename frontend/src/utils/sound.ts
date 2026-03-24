/**
 * Buzzer audio — plays a pre-combined 3-blast MP3 file.
 *
 * Safari quirk: reusing an Audio element after a volume-0 warm-up can
 * corrupt its internal state (duration drops to ~0). So we create a
 * fresh Audio element for each playBuzzer() call. The elements are
 * lightweight and get garbage-collected after playback ends.
 */

// Global suppression: when set to a future timestamp, playBuzzer() is a no-op.
let _buzzerSuppressedUntil = 0;

export function suppressBuzzerFor(ms: number) {
  _buzzerSuppressedUntil = Date.now() + ms;
  console.log('[Buzzer] Suppressed for', ms, 'ms until', new Date(_buzzerSuppressedUntil).toLocaleTimeString());
}

const BUZZER_SRC = './buzzer.mp3';

/**
 * Warm up audio — called from user gesture handlers (e.g. "Start Session").
 * Creates and plays a throwaway Audio element at volume 0 to unlock
 * Safari's audio policy. This element is NOT reused for real playback.
 */
let _warmedUp = false;
export function warmUpAudio() {
  if (_warmedUp) return;
  _warmedUp = true;
  console.log('[Buzzer] warmUpAudio — unlocking audio via user gesture');
  try {
    const warmup = new Audio(BUZZER_SRC);
    warmup.volume = 0;
    const p = warmup.play();
    if (p) {
      p.then(() => {
        warmup.pause();
        console.log('[Buzzer] warmUpAudio — audio unlocked');
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

// Auto-warm on first user interaction (but NOT on buzzer button clicks).
if (typeof window !== 'undefined') {
  const autoWarm = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('.buzzer-btn')) {
      console.log('[Buzzer] autoWarm — skipped (buzzer button click)');
      return;
    }
    console.log('[Buzzer] autoWarm — triggered by', e.type);
    warmUpAudio();
    window.removeEventListener('click', autoWarm);
    window.removeEventListener('touchstart', autoWarm);
    window.removeEventListener('keydown', autoWarm);
  };
  window.addEventListener('click', autoWarm);
  window.addEventListener('touchstart', autoWarm);
  window.addEventListener('keydown', autoWarm);
}

export function playBuzzer(force = false) {
  console.log('[Buzzer] playBuzzer called — force:', force, 'suppressed:', Date.now() < _buzzerSuppressedUntil);
  try {
    if (!force && Date.now() < _buzzerSuppressedUntil) {
      console.log('[Buzzer] playBuzzer — suppressed, skipping');
      return;
    }
    // Create a fresh Audio element each time to avoid Safari's
    // corrupted-duration bug when reusing elements.
    const audio = new Audio(BUZZER_SRC);
    audio.volume = 1.0;
    console.log('[Buzzer] playBuzzer — playing fresh Audio element');
    audio.play().then(() => {
      console.log('[Buzzer] playBuzzer — play() resolved, duration:', audio.duration);
    }).catch((err) => {
      console.error('[Buzzer] playBuzzer — play() rejected:', err.message);
    });
  } catch (err) {
    console.error('[Buzzer] playBuzzer — exception:', err);
  }
}
