/**
 * Curio — voice.
 *
 * Two separate things, deliberately kept apart because their privacy stories
 * are not the same:
 *
 *   RECORDING    MediaRecorder captures audio and it stays on the device, like
 *                everything else here. Fully offline. Always safe.
 *
 *   DICTATION    The browser's SpeechRecognition turns speech into text. On
 *                most browsers — Chrome especially — this is NOT done on the
 *                device: the audio goes to the browser maker's servers.
 *                So it is off by default, asked for explicitly, and labelled
 *                honestly. Curio will not quietly break its own promise to
 *                save you some typing.
 *
 * Apple's on-device dictation (the microphone key on the iOS keyboard) is the
 * private way to get text in, and costs Curio nothing to support — it simply
 * types into the field like a keyboard.
 */

export const MAX_SECONDS = 180;          // three minutes keeps the archive small

export const canRecord = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined';

export const canDictate = () =>
  typeof window !== 'undefined' &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/** Whichever container this browser will actually give us. */
export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const t of options) {
    try { if (MediaRecorder.isTypeSupported?.(t)) return t; } catch { /* older browsers */ }
  }
  return '';
}

/**
 * A single recording session.
 *
 *   const r = new Recorder();
 *   await r.start(onTick);       // asks for the microphone
 *   const { dataUrl, seconds } = await r.stop();
 */
export class Recorder {
  /**
   * @param bitrate bits per second for the audio track. Lower keeps the archive
   *        small; see AUDIO_QUALITY in storage.js for the tiers Curio offers.
   */
  constructor({ maxSeconds = MAX_SECONDS, bitrate = 24000 } = {}) {
    this.maxSeconds = maxSeconds;
    this.bitrate = bitrate;
    this.chunks = [];
    this.stream = null;
    this.recorder = null;
    this.startedAt = 0;
    this.timer = null;
    this.mimeType = '';
  }

  get seconds() {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  get recording() {
    return !!this.recorder && this.recorder.state === 'recording';
  }

  /** @param onTick called about every 200ms with the elapsed seconds */
  async start(onTick) {
    if (!canRecord()) throw new Error('NO_RECORDER');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.mimeType = pickMimeType();
    const opts = { audioBitsPerSecond: this.bitrate };
    if (this.mimeType) opts.mimeType = this.mimeType;
    try {
      this.recorder = new MediaRecorder(this.stream, opts);
    } catch {
      // some browsers refuse the bitrate hint; the recording matters more
      this.recorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    }
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
    this.startedAt = Date.now();

    if (onTick) {
      this.timer = setInterval(() => {
        onTick(this.seconds);
        if (this.seconds >= this.maxSeconds) this.stop();
      }, 200);
    }
    return true;
  }

  /** Stops, releases the microphone, and returns the audio as a data URL. */
  stop() {
    return new Promise((resolve) => {
      const finish = async () => {
        clearInterval(this.timer);
        this.timer = null;
        const seconds = Math.round(this.seconds * 10) / 10;
        this.startedAt = 0;
        this.release();
        if (!this.chunks.length) return resolve(null);
        const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
        const dataUrl = await blobToDataUrl(blob);
        resolve({ dataUrl, seconds, bytes: blob.size, mimeType: blob.type });
      };

      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.onstop = finish;
        try { this.recorder.stop(); } catch { finish(); }
      } else {
        finish();
      }
    });
  }

  /** Abandon the recording and let go of the microphone. */
  cancel() {
    clearInterval(this.timer);
    this.timer = null;
    this.chunks = [];
    this.startedAt = 0;
    try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch { /* already stopped */ }
    this.release();
  }

  release() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.recorder = null;
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

/** mm:ss for the recording timer. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A rough size estimate, so people can see what an archive of voice costs. */
export function estimateBytes(seconds, bitrate = 24000) {
  return Math.round(((seconds || 0) * bitrate) / 8);
}

/* ------------------------------------------------------------------ *
 * dictation — explicitly opted into, never assumed
 * ------------------------------------------------------------------ */

/**
 * Live speech-to-text using the browser's own recogniser.
 *
 * IMPORTANT: on most browsers this is a network service. The caller must have
 * told the person so and got their agreement first. `onResult` receives
 * (finalText, interimText).
 */
export class Dictation {
  constructor({ locale = 'en-GB' } = {}) {
    this.locale = locale;
    this.rec = null;
    this.finalText = '';
  }

  static available() { return canDictate(); }

  start(onResult, onError) {
    if (!canDictate()) { onError?.(new Error('NO_DICTATION')); return false; }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Ctor();
    rec.lang = this.locale;
    rec.continuous = true;
    rec.interimResults = true;
    this.finalText = '';

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0]?.transcript || '';
        if (e.results[i].isFinal) this.finalText += chunk;
        else interim += chunk;
      }
      onResult?.(this.finalText.trim(), interim.trim());
    };
    rec.onerror = (e) => onError?.(e);
    rec.onend = () => { this.rec = null; };

    try { rec.start(); } catch (e) { onError?.(e); return false; }
    this.rec = rec;
    return true;
  }

  stop() {
    try { this.rec?.stop(); } catch { /* already ended */ }
    this.rec = null;
    return this.finalText.trim();
  }
}
