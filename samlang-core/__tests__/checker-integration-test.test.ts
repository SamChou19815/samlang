import { checkSources } from '../services/source-processor';
import { samlangProgramCheckerTestSources } from '../test-programs';

import { ModuleReference } from 'samlang-core-ast/common-nodes';

const expectedErrors: readonly string[] = [
  'access-private-member.sam:12:13-12:16: [UnresolvedName]: Name `A.b` is not resolved.',
  'add-panic-to-class.sam:7:41-7:47: [UnexpectedType]: Expected: `() -> int`, actual: `() -> A`.',
  'add-panic-to-class.sam:8:27-8:33: [UnexpectedType]: Expected: `() -> int`, actual: `() -> A`.',
  'add-with-class.sam:7:30-7:36: [UnexpectedType]: Expected: `() -> int`, actual: `() -> A`.',
  "complete-trash.sam:1:1-1:1: [SyntaxError]: mismatched input 'This' expecting {<EOF>, 'import', 'class', 'private', 'interface'}",
  'illegal-binary-operations.sam:12:33-12:42: [UnexpectedType]: Expected: `() -> int`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:13:28-13:37: [UnexpectedType]: Expected: `() -> int`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:14:35-14:44: [UnexpectedType]: Expected: `() -> int`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:15:44-15:46: [UnexpectedType]: Expected: `Box<__UNDECIDED__>`, actual: `int`.',
  'illegal-binary-operations.sam:16:29-16:38: [UnexpectedType]: Expected: `() -> bool`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:17:38-17:47: [UnexpectedType]: Expected: `() -> bool`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:18:33-18:38: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'illegal-binary-operations.sam:19:28-19:33: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'illegal-binary-operations.sam:19:36-19:41: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'illegal-binary-operations.sam:21:45-21:51: [UnexpectedType]: Expected: `(int) -> Box<bool>`, actual: `(__UNDECIDED__) -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:24:44-24:60: [UnexpectedType]: Expected: `() -> Box<__UNDECIDED__>`, actual: `() -> AnotherBox<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:27:35-27:41: [UnexpectedType]: Expected: `(Box<Box<bool>>) -> Box<Box<Box<int>>>`, actual: `(__UNDECIDED__) -> Box<__UNDECIDED__>`.',
  'illegal-private-field-access.sam:15:13-15:14: [UnresolvedName]: Name `b` is not resolved.',
  'illegal-private-field-access.sam:17:13-17:16: [UnresolvedName]: Name `b` is not resolved.',
  'illegal-shadow.sam:12:10-12:14: [Collision]: Name `test` collides with a previously defined name.',
  'illegal-shadow.sam:17:12-17:16: [Collision]: Name `test` collides with a previously defined name.',
  'illegal-shadow.sam:21:28-21:32: [Collision]: Name `test` collides with a previously defined name.',
  'illegal-shadow.sam:27:9-27:10: [Collision]: Name `a` collides with a previously defined name.',
  'illegal-shadow.sam:3:7-3:8: [Collision]: Name `A` collides with a previously defined name.',
  'illegal-shadow.sam:7:12-7:16: [Collision]: Name `test` collides with a previously defined name.',
  "invalid-property-declaration-syntax.sam:2:12-2:12: [SyntaxError]: mismatched input 'a' expecting {'val', 'private', UpperId}",
  'multiple-type-errors.sam:3:35-3:40: [UnexpectedType]: Expected: `int`, actual: `string`.',
  'multiple-type-errors.sam:3:43-3:48: [UnexpectedType]: Expected: `int`, actual: `string`.',
  'overflow-int.sam:3:26-3:56: [SyntaxError]: Not a 64-bit integer.',
  'simple-mismatch.sam:4:26-4:30: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'undefined-type.sam:3:3-3:34: [NotWellDefinedIdentifier]: `HelloWorld` is not well defined.',
  'undefined-type.sam:3:33-3:34: [UnexpectedType]: Expected: `HelloWorld`, actual: `int`.',
  'undefined-variable.sam:3:29-3:39: [UnresolvedName]: Name `helloWorld` is not resolved.',
];

it('samlang type checker integration test', () => {
  const { compileTimeErrors } = checkSources(
    samlangProgramCheckerTestSources.map((it) => [
      new ModuleReference([it.testName]),
      it.sourceCode,
    ])
  );

  const actualErrors = compileTimeErrors
    .map((it) => it.toString())
    .sort((a, b) => a.localeCompare(b));

  expect(actualErrors).toEqual(expectedErrors);
});
