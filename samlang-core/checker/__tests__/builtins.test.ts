import { AstBuilder } from '../../ast/samlang-nodes';
import { memberTypeInformationToString } from '../typing-context';

describe('builtins', () => {
  it('memberTypeInformationToString tests', () => {
    expect(
      memberTypeInformationToString('foo', {
        isPublic: false,
        typeParameters: [],
        type: AstBuilder.FunType([], AstBuilder.IntType),
      }),
    ).toBe('private foo() -> int');

    expect(
      memberTypeInformationToString('bar', {
        isPublic: true,
        typeParameters: [{ name: 'T', bound: AstBuilder.IdType('A') }],
        type: AstBuilder.FunType([], AstBuilder.IntType),
      }),
    ).toBe('public bar<T: A>() -> int');
  });
});
