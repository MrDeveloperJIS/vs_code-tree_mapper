# Changelog

All notable changes to Tree Mapper are documented here.

---

## v1.1.1 — 2026-04-11

### Added
- Auto-updates `.gitignore` on snapshot generation if a `.git` folder is detected in the target root
- Creates `.gitignore` if it doesn't exist yet (but `.git` folder is present)
- Appends `.tree/` and `.treeignore` entries independently — only adds whichever are missing, no duplicates
- Uses exact line matching to avoid false positives from substrings (e.g. `.treeignore-backup`)
- Entries are written under a `# Tree Mapper Snapshots` comment block

---

## v1.0.0 — Initial Release

### Added
- Generate a full Markdown snapshot of any folder via the Explorer right-click context menu
- Command Palette support (`Tree Mapper: Generate Snapshot`) — falls back to workspace root when no folder URI is provided
- CLI-style project tree with `├──` and `└──` characters, directories rendered before files
- Language-aware fenced code blocks for 60+ file types
- Binary file detection — files containing null bytes are skipped with a notice
- File size limit — files exceeding `treemapper.maxFileSizeKB` (default: 2 MB) are skipped
- `.treeignore` support — gitignore-style ignore rules scoped to the target folder
- Auto-creates `.treeignore` in the target folder on first run if it doesn't exist
- Always-ignored patterns: `node_modules/**`, `.git/**`, `dist/**`, `build/**`, `**/*.log`, `.tree/**`
- `treemapper.additionalIgnorePatterns` setting — extra glob patterns to ignore via VS Code settings
- Snapshot output saved to `.tree/yyyy-mm-dd-hh-mm-ss.md` using device local time (24-hour, filesystem-safe)
- Snapshot header includes local timestamp with timezone offset (e.g. `UTC+6`, `UTC+5:30`)
- Progress notification during scan, tree build, and render phases
- **Open File** button in the success notification to open the snapshot immediately
- Graceful error handling — scan errors and write errors shown as VS Code error messages