import { describe, expect, it } from 'vitest';

import { speechStatusDescription } from '@/settings';
import { isSpeechSynthesisAvailable } from '@/utils/speech';

describe('isSpeechSynthesisAvailable', () => {
	it('is false in the node environment (no speech APIs at all)', () => {
		// The unit project runs in node: no speechSynthesis global exists,
		// so the typeof-based guard must report unavailable.
		expect(isSpeechSynthesisAvailable()).toBe(false);
	});
});

describe('speechStatusDescription', () => {
	it('announces availability when detected', () => {
		expect(speechStatusDescription(true)).toContain('Available');
	});

	it('explains the Android degradation when missing', () => {
		const desc = speechStatusDescription(false);
		expect(desc).toContain('Not available');
		expect(desc).toContain('speaker button');
	});
});
