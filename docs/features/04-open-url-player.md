# Open video player with video URL

## Overview

Play a remote video (Bilibili, YouTube, etc.) directly inside Obsidian by
embedding the platform's official player.

This is **Route A** of the planned URL-playback feature set. A future Route B
will stream the video file directly so the local subtitle sync, AB loop, and
seeking features work the same as with local files.

## How to use

1. `Ctrl+P` → **Dial: Open video player with video URL**.
2. Paste a video watch URL, e.g. `https://www.bilibili.com/video/BV1zF7A6QEAG/`.
3. The command converts the URL to its embeddable form and opens an
   `URL video player` view that hosts the platform's native player.

## Supported hosts

- **Bilibili** — `bilibili.com/video/BV...` or `/av...` is converted to the
  official embed player (`player.bilibili.com/player.html`).
- **YouTube** — `youtube.com/watch?v=...` or `youtu.be/...` is converted to
  `/embed/...`.
- Any other URL is embedded as-is; if the site forbids embedding
  (X-Frame-Options), the iframe will fail to load.

## Limitations (Route A)

Because the video lives in a **cross-origin iframe**, Obsidian cannot read its
playback time or control it. As a result, the following local-player features
are **not available** for URL sources:

- Subtitle sync (local SRT highlighting / click-to-seek)
- AB loop
- Playback position save/restore
- Speed / volume control from Dial's panels

The platform's own player controls (including danmaku for Bilibili) are fully
available. This playback also requires an internet connection.
