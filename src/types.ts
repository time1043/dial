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

/**
 * How the next episode is determined within "Loop current folder" mode.
 *
 * - `tree`  : follow the file-tree order of the note's folder (notes with
 *             `video`/`subtitle` frontmatter, sorted by path).
 * - `index` : follow the order declared in an `index.md` file placed in the
 *             same folder, under a `# List` heading of unordered wikilinks.
 */
export type FolderOrderMode = 'tree' | 'index';

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
