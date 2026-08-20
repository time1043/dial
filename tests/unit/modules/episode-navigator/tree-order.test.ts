import { TFile, TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';

import type { FolderPlaylist } from '@/modules/episode-navigator';

import { resolveTreePlaylist } from '@/modules/episode-navigator/tree-order';

/**
 * `resolveTreePlaylist` builds the folder playlist from markdown notes that
 * carry `video` + `subtitle` frontmatter, collected recursively from the
 * whole subtree of the given root folder and sorted by vault path.
 *
 * It only touches `plugin.app.vault.getAbstractFileByPath` and
 * `plugin.app.metadataCache.getFileCache` — both stubbed below with a tiny
 * in-memory file map. Index.md and notes without media frontmatter must be
 * filtered out, and a current note outside the root yields currentIndex -1.
 */

const mediaMap: Record<string, { frontmatter: Record<string, string> }> = {};

/** Build a real TFolder instance with the fields the resolver reads. */
function makeFolder(path: string, parent: TFolder | null): TFolder {
	const folder = new TFolder();
	folder.path = path;
	// `name` / `children` / `parent` are not on the stub; attach them via a
	// structural bag (NOT a cast to TFolder — that trips the lint rule).
	const bag = folder as unknown as {
		name: string;
		children: (TFile | TFolder)[];
		parent: TFolder | null;
	};
	bag.name = path.split('/').pop() ?? path;
	bag.children = [];
	bag.parent = parent;
	return folder;
}

function makeFile(path: string, parent: TFolder | null, media: boolean): TFile {
	const f = new TFile();
	f.path = path;
	const bag = f as unknown as {
		extension: string;
		parent: TFolder | null;
	};
	bag.extension = 'md';
	bag.parent = parent;
	mediaMap[path] = media
		? { frontmatter: { video: 'v.mp4', subtitle: 's.srt' } }
		: { frontmatter: {} };
	return f;
}

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

/** Attach children to a folder's structural bag. */
function setChildren(folder: TFolder, children: (TFile | TFolder)[]): void {
	(folder as unknown as { children: (TFile | TFolder)[] }).children = children;
}

describe('resolveTreePlaylist', () => {
	it('lists media notes sorted by path and locates the current one', () => {
		const folder = makeFolder('folder', null);
		const a = makeFile('folder/a.md', folder, true);
		const b = makeFile('folder/b.md', folder, true);
		const c = makeFile('folder/c.md', folder, false); // no media frontmatter
		const index = makeFile('folder/index.md', folder, false); // no media frontmatter
		setChildren(folder, [a, b, c, index]);

		const plugin = makePlugin({ 'folder/a.md': a, 'folder/b.md': b, 'folder/c.md': c });
		const result: FolderPlaylist | null = resolveTreePlaylist(
			plugin as never,
			'folder/b.md',
			folder,
		);

		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/a.md', 'folder/b.md']);
		expect(result!.currentIndex).toBe(1);
	});

	it('returns a single-item playlist for a folder with one media note', () => {
		const folder = makeFolder('solo', null);
		const a = makeFile('solo/a.md', folder, true);
		setChildren(folder, [a]);

		const plugin = makePlugin({ 'solo/a.md': a });
		const result = resolveTreePlaylist(plugin as never, 'solo/a.md', folder);
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['solo/a.md']);
		expect(result!.currentIndex).toBe(0);
	});

	it('reports currentIndex -1 when the current note lacks media frontmatter', () => {
		const folder = makeFolder('folder', null);
		const a = makeFile('folder/a.md', folder, true);
		const b = makeFile('folder/b.md', folder, true);
		const c = makeFile('folder/c.md', folder, false);
		setChildren(folder, [a, b, c]);

		const plugin = makePlugin({ 'folder/a.md': a, 'folder/b.md': b, 'folder/c.md': c });
		const result = resolveTreePlaylist(plugin as never, 'folder/c.md', folder);
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/a.md', 'folder/b.md']);
		expect(result!.currentIndex).toBe(-1);
	});

	it('reports currentIndex -1 when the current note is outside the root', () => {
		const folder = makeFolder('folder', null);
		const a = makeFile('folder/a.md', folder, true);
		setChildren(folder, [a]);

		const plugin = makePlugin({ 'folder/a.md': a });
		const result = resolveTreePlaylist(plugin as never, 'ghost/note.md', folder);
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/a.md']);
		expect(result!.currentIndex).toBe(-1);
	});

	it('collects playable notes recursively across subfolders', () => {
		// nmet/part01/{a,b}.md  (mirrors the real "depth 2" loop scope)
		const nmet = makeFolder('nmet', null);
		const part01 = makeFolder('nmet/part01', nmet);

		const a = makeFile('nmet/part01/a.md', part01, true);
		const b = makeFile('nmet/part01/b.md', part01, true);
		const notes = makeFile('nmet/part01/notes.md', part01, false); // no media
		setChildren(part01, [a, b, notes]);
		setChildren(nmet, [part01]);

		const plugin = makePlugin({
			'nmet/part01/a.md': a,
			'nmet/part01/b.md': b,
			'nmet/part01/notes.md': notes,
		});

		const result = resolveTreePlaylist(plugin as never, 'nmet/part01/a.md', nmet);
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['nmet/part01/a.md', 'nmet/part01/b.md']);
		expect(result!.currentIndex).toBe(0);
	});
});
