import { Notice, Platform, TFile } from 'obsidian';

import type DialPlugin from '@/main';
import type { Subtitle, TypeSessionData } from '@/types';

import { parseSubtitle } from '@/modules/subtitle-parsers';
import { TypeSessionManager } from '@/modules/type-session/type-session-manager';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from '@/ui/subtitle-view';
import { TYPE_VIEW_TYPE, TypeView } from '@/ui/type-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '@/ui/video-player-view';
import { applySplitRatio } from '@/utils/layout';

const sessionManager = new WeakMap<DialPlugin, TypeSessionManager>();

function getManager(plugin: DialPlugin): TypeSessionManager {
	let mgr = sessionManager.get(plugin);
	if (!mgr) {
		mgr = new TypeSessionManager(plugin.app.vault);
		sessionManager.set(plugin, mgr);
	}
	return mgr;
}

async function resolvePaths(plugin: DialPlugin) {
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

	const videoPath = `${plugin.settings.videoLibraryPath}/${String(frontmatter.video)}`.replace(
		/\\/g,
		'/',
	);
	const subtitlePath =
		`${plugin.settings.subtitleLibraryPath}/${String(frontmatter.subtitle)}`.replace(
			/\\/g,
			'/',
		);

	return { videoPath, subtitlePath, notePath: activeFile.path };
}

async function loadSubtitles(plugin: DialPlugin, subtitlePath: string): Promise<Subtitle[] | null> {
	const subtitleFile = plugin.app.vault.getAbstractFileByPath(subtitlePath);
	if (!subtitleFile || !(subtitleFile instanceof TFile)) {
		new Notice(`Subtitle file not found: ${subtitlePath}`);
		return null;
	}

	let buffer: ArrayBuffer;
	try {
		buffer = await plugin.app.vault.readBinary(subtitleFile);
	} catch {
		new Notice('Failed to read subtitle file.');
		return null;
	}

	try {
		const subs = parseSubtitle(buffer, subtitlePath);
		if (subs.length === 0) {
			new Notice('No subtitles found in file');
			return null;
		}
		return subs;
	} catch (e) {
		new Notice(`Subtitle parse error: ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
}

async function appendSessionLink(plugin: DialPlugin, session: TypeSessionData): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!activeFile) return;

	const file = plugin.app.vault.getAbstractFileByPath(activeFile.path);
	if (!(file instanceof TFile)) return;

	const content = await plugin.app.vault.read(file);
	const time = new Date(parseInt(session.id, 10) * 1000);
	const yyyy = time.getFullYear();
	const mo = String(time.getMonth() + 1).padStart(2, '0');
	const dd = String(time.getDate()).padStart(2, '0');
	const hh = String(time.getHours()).padStart(2, '0');
	const mm = String(time.getMinutes()).padStart(2, '0');
	const ss = String(time.getSeconds()).padStart(2, '0');
	const link = `\n- [Type ${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss}](obsidian://dial?type=${session.id})\n`;

	await plugin.app.vault.modify(file, content + link);
}

/**
 * Open the type mode layout and wire video audio.
 *
 * Layout:
 *   left 2 (subtitle + md tabs)  |  right 8 (video + type tabs)
 */
async function openTypeLayout(
	plugin: DialPlugin,
	videoPath: string,
	subtitles: Subtitle[],
	session: TypeSessionData,
): Promise<void> {
	if (Platform.isMobile) {
		const leaf = plugin.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: TYPE_VIEW_TYPE, active: true });
		await plugin.app.workspace.revealLeaf(leaf);
		const tv = leaf.view as TypeView;
		tv.loadSession(subtitles, session);
		return;
	}

	// 1. Left 2: subtitle view
	const subtitleView = (await openViewOnce(plugin, SUBTITLE_VIEW_TYPE, 'tab')) as SubtitleView;
	const subLeaf = plugin.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE)[0]!;

	// 2. Right: split subtitle → video
	const videoLeaf = plugin.app.workspace.createLeafBySplit(subLeaf, 'vertical');
	await videoLeaf.setViewState({ type: VIDEO_PLAYER_VIEW_TYPE });
	const videoView = videoLeaf.view as VideoPlayerView;

	// 3. Right: type tab alongside video in same pane
	await plugin.app.workspace.revealLeaf(videoLeaf);
	const typeLeaf = plugin.app.workspace.getLeaf('tab');
	await typeLeaf.setViewState({ type: TYPE_VIEW_TYPE });
	const tv = typeLeaf.view as TypeView;

	await plugin.app.workspace.revealLeaf(typeLeaf);
	plugin.app.workspace.setActiveLeaf(typeLeaf);

	setTimeout(() => {
		applySplitRatio(tv.containerEl, [2, 8]);
		tv.focus();
	}, 200);

	// Load video
	await videoView.loadVideo(videoPath, plugin.settings.defaultVolume);
	videoView.setSubtitles(subtitles);
	subtitleView.setSubtitles(subtitles);
	plugin.setSubtitles(subtitles);

	// Wire type → session persistence
	tv.setCallbacks({
		onSave: (s) => void getManager(plugin).save(s),
		onReplaySentence: (start, end) => {
			videoView.playRangeOnce(start, end);
		},
		onSentenceChange: (subtitleId) => {
			// Clear any AB loop — type mode drives playback, not loop
			videoView.setABLoop(null, null, false);
			const sub = subtitles.find((s) => s.id === subtitleId);
			if (sub) videoView.playRangeOnce(sub.start, sub.end);
		},
	});
	tv.loadSession(subtitles, session);

	// Position video at the current sentence. Must happen before
	// layout-change handlers fire, otherwise they'll restore the
	// previously saved playback position for this video.
	const currentSub = subtitles[session.currentIndex];
	if (currentSub) {
		videoView.jumpToTime(currentSub.start);
	}

	// Wire video subtitle change → type view navigation
	videoView.setSubtitleChangeCallback((id: number) => {
		const idx = subtitles.findIndex((s) => s.id === id);
		if (idx >= 0) tv.goToSentence(idx);
	});
}

export async function openTypeSession(plugin: DialPlugin): Promise<void> {
	const paths = await resolvePaths(plugin);
	if (!paths) return;

	const subtitles = await loadSubtitles(plugin, paths.subtitlePath);
	if (!subtitles) return;

	const mgr = getManager(plugin);
	const session = await mgr.create(paths.videoPath, paths.subtitlePath, subtitles);

	await openTypeLayout(plugin, paths.videoPath, subtitles, session);
	await appendSessionLink(plugin, session);
	new Notice(`Type session created — ${subtitles.length} sentences`);
}

export async function resumeTypeSession(plugin: DialPlugin, sessionId: string): Promise<void> {
	const mgr = getManager(plugin);
	const session = await mgr.load(sessionId);
	if (!session) {
		new Notice(`Type session not found: ${sessionId}`);
		return;
	}

	const subtitles = await loadSubtitles(plugin, session.subtitlePath);
	if (!subtitles) return;

	await openTypeLayout(plugin, session.videoPath, subtitles, session);
	new Notice(`Type session resumed — sentence ${session.currentIndex + 1}/${subtitles.length}`);
}

async function openViewOnce(plugin: DialPlugin, viewType: string, mode: 'tab' | 'split') {
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
