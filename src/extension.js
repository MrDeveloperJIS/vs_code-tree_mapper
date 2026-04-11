'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { scanWorkspace } = require('./scanner');
const { buildTree } = require('./treeBuilder');
const { renderMarkdown } = require('./markdownRenderer');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // The command receives an optional URI when triggered from the Explorer
  // context menu. When triggered from the Command Palette, uri is undefined.
  const disposable = vscode.commands.registerCommand('tree-mapper.generate', async (uri) => {

    // ── 1. Resolve the root path ───────────────────────────────────────────
    // Priority: right-clicked folder URI → workspace root → error
    let rootPath;

    if (uri && uri.fsPath) {
      // Triggered from Explorer context menu — use the clicked folder
      const stat = fs.statSync(uri.fsPath);
      if (stat.isDirectory()) {
        rootPath = uri.fsPath;
      } else {
        // If somehow a file was passed, use its parent directory
        rootPath = path.dirname(uri.fsPath);
      }
    } else {
      // Triggered from Command Palette — fall back to workspace root
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Tree Mapper: No workspace folder is open.');
        return;
      }
      rootPath = workspaceFolders[0].uri.fsPath;
    }

    // ── 2. Read config ─────────────────────────────────────────────────────
    const config = vscode.workspace.getConfiguration('treemapper');
    const extraIgnore = config.get('additionalIgnorePatterns') || [];
    // FIX: default fallback updated to 2048 KB (2 MB)
    const maxFileSizeKB = config.get('maxFileSizeKB') || 2048;

    let outFile = null;

    // ── 3. Run with progress notification ─────────────────────────────────
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Tree Mapper',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Scanning workspace files…' });

        let files;
        try {
          files = await scanWorkspace(rootPath, extraIgnore, maxFileSizeKB);
        } catch (err) {
          vscode.window.showErrorMessage(`Tree Mapper scan error: ${err.message}`);
          return;
        }

        progress.report({ message: `Building tree for ${files.length} files…` });
        const treeLines = buildTree(files);

        progress.report({ message: 'Rendering Markdown snapshot…' });
        const markdown = renderMarkdown(rootPath, treeLines, files, maxFileSizeKB);

        // ── 4. Write output ────────────────────────────────────────────────
        const outDir = path.join(rootPath, '.tree');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        // ── 4b. Create .treeignore if it doesn't exist ─────────────────────
        const treeignorePath = path.join(rootPath, '.treeignore');
        if (!fs.existsSync(treeignorePath)) {
          const defaultTreeignore = [
            '',
          ].join('\n');
          fs.writeFileSync(treeignorePath, defaultTreeignore, 'utf8');
        }

        // ── 4c. Update .gitignore if this is a git repo ─────────────────────
        const gitDir = path.join(rootPath, '.git');
        if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
          const gitignorePath = path.join(rootPath, '.gitignore');

          let existing = '';
          if (fs.existsSync(gitignorePath)) {
            existing = fs.readFileSync(gitignorePath, 'utf8');
          }

          const existingLines = existing.split(/\r?\n/);
          const hasTree = existingLines.includes('.tree/');
          const hasTreeignore = existingLines.includes('.treeignore');

          if (!hasTree && !hasTreeignore) {
            // Neither exists — append full block with comment header
            const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
            fs.writeFileSync(gitignorePath, existing + separator + '# Tree Mapper Snapshots\n.tree/\n.treeignore\n', 'utf8');
          } else if (!hasTree) {
            // Only .treeignore exists — insert .tree/ right before it, no header
            const updated = existing.replace(/^\.treeignore$/m, '.tree/\n.treeignore');
            fs.writeFileSync(gitignorePath, updated, 'utf8');
          } else if (!hasTreeignore) {
            // Only .tree/ exists — insert .treeignore right after it, no header
            const updated = existing.replace(/^\.tree\/$/m, '.tree/\n.treeignore');
            fs.writeFileSync(gitignorePath, updated, 'utf8');
          }
        }

        const timestamp = getTimestamp();
        outFile = path.join(outDir, `${timestamp}.md`);

        try {
          fs.writeFileSync(outFile, markdown, 'utf8');
        } catch (err) {
          vscode.window.showErrorMessage(`Tree Mapper write error: ${err.message}`);
          outFile = null;
          return;
        }
        // withProgress callback returns here — spinner dismisses automatically
      }
    );

    // ── 5. Success notification — outside withProgress ─────────────────────
    // withProgress has already resolved so the spinner is gone by this point
    if (!outFile) return;

    const timestamp = path.basename(outFile, '.md');
    const choice = await vscode.window.showInformationMessage(
      `Tree Mapper: Snapshot saved → .tree/${timestamp}.md`,
      'Open File'
    );

    if (choice === 'Open File') {
      const doc = await vscode.workspace.openTextDocument(outFile);
      await vscode.window.showTextDocument(doc);
    }
  });

  context.subscriptions.push(disposable);
}

function deactivate() { }

/**
 * Returns a filesystem-safe local timestamp for use as a filename.
 * Format: yyyy-mm-dd-hh-mm-ss  (uses device local time, 24-hour)
 * Example: 2026-04-10-14-35-22
 */
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
}

module.exports = { activate, deactivate };