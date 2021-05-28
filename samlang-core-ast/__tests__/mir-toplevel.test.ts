import { MIR_CAST, MIR_ZERO } from '../mir-expressions';
import { debugPrintMidIRModule } from '../mir-toplevel';
import { MIR_ANY_TYPE, MIR_INT_TYPE, MIR_FUNCTION_TYPE } from '../mir-types';

it('debugPrintMidIRModule works', () => {
  expect(
    debugPrintMidIRModule({
      globalVariables: [{ name: 'dev_meggo', content: 'vibez' }],
      typeDefinitions: [{ identifier: 'Foo', mappings: [MIR_INT_TYPE, MIR_ANY_TYPE] }],
      functions: [
        {
          name: 'Bar',
          parameters: ['f'],
          type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
          body: [MIR_CAST({ name: 'a', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
          returnValue: MIR_ZERO,
        },
      ],
    })
  ).toBe(`const dev_meggo = 'vibez';

type Foo = (int, any);

function Bar(f: int): int {
  let a: int = 0;
  return 0;
}
`);
});
