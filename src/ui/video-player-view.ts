import { ItemView, Notice, Platform, TFile, WorkspaceLeaf } from 'obsidian';

import type { ABLoopState, Subtitle } from '@/types';

import { SubtitlePanel } from './subtitle-panel';

export const VIDEO_PLAYER_VIEW_TYPE = 'dial-video-player';

export class VideoPlayerView extends ItemView {
	private videoEl: HTMLVideoElement | null = null;
	private videoPath: string | null = null;
	private subtitles: Subtitle[] = [];
	private currentSubtitleId: number = -1;
	private abLoop: ABLoopState = { a: null, b: null, active: false };
	private onTimeUpdate: ((time: number) => void) | null = null;
	private onSubtitleChange: ((id: number) => void) | null = null;
	private onPlayStateChange: ((isPlaying: boolean) => void) | null = null;
	private savePositionCallback: ((time: number) => void) | null = null;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private panel: SubtitlePanel | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIDEO_PLAYER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Video player';
	}

	getIcon(): string {
		return 'play';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass('dial-video-container');

		this.videoEl = container.createEl('video', {
			cls: 'dial-video',
		});
		this.videoEl.controls = true;
		this.videoEl.preload = 'auto';

		this.videoEl.addEventListener('timeupdate', () => {
			if (!this.videoEl) return;
			const time = this.videoEl.currentTime;

			this.onTimeUpdate?.(time);

			const sub = this.findSubtitleAt(time);
			if (sub && sub.id !== this.currentSubtitleId) {
				this.currentSubtitleId = sub.id;
				this.onSubtitleChange?.(sub.id);
			}

			// AB loop enforcement: seek back to A when outside A-B range
			if (this.abLoop.active && this.abLoop.a !== null && this.abLoop.b !== null) {
				if (time < this.abLoop.a || time >= this.abLoop.b) {
					this.videoEl.currentTime = this.abLoop.a;
				}
			}
		});

		this.videoEl.addEventListener('pause', () => {
			this.debouncedSavePosition();
			this.onPlayStateChange?.(false);
		});

		this.videoEl.addEventListener('play', () => {
			this.onPlayStateChange?.(true);
		});

		// Mobile: embed full subtitle panel below video
		if (Platform.isMobile) {
			(container as HTMLElement).addClass('dial-video-mobile');
			this.panel = new SubtitlePanel(container as HTMLElement);
			this.panel.setCallbacks({
				onSubtitleClick: (sub) => {
					this.jumpToTime(sub.start);
					this.play();
				},
				onSetA: (time) => {
					const state = { a: time, b: null, active: false };
					this.abLoop = state;
					return state;
				},
				onSetB: (time) => {
					const state = { a: this.abLoop.a, b: time, active: true };
					this.abLoop = state;
					return state;
				},
				onClearAB: () => {
					const state = { a: null, b: null, active: false };
					this.abLoop = state;
					return state;
				},
				onGetCurrentTime: () => this.getCurrentTime(),
				onTogglePlay: () => this.togglePlay(),
				onSpeedChange: (rate) => this.setPlaybackRate(rate),
			});
		}
	}

	async onClose(): Promise<void> {
		this.savePositionImmediate();
		this.videoEl = null;
	}

	async loadVideo(path: string, volume = 1): Promise<void> {
		if (!this.videoEl) return;
		this.videoPath = path;
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				new Notice(`Video file not found: ${path}`);
				return;
			}

			// Use resource URL for streaming — avoids loading the entire file into memory
			const resourcePath = this.app.vault.getResourcePath(file);

			this.videoEl.muted = false;
			this.videoEl.volume = Math.min(1, Math.max(0, volume));
			this.videoEl.src = resourcePath;
			this.videoEl.onerror = () => {
				const err = this.videoEl?.error;
				new Notice(`Video load error: ${err?.message ?? 'unknown'}`);
			};
			this.videoEl.load();
		} catch {
			new Notice(`Cannot read video file: ${path}`);
		}
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
		this.panel?.setSubtitles(subtitles);
	}

	setCurrentSubtitle(id: number): void {
		this.panel?.setCurrentSubtitle(id);
	}

	setPlayState(isPlaying: boolean): void {
		this.panel?.setPlayState(isPlaying);
	}

	setSubtitleChangeCallback(cb: (id: number) => void): void {
		this.onSubtitleChange = cb;
	}

	setPlayStateCallback(cb: (isPlaying: boolean) => void): void {
		this.onPlayStateChange = cb;
	}

	setSavePositionCallback(cb: (time: number) => void): void {
		this.savePositionCallback = cb;
	}

	private debouncedSavePosition(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.savePositionImmediate();
		}, 1000);
	}

	private savePositionImmediate(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.videoEl && this.videoPath && this.savePositionCallback) {
			this.savePositionCallback(this.videoEl.currentTime);
		}
	}

	jumpToTime(time: number): void {
		if (!this.videoEl) return;
		this.videoEl.currentTime = time;
	}

	play(): void {
		void this.videoEl?.play();
	}

	togglePlay(): void {
		if (!this.videoEl) return;
		if (this.videoEl.paused) {
			void this.videoEl.play();
		} else {
			this.videoEl.pause();
		}
	}

	setABLoop(a: number | null, b: number | null, active: boolean): void {
		this.abLoop = { a, b, active };
	}

	getCurrentTime(): number {
		return this.videoEl?.currentTime ?? 0;
	}

	/** Returns the subtitle start time if currently within a subtitle line, otherwise null. */
	getCurrentSubtitleStartTime(): number | null {
		const time = this.getCurrentTime();
		const sub = this.subtitles.find((s) => time >= s.start && time <= s.end);
		return sub?.start ?? null;
	}

	getVideoPath(): string | null {
		return this.videoPath;
	}

	setPlaybackRate(rate: number): void {
		if (this.videoEl) {
			this.videoEl.playbackRate = rate;
		}
	}

	getPlaybackRate(): number {
		return this.videoEl?.playbackRate ?? 1;
	}

	changeVolume(delta: number): void {
		if (!this.videoEl) return;
		this.videoEl.volume = Math.min(1, Math.max(0, this.videoEl.volume + delta));
	}

	getVolume(): number {
		return this.videoEl?.volume ?? 1;
	}

	setVolume(volume: number): void {
		if (this.videoEl) {
			this.videoEl.volume = Math.min(1, Math.max(0, volume));
		}
	}

	toggleMute(): void {
		if (!this.videoEl) return;
		this.videoEl.muted = !this.videoEl.muted;
	}

	isMuted(): boolean {
		return this.videoEl?.muted ?? false;
	}

	getState(): Record<string, unknown> {
		return {
			videoPath: this.videoPath,
			subtitles: this.subtitles,
		};
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		const { videoPath, subtitles } = state as {
			videoPath: string | undefined;
			subtitles: Subtitle[] | undefined;
		};
		if (videoPath) {
			this.videoPath = videoPath;
			await this.loadVideo(videoPath);
		}
		if (subtitles) {
			this.subtitles = subtitles;
			this.panel?.setSubtitles(subtitles);
		}
	}

	private findSubtitleAt(time: number): Subtitle | null {
		// Binary search: find the last subtitle with start <= time
		const subs = this.subtitles;
		let lo = 0;
		let hi = subs.length - 1;
		let result: Subtitle | null = null;

		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const sub = subs[mid]!;
			if (time >= sub.start && time <= sub.end) {
				return sub; // exact match
			}
			if (sub.start < time) {
				result = sub;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		return result;
	}
}
