import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { DIAGNOSTICS_URI_SCHEME, TextDocumentProvider, ErrorLinkProvider } from './diagnostics';

let languageClient: LanguageClient | undefined;

function createLanguageClient(absoluteServerModule: string) {
  return new LanguageClient(
    'samlang',
    'samlang Language Client',
    { command: absoluteServerModule, args: ['lsp'], transport: TransportKind.stdio },
    {
      documentSelector: [{ scheme: 'file', language: 'samlang' }],
      middleware: {
        // Forked from https://github.com/rust-lang/rust-analyzer/blob/1a5bb27c018c947dab01ab70ffe1d267b0481a17/editors/code/src/client.ts#L203-L225
        async handleDiagnostics(uri, diagnosticList, next) {
          diagnosticList.forEach((diag, idx) => {
            const rendered = (diag as unknown as { data?: { rendered?: string } }).data?.rendered;
            if (rendered) {
              diag.code = {
                target: vscode.Uri.from({
                  scheme: DIAGNOSTICS_URI_SCHEME,
                  path: `/diagnostic message [${idx.toString()}]`,
                  fragment: uri.toString(),
                  query: idx.toString(),
                }),
                value: 'Click for full compiler diagnostic',
              };
            }
          });
          return next(uri, diagnosticList);
        },
      },
    }
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = vscode.workspace.getConfiguration().get('samlang.programPath');
  if (typeof serverModule !== 'string') {
    throw new Error(`Invalid LSP program path: ${serverModule}.`);
  }
  const resolvedRootAndServerModules = (vscode.workspace.workspaceFolders ?? [])
    .map((folder) => [folder.uri.fsPath, path.join(folder.uri.fsPath, serverModule)] as const)
    .filter(([_, it]) => fs.existsSync(it));
  if (resolvedRootAndServerModules.length > 1)
    throw new Error('Too many samlang LSP programs found.');
  if (resolvedRootAndServerModules[0] == null)
    throw new Error('No valid samlang LSP program found.');
  const [resolvedRoot, absoluteServerModule] = resolvedRootAndServerModules[0];

  languageClient = createLanguageClient(absoluteServerModule);

  const diagnosticProvider = new TextDocumentProvider(languageClient);
  const errorLinkProvider = new ErrorLinkProvider(languageClient, resolvedRoot);

  languageClient.start();
  context.subscriptions.push(
    vscode.commands.registerCommand('samlang.restartClient', async () => {
      console.info('Restarting client...');
      await languageClient?.stop();
      languageClient = createLanguageClient(absoluteServerModule);
      diagnosticProvider.client = languageClient;
      errorLinkProvider.client = languageClient;
      await languageClient.start();
      console.info('Client restarted');
    }),
    vscode.languages.registerDocumentLinkProvider(
      { scheme: DIAGNOSTICS_URI_SCHEME },
      errorLinkProvider
    ),
    vscode.workspace.registerTextDocumentContentProvider(DIAGNOSTICS_URI_SCHEME, diagnosticProvider)
  );
  // eslint-disable-next-line no-console
  console.info('Congratulations, your extension "vscode-samlang" is now active!');
}

export function deactivate(): void {
  if (languageClient) {
    languageClient
      .stop()
      // eslint-disable-next-line no-console
      .catch((error) => console.error(error))
      // eslint-disable-next-line no-console
      .then(() => console.error('samlang client dead.'));
  }
}
