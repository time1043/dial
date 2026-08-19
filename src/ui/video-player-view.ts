import { ItemView, Notice, Platform, TFile, WorkspaceLeaf } from 'obsidian';

import type { ABLoopState, Subtitle } from '@/types';

import { SubtitlePanel } from './subtitle-panel';

export const VIDEO_PLAYER_VIEW_TYPE = 'dial-video-player';

/**
 * Delegation interface for AB loop operations on mobile.
 *
 * On mobile, the SubtitlePanel is created inside VideoPlayerView's onOpen(),
 * so AB loop button presses are handled inline. This interface lets the
 * caller (open-player.ts) route those operations through AbLoopManager
 * so the manager stays the single source of truth.
 */
export interface ABLoopHandler {
	onSetA: (time: number) => ABLoopState;
	onSetB: (time: number) => ABLoopState;
	onClearAB: () => ABLoopState;
}

export class VideoPlayerView extends ItemView {
	private videoEl: HTMLVideoElement | null = null;
	private videoPath: string | null = null;
	private subtitles: Subtitle[] = [];
	private currentSubtitleId: number = -1;
	private abLoopState: ABLoopState = { a: null, b: null, active: false };
	private abLoopHandler: ABLoopHandler | null = null;
	private playOnceEnd: number | null = null;
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

			// Play-once enforcement: pause when reaching end
			if (this.playOnceEnd !== null && time >= this.playOnceEnd) {
				this.videoEl.pause();
				this.videoEl.currentTime = this.playOnceEnd;
				this.playOnceEnd = null;
			}

			// AB loop enforcement: seek back to A when outside A-B range
			if (
				this.abLoopState.active &&
				this.abLoopState.a !== null &&
				this.abLoopState.b !== null
			) {
				if (time < this.abLoopState.a || time >= this.abLoopState.b) {
					this.videoEl.currentTime = this.abLoopState.a;
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
			this.setupMobilePanel(container as HTMLElement);
		}
	}

	/**
	 * Create the embedded SubtitlePanel for mobile and wire its callbacks.
	 * AB loop operations delegate through {@link abLoopHandler} so the
	 * AbLoopManager stays the single source of truth.
	 */
	private setupMobilePanel(container: HTMLElement): void {
		container.addClass('dial-video-mobile');
		this.panel = new SubtitlePanel(container);
		this.panel.setCallbacks({
			onSubtitleClick: (sub) => {
				this.jumpToTime(sub.start);
				this.play();
			},
			onSetA: (time) => {
				if (this.abLoopHandler) {
					this.abLoopState = this.abLoopHandler.onSetA(time);
					return this.abLoopState;
				}
				this.abLoopState = { a: time, b: null, active: false };
				return this.abLoopState;
			},
			onSetB: (time) => {
				if (this.abLoopHandler) {
					this.abLoopState = this.abLoopHandler.onSetB(time);
					return this.abLoopState;
				}
				this.abLoopState = {
					a: this.abLoopState.a,
					b: time,
					active: true,
				};
				return this.abLoopState;
			},
			onClearAB: () => {
				if (this.abLoopHandler) {
					this.abLoopState = this.abLoopHandler.onClearAB();
					return this.abLoopState;
				}
				this.abLoopState = { a: null, b: null, active: false };
				return this.abLoopState;
			},
			onGetCurrentTime: () => this.getCurrentTime(),
			onTogglePlay: () => this.togglePlay(),
			onSpeedChange: (rate) => this.setPlaybackRate(rate),
		});
	}

	async onClose(): Promise<void> {
		this.savePositionImmediate();
		this.panel?.detachMobileLayout();
		this.panel = null;
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

	setABLoopState(state: ABLoopState): void {
		this.abLoopState = state;
		this.panel?.setABLoopState(state);
	}

	/**
	 * Set the handler that routes mobile AB loop operations through
	 * AbLoopManager. Without this, mobile AB loop buttons mutate local
	 * state only, diverging from the manager.
	 */
	setABLoopHandler(handler: ABLoopHandler | null): void {
		this.abLoopHandler = handler;
	}

	/** Play from start to end once, then pause. */
	playRangeOnce(start: number, end: number): void {
		if (!this.videoEl) return;
		this.playOnceEnd = end;
		this.videoEl.currentTime = start;
		void this.videoEl.play();
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
