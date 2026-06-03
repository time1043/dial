# Setup

## Introduction

Dial is an [Obsidian](https://obsidian.md/download) plugin (Windows, macOS, Android).

## Obsidian Vault

Clone (or fork) the example vault:

```shell
git clone https://github.com/time1043/dial-vault.git
```

An Obsidian vault is just a regular folder. The structure of this one:

```
dial-vault/
├── _lib/                       # media assets
│   ├── subtitles/
│   └── videos/
├── .obsidian/                  # config & plugins about obsidian
│   └── plugins/
│       └── dial/
│           ├── main.js
│           ├── manifest.json
│           └── styles.css
└── note/                       # markdown notes
```

## Install and Enable the Plugin

Download `dial.zip` from [Dial Releases](https://github.com/time1043/dial/releases) and extract it to `.obsidian/plugins/`.

Open the vault in Obsidian → **Settings → Community Plugins** → enable **Dial**.

## Download Example Videos

Download from [here](https://dvr3olkra60.feishu.cn/wiki/Yqcdwn7gNiw0nAkjAnKcOhTSnmg) and place them in `_lib/videos/`.

## About Android

Git is recommended for syncing and versioning your vault. Android has no built-in terminal, so install [Termux](https://play.google.com/store/apps/details?id=com.termux&hl=en) to run the `git clone` command above, then open the vault in Obsidian.
