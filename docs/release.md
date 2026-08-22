# Dial Plugin Release Process

## Prerequisites

1. Update version numbers in the following files:
    - `manifest.json` (plugin version)
    - `package.json` (npm package version)
    - `versions.json` (plugin version → minimum Obsidian version mapping)
2. Create release notes in `docs/release-notes/RELEASE_NOTES_vX.X.X.md` and format file via `pnpm fmt`

## Release Steps

### Commit Changes

```shell
git add .
git commit -m "chore: bump version to vX.X.X"
```

### Tag the Release

```shell
git tag vX.X.X
git push origin vX.X.X
```

### Package the Release

```shell
# It includes `pnpm build`
pnpm package  # The product is the latest dial.zip which is ignored by git
```

### Create GitHub Release

```shell
gh release create vX.X.X dial.zip \
  --title "vX.X.X" \
  --notes "$(cat docs/release-notes/RELEASE_NOTES_vX.X.X.md)"
```

## Notes

- Replace `X.X.X` with the actual version number
- Ensure release notes are properly formatted in the markdown file
- Test the plugin after release if possible
