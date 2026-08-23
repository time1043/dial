import { setIcon } from 'obsidian';

import type DialPlugin from './main';

export type EngineDot = 'available' | 'partial' | 'unavailable';

/**
 * Render one reorderable engine priority list (shared by the speech and
 * translation credential tabs). Rows are recomputed through `getRows` on every
 * render, so availability dots refresh after a reorder, a key edit, or a
 * Re-detect press.
 */
export function renderEngineList(
	plugin: DialPlugin,
	listEl: HTMLElement,
	getRows: () => { id: string; label: string; dot: EngineDot }[],
	orderSettingKey: 'speechEngineOrder' | 'translationEngineOrder',
): void {
	listEl.empty();
	const rows = getRows();
	const order = plugin.settings[orderSettingKey];

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
			btn.disabled = index + delta < 0 || index + delta >= rows.length;
			btn.addEventListener('click', () => {
				void (async () => {
					const target = index + delta;
					const current = order[index];
					const swapWith = order[target];
					if (current === undefined || swapWith === undefined) return;
					order[index] = swapWith;
					order[target] = current;
					plugin.settings[orderSettingKey] = [...order];
					await plugin.saveSettings();
					renderEngineList(plugin, listEl, getRows, orderSettingKey);
				})();
			});
		};
		move(-1, 'chevron-up');
		move(1, 'chevron-down');
	});
}
