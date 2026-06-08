import type { Vault } from 'obsidian';

import { TFile } from 'obsidian';

import type { Subtitle, TypeSessionData } from '@/types';

const TYPE_DIR = '_lib/type';

export class TypeSessionManager {
	constructor(private vault: Vault) {}

	async create(
		videoPath: string,
		subtitlePath: string,
		subtitles: Subtitle[],
	): Promise<TypeSessionData> {
		const id = String(Math.floor(Date.now() / 1000));
		const session: TypeSessionData = {
			id,
			videoPath,
			subtitlePath,
			currentIndex: 0,
			createdAt: new Date().toISOString(),
			sentences: subtitles.map((sub) => ({
				subtitleId: sub.id,
				userInput: [],
				correct: tokenize(sub.text),
				completedAt: null,
			})),
		};

		await this.ensureDir();
		await this.vault.create(this.filePath(id), JSON.stringify(session, null, 2));
		return session;
	}

	async load(id: string): Promise<TypeSessionData | null> {
		const file = this.vault.getAbstractFileByPath(this.filePath(id));
		if (!(file instanceof TFile)) return null;
		const raw = await this.vault.read(file);
		return JSON.parse(raw) as TypeSessionData;
	}

	async save(session: TypeSessionData): Promise<void> {
		const file = this.vault.getAbstractFileByPath(this.filePath(session.id));
		if (!(file instanceof TFile)) return;
		await this.vault.modify(file, JSON.stringify(session, null, 2));
	}

	private filePath(id: string): string {
		return `${TYPE_DIR}/${id}.json`;
	}

	private async ensureDir(): Promise<void> {
		if (!this.vault.getAbstractFileByPath(TYPE_DIR)) {
			await this.vault.createFolder(TYPE_DIR);
		}
	}
}

export function tokenize(text: string): string[] {
	return text
		.split(/\s+/)
		.map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ''))
		.filter((w) => w.length > 0);
}

/** Split a raw token into leading punctuation + word + trailing punctuation. */
export function extractPunctuation(raw: string): {
	leading: string;
	word: string;
	trailing: string;
} {
	const match = raw.match(/^([^\w]*)(\w+(?:[-']\w+)*)([^\w]*)$/);
	if (match) {
		return { leading: match[1] ?? '', word: match[2]!, trailing: match[3] ?? '' };
	}
	// All-punctuation token (e.g. "--", "…", "..") — mergePunctuation() will attach
	// it to an adjacent word
	return { leading: raw, word: '', trailing: '' };
}
