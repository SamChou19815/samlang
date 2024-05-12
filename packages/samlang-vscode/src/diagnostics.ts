// Forked from https://github.com/rust-lang/rust-analyzer/blob/1a5bb27c018c947dab01ab70ffe1d267b0481a17/editors/code/src/diagnostics.ts

import * as path from 'path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

export const DIAGNOSTICS_URI_SCHEME = 'samlang-diagnostics-view';

function getRendered(client: LanguageClient, uri: vscode.Uri): string {
  const diags = client?.diagnostics?.get(vscode.Uri.parse(uri.fragment, true));
  if (!diags) {
    return 'Unable to find original samlang diagnostic due to missing diagnostic in client';
  }

  const diag = diags[parseInt(uri.query)];
  if (!diag) {
    return 'Unable to find original samlang diagnostic due to bad index';
  }
  const rendered = (diag as unknown as { data?: { rendered?: string } }).data?.rendered;

  if (!rendered) {
    return 'Unable to find original samlang diagnostic due to missing render';
  }

  return rendered;
}

export class TextDocumentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  public constructor(public client: LanguageClient) {}

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  triggerUpdate(uri: vscode.Uri) {
    if (uri.scheme === DIAGNOSTICS_URI_SCHEME) {
      this._onDidChange.fire(uri);
    }
  }

  dispose() {
    this._onDidChange.dispose();
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    try {
      return getRendered(this.client, uri);
    } catch (e) {
      return e as string;
    }
  }
}

export class ErrorLinkProvider implements vscode.DocumentLinkProvider {
  public constructor(public client: LanguageClient, private readonly resolvedRoot: string) {}

  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    if (document.uri.scheme !== DIAGNOSTICS_URI_SCHEME) {
      return null;
    }

    let stringContents: string;
    try {
      stringContents = getRendered(this.client, document.uri);
    } catch {
      return null;
    }
    const lines = stringContents.split('\n');

    const result: vscode.DocumentLink[] = [];

    for (const [lineNumber, line] of lines.entries()) {
      for (const pathLineMatched of line.matchAll(/(?<= )[A-Za-z0-9\./]+\.sam:[0-9]+:[0-9]+/g)) {
        const [filename, firstLine, firstCol] = pathLineMatched[0].split(':');
        if (filename == null || firstLine == null || firstCol == null) continue;
        const range = new vscode.Range(
          lineNumber,
          pathLineMatched.index,
          lineNumber,
          pathLineMatched.index + pathLineMatched[0].length
        );

        try {
          result.push(
            new vscode.DocumentLink(
              range,
              vscode.Uri.from({
                scheme: 'file',
                path: path.resolve(this.resolvedRoot, filename),
                fragment: `L${firstLine},${firstCol}`,
              })
            )
          );
        } catch {}
      }
    }

    return result;
  }
}
