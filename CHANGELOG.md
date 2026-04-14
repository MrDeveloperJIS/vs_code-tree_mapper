# Changelog

All notable changes to Tree Mapper are documented here.

---

## v2.0.0 — 2026-04-14

### Added

- **Interactive file picker** — Before generating a snapshot, a full-screen webview panel shows every file and folder in the workspace as a checkbox tree. Files/folders matching `treemapper.defaultIgnorePatterns` are unchecked by default and marked with an **excluded** badge; everything else is checked. Users can freely check or uncheck any item, expand/collapse directories, filter by name, and use **Select All** / **Deselect All** / **Reset Defaults** toolbar buttons before confirming.
- **Status bar item** — A persistent "Tree Mapper" entry in the right status bar shows live scan state (`$(sync~spin) Scanning…`, ignored count after scan, `$(sync~spin) Generating…`) and acts as a clickable shortcut to run the command.
- **Token count in snapshot header** — Every generated snapshot now includes an `Est. token count` field (e.g. `~12,400 tokens`) estimated at ~4 chars/token, useful for tracking LLM context consumption.
- **Dual tree sections in snapshot** — Snapshots now include two separate tree sections: `## Workspace Tree` (the full repository minus default-ignored paths) and `## Snapshot Tree` (only the files actually included in the snapshot).
- **Skipped files report** — When binary or oversized files are selected in the picker but cannot be included, a `## Skipped Files` section is added to the snapshot listing each file and its reason (binary file or size exceeded).
- **`Files excluded` header field** — Snapshot headers now show a `Files excluded` count alongside `Files included` when the user unchecked files in the picker.

### Changed

- **Snapshot header `Files skipped` field** — `Files skipped` (binary / oversized files) is now clearly distinguished from `Files excluded` (user-unchecked files) in the snapshot header.
- `syncGitignore` no longer adds `.treeignore` to `.gitignore` (only `.tree/` is added).
- `treemapper.defaultIgnorePatterns` now acts as "default unchecked" patterns in the interactive file picker instead of a `.treeignore` file template.

### Removed

- **`.treeignore` file** — Ignore rules are no longer persisted to disk. All filtering is handled interactively via the file picker.

---

## v1.2.0 — 2026-04-14

### Added

- **Snapshot rotation** — New `treemapper.keepLastSnapshots` setting (default: `10`) automatically deletes the oldest snapshots in `.tree/` after each run, keeping only the N most recent.
- **Configurable default ignore patterns** — New `treemapper.defaultIgnorePatterns` setting controls what gets written into `.treeignore` when it is auto-created on first run; has no effect once `.treeignore` already exists.
- **Published to the VS Code Marketplace** — Tree Mapper is now available directly via the Extensions panel (`Ctrl+Shift+X`) or at [marketplace.visualstudio.com](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper).

---

## v1.1.2 — 2026-04-11

### Changed

- Snapshot header now shows **Repo size** (total combined size of all included files) instead of the max file size limit.
- Repo size is formatted as `KB` for values under 1 MB, and `MB` otherwise (2 decimal places).

---

## v1.1.1 — 2026-04-11

### Added

- Auto-updates `.gitignore` on snapshot generation if a `.git` folder is detected in the target root.
- Creates `.gitignore` if it doesn't exist yet (but `.git` folder is present).
- Appends `.tree/` entry independently — only adds it if missing, no duplicates.
- Uses exact line matching to avoid false positives from substrings (e.g. `.treeignore-backup`).
- Entry is written under a `# Tree Mapper` comment block.

---

## v1.0.0 — Initial Release

### Added

- Generate a full Markdown snapshot of any folder via the Explorer right-click context menu.
- Command Palette support (`Tree Mapper: Generate Snapshot`) — falls back to workspace root when no folder URI is provided.
- CLI-style project tree with `├──` and `└──` characters, directories rendered before files.
- Language-aware fenced code blocks for 60+ file types.
- Binary file detection — files containing null bytes are skipped with a notice.
- File size limit — files exceeding `treemapper.maxFileSizeKB` (default: 2 MB) are skipped.
- `.treeignore` support — gitignore-style ignore rules scoped to the target folder.
- Auto-creates `.treeignore` in the target folder on first run if it doesn't exist.
- Always-ignored patterns: `node_modules/**`, `.git/**`, `dist/**`, `build/**`, `**/*.log`, `.tree/**`.
- `treemapper.additionalIgnorePatterns` setting — extra glob patterns to ignore via VS Code settings.
- Snapshot output saved to `.tree/yyyy-mm-dd-hh-mm-ss.md` using device local time (24-hour, filesystem-safe).
- Snapshot header includes local timestamp with timezone offset (e.g. `UTC+6`, `UTC+5:30`).
- Progress notification during scan, tree build, and render phases.
- **Open File** button in the success notification to open the snapshot immediately.
- Graceful error handling — scan errors and write errors shown as VS Code error messages.