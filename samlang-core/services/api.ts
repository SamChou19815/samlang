import {
  Location,
  ModuleReference,
  ModuleReferenceCollections,
  Position,
  Sources,
  TypedComment,
} from "../ast/common-nodes";
import {
  prettyPrintType,
  SamlangExpression,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangModule,
  SourceClassDefinition,
} from "../ast/samlang-nodes";
import { GlobalTypingContext, MemberTypeInformation, typeCheckSources } from "../checker";
import type { InterfaceTypingContext } from "../checker/typing-context";
import { CompileTimeError, createGlobalErrorCollector } from "../errors";
import { parseSamlangModuleFromText } from "../parser";
import prettyPrintSamlangModule from "../printer";
import { assert, checkNotNull, filterMap } from "../utils";
import {
  LocationLookup,
  ReadOnlyLocationLookup,
  SamlangExpressionLocationLookupBuilder,
} from "./location-service";
import type {
  AutoCompletionItem,
  CompletionItemKind,
  LanguageServices,
  LanguageServiceState,
} from "./types";
import {
  applyRenamingWithDefinitionAndUse,
  ReadonlyVariableDefinitionLookup,
  VariableDefinitionLookup,
} from "./variable-definition-service";

export class LanguageServiceStateImpl implements LanguageServiceState {
  private readonly rawSources = ModuleReferenceCollections.hashMapOf<string>();
  private rawModules = ModuleReferenceCollections.mapOf<SamlangModule>();
  private checkedModules = ModuleReferenceCollections.mapOf<SamlangModule>();
  private errors = ModuleReferenceCollections.mapOf<readonly CompileTimeError[]>();
  private _globalTypingContext: GlobalTypingContext = ModuleReferenceCollections.mapOf();
  private _expressionLocationLookup = new LocationLookup<SamlangExpression>();
  private _classLocationLookup = new LocationLookup<string>();
  private _variableDefinitionLookup: VariableDefinitionLookup = new VariableDefinitionLookup();

  constructor(sourceHandles: readonly (readonly [ModuleReference, string])[]) {
    this.rawSources = ModuleReferenceCollections.hashMapOf(...sourceHandles);
    this.init();
  }

