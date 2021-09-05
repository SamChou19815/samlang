/* eslint-disable class-methods-use-this */

import { writeFileSync } from 'fs';

import type { CommandContext, Hooks, Plugin } from '@yarnpkg/core';
import { Command } from 'clipanion';

import incrementalCompile from './compile';
import workspacesTargetDeterminator from './utils/target-determinator';
import {
  generateYarnWorkspacesJson,
  readGeneratedYarnWorkspacesJson,
} from './utils/workspaces-json';

class CompileCommand extends Command<CommandContext> {
  static paths = [['c']];
  async execute(): Promise<number> {
    return (await incrementalCompile()) ? 0 : 1;
  }
}

class QueryCommand extends Command<CommandContext> {
  static paths = [['q'], ['query']];

  async execute(): Promise<number> {
    try {
      const json = await readGeneratedYarnWorkspacesJson();
      this.context.stdout.write(`${JSON.stringify(json, undefined, 2)}\n`);
      return 0;
    } catch {
      return 1;
    }
  }
}

class TargetDeterminatorCommand extends Command<CommandContext> {
  static paths = [['t'], ['targets']];

  async execute(): Promise<number> {
    this.context.stdout.write(
      `${JSON.stringify(await workspacesTargetDeterminator(), undefined, 2)}\n`
    );
    return 0;
  }
}

const plugin: Plugin<Hooks> = {
  hooks: {
    afterAllInstalled(project) {
      writeFileSync(
        'workspaces.json',
        `${JSON.stringify(generateYarnWorkspacesJson(project), undefined, 2)}\n`
      );
    },
  },
  commands: [CompileCommand, QueryCommand, TargetDeterminatorCommand],
};

export default plugin;
