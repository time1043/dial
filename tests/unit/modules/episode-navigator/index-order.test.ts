import { describe, expect, it, vi } from 'vitest';

import { mockObsidian } from '../../../helpers/mock-obsidian';

// Replace the `obsidian` module with the mock so Notice captures its last
// message — the resolver surfaces every failure mode through a Notice.
vi.mock('obsidian', () => mockObsidian());

import * as Obsidian from 'obsidian';
import { TFile } from 'obsidian';

import type { FolderPlaylist } from '@/modules/episode-navigator';

import { resolveIndexPlaylist } from '@/modules/episode-navigator/index-order';

const lastNotice = (): unknown => (Obsidian as { __lastNotice?: () => unknown }).__lastNotice?.();

interface FakeFolder {
	path: string;
	name: string;
	children: TFile[];
}

function makeFile(path: string, parent: FakeFolder): TFile {
	const f = new TFile();
	f.path = path;
	(f as unknown as { parent: FakeFolder }).parent = parent;
	return f;
}

/**
 * Build a plugin whose current note is `folder/a.md` and whose index.md
 * content / link resolution are controlled by the options. The resolver
 * only reads vault.getAbstractFileByPath, vault.read, and
 * metadataCache.getFirstLinkpathDest.
 */
function makePlugin(opts: {
	indexContent: string;
	readThrows?: boolean;
	linkDest?: (link: string) => TFile | null;
}): {
	app: {
		vault: {
			getAbstractFileByPath: (p: string) => TFile | null;
			read: (f: TFile) => Promise<string>;
		};
		metadataCache: { getFirstLinkpathDest: (link: string) => TFile | null };
	};
} {
	const folder: FakeFolder = { path: 'folder', name: 'folder', children: [] };
	const current = makeFile('folder/a.md', folder);
	const indexFile = makeFile('folder/index.md', folder);
	const b = makeFile('folder/b.md', folder);
	const c = makeFile('folder/c.md', folder);
	folder.children = [current, indexFile, b, c];

	const fileMap: Record<string, TFile> = {
		'folder/a.md': current,
		'folder/index.md': indexFile,
		'folder/b.md': b,
		'folder/c.md': c,
	};

	return {
		app: {
			vault: {
				getAbstractFileByPath: (p: string) => fileMap[p] ?? null,
				read: opts.readThrows
					? () => Promise.reject(new Error('read fail'))
					: () => Promise.resolve(opts.indexContent),
			},
			metadataCache: {
				getFirstLinkpathDest: (link: string) => opts.linkDest?.(link) ?? null,
			},
		},
	};
}

// Re-use a single file map so linkDest can resolve by linktext.
const fileMap_b = makeFile('folder/b.md', { path: 'folder', name: 'folder', children: [] });
const fileMap_a = makeFile('folder/a.md', { path: 'folder', name: 'folder', children: [] });
const fileMap_c = makeFile('folder/c.md', { path: 'folder', name: 'folder', children: [] });

describe('resolveIndexPlaylist', () => {
	it('follows the # List order and locates the current note', async () => {
		const plugin = makePlugin({
			indexContent: '# List\n- [[b]]\n- [[a]]\n- [[c]]',
			linkDest: (link) =>
				(({ b: fileMap_b, a: fileMap_a, c: fileMap_c }) as Record<string, TFile | null>)[
					link
				] ?? null,
		});
		const result: FolderPlaylist | null = await resolveIndexPlaylist(
			plugin as never,
			'folder/a.md',
		);
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/b.md', 'folder/a.md', 'folder/c.md']);
		expect(result!.currentIndex).toBe(1);
	});

	it('returns null and notices when index.md is missing', async () => {
		const plugin = makePlugin({
			indexContent: '',
			linkDest: () => null,
		});
		// Hide index.md from the vault.
		plugin.app.vault.getAbstractFileByPath = (p: string) =>
			p === 'folder/index.md'
				? null
				: makeFile(p, { path: 'folder', name: 'folder', children: [] });

		const result = await resolveIndexPlaylist(plugin as never, 'folder/a.md');
		expect(result).toBeNull();
		expect(String(lastNotice())).toContain('No index.md found');
	});

	it('returns null and notices when index.md cannot be read', async () => {
		const plugin = makePlugin({
			indexContent: '# List\n- [[a]]',
			readThrows: true,
			linkDest: (link) => (link === 'a' ? fileMap_a : null),
		});
		const result = await resolveIndexPlaylist(plugin as never, 'folder/a.md');
		expect(result).toBeNull();
		expect(String(lastNotice())).toContain('Failed to read index.md');
	});

	it('returns null and notices when there is no "# List" section', async () => {
		const plugin = makePlugin({
			indexContent: '# Intro\n- some prose',
			linkDest: () => null,
		});
		const result = await resolveIndexPlaylist(plugin as never, 'folder/a.md');
		expect(result).toBeNull();
		expect(String(lastNotice())).toContain('index.md has no "# List" items');
	});

	it('returns null and notices when no links resolve', async () => {
		const plugin = makePlugin({
			indexContent: '# List\n- [[b]]\n- [[c]]',
			linkDest: () => null,
		});
		const result = await resolveIndexPlaylist(plugin as never, 'folder/a.md');
		expect(result).toBeNull();
		expect(String(lastNotice())).toContain('No resolvable links');
	});

	it('returns null and notices when the current note is not listed', async () => {
		const plugin = makePlugin({
			indexContent: '# List\n- [[b]]\n- [[c]]',
			linkDest: (link) => (link === 'b' ? fileMap_b : link === 'c' ? fileMap_c : null),
		});
		const result = await resolveIndexPlaylist(plugin as never, 'folder/a.md');
		expect(result).toBeNull();
		expect(String(lastNotice())).toContain('Current note is not listed');
	});

	it('strips wikilink aliases when resolving', async () => {
		const plugin = makePlugin({
			indexContent: '# List\n- [[a|Alias for A]]\n- [[b]]',
			linkDest: (link) =>
				(({ a: fileMap_a, b: fileMap_b }) as Record<string, TFile | null>)[link] ?? null,
		});
		const result = await resolveIndexPlaylist(plugin as never, 'folder/a.md');
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/a.md', 'folder/b.md']);
		expect(result!.currentIndex).toBe(0);
	});

	it('stops collecting at the next heading', async () => {
		const plugin = makePlugin({
			indexContent: '# List\n- [[b]]\n# Other\n- [[c]]',
			linkDest: (link) => (link === 'b' ? fileMap_b : link === 'c' ? fileMap_c : null),
		});
		const result = await resolveIndexPlaylist(plugin as never, 'folder/b.md');
		expect(result).not.toBeNull();
		expect(result!.notes).toEqual(['folder/b.md']);
		expect(result!.currentIndex).toBe(0);
	});
});