  private init() {
    const errorCollector = createGlobalErrorCollector();
    this.rawModules = ModuleReferenceCollections.hashMapOf(
      ...this.rawSources.entries().map(([moduleReference, sourceCode]) => {
        const rawModule = parseSamlangModuleFromText(
          sourceCode,
          moduleReference,
          errorCollector.getErrorReporter(),
        );
        return [moduleReference, rawModule] as const;
      }),
    );
    const [checkedModules, globalTypingContext] = typeCheckSources(this.rawModules, errorCollector);
    this.checkedModules = checkedModules;
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

  get variableDefinitionLookup(): ReadonlyVariableDefinitionLookup {
    return this._variableDefinitionLookup;
  }

  get allModulesWithError(): readonly ModuleReference[] {
    return this.errors.entries().map((it) => it[0]);
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

  update(moduleReference: ModuleReference, sourceCode: string): void {
    this.rawSources.set(moduleReference, sourceCode);
    this.init();
  }

  remove(moduleReference: ModuleReference): void {
    this.rawSources.delete(moduleReference);
    this.init();
  }

  private updateErrors(updatedErrors: readonly CompileTimeError[]): void {
    const grouped = ModuleReferenceCollections.hashMapOf<CompileTimeError[]>();
    updatedErrors.forEach((error) => {
      const group = grouped.get(error.location.moduleReference);
      if (group == null) {
        grouped.set(error.location.moduleReference, [error]);
      } else {
        group.push(error);
      }
    });
    this.errors = grouped;
  }

  private updateLocationLookupsForCheckedModules(checkedModules: Sources<SamlangModule>) {
    const locationLookupBuilder = new SamlangExpressionLocationLookupBuilder(
      this._expressionLocationLookup,
    );
    checkedModules.forEach((checkedModule, moduleReference) => {
      locationLookupBuilder.rebuild(moduleReference, checkedModule);
      checkedModule.classes.forEach((classDefinition) => {
        this._classLocationLookup.set(classDefinition.location, classDefinition.name.name);
      });
    });
    this._variableDefinitionLookup.rebuild(checkedModules);
  }
}

class CompletionItemKinds {
  static readonly METHOD = 2 as const;
  static readonly FUNCTION = 3 as const;
  static readonly FIELD = 5 as const;
}

class InsertTextFormats {
  static readonly PlainText = 1 as const;
  static readonly Snippet = 2 as const;
}

const getLastDocComment = (associatedComments?: readonly TypedComment[]): string | undefined =>
  [...(associatedComments ?? [])].reverse().find((it) => it.type === "doc")?.text;

class LanguageServicesImpl implements LanguageServices {
  constructor(public readonly state: LanguageServiceStateImpl) {}

  queryForHover(moduleReference: ModuleReference, position: Position) {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null) return null;
    let functionReference: readonly [ModuleReference, string, string] | undefined;
    if (expression.__type__ === "ClassMemberExpression") {
      functionReference = [
        expression.moduleReference,
        expression.className.name,
        expression.memberName.name,
      ];
    } else if (expression.__type__ === "MethodAccessExpression") {
      const thisType = expression.expression.type;
      assert(thisType.__type__ === "IdentifierType");
      functionReference = [
        thisType.moduleReference,
        thisType.identifier,
        expression.methodName.name,
      ];
    }
    if (functionReference != null) {
      const [fetchedFunctionModuleReference, className, functionName] = functionReference;
      const relevantFunction = this.state
        .getCheckedModule(fetchedFunctionModuleReference)
        ?.classes?.find((it) => it.name.name === className)
        ?.members?.find((it) => it.name.name === functionName);
      if (relevantFunction == null) return null;
      const typeContent = { language: "samlang", value: prettyPrintType(expression.type) };
      const document = getLastDocComment(relevantFunction.associatedComments);
      return {
        contents:
          document == null
            ? [typeContent]
            : [typeContent, { language: "markdown", value: document }],
        location: expression.location,
      };
    }
    const type = prettyPrintType(expression.type);
    if (type.startsWith("class ")) {
      const moduleParts = type.substring(6).split(".");
      const expressionClassName = checkNotNull(moduleParts.pop());
      const expressionModuleReference = ModuleReference(moduleParts);
      const document = getLastDocComment(
        this.state
          .getRawModule(expressionModuleReference)
          ?.classes.find((it) => it.name.name === expressionClassName)?.associatedComments,
      );
      const typeContent = { language: "samlang", value: `class ${expressionClassName}` };
      return {
        contents:
          document == null
            ? [typeContent]
            : [typeContent, { language: "markdown", value: document }],
        location: expression.location,
      };
    }
    return { contents: [{ language: "samlang", value: type }], location: expression.location };
  }

  queryFoldingRanges(moduleReference: ModuleReference): readonly Location[] | null {
    const module = this.state.getCheckedModule(moduleReference);
    if (module == null) return null;
    const ranges = module.classes.flatMap((moduleClass) => {
      const range = moduleClass.location;
      const members = moduleClass.members;
      const memberRanges = members.flatMap((member) => member.location);
      return [...memberRanges, range];
    });
    return ranges;
  }

  queryDefinitionLocation(moduleReference: ModuleReference, position: Position): Location | null {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null) return null;
    switch (expression.__type__) {
      case "LiteralExpression":
      case "ThisExpression":
        return null;
      case "VariableExpression": {
        if (
          expression.type.__type__ === "IdentifierType" &&
          expression.type.identifier.startsWith("class ")
        ) {
          const nullableClassDefinition = this.getClassDefinition(moduleReference, expression.name);
          if (nullableClassDefinition == null) return null;
          const [, classDefinition] = nullableClassDefinition;
          return classDefinition.location;
        }
        return (
          this.state.variableDefinitionLookup.findAllDefinitionAndUses(expression.location)
            ?.definitionLocation ?? null
        );
      }
      case "ClassMemberExpression":
        return this.findClassMemberLocation(
          moduleReference,
          expression.className.name,
          expression.memberName.name,
        );
      case "FieldAccessExpression": {
        const [, classDefinition] = checkNotNull(
          this.getClassDefinition(
            moduleReference,
            (expression.expression.type as SamlangIdentifierType).identifier,
          ),
        );
        return classDefinition.typeDefinition.location;
      }
      case "MethodAccessExpression":
        return this.findClassMemberLocation(
          moduleReference,
          (expression.expression.type as SamlangIdentifierType).identifier,
          expression.methodName.name,
        );
      case "UnaryExpression":
      case "FunctionCallExpression":
      case "BinaryExpression":
      case "IfElseExpression":
      case "MatchExpression":
      case "LambdaExpression":
      case "StatementBlockExpression":
        return null;
    }
  }

