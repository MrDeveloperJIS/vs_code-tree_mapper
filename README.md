# Tree Mapper

> Generate a complete Markdown snapshot of any folder — full directory tree + every file's source code, in one click.

---

## What it does

Right-click any folder in VS Code's Explorer, run **Tree Mapper: Generate Snapshot**, and get a single `.md` file containing:

- A **Workspace Tree** — CLI-style `├──` / `└──` view of the full repository (excluding default-ignored paths), mirroring what you see in the Explorer sidebar
- A **Snapshot Tree** — the same tree format, showing only the files you chose to include
- Every included file's source code in language-aware fenced blocks (60+ languages)
- A header with timestamp, file counts (included / excluded / skipped), total repo size, and estimated token count

Snapshots are saved to `.tree/yyyy-mm-dd-hh-mm-ss.md` inside the target folder.

---

## Installation

**From the Marketplace (recommended)**

Open Extensions (`Ctrl+Shift+X`), search **Tree Mapper**, click Install.
Or visit the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper) directly.

Quick Open (`Ctrl+P`): `ext install MrDeveloperJIS.tree-mapper`

**From a VSIX file**

Download from the [Releases page](https://github.com/MrDeveloperJIS/tree-mapper/releases), then either:

- Extensions panel → `⋯` menu → **Install from VSIX…**
- Or via terminal: `code --install-extension path/to/tree-mapper-x.x.x.vsix`

---

## Usage

**Full folder snapshot**
Right-click any folder in the Explorer → **Tree Mapper: Generate Snapshot**
Scans the entire folder and all its contents.

**From the Command Palette**
`Ctrl+Shift+P` → **Tree Mapper: Generate Snapshot**
Snapshots the entire workspace root.

After triggering the command, the interactive file picker opens so you can choose exactly which files to include before the snapshot is generated. Once complete, a notification appears with an **Open File** button to view the result immediately.

---

## Interactive file picker

Before generating a snapshot, Tree Mapper opens a full-screen webview panel showing every file and folder as a checkbox tree. Files matching `treemapper.defaultIgnorePatterns` are unchecked by default and marked with an **excluded** badge; everything else is checked.

Available toolbar actions:

- **Select all** / **Deselect all** — bulk check/uncheck all files
- **Reset defaults** — restore the default checked/unchecked state
- **Filter** — type to narrow the tree by filename or path

The footer shows a live count of how many files will be included. Confirming the selection generates the snapshot; cancelling or closing the panel aborts the operation.

---

## Output format

```
> **Generated:** 2026 04 14 11:49:10 PM UTC+6
> **Files included:** 9
> **Files excluded:** 3
> **Repo size:** 48.30 KB
> **Est. token count:** ~12,400 tokens
```

Followed by two tree sections and all included file contents with syntax-highlighted code blocks.

### Workspace Tree

Reflects the full repository structure, excluding paths matched by `treemapper.defaultIgnorePatterns`. This mirrors the Explorer sidebar view and gives you the complete shape of the project regardless of what you chose to include in the snapshot.

```
my-project/
├── src/
│   ├── index.ts
│   └── utils.ts
├── package.json
└── README.md
```

### Snapshot Tree

Shows only the files that were actually included in this snapshot run — the subset you confirmed in the file picker.

### Skipped files

If you selected a file in the picker but it couldn't be read (binary content or exceeding `treemapper.maxFileSizeKB`), a `## Skipped Files` section appears in the snapshot listing each file and the reason it was omitted. The snapshot header also reports a `Files skipped` count separately from `Files excluded` (user-unchecked).

The token estimate uses a ~4 chars/token approximation, giving a useful sense of how much context window space the snapshot will consume.

---

## Git integration

If a `.git` folder is detected, Tree Mapper automatically adds `.tree/` to your `.gitignore` under a `# Tree Mapper` comment block. Only missing entries are added — no duplicates.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `treemapper.maxFileSizeKB` | `2048` | Skip files larger than this (in KB). Skipped files appear in the `Files skipped` header count and are omitted from file contents. |
| `treemapper.keepLastSnapshots` | `10` | Number of recent snapshots to keep in `.tree/`. Oldest are deleted automatically after each run. |
| `treemapper.defaultIgnorePatterns` | `.tree/`, `node_modules/`, `.git/`, `dist/`, `build/`, `**/*.log` | Glob patterns unchecked by default in the file picker. Users can still check these files individually. The `.tree/` directory is always excluded and cannot be overridden. |

---

## Requirements

VS Code 1.85.0 or higher.

---

## License

MIT © MD. Jahidul Islam Sujan