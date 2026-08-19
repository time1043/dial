import type { View } from 'obsidian';

import { Notice, TFile } from 'obsidian';

import type DialPlugin from '@/main';

export interface ResolvedMediaPaths {
	videoPath: string;
	subtitlePath: string;
	notePath: string;
}

// Extract the file extension (including the leading dot) from a filename.
// Falls back to `fallback` when there is no usable extension.
export function getFileExtension(filename: string, fallback: string): string {
	const idx = filename.lastIndexOf('.');
	if (idx <= 0 || idx >= filename.length - 1) {
		return fallback;
	}
	return filename.slice(idx);
}

/**
 * Resolve the on-disk video and subtitle paths for the active note.
 *
 * Strategy (shared by every entry command):
 *   1. Read `video` / `subtitle` from the active note's frontmatter.
 *   2. Try the flat library path first.
 *   3. Fall back to a mirrored path that mirrors the note's folder
 *      structure, with the extension derived from the frontmatter filename
 *      so the mirror matches the real media format.
 *
 * Returns null (after showing a Notice) when prerequisites are missing
 * or the subtitle asset cannot be located.
 */
export async function resolveMediaPaths(plugin: DialPlugin): Promise<ResolvedMediaPaths | null> {
	if (!plugin.settings.videoLibraryPath) {
		new Notice('Please set the video library path in plugin settings.');
		return null;
	}

	const activeFile = plugin.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice('No active file');
		return null;
	}

	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	const frontmatter = cache?.frontmatter;
	if (!frontmatter?.video || !frontmatter?.subtitle) {
		new Notice("Active file must have 'video' and 'subtitle' in frontmatter");
		return null;
	}

	const videoRelative = String(frontmatter.video);
	const subtitleRelative = String(frontmatter.subtitle);

	// Derive the file extensions from the frontmatter so the mirrored path
	// matches the actual video/subtitle format (e.g. .mkv, .webm, .vtt)
	// instead of being hardcoded to .mp4 / .srt.
	const videoExt = getFileExtension(videoRelative, '.mp4');
	const subtitleExt = getFileExtension(subtitleRelative, '.srt');

	// e.g. notePath "note/psychology-anthony/xxx.md" → noteSubpath "psychology-anthony/xxx.md"
	const noteSubpath = activeFile.path.replace(/^[^/]+\//, '');

	const flatVideoPath = `${plugin.settings.videoLibraryPath}/${videoRelative}`.replace(
		/\\/g,
		'/',
	);
	const flatSubtitlePath = `${plugin.settings.subtitleLibraryPath}/${subtitleRelative}`.replace(
		/\\/g,
		'/',
	);
	const mirrorVideoPath =
		`${plugin.settings.videoLibraryPath}/${noteSubpath.replace(/\.md$/, videoExt)}`.replace(
			/\\/g,
			'/',
		);
	const mirrorSubtitlePath =
		`${plugin.settings.subtitleLibraryPath}/${noteSubpath.replace(/\.md$/, subtitleExt)}`.replace(
			/\\/g,
			'/',
		);

	// Try flat path first, fallback to mirrored structure
	const videoPath = plugin.app.vault.getAbstractFileByPath(flatVideoPath)
		? flatVideoPath
		: mirrorVideoPath;

	let subtitleFile = plugin.app.vault.getAbstractFileByPath(flatSubtitlePath);
	let subtitlePath = flatSubtitlePath;
	if (!subtitleFile || !(subtitleFile instanceof TFile)) {
		subtitleFile = plugin.app.vault.getAbstractFileByPath(mirrorSubtitlePath);
		subtitlePath = mirrorSubtitlePath;
	}
	if (!subtitleFile || !(subtitleFile instanceof TFile)) {
		new Notice(`Subtitle file not found: ${flatSubtitlePath}`);
		return null;
	}

	return { videoPath, subtitlePath, notePath: activeFile.path };
}

/**
 * Open a view of `viewType`, reusing an existing leaf if one is already
 * open (otherwise create a new leaf in `mode`).
 *
 * Replaces the previously duplicated `openView` / `openViewOnce` helpers
 * that lived in the individual command files.
 */
export async function openOrReuseLeaf(
	plugin: DialPlugin,
	viewType: string,
	mode: 'tab' | 'split',
): Promise<View> {
	const existing = plugin.app.workspace.getLeavesOfType(viewType);
	if (existing.length > 0) {
		await plugin.app.workspace.revealLeaf(existing[0]!);
		return existing[0]!.view;
	}

	const leaf = plugin.app.workspace.getLeaf(mode);
	await leaf.setViewState({ type: viewType, active: true });
	await plugin.app.workspace.revealLeaf(leaf);
	return leaf.view;
}
