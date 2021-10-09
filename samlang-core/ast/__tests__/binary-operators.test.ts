import { binaryOperatorValues, binaryOperatorSymbolTable } from '../common-operators';

describe('binary-operators', () => {
  it("BinaryOperator's symbol table is self consistent.", () => {
    binaryOperatorValues.forEach((symbol) =>
      expect(binaryOperatorSymbolTable[symbol.symbol]).toBe(symbol)
    );
  });

  it('Invalid symbol gives back undefined', () => {
    expect(binaryOperatorSymbolTable['I am not a symbol.']).toBeUndefined();
  });
});
