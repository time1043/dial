import { describe, expect, it } from 'vitest';

import type { Subtitle } from '@/types';

import { getJumpTarget } from '@/modules/subtitle-navigator/subtitle-navigator';

const subs: Subtitle[] = [
	{ id: 0, start: 1, end: 3, text: 'a' },
	{ id: 1, start: 5, end: 7, text: 'b' },
	{ id: 2, start: 10, end: 12, text: 'c' },
];

describe('getJumpTarget', () => {
	it('returns null for an empty subtitle list', () => {
		expect(getJumpTarget([], 5, 1)).toBeNull();
	});

	it('jumps forward to the next subtitle when inside one', () => {
		expect(getJumpTarget(subs, 2, 1)).toBe(subs[1]);
	});

	it('jumps backward to the previous subtitle when inside one', () => {
		expect(getJumpTarget(subs, 6, -1)).toBe(subs[0]);
	});

	it('falls back to the nearest previous subtitle when between cues', () => {
		// 4 is between sub0 (1..3) and sub1 (5..7); nearest previous is sub0.
		expect(getJumpTarget(subs, 4, 1)).toBe(subs[1]);
		expect(getJumpTarget(subs, 4, -1)).toBe(subs[0]);
	});

	it('clamps forward jump at the last subtitle', () => {
		// 15 is past the last cue; forward stays on the last subtitle.
		expect(getJumpTarget(subs, 15, 1)).toBe(subs[2]);
	});

	it('clamps backward jump when before the first subtitle', () => {
		// 0 is before the first cue; backward clamps to the first subtitle.
		expect(getJumpTarget(subs, 0, -1)).toBe(subs[0]);
		expect(getJumpTarget(subs, 0, 1)).toBe(subs[0]);
	});

	it('returns the same subtitle when jumping from the only matching cue outward', () => {
		expect(getJumpTarget(subs, 11, 1)).toBe(subs[2]);
	});
});
