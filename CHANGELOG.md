# Changelog

All notable changes to Tree Mapper are documented here.

---

## v2.2.1 — 2026-05-06

### Fixed

- **"Open File" button now works reliably** — The success notification was previously wrapped in a `withProgress` call, causing the button click to be ignored if the progress timer resolved first. The notification is now a plain promise with a 3-second auto-dismiss timeout, so clicking "Open File" correctly opens the snapshot in the editor.

---

## v2.2.0 — 2026-04-29

### Changed

- **Picker UI redesigned again** — The file picker has a new deep-navy visual theme (`#080810` base) with a violet-to-cyan gradient accent, ambient radial mesh background, Inter/JetBrains Mono fonts, pill-shaped buttons and chips, and a gradient scrollbar thumb. Glassmorphism backdrop-blur is applied to the header, toolbar, and footer.
- **Snapshot generation refactored out of `withProgress`** — The file selection, tree building, and Markdown rendering steps now run outside the progress callback. The first `withProgress` call is now a short fixed-delay placeholder (~1 s), eliminating the prior nested async structure.
- **Excluded chip label changed** — The `excl` label in excluded-file rows is now `x`.

### Removed

- **File-type colour icons** — Per-extension colour-coded file icons have been removed from the picker tree rows.
- **Legend bar** — The included/excluded colour legend row between the toolbar and the file tree has been removed.

---

## v2.1.0 — 2026-04-28

### Added

- **Last-selection memory** — The file picker now remembers which files were checked in the previous run. Selections are persisted to `.tree/last-selection.json` and automatically restored the next time the picker opens for the same workspace root.
- **"Restore last selection" toolbar button** — A new button (styled with an accent highlight) appears in the picker toolbar when a saved selection exists, letting users instantly restore their previous choices.
- **"Select filtered" toolbar button** — A new toolbar button checks only the files currently visible after a filter search, making it easy to include or scope a selection to a specific subfolder or file pattern.
- **Auto-dismissing success notification** — The "Snapshot saved" notification now automatically dismisses after 3 seconds. The **Open File** button remains available during that window.
- **File-type colour icons** — Every file row in the picker now shows a small colour-coded icon based on file extension (JS, TS, CSS, JSON, Markdown, Python, Rust, Go, etc.), making it easier to identify files at a glance.
- **Directories auto-collapse when all children are excluded** — Folders whose entire contents are matched by `treemapper.defaultIgnorePatterns` start collapsed in the picker, reducing noise in large repositories.
- **Indentation connector lines** — The picker tree now renders vertical guide lines between indent levels, giving the file hierarchy a cleaner, IDE-like appearance.

### Changed

- **Picker UI completely redesigned** — The file picker webview has been rebuilt with a new design system: darker background palette, Geist/Geist Mono fonts, glassmorphism-style header and footer, animated entrance transitions (slide-down header, slide-up footer, fade-in tree), and a subtle SVG noise grain overlay.
- **Stats pill highlights active selection** — The file count pill in the toolbar now uses an accent-coloured border and highlighted selected count when files are checked, making the current selection state more visible.


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