/**
 * Tests for buzzer sound behavior:
 * - Buzzer plays when buzzer button is clicked (force=true bypasses suppression)
 * - Buzzer plays when timer expires (force=false, no suppression)
 * - Buzzer does NOT play during suppression window unless forced
 * - warmUpAudio unlocks audio
 * - Each play creates a fresh Audio element (Safari workaround)
 * - Graceful failure handling
 */

const mockPlay = jest.fn().mockResolvedValue(undefined);
const mockPause = jest.fn();

(global as any).Audio = jest.fn(() => ({
  play: mockPlay,
  pause: mockPause,
  preload: '',
  volume: 1.0,
  currentTime: 0,
  duration: 5.3,
  readyState: 4,
  src: '',
}));

let playBuzzer: (force?: boolean) => void;
let suppressBuzzerFor: (ms: number) => void;
let warmUpAudio: () => void;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  mockPlay.mockClear().mockResolvedValue(undefined);
  mockPause.mockClear();
  (global.Audio as jest.Mock).mockClear();

  const sound = require('../sound');
  playBuzzer = sound.playBuzzer;
  suppressBuzzerFor = sound.suppressBuzzerFor;
  warmUpAudio = sound.warmUpAudio;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Buzzer Sound', () => {
  describe('Manual buzzer button (force=true)', () => {
    it('plays when buzzer button is clicked', () => {
      playBuzzer(true);
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it('plays even during suppression window when force=true', () => {
      suppressBuzzerFor(10000);
      playBuzzer(true);
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timer-triggered buzzer (force=false / default)', () => {
    it('plays when called without force (simulates timer expiry)', () => {
      playBuzzer();
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it('plays when called with force=false explicitly', () => {
      playBuzzer(false);
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it('does NOT play during suppression window', () => {
      suppressBuzzerFor(10000);
      playBuzzer();
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('does NOT play with force=false during suppression window', () => {
      suppressBuzzerFor(10000);
      playBuzzer(false);
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('plays after suppression window expires', () => {
      suppressBuzzerFor(5000);
      playBuzzer();
      expect(mockPlay).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5001);
      playBuzzer();
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });
  });

  describe('suppressBuzzerFor', () => {
    it('suppresses buzzer for the specified duration', () => {
      suppressBuzzerFor(3000);

      playBuzzer();
      expect(mockPlay).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2999);
      playBuzzer();
      expect(mockPlay).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2);
      playBuzzer();
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it('can be called multiple times — last call wins', () => {
      suppressBuzzerFor(2000);
      suppressBuzzerFor(5000);

      jest.advanceTimersByTime(3000);
      playBuzzer();
      expect(mockPlay).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2001);
      playBuzzer();
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });
  });

  describe('warmUpAudio', () => {
    it('creates a throwaway Audio element for unlocking', () => {
      const callsBefore = (global.Audio as jest.Mock).mock.calls.length;
      warmUpAudio();
      expect((global.Audio as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('only warms up once', () => {
      warmUpAudio();
      const callsAfterFirst = mockPlay.mock.calls.length;
      warmUpAudio();
      warmUpAudio();
      expect(mockPlay.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  describe('Fresh Audio per play (Safari workaround)', () => {
    it('creates a new Audio element for each playBuzzer call', () => {
      const callsBefore = (global.Audio as jest.Mock).mock.calls.length;
      playBuzzer();
      playBuzzer();
      playBuzzer();
      const newCalls = (global.Audio as jest.Mock).mock.calls.length - callsBefore;
      expect(newCalls).toBe(3);
      expect(mockPlay).toHaveBeenCalledTimes(3);
    });

    it('creates Audio with buzzer.mp3 path', () => {
      playBuzzer();
      const lastCall = (global.Audio as jest.Mock).mock.calls.slice(-1)[0];
      expect(lastCall[0]).toBe('./buzzer.mp3');
    });
  });

  describe('play failure handling', () => {
    it('does not throw when audio.play() rejects', () => {
      mockPlay.mockRejectedValueOnce(new Error('NotAllowedError'));
      expect(() => playBuzzer()).not.toThrow();
    });

    it('does not throw when Audio constructor fails', () => {
      (global as any).Audio = jest.fn(() => { throw new Error('not supported'); });
      jest.resetModules();
      const sound = require('../sound');
      expect(() => sound.playBuzzer()).not.toThrow();
    });
  });
});
