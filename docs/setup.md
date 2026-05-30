## Init Project

- https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin

```shell
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git
```

## Dev mode

```shell
.
├── dial  # current repository
└── dial-vault
```

- symlink

```shell
# PowerShell Admin
New-Item -ItemType SymbolicLink `
  -Path "D:\vaults\my-vault\.obsidian\plugins\my-plugin" `
  -Target "D:\code\my-plugin-src"

# Cmd
# mklink /D "D:\vaults\my-vault\.obsidian\plugins\my-plugin" "D:\code\my-plugin-src"
# mklink /J "D:\vaults\my-vault\.obsidian\plugins\my-plugin" "D:\code\my-plugin-src"
mklink /J "dial-vault\.obsidian\plugins\dial" "dial"
mklink /J "dial-vault\_lib\videos" "C:\Users\28180\Videos\obh"

# Bash
ln -s ~/Documents/code3/base/web/dial ~/Documents/code3/base/web/dial-vault/.obsidian/plugins/dial
ln -s ~/Movies/obh ~/Documents/code3/base/web/dial-vault/_lib/videos
```

- build copy

```shell
# Windows
pnpm run build; Copy-Item main.js, manifest.json, styles.css `
  -Destination "D:\YourVault\.obsidian\plugins\dial\"

# Mac / Linux
pnpm run build && cp main.js manifest.json styles.css ~/YourVault/.obsidian/plugins/dial/
```

## Fix video audio compatibility

Some video files use audio codecs (e.g. AC3, DTS) that are not supported by Obsidian's Chromium-based player. Re-encode the audio to AAC while keeping the video stream unchanged:

```shell
# ffmpeg -i "C:/Users/28180/Videos/DoctorWho2014ChristmasSpecialLastChristmas.mkv" -c:v copy -c:a aac "C:/Users/28180/Videos/obh/DoctorWho2014ChristmasSpecialLastChristmas.mkv"
ffmpeg -i DoctorWhoS08E12DeathInHeaven.mp4 -c:v copy -c:a aac ./obh/DoctorWhoS08E12DeathInHeaven.mp4
```
