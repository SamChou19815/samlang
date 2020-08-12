'use strict';

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, TransportKind } from 'vscode-languageclient';

const provideDocumentFormattingEdits = (document: vscode.TextDocument): vscode.TextEdit[] => {
  // const whitespace
  const edits: vscode.TextEdit[] = [];
  let indentLevel = 0;
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    let whiteIdx = line.firstNonWhitespaceCharacterIndex;
    const lineText = line.text;
    let numLeft = 0;
    let numRight = 0;
    let onlyRights = true;
    let inString: string | null = null;
    let currentEdit: vscode.TextEdit | null = null;

    for (let charIdx = 0; charIdx < lineText.length; charIdx++) {
      const char = lineText[charIdx];
      if (char == '{' && inString == null) {
        numLeft++;
        if (onlyRights) {
          onlyRights = false;
        }
      } else if (char == '}' && inString == null) {
        numRight++;
        if (onlyRights) {
          currentEdit = vscode.TextEdit.replace(
            new vscode.Range(line.range.start, new vscode.Position(i, whiteIdx)),
            ' '.repeat((indentLevel - numRight) * 2)
          );
        }
      }
      if (char == '"' && inString == null) {
        inString = '"';
      } else if (char == "'" && inString == null) {
        inString = "'";
      } else if (char == inString && lineText[charIdx - 1] != '\\') {
        inString = null;
      }
    }
    if (numLeft - numRight >= 0) {
      currentEdit = vscode.TextEdit.replace(
        new vscode.Range(line.range.start, new vscode.Position(i, whiteIdx)),
        ' '.repeat(indentLevel * 2)
      );
    }
    indentLevel += numLeft - numRight;
    if (currentEdit) {
      edits.push(currentEdit);
    }
  }
  return edits;
};

export function activate(context: vscode.ExtensionContext) {
  vscode.languages.registerDocumentFormattingEditProvider('SAMLANG', {
    provideDocumentFormattingEdits,
  });

  const serverModule = vscode.workspace.getConfiguration().get('samlang.programPath');
  if (typeof serverModule != 'string') {
    throw new Error(`Invalid program path: ${serverModule}.`);
  }
  const serverOptions = {
    run: {
      module: serverModule,
      args: ['lsp'],
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      args: ['lsp'],
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'samlang' }],
  };

  const languageClient = new LanguageClient(
    'samlang',
    'SAMLANG Language Client',
    serverOptions,
    clientOptions
  );

  languageClient.registerProposedFeatures();
  languageClient.start();
}
