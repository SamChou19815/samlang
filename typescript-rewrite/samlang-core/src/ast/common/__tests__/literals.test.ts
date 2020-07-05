import { prettyPrintLiteral, TRUE, FALSE, intLiteralOf, stringLiteralOf } from '../literals';

it('Literals have expected pretty printed values', () => {
  expect(prettyPrintLiteral(TRUE)).toBe('true');
  expect(prettyPrintLiteral(FALSE)).toBe('false');
  expect(prettyPrintLiteral(intLiteralOf(BigInt(42)))).toBe('42');
  expect(prettyPrintLiteral(stringLiteralOf('hello'))).toBe('"hello"');
});
