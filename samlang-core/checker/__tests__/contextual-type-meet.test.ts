import { DummySourceReason } from '../../ast/common-nodes';
import {
  AstBuilder,
  prettyPrintType,
  SamlangType,
  SourceUnknownType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import contextualTypeMeet from '../contextual-type-meet';

function meet(t1: SamlangType, t2: SamlangType) {
  const globalCollector = createGlobalErrorCollector();
  const errorReporter = globalCollector.getErrorReporter();
  const type = contextualTypeMeet(t1, t2, errorReporter);
  if (globalCollector.hasErrors) return 'FAILED_MEET';
  return prettyPrintType(type);
}

describe('contextual-type-meet', () => {
  it('t1=primitive type', () => {
    expect(meet(AstBuilder.UnitType, AstBuilder.UnitType)).toBe('unit');
    expect(meet(AstBuilder.UnitType, AstBuilder.BoolType)).toBe('FAILED_MEET');
    expect(meet(AstBuilder.UnitType, AstBuilder.IntType)).toBe('FAILED_MEET');
    expect(meet(AstBuilder.UnitType, AstBuilder.StringType)).toBe('FAILED_MEET');
    expect(meet(SourceUnknownType(DummySourceReason), AstBuilder.StringType)).toBe('string');
    expect(meet(AstBuilder.UnitType, AstBuilder.IdType('A'))).toBe('FAILED_MEET');

    expect(meet(AstBuilder.UnitType, SourceUnknownType(DummySourceReason))).toBe('unit');
  });

  it('t1=identifier type', () => {
    expect(meet(AstBuilder.IdType('A'), AstBuilder.UnitType)).toBe('FAILED_MEET');
    expect(meet(AstBuilder.IdType('A'), AstBuilder.IdType('B'))).toBe('FAILED_MEET');
    expect(meet(AstBuilder.IdType('A'), AstBuilder.IdType('A', [AstBuilder.IntType]))).toBe(
      'FAILED_MEET',
    );
    expect(
      meet(
        AstBuilder.IdType('A', [AstBuilder.IdType('B')]),
        AstBuilder.IdType('A', [AstBuilder.IdType('B')]),
      ),
    ).toBe('A<B>');

    expect(
      meet(
        AstBuilder.IdType('A', [AstBuilder.IdType('B')]),
        AstBuilder.IdType('A', [SourceUnknownType(DummySourceReason)]),
      ),
    ).toBe('A<B>');
    expect(meet(AstBuilder.IdType('B'), SourceUnknownType(DummySourceReason))).toBe('B');
  });

  it('t1=function type', () => {
    expect(meet(AstBuilder.FunType([], AstBuilder.IntType), AstBuilder.UnitType)).toBe(
      'FAILED_MEET',
    );
    expect(meet(AstBuilder.FunType([], AstBuilder.IntType), AstBuilder.IdType('B'))).toBe(
      'FAILED_MEET',
    );
    expect(
      meet(
        AstBuilder.FunType([], AstBuilder.IntType),
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
      ),
    ).toBe('FAILED_MEET');
    expect(
      meet(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
      ),
    ).toBe('(int) -> int');

    expect(
      meet(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
        SourceUnknownType(DummySourceReason),
      ),
    ).toBe('(int) -> bool');
    expect(
      meet(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
        AstBuilder.FunType(
          [SourceUnknownType(DummySourceReason)],
          SourceUnknownType(DummySourceReason),
        ),
      ),
    ).toBe('(int) -> bool');
  });
});
