'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { scanWorkspace } = require('./scanner');
const { buildTree } = require('./treeBuilder');
const { renderMarkdown } = require('./markdownRenderer');

/** @type {vscode.StatusBarItem} */
let statusBarItem;

function activate(context) {
  // ── Status bar ──────────────────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.name = 'Tree Mapper';
  statusBarItem.text = '$(file-directory) Tree Mapper';
  statusBarItem.tooltip = 'Tree Mapper: Click to generate a snapshot';
  statusBarItem.command = 'tree-mapper.generate';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Command ─────────────────────────────────────────────────────────────────
  const disposable = vscode.commands.registerCommand('tree-mapper.generate', async (uri) => {
    let rootPath;

    if (uri && uri.fsPath) {
      const stat = fs.statSync(uri.fsPath);
      rootPath = stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath);
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Tree Mapper: No workspace folder is open.');
        return;
      }
      rootPath = workspaceFolders[0].uri.fsPath;
    }

    const config = vscode.workspace.getConfiguration('treemapper');
    const maxFileSizeKB = config.get('maxFileSizeKB') || 2048;
    const keepLastSnapshots = config.get('keepLastSnapshots') || 10;
    const defaultIgnorePatterns = config.get('defaultIgnorePatterns') || [];

    // ── Step 1: Pre-scan everything (no ignore filtering) ──────────────────
    updateStatusBar('$(sync~spin) Scanning…', 'Tree Mapper: Scanning files…');

    let allEntries;
    try {
      allEntries = await scanWorkspace(rootPath, maxFileSizeKB, defaultIgnorePatterns);
    } catch (err) {
      vscode.window.showErrorMessage(`Tree Mapper scan error: ${err.message}`);
      resetStatusBar();
      return;
    }

    updateStatusBar(
      `$(file-directory) Tree Mapper — ${allEntries.ignored} ignored`,
      `Tree Mapper: ${allEntries.total} files found, ${allEntries.ignored} ignored by default`
    );

    // ── Step 2: Show interactive file picker ─────────────────────────────────
    const panel = vscode.window.createWebviewPanel(
      'treemapperPicker',
      'Tree Mapper — Select Files',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = buildPickerHtml(allEntries.tree, path.basename(rootPath));

    // Wait for user to confirm or cancel
    const selected = await new Promise((resolve) => {
      panel.webview.onDidReceiveMessage((msg) => {
        if (msg.command === 'confirm') {
          resolve(msg.selected); // string[] of relative paths
        } else if (msg.command === 'cancel') {
          resolve(null);
        }
      });
      panel.onDidDispose(() => resolve(null));
    });

    panel.dispose();

    if (!selected) {
      resetStatusBar();
      return;
    }

    // ── Step 3: Generate snapshot from selected files ────────────────────────
    updateStatusBar('$(sync~spin) Generating…', 'Tree Mapper: Generating snapshot…');

    let outFile = null;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Tree Mapper',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: `Building tree for ${selected.length} files…` });

        // Include any entry the user checked, regardless of ignoredByDefault flag.
        const selectedPaths = selected.filter((rel) => {
          const entry = allEntries.entries.find((e) => e.rel === rel && !e.isDir);
          return !!entry;
        });

        let totalSizeBytes = 0;
        let skippedCount = 0;
        /** @type {{ rel: string, reason: string }[]} */
        const skippedFiles = [];   // ← NEW: collect skipped file details
        const validFiles = [];

        for (const rel of selectedPaths) {
          const entry = allEntries.entries.find((e) => e.rel === rel);
          if (!entry) continue;

          if (entry.skipped && !entry.isBinary && entry.size <= (maxFileSizeKB * 1024)) {
            entry.skipped = false;
          }

          if (entry.skipped) {
            skippedCount++;
            // ── NEW: record reason ──────────────────────────────────────────
            skippedFiles.push({
              rel,
              reason: entry.isBinary
                ? 'binary file'
                : `exceeds size limit (${(entry.size / 1024).toFixed(1)} KB)`,
            });
            continue;
          }

          totalSizeBytes += entry.size;
          validFiles.push(rel);
        }

        // Compute excluded files (user-unchecked)
        const allFilePaths = allEntries.entries
          .filter((e) => !e.isDir)
          .map((e) => e.rel);

        const validSet = new Set(validFiles);
        const excludedSet = new Set(
          allFilePaths.filter((r) => !validSet.has(r))
        );

        // Build both trees
        const { workspaceTreeLines, snapshotTreeLines } = buildTree(
          validFiles,
          excludedSet,
          defaultIgnorePatterns,
          allEntries.entries,
        );

        progress.report({ message: 'Rendering Markdown snapshot…' });

        const markdown = renderMarkdown(
          rootPath,
          workspaceTreeLines,
          snapshotTreeLines,
          validFiles,
          totalSizeBytes,
          skippedCount,
          excludedSet.size,
          skippedFiles,        // ← NEW
        );

        const outDir = path.join(rootPath, '.tree');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        syncGitignore(rootPath);

        const timestamp = getTimestamp();
        outFile = path.join(outDir, `${timestamp}.md`);

        try {
          fs.writeFileSync(outFile, markdown, 'utf8');
        } catch (err) {
          vscode.window.showErrorMessage(`Tree Mapper write error: ${err.message}`);
          outFile = null;
          return;
        }

        pruneSnapshots(outDir, keepLastSnapshots);
      }
    );

    resetStatusBar();

    if (!outFile) return;

    // ── Auto-dismissing "Open File" notification (3 s) ──────────────────────
    const timestamp = path.basename(outFile, '.md');

    // Race: either the user clicks "Open File" or 3 s elapse — whichever
    // comes first wins. withProgress auto-closes when the promise resolves.
    const choice = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);

      vscode.window
        .showInformationMessage(
          `Tree Mapper: Snapshot saved → .tree/${timestamp}.md`,
          'Open File'
        )
        .then((value) => {
          clearTimeout(timer);
          resolve(value ?? null);
        });
    });

    if (choice === 'Open File') {
      const doc = await vscode.workspace.openTextDocument(outFile);
      await vscode.window.showTextDocument(doc);
    }
  });

  context.subscriptions.push(disposable);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function updateStatusBar(text, tooltip) {
  if (!statusBarItem) return;
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
}

