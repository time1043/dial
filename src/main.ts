import { Notice, Plugin, TFile } from 'obsidian';

import type { DialSettings } from './settings';
import type { ABLoopState, Subtitle } from './types';

import { createVideoNote } from './commands/create-video-note';
import { insertTimestamp } from './commands/insert-timestamp';
import { openVideoPlayer, setupSync } from './commands/open-player';
import { openUrlPlayerPrompt } from './commands/open-url-player';
import { openTrace } from './commands/open-trace';
import {
	openTypeSession,
	resumeTypeSession,
	tryRestoreTypeSession,
} from './commands/open-type-session';
import { togglePlay } from './commands/toggle-play';
import { AbLoopManager } from './modules/ab-loop/ab-loop-manager';
import { PositionManager } from './modules/position-manager/position-manager';
import { getJumpTarget } from './modules/subtitle-navigator/subtitle-navigator';
import { TraceManager } from './modules/trace-manager/trace-manager';
import { DEFAULT_SETTINGS, DialSettingTab } from './settings';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from './ui/subtitle-view';
import { TYPE_SUBTITLE_VIEW_TYPE, TypeSubtitleView } from './ui/type-subtitle-view';
import { TYPE_VIEW_TYPE, TypeView } from './ui/type-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from './ui/video-player-view';
import { URL_PLAYER_VIEW_TYPE, UrlPlayerView } from './ui/url-player-view';
import { applySplitRatio } from './utils/layout';
import { formatTime } from './utils/time';

export default class DialPlugin extends Plugin {
	settings: DialSettings = DEFAULT_SETTINGS;

	readonly positions = new PositionManager();

	readonly abLoop = new AbLoopManager();

	readonly trace = new TraceManager();
	private subtitles: Subtitle[] = [];
	activeNotePath: string | null = null;
	activeTypeSessionId: string | null = null;

	async onload(): Promise<void> {
		await this.loadPersistedData();
		this.positions.setPersistCallback(() => this.persistAll());

		this.registerView(VIDEO_PLAYER_VIEW_TYPE, (leaf) => new VideoPlayerView(leaf));
		this.registerView(URL_PLAYER_VIEW_TYPE, (leaf) => new UrlPlayerView(leaf));
		this.registerView(SUBTITLE_VIEW_TYPE, (leaf) => new SubtitleView(leaf));
		this.registerView(TYPE_SUBTITLE_VIEW_TYPE, (leaf) => new TypeSubtitleView(leaf));
		this.registerView(TYPE_VIEW_TYPE, (leaf) => new TypeView(leaf));

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
			callback: () => openUrlPlayerPrompt(this),
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
				const view = this.getVideoView();
				if (view) {
					const state = this.abLoop.setPointA(view.getCurrentTime());
					this.syncABToViews(state);
					new Notice(`A: ${formatTime(state.a!)}`);
				}
			},
		});

		this.addCommand({
			id: 'set-ab-loop-b',
			name: 'Set loop end point',
			callback: () => {
				const view = this.getVideoView();
				if (view) {
					const { state, error } = this.abLoop.setPointB(view.getCurrentTime());
					if (error) {
						new Notice(error);
					} else {
						this.syncABToViews(state);
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

		this.addSettingTab(new DialSettingTab(this.app, this));

		// Re-wire sync after vault reload restores views.
		// layout-change may fire before every view's onOpen() completes,
		// so tryRestoreTypeSession polls internally until views are ready.

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.trySetupSync();
			}),
		);

		// Handle obsidian://dial?note=path&seconds=N and obsidian://dial?type=id links
		this.registerObsidianProtocolHandler('dial', async (params) => {
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
		// Save playback position for all open video views
		for (const leaf of this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof VideoPlayerView) {
				const path = view.getVideoPath();
				const time = view.getCurrentTime();
				if (path) {
					this.positions.save(path, time);
				}
			}
		}
		this.persistAll();
	}

	private trySetupSync(): void {
		// Type mode — restore session data into views that have no
		// getState/setState persistence. Polls internally until all
		// views are ready, harmless to call multiple times.
		if (this.activeTypeSessionId) {
			void tryRestoreTypeSession(this);
		}

		const videoView = this.getVideoView();
		if (!(videoView instanceof VideoPlayerView)) return;

		const subtitleView = this.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
		if (subtitleView instanceof SubtitleView) {
			setupSync(this, videoView, subtitleView, this.activeNotePath ?? undefined);
			this.setSubtitles(subtitleView.getSubtitles());
		}

		// Restore playback position and volume after vault reload
		videoView.setVolume(this.settings.defaultVolume);
		const path = videoView.getVideoPath();
		if (path && videoView.getCurrentTime() === 0) {
			const savedTime = this.positions.restore(path);
			if (savedTime !== null) {
				videoView.jumpToTime(savedTime);
			}
		}

		// Re-apply split ratio after DOM is ready
		const splitRatio: [number, number] = [2, 8];
		setTimeout(() => {
			const refEl =
				subtitleView instanceof SubtitleView
					? subtitleView.containerEl
					: videoView.containerEl;
			applySplitRatio(refEl, splitRatio);
			if (subtitleView instanceof SubtitleView) {
				(subtitleView.containerEl.children[1] as HTMLElement)?.focus();
			}
		}, 100);
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
		this.activeTypeSessionId = (data['activeTypeSessionId'] as string | null) ?? null;
	}

	async saveSettings(): Promise<void> {
		this.persistAll();
	}

	applyVolume(volume: number): void {
		const view = this.getVideoView();
		if (view) {
			view.setVolume(volume);
		}
	}

	private persistAll(): void {
		void this.saveData({
			settings: this.settings,
			positions: this.positions.getAll(),
			activeTypeSessionId: this.activeTypeSessionId,
		});
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
	}

	jumpSubtitle(direction: number): void {
		const videoView = this.getVideoView();
		if (!videoView) return;
		const target = getJumpTarget(this.subtitles, videoView.getCurrentTime(), direction);
		if (target) {
			videoView.jumpToTime(target.start);
			videoView.play();
		}
	}

	private getVideoView(): VideoPlayerView | null {
		const view = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).first()?.view;
		return view instanceof VideoPlayerView ? view : null;
	}

	private syncABToViews(state: ABLoopState): void {
		const videoView = this.getVideoView();
		videoView?.setABLoop(state.a, state.b, state.active);
		const subtitleView = this.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
		if (subtitleView instanceof SubtitleView) {
			subtitleView.setABLoopState(state);
		}
	}
}
