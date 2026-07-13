import { describe, expect, it } from 'vitest';
import {
  normalizeTimeCandidate,
  parseTimetableOcr,
  recognizeScheduleHeading,
  type OcrTextItem,
} from './ocrParser';

describe('OCR time normalization', () => {
  it.each([
    ['06:42', '06:42'],
    ['6.42', '06:42'],
    ['6,42', '06:42'],
    ['6h42', '06:42'],
    ['6 42', '06:42'],
    ['0642', '06:42'],
    ['642', '06:42'],
    ['O6;4I', '06:41'],
    ['I7:l2', '17:12'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeTimeCandidate(raw)?.value).toBe(expected);
  });

  it.each(['24:00', '07:72', '7:2', 'bus 47', '12345'])('rejects %s', (raw) => {
    expect(normalizeTimeCandidate(raw)).toBeNull();
  });

  it('reports every conservative correction', () => {
    expect(normalizeTimeCandidate('O6;4I')).toMatchObject({
      corrected: true,
      corrections: ['separator “;” normalized to :', '“O” read as 0', '“I” read as 1'],
      format: 'separated',
    });
  });
});

describe('multilingual schedule headings', () => {
  it.each([
    ['Mon–Fri', [1, 2, 3, 4, 5], 'en'],
    ['Lunedì al venerdì', [1, 2, 3, 4, 5], 'it'],
    ['Lundi au vendredi', [1, 2, 3, 4, 5], 'fr'],
    ['Montag bis Freitag', [1, 2, 3, 4, 5], 'de'],
    ['Sabato', [6], 'it'],
    ['Dimanche', [0], 'fr'],
    ['Mo–Fr', [1, 2, 3, 4, 5], 'de'],
    ['Sat & Sun', [0, 6], 'en'],
  ])('recognizes %s', (text, days, language) => {
    expect(recognizeScheduleHeading(text)).toMatchObject({ days, language, ambiguous: false });
  });

  it.each(['Feriale', 'Jours ouvrables', 'Werktags', 'Domenica e festivi', 'School days'])('flags %s for review', (text) => {
    expect(recognizeScheduleHeading(text)).toMatchObject({ days: null, ambiguous: true });
  });

  it('does not mistake ordinary Italian prose for a German Tuesday abbreviation', () => {
    expect(recognizeScheduleHeading('Orari di partenza')).toBeNull();
  });
});

