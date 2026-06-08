import type { Subtitle } from '@/types';

import { formatTime } from '@/utils/time';

function formatSpeed(rate: number): string {
	return rate % 1 === 0 ? `${rate}x` : `${rate.toFixed(2)}x`;
}

export interface TypeSubtitlePanelCallbacks {
	onClick: (index: number) => void;
	onSpeedChange: (rate: number) => void;
}

/**
 * Subtitle list for type mode.
 * - Each row shows time + optionally text (only after sentence completed).
 * - Click navigates the type page, does not seek video.
 * - Speed slider at top, no AB loop controls.
 */
export class TypeSubtitlePanel {
	readonly containerEl: HTMLElement;

	private subtitles: Subtitle[] = [];
	private currentIndex = 0;
	private revealed: Set<number> = new Set();
	private rowEls: HTMLElement[] = [];
	private textEls: HTMLElement[] = [];
	private speedSlider!: HTMLInputElement;
	private speedLabel!: HTMLElement;
	private listEl: HTMLElement | null = null;
	private playbackRate = 1;

	private callbacks: TypeSubtitlePanelCallbacks | null = null;

	constructor(parent: HTMLElement) {
		this.containerEl = parent.createDiv({ cls: 'dial-type-subtitle-panel' });
		this.buildUI();
	}

	setCallbacks(cb: TypeSubtitlePanelCallbacks): void {
		this.callbacks = cb;
	}

	hasData(): boolean {
		return this.subtitles.length > 0;
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
		this.renderList();
	}

	setCurrentIndex(index: number): void {
		if (index === this.currentIndex) return;

		const prev = this.rowEls[this.currentIndex];
		prev?.removeClass('dial-subtitle-active');

		this.currentIndex = index;
		const next = this.rowEls[index];
		if (next) {
			next.addClass('dial-subtitle-active');
			next.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	/** Mark a sentence as completed — reveal its correct text. */
	revealSentence(index: number): void {
		if (this.revealed.has(index)) return;
		this.revealed.add(index);

		const textEl = this.textEls[index];
		if (textEl && this.subtitles[index]) {
			textEl.textContent = this.subtitles[index].text;
			textEl.removeClass('dial-type-subtitle-hidden');
		}
	}

	getCurrentIndex(): number {
		return this.currentIndex;
	}

	getRevealed(): number[] {
		return [...this.revealed];
	}

	getSubtitles(): Subtitle[] {
		return this.subtitles;
	}

	changeSpeed(delta: number): void {
		const newRate = Math.max(0.25, Math.min(3, this.playbackRate + delta));
		this.setSpeed(newRate);
	}

	setSpeed(rate: number): void {
		this.playbackRate = rate;
		this.speedSlider.value = String(rate);
		this.speedLabel.textContent = formatSpeed(rate);
		this.callbacks?.onSpeedChange(rate);
	}

	// ── UI ───────────────────────────────────────────────────────

	private buildUI(): void {
		// Speed controls
		const speedEl = this.containerEl.createDiv({ cls: 'dial-speed-controls' });

		this.speedLabel = speedEl.createSpan({
			cls: 'dial-speed-label',
			text: '1x',
		});

		this.speedSlider = speedEl.createEl('input', {
			cls: 'dial-speed-slider',
			type: 'range',
			attr: { min: '0.25', max: '3', step: '0.25', value: '1' },
		});
		this.speedSlider.addEventListener('input', () => {
			const rate = parseFloat(this.speedSlider.value);
			this.playbackRate = rate;
			this.speedLabel.textContent = formatSpeed(rate);
			this.callbacks?.onSpeedChange(rate);
		});

		// Subtitle list
		this.listEl = this.containerEl.createDiv({ cls: 'dial-subtitle-list' });
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		this.rowEls = [];
		this.textEls = [];

		for (let i = 0; i < this.subtitles.length; i++) {
			const sub = this.subtitles[i]!;
			const revealed = this.revealed.has(i);

			const row = this.listEl.createDiv({
				cls: `dial-subtitle-item${i === this.currentIndex ? ' dial-subtitle-active' : ''}`,
			});

			row.createSpan({
				cls: 'dial-subtitle-time',
				text: formatTime(sub.start),
			});

			const textEl = row.createSpan({
				cls: `dial-type-subtitle-text${revealed ? '' : ' dial-type-subtitle-hidden'}`,
			});
			if (revealed) {
				textEl.textContent = sub.text;
			}
			this.textEls.push(textEl);

			const idx = i;
			row.addEventListener('click', () => {
				this.callbacks?.onClick(idx);
			});

			this.rowEls.push(row);
		}
	}
}
