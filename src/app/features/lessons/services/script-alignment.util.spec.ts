import { describe, expect, it } from 'vitest';
import {
  alignScriptLinesToWords,
  cleanScriptLine,
  WhisperWordTimestamp,
} from './script-alignment.util';

describe('script alignment', () => {
  it('keeps a pause inside one script line', () => {
    const words: WhisperWordTimestamp[] = [
      { text: 'Yes', start: 1, end: 1.3 },
      { text: 'I', start: 2.7, end: 2.9 },
      { text: 'think', start: 2.9, end: 3.2 },
      { text: 'so', start: 3.2, end: 3.5 },
      { text: 'My', start: 3.8, end: 4.1 },
      { text: 'name', start: 4.1, end: 4.4 },
      { text: 'is', start: 4.4, end: 4.55 },
      { text: 'Adam', start: 4.55, end: 4.9 },
    ];

    const result = alignScriptLinesToWords(
      ['B: Yes, I think so. My name is Adam.'],
      words,
      6,
    );

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Yes, I think so. My name is Adam.');
    expect(result[0].start).toBeLessThanOrEqual(1);
    expect(result[0].end).toBeGreaterThanOrEqual(4.9);
    expect(result[0].confidence).toBe(1);
  });

  it('matches lines in order despite one recognition mistake', () => {
    const words: WhisperWordTimestamp[] = [
      { text: 'Are', start: 0.4, end: 0.6 },
      { text: 'you', start: 0.6, end: 0.8 },
      { text: 'in', start: 0.8, end: 0.95 },
      { text: 'this', start: 0.95, end: 1.2 },
      { text: 'class', start: 1.2, end: 1.5 },
      { text: 'Yes', start: 2, end: 2.3 },
      { text: 'I', start: 2.3, end: 2.45 },
      { text: 'think', start: 2.45, end: 2.8 },
      { text: 'so', start: 2.8, end: 3 },
      { text: 'My', start: 3.2, end: 3.4 },
      { text: 'name', start: 3.4, end: 3.65 },
      { text: 'is', start: 3.65, end: 3.8 },
      { text: 'Atom', start: 3.8, end: 4.1 },
    ];

    const result = alignScriptLinesToWords(
      ['A: Are you in this class?', 'B: Yes, I think so. My name is Adam.'],
      words,
      5,
    );

    expect(result).toHaveLength(2);
    expect(result[0].confidence).toBe(1);
    expect(result[1].confidence).toBeGreaterThan(0.8);
    expect(result[1].start).toBeGreaterThan(result[0].start);
  });


  it('starts each segment one second before the first detected word by default', () => {
    const words: WhisperWordTimestamp[] = [
      { text: 'Hello', start: 2, end: 2.35 },
      { text: 'there', start: 2.35, end: 2.7 },
      { text: 'Good', start: 3.1, end: 3.4 },
      { text: 'morning', start: 3.4, end: 3.8 },
    ];

    const result = alignScriptLinesToWords(
      ['A: Hello there.', 'B: Good morning.'],
      words,
      5,
    );

    expect(result[0].start).toBe(1);
    expect(result[1].start).toBe(2.1);
    expect(result[1].start).toBeLessThan(result[0].end);
  });

  it('supports changing the start safety margin', () => {
    const result = alignScriptLinesToWords(
      ['A: Hello.'],
      [{ text: 'Hello', start: 2, end: 2.4 }],
      4,
      { startPaddingSeconds: 0.5 },
    );

    expect(result[0].start).toBe(1.5);
  });

  it('removes common speaker prefixes only at the beginning', () => {
    expect(cleanScriptLine('A: Hello there.')).toBe('Hello there.');
    expect(cleanScriptLine('Speaker 2 - Good morning.')).toBe('Good morning.');
    expect(cleanScriptLine('Teacher: Start now.')).toBe('Start now.');
  });
});
