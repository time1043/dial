import { describe, expect, it, vi } from 'vitest';

import { mockObsidian } from '../../../helpers/mock-obsidian';

// Replace the `obsidian` module with the mock so Notice captures its last
// message — resolveAllPlaylist surfaces the "not a folder" failure via a Notice.
vi.mock('obsidian', () => mockObsidian());

import * as Obsidian from 'obsidian';
import { TFile, TFolder } from 'obsidian';

import type DialPlugin from '@/main';
import type { FolderPlaylist } from '@/modules/episode-navigator';

import { resolveAllPlaylist } from '@/modules/episode-navigator';

const lastNotice = (): unknown => (Obsidian as { __lastNotice?: () => unknown }).__lastNotice?.();

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

/**
 * Build a 2-level vault (nmet / part01, part02) mirroring a real "note/" root
 * with media notes spread across subfolders plus an index.md at the root.
 */
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

describe('resolveAllPlaylist', () => {
	const vault = buildVault();

	it('trims a trailing slash and resolves the configured root as a folder (tree)', async () => {
		const plugin = makePlugin(vault, '');
		const playlist: FolderPlaylist | null = await resolveAllPlaylist(
			plugin,
			'nmet/part01/a.md',
			'tree',
			'nmet/',
		);
		expect(playlist?.notes).toEqual([
			'nmet/part01/a.md',
			'nmet/part01/b.md',
			'nmet/part02/c.md',
		]);
		expect(playlist?.currentIndex).toBe(0);
	});

	it('scopes the playlist to the subtree under the configured root (tree)', async () => {
		const plugin = makePlugin(vault, '');
		const playlist = await resolveAllPlaylist(
			plugin,
			'nmet/part01/a.md',
			'tree',
			'nmet/part01',
		);
		expect(playlist?.notes).toEqual(['nmet/part01/a.md', 'nmet/part01/b.md']);
		expect(playlist?.currentIndex).toBe(0);
	});

	it('honors the index order mode using the root folder index.md', async () => {
		const plugin = makePlugin(vault, '# List\n- [[a]]\n- [[b]]\n- [[c]]');
		const playlist = await resolveAllPlaylist(plugin, 'nmet/part01/a.md', 'index', 'nmet');
		expect(playlist?.notes).toEqual([
			'nmet/part01/a.md',
			'nmet/part01/b.md',
			'nmet/part02/c.md',
		]);
		expect(playlist?.currentIndex).toBe(0);
	});

	it('returns null and notices when the root is a file, not a folder', async () => {
		const plugin = makePlugin(vault, '');
		const playlist = await resolveAllPlaylist(
			plugin,
			'nmet/part01/a.md',
			'tree',
			'nmet/part01/a.md',
		);
		expect(playlist).toBeNull();
		expect(String(lastNotice())).toContain('All-files root');
		expect(String(lastNotice())).toContain('is not a folder');
	});

	it('returns null and notices when the root path does not exist', async () => {
		const plugin = makePlugin(vault, '');
		const playlist = await resolveAllPlaylist(plugin, 'nmet/part01/a.md', 'tree', 'ghost/');
		expect(playlist).toBeNull();
		expect(String(lastNotice())).toContain('is not a folder');
	});

	it('reports currentIndex -1 when the current note is outside the all-files root', async () => {
		const plugin = makePlugin(vault, '');
		const playlist = await resolveAllPlaylist(plugin, 'other/note.md', 'tree', 'nmet');
		expect(playlist).not.toBeNull();
		expect(playlist!.notes).toEqual([
			'nmet/part01/a.md',
			'nmet/part01/b.md',
			'nmet/part02/c.md',
		]);
		expect(playlist!.currentIndex).toBe(-1);
	});
});
