import { ItemView, WorkspaceLeaf } from 'obsidian';

import type DialPlugin from '@/main';

export async function openTrace(plugin: DialPlugin): Promise<void> {
	const file = await plugin.trace.ensureTraceFile(plugin.app.vault);

	// Collect main area leaves BEFORE opening trace
	const oldLeaves: WorkspaceLeaf[] = [];
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const container = leaf.view.containerEl;
		if (container.closest('.workspace-split.mod-root')) {
			oldLeaves.push(leaf);
		}
	});

	// Open trace file in a new leaf
	const leaf = plugin.app.workspace.getLeaf('tab');
	await leaf.openFile(file);
	await plugin.app.workspace.revealLeaf(leaf);

	// Close old leaves (skip the active leaf that now holds the trace file)
	const activeView = plugin.app.workspace.getActiveViewOfType(ItemView);
	for (const leaf of oldLeaves) {
		if (leaf.view !== activeView) {
			leaf.detach();
		}
	}
}
