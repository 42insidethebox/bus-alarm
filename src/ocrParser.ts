/**
 * Deterministic OCR-to-timetable parsing.
 *
 * This module deliberately does not guess departures, locations, directions, or
 * service exceptions. It extracts only time-like text that is present in the OCR
 * result and leaves ambiguous schedule labels for user review.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type OcrBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrEdgeBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type OcrTextItem = {
  text: string;
  confidence?: number | null;
  box?: OcrBox | OcrEdgeBox | null;
  boundingBox?: OcrBox | OcrEdgeBox | null;
};

export type TimetableOcrInput = {
  rawText?: string | null;
  tokens?: readonly OcrTextItem[] | null;
  blocks?: readonly OcrTextItem[] | null;
};

export type OcrSource = 'token' | 'block' | 'rawText';

export type OcrProvenance = {
  source: OcrSource;
  sourceIndex: number;
  originalText: string;
  span: readonly [number, number];
  box?: OcrBox;
  ocrConfidence?: number;
};

export type TimeFormat = 'separated' | 'compact' | 'spaced';

export type NormalizedTimeCandidate = {
  value: string;
  originalText: string;
  corrected: boolean;
  corrections: string[];
  format: TimeFormat;
  formatConfidence: number;
};

export type ParsedOcrTime = NormalizedTimeCandidate & {
  confidence: number;
  provenance: OcrProvenance[];
};

export type ScheduleHeadingKind =
  | 'days'
  | 'weekdays'
  | 'weekend'
  | 'holiday'
  | 'school-days'
  | 'ambiguous';

export type ScheduleLanguage = 'en' | 'it' | 'fr' | 'de' | 'unknown';

export type RecognizedScheduleHeading = {
  text: string;
  normalizedText: string;
  days: Weekday[] | null;
  kind: ScheduleHeadingKind;
  language: ScheduleLanguage;
  confidence: number;
  ambiguous: boolean;
  provenance?: OcrProvenance;
};

export type TimetableDraftGroup = {
  id: string;
  heading: RecognizedScheduleHeading | null;
  days: Weekday[] | null;
  times: ParsedOcrTime[];
  confidence: number;
  requiresReview: boolean;
  warningCodes: OcrWarningCode[];
};

export type RejectedOcrCandidate = {
  originalText: string;
  reason: 'invalid-hour' | 'invalid-minute' | 'unsupported-format';
  provenance: OcrProvenance;
};

export type OcrWarningCode =
  | 'NO_TEXT'
  | 'NO_TIMES'
  | 'RAW_TEXT_FALLBACK'
  | 'CORRECTED_TIME'
  | 'LOW_CONFIDENCE_TIME'
  | 'INVALID_TIME'
  | 'DUPLICATE_TIME'
  | 'AMBIGUOUS_HEADING'
  | 'UNASSIGNED_DAYS';

export type OcrWarning = {
  code: OcrWarningCode;
  message: string;
  groupId?: string;
  provenance?: OcrProvenance;
};

export type TimetableOcrResult = {
  groups: TimetableDraftGroup[];
  times: ParsedOcrTime[];
  headings: RecognizedScheduleHeading[];
  rejectedCandidates: RejectedOcrCandidate[];
  warnings: OcrWarning[];
  usedRawTextFallback: boolean;
};

type LocatedTime = ParsedOcrTime & { order: number; box?: OcrBox };
type LocatedHeading = RecognizedScheduleHeading & { order: number; box?: OcrBox };

type DayAlias = {
  day: Weekday;
  language: Exclude<ScheduleLanguage, 'unknown'>;
};

const DAY_ALIASES: Record<string, DayAlias> = {
  // English
  sun: { day: 0, language: 'en' }, sunday: { day: 0, language: 'en' },
  mon: { day: 1, language: 'en' }, monday: { day: 1, language: 'en' },
  tue: { day: 2, language: 'en' }, tues: { day: 2, language: 'en' }, tuesday: { day: 2, language: 'en' },
  wed: { day: 3, language: 'en' }, weds: { day: 3, language: 'en' }, wednesday: { day: 3, language: 'en' },
  thu: { day: 4, language: 'en' }, thur: { day: 4, language: 'en' }, thurs: { day: 4, language: 'en' }, thursday: { day: 4, language: 'en' },
  fri: { day: 5, language: 'en' }, friday: { day: 5, language: 'en' },
  sat: { day: 6, language: 'en' }, saturday: { day: 6, language: 'en' },
  // Italian
  dom: { day: 0, language: 'it' }, domenica: { day: 0, language: 'it' },
  lun: { day: 1, language: 'it' }, lunedi: { day: 1, language: 'it' },
  mar: { day: 2, language: 'it' }, martedi: { day: 2, language: 'it' },
  mer: { day: 3, language: 'it' }, mercoledi: { day: 3, language: 'it' },
  gio: { day: 4, language: 'it' }, giovedi: { day: 4, language: 'it' },
  ven: { day: 5, language: 'it' }, venerdi: { day: 5, language: 'it' },
  sab: { day: 6, language: 'it' }, sabato: { day: 6, language: 'it' },
  // French aliases that do not already have an equivalent Italian key.
  dimanche: { day: 0, language: 'fr' }, lundi: { day: 1, language: 'fr' },
  mardi: { day: 2, language: 'fr' }, mercredi: { day: 3, language: 'fr' },
  jeu: { day: 4, language: 'fr' }, jeudi: { day: 4, language: 'fr' },
  vendredi: { day: 5, language: 'fr' }, samedi: { day: 6, language: 'fr' },
  // German
  so: { day: 0, language: 'de' }, sonntag: { day: 0, language: 'de' },
  mo: { day: 1, language: 'de' }, montag: { day: 1, language: 'de' },
  di: { day: 2, language: 'de' }, dienstag: { day: 2, language: 'de' },
  mi: { day: 3, language: 'de' }, mittwoch: { day: 3, language: 'de' },
  do: { day: 4, language: 'de' }, donnerstag: { day: 4, language: 'de' },
  fr: { day: 5, language: 'de' }, freitag: { day: 5, language: 'de' },
  sa: { day: 6, language: 'de' }, samstag: { day: 6, language: 'de' },
};

const RANGE_CONNECTORS = new Set(['-', 'to', 'through', 'thru', 'au', 'a', 'al', 'bis']);

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const roundConfidence = (value: number) => Math.round(clamp(value) * 1000) / 1000;

function normalizeConfidence(value?: number | null): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return clamp(value > 1 ? value / 100 : value);
}

function normalizeBox(box?: OcrBox | OcrEdgeBox | null): OcrBox | undefined {
  if (!box) return undefined;
  if ('x' in box) {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return undefined;
    return { x: box.x, y: box.y, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  }
  if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite)) return undefined;
  return {
    x: Math.min(box.left, box.right),
    y: Math.min(box.top, box.bottom),
    width: Math.abs(box.right - box.left),
    height: Math.abs(box.bottom - box.top),
  };
}

function normalizeWords(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceOcrDigits(part: string, corrections: string[]): string {
  return [...part].map((character) => {
    if (character === 'O' || character === 'o') {
      corrections.push(`“${character}” read as 0`);
      return '0';
    }
    if (character === 'I' || character === 'l' || character === '|') {
      corrections.push(`“${character}” read as 1`);
      return '1';
    }
    return character;
  }).join('');
}

type InspectedCandidate =
  | { normalized: NormalizedTimeCandidate; rejection?: never }
  | { normalized?: never; rejection: RejectedOcrCandidate['reason'] };

function inspectTimeCandidate(raw: string): InspectedCandidate {
  const originalText = raw.trim();
  const corrections: string[] = [];
  let hourPart: string;
  let minutePart: string;
  let format: TimeFormat;
  let formatConfidence: number;

  const separated = /^([0-9OoIl|]{1,2})\s*([:.;,hH：])\s*([0-9OoIl|]{2})$/.exec(originalText);
  // A missing separator may be represented by horizontal whitespace inside one
  // OCR token. Never join digits across lines: that would fabricate a time from
  // the minutes of one row and the hour of the next.
  const spaced = /^([0-9OoIl|]{1,2})[ \t]+([0-9OoIl|]{2})$/.exec(originalText);
  const compact = /^([0-9OoIl|]{3,4})$/.exec(originalText);

  if (separated) {
    hourPart = separated[1];
    minutePart = separated[3];
    format = 'separated';
    const separator = separated[2];
    formatConfidence = separator === ':' || separator === '：' ? 0.98
      : separator.toLocaleLowerCase() === 'h' || separator === '.' || separator === ',' ? 0.92
        : 0.86;
    if (separator !== ':' && separator !== '：') corrections.push(`separator “${separator}” normalized to :`);
  } else if (spaced) {
    hourPart = spaced[1];
    minutePart = spaced[2];
    format = 'spaced';
    formatConfidence = 0.74;
    corrections.push('space interpreted as time separator');
  } else if (compact) {
    hourPart = compact[1].slice(0, -2);
    minutePart = compact[1].slice(-2);
    format = 'compact';
    formatConfidence = 0.78;
    corrections.push('compact time expanded');
  } else {
    return { rejection: 'unsupported-format' };
  }

  hourPart = replaceOcrDigits(hourPart, corrections);
  minutePart = replaceOcrDigits(minutePart, corrections);
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { rejection: 'invalid-hour' };
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return { rejection: 'invalid-minute' };

  const ambiguousCharacterCorrections = corrections.filter((correction) => correction.includes('read as')).length;
  formatConfidence -= ambiguousCharacterCorrections * 0.1;

  return {
    normalized: {
      value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      originalText,
      corrected: corrections.length > 0,
      corrections,
      format,
      formatConfidence: roundConfidence(formatConfidence),
    },
  };
}

/** Normalize one complete time token. Partial strings and impossible times return null. */
export function normalizeTimeCandidate(raw: string): NormalizedTimeCandidate | null {
  return inspectTimeCandidate(raw).normalized ?? null;
}

