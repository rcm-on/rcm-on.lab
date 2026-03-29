/**
 * audio-engine.js
 * Self-contained Web Audio piano sample engine.
 * Standalone module for future use independent of piano_pro_studio.html.
 *
 * Usage:
 *   import { AudioEngine } from './audio-engine.js';
 *   const engine = new AudioEngine();
 *   await engine.init({ samplesPath: '../assets/samples/grand-concert' });
 *   engine.onNoteOn  = (midi) => console.log('on',  midi);
 *   engine.onNoteOff = (midi) => console.log('off', midi);
 *   engine.playMidi(60);  // C4
 *   engine.stopMidi(60);
 */

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToName(midi) {
    return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq) {
    return Math.round(Math.log2(freq / 440) * 12 + 69);
}

export class AudioEngine {
    constructor() {
        this._ctx          = null;
        this._masterGain   = null;
        this._compressor   = null;
        this._buffers      = new Map();   // midi → AudioBuffer
        this._active       = {};          // midi → { src, env }
        this._ready        = false;

        /** @type {((midi: number) => void) | null} */
        this.onNoteOn  = null;
        /** @type {((midi: number) => void) | null} */
        this.onNoteOff = null;
    }

    /**
     * @param {Object}  opts
     * @param {string}  opts.samplesPath  Base URL path to .mp3 samples
     * @param {number} [opts.volume=0.82] Master volume 0–1
     */
    async init({ samplesPath = '', volume = 0.82 } = {}) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();

        this._masterGain = this._ctx.createGain();
        this._masterGain.gain.value = volume;

        const dry = this._ctx.createGain();
        dry.gain.value = 0.92;

        const rev     = this._ctx.createGain();
        rev.gain.value = 0.18;
        const conv    = this._ctx.createConvolver();
        conv.buffer   = this._impulse(1.35, 2.4);

        this._compressor = this._ctx.createDynamicsCompressor();
        this._compressor.threshold.value = -18;
        this._compressor.knee.value      = 18;
        this._compressor.ratio.value     = 2.2;
        this._compressor.attack.value    = 0.002;
        this._compressor.release.value   = 0.2;

        this._masterGain.connect(dry);
        this._masterGain.connect(rev);
        rev.connect(conv);
        dry.connect(this._compressor);
        conv.connect(this._compressor);
        this._compressor.connect(this._ctx.destination);

        if (samplesPath) await this._loadSamples(samplesPath);
    }

    _impulse(duration, decay) {
        const sr  = this._ctx.sampleRate;
        const len = Math.floor(sr * duration);
        const buf = this._ctx.createBuffer(2, len, sr);
        for (let c = 0; c < 2; c++) {
            const ch = buf.getChannelData(c);
            for (let i = 0; i < len; i++) {
                ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            }
        }
        return buf;
    }

    async _loadSamples(basePath) {
        // Load every 3rd MIDI note as an anchor (pitch-shift between)
        const anchors = [];
        for (let m = 21; m <= 108; m += 3) anchors.push(m);

        await Promise.allSettled(anchors.map(async midi => {
            try {
                const res = await fetch(`${basePath}/${midiToName(midi)}.mp3`);
                if (!res.ok) return;
                const ab  = await res.arrayBuffer();
                const buf = await this._ctx.decodeAudioData(ab);
                this._buffers.set(midi, buf);
            } catch { /* skip missing */ }
        }));

        this._ready = this._buffers.size > 0;
    }

    _nearestAnchor(midi) {
        let best = null, bestDist = Infinity;
        for (const [k] of this._buffers) {
            const d = Math.abs(k - midi);
            if (d < bestDist) { bestDist = d; best = k; }
        }
        return best;
    }

    playMidi(midi) {
        if (!this._ready || this._active[midi]) return;
        const anchor = this._nearestAnchor(midi);
        if (anchor === null) return;

        const src = this._ctx.createBufferSource();
        src.buffer            = this._buffers.get(anchor);
        src.playbackRate.value = Math.pow(2, (midi - anchor) / 12);

        const env     = this._ctx.createGain();
        const active  = Object.keys(this._active).length;
        const peak    = Math.min(1.4, 1.4 / Math.max(1, active * 0.5 + 0.5));
        const now     = this._ctx.currentTime;
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(peak, now + 0.008);

        src.connect(env);
        env.connect(this._masterGain);
        src.start();

        this._active[midi] = { src, env };
        this.onNoteOn?.(midi);
    }

    stopMidi(midi) {
        const node = this._active[midi];
        if (!node) return;
        const { src, env } = node;
        const t = this._ctx.currentTime;
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(env.gain.value, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        src.stop(t + 0.36);
        delete this._active[midi];
        this.onNoteOff?.(midi);
    }

    stopAll() {
        for (const m of Object.keys(this._active)) this.stopMidi(Number(m));
    }

    setVolume(v) {
        this._masterGain?.gain.setTargetAtTime(v, this._ctx.currentTime, 0.01);
    }

    get ready()       { return this._ready; }
    get ctx()         { return this._ctx; }
    get activeCount() { return Object.keys(this._active).length; }
}
