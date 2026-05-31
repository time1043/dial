/**
 * Apply a flex split ratio to the two child workspace-tabs inside a split container.
 * Used to maintain the subtitle:video pane ratio (e.g. 2:8).
 */
export function applySplitRatio(containerEl: HTMLElement, ratio: [number, number]): void {
	const splitEl = containerEl.closest('.workspace-split');
	if (!splitEl) return;
	const children = splitEl.querySelectorAll(':scope > .workspace-tabs');
	if (children.length === 2) {
		(children[0] as HTMLElement).setCssProps({ flex: String(ratio[0]) });
		(children[1] as HTMLElement).setCssProps({ flex: String(ratio[1]) });
	}
}
