import type { ReadonlyMidIRBasicBlockWithoutPointers } from '../mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from '../mir-basic-block-optimized-emitter';

import { HIR_ZERO } from 'samlang-core-ast/hir-expressions';
import {
  midIRStatementToString,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
} from 'samlang-core-ast/mir-nodes';

const emitToString = (blocks: readonly ReadonlyMidIRBasicBlockWithoutPointers[]): string =>
  emitCanonicalMidIRStatementsFromReorderedBasicBlocks(blocks)
    .map(midIRStatementToString)
    .join('\n');

it('emitCanonicalMidIRStatementsFromReorderedBasicBlocks tests', () => {
  expect(emitToString([])).toBe('');

  expect(
    emitToString([
      { label: '', allStatements: [MIR_RETURN(HIR_ZERO)], lastStatement: MIR_RETURN(HIR_ZERO) },
    ])
  ).toBe('return 0;');
  expect(
    emitToString([{ label: '', allStatements: [MIR_JUMP('a')], lastStatement: MIR_JUMP('') }])
  ).toBe('goto a;');

  expect(
    emitToString([
      {
        label: '',
        allStatements: [MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(HIR_ZERO, 'true', 'false')],
        lastStatement: MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(HIR_ZERO, 'true', 'false'),
      },
      {
        label: 'true',
        allStatements: [MIR_LABEL('true'), MIR_RETURN(HIR_ZERO)],
        lastStatement: MIR_RETURN(HIR_ZERO),
      },
      {
        label: 'false',
        allStatements: [MIR_LABEL('false'), MIR_RETURN(HIR_ZERO)],
        lastStatement: MIR_RETURN(HIR_ZERO),
      },
    ])
  ).toBe(`if (1) goto false;
true:
return 0;
false:
return 0;`);

  expect(
    emitToString([
      {
        label: '',
        allStatements: [MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(HIR_ZERO, 'true', 'false')],
        lastStatement: MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(HIR_ZERO, 'true', 'false'),
      },
      {
        label: 'false',
        allStatements: [MIR_LABEL('false'), MIR_RETURN(HIR_ZERO)],
        lastStatement: MIR_RETURN(HIR_ZERO),
      },
      {
        label: 'true',
        allStatements: [MIR_LABEL('true'), MIR_RETURN(HIR_ZERO)],
        lastStatement: MIR_RETURN(HIR_ZERO),
      },
    ])
  ).toBe(`if (0) goto true;
false:
return 0;
true:
return 0;`);

  expect(
    emitToString([
      {
        label: '',
        allStatements: [MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(HIR_ZERO, 'true', 'false')],
        lastStatement: MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(HIR_ZERO, 'true', 'false'),
      },
    ])
  ).toBe('if (0) goto true;\ngoto false;');
});
