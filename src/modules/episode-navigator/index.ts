import { TFile, TFolder } from 'obsidian';

import type DialPlugin from '@/main';
import type { FolderOrderMode } from '@/types';

import { resolveIndexPlaylist } from './index-order';
import { resolveTreePlaylist } from './tree-order';

/**
 * Ordered list of playable notes for the loop scope, plus the position of the
 * currently-playing note within it. `currentIndex` is -1 when the current note
 * is not part of the playlist (e.g. lacks media frontmatter or sits outside
 * the resolved loop-scope folder).
 *
 * Wrap-around (last → first) is the caller's responsibility, so this just
 * describes the linear order.
 */
export interface FolderPlaylist {
	notes: string[];
	currentIndex: number;
}

/**
 * Resolve the loop-scope folder for "Loop current folder" mode.
 *
 * `depth` is how many folder levels UP from the current note's own folder
 * define the loop scope:
 *   - depth 1 → the note's immediate parent folder,
 *   - depth 2 → that folder's parent, and so on.
 *
 * Everything beneath the resolved folder becomes the playlist scope. When
 * `depth` exceeds the available nesting, the folder is clamped at the vault
 * root rather than going past it.
 *
 * Returns null when the current note cannot be resolved or has no parent
 * folder (so the caller can treat it as "stay on the current video").
 */
export function resolveLoopRootFolder(
	plugin: DialPlugin,
	currentNotePath: string,
	depth: number,
): TFolder | null {
	const currentFile = plugin.app.vault.getAbstractFileByPath(currentNotePath);
	if (!(currentFile instanceof TFile)) return null;
	let folder = currentFile.parent;
	if (!folder) return null;

	const levels = Math.max(1, Math.floor(depth) || 1);
	for (let i = 1; i < levels && folder.parent; i++) {
		folder = folder.parent;
	}
	return folder;
}

/**
 * Resolve the folder playlist according to the configured order mode, scoped
 * to the folder selected by `depth` (see `resolveLoopRootFolder`).
 *
 * Returns null (after showing a Notice in the index path) when the playlist
 * cannot be determined — e.g. loop-scope folder unresolved, index.md missing
 * or malformed. The caller treats null as "stay on the current video".
 */
export async function resolveFolderPlaylist(
	plugin: DialPlugin,
	currentNotePath: string,
	orderMode: FolderOrderMode,
	depth: number,
): Promise<FolderPlaylist | null> {
	const root = resolveLoopRootFolder(plugin, currentNotePath, depth);
	if (!root) return null;
	switch (orderMode) {
		case 'tree':
			return resolveTreePlaylist(plugin, currentNotePath, root);
		case 'index':
			return resolveIndexPlaylist(plugin, currentNotePath, root);
	}
}
