/* eslint-disable camelcase */

import {
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MIR_MOVE_TEMP,
  MIR_JUMP,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_LABEL,
  MIR_RETURN,
  MIR_TEMP,
} from '../../ast/mir-nodes';
import createMidIRBasicBlocks, { MidIRBasicBlock } from '../mir-basic-block';
import MidIRResourceAllocator from '../mir-resource-allocator';

it('Constructor correctly finishes on good input.', () => {
  expect(new MidIRBasicBlock('', [MIR_RETURN()]).allStatements.length).toBe(1);
});

it('Constructor correctly throws on bad input.', () => {
  expect(() => new MidIRBasicBlock('', [MIR_MOVE_TEMP(MIR_TEMP(''), MIR_TEMP(''))])).toThrow();

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
    [MIR_LABEL('foo'), MIR_RETURN()],
    [{ targets: [], statements: [MIR_LABEL('foo'), MIR_RETURN()] }]
  );

  expectCorrectlyCreated(
    [MIR_RETURN()],
    [
      {
        targets: [],
        statements: [MIR_LABEL('LABEL__0_PURPOSE_BASIC_BLOCK_1ST_STMT'), MIR_RETURN()],
      },
    ]
  );
});

it('MidIRBasicBlock will correctly segment label blocks', () => {
  expectCorrectlyCreated(
    [
      MIR_LABEL('foo'),
      MIR_LABEL('bar'),
      MIR_MOVE_TEMP(MIR_TEMP(''), MIR_TEMP('')),
      MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_TEMP(''), 'baz', 'baz'),
      MIR_JUMP('baz'),
      MIR_LABEL('baz'),
      MIR_RETURN(),
    ],
    [
      { targets: ['bar'], statements: [MIR_LABEL('foo'), MIR_JUMP('bar')] },
      {
        targets: ['baz', 'baz'],
        statements: [
          MIR_LABEL('bar'),
          MIR_MOVE_TEMP(MIR_TEMP(''), MIR_TEMP('')),
          MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_TEMP(''), 'baz', 'baz'),
        ],
      },
      {
        targets: ['baz'],
        statements: [MIR_LABEL('LABEL__0_PURPOSE_BASIC_BLOCK_1ST_STMT'), MIR_JUMP('baz')],
      },
      {
        targets: [],
        statements: [MIR_LABEL('baz'), MIR_RETURN()],
      },
    ]
  );
});
