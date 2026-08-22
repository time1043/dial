import { FuzzySuggestModal, Notice, TFile } from 'obsidian';

import type DialPlugin from '@/main';

import {
	findWordBookFiles,
	isWordBookPath,
	normalizeBucketPath,
} from '@/modules/word-flip/book-finder';
import { WORD_FLIP_VIEW_TYPE, WordFlipView } from '@/ui/word-flip-view';

/** Focus the (single) word flip leaf, creating it in a new tab if needed. */
async function focusFlipView(plugin: DialPlugin): Promise<WordFlipView | null> {
	const workspace = plugin.app.workspace;
	const existing = workspace.getLeavesOfType(WORD_FLIP_VIEW_TYPE);
	const leaf = existing.length > 0 ? existing[0]! : workspace.getLeaf('tab');
	await leaf.setViewState({ type: WORD_FLIP_VIEW_TYPE, active: true });
	await workspace.revealLeaf(leaf);
	return leaf.view instanceof WordFlipView ? leaf.view : null;
}

/** Open a book in the flip view, optionally auto-starting a session. */
export async function openWordFlipBook(
	plugin: DialPlugin,
	file: TFile,
	options: { startAt?: number; autoStart?: boolean } = {},
): Promise<void> {
	const view = await focusFlipView(plugin);
	if (!view) return;
	await view.loadBook(file, options.startAt ?? plugin.wordFlip.getLastIndex(file.path) ?? 0);
	if (options.autoStart) view.startSession();
}

/**
 * "Flip words" — resume the last book where it was left; fall back to the
 * book picker when there is no history yet.
 */
export async function flipWords(plugin: DialPlugin): Promise<void> {
	const lastBook = plugin.wordFlip.getLastBook();
	if (lastBook) {
		const file = plugin.app.vault.getAbstractFileByPath(lastBook);
		if (file instanceof TFile) {
			await openWordFlipBook(plugin, file, { autoStart: true });
			return;
		}
	}
	await flipWordsChooseBook(plugin);
}

/** "Flip words: from the active book" — the file open in the editor. */
export async function flipWordsFromActiveFile(plugin: DialPlugin): Promise<void> {
	const active = plugin.app.workspace.getActiveFile();
	if (!active || !isWordBookPath(plugin.settings.vocabularyBucketPath, active.path)) {
		new Notice(
			`Active file is not a word book — it must live under ` +
				`${normalizeBucketPath(plugin.settings.vocabularyBucketPath)}/.`,
		);
		return;
	}
	await openWordFlipBook(plugin, active, { autoStart: true });
}

/** "Flip words: choose a book" — fuzzy picker over the bucket folder. */
export async function flipWordsChooseBook(plugin: DialPlugin): Promise<void> {
	const books = findWordBookFiles(plugin.app.vault, plugin.settings.vocabularyBucketPath);
	if (books.length === 0) {
		new Notice(
			`No word books found under ` +
				`${normalizeBucketPath(plugin.settings.vocabularyBucketPath)}/ — drop a book ` +
				`file there or create one.`,
		);
		return;
	}

	new (class extends FuzzySuggestModal<TFile> {
		getItems(): TFile[] {
			return books;
		}
		getItemText(file: TFile): string {
			return file.basename;
		}
		async onChooseItem(file: TFile): Promise<void> {
			await openWordFlipBook(plugin, file, { autoStart: true });
		}
	})(plugin.app).open();
}
