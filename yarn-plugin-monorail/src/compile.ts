/* eslint-disable no-console */

import { spawn } from 'child_process';

import { RED, GREEN, BLUE, MAGENTA } from './utils/colors';
import asyncTaskWithSpinner from './utils/spinner-progress';
import workspacesTargetDeterminator from './utils/target-determinator';

const incrementalCompile = async (): Promise<boolean> => {
  const workspacesToReCompile = await workspacesTargetDeterminator();

  workspacesToReCompile.forEach(({ name }) => {
    console.error(BLUE(`[i] \`${name}\` needs to be recompiled.`));
  });

  const statusAndStdErrorList = await asyncTaskWithSpinner(
    (passedTime) => `[?] Compiling (${passedTime})`,
    () =>
      Promise.all(
        workspacesToReCompile.map(({ name: workspace }) => {
          const childProcess = spawn('yarn', ['workspace', workspace, 'compile'], {
            shell: true,
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          let collector = '';

          childProcess.stdout.on('data', (chunk) => {
            collector += chunk.toString();
          });
          return new Promise<readonly [string, boolean, string]>((resolve) => {
            childProcess.on('exit', (code) => resolve([workspace, code === 0, collector]));
          });
        })
      )
  );

  const globalStdErrorCollector = statusAndStdErrorList.map((it) => it[2]).join('');
  const failedWorkspacesRuns = statusAndStdErrorList.filter((it) => !it[1]).map((it) => it[0]);

  if (failedWorkspacesRuns.length === 0) {
    console.error(GREEN(`[✓] All workspaces have been successfully compiled!`));
    return true;
  }
  console.error(MAGENTA('[!] Compilation finished with some errors.'));
  console.error(globalStdErrorCollector.trim());
  failedWorkspacesRuns.forEach((workspace) => {
    console.error(RED(`[x] \`${workspace}\` failed to exit with 0.`));
  });

  return false;
};

export default incrementalCompile;
