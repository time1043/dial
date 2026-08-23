import { Notice, Plugin, TFile } from 'obsidian';

import type { DialSettings } from './settings';
import type { LoopMode, Subtitle } from './types';

import { createVideoNote } from './commands/create-video-note';
import { insertTimestamp } from './commands/insert-timestamp';
import { openVideoPlayer } from './commands/open-player';
import { openTrace } from './commands/open-trace';
import { openTypeSession, resumeTypeSession } from './commands/open-type-session';
import { openUrlPlayerFromActiveNote } from './commands/open-url-player';
import { togglePlay } from './commands/toggle-play';
import {
	createWordBook,
	flipWords,
	flipWordsChooseBook,
	flipWordsFromActiveFile,
	resumeWordFlip,
} from './commands/word-flip';
import {
	getSubtitleView,
	getVideoView,
	syncABToViews,
	trySetupSync,
} from './core/sync-orchestrator';
import { AbLoopManager } from './modules/ab-loop/ab-loop-manager';
import {
	resolveAllPlaylist,
	resolveFolderPlaylist,
	type FolderPlaylist,
} from './modules/episode-navigator';
import { PositionManager } from './modules/position-manager/position-manager';
import { getJumpTarget } from './modules/subtitle-navigator/subtitle-navigator';
import { parseSubtitle } from './modules/subtitle-parsers';
import { TraceManager } from './modules/trace-manager/trace-manager';
import { AudioCache } from './modules/word-cache/audio-cache';
import { VaultCacheFileStore } from './modules/word-cache/file-store';
import { QueryLogger } from './modules/word-cache/query-logger';
import { TranslateCache } from './modules/word-cache/translate-cache';
import { WordFlipStore } from './modules/word-flip/flip-store';
import { DEFAULT_SETTINGS, DialSettingTab, subtitlePanelVisibility } from './settings';
import { DialApiKeysTab } from './api-keys-tab';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from './ui/subtitle-view';
import { TYPE_SUBTITLE_VIEW_TYPE, TypeSubtitleView } from './ui/type-subtitle-view';
import { TYPE_VIEW_TYPE, TypeView } from './ui/type-view';
import { URL_PLAYER_VIEW_TYPE, UrlPlayerView } from './ui/url-player-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from './ui/video-player-view';
import { WORD_FLIP_VIEW_TYPE, WordFlipView } from './ui/word-flip-view';
import { formatTime } from './utils/time';
import { resolveMediaPaths } from './vault/paths';

export default class DialPlugin extends Plugin {
	settings: DialSettings = DEFAULT_SETTINGS;

	readonly positions = new PositionManager();

	readonly abLoop = new AbLoopManager();

	readonly trace = new TraceManager();

	readonly wordFlip = new WordFlipStore();

	private cacheFileStore?: VaultCacheFileStore;
	private translateCacheInstance?: TranslateCache;
	private audioCacheInstance?: AudioCache;
	private queryLoggerInstance?: QueryLogger;

	/** Append-only query log under `_lib/logs`, one JSONL per month. */
	get queryLogger(): QueryLogger {
		this.queryLoggerInstance ??= new QueryLogger(this.wordCacheStore);
		return this.queryLoggerInstance;
	}

	/** Month-tiered translation cache, shared by every panel and view. */
	get translateCache(): TranslateCache {
		this.translateCacheInstance ??= new TranslateCache(this.wordCacheStore);
		return this.translateCacheInstance;
	}

	/** Month-tiered audio cache for cloud TTS replay. */
	get audioCache(): AudioCache {
		this.audioCacheInstance ??= new AudioCache(this.wordCacheStore);
		return this.audioCacheInstance;
	}

	private get wordCacheStore(): VaultCacheFileStore {
		this.cacheFileStore ??= new VaultCacheFileStore(this.app.vault, this.app.fileManager);
		return this.cacheFileStore;
	}

	private subtitles: Subtitle[] = [];
	activeNotePath: string | null = null;
	activeTypeSessionId: string | null = null;
	/**
	 * Guards the single-episode fallback Notice so a one-item folder does not
	 * re-notify on every loop. Reset whenever a new video is opened.
	 */
	singleLoopNotified = false;

