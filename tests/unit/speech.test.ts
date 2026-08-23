import { describe, expect, it } from 'vitest';

import { isSpeechSynthesisAvailable, speakWord } from '@/utils/speech';

describe('isSpeechSynthesisAvailable', () => {
	it('is false in the node environment (no speech APIs at all)', () => {
		// The unit project runs in node: no speechSynthesis global exists,
		// so the typeof-based guard must report unavailable.
		expect(isSpeechSynthesisAvailable()).toBe(false);
	});
});

describe('speakWord', () => {
	it('returns silently in node (no speech APIs) when notify is off', () => {
		expect(() => speakWord('abandon', 'en-US', false)).not.toThrow();
	});

	it('does nothing for an empty word', () => {
		expect(() => speakWord('', 'en-US')).not.toThrow();
	});
});
