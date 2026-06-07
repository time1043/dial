# Type mode

## Overview

A listening-and-typing practice mode. User hears each subtitle's audio and types the words. Each word is an independent input box. Correct words turn green, wrong words turn red.

## Command

`Ctrl+P` → **Dial: Open type session**.

Requires a Dial note with valid `video` and `subtitle` frontmatter (same as Open video player).

## Layout

- **Left (20%)** — subtitles and md note (tab switching).
- **Right (80%)** — type page (primary), video page (tab switching).

Video plays audio in the background. User switches to the video tab occasionally to check visuals.

## Type page

### Sliding window

Shows up to 3 lines:

- Above: up to 2 completed sentences (dimmed).
- Center: current sentence (large font, horizontally and vertically centered, visual focus).
- Below: nothing (never previews the next sentence).

Boundary conditions:

- Sentence 1: no previous lines, only the current sentence is shown.
- Sentence 2: 1 previous line + current sentence.

### Word input

Each word is an independent input box. Punctuation is displayed after the word but is not part of the input — the user does not type punctuation.

```
┌───────┐ ┌────┐ ┌───┐ ┌───────┐
│ Hello │ │ ,  │ │   │ │       │   world  .
└───────┘ └────┘ └───┘ └───────┘
  (input)  (punct) (input) (input)
```

Visual states:

| State   | Style      |
| ------- | ---------- |
| Empty   | Underline  |
| Correct | Green text |
| Wrong   | Red text   |

### Navigation

| Action            | Key                 |
| ----------------- | ------------------- |
| Next word         | `Space`             |
| Previous word     | `←` (at word start) |
| Next word         | `→` (at word end)   |
| Previous sentence | `↑`                 |
| Next sentence     | `↓`                 |

- `Space` advances to the next word (reuses normal typing habit).
- Left/right arrow keys move between words when the cursor is at the boundary of the current input.
- Up/down arrow keys switch between sentences.
- Cursor can move freely among all words, including already answered ones. Any word can be edited at any time.

### Wrong answer feedback

- Wrong words turn red but the user is not blocked. They can continue to the next word.
- User can return to fix any wrong word at any time.

### Show answer

Triggered by a button. Displays a comparison below the current sentence:

```
some else is also born.       ← user input
something else is also born.  ← correct answer
```

The user sees exactly which words differ.

### Auto-advance

When all words in a sentence are correct, automatically advance to the next sentence.

### Clear sentence

A button to clear all input for the current sentence and retry.

## Persistence

### Storage

Session files are stored as JSON in `_lib/type/`, named by Unix timestamp:

```
_lib/type/
  1749283800.json
  1749284500.json
```

Multiple sessions can exist for the same video. Each session is independent.

### JSON format

```json
{
	"id": "1749283800",
	"videoPath": "DoctorWhoS09E11HeavenSent.mp4",
	"subtitlePath": "DoctorWhoS09E11HeavenSent.srt",
	"currentIndex": 5,
	"createdAt": "2026-06-07T10:30:00Z",
	"sentences": [
		{
			"subtitleId": 0,
			"userInput": ["she", "is", "a", "girl"],
			"correct": ["she", "is", "a", "girl"],
			"completedAt": "2026-06-07T10:31:00Z"
		},
		{
			"subtitleId": 1,
			"userInput": ["some", "else", "is", "also", "born"],
			"correct": ["something", "else", "is", "also", "born"],
			"completedAt": null
		}
	]
}
```

- `id` — Unix timestamp string, used as filename.
- `currentIndex` — subtitle index to resume from.
- `sentences` — one entry per subtitle. `completedAt` is `null` if not yet finished.

### Resume via link

When a new type session starts, a link is appended to the md note:

```markdown
- [Type 10:30](obsidian://dial?type=1749283800)
```

Clicking this link opens the type page and resumes the session at `currentIndex`.

Multiple sessions for the same video appear as separate links:

```markdown
- [Type 10:30](obsidian://dial?type=1749283800)
- [Type 11:15](obsidian://dial?type=1749284500)
```
