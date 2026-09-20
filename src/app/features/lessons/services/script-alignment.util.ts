export interface WhisperWordTimestamp {
  text: string;
  start: number;
  end: number;
}

export type AlignmentReviewStatus = 'matched' | 'review';

export interface ScriptAlignmentOptions {
  startPaddingSeconds?: number;
  endPaddingSeconds?: number;
  preserveStartPaddingOverlap?: boolean;
}

export interface ScriptLineAlignment {
  lineIndex: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
  matchedText: string;
  status: AlignmentReviewStatus;
}

interface PreparedWord extends WhisperWordTimestamp {
  normalized: string;
}

interface CandidateMatch {
  startIndex: number;
  endIndex: number;
  editDistance: number;
  score: number;
}

const DEFAULT_START_PADDING_SECONDS = 1;
const DEFAULT_END_PADDING_SECONDS = 0.18;
const REVIEW_THRESHOLD = 0.62;

export function cleanScriptLine(line: string): string {
  return line
    .replace(/^\s*(?:speaker\s*\d+|teacher|student|[a-z])\s*[:\-–—]\s*/i, '')
    .trim();
}

export function alignScriptLinesToWords(
  rawScriptLines: string[],
  rawWords: WhisperWordTimestamp[],
  mediaDuration: number,
  options: ScriptAlignmentOptions = {},
): ScriptLineAlignment[] {
  const words = rawWords
    .map<PreparedWord | null>((word) => {
      const normalized = normalizeToken(word.text);
      if (!normalized) return null;

      return {
        ...word,
        start: finiteNonNegative(word.start),
        end: Math.max(finiteNonNegative(word.end), finiteNonNegative(word.start) + 0.04),
        normalized,
      };
    })
    .filter((word): word is PreparedWord => !!word);

  if (words.length === 0) {
    throw new Error('Whisper did not return usable word timestamps.');
  }

  const cleanedLines = rawScriptLines.map(cleanScriptLine).filter(Boolean);
  if (cleanedLines.length === 0) {
    throw new Error('The script does not contain any usable lines.');
  }

  const startPaddingSeconds = safePaddingSeconds(
    options.startPaddingSeconds,
    DEFAULT_START_PADDING_SECONDS,
  );
  const endPaddingSeconds = safePaddingSeconds(
    options.endPaddingSeconds,
    DEFAULT_END_PADDING_SECONDS,
  );
  const preserveStartPaddingOverlap = options.preserveStartPaddingOverlap !== false;

  const results: ScriptLineAlignment[] = [];
  let cursor = 0;

  for (let lineIndex = 0; lineIndex < cleanedLines.length; lineIndex++) {
    const text = cleanedLines[lineIndex];
    const lineTokens = tokenize(text);

    if (lineTokens.length === 0) continue;

    const candidate = findBestCandidate(lineTokens, words, cursor);
    const matchedWords = words.slice(candidate.startIndex, candidate.endIndex + 1);
    const normalizedDistance =
      candidate.editDistance / Math.max(lineTokens.length, matchedWords.length, 1);
    const confidence = clamp01(1 - normalizedDistance);

    results.push({
      lineIndex,
      text,
      start: roundTime(Math.max(0, matchedWords[0].start - startPaddingSeconds)),
      end: roundTime(
        Math.min(
          positiveDuration(mediaDuration, words[words.length - 1].end),
          matchedWords[matchedWords.length - 1].end + endPaddingSeconds,
        ),
      ),
      confidence: roundConfidence(confidence),
      matchedText: matchedWords.map((word) => word.text.trim()).filter(Boolean).join(' '),
      status: confidence >= REVIEW_THRESHOLD ? 'matched' : 'review',
    });

    cursor = Math.min(candidate.endIndex + 1, words.length - 1);
  }

  normalizeBoundaries(
    results,
    positiveDuration(mediaDuration, words[words.length - 1].end),
    preserveStartPaddingOverlap,
  );
  return results;
}

function findBestCandidate(
  lineTokens: string[],
  words: PreparedWord[],
  cursor: number,
): CandidateMatch {
  const targetLength = lineTokens.length;
  const variation = Math.max(2, Math.ceil(targetLength * 0.35));
  const minimumLength = Math.max(1, targetLength - variation);
  const maximumLength = Math.min(words.length, targetLength + variation);
  const searchStart = Math.max(0, cursor - 2);
  const lookAhead = Math.max(24, targetLength * 5);
  const searchEnd = Math.min(words.length - 1, cursor + lookAhead);

  let best: CandidateMatch | null = null;

  for (let startIndex = searchStart; startIndex <= searchEnd; startIndex++) {
    for (let length = minimumLength; length <= maximumLength; length++) {
      const endIndex = startIndex + length - 1;
      if (endIndex >= words.length) break;

      const candidateTokens = words
        .slice(startIndex, endIndex + 1)
        .map((word) => word.normalized);
      const editDistance = levenshteinDistance(lineTokens, candidateTokens);
      const normalizedDistance = editDistance / Math.max(targetLength, length, 1);
      const positionPenalty = Math.max(0, startIndex - cursor) * 0.0035;
      const backwardsPenalty = startIndex < cursor ? (cursor - startIndex) * 0.025 : 0;
      const lengthPenalty = Math.abs(length - targetLength) * 0.006;
      const score = normalizedDistance + positionPenalty + backwardsPenalty + lengthPenalty;

      if (!best || score < best.score) {
        best = { startIndex, endIndex, editDistance, score };
      }
    }
  }

  if (best) return best;

  const safeStart = Math.min(Math.max(cursor, 0), words.length - 1);
  const safeEnd = Math.min(words.length - 1, safeStart + Math.max(targetLength - 1, 0));
  return {
    startIndex: safeStart,
    endIndex: safeEnd,
    editDistance: targetLength,
    score: 1,
  };
}

function normalizeBoundaries(
  results: ScriptLineAlignment[],
  duration: number,
  preserveStartPaddingOverlap: boolean,
): void {
  for (let index = 0; index < results.length; index++) {
    const current = results[index];
    const next = results[index + 1];

    current.start = clamp(current.start, 0, duration);
    current.end = clamp(Math.max(current.end, current.start + 0.08), 0, duration);

    if (!next) continue;

    next.start = clamp(next.start, 0, duration);
    if (!preserveStartPaddingOverlap && current.end > next.start) {
      const boundary = roundTime((current.end + next.start) / 2);
      current.end = Math.max(current.start + 0.04, boundary);
      next.start = Math.min(next.end - 0.04, boundary);
    }
  }
}

function tokenize(value: string): string[] {
  return value
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function levenshteinDistance(left: string[], right: string[]): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    for (let index = 0; index < current.length; index++) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}


function safePaddingSeconds(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return clamp(Number(value), 0, 3);
}

function positiveDuration(duration: number, fallback: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration : Math.max(fallback, 0.1);
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}
