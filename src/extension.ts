import * as vscode from 'vscode';
import { scanSpineFolder } from './scanSpineFolder';
import { SpinePanel } from './spinePanel';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('spine-inspector.open', (uri?: vscode.Uri) => {
      const folderUri = uri ?? getExplorerFolderUri();
      if (!folderUri) {
        vscode.window.showErrorMessage('Select a folder in the Explorer to open Spine Inspector.');
        return;
      }

      const manifest = scanSpineFolder(folderUri.fsPath);
      if (!manifest) {
        vscode.window.showErrorMessage('No spine files found in this folder (need one .atlas and at least one .json).');
        return;
      }

      SpinePanel.createOrShow(context, folderUri, manifest);
    })
  );
}

function getExplorerFolderUri(): vscode.Uri | undefined {
  if (vscode.workspace.workspaceFolders?.length === 1) {
    return vscode.workspace.workspaceFolders[0].uri;
  }
  return undefined;
}

export function deactivate(): void {}
