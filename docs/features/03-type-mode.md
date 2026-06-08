# Type mode

## Overview

Listening-and-typing practice. Each subtitle is one sentence. User hears the audio and types each word into separate input boxes. Punctuation is displayed but not typed.

## Layout

Left 20%: subtitles + md note (tabs). Right 80%: type page + video (tabs).

Video plays audio in background. Type page drives playback — arriving at a sentence plays it once, then pauses.

## Subtitle panel (left side)

In type mode, the left subtitle list behaves differently from video mode:

| Video mode                   | Type mode                                          |
| ---------------------------- | -------------------------------------------------- |
| Click = seek video + play    | Click = type page jumps to that sentence           |
| Subtitle text always visible | Hidden until user types the sentence **correctly** |
| AB loop controls             | Speed slider only (no AB loop)                     |

### Sentence reveal

- **Not yet correct**: only time bar is shown. Subtitle text hidden.
- **All words correct** (`completedAt` is set): correct subtitle text revealed.
- After reveal, subtitle text stays visible permanently.

### Speed slider

Playback speed slider with `[` / `]` shortcuts (same as video mode).

### Highlight

Current sentence (matching type page `currentIndex`) is highlighted.

## Type page

### Sliding window

- Above: up to 2 completed sentences, dimmed.
- Center: current sentence. Large font, centered both axes.
- Below: answer comparison area (reserved space, hidden when not shown).
- Bottom: toolbar with shortcuts.

### Word input

Each word is an independent `<input>`. Punctuation is rendered as non-editable `<span>`:

- Leading punctuation (`-`, `"`, etc.) before the input.
- Trailing punctuation (`,`, `.`, `!`, `?`, etc.) after the input.
- Standalone punctuation tokens (`..`, `—`) are merged into adjacent words.
- Contractions (`you're`) and hyphenated compounds (`long-range`) are single inputs.

Example: subtitle `"Hello, Dr. Who!"` renders as:

```
"  Hello  ,  Dr  .  Who  !
```

- `Hello`, `Dr`, `Who` → input boxes (user types here).
- `"` → leading punctuation span.
- `,` `.` `!` → trailing punctuation spans.

### Word states

| State   | Style             |
| ------- | ----------------- |
| Empty   | Underline         |
| Correct | Green text + line |
| Wrong   | Red text + line   |

Wrong words don't block — user can continue and return anytime.

### Auto-advance

When all words in a sentence are correct, automatically advance to the next sentence after a brief pause.

### Show answer

Toggles a word-by-word comparison below the current sentence:

- User line: correct words green, wrong words red + strikethrough, missing words as `___`.
- Correct line: words that differ from user input highlighted.

### Clear

Clears all input for the current sentence and resets its completion status.

### Replay

Plays the current sentence audio once, then pauses. Not an AB loop — type mode owns playback.

## Keyboard

### Navigation

| Key         | Action                                             |
| ----------- | -------------------------------------------------- |
| `Space`     | Commit word, advance                               |
| `←`         | Previous word                                      |
| `→`         | Next word                                          |
| `↑`         | Previous sentence                                  |
| `↓`         | Next sentence                                      |
| `Backspace` | Delete char; at empty input, jump to previous word |

### Actions (all use `Cmd/Ctrl + Shift`)

| Key         | Action           |
| ----------- | ---------------- |
| `C`         | Replay           |
| `Enter`     | Show/Hide answer |
| `Backspace` | Clear sentence   |

## Persistence

Session files stored as JSON in `_lib/type/`, named by Unix timestamp:

```
_lib/type/
  1749283800.json
```

```json
{
	"id": "1749283800",
	"videoPath": "DoctorWhoS09E11.mp4",
	"subtitlePath": "DoctorWhoS09E11.srt",
	"currentIndex": 5,
	"createdAt": "2026-06-07T10:30:00Z",
	"sentences": [
		{
			"subtitleId": 0,
			"userInput": ["she", "is", "a", "girl"],
			"correct": ["she", "is", "a", "girl"],
			"completedAt": "2026-06-07T10:31:00Z"
		}
	]
}
```

### Resume

When a session starts, a link is appended to the active note:

```markdown
- [Type 2026-06-07 10:30:05](obsidian://dial?type=1749283800)
```

Clicking the link reopens the type layout and resumes at `currentIndex`. Multiple sessions for the same video appear as separate links.

## Token parsing

`extractPunctuation(raw)` splits each whitespace-delimited token into `{ leading, word, trailing }`.

Regex: `/^([^\w]*)(\w+(?:[-']\w+)*)([^\w]*)$/`

- Leading/trailing non-word chars → punctuation spans.
- Internal apostrophes and hyphens stay in the word.
- All-punctuation tokens (`..`, `—`) are merged into adjacent words by `mergePunctuation()`.
