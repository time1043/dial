import { TFile } from 'obsidian';

import type DialPlugin from '@/main';

import type { FolderPlaylist } from './index';

/**
 * Build the folder playlist from the file tree: direct-child markdown notes
 * that carry `video` and `subtitle` frontmatter, sorted by vault path. The
 * current note is located by path so the caller can pick the next entry.
 *
 * Non-video notes (including index.md, which has no media frontmatter) are
 * filtered out, so they never become advance targets.
 */
export function resolveTreePlaylist(
	plugin: DialPlugin,
	currentNotePath: string,
): FolderPlaylist | null {
	const currentFile = plugin.app.vault.getAbstractFileByPath(currentNotePath);
	if (!(currentFile instanceof TFile)) return null;

	const parent = currentFile.parent;
	if (!parent) return null;

	const notes = parent.children
		.filter((child): child is TFile => child instanceof TFile && child.extension === 'md')
		.filter((file) => hasMediaFrontmatter(plugin, file))
		.map((file) => file.path)
		.sort((a, b) => a.localeCompare(b));

	return { notes, currentIndex: notes.indexOf(currentNotePath) };
}

/** A note is playable when its frontmatter declares both video and subtitle. */
function hasMediaFrontmatter(plugin: DialPlugin, file: TFile): boolean {
	const cache = plugin.app.metadataCache.getFileCache(file);
	return Boolean(cache?.frontmatter?.video && cache?.frontmatter?.subtitle);
}
