# Dial

A video player plugin for [Obsidian](https://obsidian.md) with subtitle-video bidirectional binding, playback speed control, AB loop, and more.

## Features

- 🎬 Play videos directly in Obsidian
- 🔤 Subtitle-video bidirectional binding — click a subtitle to jump to the corresponding moment, and auto-highlight the current subtitle as the video plays
- ⚡ Flexible playback speed control
- 🔁 AB loop for repeating specific segments
- ⌨️ Keyboard shortcuts for quick control
- 🃏 Word flip — swipe through word books like a short-video feed (see below)

## Word flip

A vocabulary trainer with a short-video-style interface: one big word per
card, swipe or press ↓/↑ (Space and the mouse wheel work too), tap the card
to reveal phonetics, meaning and word forms, and drag the top progress bar
to seek across the book.

**Word books** are plain Markdown files in the vocabulary bucket folder
(default `_lib/vocabulary-bucket/`, configurable in settings). Dropping a
shared `.md` file into the folder imports it. Format:

```markdown
---
title: CET-4 core   (optional, defaults to the file name)
lang: en-US        (optional, overrides the pronunciation language)
---

| #   | word    | ipa        | meaning                  | forms          |
| --- | ------- | ---------- | ------------------------ | -------------- |
| 1   | abandon | /əˈbændən/ | v. give up<br>n. abandon | past abandoned |
```

- Row order is the word order; the `#` column is a human-friendly anchor.
- Use `<br>` inside a cell for multiple parts of speech or word forms.
- Missing cells are fine; rows without a word are skipped with a notice.

**Sessions and records**: the entry commands auto-start a study session;
pressing **End** settles it, closes the view and opens the book's journey
file. Quick links inside the journey open in browse mode, where marking
stays disabled until you press **Start** (browsing records nothing). Each
settled session is appended once to `_lib/vocabulary-journey/<book>.md` —
one `# Epoch N` heading per round (a session started at word 1 opens a new
epoch), and per session a `## date time → time (duration)` heading with a
trail list — a plain resume marker plus linked start/end word numbers that
jump back to those positions — followed by the covered words and their
mark state. Marks and resume positions live in plugin
storage and carry over across epochs.

**Commands**: `Flip words` (resume the last book), `Flip words: from the
active book`, `Flip words: choose a book`, `New word book` (creates a
template in the bucket folder).

## Installation

### From Community Plugins

1. Open Obsidian → **Settings → Community plugins**
2. Search for **Dial**
3. Install and enable the plugin

### Manual Installation

Copy `main.js`, `styles.css`, and `manifest.json` to your vault:

```
<Vault>/.obsidian/plugins/dial/
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev mode (watch & rebuild)
pnpm run dev

# Production build
pnpm run build

# Lint
pnpm run lint
```

## License

MIT
