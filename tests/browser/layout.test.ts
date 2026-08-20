import { describe, expect, it } from 'vitest';

import { applySplitRatio } from '@/utils/layout';

/**
 * `applySplitRatio` finds the nearest `.workspace-split` ancestor of a view
 * container and applies a flex ratio to its two direct `.workspace-tabs`
 * children. It is DOM-driven (Obsidian's `setCssProps` extension), so it runs
 * in the `browser` project, which patches those methods onto
 * `HTMLElement.prototype` via obsidian-dom-polyfill.
 */
function buildSplit(tabs: number): { container: HTMLElement; children: HTMLElement[] } {
	const split = document.createElement('div');
	split.className = 'workspace-split';
	const children: HTMLElement[] = [];
	for (let i = 0; i < tabs; i++) {
		const tab = document.createElement('div');
		tab.className = 'workspace-tabs';
		split.appendChild(tab);
		children.push(tab);
	}
	const container = document.createElement('div');
	split.appendChild(container);
	document.body.appendChild(split);
	return { container, children };
}

describe('applySplitRatio', () => {
	it('applies the flex ratio to both workspace tabs', () => {
		const { container, children } = buildSplit(2);
		applySplitRatio(container, [2, 8]);
		// `setCssProps` sets the `flex` shorthand; browsers normalise it to
		// `2 1 0%`, so assert the resolved flex-grow value.
		expect(children[0]!.style.flexGrow).toBe('2');
		expect(children[1]!.style.flexGrow).toBe('8');
		children[0]!.parentElement?.remove();
	});

	it('does nothing when there is no .workspace-split ancestor', () => {
		const orphan = document.createElement('div');
		document.body.appendChild(orphan);
		// Should not throw, and the element has no flex applied.
		expect(() => applySplitRatio(orphan, [2, 8])).not.toThrow();
		expect(orphan.style.flex).toBe('');
		orphan.remove();
	});

	it('does nothing when fewer than two tabs are present', () => {
		const { container, children } = buildSplit(1);
		applySplitRatio(container, [2, 8]);
		expect(children[0]!.style.flex).toBe('');
		children[0]!.parentElement?.remove();
	});
});
