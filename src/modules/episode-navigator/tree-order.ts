import { TFile, TFolder } from 'obsidian';

import type DialPlugin from '@/main';

import type { FolderPlaylist } from './index';

/**
 * Build the folder playlist from the file tree under `root`: every markdown
 * note that carries `video` + `subtitle` frontmatter, anywhere in `root`'s
 * subtree, sorted by vault path. `root` is the loop-scope folder resolved
 * from the configured folder-loop depth, so a depth of 2 (for example) walks
 * every descendant folder rather than just the note's immediate parent.
 *
 * Non-video notes (including index.md, which has no media frontmatter) are
 * filtered out, so they never become advance targets.
 */
export function resolveTreePlaylist(
	plugin: DialPlugin,
	currentNotePath: string,
	root: TFolder,
): FolderPlaylist | null {
	const notes = collectPlayableNotes(root, plugin).sort((a, b) => a.localeCompare(b));
	return { notes, currentIndex: notes.indexOf(currentNotePath) };
}

/** Recursively gather media-note paths under a folder (depth-first). */
function collectPlayableNotes(folder: TFolder, plugin: DialPlugin): string[] {
	const out: string[] = [];
	for (const child of folder.children) {
		if (child instanceof TFolder) {
			out.push(...collectPlayableNotes(child, plugin));
		} else if (
			child instanceof TFile &&
			child.extension === 'md' &&
			hasMediaFrontmatter(plugin, child)
		) {
			out.push(child.path);
		}
	}
	return out;
}

/** A note is playable when its frontmatter declares both video and subtitle. */
function hasMediaFrontmatter(plugin: DialPlugin, file: TFile): boolean {
	const cache = plugin.app.metadataCache.getFileCache(file);
	return Boolean(cache?.frontmatter?.video && cache?.frontmatter?.subtitle);
}
