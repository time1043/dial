import type DialPlugin from '@/main';
import type { FolderOrderMode } from '@/types';

import { resolveIndexPlaylist } from './index-order';
import { resolveTreePlaylist } from './tree-order';

/**
 * Ordered list of playable notes for the current folder, plus the position
 * of the currently-playing note within it. `currentIndex` is -1 when the
 * current note is not part of the playlist (e.g. not listed in index.md).
 *
 * Wrap-around (last → first) is the caller's responsibility, so this just
 * describes the linear order.
 */
export interface FolderPlaylist {
	notes: string[];
	currentIndex: number;
}

/**
 * Resolve the folder playlist according to the configured order mode.
 *
 * Returns null (after showing a Notice) when the playlist cannot be
 * determined — e.g. index.md missing or malformed. The caller treats null
 * as "stay on the current video".
 */
export async function resolveFolderPlaylist(
	plugin: DialPlugin,
	currentNotePath: string,
	orderMode: FolderOrderMode,
): Promise<FolderPlaylist | null> {
	switch (orderMode) {
		case 'tree':
			return resolveTreePlaylist(plugin, currentNotePath);
		case 'index':
			return resolveIndexPlaylist(plugin, currentNotePath);
	}
}
