import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';

import type { Subtitle } from '@/types';

// Node.js fs module (available in Obsidian's Electron)
const fs = window.require('fs') as typeof import('fs');

export const VIDEO_PLAYER_VIEW_TYPE = 'dial-video-player';

export class VideoPlayerView extends ItemView {
	private videoEl: HTMLVideoElement | null = null;
	private videoPath: string | null = null;
	private subtitles: Subtitle[] = [];
	private currentSubtitleId: number = -1;
	private onSubtitleChange: ((id: number) => void) | null = null;
	private blobUrl: string | null = null;

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

			const sub = this.findSubtitleAt(time);
			if (sub && sub.id !== this.currentSubtitleId) {
				this.currentSubtitleId = sub.id;
				this.onSubtitleChange?.(sub.id);
			}
		});
	}

	async onClose(): Promise<void> {
		this.revokeBlobUrl();
		this.videoEl = null;
	}

	loadVideo(path: string): void {
		if (!this.videoEl) return;
		this.videoPath = path;
		try {
			const buffer = fs.readFileSync(path) as Uint8Array;
			const ext = path.split('.').pop()?.toLowerCase() ?? 'mp4';
			const mimeMap: Record<string, string> = {
				mp4: 'video/mp4',
				mkv: 'video/x-matroska',
				webm: 'video/webm',
				avi: 'video/x-msvideo',
				mov: 'video/quicktime',
			};
			const mime = mimeMap[ext] ?? 'video/mp4';
			const blob = new Blob([new Uint8Array(buffer)], { type: mime });
			this.revokeBlobUrl();
			this.blobUrl = URL.createObjectURL(blob);
			this.videoEl.muted = false;
			this.videoEl.volume = 1.0;
			this.videoEl.src = this.blobUrl;
			this.videoEl.onerror = () => {
				const err = this.videoEl?.error;
				new Notice(`Video load error: ${err?.message ?? 'unknown'}`);
			};
			this.videoEl.load();
		} catch {
			new Notice(`Cannot read video file: ${path}`);
		}
	}

	private revokeBlobUrl(): void {
		if (this.blobUrl) {
			URL.revokeObjectURL(this.blobUrl);
			this.blobUrl = null;
		}
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
	}

	setSubtitleChangeCallback(cb: (id: number) => void): void {
		this.onSubtitleChange = cb;
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

	getCurrentTime(): number {
		return this.videoEl?.currentTime ?? 0;
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
			this.loadVideo(videoPath);
		}
		if (subtitles) {
			this.subtitles = subtitles;
		}
	}

	private findSubtitleAt(time: number): Subtitle | null {
		// Find the subtitle containing time, or the nearest previous one
		let nearest: Subtitle | null = null;
		for (const sub of this.subtitles) {
			if (time >= sub.start && time <= sub.end) {
				return sub;
			}
			if (sub.start < time) {
				nearest = sub;
			}
		}
		return nearest;
	}
}
