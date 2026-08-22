/**
 * Parser for word book markdown files (one book = one .md file).
 *
 * Canonical shape:
 *
 * ---
 * title: 四级高频词        (optional; falls back to the file name)
 * lang: en-US             (optional; falls back to the global setting)
 * ---
 *
 * | # | word | ipa | meaning | forms |
 * | - | ---- | --- | ------- | ----- |
 * | 1 | abandon | /əˈbændən/ | v. 放弃<br>n. 放纵 | 过去式 abandoned |
 *
 * Rules:
 * - Header and alignment rows are skipped; only column POSITION matters
 *   (1 = "#", 2 = word, 3 = ipa, 4 = meaning, 5 = forms), so header labels
 *   are free-form.
 * - Row order is the authoritative word order. The "#" column is a human
 *   memory anchor; rows where it disagrees with the actual position are
 *   counted (surfaced as one toast) but never reorder anything.
 * - Cells may contain `<br>` line breaks (multiple parts of speech, word
 *   forms). Cells may escape literal pipes as `\|`.
 * - Rows without a word are skipped and reported per line.
 * - Everything outside tables (prose, headings) is ignored.
 */

/** A single word entry parsed from one table row. */
export interface WordEntry {
	word: string;
	ipa: string;
	/** Raw cell; `<br>` separates parts of speech. */
	meaning: string;
	/** Raw cell; `<br>` separates derived/inflected forms. */
	forms: string;
}

/** A table row that could not be used, with its 1-based source line. */
export interface InvalidRow {
	line: number;
	reason: string;
}

export interface ParsedWordBook {
	title: string | null;
	lang: string | null;
	words: WordEntry[];
	invalidRows: InvalidRow[];
	/** Rows whose "#" column disagrees with the actual row order. */
	indexColumnMismatches: number;
}

/** Short format hint for parse-error toasts. */
export const WORD_ROW_FORMAT_HINT = '| # | word | ipa | meaning | forms |';

const BR_SPLIT = /<br\s*\/?>/i;

/** Split a raw cell into display lines on `<br>` variants. */
export function splitCellLines(cell: string): string[] {
	return cell
		.split(BR_SPLIT)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/** Pull `title:` / `lang:` out of a leading frontmatter block, if present. */
function parseFrontmatter(content: string): { title: string | null; lang: string | null } {
	const lines = content.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') return { title: null, lang: null };

	let title: string | null = null;
	let lang: string | null = null;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]!;
		if (line.trim() === '---' || line.trim() === '...') break;
		const titleMatch = line.match(/^title:\s*(.*)$/);
		if (titleMatch && title === null) {
			title = unquote(titleMatch[1] ?? '');
		}
		const langMatch = line.match(/^lang:\s*(.*)$/);
		if (langMatch && lang === null) {
			lang = unquote(langMatch[1] ?? '');
		}
	}
	return { title: title || null, lang: lang || null };
}

/** Split a table row into trimmed cells, honoring `\|` escapes. */
function splitRowCells(line: string): string[] {
	let body = line.trim();
	if (body.startsWith('|')) body = body.slice(1);
	if (body.endsWith('|')) body = body.slice(0, -1);
	return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isAlignmentRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((cell) => cell === '' || /^:?-+:?$/.test(cell));
}

export function parseWordBook(content: string): ParsedWordBook {
	const { title, lang } = parseFrontmatter(content);

	const result: ParsedWordBook = {
		title,
		lang,
		words: [],
		invalidRows: [],
		indexColumnMismatches: 0,
	};

	const lines = content.split(/\r?\n/);
	let inTable = false;
	let rowCountInBlock = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const isTableRow = line.trim().startsWith('|');

		if (!isTableRow) {
			inTable = false;
			rowCountInBlock = 0;
			continue;
		}

		if (!inTable) {
			inTable = true;
			rowCountInBlock = 0;
		}
		rowCountInBlock++;

		// First row of a block is the header; the next one may be the
		// alignment row. Both are structural, not data.
		if (rowCountInBlock === 1) continue;
		const cells = splitRowCells(line);
		if (rowCountInBlock === 2 && isAlignmentRow(cells)) continue;

		const word = cells[1] ?? '';
		if (!word) {
			result.invalidRows.push({
				line: i + 1,
				reason: 'missing word',
			});
			continue;
		}

		const expectedIndex = result.words.length + 1;
		const indexCell = cells[0] ?? '';
		if (indexCell !== '') {
			const parsed = Number.parseInt(indexCell, 10);
			if (Number.isNaN(parsed) || parsed !== expectedIndex) {
				result.indexColumnMismatches++;
			}
		}

		result.words.push({
			word,
			ipa: cells[2] ?? '',
			meaning: cells[3] ?? '',
			forms: cells[4] ?? '',
		});
	}

	return result;
}
