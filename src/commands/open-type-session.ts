import { Notice, Platform, TFile } from 'obsidian';

import type DialPlugin from '@/main';
import type { Subtitle, TypeSessionData } from '@/types';

import { parseSubtitle } from '@/modules/subtitle-parsers';
import { TypeSessionManager } from '@/modules/type-session/type-session-manager';
import { TYPE_SUBTITLE_VIEW_TYPE, TypeSubtitleView } from '@/ui/type-subtitle-view';
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

	const videoRelative = String(frontmatter.video);
	const subtitleRelative = String(frontmatter.subtitle);
	const noteFolder = activeFile.parent?.name ?? '';

	// Try direct path first, then prepend note folder
	let videoPath = `${plugin.settings.videoLibraryPath}/${videoRelative}`.replace(/\\/g, '/');
	if (!plugin.app.vault.getAbstractFileByPath(videoPath) && noteFolder) {
		videoPath = `${plugin.settings.videoLibraryPath}/${noteFolder}/${videoRelative}`.replace(
			/\\/g,
			'/',
		);
	}

	let subtitlePath = `${plugin.settings.subtitleLibraryPath}/${subtitleRelative}`.replace(
		/\\/g,
		'/',
	);
	if (!plugin.app.vault.getAbstractFileByPath(subtitlePath) && noteFolder) {
		subtitlePath =
			`${plugin.settings.subtitleLibraryPath}/${noteFolder}/${subtitleRelative}`.replace(
				/\\/g,
				'/',
			);
	}

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
 *   left 2 (type-subtitle + md tabs)  |  right 8 (video + type tabs)
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

	// 1. Left 2: type subtitle view
	const typeSubView = (await openViewOnce(
		plugin,
		TYPE_SUBTITLE_VIEW_TYPE,
		'tab',
	)) as TypeSubtitleView;
	const subLeaf = plugin.app.workspace.getLeavesOfType(TYPE_SUBTITLE_VIEW_TYPE)[0]!;

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
	plugin.setSubtitles(subtitles);

	// Wire type subtitle panel
	typeSubView.setSubtitles(subtitles);
	typeSubView.setCurrentIndex(session.currentIndex);
	typeSubView.setCallbacks({
		onClick: (index) => {
			tv.goToSentence(index);
		},
		onSpeedChange: (rate) => {
			videoView.setPlaybackRate(rate);
		},
	});

	// Reveal previously completed sentences
	for (let i = 0; i < session.sentences.length; i++) {
		if (session.sentences[i]?.completedAt) {
			typeSubView.revealSentence(i);
		}
	}

	// Wire type → session persistence + subtitle sync
	tv.setCallbacks({
		onSave: (s) => {
			tv.updateSession(s);
			void getManager(plugin).save(s);
		},
		onReplaySentence: (start, end) => {
			videoView.playRangeOnce(start, end);
		},
		onSentenceChange: (subtitleId) => {
			videoView.setABLoop(null, null, false);
			const idx = subtitles.findIndex((s) => s.id === subtitleId);
			if (idx >= 0) {
				typeSubView.setCurrentIndex(idx);
				videoView.playRangeOnce(subtitles[idx]!.start, subtitles[idx]!.end);
			}
		},
		onSentenceComplete: (index) => {
			typeSubView.revealSentence(index);
		},
	});
	tv.loadSession(subtitles, session);

	// Play the current sentence on open. Must happen before
	// layout-change handlers fire, otherwise they'll restore the
	// previously saved playback position for this video.
	const currentSub = subtitles[session.currentIndex];
	if (currentSub) {
		videoView.playRangeOnce(currentSub.start, currentSub.end);
	}

	// Sync video subtitle changes to the subtitle panel only
	videoView.setSubtitleChangeCallback((id: number) => {
		const idx = subtitles.findIndex((s) => s.id === id);
		if (idx >= 0) {
			typeSubView.setCurrentIndex(idx);
			// type page drives navigation, not video
		}
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

	plugin.activeTypeSessionId = session.id;
	await plugin.saveSettings();

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

	plugin.activeTypeSessionId = session.id;
	await plugin.saveSettings();

	new Notice(`Type session resumed — sentence ${session.currentIndex + 1}/${subtitles.length}`);
}

/**
 * Restore a type session after Obsidian reload. Called from trySetupSync()
 * when the workspace has type-mode leaves but they have no data loaded.
 *
 * Polls until all three views are initialized (layout-change may fire
 * before every view's onOpen() completes), then loads session data.
 *
 * Returns true if restore succeeded, false if it permanently failed
 * (session deleted, subtitle file missing, etc.). On permanent failure,
 * clears activeTypeSessionId so it won't keep retrying.
 */
export async function tryRestoreTypeSession(plugin: DialPlugin): Promise<boolean> {
	// Wait for all required views to be initialized.
	// On reload, the first layout-change can fire before every leaf's view
	// is constructed. Poll at 100ms intervals for up to 3 seconds.
	let typeSubView: TypeSubtitleView | null = null;
	let typeView: TypeView | null = null;
	let videoView: VideoPlayerView | null = null;

	for (let attempt = 0; attempt < 30; attempt++) {
		const subV = plugin.app.workspace.getLeavesOfType(TYPE_SUBTITLE_VIEW_TYPE).first()?.view;
		const tV = plugin.app.workspace.getLeavesOfType(TYPE_VIEW_TYPE).first()?.view;
		const vV = plugin.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).first()?.view;

		typeSubView = subV instanceof TypeSubtitleView ? subV : null;
		typeView = tV instanceof TypeView ? tV : null;
		videoView = vV instanceof VideoPlayerView ? vV : null;

		if (typeSubView && typeView && videoView) break;
		await new Promise((r) => setTimeout(r, 100));
	}

	if (!typeSubView || !typeView || !videoView) return false;

	// Already restored — prevent double execution from concurrent calls
	if (typeSubView.hasData()) return true;

	const mgr = getManager(plugin);
	const session = await mgr.load(plugin.activeTypeSessionId!);
	if (!session) {
		plugin.activeTypeSessionId = null;
		await plugin.saveSettings();
		return false;
	}

	const subtitles = await loadSubtitles(plugin, session.subtitlePath);
	if (!subtitles) {
		plugin.activeTypeSessionId = null;
		await plugin.saveSettings();
		return false;
	}

	// Wire video
	await videoView.loadVideo(session.videoPath, plugin.settings.defaultVolume);
	videoView.setSubtitles(subtitles);
	plugin.setSubtitles(subtitles);

	// Wire type subtitle panel
	if (!typeSubView.hasData()) {
		typeSubView.setSubtitles(subtitles);
		typeSubView.setCurrentIndex(session.currentIndex);
	}
	typeSubView.setCallbacks({
		onClick: (index) => {
			typeView.goToSentence(index);
		},
		onSpeedChange: (rate) => {
			videoView.setPlaybackRate(rate);
		},
	});

	// Reveal previously completed sentences
	for (let i = 0; i < session.sentences.length; i++) {
		if (session.sentences[i]?.completedAt) {
			typeSubView.revealSentence(i);
		}
	}

	// Wire type page → session persistence + subtitle sync
	typeView.setCallbacks({
		onSave: (s) => {
			typeView.updateSession(s);
			void mgr.save(s);
		},
		onReplaySentence: (start, end) => {
			videoView.playRangeOnce(start, end);
		},
		onSentenceChange: (subtitleId) => {
			videoView.setABLoop(null, null, false);
			const idx = subtitles.findIndex((s) => s.id === subtitleId);
			if (idx >= 0) {
				typeSubView.setCurrentIndex(idx);
				videoView.playRangeOnce(subtitles[idx]!.start, subtitles[idx]!.end);
			}
		},
		onSentenceComplete: (index) => {
			typeSubView.revealSentence(index);
		},
	});
	if (!typeView.hasData()) {
		typeView.loadSession(subtitles, session);
	}

	// Position video at current sentence
	const currentSub = subtitles[session.currentIndex];
	if (currentSub) {
		videoView.jumpToTime(currentSub.start);
	}

	// Sync video subtitle changes → subtitle panel only (not type page)
	videoView.setSubtitleChangeCallback((id: number) => {
		const idx = subtitles.findIndex((s) => s.id === id);
		if (idx >= 0) {
			typeSubView.setCurrentIndex(idx);
		}
	});

	// Re-apply split ratio after DOM settles
	setTimeout(() => {
		applySplitRatio(typeView.containerEl, [2, 8]);
		typeView.focus();
	}, 200);

	return true;
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
