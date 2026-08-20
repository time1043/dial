import { TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';

import type { FolderPlaylist } from '@/modules/episode-navigator';

import { resolveTreePlaylist } from '@/modules/episode-navigator/tree-order';

/**
 * `resolveTreePlaylist` builds the folder playlist from direct-child markdown
 * notes that carry `video` + `subtitle` frontmatter, sorted by vault path.
 *
 * It only touches `plugin.app.vault.getAbstractFileByPath` and
 * `plugin.app.metadataCache.getFileCache` — both stubbed below with a tiny
 * in-memory file map. Index.md and notes without media frontmatter must be
 * filtered out, and a current note outside the folder yields null.
 */

interface FakeFolder {
	path: string;
	name: string;
	children: TFile[];
}

function makeFile(path: string, parent: FakeFolder | null, media: boolean): TFile {
	const f = new TFile();
	f.path = path;
	// TFile from the obsidian stub only has `path`; add the fields the
	// resolver reads.
	(f as unknown as { extension: string; parent: FakeFolder | null }).extension = 'md';
	(f as unknown as { parent: FakeFolder | null }).parent = parent;
	mediaMap[path] = media
		? { frontmatter: { video: 'v.mp4', subtitle: 's.srt' } }
		: { frontmatter: {} };
	return f;
}

const mediaMap: Record<string, { frontmatter: Record<string, string> }> = {};

function makePlugin(fileMap: Record<string, TFile>): {
	app: {
		vault: { getAbstractFileByPath: (p: string) => TFile | null };
		metadataCache: { getFileCache: (f: TFile) => unknown };
	};
} {
	return {
		app: {
			vault: { getAbstractFileByPath: (p: string) => fileMap[p] ?? null },
			metadataCache: { getFileCache: (f: TFile) => mediaMap[f.path] ?? null },
		},
	};
}

describe('resolveTreePlaylist', () => {
	it('lists media notes sorted by path and locates the current one', () => {
		const folder: FakeFolder = { path: 'folder', name: 'folder', children: [] };
		const a = makeFile('folder/a.md', folder, true);
		const b = makeFile('folder/b.md', folder, true);
		const c = makeFile('folder/c.md', folder, false); // no media frontmatter
		const index = makeFile('folder/index.md', folder, false); // no media frontmatter
		folder.children = [a, b, c, index];

		const plugin = makePlugin({ 'folder/a.md': a, 'folder/b.md': b, 'folder/c.md': c });
		const result: FolderPlaylist | null = resolveTreePlaylist(plugin as never, 'folder/b.md');

		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/a.md', 'folder/b.md']);
		expect(result!.currentIndex).toBe(1);
	});

	it('returns null when the current note is not in the vault', () => {
		const folder: FakeFolder = { path: 'folder', name: 'folder', children: [] };
		const a = makeFile('folder/a.md', folder, true);
		folder.children = [a];

		const plugin = makePlugin({ 'folder/a.md': a });
		const result = resolveTreePlaylist(plugin as never, 'ghost/note.md');
		expect(result).toBeNull();
	});

	it('returns null when the current file has no parent folder', () => {
		const orphan = makeFile('orphan.md', null, true);

		const plugin = makePlugin({ 'orphan.md': orphan });
		const result = resolveTreePlaylist(plugin as never, 'orphan.md');
		expect(result).toBeNull();
	});

	it('returns a single-item playlist for a folder with one media note', () => {
		const folder: FakeFolder = { path: 'solo', name: 'solo', children: [] };
		const a = makeFile('solo/a.md', folder, true);
		folder.children = [a];

		const plugin = makePlugin({ 'solo/a.md': a });
		const result = resolveTreePlaylist(plugin as never, 'solo/a.md');
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['solo/a.md']);
		expect(result!.currentIndex).toBe(0);
	});

	it('reports currentIndex -1 when the current note lacks media frontmatter', () => {
		const folder: FakeFolder = { path: 'folder', name: 'folder', children: [] };
		const a = makeFile('folder/a.md', folder, true);
		const b = makeFile('folder/b.md', folder, true);
		const c = makeFile('folder/c.md', folder, false);
		folder.children = [a, b, c];

		const plugin = makePlugin({ 'folder/a.md': a, 'folder/b.md': b, 'folder/c.md': c });
		const result = resolveTreePlaylist(plugin as never, 'folder/c.md');
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/a.md', 'folder/b.md']);
		expect(result!.currentIndex).toBe(-1);
	});
});