  private getClassDefinition(
    moduleReference: ModuleReference,
    className: string,
  ): readonly [ModuleReference, SourceClassDefinition] | undefined {
    const samlangModule = checkNotNull(
      this.state.getCheckedModule(moduleReference),
      `Missing ${moduleReference}`,
    );
    const { imports, classes } = samlangModule;
    for (let i = 0; i < classes.length; i += 1) {
      const samlangClass = checkNotNull(classes[i]);
      if (samlangClass.name.name === className) {
        return [moduleReference, samlangClass];
      }
    }
    return filterMap(imports, ({ importedMembers, importedModule }) => {
      if (importedMembers.some((it) => it.name === className)) {
        return this.getClassDefinition(importedModule, className);
      }
      return undefined;
    }).find(() => true);
  }

  private findClassMemberLocation(
    moduleReference: ModuleReference,
    className: string,
    memberName: string,
  ): Location | null {
    const nullableClassDefinition = this.getClassDefinition(moduleReference, className);
    if (nullableClassDefinition == null) return null;
    const [, classDefinition] = nullableClassDefinition;
    const matchingMember = classDefinition.members.find((it) => it.name.name === memberName);
    if (matchingMember == null) return null;
    return matchingMember.location;
  }

  autoComplete(moduleReference: ModuleReference, position: Position): AutoCompletionItem[] {
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    const classOfExpression = this.state.classLocationLookup.get(moduleReference, position);
    if (expression == null || classOfExpression == null) return [];
    if (expression.__type__ === "ClassMemberExpression") {
      const relevantClassType = this.getInterfaceType(
        expression.moduleReference,
        expression.className.name,
      );
      if (relevantClassType == null) return [];
      return Array.from(relevantClassType.functions, ([name, typeInformation]) => {
        return LanguageServicesImpl.getCompletionResultFromTypeInformation(
          name,
          typeInformation,
          CompletionItemKinds.FUNCTION,
        );
      });
    }
    let type: SamlangIdentifierType;
    switch (expression.__type__) {
      case "FieldAccessExpression":
      case "MethodAccessExpression": {
        const objectExpressionType = expression.expression.type;
        assert(objectExpressionType.__type__ === "IdentifierType");
        type = objectExpressionType;
        break;
      }
      default:
        return [];
    }
    const relevantInterfaceType = this.state.globalTypingContext
      .get(type.moduleReference)
      ?.interfaces?.get(type.identifier);
    const relevantTypeDefinition = this.state.globalTypingContext
      .get(type.moduleReference)
      ?.typeDefinitions?.get(type.identifier);
    if (relevantInterfaceType == null) return [];
    const completionResults: AutoCompletionItem[] = [];
    const isInsideClass = classOfExpression === type.identifier;
    if (isInsideClass && relevantTypeDefinition?.type === "object") {
      for (const [name, fieldType] of relevantTypeDefinition.mappings) {
        completionResults.push({
          label: name,
          insertText: name,
          insertTextFormat: InsertTextFormats.PlainText,
          kind: CompletionItemKinds.FIELD,
          detail: prettyPrintType(fieldType.type),
        });
      }
    }
    Array.from(relevantInterfaceType.methods).forEach(([name, typeInformation]) => {
      if (isInsideClass || typeInformation.isPublic) {
        completionResults.push(
          LanguageServicesImpl.getCompletionResultFromTypeInformation(
            name,
            typeInformation,
            CompletionItemKinds.METHOD,
          ),
        );
      }
    });
    return completionResults;
  }

