/**
 * staff-canvas.js
 * Grand staff (treble + bass) passive canvas renderer.
 * Designed as a pure-display module: call draw() from an external rAF loop.
 *
 * Usage:
 *   const staff = new StaffCanvas(canvasElement);
 *   staff.setActiveNotes(new Set([60, 64, 67]));
 *   staff.loadScore(events);       // [{time, midi, duration}]
 *   staff.setPlayTime(elapsedMs);  // from score start
 *   staff.draw();                  // call each rAF frame
 */

// MIDI pitch-class → { diatonic step within octave (C=0..B=6), accidental 0|1|-1 }
const PC_MAP = [
    { s: 0, a:  0 }, // C
    { s: 0, a:  1 }, // C#
    { s: 1, a:  0 }, // D
    { s: 1, a:  1 }, // D# (Eb)
    { s: 2, a:  0 }, // E
    { s: 3, a:  0 }, // F
    { s: 3, a:  1 }, // F#
    { s: 4, a:  0 }, // G
    { s: 4, a:  1 }, // G# (Ab)
    { s: 5, a:  0 }, // A
    { s: 5, a:  1 }, // A# (Bb)
    { s: 6, a:  0 }, // B
];

function midiToAbs(midi) {
    const oct = Math.floor(midi / 12) - 1; // MIDI 60 = C4 → oct 4
    const { s, a } = PC_MAP[midi % 12];
    return { abs: oct * 7 + s, acc: a };
}

// Reference: bottom line of treble clef = E4 (MIDI 64)
const TREBLE_REF = midiToAbs(64).abs;  // 4*7+2 = 30
// Reference: bottom line of bass clef  = G2 (MIDI 43)
const BASS_REF   = midiToAbs(43).abs;  // 2*7+4 = 18

export class StaffCanvas {
    constructor(canvas) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this._w      = 0;
        this._h      = 0;
        this._ls     = 11;   // line spacing (px)
        this._noteR  = 5;    // note head radius
        this.treble  = { y0: 0 };
        this.bass    = { y0: 0 };

        this.activeNotes  = new Set();
        this._score       = [];
        this._playTimeMs  = 0;

