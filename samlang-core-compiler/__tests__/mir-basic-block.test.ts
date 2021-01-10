/* eslint-disable camelcase */

import createMidIRBasicBlocks, { MidIRBasicBlock } from '../mir-basic-block';
import MidIRResourceAllocator from '../mir-resource-allocator';

import {
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MIR_MOVE_TEMP,
  MIR_JUMP,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_LABEL,
  MIR_RETURN,
  MIR_ZERO,
  MIR_TEMP,
} from 'samlang-core-ast/mir-nodes';

it('Constructor correctly finishes on good input.', () => {
  expect(new MidIRBasicBlock('', [MIR_RETURN(MIR_ZERO)]).allStatements.length).toBe(1);
});

it('Constructor correctly throws on bad input.', () => {
  expect(() => new MidIRBasicBlock('', [MIR_MOVE_TEMP('', MIR_TEMP(''))])).toThrow();

  expect(() => createMidIRBasicBlocks(new MidIRResourceAllocator(), '', [MIR_LABEL('')])).toThrow();
});

const expectCorrectlyCreated = (
  sourceStatements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[],
  result: readonly { targets: string[]; statements: MidIRStatement_DANGEROUSLY_NON_CANONICAL[] }[]
): void => {
  expect(
    createMidIRBasicBlocks(new MidIRResourceAllocator(), '', sourceStatements).map((it) => ({
      statements: it.allStatements,
      targets: it.targets.map((t) => t.label),
    }))
  ).toEqual(result);
};

it('Empty MidIRBasicBlock can be created from empty statements.', () => {
  expectCorrectlyCreated([], []);
});

it('MidIRBasicBlock end with return cases.', () => {
  expectCorrectlyCreated(
    [MIR_LABEL('foo'), MIR_RETURN(MIR_ZERO)],
    [{ targets: [], statements: [MIR_LABEL('foo'), MIR_RETURN(MIR_ZERO)] }]
  );

  expectCorrectlyCreated(
    [MIR_RETURN(MIR_ZERO)],
    [
      {
        targets: [],
        statements: [MIR_LABEL('l__0_BASIC_BLOCK_1ST_STMT'), MIR_RETURN(MIR_ZERO)],
      },
    ]
  );
});

it('MidIRBasicBlock will correctly segment label blocks', () => {
  expectCorrectlyCreated(
    [
      MIR_LABEL('foo'),
      MIR_LABEL('bar'),
      MIR_MOVE_TEMP('', MIR_TEMP('')),
      MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_TEMP(''), 'baz', 'baz'),
      MIR_JUMP('baz'),
      MIR_LABEL('baz'),
      MIR_RETURN(MIR_ZERO),
    ],
    [
      { targets: ['bar'], statements: [MIR_LABEL('foo'), MIR_JUMP('bar')] },
      {
        targets: ['baz', 'baz'],
        statements: [
          MIR_LABEL('bar'),
          MIR_MOVE_TEMP('', MIR_TEMP('')),
          MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_TEMP(''), 'baz', 'baz'),
        ],
      },
      {
        targets: ['baz'],
        statements: [MIR_LABEL('l__0_BASIC_BLOCK_1ST_STMT'), MIR_JUMP('baz')],
      },
      {
        targets: [],
        statements: [MIR_LABEL('baz'), MIR_RETURN(MIR_ZERO)],
      },
    ]
  );
});
