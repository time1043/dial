import { Notice, Plugin } from 'obsidian';

import type { DialSettings } from './settings';
import type { ABLoopState, Subtitle } from './types';

import { createVideoNote } from './commands/create-video-note';
import { openVideoPlayer, setupSync } from './commands/open-player';
import { AbLoopManager } from './modules/ab-loop/ab-loop-manager';
import { PositionManager } from './modules/position-manager/position-manager';
import { getJumpTarget } from './modules/subtitle-navigator/subtitle-navigator';
import { DEFAULT_SETTINGS, DialSettingTab } from './settings';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from './ui/subtitle-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from './ui/video-player-view';
import { applySplitRatio } from './utils/layout';
import { formatTime } from './utils/time';

export default class DialPlugin extends Plugin {
	settings: DialSettings = DEFAULT_SETTINGS;

	readonly positions = new PositionManager();

	readonly abLoop = new AbLoopManager();
	private subtitles: Subtitle[] = [];

	async onload(): Promise<void> {
		await this.loadPersistedData();
		this.positions.setPersistCallback(() => this.persistAll());

		this.registerView(VIDEO_PLAYER_VIEW_TYPE, (leaf) => new VideoPlayerView(leaf));
		this.registerView(SUBTITLE_VIEW_TYPE, (leaf) => new SubtitleView(leaf));

		this.addRibbonIcon('play', 'Dial', () => {
			void openVideoPlayer(this);
		});

		this.addCommand({
			id: 'open-video-player',
			name: 'Open video player',
			callback: () => openVideoPlayer(this),
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

		this.addSettingTab(new DialSettingTab(this.app, this));

		// Re-wire sync after vault reload restores views
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.trySetupSync();
			}),
		);
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
		const videoView = this.getVideoView();
		const subtitleView = this.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
		if (videoView instanceof VideoPlayerView && subtitleView instanceof SubtitleView) {
			setupSync(this, videoView, subtitleView);

			// Restore playback position after vault reload
			const path = videoView.getVideoPath();
			if (path && videoView.getCurrentTime() === 0) {
				const savedTime = this.positions.restore(path);
				if (savedTime !== null) {
					videoView.jumpToTime(savedTime);
				}
			}

			// Re-apply 2:8 split ratio after DOM is ready
			setTimeout(() => {
				applySplitRatio(subtitleView.containerEl, [2, 8]);
				(subtitleView.containerEl.children[1] as HTMLElement)?.focus();
			}, 100);
		}
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
	}

	async saveSettings(): Promise<void> {
		this.persistAll();
	}

	private persistAll(): void {
		void this.saveData({
			settings: this.settings,
			positions: this.positions.getAll(),
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
