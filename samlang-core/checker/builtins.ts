import { BuiltinReason, Location, ModuleReference } from "../ast/common-nodes";
import { CustomizedReasonAstBuilder, SamlangType } from "../ast/samlang-nodes";
import type {
  InterfaceTypingContext,
  MemberTypeInformation,
  TypeDefinitionTypingContext,
} from "./typing-context";

const AST = new CustomizedReasonAstBuilder(BuiltinReason, ModuleReference.ROOT);

function createCustomBuiltinFunction(
  name: string,
  isPublic: boolean,
  typeParameters: readonly string[],
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType,
): readonly [string, MemberTypeInformation] {
  return [
    name,
    {
      isPublic,
      typeParameters: typeParameters.map((it) => ({ name: it, bound: null })),
      type: AST.FunType(argumentTypes, returnType),
    },
  ];
}

export function createBuiltinFunction(
  name: string,
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType,
  typeParameters: readonly string[] = [],
): readonly [string, MemberTypeInformation] {
  return createCustomBuiltinFunction(name, true, typeParameters, argumentTypes, returnType);
}

export function createPrivateBuiltinFunction(
  name: string,
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType,
  typeParameters: readonly string[] = [],
): readonly [string, MemberTypeInformation] {
  return createCustomBuiltinFunction(name, false, typeParameters, argumentTypes, returnType);
}

export const DEFAULT_BUILTIN_TYPING_CONTEXT: {
  readonly typeDefinitions: ReadonlyMap<string, TypeDefinitionTypingContext>;
  readonly interfaces: ReadonlyMap<string, InterfaceTypingContext>;
} = {
  typeDefinitions: new Map(),
  interfaces: new Map([
    [
      "Builtins",
      {
        isConcrete: true,
        typeParameters: [],
        typeDefinition: {
          location: Location.DUMMY,
          type: "object",
          names: [],
          mappings: new Map(),
        },
        extendsOrImplements: null,
        superTypes: [],
        functions: new Map([
          createBuiltinFunction("stringToInt", [AST.StringType], AST.IntType),
          createBuiltinFunction("intToString", [AST.IntType], AST.StringType),
          createBuiltinFunction("println", [AST.StringType], AST.UnitType),
          createBuiltinFunction("panic", [AST.StringType], AST.IdType("T"), ["T"]),
          createBuiltinFunction("stringConcat", [AST.StringType, AST.StringType], AST.StringType),
        ]),
        methods: new Map(),
      },
    ],
  ]),
};