	async onload(): Promise<void> {
		await this.loadPersistedData();
		this.positions.setPersistCallback(() => this.persistAll());
		this.wordFlip.setPersistCallback(() => this.persistAll());

		this.registerView(VIDEO_PLAYER_VIEW_TYPE, (leaf) => new VideoPlayerView(leaf, this));
		this.registerView(URL_PLAYER_VIEW_TYPE, (leaf) => new UrlPlayerView(leaf));
		this.registerView(SUBTITLE_VIEW_TYPE, (leaf) => new SubtitleView(leaf, this));
		this.registerView(TYPE_SUBTITLE_VIEW_TYPE, (leaf) => new TypeSubtitleView(leaf));
		this.registerView(TYPE_VIEW_TYPE, (leaf) => new TypeView(leaf));
		this.registerView(WORD_FLIP_VIEW_TYPE, (leaf) => new WordFlipView(leaf, this));

		this.addRibbonIcon('play', 'Dial', () => {
			void openVideoPlayer(this);
		});

		this.addCommand({
			id: 'open-video-player',
			name: 'Open video player with local video and local subtitle',
			callback: () => openVideoPlayer(this),
		});

		this.addCommand({
			id: 'open-video-player-url',
			name: 'Open video player with video URL',
			callback: () => void openUrlPlayerFromActiveNote(this),
		});

		this.addCommand({
			id: 'open-type-session',
			name: 'Open type session',
			callback: () => openTypeSession(this),
		});

		this.addCommand({
			id: 'create-video-note',
			name: 'Create video note',
			callback: () => createVideoNote(this),
		});

		this.addCommand({
			id: 'set-ab-loop-a',
			name: 'Set loop start point',
			callback: () => {
				const view = getVideoView(this);
				if (view) {
					const state = this.abLoop.setPointA(view.getCurrentTime());
					syncABToViews(this, state);
					new Notice(`A: ${formatTime(state.a!)}`);
				}
			},
		});

		this.addCommand({
			id: 'set-ab-loop-b',
			name: 'Set loop end point',
			callback: () => {
				const view = getVideoView(this);
				if (view) {
					const { state, error } = this.abLoop.setPointB(view.getCurrentTime());
					if (error) {
						new Notice(error);
					} else {
						syncABToViews(this, state);
						new Notice(`Loop: ${formatTime(state.a!)} → ${formatTime(state.b!)}`);
					}
				}
			},
		});

		this.addCommand({
			id: 'toggle-ab-loop',
			name: 'Toggle loop',
			callback: () => {
				const view = this.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
				if (view instanceof SubtitleView) {
					view.toggleAbLoop();
				}
			},
		});

		this.addCommand({
			id: 'insert-timestamp',
			name: 'Insert video timestamp',
			callback: () => insertTimestamp(this),
		});

		this.addCommand({
			id: 'toggle-play',
			name: 'Toggle play/pause',
			callback: () => togglePlay(this),
		});

		this.addCommand({
			id: 'open-trace',
			name: 'Open trace',
			callback: () => openTrace(this),
		});

		this.addCommand({
			id: 'word-flip-open',
			name: 'Flip words',
			callback: () => void flipWords(this),
		});

		this.addCommand({
			id: 'word-flip-open-current',
			name: 'Flip words: from the active book',
			callback: () => void flipWordsFromActiveFile(this),
		});

		this.addCommand({
			id: 'word-flip-choose-book',
			name: 'Flip words: choose a book',
			callback: () => void flipWordsChooseBook(this),
		});

		this.addCommand({
			id: 'word-flip-create-book',
			name: 'New word book',
			callback: () => void createWordBook(this),
		});

		this.addSettingTab(new DialSettingTab(this.app, this));
		this.addSettingTab(new DialApiKeysTab(this.app, this));

		// Re-wire sync after vault reload restores views.
		// layout-change may fire before every view's onOpen() completes,
		// so tryRestoreTypeSession polls internally until views are ready.

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				trySetupSync(this);
			}),
		);

		// Handle obsidian://dial?note=path&seconds=N and obsidian://dial?type=id links
		this.registerObsidianProtocolHandler('dial', async (params) => {
			// Word flip resume (journey file quick link) — browse mode
			if (params.type === 'word-flip') {
				await resumeWordFlip(this, params.book, params.index);
				return;
			}

			// Type session resume
			if (params.type) {
				await resumeTypeSession(this, params.type);
				return;
			}

			const seconds = Number(params.seconds);
			if (isNaN(seconds)) return;

			// If note param is provided, open that note first
			if (params.note) {
				const notePath = decodeURIComponent(params.note);
				const noteFile = this.app.vault.getAbstractFileByPath(notePath);
				if (noteFile instanceof TFile) {
					await this.app.workspace.openLinkText(notePath, '', false);
				}
			}

			const videoLeaf = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).first();
			if (videoLeaf?.view instanceof VideoPlayerView) {
				await this.app.workspace.revealLeaf(videoLeaf);
				videoLeaf.view.jumpToTime(seconds);
				videoLeaf.view.play();
				return;
			}

			// Video not open — try to open it from the active note's frontmatter
			await openVideoPlayer(this);
			const leaf = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).first();
			if (leaf?.view instanceof VideoPlayerView) {
				await this.app.workspace.revealLeaf(leaf);
				leaf.view.jumpToTime(seconds);
				leaf.view.play();
			}
		});
	}

	onunload(): void {
		// Persist playback position for all open video views. A video that has
		// already ended is treated as finished — clear its resume point so it
		// restarts from the beginning next time instead of stalling at the end.
		for (const leaf of this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof VideoPlayerView) {
				const path = view.getVideoPath();
				if (!path) continue;
				if (view.isEnded()) {
					this.positions.clear(path);
				} else {
					this.positions.save(path, view.getCurrentTime());
				}
			}
		}
		this.persistAll();
	}

	private async loadPersistedData(): Promise<void> {
		const data = (await this.loadData()) as Record<string, unknown> | null;
		if (!data) return;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data['settings'] as Partial<DialSettings> | undefined,
		);
		this.positions.load((data['positions'] as Record<string, number> | undefined) ?? {});
		this.wordFlip.load(data['wordFlip']);
		this.activeTypeSessionId = (data['activeTypeSessionId'] as string | null) ?? null;
	}

	async saveSettings(): Promise<void> {
		this.persistAll();
	}

	applyVolume(volume: number): void {
		const view = getVideoView(this);
		if (view) {
			view.setVolume(volume);
		}
	}

	applyLoopMode(mode: LoopMode): void {
		const view = getVideoView(this);
		if (view) {
			view.setLoopMode(mode);
		}
	}

	/**
	 * Push the current subtitle panel visibility flags to every open panel.
	 *
	 * Called from the settings tab toggles so that showing/hiding the AB loop,
	 * speed, or search controls takes effect immediately on already-open
	 * SubtitleView and VideoPlayerView instances — without reopening them.
	 * Iterates all leaves (not just the first) so multiple open panels update.
	 */
	applySubtitlePanelVisibility(): void {
		const visibility = subtitlePanelVisibility(this.settings);
		for (const leaf of this.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE)) {
			if (leaf.view instanceof SubtitleView) {
				leaf.view.updateVisibility(visibility);
			}
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE)) {
			if (leaf.view instanceof VideoPlayerView) {
				leaf.view.updateVisibility(visibility);
			}
		}
	}

	/**
	 * Advance to the next episode when the current video finishes naturally.
	 *
	 * Both `folder` and `all` loop modes are wired: `folder` resolves the
	 * depth-ascended parent subtree, `all` resolves the configured all-files
	 * root via resolveAllPlaylist. The teardown is deferred via setTimeout in
	 * wireVideoEnd, so this runs outside the video element's own `ended` handler.
	 *
	 * The next episode is swapped into the existing views in place (see
	 * openNextEpisode) rather than torn down and re-opened. That avoids both
	 * the layout flicker and the active-note navigation bug that the old
	 * openLinkText-based approach suffered from.
	 */
	async advanceToNextNote(): Promise<void> {
		const mode = this.settings.loopMode;
		if (mode !== 'folder' && mode !== 'all') return;

		const current = this.activeNotePath;
		if (!current) return;

		let playlist: FolderPlaylist | null = null;
		if (mode === 'folder') {
			playlist = await resolveFolderPlaylist(
				this,
				current,
				this.settings.folderOrderMode,
				this.settings.folderLoopDepth,
			);
		} else {
			playlist = await resolveAllPlaylist(
				this,
				current,
				this.settings.allFilesOrderMode,
				this.settings.allFilesRoot,
			);
		}
		if (!playlist) return;
		if (playlist.currentIndex < 0) return;

		// Single-item scope: to save resources, do not tear down and reopen —
		// honor "loop" semantics by replaying the current video instead.
		if (playlist.notes.length <= 1) {
			this.loopCurrentEpisode();
			return;
		}

		const nextPath = playlist.notes[(playlist.currentIndex + 1) % playlist.notes.length];
		if (!nextPath || nextPath === current) return;

		// Reset AB loop so stale points don't carry into the next episode.
		syncABToViews(this, this.abLoop.clear());

		await this.openNextEpisode(nextPath);
	}

	/**
	 * Swap the currently playing episode in place: keep the existing video and
	 * subtitle views (no leaf teardown, no layout flicker) and load the next
	 * note's media into them.
	 *
	 * We intentionally do NOT change the active Obsidian file. In the desktop
	 * layout the active leaf is the custom SubtitleView, so navigating via
	 * openLinkText would target that leaf and never actually switch the note —
	 * which is exactly what broke auto-advance before. The plugin tracks the
	 * playing note through `activeNotePath`, which we update here.
	 */
	private async openNextEpisode(nextPath: string): Promise<void> {
		const videoView = getVideoView(this);
		if (!videoView) {
			// Views missing (shouldn't happen) — fall back to a full reopen.
			this.activeNotePath = nextPath;
			await openVideoPlayer(this);
			return;
		}

		// The outgoing episode finished — drop its resume point rather than
		// stamping it with the end time, so it restarts from the beginning next
		// time. handleVideoEnd already cleared it; this guards the swap path.
		const oldPath = videoView.getVideoPath();
		if (oldPath) {
			this.positions.clear(oldPath);
			if (this.activeNotePath) {
				void this.trace.saveTrace(
					this.app.vault,
					this.activeNotePath,
					videoView.getCurrentTime(),
				);
			}
		}

		const paths = await resolveMediaPaths(this, nextPath);
		if (!paths) return;
		const { videoPath, subtitlePath } = paths;

		const subtitleTFile = this.app.vault.getAbstractFileByPath(subtitlePath);
		if (!(subtitleTFile instanceof TFile)) {
			new Notice('Subtitle file not found for next episode.');
			return;
		}
		let subtitleBuffer: ArrayBuffer;
		try {
			subtitleBuffer = await this.app.vault.readBinary(subtitleTFile);
		} catch {
			new Notice('Failed to read next subtitle file.');
			return;
		}
		let subtitles: Subtitle[];
		try {
			subtitles = parseSubtitle(subtitleBuffer, subtitlePath);
		} catch (e) {
			new Notice(`Subtitle parse error: ${e instanceof Error ? e.message : String(e)}`);
			return;
		}
		if (subtitles.length === 0) {
			new Notice('No subtitles found in next episode');
			return;
		}

		// Update the playing-note pointer and re-arm the single-loop guard.
		this.activeNotePath = nextPath;
		this.singleLoopNotified = false;

		// Swap media into the existing views.
		await videoView.loadVideo(videoPath, this.settings.defaultVolume);
		videoView.setSubtitles(subtitles);

		const subtitleView = getSubtitleView(this);
		subtitleView?.setSubtitles(subtitles);
		this.setSubtitles(subtitles);

		// Restore saved position for the new video, if any.
		const savedTime = this.positions.restore(videoPath);
		if (savedTime !== null) {
			videoView.jumpToTime(savedTime);
		}

		// Auto-play the next episode if enabled (independent of focus).
		if (this.settings.autoPlay) {
			videoView.play();
		}
	}

	/**
	 * Single-episode fallback: replay the current video from the start and
	 * notify once (per open) that the folder has only one episode.
	 */
	private loopCurrentEpisode(): void {
		const view = getVideoView(this);
		if (view) {
			view.jumpToTime(0);
			view.play();
		}
		if (!this.singleLoopNotified) {
			this.singleLoopNotified = true;
			new Notice('Only one episode in this loop scope — looping single episode.');
		}
	}

	/**
	 * Preview the next episode ~5s before the current one ends (wired to the
	 * video view's near-end callback). Resolves the same playlist used by
	 * advanceToNextNote so the preview matches what will actually play.
	 */
	async notifyNextEpisode(): Promise<void> {
		const mode = this.settings.loopMode;
		if (mode !== 'folder' && mode !== 'all') return;
		const current = this.activeNotePath;
		if (!current) return;

		let playlist: FolderPlaylist | null = null;
		if (mode === 'folder') {
			playlist = await resolveFolderPlaylist(
				this,
				current,
				this.settings.folderOrderMode,
				this.settings.folderLoopDepth,
			);
		} else {
			playlist = await resolveAllPlaylist(
				this,
				current,
				this.settings.allFilesOrderMode,
				this.settings.allFilesRoot,
			);
		}
		if (!playlist) return;
		if (playlist.currentIndex < 0) {
			new Notice('Current note is not in the loop playlist.');
			return;
		}
		const nameOf = (p: string): string => p.split('/').pop() ?? p;
		if (playlist.notes.length <= 1) {
			new Notice(`Next up: "${nameOf(current)}" (only one episode — single loop)`);
			return;
		}
		const isLast = playlist.currentIndex === playlist.notes.length - 1;
		const nextPath = playlist.notes[(playlist.currentIndex + 1) % playlist.notes.length]!;
		new Notice(`Next up: "${nameOf(nextPath)}"` + (isLast ? ' (wraps to start)' : ''));
	}

	private persistAll(): void {
		void this.saveData({
			settings: this.settings,
			positions: this.positions.getAll(),
			activeTypeSessionId: this.activeTypeSessionId,
			wordFlip: this.wordFlip.serialize(),
		});
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
	}

	jumpSubtitle(direction: number): void {
		const videoView = getVideoView(this);
		if (!videoView) return;
		const target = getJumpTarget(this.subtitles, videoView.getCurrentTime(), direction);
		if (target) {
			videoView.jumpToTime(target.start);
			videoView.play();
		}
	}
}