function resetStatusBar() {
  updateStatusBar('$(file-directory) Tree Mapper', 'Tree Mapper: Click to generate a snapshot');
}

function syncGitignore(rootPath) {
  const gitDir = path.join(rootPath, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return;

  const gitignorePath = path.join(rootPath, '.gitignore');
  let existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';

  const lines = existing.split(/\r?\n/);
  const hasTree = lines.includes('.tree/');

  if (hasTree) return;

  const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(gitignorePath, existing + sep + '# Tree Mapper\n.tree/\n', 'utf8');
}

function pruneSnapshots(outDir, keepLast) {
  try {
    const pattern = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.md$/;
    const all = fs.readdirSync(outDir).filter((f) => pattern.test(f)).sort();
    for (const f of all.slice(0, Math.max(0, all.length - keepLast))) {
      fs.unlinkSync(path.join(outDir, f));
    }
  } catch {
    // non-fatal
  }
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-')
    + '-'
    + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');
}

// ── Webview HTML ──────────────────────────────────────────────────────────────

function buildPickerHtml(treeNodes, projectName) {
  const treeJson = JSON.stringify(treeNodes);
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tree Mapper</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');

  :root {
    --bg:        var(--vscode-editor-background,      #141414);
    --bg-panel:  var(--vscode-sideBar-background,     #1a1a1a);
    --bg-input:  var(--vscode-input-background,       #222222);
    --bg-hover:  var(--vscode-list-hoverBackground,   #1f1f1f);
    --border:    var(--vscode-panel-border,           #2a2a2a);
    --fg:        var(--vscode-editor-foreground,      #e0e0e0);
    --fg-dim:    var(--vscode-descriptionForeground,  #666);
    --fg-muted:  #444;
    --accent:    var(--vscode-button-background,      #3b82f6);
    --accent-fg: var(--vscode-button-foreground,      #fff);
    --accent-glow: rgba(59,130,246,0.15);
    --danger-soft: rgba(239,68,68,0.08);
    --danger-text: #f87171;
    --danger-border: rgba(239,68,68,0.2);
    --success: #34d399;
    --mono: 'JetBrains Mono', 'Consolas', monospace;
    --sans: 'Inter', var(--vscode-font-family, sans-serif);
    --radius: 5px;
    --transition: 0.15s ease;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 13px;
    height: 100vh;
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    overflow: hidden;
  }

  /* ─── Header ─────────────────────────────────────────────────────────── */
  .header {
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    padding: 16px 20px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--accent-glow);
    border: 1px solid rgba(59,130,246,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .header-icon svg { width: 14px; height: 14px; fill: var(--accent); }
  .header-text {}
  .header-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--fg);
    line-height: 1;
    margin-bottom: 4px;
  }
  .header-sub {
    font-size: 11px;
    color: var(--fg-dim);
    font-family: var(--mono);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .project-chip {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 11px;
    color: var(--fg);
  }
  .header-actions { margin-left: auto; display: flex; gap: 6px; }

  /* ─── Toolbar ────────────────────────────────────────────────────────── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }
  .btn-ghost {
    background: transparent;
    color: var(--fg-dim);
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 4px 10px;
    font-size: 11px;
    font-family: var(--sans);
    font-weight: 500;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: color var(--transition), border-color var(--transition), background var(--transition);
    white-space: nowrap;
  }
  .btn-ghost:hover {
    color: var(--fg);
    border-color: var(--border);
    background: var(--bg-input);
  }
  .divider-v {
    width: 1px;
    height: 16px;
    background: var(--border);
    flex-shrink: 0;
  }
  .search-wrap {
    flex: 1;
    min-width: 100px;
    position: relative;
  }
  .search-wrap svg {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    stroke: var(--fg-muted);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 11.5px;
    padding: 5px 10px 5px 28px;
    outline: none;
    transition: border-color var(--transition);
  }
  .search-input::placeholder { color: var(--fg-muted); }
  .search-input:focus { border-color: rgba(59,130,246,0.4); }

  .stats-pill {
    margin-left: auto;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--fg-dim);
    white-space: nowrap;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 3px 10px;
  }
  .stats-pill .count { color: var(--fg); font-weight: 500; }

  /* ─── Legend ─────────────────────────────────────────────────────────── */
  .legend {
    display: flex;
    gap: 0;
    padding: 0 20px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    color: var(--fg-dim);
    letter-spacing: 0.02em;
    padding: 6px 12px 6px 0;
    font-family: var(--mono);
  }
  .legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-dot.included { background: var(--success); }
  .legend-dot.excluded { background: var(--danger-text); }

  /* ─── Tree ───────────────────────────────────────────────────────────── */
  .tree-scroll {
    overflow-y: auto;
    padding: 6px 0 12px;
  }

  .tree-row {
    display: flex;
    align-items: center;
    padding: 0 20px 0 0;
    height: 26px;
    cursor: default;
    user-select: none;
    border-radius: 0;
    transition: background var(--transition);
  }
  .tree-row:hover { background: var(--bg-hover); }
  .tree-row.hidden { display: none; }

  /* Indentation connector lines */
  .indent-block {
    display: inline-flex;
    align-items: center;
    width: 20px;
    height: 26px;
    flex-shrink: 0;
    position: relative;
  }
  .indent-block.has-line::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border);
  }

  .toggle-zone {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 3px;
    color: var(--fg-muted);
    transition: color var(--transition), background var(--transition);
  }
  .toggle-zone:hover { color: var(--fg); background: var(--bg-input); }
  .toggle-zone.leaf { cursor: default; }
  .toggle-zone.leaf:hover { background: transparent; }
  .toggle-zone svg { width: 10px; height: 10px; stroke: currentColor; fill: none; transition: transform 0.15s; }
  .toggle-zone.collapsed svg { transform: rotate(-90deg); }

  .node-cb {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    margin: 0 7px 0 5px;
    cursor: pointer;
    accent-color: var(--accent);
    border-radius: 2px;
  }

  .node-label {
    font-family: var(--mono);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    color: var(--fg);
    letter-spacing: -0.01em;
  }
  .node-label.dir-label { color: var(--vscode-symbolIcon-folderForeground, #c9a96a); }
  .node-label.dim { opacity: 0.4; }

  .excl-chip {
    font-size: 9.5px;
    font-family: var(--sans);
    font-weight: 500;
    letter-spacing: 0.04em;
    background: var(--danger-soft);
    color: var(--danger-text);
    border: 1px solid var(--danger-border);
    border-radius: 3px;
    padding: 1px 5px;
    margin-left: 8px;
    flex-shrink: 0;
    text-transform: uppercase;
  }

  .size-tag {
    font-size: 10px;
    font-family: var(--mono);
    color: var(--fg-muted);
    margin-left: 8px;
    margin-right: 4px;
    flex-shrink: 0;
  }

  /* ─── Footer ─────────────────────────────────────────────────────────── */
  .footer {
    border-top: 1px solid var(--border);
    padding: 10px 20px;
    background: var(--bg-panel);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .footer-info {
    flex: 1;
    font-size: 11.5px;
    color: var(--fg-dim);
    font-family: var(--mono);
  }
  .footer-info .hi { color: var(--fg); font-weight: 500; }

  .btn-cancel {
    background: transparent;
    color: var(--fg-dim);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 14px;
    font-size: 12px;
    font-family: var(--sans);
    cursor: pointer;
    transition: color var(--transition), border-color var(--transition);
  }
  .btn-cancel:hover { color: var(--fg); border-color: #444; }

  .btn-generate {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: var(--radius);
    padding: 6px 16px;
    font-size: 12px;
    font-family: var(--sans);
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: opacity var(--transition), box-shadow var(--transition);
    box-shadow: 0 0 0 0 var(--accent-glow);
  }
  .btn-generate:hover:not(:disabled) {
    opacity: 0.9;
    box-shadow: 0 0 0 4px var(--accent-glow);
  }
  .btn-generate:disabled { opacity: 0.3; cursor: not-allowed; }

  /* scrollbar */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-icon">
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3h5l1.5 2H14v8H2V3z"/>
    </svg>
  </div>
  <div class="header-text">
    <div class="header-title">Select Files for Snapshot</div>
    <div class="header-sub">
      <span class="project-chip">${projectName}</span>
      <span>Files ignored by default are unchecked — enable them individually</span>
    </div>
  </div>
</div>

<!-- Toolbar -->
<div class="toolbar">
  <button class="btn-ghost" onclick="selectAll()">Select all</button>
  <button class="btn-ghost" onclick="selectNone()">Deselect all</button>
  <button class="btn-ghost" onclick="resetDefaults()">Reset defaults</button>
  <div class="divider-v"></div>
  <div class="search-wrap">
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-width="1.5">
      <circle cx="6.5" cy="6.5" r="4"/>
      <path d="M11 11l3 3" stroke-linecap="round"/>
    </svg>
    <input class="search-input" id="searchInput" type="text" placeholder="Filter files…" oninput="filterTree(this.value)">
  </div>
  <div class="stats-pill" id="statsLabel"><span class="count">—</span> / <span class="count">—</span></div>
</div>

<!-- Legend -->
<div class="legend">
  <div class="legend-item"><div class="legend-dot included"></div>Included by default</div>
  <div class="legend-item" style="margin-left:16px"><div class="legend-dot excluded"></div>Excluded by default</div>
</div>

<!-- Tree -->
<div class="tree-scroll" id="treeContainer"></div>

<!-- Footer -->
<div class="footer">
  <div class="footer-info" id="footerInfo">Loading…</div>
  <button class="btn-cancel" onclick="cancel()">Cancel</button>
  <button class="btn-generate" id="generateBtn" onclick="generate()" disabled>Generate Snapshot</button>
</div>

<script>
const vscode = acquireVsCodeApi();
const TREE = ${treeJson};

let nodeMap = {};      // rel → node
let allFileNodes = []; // flat list of file nodes

// ── Build UI ────────────────────────────────────────────────────────────────
function buildUI() {
  const container = document.getElementById('treeContainer');
  container.innerHTML = '';
  nodeMap = {};
  allFileNodes = [];
  renderLevel(TREE, container, 0, []);
  updateStats();
}

/**
 * @param {Array}     nodes
 * @param {Element}   container
 * @param {number}    depth
 * @param {boolean[]} ancestorIsLast  - whether each ancestor level is the last child
 */
function renderLevel(nodes, container, depth, ancestorIsLast) {
  nodes.forEach((node, idx) => {
    nodeMap[node.rel] = node;
    if (!node.isDir) allFileNodes.push(node);

    const isLast = idx === nodes.length - 1;

    // ── Row ────────────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.rel = node.rel;
    row.dataset.isDir = node.isDir ? '1' : '0';

    // indent blocks (one per ancestor level)
    for (let i = 0; i < depth; i++) {
      const block = document.createElement('span');
      block.className = 'indent-block' + (ancestorIsLast[i] ? '' : ' has-line');
      row.appendChild(block);
    }

    // toggle chevron for dirs, spacer for files
    const tog = document.createElement('span');
    tog.className = 'toggle-zone' + (node.isDir && node.children && node.children.length ? '' : ' leaf');
    tog.innerHTML = node.isDir && node.children && node.children.length
      ? '<svg viewBox="0 0 10 10" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,3 5,7 8,3"/></svg>'
      : '';
    if (node.isDir && node.children && node.children.length) {
      tog.addEventListener('click', (e) => {
        e.stopPropagation();
        const childWrap = document.querySelector('[data-parent-rel="' + CSS.escape(node.rel) + '"]');
        if (!childWrap) return;
        const collapsed = childWrap.style.display === 'none';
        childWrap.style.display = collapsed ? '' : 'none';
        tog.classList.toggle('collapsed', !collapsed);
      });
    }
    row.appendChild(tog);

    // checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'node-cb';
    cb.dataset.rel = node.rel;
    cb.checked = !node.ignoredByDefault;
    cb.addEventListener('change', () => {
      if (node.isDir) {
        setDescendantsChecked(node.rel, cb.checked);
      }
      updateAncestors(node.rel);
      updateStats();
    });
    row.appendChild(cb);

    // label
    const label = document.createElement('span');
    label.className = 'node-label'
      + (node.isDir ? ' dir-label' : '')
      + (node.ignoredByDefault ? ' dim' : '');
    label.textContent = node.name;
    row.appendChild(label);

    // excluded chip
    if (node.ignoredByDefault) {
      const chip = document.createElement('span');
      chip.className = 'excl-chip';
      chip.textContent = 'excluded';
      row.appendChild(chip);
    }

    // size
    if (!node.isDir && node.size) {
      const sz = document.createElement('span');
      sz.className = 'size-tag';
      sz.textContent = fmtSize(node.size);
      row.appendChild(sz);
    }

    container.appendChild(row);

    // ── Children ──────────────────────────────────────────────────────────
    if (node.isDir && node.children && node.children.length) {
      const childWrap = document.createElement('div');
      childWrap.dataset.parentRel = node.rel;
      renderLevel(node.children, childWrap, depth + 1, [...ancestorIsLast, isLast]);
      container.appendChild(childWrap);
    }
  });
}

// ── Checkbox helpers ────────────────────────────────────────────────────────
function setDescendantsChecked(dirRel, checked) {
  const node = nodeMap[dirRel];
  if (!node) return;
  const dirCb = getCb(dirRel);
  if (dirCb) { dirCb.checked = checked; dirCb.indeterminate = false; }
  function recurse(children) {
    if (!children) return;
    for (const c of children) {
      const cb = getCb(c.rel);
      if (cb) { cb.checked = checked; cb.indeterminate = false; }
      if (c.isDir) recurse(c.children);
    }
  }
  recurse(node.children);
}

function updateAncestors(rel) {
  const parts = rel.split('/');
  for (let i = parts.length - 1; i >= 1; i--) {
    const parentRel = parts.slice(0, i).join('/');
    const parentCb = getCb(parentRel);
    if (!parentCb) continue;
    const childFileCbs = getDescFileCbs(parentRel);
    const checkedN = childFileCbs.filter(c => c.checked).length;
    if (checkedN === 0) { parentCb.checked = false; parentCb.indeterminate = false; }
    else if (checkedN === childFileCbs.length) { parentCb.checked = true; parentCb.indeterminate = false; }
    else { parentCb.checked = false; parentCb.indeterminate = true; }
  }
}

function getDescFileCbs(dirRel) {
  const node = nodeMap[dirRel];
  const result = [];
  function recurse(children) {
    if (!children) return;
    for (const c of children) {
      if (!c.isDir) { const cb = getCb(c.rel); if (cb) result.push(cb); }
      else recurse(c.children);
    }
  }
  if (node) recurse(node.children);
  return result;
}

function getCb(rel) {
  return document.querySelector('input.node-cb[data-rel="' + CSS.escape(rel) + '"]');
}

// ── Toolbar actions ─────────────────────────────────────────────────────────
function selectAll() {
  document.querySelectorAll('input.node-cb').forEach(cb => { cb.checked = true; cb.indeterminate = false; });
  updateStats();
}
function selectNone() {
  document.querySelectorAll('input.node-cb').forEach(cb => { cb.checked = false; cb.indeterminate = false; });
  updateStats();
}
function resetDefaults() {
  // Reset file checkboxes
  document.querySelectorAll('input.node-cb').forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    cb.checked = !node.ignoredByDefault;
    cb.indeterminate = false;
  });
  // Recompute dir states
  allFileNodes.forEach(n => updateAncestors(n.rel));
  updateStats();
}

// ── Filter ──────────────────────────────────────────────────────────────────
function filterTree(q) {
  q = q.toLowerCase().trim();
  if (!q) {
    document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('hidden'));
    document.querySelectorAll('[data-parent-rel]').forEach(w => w.style.display = '');
    return;
  }
  document.querySelectorAll('.tree-row').forEach(row => {
    const rel = row.dataset.rel || '';
    row.classList.toggle('hidden', !rel.toLowerCase().includes(q));
  });
}

// ── Stats ───────────────────────────────────────────────────────────────────
function updateStats() {
  let total = 0, selected = 0;
  document.querySelectorAll('input.node-cb').forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    total++;
    if (cb.checked) selected++;
  });
  const label = document.getElementById('statsLabel');
  label.innerHTML = '<span class="count">' + selected + '</span> / <span class="count">' + total + '</span>';
  document.getElementById('footerInfo').innerHTML =
    '<span class="hi">' + selected + '</span> file' + (selected !== 1 ? 's' : '') + ' will be included in the snapshot';
  document.getElementById('generateBtn').disabled = selected === 0;
}

// ── Generate / Cancel ────────────────────────────────────────────────────────
function generate() {
  const selected = [];
  document.querySelectorAll('input.node-cb').forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    if (cb.checked) selected.push(cb.dataset.rel);
  });
  vscode.postMessage({ command: 'confirm', selected });
}
function cancel() {
  vscode.postMessage({ command: 'cancel' });
}

// ── Utilities ────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

buildUI();
</script>
</body>
</html>`;
}

function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
}

module.exports = { activate, deactivate };