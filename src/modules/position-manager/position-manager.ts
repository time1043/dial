/**
 * Manages video playback positions for resume-on-reopen.
 */
export class PositionManager {
	private positions: Record<string, number> = {};

	save(key: string, time: number): void {
		this.positions[key] = time;
	}

	restore(key: string): number | null {
		return this.positions[key] ?? null;
	}

	load(positions: Record<string, number>): void {
		this.positions = positions;
	}

	getAll(): Record<string, number> {
		return this.positions;
	}
}