describe('deterministic timetable OCR parsing', () => {
  it('extracts, sorts, and deduplicates raw times without inventing a missing departure', () => {
    const result = parseTimetableOcr('06:42 07:42 06:42');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].times.map((time) => time.value)).toEqual(['06:42', '07:42']);
    expect(result.times).toHaveLength(2);
    expect(result.warnings.map((warning) => warning.code)).toContain('DUPLICATE_TIME');
  });

  it('rejects impossible time-like values and retains their provenance', () => {
    const result = parseTimetableOcr('Valid 06:42, bad 07:72 and 25:00');
    expect(result.times.map((time) => time.value)).toEqual(['06:42']);
    expect(result.rejectedCandidates.map((candidate) => [candidate.originalText, candidate.reason])).toEqual([
      ['07:72', 'invalid-minute'],
      ['25:00', 'invalid-hour'],
    ]);
    expect(result.rejectedCandidates[0].provenance).toMatchObject({ source: 'rawText', span: [17, 22] });
  });

  it('does not parse dates as departure times', () => {
    const result = parseTimetableOcr('Valid from 12.07.2026; departures 06:42 07:12');
    expect(result.times.map((time) => time.value)).toEqual(['06:42', '07:12']);
  });

  it('keeps character corrections, OCR confidence, bounding box, and source text', () => {
    const result = parseTimetableOcr({
      tokens: [{ text: 'O6;4I', confidence: 61, box: { x: 10, y: 20, width: 50, height: 12 } }],
    });
    const time = result.times[0];
    expect(time).toMatchObject({ value: '06:41', corrected: true, confidence: 0.61 });
    expect(time.provenance[0]).toMatchObject({
      source: 'token', sourceIndex: 0, originalText: 'O6;4I', ocrConfidence: 0.61,
      box: { x: 10, y: 20, width: 50, height: 12 },
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['CORRECTED_TIME', 'LOW_CONFIDENCE_TIME']));
  });

  it('groups side-by-side spatial columns under their headings', () => {
    const tokens: OcrTextItem[] = [
      { text: 'Lun–Ven', confidence: 0.99, box: { x: 0, y: 0, width: 90, height: 20 } },
      { text: 'Sabato', confidence: 0.99, box: { x: 200, y: 0, width: 90, height: 20 } },
      { text: '06:42', confidence: 0.97, box: { x: 15, y: 50, width: 50, height: 16 } },
      { text: '07:12', confidence: 0.96, box: { x: 15, y: 80, width: 50, height: 16 } },
      { text: '07:15', confidence: 0.95, box: { x: 215, y: 50, width: 50, height: 16 } },
      { text: '08:15', confidence: 0.94, box: { x: 215, y: 80, width: 50, height: 16 } },
    ];
    const result = parseTimetableOcr({ tokens });
    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => ({ days: group.days, times: group.times.map((time) => time.value) }))).toEqual([
      { days: [1, 2, 3, 4, 5], times: ['06:42', '07:12'] },
      { days: [6], times: ['07:15', '08:15'] },
    ]);
    expect(result.groups.every((group) => !group.requiresReview)).toBe(true);
  });

  it('keeps unlabelled side-by-side columns separate', () => {
    const result = parseTimetableOcr({ tokens: [
      { text: '06:42', box: { x: 0, y: 20, width: 50, height: 15 } },
      { text: '07:12', box: { x: 0, y: 50, width: 50, height: 15 } },
      { text: '08:15', box: { x: 180, y: 20, width: 50, height: 15 } },
      { text: '09:15', box: { x: 180, y: 50, width: 50, height: 15 } },
    ] });
    expect(result.groups.map((group) => group.times.map((time) => time.value))).toEqual([
      ['06:42', '07:12'],
      ['08:15', '09:15'],
    ]);
    expect(result.groups.every((group) => group.warningCodes.includes('UNASSIGNED_DAYS'))).toBe(true);
  });

  it('groups unpositioned raw OCR by the closest preceding heading', () => {
    const result = parseTimetableOcr('Lun–Ven\n06:42\n07:12\nSabato\n08:15\n09:15');
    expect(result.groups.map((group) => ({ days: group.days, times: group.times.map((time) => time.value) }))).toEqual([
      { days: [1, 2, 3, 4, 5], times: ['06:42', '07:12'] },
      { days: [6], times: ['08:15', '09:15'] },
    ]);
  });

  it('uses blocks when tokens are absent', () => {
    const result = parseTimetableOcr({ blocks: [{ text: 'Lundi\n6h42\n7h12', confidence: 0.9 }] });
    expect(result.groups[0]).toMatchObject({ days: [1] });
    expect(result.groups[0].times.map((time) => time.value)).toEqual(['06:42', '07:12']);
    expect(result.times[0].provenance[0].source).toBe('block');
  });

  it('falls back to raw text only when structured OCR finds no valid times', () => {
    const result = parseTimetableOcr({
      tokens: [{ text: 'Departures' }],
      rawText: 'Mon–Fri 06:42 07:12',
    });
    expect(result.usedRawTextFallback).toBe(true);
    expect(result.times.map((time) => time.value)).toEqual(['06:42', '07:12']);
    expect(result.warnings.map((warning) => warning.code)).toContain('RAW_TEXT_FALLBACK');
    expect(result.times[0].provenance[0].source).toBe('rawText');
  });

  it('prefers tokens to overlapping block and raw OCR hierarchies', () => {
    const result = parseTimetableOcr({
      tokens: [{ text: '06:42' }],
      blocks: [{ text: '06:42 07:12' }],
      rawText: '06:42 07:12 07:42',
    });
    expect(result.times.map((time) => time.value)).toEqual(['06:42']);
    expect(result.times[0].provenance[0].source).toBe('token');
  });

  it('returns ambiguous service labels without silently assigning weekdays', () => {
    const result = parseTimetableOcr('Feriale\n06:42\n07:12');
    expect(result.groups[0]).toMatchObject({ days: null, requiresReview: true });
    expect(result.groups[0].heading).toMatchObject({ kind: 'ambiguous', language: 'it', ambiguous: true });
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['AMBIGUOUS_HEADING', 'UNASSIGNED_DAYS']));
  });

  it('returns actionable empty and no-time results', () => {
    expect(parseTimetableOcr({}).warnings).toEqual([{ code: 'NO_TEXT', message: 'No OCR text was provided.' }]);
    const noTimes = parseTimetableOcr('No departures visible');
    expect(noTimes.groups).toEqual([]);
    expect(noTimes.warnings.map((warning) => warning.code)).toContain('NO_TIMES');
  });
});
