/**
 * Top progress bar of the flip view: position indicator that doubles as a
 * seek control — drag horizontally to jump across the book (e.g. word 100
 * to 300 in one gesture). Reports preview positions during the drag and
 * commits once on release.
 */
export interface WordFlipProgressCallbacks {
	/** Live position while dragging (or after a plain click). */
	onSeekPreview: (index: number) => void;
	/** Final position when the pointer is released. */
	onSeekCommit: (index: number) => void;
}

export class WordFlipProgressBar {
	readonly rootEl: HTMLElement;

	private readonly trackEl: HTMLElement;
	private readonly fillEl: HTMLElement;
	private readonly handleEl: HTMLElement;
	private activePointerId: number | null = null;

	constructor(
		parent: HTMLElement,
		private readonly callbacks: WordFlipProgressCallbacks,
	) {
		this.rootEl = parent.createDiv({ cls: 'dial-word-flip-progress' });
		this.trackEl = this.rootEl.createDiv({ cls: 'dial-word-flip-progress-track' });
		this.fillEl = this.trackEl.createDiv({ cls: 'dial-word-flip-progress-fill' });
		this.handleEl = this.trackEl.createDiv({ cls: 'dial-word-flip-progress-handle' });

		this.trackEl.addEventListener('pointerdown', this.onPointerDown);
		this.trackEl.addEventListener('pointermove', this.onPointerMove);
		this.trackEl.addEventListener('pointerup', this.onPointerUp);
		this.trackEl.addEventListener('pointercancel', this.onPointerCancel);
	}

	destroy(): void {
		this.trackEl.removeEventListener('pointerdown', this.onPointerDown);
		this.trackEl.removeEventListener('pointermove', this.onPointerMove);
		this.trackEl.removeEventListener('pointerup', this.onPointerUp);
		this.trackEl.removeEventListener('pointercancel', this.onPointerCancel);
	}

	private total = 0;
	private index = 0;

	/** Update the fill/handle to the current position. */
	setPosition(index: number, total: number): void {
		this.index = index;
		this.total = total;
		const ratio = total > 1 ? index / (total - 1) : 1;
		const percent = `${ratio * 100}%`;
		this.fillEl.style.width = percent;
		this.handleEl.style.left = percent;
	}

	private onPointerDown = (evt: PointerEvent): void => {
		if (this.activePointerId !== null) return;
		if (evt.pointerType === 'mouse' && evt.button !== 0) return;
		this.activePointerId = evt.pointerId;
		this.trackEl.setPointerCapture(evt.pointerId);
		this.trackEl.addClass('is-seeking');
		this.emitPreview(evt.clientX);
	};

	private onPointerMove = (evt: PointerEvent): void => {
		if (evt.pointerId !== this.activePointerId) return;
		this.emitPreview(evt.clientX);
	};

	private onPointerUp = (evt: PointerEvent): void => {
		if (evt.pointerId !== this.activePointerId) return;
		const index = this.indexAt(evt.clientX);
		this.endSeek(index);
		this.callbacks.onSeekCommit(index);
	};

	private onPointerCancel = (evt: PointerEvent): void => {
		if (evt.pointerId !== this.activePointerId) return;
		this.endSeek(this.index);
		this.callbacks.onSeekCommit(this.index);
	};

	private endSeek(index: number): void {
		if (this.activePointerId !== null) {
			this.trackEl.releasePointerCapture?.(this.activePointerId);
		}
		this.activePointerId = null;
		this.trackEl.removeClass('is-seeking');
		this.setPosition(index, this.total);
	}

	private emitPreview(clientX: number): void {
		const index = this.indexAt(clientX);
		this.setPosition(index, this.total);
		this.callbacks.onSeekPreview(index);
	}

	/** Map a pointer x coordinate to a clamped word index. */
	private indexAt(clientX: number): number {
		if (this.total <= 1) return 0;
		const rect = this.trackEl.getBoundingClientRect();
		if (rect.width <= 0) return 0;
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.min(this.total - 1, Math.round(ratio * (this.total - 1)));
	}
}
