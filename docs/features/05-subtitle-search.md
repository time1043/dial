# Subtitle search

## Overview

Filter the subtitle list by keyword to quickly find where a word or phrase
appears. Matching is case-insensitive; clearing the search box restores the
full list.

## How to use

1. Open the local video player (see [Open video player with local video and
   local subtitle](01-open-player.md)).
2. Type a keyword into the **Search subtitles** box above the subtitle list.
3. Only subtitles containing the keyword are shown; the counter on the right
   displays `matches/total`.
4. Click any visible subtitle to jump the video to that line, as usual.
5. Click the × button next to the search box to clear the search and restore
   the full list in one click (the input is not refocused, so the soft
   keyboard stays dismissed on mobile).

## Behavior details

- **Case-insensitive**: `the` matches `The` and `THE`.
- **Non-destructive**: non-matching rows are hidden via CSS, not removed.
  The active-line highlight and AB loop markers keep working, and clearing
  the search restores everything.
- **Empty state**: if a keyword matches nothing, "No matching subtitles" is
  shown below the list.
- **Keyboard shortcuts**: press `s` in the subtitle panel to focus the search
  box (existing text is selected for quick retyping); press `Escape` to leave
  the search box and return to the panel; press `d` while the panel (not the
  search box) has focus to clear the search box — equivalent to the × button.
  While typing in the search box, panel shortcuts (space to play/pause, arrows
  to seek, etc.) are suspended so you can type spaces and letters normally,
  and `d` is typed as a letter rather than clearing the box.
- **Mobile**: focusing the search box lifts the whole subtitle panel into a
  full-screen overlay pinned just below the view header; the video, AB
  controls, and speed controls are hidden, and the soft keyboard can only
  overlap the panel's bottom edge, so the search bar and the scrollable
  match list always own everything above the keyboard. Tapping a match
  jumps the video and automatically drops the overlay (and the keyboard)
  so the jump is visible; tapping the × clear button keeps the keyboard
  dismissed so results stay readable. Everything reappears when focus is
  lost.
- Available in both the desktop subtitle view and the mobile video player's
  subtitle panel, since both share the same `SubtitlePanel` component.

## Limitations

- Plain substring match only — no regex, no whole-word mode.
- The keyword filters subtitle text; timestamps are not searched.
