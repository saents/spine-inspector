import * as vscode from 'vscode';
import { SpineFolderManifest } from './scanSpineFolder';

export class SpinePanel {
  public static currentPanel: SpinePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly folderUri: vscode.Uri;
  private manifest: SpineFolderManifest;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    folderUri: vscode.Uri,
    manifest: SpineFolderManifest
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.folderUri = folderUri;
    this.manifest = manifest;

    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'error') {
          vscode.window.showErrorMessage(message.message);
        }
      },
      null,
      this.disposables
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    folderUri: vscode.Uri,
    manifest: SpineFolderManifest
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (
      SpinePanel.currentPanel &&
      SpinePanel.currentPanel.folderUri.toString() === folderUri.toString()
    ) {
      SpinePanel.currentPanel.panel.reveal(column);
      return;
    }

    SpinePanel.currentPanel?.dispose();

    const panel = vscode.window.createWebviewPanel(
      'spineInspector',
      `Spine: ${vscode.workspace.asRelativePath(folderUri)}`,
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri, folderUri],
      }
    );

    SpinePanel.currentPanel = new SpinePanel(panel, context.extensionUri, folderUri, manifest);
  }

  private buildInitPayload(webview: vscode.Webview): string {
    const json: Record<string, string> = {};

    for (const name of this.manifest.spines) {
      const fileUri = vscode.Uri.joinPath(this.folderUri, `${name}.json`);
      json[name] = webview.asWebviewUri(fileUri).toString();
    }

    const atlasUri = vscode.Uri.joinPath(this.folderUri, `${this.manifest.atlas}.atlas`);

    return JSON.stringify({
      atlas: this.manifest.atlas,
      spines: this.manifest.spines,
      assets: {
        atlas: webview.asWebviewUri(atlasUri).toString(),
        json,
      },
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const pixiUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pixi.js'));
    const pixiPatchUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'pixi-canvas-patch.js')
    );
    const pixiSpineUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'pixi-spine.js')
    );
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'));
    const initPayload = this.buildInitPayload(webview);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} data:; connect-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${pixiUri}"></script>
  <script nonce="${nonce}" src="${pixiPatchUri}"></script>
  <script nonce="${nonce}" src="${pixiSpineUri}"></script>
  <script nonce="${nonce}">window.__SPINE_INIT__=${initPayload};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    this.panel.dispose();
  }

  private onDispose(): void {
    SpinePanel.currentPanel = undefined;
    while (this.disposables.length) {
      const item = this.disposables.pop();
      item?.dispose();
    }
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
