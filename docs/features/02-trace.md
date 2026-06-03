# Trace

## Overview

Record video playback history as markdown tables in `_lib/trace/`.

## File structure

Monthly files: `_lib/trace/2026-06.md`.

```markdown
# 2026-06-04

## video-player

| Time  | Video               | Position                             |
| ----- | ------------------- | ------------------------------------ |
| 14:30 | DoctorWhoS08E12.mp4 | [12:34](obsidian://dial?seconds=754) |
| 15:20 | DoctorWhoS09E11.mp4 | [0:00](obsidian://dial?seconds=0)    |
```

- `# date` — h1 groups by day.
- `## video-player` — h2 groups by module (extensible for future modules).
- Table columns: timestamp, video filename (plain text), playback position (clickable timestamp link).

## Record triggers

| Event       | Behavior                                             |
| ----------- | ---------------------------------------------------- |
| Open player | Append a new row, position = `00:00`                 |
| Pause       | Update the last row's position for the current video |

## Boundary

**Deduplication**: If the video to record is the same as the last row in the current day's table, overwrite that row instead of appending. This prevents excessive rows from repeated pause/resume on the same video.

**Cross-month**: Each month is independent. A video opened in June and paused in July gets a new row in July's file.
