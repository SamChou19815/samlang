import {
  Type,
  IdentifierType,
  FunctionType,
  prettyPrintType,
  Position,
  Range,
  ModuleReference,
} from '../ast/common-nodes';
import type { SamlangExpression } from '../ast/samlang-expressions';
import type { SamlangModule } from '../ast/samlang-toplevel';
import { GlobalTypingContext, typeCheckSources, typeCheckSourcesIncrementally } from '../checker';
// eslint-disable-next-line import/no-internal-modules
import DependencyTracker from '../checker/dependency-tracker';
// eslint-disable-next-line import/no-internal-modules
import type { MemberTypeInformation } from '../checker/typing-context';
import {
  ReadonlyGlobalErrorCollector,
  CompileTimeError,
  createGlobalErrorCollector,
} from '../errors';
import { parseSamlangModuleFromText } from '../parser';
import {
  ReadOnlyLocationLookup,
  LocationLookup,
  SamlangExpressionLocationLookupBuilder,
} from './location-service';

import { HashMap, hashMapOf, hashSetOf } from 'samlang-core-utils/collections';
import { assertNotNull } from 'samlang-core-utils/type-assertions';

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
          { moduleReference, range: classDefinition.range },
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
          { moduleReference, range: classDefinition.range },
          classDefinition.name
        );
      });
    });
    affectedSourceList.forEach((affectedSource) => this.errors.delete(affectedSource));
    this.updateErrors(errorCollector.getErrors());
  }
}

export type CompletionItemKind = 2 | 3 | 5;

export class CompletionItemKinds {
  static readonly METHOD: CompletionItemKind = 2;

  static readonly FUNCTION: CompletionItemKind = 3;

  static readonly FIELD: CompletionItemKind = 5;
}

export type AutoCompletionItem = {
  readonly name: string;
  readonly text: string;
  readonly isSnippet: boolean;
  readonly kind: CompletionItemKind;
  readonly type: string;
};

export class LanguageServices {
  constructor(private readonly state: LanguageServiceState) {}

  queryType(moduleReference: ModuleReference, position: Position): readonly [Type, Range] | null {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null) return null;
    return [expression.type, expression.range];
  }

  autoComplete(
    moduleReference: ModuleReference,
    position: Position
  ): readonly AutoCompletionItem[] {
    // istanbul ignore next
    if (position.column < 0) return [];
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    const classOfExpression = this.state.classLocationLookup.get(moduleReference, position);
    const moduleContext = this.state.globalTypingContext.get(moduleReference);
    // istanbul ignore next
    if (expression == null || classOfExpression == null || moduleContext == null) return [];
    if (expression.__type__ === 'ClassMemberExpression') {
      const className = expression.className;
      const relevantClassType =
        // istanbul ignore next
        moduleContext.definedClasses[className] ??
        // istanbul ignore next
        moduleContext.importedClasses[className];
      // istanbul ignore next
      if (relevantClassType == null) return [];
      return Object.entries(relevantClassType.functions).map(([name, typeInformation]) => {
        assertNotNull(typeInformation);
        return LanguageServices.getCompletionResultFromTypeInformation(
          name,
          typeInformation,
          CompletionItemKinds.FUNCTION
        );
      });
    }
    let type: IdentifierType;
    switch (expression.__type__) {
      case 'FieldAccessExpression':
      case 'MethodAccessExpression': {
        const objectExpressionType = expression.expression.type;
        // istanbul ignore next
        if (objectExpressionType.type !== 'IdentifierType') return [];
        type = objectExpressionType;
        break;
      }
      default:
        return [];
    }
    const relevantClassType =
      moduleContext.definedClasses[type.identifier] ??
      // istanbul ignore next
      moduleContext.importedClasses[type.identifier];
    // istanbul ignore next
    if (relevantClassType == null) return [];
    const completionResults: AutoCompletionItem[] = [];
    const isInsideClass = classOfExpression === type.identifier;
    if (isInsideClass && relevantClassType.typeDefinition?.type === 'object') {
      Object.entries(relevantClassType.typeDefinition.mappings).forEach(([name, fieldType]) => {
        assertNotNull(fieldType);
        completionResults.push({
          name,
          text: name,
          isSnippet: false,
          kind: CompletionItemKinds.FIELD,
          type: prettyPrintType(fieldType.type),
        });
      });
    }
    Object.entries(relevantClassType.methods).forEach(([name, typeInformation]) => {
      assertNotNull(typeInformation);
      // istanbul ignore next
      if (isInsideClass || typeInformation.isPublic) {
        completionResults.push(
          LanguageServices.getCompletionResultFromTypeInformation(
            name,
            typeInformation,
            CompletionItemKinds.METHOD
          )
        );
      }
    });
    return completionResults;
  }

  private static getCompletionResultFromTypeInformation(
    name: string,
    typeInformation: MemberTypeInformation,
    kind: CompletionItemKind
  ): AutoCompletionItem {
    const functionType = typeInformation.type;
    const detailedName = `${name}${LanguageServices.prettyPrintFunctionTypeWithDummyParameters(
      functionType
    )}`;
    const [text, isSnippet] = LanguageServices.getInsertText(
      name,
      functionType.argumentTypes.length
    );
    return {
      name: detailedName,
      text,
      isSnippet,
      kind,
      type: LanguageServices.prettyPrintTypeInformation(typeInformation),
    };
  }

  private static prettyPrintTypeInformation(typeInformation: MemberTypeInformation): string {
    return typeInformation.typeParameters.length === 0
      ? prettyPrintType(typeInformation.type)
      : `<${typeInformation.typeParameters.join(', ')}>(${prettyPrintType(typeInformation.type)})`;
  }

  private static prettyPrintFunctionTypeWithDummyParameters({
    argumentTypes,
    returnType,
  }: FunctionType) {
    const argumentPart = argumentTypes.map((it, id) => `a${id}: ${prettyPrintType(it)}`).join(', ');
    return `(${argumentPart}): ${prettyPrintType(returnType)}`;
  }

  private static getInsertText(name: string, argumentLength: number): readonly [string, boolean] {
    // istanbul ignore next
    if (argumentLength === 0) return [`${name}()`, false];
    const items: string[] = [];
    for (let i = 0; i < argumentLength; i += 1) {
      items.push(`$${i}`);
    }
    return [`${name}(${items.join(', ')})$${items.length}`, true];
  }
}