function languageForAliases(aliases: DayAlias[]): ScheduleLanguage {
  if (!aliases.length) return 'unknown';
  const counts = aliases.reduce<Record<string, number>>((result, alias) => {
    result[alias.language] = (result[alias.language] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as ScheduleLanguage;
}

function expandDayRange(start: Weekday, end: Weekday): Weekday[] {
  const days: Weekday[] = [start];
  let current = start;
  while (current !== end && days.length < 7) {
    current = ((current + 1) % 7) as Weekday;
    days.push(current);
  }
  return days;
}

/** Recognize a day/service heading without using network services or probabilistic models. */
export function recognizeScheduleHeading(text: string): RecognizedScheduleHeading | null {
  const normalizedText = normalizeWords(text);
  if (!normalizedText) return null;

  const special: Array<{
    pattern: RegExp;
    kind: ScheduleHeadingKind;
    days: Weekday[] | null;
    language: ScheduleLanguage;
    ambiguous: boolean;
  }> = [
    { pattern: /\b(weekdays?|monday to friday|mon-fri)\b/, kind: 'weekdays', days: [1, 2, 3, 4, 5], language: 'en', ambiguous: false },
    { pattern: /\b(lunedi al venerdi|lun-ven)\b/, kind: 'weekdays', days: [1, 2, 3, 4, 5], language: 'it', ambiguous: false },
    { pattern: /\b(lundi au vendredi|lun-ven)\b/, kind: 'weekdays', days: [1, 2, 3, 4, 5], language: 'fr', ambiguous: false },
    { pattern: /\b(montag bis freitag|mo-fr)\b/, kind: 'weekdays', days: [1, 2, 3, 4, 5], language: 'de', ambiguous: false },
    { pattern: /\b(weekends?|saturday and sunday)\b/, kind: 'weekend', days: [0, 6], language: 'en', ambiguous: false },
    { pattern: /\b(fine settimana|sabato e domenica)\b/, kind: 'weekend', days: [0, 6], language: 'it', ambiguous: false },
    { pattern: /\b(week-end|samedi et dimanche)\b/, kind: 'weekend', days: [0, 6], language: 'fr', ambiguous: false },
    { pattern: /\b(wochenende|samstag und sonntag)\b/, kind: 'weekend', days: [0, 6], language: 'de', ambiguous: false },
    { pattern: /\b(holiday|holidays)\b/, kind: 'holiday', days: null, language: 'en', ambiguous: true },
    { pattern: /\b(festivo|festivi|giorni festivi)\b/, kind: 'holiday', days: null, language: 'it', ambiguous: true },
    { pattern: /\b(jour ferie|jours feries)\b/, kind: 'holiday', days: null, language: 'fr', ambiguous: true },
    { pattern: /\b(feiertag|feiertage)\b/, kind: 'holiday', days: null, language: 'de', ambiguous: true },
    { pattern: /\b(school days?|schooldays?)\b/, kind: 'school-days', days: null, language: 'en', ambiguous: true },
    { pattern: /\b(scolastico|giorni scolastici)\b/, kind: 'school-days', days: null, language: 'it', ambiguous: true },
    { pattern: /\b(jours? scolaires?)\b/, kind: 'school-days', days: null, language: 'fr', ambiguous: true },
    { pattern: /\b(schultage?|schulzeit)\b/, kind: 'school-days', days: null, language: 'de', ambiguous: true },
    { pattern: /\b(working days?|workdays?)\b/, kind: 'ambiguous', days: null, language: 'en', ambiguous: true },
    { pattern: /\b(feriale|feriali|giorni feriali)\b/, kind: 'ambiguous', days: null, language: 'it', ambiguous: true },
    { pattern: /\b(jours? ouvrables?)\b/, kind: 'ambiguous', days: null, language: 'fr', ambiguous: true },
    { pattern: /\b(werktag|werktags|werktage)\b/, kind: 'ambiguous', days: null, language: 'de', ambiguous: true },
  ];

  // Exceptions and school/holiday qualifiers take precedence over a day embedded
  // in the same line (for example "Domenica e festivi").
  const specialMatch = special.slice(8).find((entry) => entry.pattern.test(normalizedText))
    ?? special.slice(0, 8).find((entry) => entry.pattern.test(normalizedText));
  if (specialMatch) {
    return {
      text: text.trim(), normalizedText, days: specialMatch.days, kind: specialMatch.kind,
      language: specialMatch.language, confidence: specialMatch.ambiguous ? 0.65 : 0.98,
      ambiguous: specialMatch.ambiguous,
    };
  }

  const words = normalizedText.match(/[a-z]+|-/g) ?? [];
  const matches = words.map((word, index) => ({ word, index, alias: DAY_ALIASES[word] })).filter(
    (item): item is { word: string; index: number; alias: DayAlias } => Boolean(item.alias),
  );
  if (!matches.length) return null;

  // Two-letter abbreviations such as German "Di" are only trusted alone, in a
  // range, or in a day list. This avoids treating Italian prose containing "di"
  // as a Tuesday heading.
  if (matches.length === 1 && matches[0].word.length <= 2 && words.length !== 1) return null;

  let days: Weekday[];
  let isRange = false;
  if (matches.length >= 2) {
    const between = words.slice(matches[0].index + 1, matches[1].index);
    isRange = between.some((word) => RANGE_CONNECTORS.has(word));
  }
  if (isRange) days = expandDayRange(matches[0].alias.day, matches[1].alias.day);
  else days = [...new Set(matches.map((match) => match.alias.day))].sort((a, b) => a - b) as Weekday[];

  return {
    text: text.trim(), normalizedText, days, kind: 'days',
    language: languageForAliases(matches.map((match) => match.alias)),
    confidence: matches.length > 1 || words.length === 1 ? 0.94 : 0.88,
    ambiguous: false,
  };
}

type CandidateSpan = { raw: string; start: number; end: number };

function overlapsDate(text: string, start: number, end: number): boolean {
  const datePattern = /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/g;
  for (const match of text.matchAll(datePattern)) {
    const dateStart = match.index ?? 0;
    const dateEnd = dateStart + match[0].length;
    if (start < dateEnd && end > dateStart) return true;
  }
  return false;
}

function candidateSpans(text: string): CandidateSpan[] {
  const patterns = [
    /(?<![\p{L}\p{N}])([0-9OoIl|]{1,2}\s*[:.;,hH：]\s*[0-9OoIl|]{2})(?![\p{L}\p{N}])/gu,
    /(?<![\p{L}\p{N}])([0-9OoIl|]{1,2}[ \t]+[0-9OoIl|]{2})(?![\p{L}\p{N}])/gu,
    /(?<![\p{L}\p{N}])([0-9OoIl|]{3,4})(?![\p{L}\p{N}])/gu,
  ];
  const found: CandidateSpan[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      const start = (match.index ?? 0) + match[0].indexOf(raw);
      const end = start + raw.length;
      if (overlapsDate(text, start, end)) continue;
      if (!found.some((candidate) => candidate.start === start && candidate.end === end)) found.push({ raw, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start || b.end - a.end);
}

function approximateBox(box: OcrBox | undefined, text: string, start: number, end: number): OcrBox | undefined {
  if (!box) return undefined;
  const before = text.slice(0, start);
  const lineIndex = (before.match(/\n/g) ?? []).length;
  const lines = text.split('\n');
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineLength = Math.max(1, lines[lineIndex]?.length ?? text.length);
  const relativeStart = Math.max(0, start - lineStart) / lineLength;
  const relativeWidth = Math.max(1, end - start) / lineLength;
  const lineHeight = box.height / Math.max(1, lines.length);
  return {
    x: box.x + box.width * relativeStart,
    y: box.y + lineHeight * lineIndex,
    width: Math.min(box.width * relativeWidth, box.width * (1 - relativeStart)),
    height: lineHeight,
  };
}

function makeProvenance(
  source: OcrSource,
  sourceIndex: number,
  item: OcrTextItem,
  start: number,
  end: number,
): OcrProvenance {
  const itemBox = normalizeBox(item.box ?? item.boundingBox);
  return {
    source,
    sourceIndex,
    originalText: item.text,
    span: [start, end],
    ...(itemBox ? { box: approximateBox(itemBox, item.text, start, end) } : {}),
    ...(normalizeConfidence(item.confidence) == null ? {} : { ocrConfidence: normalizeConfidence(item.confidence) }),
  };
}

function extractHeadingLines(item: OcrTextItem): Array<{ text: string; start: number; end: number }> {
  const lines: Array<{ text: string; start: number; end: number }> = [];
  let offset = 0;
  for (const line of item.text.split('\n')) {
    const trimmed = line.trim();
    const leading = line.indexOf(trimmed);
    if (trimmed) lines.push({ text: trimmed, start: offset + Math.max(0, leading), end: offset + Math.max(0, leading) + trimmed.length });
    offset += line.length + 1;
  }
  return lines;
}

function centerX(box: OcrBox): number { return box.x + box.width / 2; }
function centerY(box: OcrBox): number { return box.y + box.height / 2; }
function horizontalGap(a: OcrBox, b: OcrBox): number {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  if (aRight < b.x) return b.x - aRight;
  if (bRight < a.x) return a.x - bRight;
  return 0;
}

function timeMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function warningMessage(code: OcrWarningCode): string {
  switch (code) {
    case 'NO_TEXT': return 'No OCR text was provided.';
    case 'NO_TIMES': return 'No valid departure times were found.';
    case 'RAW_TEXT_FALLBACK': return 'Structured OCR contained no valid times, so raw OCR text was used.';
    case 'CORRECTED_TIME': return 'One or more OCR characters or time separators were normalized; review the result.';
    case 'LOW_CONFIDENCE_TIME': return 'One or more departure times have low OCR confidence.';
    case 'INVALID_TIME': return 'A time-like value was rejected because it is not a valid 24-hour time.';
    case 'DUPLICATE_TIME': return 'A duplicate departure was merged within its schedule group.';
    case 'AMBIGUOUS_HEADING': return 'A service heading cannot be mapped safely to ordinary weekdays.';
    case 'UNASSIGNED_DAYS': return 'No unambiguous weekday heading could be assigned; choose days before saving.';
  }
}

function addUniqueWarning(warnings: OcrWarning[], warning: OcrWarning): void {
  if (!warnings.some((existing) => existing.code === warning.code
    && existing.groupId === warning.groupId
    && existing.provenance?.source === warning.provenance?.source
    && existing.provenance?.sourceIndex === warning.provenance?.sourceIndex
    && existing.provenance?.span[0] === warning.provenance?.span[0])) warnings.push(warning);
}

function mergeAndSortTimes(times: LocatedTime[], groupId: string, warnings: OcrWarning[]): ParsedOcrTime[] {
  const merged = new Map<string, ParsedOcrTime>();
  for (const time of times) {
    const existing = merged.get(time.value);
    if (!existing) {
      const { order: _order, box: _box, ...parsed } = time;
      merged.set(time.value, parsed);
      continue;
    }
    existing.provenance.push(...time.provenance);
    if (time.confidence > existing.confidence) {
      existing.confidence = time.confidence;
      existing.originalText = time.originalText;
      existing.corrected = time.corrected;
      existing.corrections = time.corrections;
      existing.format = time.format;
      existing.formatConfidence = time.formatConfidence;
    }
    addUniqueWarning(warnings, { code: 'DUPLICATE_TIME', message: warningMessage('DUPLICATE_TIME'), groupId });
  }
  return [...merged.values()].sort((a, b) => timeMinutes(a.value) - timeMinutes(b.value));
}

function groupConfidence(times: ParsedOcrTime[], heading: RecognizedScheduleHeading | null): number {
  const scores = times.map((time) => time.confidence);
  if (heading) scores.push(heading.confidence);
  return roundConfidence(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length));
}

/**
 * Parse OCR output into one or more timetable drafts.
 *
 * `tokens` are preferred over `blocks` because using both normally duplicates the
 * same OCR hierarchy. `rawText` is used only when the structured input yields no
 * valid times. Every accepted value retains source text, span, confidence, and
 * geometry (when supplied).
 */
export function parseTimetableOcr(input: TimetableOcrInput | string): TimetableOcrResult {
  const normalizedInput: TimetableOcrInput = typeof input === 'string' ? { rawText: input } : input;
  const warnings: OcrWarning[] = [];
  const rejectedCandidates: RejectedOcrCandidate[] = [];
  const tokenItems = normalizedInput.tokens?.filter((item) => item.text.trim()) ?? [];
  const blockItems = normalizedInput.blocks?.filter((item) => item.text.trim()) ?? [];
  let source: OcrSource = tokenItems.length ? 'token' : blockItems.length ? 'block' : 'rawText';
  let items: OcrTextItem[] = tokenItems.length ? [...tokenItems] : blockItems.length ? [...blockItems] : [];
  let usedRawTextFallback = false;

  if (!items.length && normalizedInput.rawText?.trim()) {
    items = [{ text: normalizedInput.rawText }];
    usedRawTextFallback = true;
  }
  if (!items.length) {
    return {
      groups: [], times: [], headings: [], rejectedCandidates: [], usedRawTextFallback: false,
      warnings: [{ code: 'NO_TEXT', message: warningMessage('NO_TEXT') }],
    };
  }

  const extract = (extractItems: OcrTextItem[], extractSource: OcrSource) => {
    const locatedTimes: LocatedTime[] = [];
    const locatedHeadings: LocatedHeading[] = [];
    extractItems.forEach((item, sourceIndex) => {
      for (const candidate of candidateSpans(item.text)) {
        const provenance = makeProvenance(extractSource, sourceIndex, item, candidate.start, candidate.end);
        const inspected = inspectTimeCandidate(candidate.raw);
        if (inspected.rejection) {
          rejectedCandidates.push({ originalText: candidate.raw.trim(), reason: inspected.rejection, provenance });
          addUniqueWarning(warnings, { code: 'INVALID_TIME', message: warningMessage('INVALID_TIME'), provenance });
          continue;
        }
        const ocrConfidence = provenance.ocrConfidence ?? (extractSource === 'rawText' ? 0.82 : 0.88);
        const confidence = roundConfidence(Math.min(ocrConfidence, inspected.normalized.formatConfidence));
        const box = provenance.box;
        locatedTimes.push({
          ...inspected.normalized,
          confidence,
          provenance: [provenance],
          order: sourceIndex * 1_000_000 + candidate.start,
          ...(box ? { box } : {}),
        });
        if (inspected.normalized.corrected) {
          addUniqueWarning(warnings, { code: 'CORRECTED_TIME', message: warningMessage('CORRECTED_TIME'), provenance });
        }
        if (confidence < 0.75) {
          addUniqueWarning(warnings, { code: 'LOW_CONFIDENCE_TIME', message: warningMessage('LOW_CONFIDENCE_TIME'), provenance });
        }
      }

      for (const line of extractHeadingLines(item)) {
        const heading = recognizeScheduleHeading(line.text);
        if (!heading) continue;
        const provenance = makeProvenance(extractSource, sourceIndex, item, line.start, line.end);
        const box = provenance.box;
        locatedHeadings.push({
          ...heading,
          provenance,
          confidence: roundConfidence(Math.min(heading.confidence, provenance.ocrConfidence ?? 0.9)),
          order: sourceIndex * 1_000_000 + line.start,
          ...(box ? { box } : {}),
        });
        if (heading.ambiguous) {
          addUniqueWarning(warnings, { code: 'AMBIGUOUS_HEADING', message: warningMessage('AMBIGUOUS_HEADING'), provenance });
        }
      }
    });
    return { locatedTimes, locatedHeadings };
  };

  let extracted = extract(items, source);
  if (!extracted.locatedTimes.length && source !== 'rawText' && normalizedInput.rawText?.trim()) {
    source = 'rawText';
    items = [{ text: normalizedInput.rawText }];
    usedRawTextFallback = true;
    addUniqueWarning(warnings, { code: 'RAW_TEXT_FALLBACK', message: warningMessage('RAW_TEXT_FALLBACK') });
    // Invalid candidates from structured OCR remain useful provenance; raw text is
    // parsed as a second source only when it can rescue an otherwise empty result.
    extracted = extract(items, source);
  } else if (source === 'rawText') {
    usedRawTextFallback = true;
  }

  const { locatedTimes, locatedHeadings } = extracted;
  if (!locatedTimes.length) {
    addUniqueWarning(warnings, { code: 'NO_TIMES', message: warningMessage('NO_TIMES') });
    return {
      groups: [], times: [],
      headings: locatedHeadings.map(({ order: _order, box: _box, ...heading }) => heading),
      rejectedCandidates, warnings, usedRawTextFallback,
    };
  }

  const allBoxes = [...locatedTimes, ...locatedHeadings].flatMap((item) => item.box ? [item.box] : []);
  const minX = allBoxes.length ? Math.min(...allBoxes.map((box) => box.x)) : 0;
  const maxX = allBoxes.length ? Math.max(...allBoxes.map((box) => box.x + box.width)) : 1;
  const canvasWidth = Math.max(1e-6, maxX - minX);

  const assignments = new Map<string, { heading: LocatedHeading | null; times: LocatedTime[] }>();
  const assigned = new Set<LocatedTime>();

  // First associate positioned times with the closest compatible heading above.
  locatedTimes.filter((time) => time.box).forEach((time) => {
    const candidates = locatedHeadings.filter((heading) => {
      if (!heading.box || !time.box) return false;
      const above = heading.box.y + heading.box.height <= centerY(time.box) + Math.max(heading.box.height, time.box.height) * 0.35;
      const gap = horizontalGap(heading.box, time.box);
      return above && gap <= Math.max(canvasWidth * 0.18, heading.box.width * 0.45, time.box.width * 1.5);
    }).sort((a, b) => {
      const aVertical = Math.max(0, time.box!.y - (a.box!.y + a.box!.height));
      const bVertical = Math.max(0, time.box!.y - (b.box!.y + b.box!.height));
      return (aVertical + horizontalGap(a.box!, time.box!) * 1.5)
        - (bVertical + horizontalGap(b.box!, time.box!) * 1.5);
    });
    const heading = candidates[0];
    if (!heading) return;
    const key = `heading:${locatedHeadings.indexOf(heading)}`;
    const group = assignments.get(key) ?? { heading, times: [] };
    group.times.push(time);
    assignments.set(key, group);
    assigned.add(time);
  });

  // Use reading order for unpositioned OCR and as a conservative fallback when
  // geometry is missing. Only an earlier heading can label a later time.
  locatedTimes.filter((time) => !assigned.has(time) && !time.box).forEach((time) => {
    const heading = [...locatedHeadings].filter((candidate) => candidate.order <= time.order).sort((a, b) => b.order - a.order)[0] ?? null;
    const key = heading ? `heading:${locatedHeadings.indexOf(heading)}` : 'unpositioned';
    const group = assignments.get(key) ?? { heading, times: [] };
    group.times.push(time);
    assignments.set(key, group);
    assigned.add(time);
  });

  // Remaining positioned times have no day heading. Cluster their x centres into
  // columns rather than flattening a side-by-side timetable into one schedule.
  const remaining = locatedTimes.filter((time) => !assigned.has(time) && time.box).sort((a, b) => centerX(a.box!) - centerX(b.box!));
  const widths = remaining.map((time) => time.box!.width).sort((a, b) => a - b);
  const medianWidth = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
  const columnThreshold = Math.max(canvasWidth * 0.04, medianWidth * 1.25);
  const columns: LocatedTime[][] = [];
  for (const time of remaining) {
    const column = columns.find((candidate) => {
      const meanX = candidate.reduce((sum, value) => sum + centerX(value.box!), 0) / candidate.length;
      return Math.abs(centerX(time.box!) - meanX) <= columnThreshold;
    });
    if (column) column.push(time);
    else columns.push([time]);
  }
  columns.forEach((times, index) => assignments.set(`column:${index}`, { heading: null, times }));

  const groups: TimetableDraftGroup[] = [];
  [...assignments.values()].filter((assignment) => assignment.times.length).forEach((assignment, index) => {
    const id = `group-${index + 1}`;
    const heading = assignment.heading
      ? (({ order: _order, box: _box, ...publicHeading }) => publicHeading)(assignment.heading)
      : null;
    const times = mergeAndSortTimes(assignment.times, id, warnings);
    const warningCodes: OcrWarningCode[] = [];
    if (!heading?.days) warningCodes.push('UNASSIGNED_DAYS');
    if (heading?.ambiguous) warningCodes.push('AMBIGUOUS_HEADING');
    if (times.some((time) => time.corrected)) warningCodes.push('CORRECTED_TIME');
    if (times.some((time) => time.confidence < 0.75)) warningCodes.push('LOW_CONFIDENCE_TIME');
    for (const code of warningCodes) {
      addUniqueWarning(warnings, { code, message: warningMessage(code), groupId: id });
    }
    groups.push({
      id,
      heading,
      days: heading?.days ?? null,
      times,
      confidence: groupConfidence(times, heading),
      requiresReview: warningCodes.length > 0,
      warningCodes,
    });
  });

  const publicHeadings = locatedHeadings.map(({ order: _order, box: _box, ...heading }) => heading);
  return {
    groups,
    times: groups.flatMap((group) => group.times),
    headings: publicHeadings,
    rejectedCandidates,
    warnings,
    usedRawTextFallback,
  };
}

/** Alias for callers that use noun-first parser naming. */
export const parseOcrTimetable = parseTimetableOcr;
