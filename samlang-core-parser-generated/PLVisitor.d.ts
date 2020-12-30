// @generated
/* eslint-disable */

import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';
import { TuplePatternContext } from './PLParser';
import { ObjectPatternContext } from './PLParser';
import { VariablePatternContext } from './PLParser';
import { WildcardPatternContext } from './PLParser';
import { NormalObjFieldDeclarationContext } from './PLParser';
import { ShorthandObjFieldDeclarationContext } from './PLParser';
import { ObjTypeContext } from './PLParser';
import { VariantTypeContext } from './PLParser';
import { ValStatementContext } from './PLParser';
import { RawVarContext } from './PLParser';
import { RenamedVarContext } from './PLParser';
import { ClassHeaderContext } from './PLParser';
import { UtilClassHeaderContext } from './PLParser';
import { NestedExprContext } from './PLParser';
import { LiteralExprContext } from './PLParser';
import { ThisExprContext } from './PLParser';
import { VariableExprContext } from './PLParser';
import { ClassMemberExprContext } from './PLParser';
import { TupleConstructorContext } from './PLParser';
import { ObjConstructorContext } from './PLParser';
import { VariantConstructorContext } from './PLParser';
import { StatementBlockExprContext } from './PLParser';
import { FieldAccessExprContext } from './PLParser';
import { NegExprContext } from './PLParser';
import { NotExprContext } from './PLParser';
import { PanicExprContext } from './PLParser';
import { StringToIntExprContext } from './PLParser';
import { IntToStringExprContext } from './PLParser';
import { PrintLineExprContext } from './PLParser';
import { FunctionApplicationExprContext } from './PLParser';
import { FactorExprContext } from './PLParser';
import { TermExprContext } from './PLParser';
import { ComparisonExprContext } from './PLParser';
import { ConjunctionExprContext } from './PLParser';
import { DisjunctionExprContext } from './PLParser';
import { ConcatExprContext } from './PLParser';
import { IfElseExprContext } from './PLParser';
import { MatchExprContext } from './PLParser';
import { FunExprContext } from './PLParser';
import { NoArgFunExprContext } from './PLParser';
import { UnitTypeContext } from './PLParser';
import { IntTypeContext } from './PLParser';
import { StrTypeContext } from './PLParser';
import { BoolTypeContext } from './PLParser';
import { SingleIdentifierTypeContext } from './PLParser';
import { TupleTypeContext } from './PLParser';
import { FunctionTypeContext } from './PLParser';
import { FunctionTypeNoArgContext } from './PLParser';
import { ModuleContext } from './PLParser';
import { ImportModuleMembersContext } from './PLParser';
import { ModuleReferenceContext } from './PLParser';
import { ClazzContext } from './PLParser';
import { ClassHeaderDeclarationContext } from './PLParser';
import { ClassMemberDefinitionContext } from './PLParser';
import { TypeParametersDeclarationContext } from './PLParser';
import { TypeDeclarationContext } from './PLParser';
import { ObjectTypeFieldDeclarationContext } from './PLParser';
import { VariantTypeConstructorDeclarationContext } from './PLParser';
import { TypeExprContext } from './PLParser';
import { TypeParametersContext } from './PLParser';
import { AnnotatedVariableContext } from './PLParser';
import { OptionallyAnnotatedParameterContext } from './PLParser';
import { TypeAnnotationContext } from './PLParser';
import { PatternToExprContext } from './PLParser';
import { StatementBlockContext } from './PLParser';
import { StatementContext } from './PLParser';
import { ExpressionContext } from './PLParser';
import { ObjectFieldDeclarationsContext } from './PLParser';
import { ObjectFieldDeclarationContext } from './PLParser';
import { FunctionArgumentsContext } from './PLParser';
import { PatternContext } from './PLParser';
import { VarOrWildCardContext } from './PLParser';
import { VarOrRenamedVarContext } from './PLParser';
import { FactorOperatorContext } from './PLParser';
import { TermOperatorContext } from './PLParser';
import { ComparisonOperatorContext } from './PLParser';
import { LiteralContext } from './PLParser';
/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `PLParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface PLVisitor<Result> extends ParseTreeVisitor<Result> {
  /**
   * Visit a parse tree produced by the `TuplePattern`
   * labeled alternative in `PLParser.pattern`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTuplePattern?: (ctx: TuplePatternContext) => Result;
  /**
   * Visit a parse tree produced by the `ObjectPattern`
   * labeled alternative in `PLParser.pattern`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitObjectPattern?: (ctx: ObjectPatternContext) => Result;
  /**
   * Visit a parse tree produced by the `VariablePattern`
   * labeled alternative in `PLParser.pattern`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVariablePattern?: (ctx: VariablePatternContext) => Result;
  /**
   * Visit a parse tree produced by the `WildcardPattern`
   * labeled alternative in `PLParser.pattern`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitWildcardPattern?: (ctx: WildcardPatternContext) => Result;
  /**
   * Visit a parse tree produced by the `NormalObjFieldDeclaration`
   * labeled alternative in `PLParser.objectFieldDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNormalObjFieldDeclaration?: (ctx: NormalObjFieldDeclarationContext) => Result;
  /**
   * Visit a parse tree produced by the `ShorthandObjFieldDeclaration`
   * labeled alternative in `PLParser.objectFieldDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitShorthandObjFieldDeclaration?: (ctx: ShorthandObjFieldDeclarationContext) => Result;
  /**
   * Visit a parse tree produced by the `ObjType`
   * labeled alternative in `PLParser.typeDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitObjType?: (ctx: ObjTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `VariantType`
   * labeled alternative in `PLParser.typeDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVariantType?: (ctx: VariantTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `ValStatement`
   * labeled alternative in `PLParser.statement`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitValStatement?: (ctx: ValStatementContext) => Result;
  /**
   * Visit a parse tree produced by the `RawVar`
   * labeled alternative in `PLParser.varOrRenamedVar`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitRawVar?: (ctx: RawVarContext) => Result;
  /**
   * Visit a parse tree produced by the `RenamedVar`
   * labeled alternative in `PLParser.varOrRenamedVar`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitRenamedVar?: (ctx: RenamedVarContext) => Result;
  /**
   * Visit a parse tree produced by the `ClassHeader`
   * labeled alternative in `PLParser.classHeaderDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitClassHeader?: (ctx: ClassHeaderContext) => Result;
  /**
   * Visit a parse tree produced by the `UtilClassHeader`
   * labeled alternative in `PLParser.classHeaderDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitUtilClassHeader?: (ctx: UtilClassHeaderContext) => Result;
  /**
   * Visit a parse tree produced by the `NestedExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNestedExpr?: (ctx: NestedExprContext) => Result;
  /**
   * Visit a parse tree produced by the `LiteralExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLiteralExpr?: (ctx: LiteralExprContext) => Result;
  /**
   * Visit a parse tree produced by the `ThisExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitThisExpr?: (ctx: ThisExprContext) => Result;
  /**
   * Visit a parse tree produced by the `VariableExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVariableExpr?: (ctx: VariableExprContext) => Result;
  /**
   * Visit a parse tree produced by the `ClassMemberExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitClassMemberExpr?: (ctx: ClassMemberExprContext) => Result;
  /**
   * Visit a parse tree produced by the `TupleConstructor`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTupleConstructor?: (ctx: TupleConstructorContext) => Result;
  /**
   * Visit a parse tree produced by the `ObjConstructor`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitObjConstructor?: (ctx: ObjConstructorContext) => Result;
  /**
   * Visit a parse tree produced by the `VariantConstructor`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVariantConstructor?: (ctx: VariantConstructorContext) => Result;
  /**
   * Visit a parse tree produced by the `StatementBlockExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStatementBlockExpr?: (ctx: StatementBlockExprContext) => Result;
  /**
   * Visit a parse tree produced by the `FieldAccessExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFieldAccessExpr?: (ctx: FieldAccessExprContext) => Result;
  /**
   * Visit a parse tree produced by the `NegExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNegExpr?: (ctx: NegExprContext) => Result;
  /**
   * Visit a parse tree produced by the `NotExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNotExpr?: (ctx: NotExprContext) => Result;
  /**
   * Visit a parse tree produced by the `PanicExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPanicExpr?: (ctx: PanicExprContext) => Result;
  /**
   * Visit a parse tree produced by the `StringToIntExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStringToIntExpr?: (ctx: StringToIntExprContext) => Result;
  /**
   * Visit a parse tree produced by the `IntToStringExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIntToStringExpr?: (ctx: IntToStringExprContext) => Result;
  /**
   * Visit a parse tree produced by the `PrintLineExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPrintLineExpr?: (ctx: PrintLineExprContext) => Result;
  /**
   * Visit a parse tree produced by the `FunctionApplicationExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionApplicationExpr?: (ctx: FunctionApplicationExprContext) => Result;
  /**
   * Visit a parse tree produced by the `FactorExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFactorExpr?: (ctx: FactorExprContext) => Result;
  /**
   * Visit a parse tree produced by the `TermExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTermExpr?: (ctx: TermExprContext) => Result;
  /**
   * Visit a parse tree produced by the `ComparisonExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitComparisonExpr?: (ctx: ComparisonExprContext) => Result;
  /**
   * Visit a parse tree produced by the `ConjunctionExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitConjunctionExpr?: (ctx: ConjunctionExprContext) => Result;
  /**
   * Visit a parse tree produced by the `DisjunctionExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitDisjunctionExpr?: (ctx: DisjunctionExprContext) => Result;
  /**
   * Visit a parse tree produced by the `ConcatExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitConcatExpr?: (ctx: ConcatExprContext) => Result;
  /**
   * Visit a parse tree produced by the `IfElseExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIfElseExpr?: (ctx: IfElseExprContext) => Result;
  /**
   * Visit a parse tree produced by the `MatchExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitMatchExpr?: (ctx: MatchExprContext) => Result;
  /**
   * Visit a parse tree produced by the `FunExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunExpr?: (ctx: FunExprContext) => Result;
  /**
   * Visit a parse tree produced by the `NoArgFunExpr`
   * labeled alternative in `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNoArgFunExpr?: (ctx: NoArgFunExprContext) => Result;
  /**
   * Visit a parse tree produced by the `UnitType`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitUnitType?: (ctx: UnitTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `IntType`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIntType?: (ctx: IntTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `StrType`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStrType?: (ctx: StrTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `BoolType`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBoolType?: (ctx: BoolTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `SingleIdentifierType`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitSingleIdentifierType?: (ctx: SingleIdentifierTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `TupleType`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTupleType?: (ctx: TupleTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `FunctionType`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionType?: (ctx: FunctionTypeContext) => Result;
  /**
   * Visit a parse tree produced by the `FunctionTypeNoArg`
   * labeled alternative in `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionTypeNoArg?: (ctx: FunctionTypeNoArgContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.module`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitModule?: (ctx: ModuleContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.importModuleMembers`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitImportModuleMembers?: (ctx: ImportModuleMembersContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.moduleReference`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitModuleReference?: (ctx: ModuleReferenceContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.clazz`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitClazz?: (ctx: ClazzContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.classHeaderDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitClassHeaderDeclaration?: (ctx: ClassHeaderDeclarationContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.classMemberDefinition`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitClassMemberDefinition?: (ctx: ClassMemberDefinitionContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.typeParametersDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeParametersDeclaration?: (ctx: TypeParametersDeclarationContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.typeDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeDeclaration?: (ctx: TypeDeclarationContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.objectTypeFieldDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitObjectTypeFieldDeclaration?: (ctx: ObjectTypeFieldDeclarationContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.variantTypeConstructorDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVariantTypeConstructorDeclaration?: (
    ctx: VariantTypeConstructorDeclarationContext
  ) => Result;
  /**
   * Visit a parse tree produced by `PLParser.typeExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeExpr?: (ctx: TypeExprContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.typeParameters`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeParameters?: (ctx: TypeParametersContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.annotatedVariable`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAnnotatedVariable?: (ctx: AnnotatedVariableContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.optionallyAnnotatedParameter`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitOptionallyAnnotatedParameter?: (ctx: OptionallyAnnotatedParameterContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.typeAnnotation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeAnnotation?: (ctx: TypeAnnotationContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.patternToExpr`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPatternToExpr?: (ctx: PatternToExprContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.statementBlock`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStatementBlock?: (ctx: StatementBlockContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.statement`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStatement?: (ctx: StatementContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExpression?: (ctx: ExpressionContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.objectFieldDeclarations`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitObjectFieldDeclarations?: (ctx: ObjectFieldDeclarationsContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.objectFieldDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitObjectFieldDeclaration?: (ctx: ObjectFieldDeclarationContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.functionArguments`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionArguments?: (ctx: FunctionArgumentsContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.pattern`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPattern?: (ctx: PatternContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.varOrWildCard`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVarOrWildCard?: (ctx: VarOrWildCardContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.varOrRenamedVar`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVarOrRenamedVar?: (ctx: VarOrRenamedVarContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.factorOperator`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFactorOperator?: (ctx: FactorOperatorContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.termOperator`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTermOperator?: (ctx: TermOperatorContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.comparisonOperator`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitComparisonOperator?: (ctx: ComparisonOperatorContext) => Result;
  /**
   * Visit a parse tree produced by `PLParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLiteral?: (ctx: LiteralContext) => Result;
}
