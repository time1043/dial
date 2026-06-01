import type { ABLoopState } from '@/types';

/**
 * Single source of truth for AB loop state.
 * Views should read state from here, not store their own copy.
 */
export class AbLoopManager {
	private a: number | null = null;
	private b: number | null = null;
	private loopActive = false;

	setPointA(time: number): ABLoopState {
		this.a = time;
		// Clear B if it's now before or at A
		if (this.b !== null && this.b <= time) {
			this.b = null;
		}
		this.loopActive = false;
		return this.getState();
	}

	setPointB(time: number): { state: ABLoopState; error?: string } {
		if (this.a === null) {
			return { state: this.getState(), error: 'Set start point first' };
		}
		if (time <= this.a) {
			return { state: this.getState(), error: 'End point must be after start point' };
		}
		this.b = time;
		this.loopActive = true;
		return { state: this.getState() };
	}

	clear(): ABLoopState {
		this.a = null;
		this.b = null;
		this.loopActive = false;
		return this.getState();
	}

	getState(): ABLoopState {
		return { a: this.a, b: this.b, active: this.loopActive };
	}
}
