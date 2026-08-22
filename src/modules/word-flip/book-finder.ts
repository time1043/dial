import { TFile, type Vault } from 'obsidian';

import { parseWordBook, type ParsedWordBook } from './book-parser';

export const DEFAULT_VOCABULARY_BUCKET = '_lib/vocabulary-bucket';

/** Normalize a user-entered bucket path (trim whitespace and slashes). */
export function normalizeBucketPath(path: string): string {
	const trimmed = path.trim().replace(/[/\\]+$/, '');
	return trimmed || DEFAULT_VOCABULARY_BUCKET;
}

/**
 * All markdown files under the bucket folder (recursive), sorted by path.
 * Any .md placed in the folder is considered a candidate word book; whether
 * it actually contains words is decided at parse time.
 */
export function findWordBookFiles(vault: Vault, bucketPath: string): TFile[] {
	const prefix = `${normalizeBucketPath(bucketPath)}/`;
	return vault
		.getMarkdownFiles()
		.filter((file) => file.path.startsWith(prefix))
		.sort((a, b) => a.path.localeCompare(b.path));
}

/** Whether a vault path lives inside the bucket folder. */
export function isWordBookPath(bucketPath: string, filePath: string): boolean {
	return filePath.startsWith(`${normalizeBucketPath(bucketPath)}/`);
}

/** Read and parse a word book file. */
export async function readWordBook(vault: Vault, file: TFile): Promise<ParsedWordBook> {
	return parseWordBook(await vault.read(file));
}

/** Starter content for a freshly created word book. */
export const WORD_BOOK_TEMPLATE = [
	'---',
	'title: ',
	'lang: ',
	'---',
	'',
	'| # | word | ipa | meaning | forms |',
	'| - | ---- | --- | ------- | ----- |',
	'| 1 |  |  |  |  |',
	'',
].join('\n');

/** Create the bucket folder (and any missing parents). */
export async function ensureBucketFolder(vault: Vault, bucketPath: string): Promise<string> {
	const bucket = normalizeBucketPath(bucketPath);
	let current = '';
	for (const part of bucket.split('/')) {
		current = current ? `${current}/${part}` : part;
		if (!vault.getAbstractFileByPath(current)) {
			await vault.createFolder(current);
		}
	}
	return bucket;
}

/** Display name for a book: frontmatter title, else the file basename. */
export function bookDisplayName(fileName: string, parsed: ParsedWordBook): string {
	return parsed.title ?? fileName.replace(/\.md$/i, '');
}
