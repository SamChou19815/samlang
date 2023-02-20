import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';

let languageClient: LanguageClient | undefined;

function createLanguageClient(absoluteServerModule: string) {
  return new LanguageClient(
    'samlang',
    'samlang Language Client',
    { command: absoluteServerModule, args: ['lsp'], transport: TransportKind.stdio },
    { documentSelector: [{ scheme: 'file', language: 'samlang' }] }
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = vscode.workspace.getConfiguration().get('samlang.programPath');
  if (typeof serverModule !== 'string') {
    throw new Error(`Invalid LSP program path: ${serverModule}.`);
  }
  const resolvedServerModules = (vscode.workspace.workspaceFolders ?? [])
    .map((folder) => path.join(folder.uri.fsPath, serverModule))
    .filter((it) => fs.existsSync(it));
  if (resolvedServerModules.length > 1) throw new Error('Too many samlang LSP programs found.');
  const absoluteServerModule = resolvedServerModules[0];
  if (absoluteServerModule == null) throw new Error('No valid samlang LSP program found.');

  languageClient = createLanguageClient(absoluteServerModule);

  languageClient.start();
  context.subscriptions.push(
    vscode.commands.registerCommand('samlang.restartClient', async () => {
      console.info('Restarting client...');
      await languageClient?.stop();
      languageClient = createLanguageClient(absoluteServerModule);
      await languageClient.start();
      console.info('Client restarted');
    })
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
