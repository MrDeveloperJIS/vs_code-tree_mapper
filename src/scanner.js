'use strict';

const path = require('path');
const fs = require('fs');
const fg = require('fast-glob');
const ignore = require('ignore');

/**
 * Scans the workspace and returns a tree structure with ignore metadata.
 * No .treeignore — ignore rules come purely from defaultIgnorePatterns setting.
 *
 * Returns:
 *   {
 *     tree: TreeNode[],       // nested tree for the webview
 *     entries: EntryMeta[],   // flat list of all entries with metadata
 *     total: number,          // total file count
 *     ignored: number,        // files flagged as ignoredByDefault
 *   }
 */
async function scanWorkspace(rootPath, maxFileSizeKB = 2048, defaultIgnorePatterns = []) {
  const ig = ignore();
  if (defaultIgnorePatterns.length > 0) {
    ig.add(defaultIgnorePatterns);
  }

  // Always hard-ignore .tree/ output dir itself
  ig.add('.tree/');

  const entries = await fg('**/*', {
    cwd: rootPath,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: false,   // include dirs too for tree display
    markDirectories: true,
    suppressErrors: true,
  });

  const maxBytes = maxFileSizeKB * 1024;
  const entryMetas = [];
  let totalFiles = 0;
  let ignoredFiles = 0;

  // Process each entry
  for (let rel of entries) {
    const isDir = rel.endsWith('/');
    const cleanRel = isDir ? rel.slice(0, -1) : rel;

    // Check if ignored by default patterns
    const ignoredByDefault = ig.ignores(isDir ? cleanRel + '/' : cleanRel)
      || ig.ignores(cleanRel);

    let size = 0;
    let skipped = false;
    let isBinary = false;

    if (!isDir) {
      totalFiles++;
      if (ignoredByDefault) ignoredFiles++;

      try {
        const stat = fs.statSync(path.join(rootPath, cleanRel));
        size = stat.size;

        if (size > maxBytes) {
          skipped = true;
        } else {
          // Binary check
          const buf = fs.readFileSync(path.join(rootPath, cleanRel));
          if (buf.includes(0)) {
            isBinary = true;
            skipped = true;
          }
        }
      } catch {
        skipped = true;
      }
    }

    entryMetas.push({
      rel: cleanRel,
      isDir,
      ignoredByDefault,
      size,
      skipped,
      isBinary,
      name: path.basename(cleanRel),
    });
  }

  // Build nested tree structure for the webview
  const tree = buildNestedTree(entryMetas, rootPath);

  return {
    tree,
    entries: entryMetas,
    total: totalFiles,
    ignored: ignoredFiles,
  };
}

/**
 * Builds a nested tree from flat entry list.
 * Directories come before files at each level, both sorted alphabetically.
 */
function buildNestedTree(entryMetas, rootPath) {
  // Build a map of dir path → children
  const dirMap = new Map(); // dirPath → EntryMeta[]
  dirMap.set('', []);

  for (const e of entryMetas) {
    const parentDir = path.dirname(e.rel);
    const normalParent = parentDir === '.' ? '' : parentDir;
    if (!dirMap.has(normalParent)) dirMap.set(normalParent, []);
    if (!dirMap.has(e.rel) && e.isDir) dirMap.set(e.rel, []);
    dirMap.get(normalParent).push(e);
  }

  function buildLevel(dirPath) {
    const children = dirMap.get(dirPath) || [];
    const dirs = children.filter(e => e.isDir).sort((a, b) => a.name.localeCompare(b.name));
    const files = children.filter(e => !e.isDir).sort((a, b) => a.name.localeCompare(b.name));

    return [...dirs, ...files].map(e => ({
      ...e,
      children: e.isDir ? buildLevel(e.rel) : undefined,
    }));
  }

  return buildLevel('');
}

module.exports = { scanWorkspace };