/**
 * Mock factory for the `obsidian` module.
 *
 * The `obsidian` npm package is types-only (`main: ""`), so any test that
 * transitively imports from `obsidian` (commands, settings tab, sync
 * orchestrator, vault/paths) MUST mock the module or Node fails to resolve it.
 *
 * Usage — must run BEFORE imports of code under test:
 *
 *   import { vi } from 'vitest';
 *   import { mockObsidian } from '../helpers/mock-obsidian';
 *   vi.mock('obsidian', () => mockObsidian());
 *
 * Extend the returned stubs as new tests exercise more of the API. Keep the
 * stubs minimal and behavior-light; prefer asserting on the code under test's
 * observable effects rather than on Obsidian call counts.
 */

export function mockObsidian() {
	class TFile {
		path: string;
		constructor(path = '') {
			this.path = path;
		}
	}

	class TFolder {
		path: string;
		constructor(path = '') {
			this.path = path;
		}
	}

	let lastNotice: unknown;
	class Notice {
		constructor(message: unknown) {
			lastNotice = message;
		}
	}

	class Plugin {}

	class ItemView {
		containerEl: HTMLElement;

		constructor(_leaf: unknown) {
			this.containerEl =
				typeof document !== 'undefined'
					? document.createElement('div')
					: ({} as HTMLElement);
		}
		registerEvent() {}
		registerDomEvent() {}
		registerInterval() {}
	}

	class WorkspaceLeaf {}

	const setIcon = (_el: HTMLElement, _icon: string) => {};

	// Expose last Notice message for assertions where useful.
	return {
		TFile,
		TFolder,
		Notice,
		Plugin,
		ItemView,
		WorkspaceLeaf,
		setIcon,
		__lastNotice: () => lastNotice,
	};
}
