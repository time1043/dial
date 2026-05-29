# Dial

A video player plugin for [Obsidian](https://obsidian.md) with subtitle-video bidirectional binding, playback speed control, AB loop, and more.

## Features

- 🎬 Play videos directly in Obsidian
- 🔤 Subtitle-video bidirectional binding — click a subtitle to jump to the corresponding moment, and auto-highlight the current subtitle as the video plays
- ⚡ Flexible playback speed control
- 🔁 AB loop for repeating specific segments
- ⌨️ Keyboard shortcuts for quick control

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
