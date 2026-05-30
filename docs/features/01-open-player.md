# Base line

## Overview

Open a video player and subtitle viewer from a Dial note's frontmatter.

## Frontmatter format

```yaml
---
video: C:/Users/28180/Videos/obh/DoctorWhoS09E11HeavenSent.mp4
subtitle: _lib/subtitles/DoctorWhoS09E11HeavenSent.srt
---
```

- `video` — absolute path to the video file (outside the vault).
- `subtitle` — vault-relative path to the subtitle file.

Both fields are required.

## Interaction flow

1. User opens a Dial note (a `.md` with `video` and `subtitle` in frontmatter).
2. `Ctrl+P` → **Dial: Open video player**.
3. Plugin reads the current note's frontmatter.
4. If `video` or `subtitle` is missing, or the subtitle file is not found → toast error, stay on current note.
5. Otherwise, open two tabs:
    - **Video player** — HTML5 video with native controls.
    - **Subtitles** — parsed SRT list, click to jump.

## Sync

- Video playback highlights the current subtitle in real time.
- Clicking a subtitle line jumps the video to that timestamp.
- If playback lands in a gap with no subtitles (e.g. after ±30s seek), highlight stays on the nearest previous subtitle.

# Reduce the repetition of paths in frontmatter

## Settings

Configure library paths so frontmatter can use relative paths instead of absolute ones.

| Setting               | Default          | Description                                   |
| --------------------- | ---------------- | --------------------------------------------- |
| Video library path    | _(empty)_        | Absolute path to the video file directory     |
| Subtitle library path | `_lib/subtitles` | Vault-relative path to the subtitle directory |

- Trailing slashes are automatically trimmed on save.
- If video library path is empty, the command shows a toast prompting the user to configure it.

## Frontmatter format

With settings configured, frontmatter uses relative paths:

```yaml
---
video: DoctorWhoS09E11HeavenSent.mp4
subtitle: DoctorWhoS09E11HeavenSent.srt
---
```

| Field      | Resolved as                                                     |
| ---------- | --------------------------------------------------------------- |
| `video`    | `<video-library-path>/DoctorWhoS09E11HeavenSent.mp4`            |
| `subtitle` | `<vault>/<subtitle-library-path>/DoctorWhoS09E11HeavenSent.srt` |

# Create video note command

## Usage

- Quickly create a new video note with pre-filled frontmatter.

1. `Ctrl+P` → **Dial: Create video note**.
2. Enter a filename in the dialog (without extension).
3. A new `filename.md` is created and opened:

```yaml
---
video: filename.mp4
subtitle: filename.srt
---
```

The `video` and `subtitle` values are auto-filled based on the filename (default extensions `.mp4` and `.srt`). Both fields are editable after creation.

## Behavior

- If a file with the same name already exists → toast error, no file is created.
- The new file opens in a new tab.

# Playback position

Playback position is automatically saved and restored across vault reloads.

## Storage

Position is stored in plugin `data.json` (keyed by video absolute path):

```json
{
	"positions": {
		"C:/Users/me/Videos/video1.mp4": 123.45,
		"C:/Users/me/Videos/video2.mp4": 456.78
	}
}
```

Alternative: store in frontmatter (`position: 123.45`), but this pollutes note content with frequent writes.

## Save triggers

- Video paused (with 1s debounce).
- View closed.
- Plugin unloaded (vault close / plugin disabled).

# Layout

After opening a video player, three tabs are arranged:

- **Left (20%)** — subtitles and md note (tab switching).
- **Right (80%)** — video player (display only, no controls).

Users can manually drag to adjust the ratio.

# AB loop

## Single sentence

1. Click AB button → set current playing subtitle as AB loop.
2. Click again → cancel.

## Multi-sentence

1. Click A → set current subtitle's start time as A point.
2. Click B → set current subtitle's end time as B point.
3. Video loops from A to B.

## Boundary conditions

- B clicked without A → toast: "Set start point first." No state change.
- B point earlier than A → toast: "End point must be after start point." A remains, waiting for B.
- AB loop already active, click A or B → toast: "Loop is active. Click AB to cancel." No state change.
- Only the AB button can cancel an existing loop.
- Loop active, user seeks outside A-B range → immediately jump back to A.

## User friendly

- AB button: accent color (idle) → red (loop active, click to cancel).
- Subtitle panel shows current loop state: "No loop set" / "A: 0:05 — set B" / "Loop: 0:05 → 0:12".
- Subtitles within the loop range are visually highlighted.

# Speed control

## Range & Step

- Range: 0.25x ~ 3x
- Step: 0.25x

## User friendly

- Slider with discrete speed steps, draggable.
- Current speed displayed (e.g. "1x", "1.5x").

# Keyboard shortcuts & Register commands

## Background

Three ways to handle keyboard shortcuts in Obsidian plugins:

| Approach                  | Scope             | Trigger                  | User-configurable |
| ------------------------- | ----------------- | ------------------------ | ----------------- |
| `addCommand` + `hotkeys`  | Global            | Command palette / hotkey | Yes               |
| `addCommand` (no hotkeys) | Global            | Command palette only     | Yes, manually     |
| DOM `keydown` listener    | Focused view only | Key press                | No                |

Single character keys (Z/X/C) as global hotkeys conflict with text input in edit mode. Use DOM listeners scoped to the subtitle panel instead.

## Why commands are necessary

Layout: left (20%) subtitle/md tabs, right (80%) video.

When the left panel is the subtitle page, DOM listeners work fine. But when the user switches to the md note tab, the subtitle panel loses focus and DOM listeners stop working. The user has no way to control the video.

Commands solve this: they work globally regardless of which panel is focused. Use modifier-key hotkeys (e.g. `Ctrl+Shift+Space`) to avoid conflicts with text editing.

## Design

All shortcuts only apply in the subtitles page.

| Action            | Shortcut |
| ----------------- | -------- |
| Play / pause      | `Space`  |
| Previous subtitle | `←`      |
| Next subtitle     | `→`      |
| Rewind 30s        | `j`      |
| Forward 30s       | `l`      |
| Volume up         | `↑`      |
| Volume down       | `↓`      |
| Mute / unmute     | `M`      |

| Action           | Shortcut |
| ---------------- | -------- |
| Speed up         | `]`      |
| Speed down       | `[`      |
| Reset speed (1x) | `\`      |

| Action         | Shortcut |
| -------------- | -------- |
| Set A point    | `Z`      |
| Set B point    | `X`      |
| Toggle AB loop | `C`      |

# Insert timestamp

Insert the current video playback time into the md note as a clickable link.

## Command

`Ctrl+P` → **Dial: Insert video timestamp** (default hotkey: `Ctrl+Shift+T`).

Requires an active video player and an active Markdown editor. Inserts at the cursor position as a Markdown link:

```markdown
- [1:23](obsidian://dial?seconds=83)
```

## Time resolution

- Paused **within** a subtitle line → snaps to that subtitle's start time (the line is the basic unit).
- Paused **between** subtitles (gap) → uses the actual playback time (no line to snap to, preserve user intent).

## Click behavior

Clicking a timestamp link opens the `obsidian://dial` protocol handler:

| Scenario                         | Action                                               |
| -------------------------------- | ---------------------------------------------------- |
| Video already open in 2:8 layout | Jump to the timestamp and play                       |
| Only MD note open                | Open video in 2:8 layout, then jump to the timestamp |

Video path is resolved from the note's frontmatter (`video` field), not embedded in the link.
