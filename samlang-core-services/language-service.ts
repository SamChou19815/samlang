import {
  ReadOnlyLocationLookup,
  LocationLookup,
  SamlangExpressionLocationLookupBuilder,
} from './location-service';

import {
  IdentifierType,
  FunctionType,
  prettyPrintType,
  Position,
  Range,
  ModuleReference,
  Location,
  TypedComment,
  Sources,
} from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import type {
  ClassDefinition,
  ClassMemberDefinition,
  SamlangModule,
} from 'samlang-core-ast/samlang-toplevel';
import {
  DependencyTracker,
  GlobalTypingContext,
  MemberTypeInformation,
  collectModuleReferenceFromSamlangModule,
  typeCheckSources,
  typeCheckSourcesIncrementally,
  typeCheckSingleModuleSource,
} from 'samlang-core-checker';
// eslint-disable-next-line import/no-internal-modules
import type { ClassTypingContext } from 'samlang-core-checker/typing-context';
import {
  ReadonlyGlobalErrorCollector,
  CompileTimeError,
  createGlobalErrorCollector,
} from 'samlang-core-errors';
import { parseSamlangModuleFromText } from 'samlang-core-parser';
import { HashMap, hashMapOf, hashSetOf, isNotNull, checkNotNull, assert } from 'samlang-core-utils';

export class LanguageServiceState {
  private readonly dependencyTracker: DependencyTracker = new DependencyTracker();

  private readonly rawSources: HashMap<ModuleReference, string> = hashMapOf();

  private readonly rawModules: HashMap<ModuleReference, SamlangModule> = hashMapOf();

  private readonly checkedModules: HashMap<ModuleReference, SamlangModule>;

  private readonly errors: HashMap<ModuleReference, readonly CompileTimeError[]> = hashMapOf();

  private _globalTypingContext: GlobalTypingContext;

  private _expressionLocationLookup: LocationLookup<SamlangExpression> = new LocationLookup();

  private _classLocationLookup: LocationLookup<string> = new LocationLookup();

  private _classMemberLocationLookup: LocationLookup<ClassMemberDefinition> = new LocationLookup();

