// All sounds are synthesized with the Web Audio API — no audio files needed.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Am - F - C - G, 8 eighth-notes per bar
const CHORDS = [
  { bass: 45, arp: [57, 60, 64, 69] },
  { bass: 41, arp: [57, 60, 65, 69] },
  { bass: 48, arp: [55, 60, 64, 67] },
  { bass: 43, arp: [55, 59, 62, 67] },
];
const LEAD = [
  76, null, 76, 74, 72, null, 69, null,
  72, null, 74, null, 76, null, null, null,
  77, null, 76, 74, 72, null, 69, null,
  72, null, 69, null, 67, null, null, null,
  72, null, 72, 71, 72, null, 76, null,
  79, null, 76, null, 72, null, null, null,
  74, null, 74, 72, 71, null, 67, null,
  71, null, 74, null, 79, null, 78, null,
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.7;
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.setVolumes(this.musicVolume, this.sfxVolume);

    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2200;
    this.musicFilter.connect(this.musicGain);

    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    setInterval(() => this._schedule(), 40);
  }

  setVolumes(music, sfx) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.value = music * 0.3;
    this.sfxGain.gain.value = sfx * 0.6;
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
  }

  stopMusic() { this.musicOn = false; }

  // ---------- Music sequencer ----------
  _schedule() {
    if (!this.musicOn || !this.ctx) return;
    const stepLen = 60 / 140 / 2;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this._playStep(this.step, this.nextTime, stepLen);
      this.nextTime += stepLen;
      this.step = (this.step + 1) % LEAD.length;
    }
  }

  _playStep(step, t, len) {
    const chord = CHORDS[Math.floor(step / 8) % 4];
    const beat = step % 8;
    const out = this.musicFilter;
    this._note(out, 'sawtooth', midi(chord.bass + (beat % 2 ? 12 : 0)), t, len * 0.9, 0.14);
    this._note(out, 'square', midi(chord.arp[(beat * 3) % 4] + 12), t, len * 0.4, 0.03);
    const m = LEAD[step];
    if (m) this._note(out, 'square', midi(m), t, len * 0.9, 0.07);
    if (beat === 0 || beat === 4 || beat === 5) this._kick(t);
    if (beat === 2 || beat === 6) this._snare(t);
    this._hat(t, beat % 2 ? 0.05 : 0.025);
  }

  _note(dest, type, freq, t, dur, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  _snare(t) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    s.connect(f).connect(g).connect(this.musicGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.2);
  }

  _hat(t, vol) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f).connect(g).connect(this.musicGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.06);
  }

  // ---------- Sound effects ----------
  _sweep(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, vol, freq = 1200, delay = 0, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (type === 'lowpass') f.frequency.exponentialRampToValueAtTime(100, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  shoot(id) {
    if (id === 'pistol') {
      this._noise(0.12, 0.5, 4000);
      this._sweep('square', 900, 200, 0.1, 0.18);
    } else if (id === 'rifle') {
      this._noise(0.08, 0.45, 3000);
      this._sweep('sawtooth', 600, 150, 0.07, 0.14);
    } else {
      this._noise(0.35, 0.9, 2200);
      this._sweep('sine', 140, 40, 0.25, 0.6);
    }
  }
  empty() { this._sweep('square', 1500, 1400, 0.03, 0.12); }
  reload() {
    this._noise(0.05, 0.3, 3000, 0, 'highpass');
    this._sweep('square', 400, 300, 0.05, 0.1, 0.25);
    this._noise(0.06, 0.35, 2500, 0.55, 'highpass');
  }
  switchWeapon() { this._noise(0.05, 0.25, 2500, 0, 'highpass'); this._sweep('square', 500, 700, 0.04, 0.08, 0.08); }
  hit(head) { this._sweep('square', head ? 1800 : 1200, head ? 1900 : 1250, 0.04, head ? 0.22 : 0.15); }
  kill() { this._sweep('triangle', midi(84), midi(84), 0.08, 0.25); this._sweep('triangle', midi(91), midi(91), 0.12, 0.25, 0.06); }
  enemyShoot(v = 1) { this._sweep('sawtooth', 1100, 250, 0.16, 0.12 * v); }
  explode(v = 1) {
    this._noise(0.6, 0.7 * v, 1800);
    this._sweep('sine', 90, 30, 0.5, 0.6 * v);
  }
  hurt() { this._sweep('sawtooth', 220, 80, 0.2, 0.3); this._noise(0.12, 0.3, 900); }
  melee() { this._noise(0.1, 0.5, 1500); this._sweep('square', 300, 100, 0.1, 0.2); }
  pickup() { [72, 76, 79].forEach((n, i) => this._sweep('triangle', midi(n), midi(n), 0.12, 0.25, i * 0.05)); }
  footstep() { this._noise(0.05, 0.08, 500); }
  jump() { this._noise(0.06, 0.12, 800); }
  land() { this._noise(0.1, 0.22, 500); }
  spawn(v = 1) { this._sweep('sine', 200, 1200, 0.3, 0.12 * v); }
  waveStart() {
    for (let i = 0; i < 3; i++) this._sweep('sawtooth', 440, 880, 0.25, 0.18, i * 0.3);
  }
  waveClear() {
    const notes = [69, 72, 76, 81];
    notes.forEach((n, i) => {
      this._sweep('square', midi(n), midi(n) * 1.005, i === notes.length - 1 ? 0.6 : 0.15, 0.2, i * 0.1);
      this._sweep('triangle', midi(n - 12), midi(n - 12), 0.2, 0.25, i * 0.1);
    });
  }
  gameOver() {
    [72, 69, 65, 60].forEach((n, i) => this._sweep('square', midi(n), midi(n) * 0.98, 0.35, 0.2, i * 0.25));
  }
  click() { this._sweep('square', 700, 900, 0.05, 0.12); }
}
