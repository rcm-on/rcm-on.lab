/**
 * score-player.js
 * Sequencer that drives audio playback from parsed note events.
 * Pure scheduling logic — no canvas or DOM knowledge.
 *
 * Usage:
 *   const player = new ScorePlayer({ playMidi, stopMidi });
 *   player.load(events);  // [{time, midi, duration}]
 *   player.play();
 *   player.stop();
 *   player.playing  // boolean
 *   player.activeNotes  // Set<midi> of currently sounding notes
 */

export class ScorePlayer {
    /**
     * @param {Object} opts
     * @param {function(midi:number):void} opts.playMidi
     * @param {function(midi:number):void} opts.stopMidi
     */
    constructor({ playMidi, stopMidi }) {
        this._play    = playMidi;
        this._stop    = stopMidi;
        this._events  = [];
        this._timers  = [];
        this._active  = new Set();
        this._playing = false;
    }

    /** Load a score. Replaces any previously loaded events. */
    load(events) {
        this.stop();
        this._events = [...events].sort((a, b) => a.time - b.time);
    }

    play() {
        if (this._playing || !this._events.length) return;
        this._playing = true;
        this._active.clear();

        const totalMs = this._events.reduce((m, e) => Math.max(m, e.time + e.duration), 0);

        for (const e of this._events) {
            // Note ON
            this._timers.push(setTimeout(() => {
                if (!this._playing) return;
                this._play(e.midi);
                this._active.add(e.midi);
            }, e.time));

            // Note OFF (leave 8% of note duration for natural release overlap)
            const offDelay = e.time + Math.max(60, e.duration * 0.92);
            this._timers.push(setTimeout(() => {
                if (!this._playing) return;
                this._stop(e.midi);
                this._active.delete(e.midi);
            }, offDelay));
        }

        // Mark finished after last note
        this._timers.push(setTimeout(() => {
            this._playing = false;
            this._active.clear();
        }, totalMs + 500));
    }

    stop() {
        if (!this._playing) return;
        this._playing = false;
        this._timers.forEach(clearTimeout);
        this._timers = [];
        this._active.forEach(midi => this._stop(midi));
        this._active.clear();
    }

    get playing()     { return this._playing; }
    get activeNotes() { return new Set(this._active); }
    get totalMs() {
        if (!this._events.length) return 0;
        return this._events.reduce((m, e) => Math.max(m, e.time + e.duration), 0);
    }
    get noteCount()   { return this._events.length; }
}
