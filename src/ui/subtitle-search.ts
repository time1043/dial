import { setIcon } from 'obsidian';

import type { Subtitle } from '@/types';

export interface SubtitleSearchDeps {
	/** Returns the current subtitle array (may change after load). */
	getSubtitles: () => Subtitle[];
	/** Returns the DOM element map for each subtitle (used to show/hide rows). */
	getSubtitleEls: () => Map<number, HTMLElement>;
	/** Called when the mobile overlay state changes (e.g. to blur the input). */
	onOverlayChange?: () => void;
}

export interface SubtitleSearchOptions {
	/** The host subtitle panel element; receives the mobile search overlay class. */
	panelEl: HTMLElement;
	/** The parent element for the search bar (created inside this element). */
	parent: HTMLElement;
	deps: SubtitleSearchDeps;
}

/**
 * Self-contained subtitle search/filter controller.
 *
 * Owns the search input, clear button, match counter, empty-state element,
 * and the mobile full-screen search overlay. The host panel supplies the
 * subtitle data and element map via {@link SubtitleSearchDeps}.
 *
 * Extracted from SubtitlePanel to keep each UI concern under 300 lines.
 */
export class SubtitleSearchController {
	private readonly input: HTMLInputElement;
	private readonly clearBtn: HTMLElement;
	private readonly countEl: HTMLElement;
	private readonly emptyEl: HTMLElement;

	private searchText = '';
	private mobileLayoutAbortController: AbortController | null = null;

	private readonly containerEl: HTMLElement;
	private readonly panelEl: HTMLElement;
	private readonly deps: SubtitleSearchDeps;

	constructor(options: SubtitleSearchOptions) {
		this.deps = options.deps;
		this.panelEl = options.panelEl;
		this.containerEl = options.parent.createDiv({ cls: 'dial-subtitle-search' });
		this.input = this.buildInput();
		this.clearBtn = this.buildClearButton();
		this.countEl = this.containerEl.createSpan({
			cls: 'dial-subtitle-search-count',
			text: '',
		});
		this.emptyEl = options.parent.createDiv({
			cls: 'dial-subtitle-empty dial-subtitle-hidden',
			text: 'No matching subtitles',
		});
	}

	/** Focus the search input and select its content for quick retyping. */
	focus(): void {
		this.input.focus();
		this.input.select();
	}

	/**
	 * Clear the search query and restore the full list.
	 * Does not move focus on its own; the clear button calls this and then
	 * the caller may refocus the input.
	 */
	clear(): void {
		this.input.value = '';
		this.searchText = '';
		this.applyFilter();
	}

	/** Blur the search input (used on mobile after tapping a result). */
	blurInput(): void {
		this.input.blur();
	}

	/** Returns the raw text the user has typed into the search box. */
	getQuery(): string {
		return this.searchText;
	}

	/**
	 * Restore a previously entered query — used when the host panel rebuilds
	 * and recreates this controller. Updates the input value and re-applies the
	 * filter immediately so the user's active filter is not lost.
	 */
	setQuery(text: string): void {
		this.searchText = text;
		this.input.value = text;
		this.applyFilter();
	}

	/** True while the mobile full-screen search overlay is active. */
	isMobileOverlayActive(): boolean {
		return this.panelEl.hasClass('dial-mobile-search-overlay');
	}

	/** Clean up all focus/blur listeners and restore the normal layout. */
	detachMobileLayout(): void {
		this.mobileLayoutAbortController?.abort();
		this.mobileLayoutAbortController = null;
		this.endMobileSearchLayout();
	}

	/** Re-apply the current search filter (called after subtitles are re-rendered). */
	applyFilter(): void {
		const query = this.searchText.trim().toLowerCase();
		let matches = 0;
		const subtitles = this.deps.getSubtitles();
		const subtitleEls = this.deps.getSubtitleEls();

		for (const sub of subtitles) {
			const el = subtitleEls.get(sub.id);
			if (!el) continue;
			const hit = query === '' || sub.text.toLowerCase().includes(query);
			el.toggleClass('dial-subtitle-hidden', !hit);
			if (hit) matches++;
		}

		this.countEl.textContent = query === '' ? '' : `${matches}/${subtitles.length}`;
		this.clearBtn.toggleClass('dial-subtitle-hidden', query === '');

		const showEmpty = query !== '' && matches === 0 && subtitles.length > 0;
		this.emptyEl.toggleClass('dial-subtitle-hidden', !showEmpty);
	}

	private buildInput(): HTMLInputElement {
		const input = this.containerEl.createEl('input', {
			cls: 'dial-subtitle-search-input',
			type: 'text',
			attr: {
				placeholder: 'Search subtitles',
				'aria-label': 'Search subtitles',
				spellcheck: 'false',
			},
		});

		input.addEventListener('input', () => {
			this.searchText = input.value;
			this.applyFilter();
		});

		// Mobile-only: while the search box is focused, pin the panel to the
		// viewport as a full-height overlay so the soft keyboard can only
		// overlap its bottom edge. On desktop this is a no-op.
		this.mobileLayoutAbortController = new AbortController();
		input.addEventListener('focus', () => this.beginMobileSearchLayout(), {
			signal: this.mobileLayoutAbortController.signal,
		});
		input.addEventListener('blur', () => this.endMobileSearchLayout(), {
			signal: this.mobileLayoutAbortController.signal,
		});

		return input;
	}

	private buildClearButton(): HTMLElement {
		const btn = this.containerEl.createEl('button', {
			cls: 'dial-subtitle-search-clear dial-subtitle-hidden',
			attr: { 'aria-label': 'Clear search' },
		});
		setIcon(btn, 'x');
		btn.addEventListener('click', () => {
			this.clear();
			// Intentionally do NOT refocus the input: on mobile this would
			// re-pop the soft keyboard right after the user dismissed it to
			// read results. On desktop, the user can press s to refocus or
			// click the input again.
		});
		return btn;
	}

	/**
	 * Mobile-only: lift the whole subtitle panel out of the layout flow and
	 * pin it to the viewport. See the design comment in the original code.
	 */
	private beginMobileSearchLayout(): void {
		const closest = this.input.closest('.dial-video-container');
		if (!(closest instanceof HTMLElement)) return;

		const rect = this.panelEl.getBoundingClientRect();
		if (rect.top > 0) {
			this.panelEl.style.top = `${rect.top}px`;
		}
		this.panelEl.addClass('dial-mobile-search-overlay');
		this.deps.onOverlayChange?.();
	}

	private endMobileSearchLayout(): void {
		if (!this.isMobileOverlayActive()) return;
		this.panelEl.removeClass('dial-mobile-search-overlay');
		this.panelEl.style.removeProperty('top');
		this.deps.onOverlayChange?.();
	}
}
