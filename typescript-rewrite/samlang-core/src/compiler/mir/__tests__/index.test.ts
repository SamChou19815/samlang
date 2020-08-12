import {
  compileHighIrSourcesToMidIRCompilationUnit,
  compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries,
} from '..';
import ModuleReference from '../../../ast/common/module-reference';
import { HIR_RETURN, HIR_STRING } from '../../../ast/hir/hir-expressions';
import { midIRCompilationUnitToString } from '../../../ast/mir';
import { mapOf } from '../../../util/collections';
import { assertNotNull } from '../../../util/type-assertions';

it('compileHighIrSourcesToMidIRCompilationUnit empty sources test', () => {
  expect(midIRCompilationUnitToString(compileHighIrSourcesToMidIRCompilationUnit(mapOf()))).toBe(
    '\n'
  );
});

it('compileHighIrSourcesToMidIRCompilationUnit dummy source test', () => {
  expect(
    midIRCompilationUnitToString(
      compileHighIrSourcesToMidIRCompilationUnit(mapOf([ModuleReference.ROOT, { functions: [] }]))
    )
  ).toBe('\n');
});

const commonSources = mapOf(
  [
    ModuleReference.ROOT,
    {
      functions: [
        {
          name: '_module__class_Main_function_main',
          parameters: ['foo', 'bar', 'baz'],
          hasReturn: true,
          body: [HIR_RETURN(HIR_STRING('hello world'))],
        },
      ],
    },
  ],
  [
    new ModuleReference(['foo']),
    {
      functions: [
        {
          name: 'fooBar',
          parameters: ['foo', 'bar', 'baz'],
          hasReturn: true,
          body: [HIR_RETURN(HIR_STRING('hello world'))],
        },
      ],
    },
  ]
);

it('compileHighIrSourcesToMidIRCompilationUnit full integration test', () => {
  expect(midIRCompilationUnitToString(compileHighIrSourcesToMidIRCompilationUnit(commonSources)))
    .toBe(`const GLOBAL_STRING_0 = "hello world";

function _module__class_Main_function_main {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return (GLOBAL_STRING_0 + 8);
}

function fooBar {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return (GLOBAL_STRING_0 + 8);
}
`);
});

it('compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries and compileHighIrSourcesToMidIRCompilationUnitWithSingleEntry self-consistency test', () => {
  const result = compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries(commonSources);
  expect(result.size).toBe(1);
  const root = result.get(ModuleReference.ROOT);
  assertNotNull(root);
  expect(midIRCompilationUnitToString(root)).toBe(`const GLOBAL_STRING_0 = "hello world";

function _module__class_Main_function_main {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return (GLOBAL_STRING_0 + 8);
}

function _compiled_program_main {

  _module__class_Main_function_main();
  return;
}
`);
});