  constructor(sourceHandles: readonly (readonly [ModuleReference, string])[]) {
    const errorCollector = createGlobalErrorCollector();
    sourceHandles.forEach(([moduleReference, sourceCode]) => {
      const rawModule = parseSamlangModuleFromText(
        sourceCode,
        moduleReference,
        errorCollector.getModuleErrorCollector(moduleReference)
      );
      this.rawModules.set(moduleReference, rawModule);
    });
    const [checkedModules, globalTypingContext] = typeCheckSources(this.rawModules, errorCollector);
    this.checkedModules = checkedModules as HashMap<ModuleReference, SamlangModule>;
    checkedModules.forEach((checkedModule, moduleReference) => {
      const dependencies = collectModuleReferenceFromSamlangModule(checkedModule);
      dependencies.delete(moduleReference);
      this.dependencyTracker.update(moduleReference, dependencies.toArray());
    });
    this._globalTypingContext = globalTypingContext;
    this.updateErrors(errorCollector.getErrors());

    this.updateLocationLookupsForCheckedModules(checkedModules);
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

  get classMemberLocationLookup(): ReadOnlyLocationLookup<ClassMemberDefinition> {
    return this._classMemberLocationLookup;
  }

  get allModulesWithError(): readonly ModuleReference[] {
    return this.errors.entries().map((it) => it[0]);
  }

  get allErrors(): readonly CompileTimeError[] {
    return this.errors
      .entries()
      .map((it) => it[1])
      .flat();
  }

  getRawModule(moduleReference: ModuleReference): SamlangModule | undefined {
    return this.rawModules.get(moduleReference);
  }

  getCheckedModule(moduleReference: ModuleReference): SamlangModule | undefined {
    return this.checkedModules.get(moduleReference);
  }

  getErrors(moduleReference: ModuleReference): readonly CompileTimeError[] {
    return this.errors.get(moduleReference) ?? [];
  }

  update(moduleReference: ModuleReference, sourceCode: string): readonly ModuleReference[] {
    const errorCollector = createGlobalErrorCollector();
    const rawModule = parseSamlangModuleFromText(
      sourceCode,
      moduleReference,
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
      const dependencies = collectModuleReferenceFromSamlangModule(
        typeCheckSingleModuleSource(samlangModule, createGlobalErrorCollector())
      );
      dependencies.delete(moduleReference);
      this.dependencyTracker.update(moduleReference, dependencies.toArray());
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

    this.updateLocationLookupsForCheckedModules(updatedModules);
    affectedSourceList.forEach((affectedSource) => this.errors.delete(affectedSource));
    this.updateErrors(errorCollector.getErrors());
  }

  private updateLocationLookupsForCheckedModules(checkedModules: Sources<SamlangModule>) {
    const locationLookupBuilder = new SamlangExpressionLocationLookupBuilder(
      this._expressionLocationLookup
    );
    checkedModules.forEach((checkedModule, moduleReference) => {
      locationLookupBuilder.rebuild(moduleReference, checkedModule);
      checkedModule.classes.forEach((classDefinition) => {
        this._classLocationLookup.set(
          { moduleReference, range: classDefinition.range },
          classDefinition.name
        );
        classDefinition.members.forEach((member) => {
          this._classMemberLocationLookup.set({ moduleReference, range: member.range }, member);
        });
      });
    });
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

const getLastDocComment = (associatedComments?: readonly TypedComment[]): string | undefined =>
  [...(associatedComments ?? [])].reverse().find((it) => it.type === 'doc')?.text;

export class LanguageServices {
  constructor(
    private readonly state: LanguageServiceState,
    private readonly formatter: (samlangModule: SamlangModule) => string
  ) {}

  queryForHover(
    moduleReference: ModuleReference,
    position: Position
  ): readonly [Readonly<{ language: string; value: string }>[], Range] | null {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null) return null;
    let functionReference: readonly [ModuleReference, string, string] | undefined;
    if (expression.__type__ === 'ClassMemberExpression') {
      functionReference = [expression.moduleReference, expression.className, expression.memberName];
    } else if (expression.__type__ === 'MethodAccessExpression') {
      const thisType = expression.expression.type;
      assert(thisType.type === 'IdentifierType');
      functionReference = [thisType.moduleReference, thisType.identifier, expression.methodName];
    }
    if (functionReference != null) {
      const [fetchedFunctionModuleReference, className, functionName] = functionReference;
      const relevantFunction = this.state
        .getCheckedModule(fetchedFunctionModuleReference)
        ?.classes?.find((it) => it.name === className)
        ?.members?.find((it) => it.name === functionName);
      if (relevantFunction == null) return null;
      const typeContent = { language: 'samlang', value: prettyPrintType(expression.type) };
      const document = getLastDocComment(relevantFunction.associatedComments);
      return document == null
        ? [[typeContent], expression.range]
        : [[typeContent, { language: 'markdown', value: document }], expression.range];
    }
    const type = prettyPrintType(expression.type);
    if (type.startsWith('class ')) {
      const moduleParts = type.substring(6).split('.');
      const expressionClassName = checkNotNull(moduleParts.pop());
      const expressionModuleReference = new ModuleReference(moduleParts);
      const document = getLastDocComment(
        this.state
          .getRawModule(expressionModuleReference)
          ?.classes.find((it) => it.name === expressionClassName)?.associatedComments
      );
      const typeContent = { language: 'samlang', value: `class ${expressionClassName}` };
      return document == null
        ? [[typeContent], expression.range]
        : [[typeContent, { language: 'markdown', value: document }], expression.range];
    }
    return [[{ language: 'samlang', value: type }], expression.range];
  }

  queryFoldingRanges(moduleReference: ModuleReference): readonly Range[] | null {
    const module = this.state.getCheckedModule(moduleReference);
    if (module == null) return null;
    const ranges = module.classes.flatMap((moduleClass) => {
      const range = moduleClass.range;
      const members = moduleClass.members;
      const memberRanges = members.flatMap((member) => member.range);
      return [...memberRanges, range];
    });
    return ranges;
  }

  queryDefinitionLocation(moduleReference: ModuleReference, position: Position): Location | null {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null) return null;
    switch (expression.__type__) {
      case 'LiteralExpression':
      case 'ThisExpression':
      case 'TupleConstructorExpression':
        return null;
      case 'VariableExpression': {
        if (
          expression.type.type === 'IdentifierType' &&
          expression.type.identifier.startsWith('class ')
        ) {
          const [moduleReferenceOfClass, classDefinition] = this.getClassDefinition(
            moduleReference,
            expression.name
          );
          return { moduleReference: moduleReferenceOfClass, range: classDefinition.range };
        }
        const classMemberDefinition = checkNotNull(
          this.state.classMemberLocationLookup.get(moduleReference, position)
        );
        const range = LanguageServices.findLocalVariableDefinitionDefiningStatementRange(
          classMemberDefinition.body,
          expression.name
        );
        return range == null ? null : { moduleReference, range };
      }
      case 'ClassMemberExpression':
        return this.findClassMemberLocation(
          moduleReference,
          expression.className,
          expression.memberName
        );
      case 'ObjectConstructorExpression':
      case 'VariantConstructorExpression': {
        const [moduleReferenceOfClass, classDefinition] = this.getClassDefinition(
          moduleReference,
          (expression.type as IdentifierType).identifier
        );
        return {
          moduleReference: moduleReferenceOfClass,
          range: classDefinition.typeDefinition.range,
        };
      }
      case 'FieldAccessExpression': {
        const [moduleReferenceOfClass, classDefinition] = this.getClassDefinition(
          moduleReference,
          (expression.expression.type as IdentifierType).identifier
        );
        return {
          moduleReference: moduleReferenceOfClass,
          range: classDefinition.typeDefinition.range,
        };
      }
      case 'MethodAccessExpression':
        return this.findClassMemberLocation(
          moduleReference,
          (expression.expression.type as IdentifierType).identifier,
          expression.methodName
        );
      case 'UnaryExpression':
      case 'PanicExpression':
      case 'BuiltInFunctionCallExpression':
      case 'FunctionCallExpression':
      case 'BinaryExpression':
      case 'IfElseExpression':
      case 'MatchExpression':
      case 'LambdaExpression':
      case 'StatementBlockExpression':
        return null;
    }
  }

  private getClassDefinition(
    moduleReference: ModuleReference,
    className: string
  ): readonly [ModuleReference, ClassDefinition] {
    const samlangModule = checkNotNull(this.state.getCheckedModule(moduleReference));
    const { imports, classes } = samlangModule;
    for (let i = 0; i < classes.length; i += 1) {
      const samlangClass = checkNotNull(classes[i]);
      if (samlangClass.name === className) {
        return [moduleReference, samlangClass];
      }
    }
    return checkNotNull(
      imports
        .map(({ importedMembers, importedModule }) => {
          if (importedMembers.some((it) => it[0] === className)) {
            return this.getClassDefinition(importedModule, className);
          }
          return null;
        })
        .filter(isNotNull)
        .find(() => true)
    );
  }

  private static findLocalVariableDefinitionDefiningStatementRange(
    expression: SamlangExpression,
    variableName: string
  ): Range | null {
    if (expression.__type__ !== 'StatementBlockExpression') return null;
    const statements = expression.block.statements;
    const definingStatement = statements.find((statement) => {
      switch (statement.pattern.type) {
        case 'TuplePattern':
          return statement.pattern.destructedNames.some((it) => it.name === variableName);
        case 'ObjectPattern':
          return statement.pattern.destructedNames.some(
            (it) => it.alias?.[0] === variableName || it.fieldName === variableName
          );
        case 'VariablePattern':
          return statement.pattern.name === variableName;
        case 'WildCardPattern':
          return false;
      }
    });
    if (definingStatement != null) return definingStatement.range;
    return (
      statements
        .map((statement) =>
          LanguageServices.findLocalVariableDefinitionDefiningStatementRange(
            statement.assignedExpression,
            variableName
          )
        )
        .filter(isNotNull)[0] ?? null
    );
  }

  private findClassMemberLocation(
    moduleReference: ModuleReference,
    className: string,
    memberName: string
  ): Location {
    const [moduleReferenceOfClass, classDefinition] = this.getClassDefinition(
      moduleReference,
      className
    );
    const matchingMember = checkNotNull(
      classDefinition.members.find((it) => it.name === memberName)
    );
    return { moduleReference: moduleReferenceOfClass, range: matchingMember.range };
  }

  autoComplete(
    moduleReference: ModuleReference,
    position: Position
  ): readonly AutoCompletionItem[] {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    const classOfExpression = this.state.classLocationLookup.get(moduleReference, position);
    if (expression == null || classOfExpression == null) return [];
    if (expression.__type__ === 'ClassMemberExpression') {
      const relevantClassType = this.getClassType(expression.moduleReference, expression.className);
      if (relevantClassType == null) return [];
      return Object.entries(relevantClassType.functions).map(([name, typeInformation]) => {
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
        assert(objectExpressionType.type === 'IdentifierType');
        type = objectExpressionType;
        break;
      }
      default:
        return [];
    }
    const relevantClassType = this.getClassType(type.moduleReference, type.identifier);
    if (relevantClassType == null) return [];
    const completionResults: AutoCompletionItem[] = [];
    const isInsideClass = classOfExpression === type.identifier;
    if (isInsideClass && relevantClassType.typeDefinition?.type === 'object') {
      Object.entries(relevantClassType.typeDefinition.mappings).forEach(([name, fieldType]) => {
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

  private getClassType(
    moduleReference: ModuleReference,
    className: string
  ): ClassTypingContext | undefined {
    return this.state.globalTypingContext.get(moduleReference)?.[className];
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
    if (argumentLength === 0) return [`${name}()`, false];
    const items: string[] = [];
    for (let i = 0; i < argumentLength; i += 1) {
      items.push(`$${i}`);
    }
    return [`${name}(${items.join(', ')})$${items.length}`, true];
  }

  renameVariable(
    moduleReference: ModuleReference,
    position: Position,
    newName: string
  ): 'Invalid' | null {
    const trimmedNewName = newName.trim();
    if (!/[a-z][A-Za-z0-9]/.test(trimmedNewName)) return 'Invalid';
    this.state.expressionLocationLookup.get(moduleReference, position);
    /*
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null || expression.__type__ !== 'VariableExpression') return null;
    if (
      expression.type.type === 'IdentifierType' &&
      expression.type.identifier.startsWith('class ')
    ) {
      return null;
    }
    */
    // TODO: concrete implementation. Depending on define service.
    return null;
  }

  formatEntireDocument(moduleReference: ModuleReference): string | null {
    const moduleToFormat = this.state.getRawModule(moduleReference);
    if (moduleToFormat == null) return null;
    if (this.state.getErrors(moduleReference).some((it) => it.errorType === 'SyntaxError')) {
      return null;
    }
    return this.formatter(moduleToFormat);
  }
}
