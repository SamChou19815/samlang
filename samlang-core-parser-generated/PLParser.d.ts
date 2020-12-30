// @generated
/* eslint-disable */

import { ATN } from 'antlr4ts/atn/ATN';
import { Parser } from 'antlr4ts/Parser';
import { ParserRuleContext } from 'antlr4ts/ParserRuleContext';
import { RuleContext } from 'antlr4ts/RuleContext';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';
import { TokenStream } from 'antlr4ts/TokenStream';
import { Vocabulary } from 'antlr4ts/Vocabulary';
import { PLVisitor } from './PLVisitor';
export declare class PLParser extends Parser {
  static readonly IMPORT = 1;
  static readonly FROM = 2;
  static readonly CLASS = 3;
  static readonly VAL = 4;
  static readonly FUNCTION = 5;
  static readonly METHOD = 6;
  static readonly AS = 7;
  static readonly PRIVATE = 8;
  static readonly PROTECTED = 9;
  static readonly INTERNAL = 10;
  static readonly PUBLIC = 11;
  static readonly IF = 12;
  static readonly THEN = 13;
  static readonly ELSE = 14;
  static readonly MATCH = 15;
  static readonly PANIC = 16;
  static readonly RETURN = 17;
  static readonly INT = 18;
  static readonly STRING = 19;
  static readonly BOOL = 20;
  static readonly UNIT = 21;
  static readonly TRUE = 22;
  static readonly FALSE = 23;
  static readonly THIS = 24;
  static readonly WILDCARD = 25;
  static readonly STRING2INT = 26;
  static readonly INT2STRING = 27;
  static readonly PRINTLN = 28;
  static readonly SELF = 29;
  static readonly CONST = 30;
  static readonly LET = 31;
  static readonly VAR = 32;
  static readonly TYPE = 33;
  static readonly INTERFACE = 34;
  static readonly FUNCTOR = 35;
  static readonly EXTENDS = 36;
  static readonly IMPLEMENTS = 37;
  static readonly EXPORT = 38;
  static readonly ASSERT = 39;
  static readonly LPAREN = 40;
  static readonly RPAREN = 41;
  static readonly LBRACE = 42;
  static readonly RBRACE = 43;
  static readonly LBRACKET = 44;
  static readonly RBRACKET = 45;
  static readonly QUESTION = 46;
  static readonly SEMICOLON = 47;
  static readonly COLON = 48;
  static readonly COLONCOLON = 49;
  static readonly COMMA = 50;
  static readonly DOT = 51;
  static readonly BAR = 52;
  static readonly ARROW = 53;
  static readonly ASSIGN = 54;
  static readonly NOT = 55;
  static readonly MUL = 56;
  static readonly DIV = 57;
  static readonly MOD = 58;
  static readonly PLUS = 59;
  static readonly MINUS = 60;
  static readonly STRUCT_EQ = 61;
  static readonly LT = 62;
  static readonly LE = 63;
  static readonly GT = 64;
  static readonly GE = 65;
  static readonly STRUCT_NE = 66;
  static readonly AND = 67;
  static readonly OR = 68;
  static readonly SPREAD = 69;
  static readonly LowerId = 70;
  static readonly UpperId = 71;
  static readonly MinInt = 72;
  static readonly IntLiteral = 73;
  static readonly StrLiteral = 74;
  static readonly HexLiteral = 75;
  static readonly DecimalLiteral = 76;
  static readonly OctalLiteral = 77;
  static readonly COMMENT = 78;
  static readonly WS = 79;
  static readonly LINE_COMMENT = 80;
  static readonly RULE_module = 0;
  static readonly RULE_importModuleMembers = 1;
  static readonly RULE_moduleReference = 2;
  static readonly RULE_clazz = 3;
  static readonly RULE_classHeaderDeclaration = 4;
  static readonly RULE_classMemberDefinition = 5;
  static readonly RULE_typeParametersDeclaration = 6;
  static readonly RULE_typeDeclaration = 7;
  static readonly RULE_objectTypeFieldDeclaration = 8;
  static readonly RULE_variantTypeConstructorDeclaration = 9;
  static readonly RULE_typeExpr = 10;
  static readonly RULE_typeParameters = 11;
  static readonly RULE_annotatedVariable = 12;
  static readonly RULE_optionallyAnnotatedParameter = 13;
  static readonly RULE_typeAnnotation = 14;
  static readonly RULE_patternToExpr = 15;
  static readonly RULE_statementBlock = 16;
  static readonly RULE_statement = 17;
  static readonly RULE_expression = 18;
  static readonly RULE_objectFieldDeclarations = 19;
  static readonly RULE_objectFieldDeclaration = 20;
  static readonly RULE_functionArguments = 21;
  static readonly RULE_pattern = 22;
  static readonly RULE_varOrWildCard = 23;
  static readonly RULE_varOrRenamedVar = 24;
  static readonly RULE_factorOperator = 25;
  static readonly RULE_termOperator = 26;
  static readonly RULE_comparisonOperator = 27;
  static readonly RULE_literal = 28;
  static readonly ruleNames: string[];
  private static readonly _LITERAL_NAMES;
  private static readonly _SYMBOLIC_NAMES;
  static readonly VOCABULARY: Vocabulary;
  get vocabulary(): Vocabulary;
  get grammarFileName(): string;
  get ruleNames(): string[];
  get serializedATN(): string;
  constructor(input: TokenStream);
  module(): ModuleContext;
  importModuleMembers(): ImportModuleMembersContext;
  moduleReference(): ModuleReferenceContext;
  clazz(): ClazzContext;
  classHeaderDeclaration(): ClassHeaderDeclarationContext;
  classMemberDefinition(): ClassMemberDefinitionContext;
  typeParametersDeclaration(): TypeParametersDeclarationContext;
  typeDeclaration(): TypeDeclarationContext;
  objectTypeFieldDeclaration(): ObjectTypeFieldDeclarationContext;
  variantTypeConstructorDeclaration(): VariantTypeConstructorDeclarationContext;
  typeExpr(): TypeExprContext;
  typeParameters(): TypeParametersContext;
  annotatedVariable(): AnnotatedVariableContext;
  optionallyAnnotatedParameter(): OptionallyAnnotatedParameterContext;
  typeAnnotation(): TypeAnnotationContext;
  patternToExpr(): PatternToExprContext;
  statementBlock(): StatementBlockContext;
  statement(): StatementContext;
  expression(): ExpressionContext;
  expression(_p: number): ExpressionContext;
  objectFieldDeclarations(): ObjectFieldDeclarationsContext;
  objectFieldDeclaration(): ObjectFieldDeclarationContext;
  functionArguments(): FunctionArgumentsContext;
  pattern(): PatternContext;
  varOrWildCard(): VarOrWildCardContext;
  varOrRenamedVar(): VarOrRenamedVarContext;
  factorOperator(): FactorOperatorContext;
  termOperator(): TermOperatorContext;
  comparisonOperator(): ComparisonOperatorContext;
  literal(): LiteralContext;
  sempred(_localctx: RuleContext, ruleIndex: number, predIndex: number): boolean;
  private expression_sempred;
  static readonly _serializedATN: string;
  static __ATN: ATN;
  static get _ATN(): ATN;
}
export declare class ModuleContext extends ParserRuleContext {
  EOF(): TerminalNode;
  importModuleMembers(): ImportModuleMembersContext[];
  importModuleMembers(i: number): ImportModuleMembersContext;
  clazz(): ClazzContext[];
  clazz(i: number): ClazzContext;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ImportModuleMembersContext extends ParserRuleContext {
  IMPORT(): TerminalNode;
  LBRACE(): TerminalNode;
  UpperId(): TerminalNode[];
  UpperId(i: number): TerminalNode;
  RBRACE(): TerminalNode;
  FROM(): TerminalNode;
  moduleReference(): ModuleReferenceContext;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ModuleReferenceContext extends ParserRuleContext {
  UpperId(): TerminalNode[];
  UpperId(i: number): TerminalNode;
  DOT(): TerminalNode[];
  DOT(i: number): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ClazzContext extends ParserRuleContext {
  classHeaderDeclaration(): ClassHeaderDeclarationContext;
  LBRACE(): TerminalNode;
  RBRACE(): TerminalNode;
  classMemberDefinition(): ClassMemberDefinitionContext[];
  classMemberDefinition(i: number): ClassMemberDefinitionContext;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ClassHeaderDeclarationContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: ClassHeaderDeclarationContext): void;
}
export declare class ClassHeaderContext extends ClassHeaderDeclarationContext {
  CLASS(): TerminalNode;
  UpperId(): TerminalNode;
  LPAREN(): TerminalNode;
  typeDeclaration(): TypeDeclarationContext;
  RPAREN(): TerminalNode;
  typeParametersDeclaration(): TypeParametersDeclarationContext | undefined;
  constructor(ctx: ClassHeaderDeclarationContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class UtilClassHeaderContext extends ClassHeaderDeclarationContext {
  CLASS(): TerminalNode;
  UpperId(): TerminalNode;
  constructor(ctx: ClassHeaderDeclarationContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ClassMemberDefinitionContext extends ParserRuleContext {
  LowerId(): TerminalNode;
  LPAREN(): TerminalNode;
  RPAREN(): TerminalNode;
  ASSIGN(): TerminalNode;
  expression(): ExpressionContext;
  FUNCTION(): TerminalNode | undefined;
  METHOD(): TerminalNode | undefined;
  PRIVATE(): TerminalNode | undefined;
  typeParametersDeclaration(): TypeParametersDeclarationContext | undefined;
  annotatedVariable(): AnnotatedVariableContext[];
  annotatedVariable(i: number): AnnotatedVariableContext;
  COLON(): TerminalNode | undefined;
  typeExpr(): TypeExprContext | undefined;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TypeParametersDeclarationContext extends ParserRuleContext {
  LT(): TerminalNode;
  UpperId(): TerminalNode[];
  UpperId(i: number): TerminalNode;
  GT(): TerminalNode;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TypeDeclarationContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: TypeDeclarationContext): void;
}
export declare class ObjTypeContext extends TypeDeclarationContext {
  objectTypeFieldDeclaration(): ObjectTypeFieldDeclarationContext[];
  objectTypeFieldDeclaration(i: number): ObjectTypeFieldDeclarationContext;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(ctx: TypeDeclarationContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class VariantTypeContext extends TypeDeclarationContext {
  variantTypeConstructorDeclaration(): VariantTypeConstructorDeclarationContext[];
  variantTypeConstructorDeclaration(i: number): VariantTypeConstructorDeclarationContext;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(ctx: TypeDeclarationContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ObjectTypeFieldDeclarationContext extends ParserRuleContext {
  VAL(): TerminalNode;
  LowerId(): TerminalNode;
  typeAnnotation(): TypeAnnotationContext;
  PRIVATE(): TerminalNode | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class VariantTypeConstructorDeclarationContext extends ParserRuleContext {
  UpperId(): TerminalNode;
  LPAREN(): TerminalNode;
  typeExpr(): TypeExprContext;
  RPAREN(): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TypeExprContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: TypeExprContext): void;
}
export declare class UnitTypeContext extends TypeExprContext {
  UNIT(): TerminalNode;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class IntTypeContext extends TypeExprContext {
  INT(): TerminalNode;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class StrTypeContext extends TypeExprContext {
  STRING(): TerminalNode;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class BoolTypeContext extends TypeExprContext {
  BOOL(): TerminalNode;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class SingleIdentifierTypeContext extends TypeExprContext {
  UpperId(): TerminalNode;
  typeParameters(): TypeParametersContext | undefined;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TupleTypeContext extends TypeExprContext {
  LBRACKET(): TerminalNode;
  typeExpr(): TypeExprContext[];
  typeExpr(i: number): TypeExprContext;
  RBRACKET(): TerminalNode;
  MUL(): TerminalNode[];
  MUL(i: number): TerminalNode;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FunctionTypeContext extends TypeExprContext {
  LPAREN(): TerminalNode;
  typeExpr(): TypeExprContext[];
  typeExpr(i: number): TypeExprContext;
  RPAREN(): TerminalNode;
  ARROW(): TerminalNode;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FunctionTypeNoArgContext extends TypeExprContext {
  LPAREN(): TerminalNode;
  RPAREN(): TerminalNode;
  ARROW(): TerminalNode;
  typeExpr(): TypeExprContext;
  constructor(ctx: TypeExprContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TypeParametersContext extends ParserRuleContext {
  LT(): TerminalNode;
  typeExpr(): TypeExprContext[];
  typeExpr(i: number): TypeExprContext;
  GT(): TerminalNode;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class AnnotatedVariableContext extends ParserRuleContext {
  LowerId(): TerminalNode;
  typeAnnotation(): TypeAnnotationContext;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class OptionallyAnnotatedParameterContext extends ParserRuleContext {
  LowerId(): TerminalNode;
  typeAnnotation(): TypeAnnotationContext | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TypeAnnotationContext extends ParserRuleContext {
  COLON(): TerminalNode;
  typeExpr(): TypeExprContext;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class PatternToExprContext extends ParserRuleContext {
  BAR(): TerminalNode;
  ARROW(): TerminalNode;
  expression(): ExpressionContext;
  UpperId(): TerminalNode | undefined;
  varOrWildCard(): VarOrWildCardContext | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class StatementBlockContext extends ParserRuleContext {
  LBRACE(): TerminalNode;
  RBRACE(): TerminalNode;
  statement(): StatementContext[];
  statement(i: number): StatementContext;
  expression(): ExpressionContext | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class StatementContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: StatementContext): void;
}
export declare class ValStatementContext extends StatementContext {
  VAL(): TerminalNode;
  pattern(): PatternContext;
  ASSIGN(): TerminalNode;
  expression(): ExpressionContext;
  typeAnnotation(): TypeAnnotationContext | undefined;
  SEMICOLON(): TerminalNode | undefined;
  constructor(ctx: StatementContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ExpressionContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: ExpressionContext): void;
}
export declare class NestedExprContext extends ExpressionContext {
  LPAREN(): TerminalNode;
  expression(): ExpressionContext;
  RPAREN(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class LiteralExprContext extends ExpressionContext {
  literal(): LiteralContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ThisExprContext extends ExpressionContext {
  THIS(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class VariableExprContext extends ExpressionContext {
  LowerId(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ClassMemberExprContext extends ExpressionContext {
  UpperId(): TerminalNode;
  DOT(): TerminalNode;
  LowerId(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TupleConstructorContext extends ExpressionContext {
  LBRACKET(): TerminalNode;
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  RBRACKET(): TerminalNode;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ObjConstructorContext extends ExpressionContext {
  LBRACE(): TerminalNode;
  objectFieldDeclarations(): ObjectFieldDeclarationsContext;
  RBRACE(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class VariantConstructorContext extends ExpressionContext {
  UpperId(): TerminalNode;
  LPAREN(): TerminalNode;
  expression(): ExpressionContext;
  RPAREN(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class StatementBlockExprContext extends ExpressionContext {
  statementBlock(): StatementBlockContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FieldAccessExprContext extends ExpressionContext {
  expression(): ExpressionContext;
  DOT(): TerminalNode;
  LowerId(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class NegExprContext extends ExpressionContext {
  MINUS(): TerminalNode;
  expression(): ExpressionContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class NotExprContext extends ExpressionContext {
  NOT(): TerminalNode;
  expression(): ExpressionContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class PanicExprContext extends ExpressionContext {
  PANIC(): TerminalNode;
  LPAREN(): TerminalNode;
  expression(): ExpressionContext;
  RPAREN(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class StringToIntExprContext extends ExpressionContext {
  STRING2INT(): TerminalNode;
  LPAREN(): TerminalNode;
  expression(): ExpressionContext;
  RPAREN(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class IntToStringExprContext extends ExpressionContext {
  INT2STRING(): TerminalNode;
  LPAREN(): TerminalNode;
  expression(): ExpressionContext;
  RPAREN(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class PrintLineExprContext extends ExpressionContext {
  PRINTLN(): TerminalNode;
  LPAREN(): TerminalNode;
  expression(): ExpressionContext;
  RPAREN(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FunctionApplicationExprContext extends ExpressionContext {
  expression(): ExpressionContext;
  functionArguments(): FunctionArgumentsContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FactorExprContext extends ExpressionContext {
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  factorOperator(): FactorOperatorContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TermExprContext extends ExpressionContext {
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  termOperator(): TermOperatorContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ComparisonExprContext extends ExpressionContext {
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  comparisonOperator(): ComparisonOperatorContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ConjunctionExprContext extends ExpressionContext {
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  AND(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class DisjunctionExprContext extends ExpressionContext {
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  OR(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ConcatExprContext extends ExpressionContext {
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  COLONCOLON(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class IfElseExprContext extends ExpressionContext {
  IF(): TerminalNode;
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  THEN(): TerminalNode;
  ELSE(): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class MatchExprContext extends ExpressionContext {
  MATCH(): TerminalNode;
  LPAREN(): TerminalNode;
  expression(): ExpressionContext;
  RPAREN(): TerminalNode;
  LBRACE(): TerminalNode;
  RBRACE(): TerminalNode;
  patternToExpr(): PatternToExprContext[];
  patternToExpr(i: number): PatternToExprContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FunExprContext extends ExpressionContext {
  LPAREN(): TerminalNode;
  optionallyAnnotatedParameter(): OptionallyAnnotatedParameterContext[];
  optionallyAnnotatedParameter(i: number): OptionallyAnnotatedParameterContext;
  RPAREN(): TerminalNode;
  ARROW(): TerminalNode;
  expression(): ExpressionContext;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class NoArgFunExprContext extends ExpressionContext {
  LPAREN(): TerminalNode;
  RPAREN(): TerminalNode;
  ARROW(): TerminalNode;
  expression(): ExpressionContext;
  constructor(ctx: ExpressionContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ObjectFieldDeclarationsContext extends ParserRuleContext {
  objectFieldDeclaration(): ObjectFieldDeclarationContext[];
  objectFieldDeclaration(i: number): ObjectFieldDeclarationContext;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ObjectFieldDeclarationContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: ObjectFieldDeclarationContext): void;
}
export declare class NormalObjFieldDeclarationContext extends ObjectFieldDeclarationContext {
  LowerId(): TerminalNode;
  COLON(): TerminalNode;
  expression(): ExpressionContext;
  constructor(ctx: ObjectFieldDeclarationContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ShorthandObjFieldDeclarationContext extends ObjectFieldDeclarationContext {
  LowerId(): TerminalNode;
  constructor(ctx: ObjectFieldDeclarationContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FunctionArgumentsContext extends ParserRuleContext {
  LPAREN(): TerminalNode;
  RPAREN(): TerminalNode;
  expression(): ExpressionContext[];
  expression(i: number): ExpressionContext;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class PatternContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: PatternContext): void;
}
export declare class TuplePatternContext extends PatternContext {
  LBRACKET(): TerminalNode;
  varOrWildCard(): VarOrWildCardContext[];
  varOrWildCard(i: number): VarOrWildCardContext;
  RBRACKET(): TerminalNode;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(ctx: PatternContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ObjectPatternContext extends PatternContext {
  LBRACE(): TerminalNode;
  varOrRenamedVar(): VarOrRenamedVarContext[];
  varOrRenamedVar(i: number): VarOrRenamedVarContext;
  RBRACE(): TerminalNode;
  COMMA(): TerminalNode[];
  COMMA(i: number): TerminalNode;
  constructor(ctx: PatternContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class VariablePatternContext extends PatternContext {
  LowerId(): TerminalNode;
  constructor(ctx: PatternContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class WildcardPatternContext extends PatternContext {
  WILDCARD(): TerminalNode;
  constructor(ctx: PatternContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class VarOrWildCardContext extends ParserRuleContext {
  LowerId(): TerminalNode | undefined;
  WILDCARD(): TerminalNode | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class VarOrRenamedVarContext extends ParserRuleContext {
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  copyFrom(ctx: VarOrRenamedVarContext): void;
}
export declare class RawVarContext extends VarOrRenamedVarContext {
  LowerId(): TerminalNode;
  constructor(ctx: VarOrRenamedVarContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class RenamedVarContext extends VarOrRenamedVarContext {
  LowerId(): TerminalNode[];
  LowerId(i: number): TerminalNode;
  AS(): TerminalNode;
  constructor(ctx: VarOrRenamedVarContext);
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class FactorOperatorContext extends ParserRuleContext {
  MUL(): TerminalNode | undefined;
  DIV(): TerminalNode | undefined;
  MOD(): TerminalNode | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class TermOperatorContext extends ParserRuleContext {
  PLUS(): TerminalNode | undefined;
  MINUS(): TerminalNode | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class ComparisonOperatorContext extends ParserRuleContext {
  LT(): TerminalNode | undefined;
  LE(): TerminalNode | undefined;
  GT(): TerminalNode | undefined;
  GE(): TerminalNode | undefined;
  STRUCT_EQ(): TerminalNode | undefined;
  STRUCT_NE(): TerminalNode | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
export declare class LiteralContext extends ParserRuleContext {
  TRUE(): TerminalNode | undefined;
  FALSE(): TerminalNode | undefined;
  MinInt(): TerminalNode | undefined;
  IntLiteral(): TerminalNode | undefined;
  StrLiteral(): TerminalNode | undefined;
  constructor(parent: ParserRuleContext | undefined, invokingState: number);
  get ruleIndex(): number;
  accept<Result>(visitor: PLVisitor<Result>): Result;
}
