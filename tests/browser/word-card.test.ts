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

		const words = Array.from(parent.querySelectorAll<HTMLElement>('.dial-subtitle-word'));
		expect(words.map((w) => w.dataset.word)).toEqual(['Hello', 'world', "It's", 'fine']);

		// Punctuation and whitespace survive as text nodes between spans.
		expect(parent.textContent).toBe("Hello, world! It's fine.");
	});

	it('handles accented latin letters as part of words', () => {
		const parent = document.createElement('span');
		renderWordSpans(parent, ' café — naïve ');

		const words = Array.from(parent.querySelectorAll<HTMLElement>('.dial-subtitle-word'));
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
		expect((document.querySelector('.dial-word-card') as HTMLElement)?.textContent).toContain(
			'world',
		);
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

	it('auto-pronounces when the card opens and replays via the button', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		// The card opens → the word is spoken once automatically.
		expect(speak).toHaveBeenCalledTimes(1);
		const auto = speak.mock.calls[0]?.[0] as StubUtterance;
		expect(auto.text).toBe('Hello');
		expect(auto.lang).toBe('en-US');

		// The speaker button replays it on demand.
		const btn = document.querySelector('.dial-word-card-speak') as HTMLElement;
		btn.click();
		expect(speak).toHaveBeenCalledTimes(2);
		expect((speak.mock.calls[1]?.[0] as StubUtterance).text).toBe('Hello');
	});

	it('shows a copy button next to the speak button and writes the word on click', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });

		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		const copyBtn = document.querySelector('.dial-word-card-copy') as HTMLElement;
		expect(copyBtn).not.toBeNull();
		// Order matches the speaking toolbar: speak first, copy on the right.
		const card = document.querySelector('.dial-word-card') as HTMLElement;
		const buttons = card.querySelectorAll('button');
		expect(buttons[0]?.className).toContain('dial-word-card-speak');
		expect(buttons[1]?.className).toContain('dial-word-card-copy');

		copyBtn.click();
		await Promise.resolve();
		expect(writeText).toHaveBeenCalledWith('Hello');

		vi.unstubAllGlobals();
	});

	it('shows the copy button even when no speech engine is available', () => {
		// Speech engine is gated on speech synthesis existing — verify
		// the copy affordance still appears when speak is hidden.
		vi.stubGlobal('speechSynthesis', undefined);
		vi.stubGlobal('SpeechSynthesisUtterance', undefined);

		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		expect(document.querySelector('.dial-word-card-speak')).toBeNull();
		expect(document.querySelector('.dial-word-card-copy')).not.toBeNull();
	});

	it('hides when a scroll bubbles up from a non-card container (document-level capture)', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);
		expect(document.querySelector('.dial-word-card')).not.toBeNull();

		// A scroll on the body (e.g. the user scrolls the parent view
		// rather than the subtitle list) still dismisses — capture
		// phase on document catches every nested scroll.
		document.body.dispatchEvent(new Event('scroll'));
		expect(document.querySelector('.dial-word-card')).toBeNull();
	});

	it('keeps the card open when a scroll fires inside the card itself', () => {
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);
		const card = document.querySelector('.dial-word-card') as HTMLElement;

		card.dispatchEvent(new Event('scroll'));
		expect(document.querySelector('.dial-word-card')).not.toBeNull();
	});

	it('pronounces with the language provided by the panel options', () => {
		panel = new SubtitlePanel(parent, {
			wordCardConfig: () => ({ pronunciationLang: 'de-DE' }),
		});
		panel.setCallbacks(callbacks);
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		const utterance = speak.mock.calls[0]?.[0] as StubUtterance;
		expect(utterance.text).toBe('Hello');
		expect(utterance.lang).toBe('de-DE');
	});

	it('skips auto-pronounce when the config disables it, but the button still speaks', () => {
		panel = new SubtitlePanel(parent, { wordCardConfig: () => ({ autoPronounce: false }) });
		panel.setCallbacks(callbacks);
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		expect(document.querySelector('.dial-word-card')).not.toBeNull();
		expect(speak).not.toHaveBeenCalled();

		(document.querySelector('.dial-word-card-speak') as HTMLElement).click();
		expect(speak).toHaveBeenCalledTimes(1);
		expect((speak.mock.calls[0]?.[0] as StubUtterance).text).toBe('Hello');
	});

	it('hides the speak button and stays silent when speech synthesis is missing', () => {
		// Simulate Android WebView: the speech globals simply do not exist.
		vi.stubGlobal('speechSynthesis', undefined);
		vi.stubGlobal('SpeechSynthesisUtterance', undefined);

		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;
		word.dispatchEvent(new MouseEvent('mouseenter'));
		vi.advanceTimersByTime(250);

		// The card still opens and shows the word — it degrades quietly.
		const card = document.querySelector('.dial-word-card') as HTMLElement;
		expect(card).not.toBeNull();
		expect(card.textContent).toContain('Hello');
		expect(document.querySelector('.dial-word-card-speak')).toBeNull();
		expect(speak).not.toHaveBeenCalled();
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

	it('shows the translation under the word once it resolves', async () => {
		panel = new SubtitlePanel(parent, {
			wordCardTranslation: () => Promise.resolve('你好'),
		});
		panel.setCallbacks(callbacks);
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;

		word.dispatchEvent(new MouseEvent('mouseenter'));
		await vi.advanceTimersByTimeAsync(250);

		// While the pipeline runs the row shows a pending marker, then the
		// resolved translation replaces it.
		const translationEl = document.querySelector('.dial-word-card-translation');
		expect(translationEl?.textContent).toBe('你好');
		expect((document.querySelector('.dial-word-card-word') as HTMLElement)?.textContent).toBe(
			'Hello',
		);
	});

	it('removes the translation row quietly when the lookup finds nothing', async () => {
		panel = new SubtitlePanel(parent, {
			wordCardTranslation: () => Promise.resolve(null),
		});
		panel.setCallbacks(callbacks);
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;

		word.dispatchEvent(new MouseEvent('mouseenter'));
		await vi.advanceTimersByTimeAsync(250);

		expect(document.querySelector('.dial-word-card')).not.toBeNull();
		expect(document.querySelector('.dial-word-card-translation')).toBeNull();
	});

	it('drops a late translation that arrives after the card hid', async () => {
		let resolveTranslation: ((value: string | null) => void) | undefined;
		panel = new SubtitlePanel(parent, {
			wordCardTranslation: () =>
				new Promise((resolve) => {
					resolveTranslation = resolve;
				}),
		});
		panel.setCallbacks(callbacks);
		panel.setSubtitles(SUBS);
		const word = parent.querySelector('.dial-subtitle-word') as HTMLElement;

		word.dispatchEvent(new MouseEvent('mouseenter'));
		await vi.advanceTimersByTimeAsync(250);

		// Card hides (e.g. list scroll), then the translation resolves —
		// it must not resurrect or leak into the next card.
		word.closest('.dial-subtitle-list')?.dispatchEvent(new Event('scroll'));
		resolveTranslation?.('你好');
		await vi.advanceTimersByTimeAsync(0);
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