        this._init();
        new ResizeObserver(() => this._init()).observe(canvas);
    }

    // ─── Layout ──────────────────────────────────────────────────────────────

    _init() {
        const dpr = window.devicePixelRatio || 1;
        const w   = this.canvas.offsetWidth  || 800;
        const h   = this.canvas.offsetHeight || 200;
        if (w === this._w && h === this._h) return;

        this.canvas.width  = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);

        this._w = w;
        this._h = h;
        this._ls    = Math.max(8, Math.min(13, h / 18));
        this._noteR = this._ls * 0.44;

        // Bottom lines: treble at 38% height, bass at 78% height
        this.treble.y0 = h * 0.38;
        this.bass.y0   = h * 0.79;
    }

    // Slot 0 = bottom staff line. Each full step = ls/2 px upward.
    _slotY(clef, slot) {
        return this[clef].y0 - slot * (this._ls / 2);
    }

    _midiToSlot(midi) {
        const { abs, acc } = midiToAbs(midi);
        if (midi >= 60) {
            return { clef: 'treble', slot: abs - TREBLE_REF, acc };
        } else {
            return { clef: 'bass',   slot: abs - BASS_REF,   acc };
        }
    }

    // ─── Drawing primitives ───────────────────────────────────────────────────

    _drawStaffLines(clef) {
        const ctx = this.ctx;
        const ls  = this._ls;
        ctx.strokeStyle = 'rgba(148,163,184,0.28)';
        ctx.lineWidth   = 0.8;
        for (let i = 0; i < 5; i++) {
            const y = this[clef].y0 - i * ls;
            ctx.beginPath();
            ctx.moveTo(38, y);
            ctx.lineTo(this._w - 12, y);
            ctx.stroke();
        }
    }

    _drawClef(clef) {
        const ctx = this.ctx;
        const ls  = this._ls;
        ctx.fillStyle    = 'rgba(148,163,184,0.6)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        if (clef === 'treble') {
            ctx.font = `${ls * 5.6}px serif`;
            ctx.fillText('𝄞', 7, this.treble.y0 - ls * 1.6);
        } else {
            ctx.font = `${ls * 3.4}px serif`;
            ctx.fillText('𝄢', 9, this.bass.y0 - ls * 1.4);
        }
    }

    _drawBrace() {
        const ctx  = this.ctx;
        const topY = this.treble.y0 - 4 * this._ls - 6;
        const botY = this.bass.y0   + 6;
        ctx.strokeStyle = 'rgba(148,163,184,0.22)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(36, topY);
        ctx.lineTo(36, botY);
        ctx.stroke();
        // small serifs
        ctx.fillStyle = 'rgba(148,163,184,0.22)';
        [[topY,  1], [botY, -1]].forEach(([y, d]) => {
            ctx.beginPath();
            ctx.moveTo(36, y);
            ctx.lineTo(31, y + d * 7);
            ctx.lineTo(34, y + d * 2);
            ctx.closePath();
            ctx.fill();
        });
    }

    _drawLedgerLines(clef, slot, x, active) {
        const ctx = this.ctx;
        const r   = this._noteR;
        ctx.strokeStyle = active ? 'rgba(52,211,153,0.45)' : 'rgba(148,163,184,0.28)';
        ctx.lineWidth   = 0.9;

        if (slot <= -2) {
            // Ledger lines below: even slots down to the note
            const bottom = slot % 2 === 0 ? slot : slot + 1;
            for (let s = -2; s >= bottom; s -= 2) {
                const ly = this._slotY(clef, s);
                ctx.beginPath();
                ctx.moveTo(x - r * 1.8, ly);
                ctx.lineTo(x + r * 1.8, ly);
                ctx.stroke();
            }
        }

        if (slot >= 10) {
            // Ledger lines above: even slots up to the note
            const top = slot % 2 === 0 ? slot : slot - 1;
            for (let s = 10; s <= top; s += 2) {
                const ly = this._slotY(clef, s);
                ctx.beginPath();
                ctx.moveTo(x - r * 1.8, ly);
                ctx.lineTo(x + r * 1.8, ly);
                ctx.stroke();
            }
        }
    }

    _drawNote(midi, x, active) {
        const { clef, slot, acc } = this._midiToSlot(midi);
        const y   = this._slotY(clef, slot);
        const ctx = this.ctx;
        const r   = this._noteR;
        const ls  = this._ls;

        this._drawLedgerLines(clef, slot, x, active);

        const color = active ? '#34d399' : 'rgba(148,163,184,0.42)';

        // Note head
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.15, r * 0.82, -0.18, 0, Math.PI * 2);
        if (active) { ctx.shadowColor = '#34d399'; ctx.shadowBlur = 10; }
        ctx.fillStyle = color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Accidental (#)
        if (acc === 1) {
            ctx.fillStyle    = active ? 'rgba(52,211,153,0.85)' : 'rgba(148,163,184,0.5)';
            ctx.font         = `${r * 2.2}px serif`;
            ctx.textAlign    = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText('♯', x - r * 1.5, y + 1);
        }

        // Stem: up if slot < 4, down if slot >= 4
        const stemUp = slot < 4;
        const stemX  = stemUp ? x + r * 1.1 : x - r * 1.1;
        const stemY  = stemUp ? y - ls * 3.5 : y + ls * 3.5;
        ctx.strokeStyle = color;
        ctx.lineWidth   = 0.9;
        ctx.beginPath();
        ctx.moveTo(stemX, y);
        ctx.lineTo(stemX, stemY);
        ctx.stroke();
    }

    _drawPlayhead(x) {
        const ctx  = this.ctx;
        const topY = this.treble.y0 - 4 * this._ls - 10;
        const botY = this.bass.y0   + 10;
        ctx.strokeStyle = 'rgba(249,115,22,0.55)';
        ctx.lineWidth   = 1.2;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, botY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawFrame() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this._w, this._h);

        this._drawBrace();
        ['treble', 'bass'].forEach(c => { this._drawStaffLines(c); this._drawClef(c); });

        const hasScore = this._score.length > 0;

        if (hasScore) {
            // Scrolling score mode
            const phx    = this._w * 0.22;
            const pxPerMs = 0.095;

            this._drawPlayhead(phx);

            this._score.forEach(e => {
                const dx = (e.time - this._playTimeMs) * pxPerMs;
                const x  = phx + dx;
                if (x < 30 || x > this._w + 16) return;
                this._drawNote(e.midi, x, this.activeNotes.has(e.midi));
            });
        } else {
            // Live mode: cluster active notes at centre
            if (this.activeNotes.size === 0) return;

            // Spread same-slot notes horizontally
            const cx      = this._w * 0.5;
            const slotMap = {};
            [...this.activeNotes].sort((a, b) => a - b).forEach(midi => {
                const key  = this._midiToSlot(midi).clef + '_' + this._midiToSlot(midi).slot;
                const col  = slotMap[key] = (slotMap[key] ?? 0);
                slotMap[key]++;
                this._drawNote(midi, cx + col * this._noteR * 2.8, true);
            });
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    setActiveNotes(notes) {
        this.activeNotes = notes instanceof Set ? notes : new Set(notes);
    }

    loadScore(events) {
        this._score = events;
        this._playTimeMs = 0;
    }

    setPlayTime(ms) {
        this._playTimeMs = ms;
    }

    clearScore() {
        this._score = [];
        this._playTimeMs = 0;
    }

    /** Call once per rAF frame from the page's animation loop. */
    draw() {
        this._init(); // no-op if size unchanged
        this._drawFrame();
    }
}
