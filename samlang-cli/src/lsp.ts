#!/usr/bin/env node

import { join, relative, resolve, sep } from 'path';

import { ModuleReference } from '@dev-sam/samlang-core/ast/common-nodes';
import createSamlangLanguageService from '@dev-sam/samlang-core/services';
import {
  createConnection,
  ProposedFeatures,
  InitializeResult,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  Range,
  ResponseError,
} from 'vscode-languageserver/node';

import { getConfiguration, collectSources } from './utils';

const ENTIRE_DOCUMENT_RANGE: Range = {
  start: { line: 0, character: 0 },
  end: { line: Number.MAX_SAFE_INTEGER, character: Number.MAX_SAFE_INTEGER },
};

const samlangRangeToLspFoldingRange = (range: Range) => ({
  startLine: range.start.line,
  startCharacter: range.start.character,
  endLine: range.end.line,
  endCharacter: range.end.character,
});

function startSamlangLanguageServer(): void {
  const configuration = getConfiguration();
  const service = createSamlangLanguageService(
    collectSources(configuration, (parts) => new ModuleReference(parts))
  );

  function uriToModuleReference(uri: string): ModuleReference {
    const relativePath = relative(
      configuration.sourceDirectory,
      uri.startsWith('file://') ? uri.substring('file://'.length) : uri
    );
    return new ModuleReference(relativePath.substring(0, relativePath.length - 4).split(sep));
  }

  const moduleReferenceToUri = (moduleReference: ModuleReference): string =>
    resolve(join(configuration.sourceDirectory, moduleReference.toFilename()));

  // Create a connection for the server. The connection uses Node's IPC as a transport.
  // Also include all preview / proposed LSP features.
  const connection = createConnection(ProposedFeatures.all);

  function publishDiagnostics(affectedModules: readonly ModuleReference[]): void {
    affectedModules.forEach((affectedModule) => {
      connection.sendDiagnostics({
        uri: moduleReferenceToUri(affectedModule),
        diagnostics: service.state.getErrors(affectedModule).map((error) => ({
          range: error.range,
          severity: DiagnosticSeverity.Error,
          message: error.toString(),
          source: 'samlang',
        })),
      });
    });
  }

  connection.onInitialize((): InitializeResult => {
    publishDiagnostics(service.state.allModulesWithError);
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        hoverProvider: true,
        definitionProvider: {},
        foldingRangeProvider: true,
        completionProvider: { triggerCharacters: ['.'], resolveProvider: false },
        renameProvider: true,
        documentFormattingProvider: {},
      },
    };
  });

  connection.onDidChangeTextDocument((parameters) => {
    const moduleReference = uriToModuleReference(parameters.textDocument.uri);
    const sourceCode = parameters.contentChanges[0]?.text;
    if (sourceCode == null) return;
    publishDiagnostics(service.state.update(moduleReference, sourceCode));
  });

  connection.onHover((parameters) =>
    service.queryForHover(uriToModuleReference(parameters.textDocument.uri), parameters.position)
  );

  connection.onDefinition((parameters) => {
    const location = service.queryDefinitionLocation(
      uriToModuleReference(parameters.textDocument.uri),
      parameters.position
    );
    return location == null
      ? null
      : { uri: moduleReferenceToUri(location.moduleReference), range: location.range };
  });

  connection.onFoldingRanges((parameters) => {
    const foldingRangeResult = service.queryFoldingRanges(
      uriToModuleReference(parameters.textDocument.uri)
    );
    if (foldingRangeResult == null) return null;
    return foldingRangeResult.map(samlangRangeToLspFoldingRange);
  });

  connection.onCompletion((parameters) =>
    service.autoComplete(uriToModuleReference(parameters.textDocument.uri), parameters.position)
  );

  connection.onRenameRequest((parameters) => {
    const result = service.renameVariable(
      uriToModuleReference(parameters.textDocument.uri),
      parameters.position,
      parameters.newName
    );
    if (result == null) return null;
    if (result === 'Invalid') return new ResponseError(1, 'Invalid identifier.');
    return {
      documentChanges: [
        {
          textDocument: { uri: parameters.textDocument.uri, version: null },
          edits: [{ range: ENTIRE_DOCUMENT_RANGE, newText: result }],
        },
      ],
    };
  });

  connection.onDocumentFormatting((parameters) => {
    const formattedString = service.formatEntireDocument(
      uriToModuleReference(parameters.textDocument.uri)
    );
    if (formattedString == null) return null;
    return [{ range: ENTIRE_DOCUMENT_RANGE, newText: formattedString }];
  });

  connection.listen();
}

startSamlangLanguageServer();
