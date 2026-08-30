# Dial plugin — long-term notes

## Speech (TTS) provider architecture

- Engine contract: `src/modules/speech/speech-provider.ts`
  (`SpeechProvider` + `SynthesizingSpeechProvider` with `synthesize(): ArrayBuffer`).
- Build the try-in-order chain in `src/modules/speech/create-speech-chain.ts`;
  cloud engines are wrapped by `CachedSpeechProvider` for offline replay.
- Priority UI list + traffic lights come from `SpeechChain.statuses()` and
  `orderSpeechEngines()` (unknown ids dropped, missing ones appended — no
  migration needed).
- Shared signing utils: `src/utils/tc3.ts` (Tencent/Aliyun TC3-HMAC-SHA256),
  `src/utils/md5.ts` (Baidu translate), `src/utils/aliyun.ts` (Aliyun POP/RPC HMAC-SHA1).
- Tencent speech REUSES the Tencent translate `secretId`/`secretKey`
  (one Tencent Cloud account covers every service) — no new settings field.
- Baidu speech and Baidu translate use DIFFERENT credentials:
  speech = API Key/Secret Key (AI platform); translate = appId/secret.

## Tencent Cloud API field-name cheat sheet (verified 2026-08-23)

- `tts.tencentcloudapi.com` `TextToVoice` (v2019-08-23): response field
  is `Response.Audio` (base64-encoded mp3). Used by TencentSpeechProvider.
- `tmt.tencentcloudapi.com` `TextTranslate` (v2018-03-21): response field
  is `Response.TargetText` (string), NOT `Response.TranslatedText`.
  Plus `Response.Source`, `Response.Target`, `Response.RequestId`.
  Used by TencentTranslateProvider. **Reading `TranslatedText` was a bug
  that silently swallowed every successful translation as a "no
  translation returned" error** — see `tencent-translate-provider.ts`
  comment and the 2026-08-23 daily log.

## To add another cloud TTS engine

1. New `src/modules/speech/<vendor>-speech-provider.ts` implementing
   `SynthesizingSpeechProvider` (`isAvailable`, `synthesize`, `speak`).
2. Add credential settings to `DialSettings` + `DEFAULT` in `src/settings.ts`;
   append its id to `speechEngineOrder` default and add UI rows (sentence case!).
3. Register in `create-speech-chain.ts` with a credentials getter.
4. Extend `tests/unit/modules/speech/cloud-speech-providers.test.ts`.
5. Re-run `tsc -noEmit`, `eslint .`, `vitest run --project unit`.

## Word card UX (mvp/feat/word-card branch)

- Card body: `.dial-word-card > (.dial-word-card-main, .dial-word-card-speak,
.dial-word-card-copy)`. Speak button is conditional on speech engine
  availability; copy button is always rendered (clipboard is browser-native).
- Dismiss listeners live in `src/ui/word-card.ts`:
    - Desktop: card `mouseenter`/`mouseleave` + document `scroll` (capture phase)
      via `handleDocumentScroll`.
    - Mobile: `attachDismissHandler()` wires `click`, `scroll`, `touchmove` to
      `document` capture-phase; all three dismiss when the target is outside
      the card and outside the word element. `touchmove` is needed because
      mobile swipes don't always fire `scroll` on the first finger move.
- Translation chain failures are **silent** (no `new Notice`) — only logged
  to console + `_lib/logs/YYYY-MM.jsonl` (`kind:"translation"`, `source:"none"`,
  `ok:false`). The toast was removed because benign "no translation returned"
  errors are not actionable; the JSONL log is the right surface for
  investigation. See `src/modules/translation/translation-chain.ts` doc comment.
- `subtitle-panel.ts:298` ALSO has a scroll listener on the inner subtitle
  list — redundant with the document-level capture listener, kept as a
  safety net. Hide() is idempotent so the double-fire is harmless.

## Lint gotchas (obsidianmd/ui/sentence-case)

- Only first word + recognized brands/acronyms (API, ID, URL, JSON, OAuth…) may be
  capitalized. Unknown brands (Tencent/Baidu/Alibaba/Cloud/NLS) must lead the string
  or be lowercased. A first-word camelCase token like `AccessKey` is force-lowercased
  to `Accesskey` — use `Access key` instead.
- `pnpm` is NOT installed in the sandbox; run toolchain via local bins:
  `node node_modules/typescript/bin/tsc -noEmit -skipLibCheck` and
  `node node_modules/vitest/vitest.mjs run --project unit`.
- oxfmt formats Markdown too (including `.workbuddy/memory/*.md`); run
  `node node_modules/oxfmt/dist/cli.js` (no `--check`) to auto-fix before
  running `--check` again.

## Git commit hazard in sandbox (genie-safe-delete shim) — WORKTREE-AWARE

- Symptom after `git commit`: `git log` → "does not have any commits yet";
  `git status` falsely shows ENTIRE repo as `A`. The commit OBJECT is fine
  (hash is printed in the commit line, e.g. `[branch 495b95b]`) — only the
  loose branch ref was deleted.
- For a LINKED WORKTREE, the shared branch ref lives in the MAIN repo's
  `.git/refs/heads/<branch>`, NOT in the worktree's own gitdir. So:
    - Do NOT write to `<git rev-parse --git-dir>/refs/heads/...` (that fails:
      ".git: Not a directory" because worktree `.git` is a pointer file).
    - Write to `<git rev-parse --git-common-dir>/refs/heads/<branch>`
      (this is the main repo's `.git`).
- Recovery (verified working):
    ```bash
    FULLHASH=<hash from commit line>
    COMMON=$(git rev-parse --git-common-dir)
    mkdir -p "$COMMON/refs/heads/mvp/feat"
    printf '%s\n' "$FULLHASH" > "$COMMON/refs/heads/mvp/feat/word-card"
    ```
- **STANDING RULE (2026-08-23, user explicit):** NEVER run `git commit` for
  this user. Only write/draft the commit message; the user commits themselves.