  private getInterfaceType(
    moduleReference: ModuleReference,
    className: string,
  ): InterfaceTypingContext | undefined {
    return this.state.globalTypingContext.get(moduleReference)?.interfaces?.get(className);
  }

  private static getCompletionResultFromTypeInformation(
    name: string,
    typeInformation: MemberTypeInformation,
    kind: CompletionItemKind,
  ): AutoCompletionItem {
    const functionType = typeInformation.type;
    const detailedName = `${name}${LanguageServicesImpl.prettyPrintFunctionTypeWithDummyParameters(
      functionType,
    )}`;
    const [insertText, isSnippet] = LanguageServicesImpl.getInsertText(
      name,
      functionType.argumentTypes.length,
    );
    return {
      label: detailedName,
      insertText,
      insertTextFormat: isSnippet ? InsertTextFormats.Snippet : InsertTextFormats.PlainText,
      kind,
      detail: LanguageServicesImpl.prettyPrintTypeInformation(typeInformation),
    };
  }

  private static prettyPrintTypeInformation(typeInformation: MemberTypeInformation): string {
    return typeInformation.typeParameters.length === 0
      ? prettyPrintType(typeInformation.type)
      : `<${typeInformation.typeParameters.map((it) => it.name).join(", ")}>(${prettyPrintType(
          typeInformation.type,
        )})`;
  }

  private static prettyPrintFunctionTypeWithDummyParameters({
    argumentTypes,
    returnType,
  }: SamlangFunctionType) {
    const argumentPart = argumentTypes.map((it, id) => `a${id}: ${prettyPrintType(it)}`).join(", ");
    return `(${argumentPart}): ${prettyPrintType(returnType)}`;
  }

  private static getInsertText(name: string, argumentLength: number): readonly [string, boolean] {
    if (argumentLength === 0) return [`${name}()`, false];
    const items: string[] = [];
    for (let i = 0; i < argumentLength; i += 1) {
      items.push(`$${i}`);
    }
    return [`${name}(${items.join(", ")})$${items.length}`, true];
  }

  renameVariable(
    moduleReference: ModuleReference,
    position: Position,
    newName: string,
  ): "Invalid" | string | null {
    const trimmedNewName = newName.trim();
    if (!/[a-z][A-Za-z0-9]*/.test(trimmedNewName)) return "Invalid";
    const expression = this.state.expressionLocationLookup.get(moduleReference, position);
    if (expression == null || expression.__type__ !== "VariableExpression") return null;
    if (
      expression.type.__type__ === "IdentifierType" &&
      expression.type.identifier.startsWith("class ")
    ) {
      return null;
    }
    const definitionAndUses = this.state.variableDefinitionLookup.findAllDefinitionAndUses(
      expression.location,
    );
    if (definitionAndUses == null) return null;
    return prettyPrintSamlangModule(
      100,
      applyRenamingWithDefinitionAndUse(
        checkNotNull(this.state.getCheckedModule(moduleReference), `Missing ${moduleReference}`),
        definitionAndUses,
        newName,
      ),
    );
  }

  formatEntireDocument(moduleReference: ModuleReference): string | null {
    const moduleToFormat = this.state.getRawModule(moduleReference);
    if (moduleToFormat == null) return null;
    if (this.state.getErrors(moduleReference).some((it) => it.errorType === "SyntaxError")) {
      return null;
    }
    return prettyPrintSamlangModule(100, moduleToFormat);
  }
}

export default function createSamlangLanguageService(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
): LanguageServices {
  return new LanguageServicesImpl(new LanguageServiceStateImpl(sourceHandles));
}
