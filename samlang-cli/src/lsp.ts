import { lstatSync, readdirSync, readFileSync } from 'fs';
import { join, normalize, relative, resolve, sep } from 'path';

import { Range, ModuleReference, createSamlangLanguageService } from '@dev-sam/samlang-core';
import {
  createConnection,
  ProposedFeatures,
  InitializeResult,
  TextDocumentSyncKind,
  InsertTextFormat,
  DiagnosticSeverity,
  Range as LspRange,
  FoldingRange as LspFoldingRange,
  TextEdit,
  ResponseError,
} from 'vscode-languageserver/node';

import type { SamlangProjectConfiguration } from './configuration';

const ENTIRE_DOCUMENT_RANGE = new Range(
  { line: 0, character: 0 },
  { line: Number.MAX_SAFE_INTEGER, character: Number.MAX_SAFE_INTEGER }
);

function filePathToModuleReference(sourcePath: string, filePath: string): ModuleReference {
  const relativeFile = normalize(relative(sourcePath, filePath));
  const relativeFileWithoutExtension = relativeFile.substring(0, relativeFile.length - 4);
  return new ModuleReference(relativeFileWithoutExtension.split(sep));
}

function walk(startPath: string, visitor: (file: string) => void): void {
  function recursiveVisit(path: string): void {
    if (lstatSync(path).isFile()) {
      visitor(path);
      return;
    }

    if (lstatSync(path).isDirectory()) {
      readdirSync(path).some((relativeChildPath) => recursiveVisit(join(path, relativeChildPath)));
    }
  }

  return recursiveVisit(startPath);
}

export function collectSources({
  sourceDirectory,
}: SamlangProjectConfiguration): readonly (readonly [ModuleReference, string])[] {
  const sourcePath = resolve(sourceDirectory);
  const sources: (readonly [ModuleReference, string])[] = [];

  walk(sourcePath, (file) => {
    if (!file.endsWith('.sam')) return;
    sources.push([filePathToModuleReference(sourcePath, file), readFileSync(file).toString()]);
  });

  return sources;
}

const samlangRangeToLspRange = (range: Range): LspRange => ({
  start: range.start,
  end: range.end,
});

const samlangRangeToLspFoldingRange = (range: Range): LspFoldingRange => ({
  startLine: range.start.line,
  startCharacter: range.start.character,
  endLine: range.end.line,
  endCharacter: range.end.character,
});

export default function startSamlangLanguageServer(
  configuration: SamlangProjectConfiguration
): void {
  const service = createSamlangLanguageService(collectSources(configuration));

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
          range: samlangRangeToLspRange(error.range),
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

  connection.onDidChangeTextDocument((didChangeTextDocumentParameters) => {
    const moduleReference = uriToModuleReference(didChangeTextDocumentParameters.textDocument.uri);
    const sourceCode = didChangeTextDocumentParameters.contentChanges[0]?.text;
    if (sourceCode == null) return;
    const affected = service.state.update(moduleReference, sourceCode);
    publishDiagnostics(affected);
  });

  connection.onHover((hoverParameters) => {
    const moduleReference = uriToModuleReference(hoverParameters.textDocument.uri);
    const hoverResult = service.queryForHover(moduleReference, hoverParameters.position);
    if (hoverResult == null) return null;
    const [contents, range] = hoverResult;
    return { contents, range: samlangRangeToLspRange(range) };
  });

  connection.onDefinition((gotoDefinitionParameters) => {
    const moduleReference = uriToModuleReference(gotoDefinitionParameters.textDocument.uri);
    const location = service.queryDefinitionLocation(
      moduleReference,
      gotoDefinitionParameters.position
    );
    return location == null
      ? null
      : {
          uri: moduleReferenceToUri(location.moduleReference),
          range: samlangRangeToLspRange(location.range),
        };
  });

  connection.onFoldingRanges((foldingrangeParameters) => {
    const moduleReference = uriToModuleReference(foldingrangeParameters.textDocument.uri);
    if (moduleReference == null) return null;
    const foldingRangeResult = service.queryFoldingRanges(moduleReference);
    if (foldingRangeResult == null) return null;
    return foldingRangeResult.map((foldingRange) => samlangRangeToLspFoldingRange(foldingRange));
  });

  connection.onCompletion((completionParameters) => {
    const moduleReference = uriToModuleReference(completionParameters.textDocument.uri);
    const completionItems = service.autoComplete(moduleReference, completionParameters.position);
    return completionItems.map((item) => ({
      kind: item.kind,
      label: item.name,
      detail: item.type,
      insertText: item.text,
      insertTextFormat: item.isSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    }));
  });

  connection.onRenameRequest((renameParameters) => {
    const moduleReference = uriToModuleReference(renameParameters.textDocument.uri);
    const result = service.renameVariable(
      moduleReference,
      renameParameters.position,
      renameParameters.newName
    );
    if (result == null) return null;
    if (result === 'Invalid') return new ResponseError(1, 'Invalid identifier.');
    return {
      documentChanges: [
        {
          textDocument: { uri: renameParameters.textDocument.uri, version: null },
          edits: [TextEdit.replace(samlangRangeToLspRange(ENTIRE_DOCUMENT_RANGE), result)],
        },
      ],
    };
  });

  connection.onDocumentFormatting((formatParameters) => {
    const moduleReference = uriToModuleReference(formatParameters.textDocument.uri);
    if (moduleReference == null) return null;
    const formattedString = service.formatEntireDocument(moduleReference);
    if (formattedString == null) return null;
    return [TextEdit.replace(samlangRangeToLspRange(ENTIRE_DOCUMENT_RANGE), formattedString)];
  });

  connection.listen();
}
