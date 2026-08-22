import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Subtitle } from '@/types';

import { SubtitlePanel, type SubtitlePanelCallbacks } from '@/ui/subtitle-panel';
import { WordCard, renderWordSpans } from '@/ui/word-card';

const SUBS: Subtitle[] = [
	{ id: 0, start: 0, end: 2, text: "Hello, world! It's fine." },
	{ id: 1, start: 3, end: 5, text: ' café — naïve ' },
];

/** Deterministic SpeechSynthesisUtterance stand-in for the browser env. */
class StubUtterance {
	lang = '';
	constructor(public text: string) {}
}

function makeCallbacks(): SubtitlePanelCallbacks {
	return {
		onSubtitleClick: vi.fn(),
		onSetA: vi.fn().mockReturnValue({ a: null, b: null, active: false }),
		onSetB: vi.fn().mockReturnValue({ a: null, b: null, active: false }),
		onClearAB: vi.fn().mockReturnValue({ a: null, b: null, active: false }),
		onGetCurrentTime: vi.fn().mockReturnValue(0),
		onTogglePlay: vi.fn(),
		onSpeedChange: vi.fn(),
	};
}

describe('renderWordSpans', () => {
	it('wraps latin words in spans and keeps punctuation as plain text', () => {
		const parent = document.createElement('span');
		renderWordSpans(parent, "Hello, world! It's fine.");

		const words = Array.from(
			parent.querySelectorAll<HTMLElement>('.dial-subtitle-word'),
		);
		expect(words.map((w) => w.dataset.word)).toEqual(['Hello', 'world', "It's", 'fine']);

		// Punctuation and whitespace survive as text nodes between spans.
		expect(parent.textContent).toBe("Hello, world! It's fine.");
	});

	it('handles accented latin letters as part of words', () => {
		const parent = document.createElement('span');
		renderWordSpans(parent, ' café — naïve ');

		const words = Array.from(
			parent.querySelectorAll<HTMLElement>('.dial-subtitle-word'),
		);
		expect(words.map((w) => w.dataset.word)).toEqual(['café', 'naïve']);
		expect(parent.textContent).toBe(' café — naïve ');
	});
});

describe('WordCard', () => {
	let parent: HTMLElement;
	let panel: SubtitlePanel;
	let callbacks: SubtitlePanelCallbacks;
	let speak: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		document.body.innerHTML = '';
		speak = vi.fn();
		vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
		vi.stubGlobal('SpeechSynthesisUtterance', StubUtterance);
		parent = document.createElement('div');
		document.body.appendChild(parent);
		panel = new SubtitlePanel(parent);
		callbacks = makeCallbacks();
		panel.setCallbacks(callbacks);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('does not render a card before any word is hovered', () => {
		panel.setSubtitles(SUBS);
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});

	it('shows the word after the hover delay and hides on mouseleave', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;

		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(249);
		expect(document.querySelector('.dial-word-card')).toBeNull();

		vi.advanceTimersByTime(1);
		const card = document.querySelector('.dial-word-card') as HTMLElement;
		expect(card).not.toBeNull();
		expect(card.textContent).toContain('Hello');

		word.dispatchEvent(new MouseEvent('mouseleave'));
		vi.advanceTimersByTime(200);
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});

	it('shows the card immediately once the show delay already elapsed on another word', () => {
		panel.setSubtitles(SUBS);
		const first = parent.querySelectorAll('.dial-subtitle-word')[0] as HTMLElement;
		const second = parent.querySelectorAll('.dial-subtitle-word')[1] as HTMLElement;

		first.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);
		second.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);
		expect(
			(document.querySelector('.dial-word-card') as HTMLElement)?.textContent,
		).toContain('world');
	});

	it('keeps the card open while the pointer rests on the card itself', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		const card = document.querySelector('.dial-word-card') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseleave'));
		card.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(500);
		expect(document.querySelector('.dial-word-card')).not.toBeNull();

		card.dispatchEvent(new MouseEvent('mouseleave'));
		vi.advanceTimersByTime(200);
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});

	it('pronounces the word when the speak button is clicked', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		const btn = document.querySelector('.dial-word-card-speak') as HTMLElement;
		btn.click();

		expect(speak).toHaveBeenCalledTimes(1);
		const utterance = speak.mock.calls[0]?.[0] as StubUtterance;
		expect(utterance.text).toBe('Hello');
		expect(utterance.lang).toBe('en-US');
	});

	it('pronounces with the language provided by the panel options', () => {
		panel = new SubtitlePanel(parent, undefined, () => 'de-DE');
		panel.setCallbacks(callbacks);
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		(document.querySelector('.dial-word-card-speak') as HTMLElement).click();
		const utterance = speak.mock.calls[0]?.[0] as StubUtterance;
		expect(utterance.lang).toBe('de-DE');
	});

	it('hides when the subtitle list scrolls', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;

		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);
		expect(document.querySelector('.dial-word-card')).not.toBeNull();

		parent.querySelector('.dial-subtitle-list')?.dispatchEvent(new Event('scroll'));
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});

	it('does not seek the video when a word is clicked', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;

		word.click();
		expect(callbacks.onSubtitleClick).not.toHaveBeenCalled();
	});

	it('still seeks when the line is clicked outside any word', () => {
		panel.setSubtitles(SUBS);
		const item = parent.querySelector('.dial-subtitle-item') as HTMLElement;

		item.click();
		expect(callbacks.onSubtitleClick).toHaveBeenCalledTimes(1);
	});

	it('hide() clears an open card', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		new WordCard().hide();
		expect(document.querySelector('.dial-word-card')).not.toBeNull();

		// The panel's own card instance is what the scroll handler clears.
		parent.querySelector('.dial-subtitle-list')?.dispatchEvent(new Event('scroll'));
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});
});
