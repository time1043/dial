import type { Subtitle } from '@/types';

/**
 * Subtitle[] matching the parsed output of tests/fixtures/sample.srt.
 * Use in tests that need subtitle data without re-parsing the fixture.
 */
export const SAMPLE_SUBTITLES: Subtitle[] = [
	{ id: 0, start: 1, end: 3.23, text: 'Hello world' },
	{ id: 1, start: 4, end: 6.5, text: 'Italic and bold' },
	{ id: 2, start: 7, end: 9, text: 'Line one\nLine two' },
	{ id: 3, start: 12, end: 14, text: 'Final cue' },
];
