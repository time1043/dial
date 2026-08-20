import { describe, expect, it, vi } from 'vitest';

import { VideoPlayerView } from '@/ui/video-player-view';

/**
 * `handleVideoEnd` decides what happens when a video reaches its natural end.
 * It always fires `onFinished` (used to clear the resume point), then routes
 * by loop mode: `single` replays from 0; `folder`/`all` delegate to
 * `onVideoEnd` (episode advance); `none` does nothing.
 *
 * The view is constructed without `onOpen` (no real video element), so the
 * `single` branch is exercised by injecting a fake `videoEl`.
 */
function makeView(): VideoPlayerView {
	return new VideoPlayerView({} as never);
}

describe('VideoPlayerView.handleVideoEnd', () => {
	it('fires onFinished for every mode but does not advance on none', () => {
		const view = makeView();
		const onFinished = vi.fn();
		const onVideoEnd = vi.fn();
		view.setOnFinishedCallback(onFinished);
		view.setVideoEndCallback(onVideoEnd);
		view.setLoopMode('none');

		(view as unknown as { handleVideoEnd: () => void }).handleVideoEnd();

		expect(onFinished).toHaveBeenCalledTimes(1);
		expect(onVideoEnd).not.toHaveBeenCalled();
	});

	it('replays from 0 and does not advance on single', () => {
		const view = makeView();
		const onFinished = vi.fn();
		const onVideoEnd = vi.fn();
		const play = vi.fn();
		(view as unknown as { videoEl: { currentTime: number; play: () => void } }).videoEl = {
			currentTime: 12,
			play,
		};
		view.setOnFinishedCallback(onFinished);
		view.setVideoEndCallback(onVideoEnd);
		view.setLoopMode('single');

		(view as unknown as { handleVideoEnd: () => void }).handleVideoEnd();

		expect(onFinished).toHaveBeenCalledTimes(1);
		expect(onVideoEnd).not.toHaveBeenCalled();
		expect((view as unknown as { videoEl: { currentTime: number } }).videoEl.currentTime).toBe(
			0,
		);
		expect(play).toHaveBeenCalledTimes(1);
	});

	it('delegates to onVideoEnd on folder', () => {
		const view = makeView();
		const onFinished = vi.fn();
		const onVideoEnd = vi.fn();
		view.setOnFinishedCallback(onFinished);
		view.setVideoEndCallback(onVideoEnd);
		view.setLoopMode('folder');

		(view as unknown as { handleVideoEnd: () => void }).handleVideoEnd();

		expect(onFinished).toHaveBeenCalledTimes(1);
		expect(onVideoEnd).toHaveBeenCalledTimes(1);
	});

	it('delegates to onVideoEnd on all', () => {
		const view = makeView();
		const onFinished = vi.fn();
		const onVideoEnd = vi.fn();
		view.setOnFinishedCallback(onFinished);
		view.setVideoEndCallback(onVideoEnd);
		view.setLoopMode('all');

		(view as unknown as { handleVideoEnd: () => void }).handleVideoEnd();

		expect(onFinished).toHaveBeenCalledTimes(1);
		expect(onVideoEnd).toHaveBeenCalledTimes(1);
	});
});
