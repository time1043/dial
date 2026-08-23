import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This suite exercises the mobile word card path (tap to toggle, outside
// tap to dismiss). The shared obsidian-stub wired via the vitest alias
// hardcodes Platform.isMobile: false, so override the whole module here
// (vi.mock takes precedence over the resolve.alias, per vitest.config.ts).
vi.mock('obsidian', () => ({
	Notice: class {},
	setIcon: () => {},
	Platform: { isMobile: true, isDesktop: false },
}));

import type { Subtitle } from '@/types';

import { SubtitlePanel } from '@/ui/subtitle-panel';

const SUBS: Subtitle[] = [{ id: 0, start: 0, end: 2, text: 'Hello world' }];

class StubUtterance {
	lang = '';
	constructor(public text: string) {}
}

describe('WordCard (mobile)', () => {
	let parent: HTMLElement;
	let panel: SubtitlePanel;
	let speak: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		document.body.innerHTML = '';
		speak = vi.fn();
		vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
		vi.stubGlobal('SpeechSynthesisUtterance', StubUtterance);
		parent = document.createElement('div');
		document.body.appendChild(parent);
		panel = new SubtitlePanel(parent);
		panel.setSubtitles(SUBS);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('toggles the card on word tap and dismisses on an outside tap', () => {
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		expect(document.querySelector('.dial-word-card')).toBeNull();

		word.click();
		expect(document.querySelector('.dial-word-card')).not.toBeNull();

		// Tapping the same word again closes the card.
		word.click();
		expect(document.querySelector('.dial-word-card')).toBeNull();

		// Tapping outside dismisses it too.
		word.click();
		document.body.click();
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});

	it('auto-pronounces on tap and replays from the button without dismissing', () => {
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.click();

		// Opening the card speaks the word once automatically.
		expect(speak).toHaveBeenCalledTimes(1);
		const auto = speak.mock.calls[0]?.[0] as StubUtterance;
		expect(auto.text).toBe('Hello');
		expect(auto.lang).toBe('en-US');

		const btn = document.querySelector('.dial-word-card-speak') as HTMLElement;
		btn.click();
		expect(speak).toHaveBeenCalledTimes(2);
		expect(document.querySelector('.dial-word-card')).not.toBeNull();
	});

	it('shows a copy button after the speak button on mobile', () => {
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.click();
		const card = document.querySelector('.dial-word-card') as HTMLElement;
		const buttons = card.querySelectorAll('button');
		expect(buttons[0]?.className).toContain('dial-word-card-speak');
		expect(buttons[1]?.className).toContain('dial-word-card-copy');
	});

	it('dismisses on document scroll and on touchmove outside the card', () => {
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.click();
		expect(document.querySelector('.dial-word-card')).not.toBeNull();

		// A scroll anywhere in the document dismisses — covers swipes
		// that originate outside the subtitle list (e.g. the leaf view).
		document.body.dispatchEvent(new Event('scroll'));
		expect(document.querySelector('.dial-word-card')).toBeNull();

		// Open again, this time simulate a touch swipe.
		word.click();
		expect(document.querySelector('.dial-word-card')).not.toBeNull();
		document.body.dispatchEvent(new Event('touchmove'));
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});

	it('keeps the card open when touch scroll fires inside the card itself', () => {
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.click();
		const card = document.querySelector('.dial-word-card') as HTMLElement;
		card.dispatchEvent(new Event('touchmove'));
		expect(document.querySelector('.dial-word-card')).not.toBeNull();
	});
});
