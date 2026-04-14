'use strict';

const ignore = require('ignore');

/**
 * Builds two trees:
 *
 *   workspaceTreeLines — the full repository minus default-ignored paths
 *                        (mirrors what you see in the Explorer sidebar)
 *
 *   snapshotTreeLines  — only the files the user checked and included
 *                        in this snapshot run
 *
 * @param {string[]}        files                 - relative paths of INCLUDED files
 * @param {Set<string>}     [excludedSet]          - relative paths of all non-included files
 * @param {string[]}        [defaultIgnorePatterns]- patterns from treemapper.defaultIgnorePatterns
 * @param {Array<{rel:string,isDir:boolean}>} [allEntries] - full flat entry list from scanner
 * @returns {{ workspaceTreeLines: string[], snapshotTreeLines: string[] }}
 */
function buildTree(
  files,
  excludedSet = new Set(),
  defaultIgnorePatterns = [],
  allEntries = [],
) {
  // ── Workspace tree ────────────────────────────────────────────────────────
  // Show every file/dir that is NOT matched by the default ignore patterns.
  // This mirrors the Explorer view (same rules as defaultIgnorePatterns).
  const ig = ignore();
  if (defaultIgnorePatterns.length > 0) {
    ig.add(defaultIgnorePatterns);
  }
  ig.add('.tree/');

  const workspacePaths = allEntries
    .filter((e) => {
      if (e.isDir) return false; // dirs are implied by their files
      const rel = e.rel;
      return !ig.ignores(rel);
    })
    .map((e) => e.rel);

  const workspaceTreeLines = renderTree(workspacePaths);

  // ── Snapshot tree ─────────────────────────────────────────────────────────
  // Show only the files that were actually included (checked + not skipped).
  const snapshotTreeLines = renderTree(files);

  return { workspaceTreeLines, snapshotTreeLines };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Given a flat list of relative file paths, builds a nested object tree and
 * renders it as an array of CLI-style connector lines.
 *
 * @param {string[]} filePaths
 * @returns {string[]}
 */
function renderTree(filePaths) {
  const root = {};

  for (const filePath of filePaths) {
    const parts = filePath.split('/');
    let node = root;
    for (const part of parts) {
      if (!node[part]) node[part] = {};
      node = node[part];
    }
    node.__file = true;
  }

  const lines = [];
  renderNode(root, '', lines);
  return lines;
}

function renderNode(node, prefix, lines) {
  const keys = Object.keys(node).filter((k) => k !== '__file');

  const hasChildren = (k) =>
    Object.keys(node[k]).filter((x) => x !== '__file').length > 0;

  const dirs     = keys.filter(hasChildren);
  const fileKeys = keys.filter((k) => !hasChildren(k));

  const sorted = [
    ...dirs.sort((a, b) => a.localeCompare(b)),
    ...fileKeys.sort((a, b) => a.localeCompare(b)),
  ];

  sorted.forEach((key, index) => {
    const isLast      = index === sorted.length - 1;
    const connector   = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    lines.push(`${prefix}${connector}${key}`);

    if (hasChildren(key)) {
      renderNode(node[key], prefix + childPrefix, lines);
    }
  });
}

module.exports = { buildTree };