import { FuzzySuggestModal, Modal, Notice, Setting, TFile } from 'obsidian';

import type DialPlugin from '@/main';

import {
	ensureBucketFolder,
	findWordBookFiles,
	isWordBookPath,
	normalizeBucketPath,
	WORD_BOOK_TEMPLATE,
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
		onChooseItem(file: TFile): void {
			void openWordFlipBook(plugin, file, { autoStart: true });
		}
	})(plugin.app).open();
}

/**
 * Journey-file resume link (obsidian://dial?type=word-flip&book=…&index=…).
 * Lands in browse mode — starting a session stays an explicit press of
 * Start. `index` is 1-based in the URL for human readability.
 */
export async function resumeWordFlip(
	plugin: DialPlugin,
	bookParam?: string,
	indexParam?: string,
): Promise<void> {
	if (!bookParam) return;
	const bookPath = decodeURIComponent(bookParam);
	const file = plugin.app.vault.getAbstractFileByPath(bookPath);
	if (!(file instanceof TFile)) {
		new Notice(`Word book not found: ${bookPath}`);
		return;
	}
	const oneBased = Number.parseInt(indexParam ?? '1', 10);
	const startAt = Number.isNaN(oneBased) ? undefined : oneBased - 1;
	await openWordFlipBook(plugin, file, { startAt, autoStart: false });
}

/** Strip characters that are illegal in vault file names. */
function sanitizeBookName(name: string): string {
	return name.replace(/[/\\:*?"<>|#^[\]]/g, '').trim();
}

/** "New word book" — prompt for a name, create the template, open it. */
export async function createWordBook(plugin: DialPlugin): Promise<void> {
	new (class extends Modal {
		private name = '';

		constructor(app: import('obsidian').App) {
			super(app);
		}

		async onOpen(): Promise<void> {
			this.titleEl.setText('New word book');

			const submit = async (): Promise<void> => {
				const clean = sanitizeBookName(this.name);
				if (!clean) {
					new Notice('Please enter a book name.');
					return;
				}
				this.close();

				const bucket = await ensureBucketFolder(
					plugin.app.vault,
					plugin.settings.vocabularyBucketPath,
				);
				const path = `${bucket}/${clean}.md`;
				if (plugin.app.vault.getAbstractFileByPath(path)) {
					new Notice(`"${path}" already exists.`);
					return;
				}
				const file = await plugin.app.vault.create(path, WORD_BOOK_TEMPLATE);
				await plugin.app.workspace.getLeaf('tab').openFile(file);
				new Notice(
					`Word book created — add words to the table, then flip it from the palette.`,
				);
			};

			new Setting(this.contentEl).setName('Book name').addText((text) => {
				text.setPlaceholder('My vocabulary');
				text.onChange((value) => {
					this.name = value;
				});
				text.inputEl.addEventListener('keydown', (evt) => {
					if (evt.key === 'Enter') void submit();
				});
				window.setTimeout(() => text.inputEl.focus(), 50);
			});
			new Setting(this.contentEl).addButton((button) =>
				button.setButtonText('Create').onClick(() => void submit()),
			);
		}
	})(plugin.app).open();
}
