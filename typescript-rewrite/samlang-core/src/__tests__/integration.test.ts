import ModuleReference from '../ast/common/module-reference';
import { typeCheckSources } from '../checker';
// eslint-disable-next-line import/no-internal-modules
import compileSamlangSourcesToHighIRSources from '../compiler/hir';
// eslint-disable-next-line import/no-internal-modules
import { compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries } from '../compiler/mir';
import { createGlobalErrorCollector } from '../errors';
import interpretMidIRCompilationUnit from '../interpreter/mid-ir-interpreter';
import optimizeIRCompilationUnit from '../optimization';
import { parseSamlangModuleFromText } from '../parser';
import { mapOf } from '../util/collections';
import { assertNotNull } from '../util/type-assertions';

type WellTypedSamlangProgramTestCase = {
  readonly testCaseName: string;
  readonly expectedStandardOut: string;
  readonly sourceCode: string;
};

const runnableSamlangProgramTestCases: readonly WellTypedSamlangProgramTestCase[] = [
  {
    testCaseName: 'and-or-inside-if',
    expectedStandardOut: 'one\n',
    sourceCode: `
class Main {
  function main(): unit = {
    val i = 1;
    val j = 2;
    if (i < j && i > 0 && j > 0) then {
      val a = 3;
      val b = 4;
      if (a > b || a + b > 0 && true) then println("one") else println("two")
    } else {
      val a = 3;
      val b = 4;
      if (a == 2 || b == 4) then {
        println("three")
      } else {
        println("four")
      }
    }
  }
}
    `,
  },
];

const mirBaseTestCases = (() => {
  const errorCollector = createGlobalErrorCollector();
  const [checkedSources] = typeCheckSources(
    mapOf(
      ...runnableSamlangProgramTestCases.map((it) => {
        const moduleReference = new ModuleReference([it.testCaseName]);
        return [
          moduleReference,
          parseSamlangModuleFromText(
            it.sourceCode,
            errorCollector.getModuleErrorCollector(moduleReference)
          ),
        ] as const;
      })
    ),
    errorCollector
  );

  const mirSources = compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries(
    compileSamlangSourcesToHighIRSources(checkedSources)
  );

  return runnableSamlangProgramTestCases.map(({ testCaseName, expectedStandardOut }) => {
    const compilationUnit = mirSources.get(new ModuleReference([testCaseName]));
    assertNotNull(compilationUnit);
    return {
      testCaseName,
      expectedStandardOut,
      compilationUnit,
    };
  });
})();

mirBaseTestCases.forEach((testCase) => {
  it(`IR[no-opt]: ${testCase.testCaseName}`, () =>
    expect(interpretMidIRCompilationUnit(testCase.compilationUnit)).toBe(
      testCase.expectedStandardOut
    ));

  it(`IR[cp]: ${testCase.testCaseName}`, () =>
    expect(
      interpretMidIRCompilationUnit(
        optimizeIRCompilationUnit(testCase.compilationUnit, {
          doesPerformConstantPropagation: true,
        })
      )
    ).toBe(testCase.expectedStandardOut));

  it(`IR[copy]: ${testCase.testCaseName}`, () =>
    expect(
      interpretMidIRCompilationUnit(
        optimizeIRCompilationUnit(testCase.compilationUnit, {
          doesPerformCopyPropagation: true,
        })
      )
    ).toBe(testCase.expectedStandardOut));

  it(`IR[vn]: ${testCase.testCaseName}`, () =>
    expect(
      interpretMidIRCompilationUnit(
        optimizeIRCompilationUnit(testCase.compilationUnit, {
          doesPerformLocalValueNumbering: true,
        })
      )
    ).toBe(testCase.expectedStandardOut));

  it(`IR[cse]: ${testCase.testCaseName}`, () =>
    expect(
      interpretMidIRCompilationUnit(
        optimizeIRCompilationUnit(testCase.compilationUnit, {
          doesPerformCommonSubExpressionElimination: true,
        })
      )
    ).toBe(testCase.expectedStandardOut));

  it(`IR[dse]: ${testCase.testCaseName}`, () =>
    expect(
      interpretMidIRCompilationUnit(
        optimizeIRCompilationUnit(testCase.compilationUnit, {
          doesPerformDeadCodeElimination: true,
        })
      )
    ).toBe(testCase.expectedStandardOut));

  it(`IR[inl]: ${testCase.testCaseName}`, () =>
    expect(
      interpretMidIRCompilationUnit(
        optimizeIRCompilationUnit(testCase.compilationUnit, {
          doesPerformInlining: true,
        })
      )
    ).toBe(testCase.expectedStandardOut));
});
