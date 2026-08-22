import { describe, expect, it } from 'vitest';

import { speechStatusText } from '@/settings';
import { isSpeechSynthesisAvailable, speakWord } from '@/utils/speech';

describe('isSpeechSynthesisAvailable', () => {
	it('is false in the node environment (no speech APIs at all)', () => {
		// The unit project runs in node: no speechSynthesis global exists,
		// so the typeof-based guard must report unavailable.
		expect(isSpeechSynthesisAvailable()).toBe(false);
	});
});

describe('speechStatusText', () => {
	it('signals the transient checking state during re-detection', () => {
		expect(speechStatusText('checking')).toContain('Detecting');
	});

	it('announces availability when detected', () => {
		expect(speechStatusText('available')).toContain('Available');
	});

	it('explains the Android degradation when missing', () => {
		const text = speechStatusText('unavailable');
		expect(text).toContain('Not available');
		expect(text).toContain('speaker');
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
