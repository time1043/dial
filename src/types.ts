export interface Subtitle {
	id: number;
	start: number; // seconds
	end: number; // seconds
	text: string;
}

export interface ABLoopState {
	a: number | null;
	b: number | null;
	active: boolean;
}

/**
 * Playback loop behavior when the current video finishes.
 *
 * - `none`   : play once and stop (native HTML5 video default).
 * - `single` : restart the same video from the beginning.
 * - `folder` : advance to the next video in the same note folder.
 * - `all`    : advance to the next video across the whole library.
 *
 * `folder` and `all` require closing the current subtitle/video views
 * and re-opening the next note, so they are orchestrated at the plugin
 * level (not handled inside VideoPlayerView alone).
 */
export type LoopMode = 'none' | 'single' | 'folder' | 'all';

export interface TypeSentenceRecord {
	subtitleId: number;
	userInput: string[];
	correct: string[];
	completedAt: string | null;
}

export interface TypeSessionData {
	id: string;
	videoPath: string;
	subtitlePath: string;
	currentIndex: number;
	createdAt: string;
	sentences: TypeSentenceRecord[];
}
