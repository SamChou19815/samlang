'use strict';

import * as vscode from 'vscode';

export function activate(_: vscode.ExtensionContext) {
  vscode.languages.registerDocumentFormattingEditProvider('SAMLANG', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      // const whitespace
      let edits = [];
      let indentLevel = 0;
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        let whiteIdx = line.firstNonWhitespaceCharacterIndex;
        const lineText = line.text;
        let numLeft = 0;
        let numRight = 0;
        let onlyRights = true;
        let inString = null;
        let curEdit = null;
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
              curEdit = vscode.TextEdit.replace(
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
          curEdit = vscode.TextEdit.replace(
            new vscode.Range(line.range.start, new vscode.Position(i, whiteIdx)),
            ' '.repeat(indentLevel * 2)
          );
        }
        indentLevel += numLeft - numRight;
        if (curEdit) {
          edits.push(curEdit);
        }
      }
      return edits;
    }
  });
}
