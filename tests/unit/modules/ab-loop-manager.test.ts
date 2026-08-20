import { describe, expect, it } from 'vitest';

import { AbLoopManager } from '@/modules/ab-loop/ab-loop-manager';

describe('AbLoopManager', () => {
	it('starts with null points and inactive', () => {
		const m = new AbLoopManager();
		expect(m.getState()).toEqual({ a: null, b: null, active: false });
	});

	it('setPointA records A and deactivates the loop', () => {
		const m = new AbLoopManager();
		expect(m.setPointA(10)).toEqual({ a: 10, b: null, active: false });
	});

	it('setPointA clears B when the new A is at or after the existing B', () => {
		const m = new AbLoopManager();
		m.setPointA(10);
		m.setPointB(20);
		expect(m.setPointA(20)).toEqual({ a: 20, b: null, active: false });
		expect(m.setPointA(25)).toEqual({ a: 25, b: null, active: false });
	});

	it('setPointA keeps B when A stays before B', () => {
		const m = new AbLoopManager();
		m.setPointA(10);
		m.setPointB(20);
		expect(m.setPointA(15)).toEqual({ a: 15, b: 20, active: false });
	});

	it('setPointB requires A to be set first', () => {
		const m = new AbLoopManager();
		const res = m.setPointB(20);
		expect(res.error).toBe('Set start point first');
		expect(res.state).toEqual({ a: null, b: null, active: false });
	});

	it('setPointB rejects B at or before A', () => {
		const m = new AbLoopManager();
		m.setPointA(20);
		expect(m.setPointB(20).error).toBe('End point must be after start point');
		expect(m.setPointB(10).error).toBe('End point must be after start point');
		expect(m.getState().active).toBe(false);
	});

	it('setPointB activates the loop when B is after A', () => {
		const m = new AbLoopManager();
		m.setPointA(10);
		const res = m.setPointB(20);
		expect(res.error).toBeUndefined();
		expect(res.state).toEqual({ a: 10, b: 20, active: true });
	});

	it('clear resets all state and deactivates', () => {
		const m = new AbLoopManager();
		m.setPointA(10);
		m.setPointB(20);
		expect(m.clear()).toEqual({ a: null, b: null, active: false });
	});
});
