import {
  midIRStatementToString,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_ZERO,
} from '../../../ast/mir';
import type { ReadonlyMidIRBasicBlockWithoutPointers } from '../mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from '../mir-basic-block-optimized-emitter';

const emitToString = (blocks: readonly ReadonlyMidIRBasicBlockWithoutPointers[]): string =>
  emitCanonicalMidIRStatementsFromReorderedBasicBlocks(blocks)
    .map(midIRStatementToString)
    .join('\n');

it('emitCanonicalMidIRStatementsFromReorderedBasicBlocks tests', () => {
  expect(emitToString([])).toBe('');

  expect(
    emitToString([{ label: '', allStatements: [MIR_RETURN()], lastStatement: MIR_RETURN() }])
  ).toBe('return;');
  expect(
    emitToString([{ label: '', allStatements: [MIR_JUMP('a')], lastStatement: MIR_JUMP('') }])
  ).toBe('goto a;');

  expect(
    emitToString([
      {
        label: '',
        allStatements: [MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_ZERO, 'true', 'false')],
        lastStatement: MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_ZERO, 'true', 'false'),
      },
      {
        label: 'true',
        allStatements: [MIR_LABEL('true'), MIR_RETURN()],
        lastStatement: MIR_RETURN(),
      },
      {
        label: 'false',
        allStatements: [MIR_LABEL('false'), MIR_RETURN()],
        lastStatement: MIR_RETURN(),
      },
    ])
  ).toBe(`if (1) goto false;
true:
return;
false:
return;`);

  expect(
    emitToString([
      {
        label: '',
        allStatements: [MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_ZERO, 'true', 'false')],
        lastStatement: MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_ZERO, 'true', 'false'),
      },
      {
        label: 'false',
        allStatements: [MIR_LABEL('false'), MIR_RETURN()],
        lastStatement: MIR_RETURN(),
      },
      {
        label: 'true',
        allStatements: [MIR_LABEL('true'), MIR_RETURN()],
        lastStatement: MIR_RETURN(),
      },
    ])
  ).toBe(`if (0) goto true;
false:
return;
true:
return;`);

  expect(
    emitToString([
      {
        label: '',
        allStatements: [MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_ZERO, 'true', 'false')],
        lastStatement: MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_ZERO, 'true', 'false'),
      },
    ])
  ).toBe('if (0) goto true;\ngoto false;');
});
