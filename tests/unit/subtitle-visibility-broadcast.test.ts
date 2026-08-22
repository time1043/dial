import { describe, expect, it, vi } from 'vitest';

import DialPlugin from '@/main';
import { DEFAULT_SETTINGS } from '@/settings';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from '@/ui/subtitle-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '@/ui/video-player-view';

/**
 * `applySubtitlePanelVisibility` is the broadcast step of the real-time
 * visibility feature: flipping a settings toggle should reach every open
 * SubtitleView / VideoPlayerView leaf, passing the flags derived from
 * settings. We invoke the real method via its prototype with a fake `this`,
 * and hang real view instances on the leaves so the `instanceof` guards in the
 * method behave exactly as in the running app — without constructing the whole
 * plugin (which would require a real Obsidian app).
 */
describe('DialPlugin.applySubtitlePanelVisibility', () => {
	const settings = {
		...DEFAULT_SETTINGS,
		showABLoop: false,
		showSpeed: true,
		showSubtitleSearch: false,
	};
	const expected = { abLoop: false, speed: true, search: false };

	function run(getLeavesOfType: (type: string) => { view: unknown }[]): void {
		// `fakeThis` is structurally compatible with DialPlugin (the obsidian
		// `App` stub is loose), so no cast is needed — `.call` accepts it and the
		// real method's `instanceof` guards behave exactly as in the app.
		const fakeThis = { app: { workspace: { getLeavesOfType } }, settings };
		DialPlugin.prototype.applySubtitlePanelVisibility.call(fakeThis);
	}

	it('pushes the settings-derived visibility to both view types', () => {
		const subtitleView = new SubtitleView({} as never);
		const videoView = new VideoPlayerView({} as never);
		const a = vi.spyOn(subtitleView, 'updateVisibility');
		const b = vi.spyOn(videoView, 'updateVisibility');

		run((type) => {
			if (type === SUBTITLE_VIEW_TYPE) return [{ view: subtitleView }];
			if (type === VIDEO_PLAYER_VIEW_TYPE) return [{ view: videoView }];
			return [];
		});

		expect(a).toHaveBeenCalledWith(expected);
		expect(b).toHaveBeenCalledWith(expected);
	});

	it('updates every open leaf, not just the first', () => {
		const leaves = [
			{ view: new SubtitleView({} as never) },
			{ view: new SubtitleView({} as never) },
		];
		const spies = leaves.map((l) => vi.spyOn(l.view, 'updateVisibility'));

		run((type) => (type === SUBTITLE_VIEW_TYPE ? leaves : []));

		spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
	});

	it('skips leaves whose view is not the expected type', () => {
		const notASubtitleView = { updateVisibility: vi.fn() };

		// A subtitle-type leaf whose view is not actually a SubtitleView. Without
		// the `instanceof` guard this would call a method that does not exist on
		// a real panel-bearing view, or wrongly forward to the wrong class.
		run((type) => (type === SUBTITLE_VIEW_TYPE ? [{ view: notASubtitleView }] : []));

		expect(notASubtitleView.updateVisibility).not.toHaveBeenCalled();
	});
});
