import { describe, expect, it } from 'vitest';

import { formatTime } from '@/utils/time';

describe('formatTime', () => {
	it('formats seconds under an hour as M:SS', () => {
		expect(formatTime(0)).toBe('0:00');
		expect(formatTime(5)).toBe('0:05');
		expect(formatTime(65)).toBe('1:05');
		expect(formatTime(599)).toBe('9:59');
	});

	it('formats hours as H:MM:SS', () => {
		expect(formatTime(3600)).toBe('1:00:00');
		expect(formatTime(3661)).toBe('1:01:01');
		expect(formatTime(36000)).toBe('10:00:00');
	});

	it('floors fractional seconds', () => {
		expect(formatTime(5.9)).toBe('0:05');
		expect(formatTime(65.99)).toBe('1:05');
		expect(formatTime(3661.5)).toBe('1:01:01');
	});
});
