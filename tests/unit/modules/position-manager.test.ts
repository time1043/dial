import { describe, expect, it, vi } from 'vitest';

import { PositionManager } from '@/modules/position-manager/position-manager';

describe('PositionManager', () => {
	it('restores null for an unknown key', () => {
		const m = new PositionManager();
		expect(m.restore('missing')).toBeNull();
	});

	it('saves and restores a position by key', () => {
		const m = new PositionManager();
		m.save('video/a.mp4', 42);
		expect(m.restore('video/a.mp4')).toBe(42);
	});

	it('overwrites a previous position for the same key', () => {
		const m = new PositionManager();
		m.save('k', 1);
		m.save('k', 2);
		expect(m.restore('k')).toBe(2);
	});

	it('fires the persist callback on every save', () => {
		const cb = vi.fn();
		const m = new PositionManager();
		m.setPersistCallback(cb);
		m.save('a', 1);
		m.save('b', 2);
		expect(cb).toHaveBeenCalledTimes(2);
	});

	it('does not fire the persist callback before one is registered', () => {
		const m = new PositionManager();
		expect(() => m.save('a', 1)).not.toThrow();
	});

	it('load() replaces the entire position map', () => {
		const m = new PositionManager();
		m.save('old', 1);
		m.load({ kept: 9 });
		expect(m.restore('old')).toBeNull();
		expect(m.restore('kept')).toBe(9);
	});

	it('getAll() returns the current position map', () => {
		const m = new PositionManager();
		m.save('a', 1);
		m.save('b', 2);
		expect(m.getAll()).toEqual({ a: 1, b: 2 });
	});
});

describe('PositionManager.clear', () => {
	it('drops a saved position so restore returns null', () => {
		const m = new PositionManager();
		m.save('video/a.mp4', 42);
		m.clear('video/a.mp4');
		expect(m.restore('video/a.mp4')).toBeNull();
	});

	it('leaves other keys intact when clearing one', () => {
		const m = new PositionManager();
		m.save('keep', 1);
		m.save('drop', 2);
		m.clear('drop');
		expect(m.restore('keep')).toBe(1);
		expect(m.restore('drop')).toBeNull();
	});

	it('fires the persist callback on clear', () => {
		const cb = vi.fn();
		const m = new PositionManager();
		m.setPersistCallback(cb);
		m.clear('video/a.mp4');
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('does not throw when clearing an unknown key', () => {
		const m = new PositionManager();
		expect(() => m.clear('missing')).not.toThrow();
	});
});
