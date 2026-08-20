import { describe, expect, it } from 'vitest';

// `obsidian` is aliased to a no-op stub (see vitest.config.ts); the module's
// `import { TFile } from 'obsidian'` resolves through it. The pure methods
// under test don't touch TFile.
import { TraceManager, type TraceRow } from '@/modules/trace-manager/trace-manager';

describe('TraceManager', () => {
	const tm = new TraceManager();

	describe('getMonthFilePath', () => {
		it('formats the month file path as _lib/trace/YYYY-MM.md', () => {
			expect(tm.getMonthFilePath(new Date(2026, 7, 20))).toBe('_lib/trace/2026-08.md');
			expect(tm.getMonthFilePath(new Date(2026, 0, 1))).toBe('_lib/trace/2026-01.md');
			expect(tm.getMonthFilePath(new Date(2025, 11, 31))).toBe('_lib/trace/2025-12.md');
		});
	});

	describe('formatTime', () => {
		it('formats a Date as HH:MM', () => {
			expect(tm.formatTime(new Date(2026, 7, 20, 9, 5, 0))).toBe('09:05');
			expect(tm.formatTime(new Date(2026, 7, 20, 0, 0, 0))).toBe('00:00');
			expect(tm.formatTime(new Date(2026, 7, 20, 23, 59, 0))).toBe('23:59');
		});
	});

	describe('formatPosition', () => {
		it('formats seconds under an hour as a M:SS timestamp link', () => {
			expect(tm.formatPosition(30, 'note/foo.md')).toBe(
				'[0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30)',
			);
			expect(tm.formatPosition(125, 'note/foo.md')).toBe(
				'[2:05](obsidian://dial?note=note%2Ffoo.md&seconds=125)',
			);
		});

		it('formats hours as H:MM:SS and uses the floor of fractional seconds', () => {
			expect(tm.formatPosition(3661.9, 'x.md')).toBe(
				'[1:01:01](obsidian://dial?note=x.md&seconds=3661)',
			);
		});
	});

	describe('addRow', () => {
		const row: TraceRow = {
			time: '13:00',
			notePath: 'note/foo.md',
			position: '[0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30)',
		};

		it('creates date + module + table from empty content', () => {
			expect(tm.addRow('', '2026-08-20', 'Video Player', row)).toMatchInlineSnapshot(`
				"# 2026-08-20

				## Video Player

				| Time | Video | Position |
				| ---- | ----- | -------- |
				| 13:00 | [[foo]] | [0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30) |"
			`);
		});

		it('inserts a new module section into an existing date section', () => {
			const existing = tm.addRow('', '2026-08-20', 'Video Player', row);
			expect(tm.addRow(existing, '2026-08-20', 'Type Session', row)).toMatchInlineSnapshot(`
				"# 2026-08-20

				## Type Session

				| Time | Video | Position |
				| ---- | ----- | -------- |
				| 13:00 | [[foo]] | [0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30) |

				## Video Player

				| Time | Video | Position |
				| ---- | ----- | -------- |
				| 13:00 | [[foo]] | [0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30) |"
			`);
		});

		it('inserts a table into an existing module section that has none', () => {
			const withDate = tm.addRow('', '2026-08-20', 'Video Player', row);
			// strip the table rows to leave only the module heading + its row,
			// simulating a module section that predates the table format.
			const moduleOnly = withDate.split('\n').slice(0, 3).join('\n');
			expect(tm.addRow(moduleOnly, '2026-08-20', 'Video Player', row)).toMatchInlineSnapshot(`
				"# 2026-08-20

				## Video Player

				| Time | Video | Position |
				| ---- | ----- | -------- |
				| 13:00 | [[foo]] | [0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30) |"
			`);
		});

		it('overwrites the last row when it is for the same video', () => {
			const sameVideoRow: TraceRow = {
				time: '12:00',
				notePath: 'note/foo.md',
				position: '[0:20](obsidian://dial?note=note%2Ffoo.md&seconds=20)',
			};
			const existing = tm.addRow('', '2026-08-20', 'Video Player', sameVideoRow);
			expect(tm.addRow(existing, '2026-08-20', 'Video Player', row)).toMatchInlineSnapshot(`
				"# 2026-08-20

				## Video Player

				| Time | Video | Position |
				| ---- | ----- | -------- |
				| 13:00 | [[foo]] | [0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30) |"
			`);
		});

		it('appends a new row when the last row is for a different video', () => {
			const otherVideoRow: TraceRow = {
				time: '12:00',
				notePath: 'note/bar.md',
				position: '[0:20](obsidian://dial?note=note%2Fbar.md&seconds=20)',
			};
			const existing = tm.addRow('', '2026-08-20', 'Video Player', otherVideoRow);
			expect(tm.addRow(existing, '2026-08-20', 'Video Player', row)).toMatchInlineSnapshot(`
				"# 2026-08-20

				## Video Player

				| Time | Video | Position |
				| ---- | ----- | -------- |
				| 12:00 | [[bar]] | [0:20](obsidian://dial?note=note%2Fbar.md&seconds=20) |
				| 13:00 | [[foo]] | [0:30](obsidian://dial?note=note%2Ffoo.md&seconds=30) |"
			`);
		});
	});
});
