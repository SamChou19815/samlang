import { spawnSync } from 'child_process';
import { dirname, join } from 'path';

import {
  NamedYarnInvididualWorkspaceInformation,
  YarnWorkspacesJson,
  readGeneratedYarnWorkspacesJson,
} from './workspaces-json';

function queryChangedFilesSince(pathPrefix: string): readonly string[] {
  function queryFromGitDiffResult(base: string, head?: string) {
    const trimmed = spawnSync('git', [
      'diff',
      base,
      ...(head ? [head] : []),
      '--name-only',
      '--',
      pathPrefix,
    ])
      .stdout.toString()
      .trim();

    return trimmed === '' ? [] : trimmed.split('\n');
  }

  if (process.env.CI) {
    return queryFromGitDiffResult('HEAD^', 'HEAD');
  }
  return queryFromGitDiffResult('origin/main');
}

function workspaceHasChangedFilesExcludingBundledBinaries(
  workspacesJson: YarnWorkspacesJson,
  workspaceName: string
): boolean {
  const isNotBundledBinary = (filename: string): boolean =>
    dirname(filename) !==
    join(workspacesJson.information[workspaceName]?.workspaceLocation ?? '.', 'bin');

  const dependencyChain = workspacesJson.information[workspaceName]?.dependencyChain ?? [];
  return dependencyChain.some((item) => {
    const dependencyWorkspaceName = workspacesJson.information[item]?.workspaceLocation ?? '.';
    const changedFiles = queryChangedFilesSince(dependencyWorkspaceName);
    return changedFiles.some(isNotBundledBinary);
  });
}

export default async function workspacesTargetDeterminator(): Promise<
  readonly NamedYarnInvididualWorkspaceInformation[]
> {
  const workspacesJson = await readGeneratedYarnWorkspacesJson();
  return workspacesJson.topologicallyOrdered
    .map((workspaceName) => {
      const needRebuild = workspaceHasChangedFilesExcludingBundledBinaries(
        workspacesJson,
        workspaceName
      );
      return [workspaceName, needRebuild] as const;
    })
    .filter(([, needRebuild]) => needRebuild)
    .map(([name]) => ({ name, ...workspacesJson.information[name] }));
}
