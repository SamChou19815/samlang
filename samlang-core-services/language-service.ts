import {
  ReadOnlyLocationLookup,
  LocationLookup,
  SamlangExpressionLocationLookupBuilder,
} from './location-service';

import {
  Type,
  IdentifierType,
  FunctionType,
  prettyPrintType,
  Position,
  Range,
  ModuleReference,
  Location,
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
import {
  ReadonlyGlobalErrorCollector,
  CompileTimeError,
  createGlobalErrorCollector,
} from 'samlang-core-errors';
import { parseSamlangModuleFromText } from 'samlang-core-parser';
import { HashMap, hashMapOf, hashSetOf, isNotNull, checkNotNull } from 'samlang-core-utils';

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
    // istanbul ignore next
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
  constructor(
    private readonly state: LanguageServiceState,
    private readonly formatter: (samlangModule: SamlangModule) => string
  ) {}

  queryType(moduleReference: ModuleReference, position: Position): readonly [Type, Range] | null {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null) return null;
    return [expression.type, expression.range];
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
    // istanbul ignore next
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
        const classMemberDefinition = this.state.classMemberLocationLookup.get(
          moduleReference,
          position
        );
        if (classMemberDefinition == null) return null;
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
    for (let i = 0; i < imports.length; i += 1) {
      const oneImport = checkNotNull(imports[i]);
      const { importedMembers, importedModule } = oneImport;
      if (importedMembers.some((it) => it[0] === className)) {
        return this.getClassDefinition(importedModule, className);
      }
    }
    // istanbul ignore next
    throw new Error('Type checker is messed up!');
  }

  private static findLocalVariableDefinitionDefiningStatementRange(
    expression: SamlangExpression,
    variableName: string
  ): Range | null {
    if (expression.__type__ !== 'StatementBlockExpression') return null;
    const statements = expression.block.statements;
    const definingStatement = statements.find((statement) => {
      // istanbul ignore next
      switch (statement.pattern.type) {
        case 'TuplePattern':
          // istanbul ignore next
          return statement.pattern.destructedNames.some((it) => it.name === variableName);
        case 'ObjectPattern':
          // istanbul ignore next
          return statement.pattern.destructedNames.some(
            (it) => it.alias === variableName || it.fieldName === variableName
          );
        case 'VariablePattern':
          return statement.pattern.name === variableName;
        case 'WildCardPattern':
          return false;
      }
    });
    if (definingStatement != null) return definingStatement.range;
    const range = checkNotNull(
      statements
        .map((statement) =>
          LanguageServices.findLocalVariableDefinitionDefiningStatementRange(
            statement.assignedExpression,
            variableName
          )
        )
        .filter(isNotNull)[0]
    );
    return range;
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
    // istanbul ignore next
    if (position.column < 0) return [];
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    const classOfExpression = this.state.classLocationLookup.get(moduleReference, position);
    // istanbul ignore next
    if (expression == null || classOfExpression == null) return [];
    if (expression.__type__ === 'ClassMemberExpression') {
      // istanbul ignore next
      const relevantClassType = this.state.globalTypingContext.get(expression.moduleReference)?.[
        expression.className
      ];
      // istanbul ignore next
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
        // istanbul ignore next
        if (objectExpressionType.type !== 'IdentifierType') return [];
        type = objectExpressionType;
        break;
      }
      default:
        return [];
    }
    const relevantClassType =
      // istanbul ignore next
      this.state.globalTypingContext.get(type.moduleReference)?.[type.identifier];
    // istanbul ignore next
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

  formatEntireDocument(moduleReference: ModuleReference): string | null {
    const moduleToFormat = this.state.getRawModule(moduleReference);
    if (moduleToFormat == null) return null;
    if (this.state.getErrors(moduleReference).some((it) => it.errorType === 'SyntaxError')) {
      return null;
    }
    return this.formatter(moduleToFormat);
  }
}
