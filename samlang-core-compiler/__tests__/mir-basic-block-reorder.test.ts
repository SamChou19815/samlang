/* eslint-disable camelcase */

import createMidIRBasicBlocks from '../mir-basic-block';
import reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath from '../mir-basic-block-reorder';
import MidIRResourceAllocator from '../mir-resource-allocator';

import { HIR_VARIABLE, HIR_ZERO } from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  midIRStatementToString,
  MIR_JUMP,
  MIR_MOVE_TEMP,
  MIR_LABEL,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);

const reorderAndDumpToString = (
  statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
): string =>
  reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath(
    createMidIRBasicBlocks(new MidIRResourceAllocator(), '', statements)
  )
    .map((it) => it.allStatements)
    .flat()
    .map(midIRStatementToString)
    .join('\n');

it('reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath empty test', () => {
  expect(reorderAndDumpToString([])).toBe('');
});

it('reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath single statement self-consistency test', () => {
  expect(reorderAndDumpToString([MIR_RETURN(HIR_ZERO)])).toBe(
    'LABEL__0_PURPOSE_BASIC_BLOCK_1ST_STMT:\nreturn 0;'
  );
});

it('reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath simple stream test.', () => {
  expect(
    reorderAndDumpToString([
      MIR_LABEL('a'),
      MIR_LABEL('b'),
      MIR_LABEL('c'),
      MIR_LABEL('d'),
      MIR_RETURN(HIR_ZERO),
    ])
  ).toBe(`a:
goto b;
b:
goto c;
c:
goto d;
d:
return 0;`);
});

it('reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath heavy true branch test.', () => {
  expect(
    reorderAndDumpToString([
      MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(TEMP(''), 'a', 'end'),
      MIR_LABEL('end'),
      MIR_JUMP('program_end'),
      MIR_LABEL('a'),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_JUMP('end'),
      MIR_LABEL('program_end'),
      MIR_RETURN(HIR_ZERO),
    ])
  ).toBe(`LABEL__0_PURPOSE_BASIC_BLOCK_1ST_STMT:
if () goto a; else goto end;
a:
a = a;
a = a;
a = a;
a = a;
a = a;
a = a;
a = a;
a = a;
goto end;
end:
goto program_end;
program_end:
return 0;`);
});

it('reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath heavy false branch test.', () => {
  expect(
    reorderAndDumpToString([
      MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(TEMP(''), 'end', 'a'),
      MIR_LABEL('end'),
      MIR_JUMP('program_end'),
      MIR_LABEL('a'),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_MOVE_TEMP('a', TEMP('a')),
      MIR_JUMP('end'),
      MIR_LABEL('program_end'),
      MIR_RETURN(HIR_ZERO),
    ])
  ).toBe(`LABEL__0_PURPOSE_BASIC_BLOCK_1ST_STMT:
if () goto end; else goto a;
a:
a = a;
a = a;
a = a;
a = a;
a = a;
a = a;
a = a;
a = a;
goto end;
end:
goto program_end;
program_end:
return 0;`);
});
