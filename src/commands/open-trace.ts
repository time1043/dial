import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';

import type DialPlugin from '@/main';

export async function openTrace(plugin: DialPlugin): Promise<void> {
	const filePath = plugin.trace.getMonthFilePath(new Date());

	// Ensure file exists
	let file = plugin.app.vault.getAbstractFileByPath(filePath);
	if (!file) {
		const dirPath = '_lib/trace';
		if (!plugin.app.vault.getAbstractFileByPath(dirPath)) {
			await plugin.app.vault.createFolder(dirPath);
		}
		file = await plugin.app.vault.create(filePath, '');
	}

	// Collect main area leaves BEFORE opening trace
	const oldLeaves: WorkspaceLeaf[] = [];
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const container = leaf.view.containerEl;
		if (container.closest('.workspace-split.mod-root')) {
			oldLeaves.push(leaf);
		}
	});

	// Open trace file in a new leaf
	if (file instanceof TFile) {
		const leaf = plugin.app.workspace.getLeaf('tab');
		await leaf.openFile(file);
		await plugin.app.workspace.revealLeaf(leaf);
	}

	// Close old leaves (skip the active leaf that now holds the trace file)
	const activeView = plugin.app.workspace.getActiveViewOfType(ItemView);
	for (const leaf of oldLeaves) {
		if (leaf.view !== activeView) {
			leaf.detach();
		}
	}
}
