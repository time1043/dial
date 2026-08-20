import { Notice, TFile, TFolder } from 'obsidian';

import type DialPlugin from '@/main';

import type { FolderPlaylist } from './index';

const LIST_HEADING = /^#\s+list\s*$/i;
const ANY_HEADING = /^#/;
const LIST_ITEM = /^\s*[-*+]\s+\[\[([^\]]+)\]\]/;

/**
 * Build the folder playlist from an index.md file in the loop-scope folder
 * `root` (the folder resolved from the configured folder-loop depth). The file
 * must contain a `# List` heading followed by an unordered list of wikilinks;
 * the list order is the playback order, and the current note is located by
 * resolving each link against the metadata cache.
 *
 * Returns null (after a Notice) when index.md is missing, the heading or
 * list is absent/malformed, or the current note is not listed.
 */
export async function resolveIndexPlaylist(
	plugin: DialPlugin,
	currentNotePath: string,
	root: TFolder,
): Promise<FolderPlaylist | null> {
	const indexPath = root.path ? `${root.path}/index.md` : 'index.md';
	const indexFile = plugin.app.vault.getAbstractFileByPath(indexPath);
	if (!(indexFile instanceof TFile)) {
		new Notice(`No index.md found in folder "${root.name}".`);
		return null;
	}

	let content: string;
	try {
		content = await plugin.app.vault.read(indexFile);
	} catch {
		new Notice(`Failed to read index.md in folder "${root.name}".`);
		return null;
	}

	const linktexts = parseListLinks(content);
	if (linktexts.length === 0) {
		new Notice(`index.md has no "# List" items in folder "${root.name}".`);
		return null;
	}

	// Resolve each wikilink to a note file via the metadata cache. Links that
	// cannot be resolved (broken/ambiguous) are skipped — the remaining order
	// is still well-defined relative to the current note.
	const notes: string[] = [];
	for (const linktext of linktexts) {
		const dest = plugin.app.metadataCache.getFirstLinkpathDest(
			cleanLinktext(linktext),
			indexPath,
		);
		if (dest instanceof TFile) {
			notes.push(dest.path);
		}
	}

	if (notes.length === 0) {
		new Notice(`No resolvable links in index.md in folder "${root.name}".`);
		return null;
	}

	const currentIndex = notes.indexOf(currentNotePath);
	if (currentIndex < 0) {
		new Notice(`Current note is not listed in index.md in folder "${root.name}".`);
		return null;
	}

	return { notes, currentIndex };
}

/**
 * Extract wikilink targets from the first `# List` section, in order.
 * Collecting stops at the next heading; other lines inside the section
 * (blank or prose) are ignored so interspersed text does not break the list.
 */
function parseListLinks(content: string): string[] {
	const lines = content.split('\n');
	const items: string[] = [];
	let inList = false;
	for (const line of lines) {
		if (LIST_HEADING.test(line)) {
			inList = true;
			continue;
		}
		if (inList && ANY_HEADING.test(line)) {
			break; // a subsequent heading ends the list section
		}
		if (inList) {
			const match = LIST_ITEM.exec(line);
			if (match?.[1]) items.push(match[1]);
		}
	}
	return items;
}

/** Strip alias (`|alias`) and heading/block refs (`#...`, `#^...`) from a wikilink target. */
function cleanLinktext(linktext: string): string {
	return linktext.split('|')[0]!.split('#')[0]!.trim();
}
