/**
 * Pointer-based vertical drag detector (touch and mouse alike).
 *
 * Owns pointer math only: axis locking, finger tracking and the
 * commit-vs-springback decision (distance threshold or fling velocity).
 * The host positions cards via the callbacks.
 */

/** Drag distance (px) that locks the gesture to the vertical axis. */
const AXIS_LOCK_PX = 8;
/** Drag distance as a fraction of the element height that commits. */
const COMMIT_DISTANCE_RATIO = 0.25;
/** Fingertip velocity in px/ms that commits regardless of distance. */
const COMMIT_FLING_VELOCITY = 0.5;
/** Movement (px) after which a following click is considered part of the
 *  drag and must not toggle the card reveal. */
const CLICK_SUPPRESS_PX = 6;

export type DragCommitDirection = 1 | -1 | 0;

export interface VerticalDragCallbacks {
	/** Continuous finger offset in px (negative = dragging upward). */
	onDragMove: (dy: number) => void;
	/**
	 * Gesture finished. `commit` is the detector's suggestion (1 = next,
	 * -1 = previous, 0 = spring back); the host may still override it
	 * (e.g. at book boundaries).
	 */
	onDragEnd: (dy: number, commit: DragCommitDirection) => void;
}

export class VerticalDragDetector {
	private activePointerId: number | null = null;
	private startY = 0;
	private startX = 0;
	private axisLocked: 'vertical' | 'horizontal' | null = null;
	private lastDy = 0;
	private suppressClick = false;
	private velocitySamples: { t: number; y: number }[] = [];

	constructor(
		private readonly el: HTMLElement,
		private readonly callbacks: VerticalDragCallbacks,
	) {
		el.addEventListener('pointerdown', this.onPointerDown);
		el.addEventListener('pointermove', this.onPointerMove);
		el.addEventListener('pointerup', this.onPointerUp);
		el.addEventListener('pointercancel', this.onPointerCancel);
		// Capture-phase click swallow after a real drag so the card's own
		// click (reveal toggle) does not fire.
		el.addEventListener('click', this.onClick, true);
	}

	destroy(): void {
		this.el.removeEventListener('pointerdown', this.onPointerDown);
		this.el.removeEventListener('pointermove', this.onPointerMove);
		this.el.removeEventListener('pointerup', this.onPointerUp);
		this.el.removeEventListener('pointercancel', this.onPointerCancel);
		this.el.removeEventListener('click', this.onClick, true);
	}

	private onPointerDown = (evt: PointerEvent): void => {
		if (this.activePointerId !== null) return;
		if (evt.pointerType === 'mouse' && evt.button !== 0) return;
		this.activePointerId = evt.pointerId;
		this.startX = evt.clientX;
		this.startY = evt.clientY;
		this.axisLocked = null;
		this.lastDy = 0;
		this.suppressClick = false;
		this.velocitySamples = [{ t: evt.timeStamp, y: evt.clientY }];
		this.el.setPointerCapture(evt.pointerId);
	};

	private onPointerMove = (evt: PointerEvent): void => {
		if (evt.pointerId !== this.activePointerId) return;

		const dx = evt.clientX - this.startX;
		const dy = evt.clientY - this.startY;

		// Any directional movement beyond a few px counts as a drag, so the
		// trailing click (reveal toggle / pronounce) must be swallowed —
		// horizontal flicks included.
		if (Math.max(Math.abs(dx), Math.abs(dy)) > CLICK_SUPPRESS_PX) {
			this.suppressClick = true;
		}

		if (this.axisLocked === null) {
			if (Math.abs(dy) >= AXIS_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
				this.axisLocked = 'vertical';
			} else if (Math.abs(dx) >= AXIS_LOCK_PX) {
				this.axisLocked = 'horizontal';
				this.reset();
				return;
			} else {
				return;
			}
		}
		if (this.axisLocked !== 'vertical') return;

		this.lastDy = dy;
		this.velocitySamples.push({ t: evt.timeStamp, y: evt.clientY });
		if (this.velocitySamples.length > 8) this.velocitySamples.shift();
		this.callbacks.onDragMove(dy);
	};

	private onPointerUp = (evt: PointerEvent): void => {
		if (evt.pointerId !== this.activePointerId) return;
		const dy = this.lastDy;
		const velocity = this.currentVelocity();
		this.reset();
		this.callbacks.onDragEnd(dy, this.commitDirection(dy, velocity));
	};

	private onPointerCancel = (evt: PointerEvent): void => {
		if (evt.pointerId !== this.activePointerId) return;
		this.reset();
		this.callbacks.onDragEnd(0, 0);
	};

	private onClick = (evt: MouseEvent): void => {
		if (!this.suppressClick) return;
		this.suppressClick = false;
		evt.stopPropagation();
	};

	private reset(): void {
		if (this.activePointerId !== null) {
			this.el.releasePointerCapture?.(this.activePointerId);
		}
		this.activePointerId = null;
		this.axisLocked = null;
		this.lastDy = 0;
		this.velocitySamples = [];
	}

	private commitDirection(dy: number, velocity: number): DragCommitDirection {
		if (Math.abs(dy) < 1) return 0;
		const height = this.el.clientHeight || 1;
		const byDistance = Math.abs(dy) > height * COMMIT_DISTANCE_RATIO;
		const byFling = Math.abs(velocity) > COMMIT_FLING_VELOCITY;
		if (!byDistance && !byFling) return 0;
		return dy < 0 ? 1 : -1;
	}

	/** Mean velocity (px/ms) over the last ~80ms of samples. */
	private currentVelocity(): number {
		const samples = this.velocitySamples;
		if (samples.length < 2) return 0;
		const last = samples[samples.length - 1]!;
		const cutoff = last.t - 80;
		let baseline = samples[0]!;
		for (const sample of samples) {
			if (sample.t >= cutoff) {
				baseline = sample;
				break;
			}
		}
		const dt = last.t - baseline.t;
		if (dt <= 0) return 0;
		return (last.y - baseline.y) / dt;
	}
}
