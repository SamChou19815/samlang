import ModuleReference from '../ast/common/module-reference';
import type Position from '../ast/common/position';
import type Range from '../ast/common/range';
import type { Type } from '../ast/common/types';
import { SamlangExpression } from '../ast/lang/samlang-expressions';
import { SamlangModule } from '../ast/lang/samlang-toplevel';
import { GlobalTypingContext, typeCheckSources, typeCheckSourcesIncrementally } from '../checker';
// eslint-disable-next-line import/no-internal-modules
import DependencyTracker from '../checker/dependency-tracker';
import {
  ReadonlyGlobalErrorCollector,
  CompileTimeError,
  createGlobalErrorCollector,
} from '../errors';
import { parseSamlangModuleFromText } from '../parser';
import { HashMap, hashMapOf, hashSetOf } from '../util/collections';
import {
  ReadOnlyLocationLookup,
  LocationLookup,
  SamlangExpressionLocationLookupBuilder,
} from './location-service';

export class LanguageServiceState {
  private readonly dependencyTracker: DependencyTracker = new DependencyTracker();

  private readonly rawSources: HashMap<ModuleReference, string> = hashMapOf();

  private readonly rawModules: HashMap<ModuleReference, SamlangModule> = hashMapOf();

  private readonly checkedModules: HashMap<ModuleReference, SamlangModule>;

  private readonly errors: HashMap<ModuleReference, readonly CompileTimeError[]> = hashMapOf();

  private _globalTypingContext: GlobalTypingContext;

  private _expressionLocationLookup: LocationLookup<SamlangExpression> = new LocationLookup();

  private _classLocationLookup: LocationLookup<string> = new LocationLookup();

  constructor(sourceHandles: readonly (readonly [ModuleReference, string])[]) {
    const errorCollector = createGlobalErrorCollector();
    sourceHandles.forEach(([moduleReference, sourceCode]) => {
      const rawModule = parseSamlangModuleFromText(
        sourceCode,
        errorCollector.getModuleErrorCollector(moduleReference)
      );
      this.rawModules.set(moduleReference, rawModule);
      this.dependencyTracker.update(
        moduleReference,
        rawModule.imports.map((it) => it.importedModule)
      );
    });
    const [checkedModules, globalTypingContext] = typeCheckSources(this.rawModules, errorCollector);
    this.checkedModules = checkedModules as HashMap<ModuleReference, SamlangModule>;
    this._globalTypingContext = globalTypingContext;
    this.updateErrors(errorCollector.getErrors());

    const locationLookupBuilder = new SamlangExpressionLocationLookupBuilder(
      this._expressionLocationLookup
    );
    checkedModules.forEach((checkedModule, moduleReference) => {
      locationLookupBuilder.rebuild(moduleReference, checkedModule);
      checkedModule.classes.forEach((classDefinition) =>
        this._classLocationLookup.set(
          { moduleReference, range: classDefinition.nameRange },
          classDefinition.name
        )
      );
    });
  }

  get globalTypingContext(): GlobalTypingContext {
    return this._globalTypingContext;
  }

  get expressionLocationLookup(): ReadOnlyLocationLookup<SamlangExpression> {
    return this._expressionLocationLookup;
  }

  get classLocationLookup(): ReadOnlyLocationLookup<string> {
    return this._classLocationLookup;
  }

  get allModulesWithError(): readonly ModuleReference[] {
    // istanbul ignore next
    return this.errors.entries().map((it) => it[0]);
  }

  get allErrors(): readonly CompileTimeError[] {
    return this.errors
      .entries()
      .map((it) => it[1])
      .flat();
  }

  getErrors(moduleReference: ModuleReference): readonly CompileTimeError[] {
    return this.errors.get(moduleReference) ?? [];
  }

  update(moduleReference: ModuleReference, sourceCode: string): readonly ModuleReference[] {
    const errorCollector = createGlobalErrorCollector();
    const rawModule = parseSamlangModuleFromText(
      sourceCode,
      errorCollector.getModuleErrorCollector(moduleReference)
    );
    this.rawModules.set(moduleReference, rawModule);
    const affected = this.reportChanges(moduleReference, rawModule);
    this.incrementalTypeCheck(affected, errorCollector);
    return affected;
  }

  remove(moduleReference: ModuleReference): readonly ModuleReference[] {
    this.rawSources.delete(moduleReference);
    this.rawModules.delete(moduleReference);
    this.checkedModules.delete(moduleReference);
    this.errors.set(moduleReference, []);
    this._expressionLocationLookup.purge(moduleReference);
    this._classLocationLookup.purge(moduleReference);
    const affected = this.reportChanges(moduleReference, null);
    this.incrementalTypeCheck(affected, createGlobalErrorCollector());
    return affected;
  }

  private updateErrors(updatedErrors: readonly CompileTimeError[]): void {
    const grouped = hashMapOf<ModuleReference, CompileTimeError[]>();
    updatedErrors.forEach((error) => {
      const group = grouped.get(error.moduleReference);
      if (group == null) {
        grouped.set(error.moduleReference, [error]);
      } else {
        group.push(error);
      }
    });
    grouped.forEach((errors, moduleReference) => this.errors.set(moduleReference, errors));
  }

  private reportChanges(
    moduleReference: ModuleReference,
    samlangModule: SamlangModule | null
  ): readonly ModuleReference[] {
    const affected = hashSetOf(moduleReference);
    this.dependencyTracker
      .getReverseDependencies(moduleReference)
      .forEach((it) => affected.add(it));
    if (samlangModule == null) {
      this.dependencyTracker.update(moduleReference);
    } else {
      this.dependencyTracker.update(
        moduleReference,
        samlangModule.imports.map((it) => it.importedModule)
      );
    }
    return affected.toArray();
  }

  private incrementalTypeCheck(
    affectedSourceList: readonly ModuleReference[],
    errorCollector: ReadonlyGlobalErrorCollector
  ): void {
    const updatedModules = typeCheckSourcesIncrementally(
      this.rawModules,
      this._globalTypingContext,
      affectedSourceList,
      errorCollector
    );
    updatedModules.forEach((updatedModule, moduleReference) => {
      this.checkedModules.set(moduleReference, updatedModule);
    });

    const locationLookupBuilder = new SamlangExpressionLocationLookupBuilder(
      this._expressionLocationLookup
    );
    updatedModules.forEach((checkedModule, moduleReference) => {
      locationLookupBuilder.rebuild(moduleReference, checkedModule);
      checkedModule.classes.forEach((classDefinition) => {
        this._classLocationLookup.set(
          { moduleReference, range: classDefinition.nameRange },
          classDefinition.name
        );
      });
    });
    affectedSourceList.forEach((affectedSource) => this.errors.delete(affectedSource));
    this.updateErrors(errorCollector.getErrors());
  }
}

export default class LanguageServices {
  constructor(private readonly state: LanguageServiceState) {}

  queryType(moduleReference: ModuleReference, position: Position): readonly [Type, Range] | null {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null) return null;
    return [expression.type, expression.range];
  }
}
