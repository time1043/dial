import { TFile, TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';

import type DialPlugin from '@/main';

import { resolveFolderPlaylist, resolveLoopRootFolder } from '@/modules/episode-navigator';

/**
 * Integration tests for the folder-loop depth parameter.
 *
 * Builds a 2-level vault (the user's "nmet / part01, part02" shape) and checks
 * that `resolveLoopRootFolder` selects the right scope folder for depth 1/2,
 * and that `resolveFolderPlaylist` returns the matching subtree in both tree
 * and index order modes.
 */

const mediaMap: Record<string, { frontmatter: Record<string, string> }> = {};

function makeFile(path: string, parent: TFolder | null, media: boolean): TFile {
	const f = new TFile();
	f.path = path;
	(f as unknown as { extension: string; parent: TFolder | null }).extension = 'md';
	(f as unknown as { parent: TFolder | null }).parent = parent;
	mediaMap[path] = media
		? { frontmatter: { video: 'v.mp4', subtitle: 's.srt' } }
		: { frontmatter: {} };
	return f;
}

function makeFolder(path: string, parent: TFolder | null): TFolder {
	const folder = new TFolder();
	folder.path = path;
	(folder as unknown as { parent: TFolder | null }).parent = parent;
	return folder;
}

function setChildren(folder: TFolder, children: (TFile | TFolder)[]): void {
	(folder as unknown as { children: (TFile | TFolder)[] }).children = children;
}

interface Vault {
	nmet: TFolder;
	part01: TFolder;
	part02: TFolder;
	a: TFile;
	b: TFile;
	c: TFile;
	indexFile: TFile;
	fileMap: Record<string, TFile | TFolder>;
}

function buildVault(): Vault {
	const nmet = makeFolder('nmet', null);
	const part01 = makeFolder('nmet/part01', nmet);
	const part02 = makeFolder('nmet/part02', nmet);

	const a = makeFile('nmet/part01/a.md', part01, true);
	const b = makeFile('nmet/part01/b.md', part01, true);
	const c = makeFile('nmet/part02/c.md', part02, true);
	const indexFile = makeFile('nmet/index.md', nmet, false);

	setChildren(part01, [a, b]);
	setChildren(part02, [c]);
	setChildren(nmet, [part01, part02, indexFile]);

	const fileMap: Record<string, TFile | TFolder> = {
		nmet: nmet,
		'nmet/part01': part01,
		'nmet/part02': part02,
		'nmet/part01/a.md': a,
		'nmet/part01/b.md': b,
		'nmet/part02/c.md': c,
		'nmet/index.md': indexFile,
	};
	return { nmet, part01, part02, a, b, c, indexFile, fileMap };
}

function makePlugin(vault: Vault, indexContent: string): DialPlugin {
	// Link resolution by wikilink target's basename (matches `# List` items).
	const linkIndex: Record<string, TFile> = {};
	for (const f of Object.values(vault.fileMap)) {
		if (f instanceof TFile) {
			linkIndex[f.path.split('/').pop()!.replace(/\.md$/, '')] = f;
		}
	}
	return {
		app: {
			vault: {
				getAbstractFileByPath: (p: string) =>
					(vault.fileMap[p] as TFile | TFolder | null) ?? null,
				read: () => Promise.resolve(indexContent),
			},
			metadataCache: {
				getFileCache: (f: TFile) => mediaMap[f.path] ?? null,
				getFirstLinkpathDest: (link: string) => linkIndex[link] ?? null,
			},
		},
	} as unknown as DialPlugin;
}

describe('resolveLoopRootFolder', () => {
	const vault = buildVault();
	const plugin = makePlugin(vault, '');

	it("depth 1 selects the note's immediate parent folder", () => {
		const root = resolveLoopRootFolder(plugin, 'nmet/part01/a.md', 1);
		expect(root?.path).toBe('nmet/part01');
	});

	it('depth 2 selects the grandparent folder', () => {
		const root = resolveLoopRootFolder(plugin, 'nmet/part01/a.md', 2);
		expect(root?.path).toBe('nmet');
	});

	it('clamps at the vault root when depth exceeds nesting', () => {
		const root = resolveLoopRootFolder(plugin, 'nmet/part01/a.md', 5);
		expect(root?.path).toBe('nmet');
	});

	it('returns null for a note that is not in the vault', () => {
		expect(resolveLoopRootFolder(plugin, 'ghost/note.md', 2)).toBeNull();
	});
});

describe('resolveFolderPlaylist depth (tree order)', () => {
	const vault = buildVault();
	const plugin = makePlugin(vault, '');

	it("depth 1 loops only the note's own folder (part01)", async () => {
		const playlist = await resolveFolderPlaylist(plugin, 'nmet/part01/a.md', 'tree', 1);
		expect(playlist?.notes).toEqual(['nmet/part01/a.md', 'nmet/part01/b.md']);
		expect(playlist?.currentIndex).toBe(0);
	});

	it('depth 2 loops the whole subtree (part01 + part02)', async () => {
		const playlist = await resolveFolderPlaylist(plugin, 'nmet/part01/a.md', 'tree', 2);
		expect(playlist?.notes).toEqual([
			'nmet/part01/a.md',
			'nmet/part01/b.md',
			'nmet/part02/c.md',
		]);
		expect(playlist?.currentIndex).toBe(0);
	});
});

describe('resolveFolderPlaylist depth (index order)', () => {
	const vault = buildVault();
	const plugin = makePlugin(vault, '# List\n- [[a]]\n- [[b]]\n- [[c]]');

	it('depth 2 reads index.md from the nmet root and lists all episodes', async () => {
		const playlist = await resolveFolderPlaylist(plugin, 'nmet/part01/a.md', 'index', 2);
		expect(playlist?.notes).toEqual([
			'nmet/part01/a.md',
			'nmet/part01/b.md',
			'nmet/part02/c.md',
		]);
		expect(playlist?.currentIndex).toBe(0);
	});

	it('depth 1 looks for index.md in part01 (none → null)', async () => {
		const playlist = await resolveFolderPlaylist(plugin, 'nmet/part01/a.md', 'index', 1);
		expect(playlist).toBeNull();
	});
});
