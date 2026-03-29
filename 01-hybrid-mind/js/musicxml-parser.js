/**
 * musicxml-parser.js
 * Parses a MusicXML (score-partwise) string into a flat sorted array of note events.
 *
 * @param {string} xmlString  Raw MusicXML text
 * @returns {Array<{time:number, midi:number, duration:number}>}  Sorted by time (ms)
 */

const STEP_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitchToMidi(step, octave, alter) {
    return (octave + 1) * 12 + STEP_SEMITONE[step] + Math.round(alter || 0);
}

function extractMidi(noteEl) {
    const p = noteEl.querySelector('pitch');
    if (!p) return null;
    const step   = p.querySelector('step')?.textContent?.trim();
    const octave = parseInt(p.querySelector('octave')?.textContent);
    const alter  = parseFloat(p.querySelector('alter')?.textContent || '0');
    if (!step || isNaN(octave)) return null;
    const midi = pitchToMidi(step, octave, alter);
    return (midi >= 21 && midi <= 108) ? midi : null;
}

export function parseMusicXML(xmlString) {
    const doc = new DOMParser().parseFromString(xmlString, 'application/xml');

    const parseErr = doc.querySelector('parsererror, parseerror');
    if (parseErr) throw new Error('XML mal formado: ' + parseErr.textContent.slice(0, 80));

    const root = doc.documentElement;
    if (root.tagName !== 'score-partwise') {
        throw new Error('Solo se admite score-partwise. Exporta desde MuseScore/Sibelius como MusicXML.');
    }

    const events = [];

    for (const part of root.querySelectorAll(':scope > part')) {
        let divisions = 1;
        let tempo     = 120;
        let cursor    = 0;

        for (const measure of part.querySelectorAll(':scope > measure')) {
            // Update divisions
            const divsEl = measure.querySelector('attributes > divisions');
            if (divsEl) divisions = Math.max(1, parseInt(divsEl.textContent) || 1);

            // Update tempo (first <sound tempo="…"> in measure)
            const soundEl = measure.querySelector('sound[tempo]');
            if (soundEl) tempo = parseFloat(soundEl.getAttribute('tempo')) || tempo;

            let measureCursor  = cursor;
            let lastOnsetMs    = cursor;

            for (const note of measure.querySelectorAll(':scope > note')) {
                const isChord = !!note.querySelector('chord');
                const isRest  = !!note.querySelector('rest');
                const durDiv  = parseInt(note.querySelector('duration')?.textContent) || divisions;
                const durMs   = (durDiv / divisions) * (60000 / tempo);

                if (isChord) {
                    // Stacks with previous note — same onset
                    if (!isRest) {
                        const midi = extractMidi(note);
                        if (midi !== null) events.push({ time: lastOnsetMs, midi, duration: durMs });
                    }
                } else {
                    if (!isRest) {
                        const midi = extractMidi(note);
                        if (midi !== null) events.push({ time: measureCursor, midi, duration: durMs });
                    }
                    lastOnsetMs    = measureCursor;
                    measureCursor += durMs;
                }
            }

            cursor = measureCursor;
        }
    }

    events.sort((a, b) => a.time - b.time);
    return events;
}
