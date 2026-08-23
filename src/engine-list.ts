import { setIcon } from 'obsidian';

import type DialPlugin from './main';

export type EngineDot = 'available' | 'partial' | 'unavailable';

/**
 * Render one reorderable engine priority list (shared by the speech and
 * translation engine lists).
 *
 * The displayed rows come from the live chain in the user's current priority
 * order, so each up/down click swaps two real engine ids and rewrites the
 * stored order from those ids. Rebuilding the order from the visible rows
 * makes the arrows robust to any stray/id mismatch in the stored order (for
 * example an old alias that no longer matches a provider), so every engine —
 * including ones added later — stays reorderable instead of getting stuck
 * behind a phantom entry.
 */
export function renderEngineList(
	plugin: DialPlugin,
	listEl: HTMLElement,
	getRows: () => { id: string; label: string; dot: EngineDot }[],
	orderSettingKey: 'speechEngineOrder' | 'translationEngineOrder',
): void {
	listEl.empty();
	const rows = getRows();
	// Mirror the displayed rows: every id is taken from the live chain, so it
	// always matches a real provider. Swapping two of these and writing them
	// back produces a clean, fully-matched order.
	const ids = rows.map((row) => row.id);

	rows.forEach((row, index) => {
		const rowEl = listEl.createDiv({ cls: 'dial-speech-engine-row' });
		rowEl.createSpan({ cls: `dial-speech-dot dial-speech-dot-${row.dot}` });
		rowEl.createSpan({ cls: 'dial-speech-engine-label', text: row.label });

		const move = (delta: number, icon: string) => {
			const btn = rowEl.createEl('button', {
				cls: 'dial-speech-engine-move',
				attr: {
					'aria-label': delta < 0 ? 'Move up' : 'Move down',
					title: delta < 0 ? 'Move up' : 'Move down',
				},
			});
			setIcon(btn, icon);
			// Disable at the ends using the visible row positions.
			const target = index + delta;
			btn.disabled = target < 0 || target >= rows.length;
			btn.addEventListener('click', () => {
				void (async () => {
					const from = ids.indexOf(row.id);
					const to = from + delta;
					if (from < 0 || to < 0 || to >= ids.length) return;
					// Bounds are checked above, so both reads are defined.
					const moved = ids[from]!;
					const other = ids[to]!;
					ids[from] = other;
					ids[to] = moved;
					plugin.settings[orderSettingKey] = [...ids];
					await plugin.saveSettings();
					renderEngineList(plugin, listEl, getRows, orderSettingKey);
				})();
			});
		};
		move(-1, 'chevron-up');
		move(1, 'chevron-down');
	});
}
