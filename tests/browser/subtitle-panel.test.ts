import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Subtitle } from '@/types';

import { SubtitlePanel, type SubtitlePanelCallbacks } from '@/ui/subtitle-panel';

const SUBS: Subtitle[] = [
	{ id: 0, start: 0, end: 2, text: 'first line' },
	{ id: 1, start: 3, end: 5, text: 'second line' },
	{ id: 2, start: 6, end: 8, text: 'third line' },
];

/** Build a fully-mocked callback set so setSpeed/setABLoopState stay side-effect-free. */
function makeCallbacks(): SubtitlePanelCallbacks {
	return {
		onSubtitleClick: vi.fn(),
		onSetA: vi.fn().mockReturnValue({ a: 3, b: null, active: false }),
		onSetB: vi.fn().mockReturnValue({ a: 3, b: 5, active: true }),
		onClearAB: vi.fn().mockReturnValue({ a: null, b: null, active: false }),
		onGetCurrentTime: vi.fn().mockReturnValue(0),
		onTogglePlay: vi.fn(),
		onSpeedChange: vi.fn(),
	};
}

describe('SubtitlePanel.setVisibility', () => {
	let parent: HTMLElement;
	let panel: SubtitlePanel;

	beforeEach(() => {
		document.body.innerHTML = '';
		parent = document.createElement('div');
		document.body.appendChild(parent);
		panel = new SubtitlePanel(parent, {
			visibility: { abLoop: true, speed: true, search: true },
		});
		panel.setCallbacks(makeCallbacks());
	});

	it('renders every control section by default', () => {
		panel.setSubtitles(SUBS);
		expect(parent.querySelector('.dial-ab-controls')).not.toBeNull();
		expect(parent.querySelector('.dial-speed-controls')).not.toBeNull();
		expect(parent.querySelector('.dial-subtitle-search')).not.toBeNull();
		expect(parent.querySelectorAll('.dial-subtitle-item').length).toBe(3);
	});

	it('drops the AB / speed / search sections when their flags flip to false', () => {
		panel.setSubtitles(SUBS);
		panel.setVisibility({ abLoop: false, speed: false, search: false });

		expect(parent.querySelector('.dial-ab-controls')).toBeNull();
		expect(parent.querySelector('.dial-speed-controls')).toBeNull();
		expect(parent.querySelector('.dial-subtitle-search')).toBeNull();
		// The subtitle list survives the rebuild.
		expect(parent.querySelectorAll('.dial-subtitle-item').length).toBe(3);
	});

	it('rehydrates the active line and AB loop highlight after rebuild', () => {
		panel.setSubtitles(SUBS);
		panel.setCurrentSubtitle(1);
		panel.setABLoopState({ a: 3, b: 5, active: true });

		panel.setVisibility({ abLoop: true, speed: false, search: false });

		const active = parent.querySelector('.dial-subtitle-active');
		expect(active).not.toBeNull();
		expect(active?.textContent).toContain('second line');
		// Only sub id 1 (3–5) falls inside the A–B window.
		expect(parent.querySelectorAll('.dial-subtitle-looped').length).toBe(1);
	});

	it('restores the playback rate onto the rebuilt speed slider', () => {
		panel.setSubtitles(SUBS);
		panel.setSpeed(2);

		panel.setVisibility({ abLoop: false, speed: true, search: false });

		const slider = parent.querySelector('.dial-speed-slider') as HTMLInputElement;
		expect(slider.value).toBe('2');
		expect((parent.querySelector('.dial-speed-label') as HTMLElement).textContent).toBe('2x');
	});

	it('re-creates sections when flags flip back to true', () => {
		panel.setSubtitles(SUBS);
		panel.setVisibility({ abLoop: false, speed: false, search: false });
		expect(parent.querySelector('.dial-ab-controls')).toBeNull();

		panel.setVisibility({ abLoop: true, speed: true, search: true });
		expect(parent.querySelector('.dial-ab-controls')).not.toBeNull();
		expect(parent.querySelector('.dial-speed-controls')).not.toBeNull();
		expect(parent.querySelector('.dial-subtitle-search')).not.toBeNull();
	});

	it('does not throw when rebuilding an empty panel', () => {
		expect(() =>
			panel.setVisibility({ abLoop: false, speed: false, search: false }),
		).not.toThrow();
		expect(parent.querySelectorAll('.dial-subtitle-item').length).toBe(0);
	});

	it('preserves the active search query across a rebuild', () => {
		panel.setSubtitles(SUBS);
		const input = parent.querySelector('.dial-subtitle-search-input') as HTMLInputElement;
		input.value = 'second';
		input.dispatchEvent(new Event('input'));

		// Toggle speed off while keeping search on: the rebuild must keep the
		// typed query and the filtered result set, not wipe the user's filter.
		panel.setVisibility({ abLoop: true, speed: false, search: true });

		const newInput = parent.querySelector('.dial-subtitle-search-input') as HTMLInputElement;
		expect(newInput.value).toBe('second');
		// Only the matching line stays visible after the filter is re-applied.
		expect(
			parent.querySelectorAll('.dial-subtitle-item:not(.dial-subtitle-hidden)').length,
		).toBe(1);
		expect(parent.querySelector('.dial-subtitle-hidden')).not.toBeNull();
	});
});
