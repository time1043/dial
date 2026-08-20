/**
 * Manages video playback positions for resume-on-reopen.
 */
export class PositionManager {
	private positions: Record<string, number> = {};
	private onPersist: (() => void) | null = null;

	/** Register a callback that fires on every save to persist to disk. */
	setPersistCallback(cb: () => void): void {
		this.onPersist = cb;
	}

	save(key: string, time: number): void {
		this.positions[key] = time;
		this.onPersist?.();
	}

	restore(key: string): number | null {
		return this.positions[key] ?? null;
	}

	/** Drop the saved position for a video, e.g. after it finishes naturally. */
	clear(key: string): void {
		delete this.positions[key];
		this.onPersist?.();
	}

	load(positions: Record<string, number>): void {
		this.positions = positions;
	}

	getAll(): Record<string, number> {
		return this.positions;
	}
}
