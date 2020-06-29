// Generated from PL.g4 by ANTLR 4.7.3-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

import { TuplePatternContext } from "./PLParser";
import { ObjectPatternContext } from "./PLParser";
import { VariablePatternContext } from "./PLParser";
import { WildcardPatternContext } from "./PLParser";
import { NormalObjFieldDeclarationContext } from "./PLParser";
import { ShorthandObjFieldDeclarationContext } from "./PLParser";
import { ObjTypeContext } from "./PLParser";
import { VariantTypeContext } from "./PLParser";
import { ValStatementContext } from "./PLParser";
import { ClassAsModuleMemberContext } from "./PLParser";
import { InterfaceAsModuleMemberContext } from "./PLParser";
import { RawVarContext } from "./PLParser";
import { RenamedVarContext } from "./PLParser";
import { ClassHeaderContext } from "./PLParser";
import { UtilClassHeaderContext } from "./PLParser";
import { NestedExprContext } from "./PLParser";
import { LiteralExprContext } from "./PLParser";
import { ThisExprContext } from "./PLParser";
import { VariableExprContext } from "./PLParser";
import { ClassMemberExprContext } from "./PLParser";
import { TupleConstructorContext } from "./PLParser";
import { ObjConstructorContext } from "./PLParser";
import { VariantConstructorContext } from "./PLParser";
import { FieldAccessExprContext } from "./PLParser";
import { NegExprContext } from "./PLParser";
import { NotExprContext } from "./PLParser";
import { PanicExprContext } from "./PLParser";
import { StringToIntExprContext } from "./PLParser";
import { IntToStringExprContext } from "./PLParser";
import { PrintLineExprContext } from "./PLParser";
import { FunctionApplicationExprContext } from "./PLParser";
import { FactorExprContext } from "./PLParser";
import { TermExprContext } from "./PLParser";
import { ComparisonExprContext } from "./PLParser";
import { ConjunctionExprContext } from "./PLParser";
import { DisjunctionExprContext } from "./PLParser";
import { ConcatExprContext } from "./PLParser";
import { IfElseExprContext } from "./PLParser";
import { MatchExprContext } from "./PLParser";
import { FunExprContext } from "./PLParser";
import { StatementBlockExprContext } from "./PLParser";
import { UnitTypeContext } from "./PLParser";
import { IntTypeContext } from "./PLParser";
import { StrTypeContext } from "./PLParser";
import { BoolTypeContext } from "./PLParser";
import { SingleIdentifierTypeContext } from "./PLParser";
import { TupleTypeContext } from "./PLParser";
import { FunctionTypeContext } from "./PLParser";
import { ModuleContext } from "./PLParser";
import { ImportModuleMembersContext } from "./PLParser";
import { ModuleReferenceContext } from "./PLParser";
import { ModuleMemberContext } from "./PLParser";
import { ClazzContext } from "./PLParser";
import { InterfazeContext } from "./PLParser";
import { ClassHeaderDeclarationContext } from "./PLParser";
import { ClassMemberDefinitionContext } from "./PLParser";
import { ClassMemberDeclarationContext } from "./PLParser";
import { TypeParametersDeclarationContext } from "./PLParser";
import { TypeDeclarationContext } from "./PLParser";
import { ObjectTypeFieldDeclarationContext } from "./PLParser";
import { VariantTypeConstructorDeclarationContext } from "./PLParser";
import { TypeExprContext } from "./PLParser";
import { TypeParametersContext } from "./PLParser";
import { AnnotatedVariableContext } from "./PLParser";
import { OptionallyAnnotatedParameterContext } from "./PLParser";
import { TypeAnnotationContext } from "./PLParser";
import { PatternToExprContext } from "./PLParser";
import { StatementBlockContext } from "./PLParser";
import { StatementContext } from "./PLParser";
import { ExpressionContext } from "./PLParser";
import { ObjectFieldDeclarationsContext } from "./PLParser";
import { ObjectFieldDeclarationContext } from "./PLParser";
import { FunctionArgumentsContext } from "./PLParser";
import { PatternContext } from "./PLParser";
import { VarOrWildCardContext } from "./PLParser";
import { VarOrRenamedVarContext } from "./PLParser";
import { FactorOperatorContext } from "./PLParser";
import { TermOperatorContext } from "./PLParser";
import { ComparisonOperatorContext } from "./PLParser";
import { LiteralContext } from "./PLParser";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `PLParser`.
 */
export interface PLListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by the `TuplePattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	enterTuplePattern?: (ctx: TuplePatternContext) => void;
	/**
	 * Exit a parse tree produced by the `TuplePattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	exitTuplePattern?: (ctx: TuplePatternContext) => void;

	/**
	 * Enter a parse tree produced by the `ObjectPattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	enterObjectPattern?: (ctx: ObjectPatternContext) => void;
	/**
	 * Exit a parse tree produced by the `ObjectPattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	exitObjectPattern?: (ctx: ObjectPatternContext) => void;

	/**
	 * Enter a parse tree produced by the `VariablePattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	enterVariablePattern?: (ctx: VariablePatternContext) => void;
	/**
	 * Exit a parse tree produced by the `VariablePattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	exitVariablePattern?: (ctx: VariablePatternContext) => void;

	/**
	 * Enter a parse tree produced by the `WildcardPattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	enterWildcardPattern?: (ctx: WildcardPatternContext) => void;
	/**
	 * Exit a parse tree produced by the `WildcardPattern`
	 * labeled alternative in `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	exitWildcardPattern?: (ctx: WildcardPatternContext) => void;

	/**
	 * Enter a parse tree produced by the `NormalObjFieldDeclaration`
	 * labeled alternative in `PLParser.objectFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	enterNormalObjFieldDeclaration?: (ctx: NormalObjFieldDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by the `NormalObjFieldDeclaration`
	 * labeled alternative in `PLParser.objectFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	exitNormalObjFieldDeclaration?: (ctx: NormalObjFieldDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by the `ShorthandObjFieldDeclaration`
	 * labeled alternative in `PLParser.objectFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	enterShorthandObjFieldDeclaration?: (ctx: ShorthandObjFieldDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by the `ShorthandObjFieldDeclaration`
	 * labeled alternative in `PLParser.objectFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	exitShorthandObjFieldDeclaration?: (ctx: ShorthandObjFieldDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by the `ObjType`
	 * labeled alternative in `PLParser.typeDeclaration`.
	 * @param ctx the parse tree
	 */
	enterObjType?: (ctx: ObjTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `ObjType`
	 * labeled alternative in `PLParser.typeDeclaration`.
	 * @param ctx the parse tree
	 */
	exitObjType?: (ctx: ObjTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `VariantType`
	 * labeled alternative in `PLParser.typeDeclaration`.
	 * @param ctx the parse tree
	 */
	enterVariantType?: (ctx: VariantTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `VariantType`
	 * labeled alternative in `PLParser.typeDeclaration`.
	 * @param ctx the parse tree
	 */
	exitVariantType?: (ctx: VariantTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `ValStatement`
	 * labeled alternative in `PLParser.statement`.
	 * @param ctx the parse tree
	 */
	enterValStatement?: (ctx: ValStatementContext) => void;
	/**
	 * Exit a parse tree produced by the `ValStatement`
	 * labeled alternative in `PLParser.statement`.
	 * @param ctx the parse tree
	 */
	exitValStatement?: (ctx: ValStatementContext) => void;

	/**
	 * Enter a parse tree produced by the `ClassAsModuleMember`
	 * labeled alternative in `PLParser.moduleMember`.
	 * @param ctx the parse tree
	 */
	enterClassAsModuleMember?: (ctx: ClassAsModuleMemberContext) => void;
	/**
	 * Exit a parse tree produced by the `ClassAsModuleMember`
	 * labeled alternative in `PLParser.moduleMember`.
	 * @param ctx the parse tree
	 */
	exitClassAsModuleMember?: (ctx: ClassAsModuleMemberContext) => void;

	/**
	 * Enter a parse tree produced by the `InterfaceAsModuleMember`
	 * labeled alternative in `PLParser.moduleMember`.
	 * @param ctx the parse tree
	 */
	enterInterfaceAsModuleMember?: (ctx: InterfaceAsModuleMemberContext) => void;
	/**
	 * Exit a parse tree produced by the `InterfaceAsModuleMember`
	 * labeled alternative in `PLParser.moduleMember`.
	 * @param ctx the parse tree
	 */
	exitInterfaceAsModuleMember?: (ctx: InterfaceAsModuleMemberContext) => void;

	/**
	 * Enter a parse tree produced by the `RawVar`
	 * labeled alternative in `PLParser.varOrRenamedVar`.
	 * @param ctx the parse tree
	 */
	enterRawVar?: (ctx: RawVarContext) => void;
	/**
	 * Exit a parse tree produced by the `RawVar`
	 * labeled alternative in `PLParser.varOrRenamedVar`.
	 * @param ctx the parse tree
	 */
	exitRawVar?: (ctx: RawVarContext) => void;

	/**
	 * Enter a parse tree produced by the `RenamedVar`
	 * labeled alternative in `PLParser.varOrRenamedVar`.
	 * @param ctx the parse tree
	 */
	enterRenamedVar?: (ctx: RenamedVarContext) => void;
	/**
	 * Exit a parse tree produced by the `RenamedVar`
	 * labeled alternative in `PLParser.varOrRenamedVar`.
	 * @param ctx the parse tree
	 */
	exitRenamedVar?: (ctx: RenamedVarContext) => void;

	/**
	 * Enter a parse tree produced by the `ClassHeader`
	 * labeled alternative in `PLParser.classHeaderDeclaration`.
	 * @param ctx the parse tree
	 */
	enterClassHeader?: (ctx: ClassHeaderContext) => void;
	/**
	 * Exit a parse tree produced by the `ClassHeader`
	 * labeled alternative in `PLParser.classHeaderDeclaration`.
	 * @param ctx the parse tree
	 */
	exitClassHeader?: (ctx: ClassHeaderContext) => void;

	/**
	 * Enter a parse tree produced by the `UtilClassHeader`
	 * labeled alternative in `PLParser.classHeaderDeclaration`.
	 * @param ctx the parse tree
	 */
	enterUtilClassHeader?: (ctx: UtilClassHeaderContext) => void;
	/**
	 * Exit a parse tree produced by the `UtilClassHeader`
	 * labeled alternative in `PLParser.classHeaderDeclaration`.
	 * @param ctx the parse tree
	 */
	exitUtilClassHeader?: (ctx: UtilClassHeaderContext) => void;

	/**
	 * Enter a parse tree produced by the `NestedExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterNestedExpr?: (ctx: NestedExprContext) => void;
	/**
	 * Exit a parse tree produced by the `NestedExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitNestedExpr?: (ctx: NestedExprContext) => void;

	/**
	 * Enter a parse tree produced by the `LiteralExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterLiteralExpr?: (ctx: LiteralExprContext) => void;
	/**
	 * Exit a parse tree produced by the `LiteralExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitLiteralExpr?: (ctx: LiteralExprContext) => void;

	/**
	 * Enter a parse tree produced by the `ThisExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterThisExpr?: (ctx: ThisExprContext) => void;
	/**
	 * Exit a parse tree produced by the `ThisExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitThisExpr?: (ctx: ThisExprContext) => void;

	/**
	 * Enter a parse tree produced by the `VariableExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterVariableExpr?: (ctx: VariableExprContext) => void;
	/**
	 * Exit a parse tree produced by the `VariableExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitVariableExpr?: (ctx: VariableExprContext) => void;

	/**
	 * Enter a parse tree produced by the `ClassMemberExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterClassMemberExpr?: (ctx: ClassMemberExprContext) => void;
	/**
	 * Exit a parse tree produced by the `ClassMemberExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitClassMemberExpr?: (ctx: ClassMemberExprContext) => void;

	/**
	 * Enter a parse tree produced by the `TupleConstructor`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterTupleConstructor?: (ctx: TupleConstructorContext) => void;
	/**
	 * Exit a parse tree produced by the `TupleConstructor`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitTupleConstructor?: (ctx: TupleConstructorContext) => void;

	/**
	 * Enter a parse tree produced by the `ObjConstructor`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterObjConstructor?: (ctx: ObjConstructorContext) => void;
	/**
	 * Exit a parse tree produced by the `ObjConstructor`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitObjConstructor?: (ctx: ObjConstructorContext) => void;

	/**
	 * Enter a parse tree produced by the `VariantConstructor`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterVariantConstructor?: (ctx: VariantConstructorContext) => void;
	/**
	 * Exit a parse tree produced by the `VariantConstructor`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitVariantConstructor?: (ctx: VariantConstructorContext) => void;

	/**
	 * Enter a parse tree produced by the `FieldAccessExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterFieldAccessExpr?: (ctx: FieldAccessExprContext) => void;
	/**
	 * Exit a parse tree produced by the `FieldAccessExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitFieldAccessExpr?: (ctx: FieldAccessExprContext) => void;

	/**
	 * Enter a parse tree produced by the `NegExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterNegExpr?: (ctx: NegExprContext) => void;
	/**
	 * Exit a parse tree produced by the `NegExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitNegExpr?: (ctx: NegExprContext) => void;

	/**
	 * Enter a parse tree produced by the `NotExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterNotExpr?: (ctx: NotExprContext) => void;
	/**
	 * Exit a parse tree produced by the `NotExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitNotExpr?: (ctx: NotExprContext) => void;

	/**
	 * Enter a parse tree produced by the `PanicExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterPanicExpr?: (ctx: PanicExprContext) => void;
	/**
	 * Exit a parse tree produced by the `PanicExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitPanicExpr?: (ctx: PanicExprContext) => void;

	/**
	 * Enter a parse tree produced by the `StringToIntExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterStringToIntExpr?: (ctx: StringToIntExprContext) => void;
	/**
	 * Exit a parse tree produced by the `StringToIntExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitStringToIntExpr?: (ctx: StringToIntExprContext) => void;

	/**
	 * Enter a parse tree produced by the `IntToStringExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterIntToStringExpr?: (ctx: IntToStringExprContext) => void;
	/**
	 * Exit a parse tree produced by the `IntToStringExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitIntToStringExpr?: (ctx: IntToStringExprContext) => void;

	/**
	 * Enter a parse tree produced by the `PrintLineExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterPrintLineExpr?: (ctx: PrintLineExprContext) => void;
	/**
	 * Exit a parse tree produced by the `PrintLineExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitPrintLineExpr?: (ctx: PrintLineExprContext) => void;

	/**
	 * Enter a parse tree produced by the `FunctionApplicationExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterFunctionApplicationExpr?: (ctx: FunctionApplicationExprContext) => void;
	/**
	 * Exit a parse tree produced by the `FunctionApplicationExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitFunctionApplicationExpr?: (ctx: FunctionApplicationExprContext) => void;

	/**
	 * Enter a parse tree produced by the `FactorExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterFactorExpr?: (ctx: FactorExprContext) => void;
	/**
	 * Exit a parse tree produced by the `FactorExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitFactorExpr?: (ctx: FactorExprContext) => void;

	/**
	 * Enter a parse tree produced by the `TermExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterTermExpr?: (ctx: TermExprContext) => void;
	/**
	 * Exit a parse tree produced by the `TermExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitTermExpr?: (ctx: TermExprContext) => void;

	/**
	 * Enter a parse tree produced by the `ComparisonExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterComparisonExpr?: (ctx: ComparisonExprContext) => void;
	/**
	 * Exit a parse tree produced by the `ComparisonExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitComparisonExpr?: (ctx: ComparisonExprContext) => void;

	/**
	 * Enter a parse tree produced by the `ConjunctionExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterConjunctionExpr?: (ctx: ConjunctionExprContext) => void;
	/**
	 * Exit a parse tree produced by the `ConjunctionExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitConjunctionExpr?: (ctx: ConjunctionExprContext) => void;

	/**
	 * Enter a parse tree produced by the `DisjunctionExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterDisjunctionExpr?: (ctx: DisjunctionExprContext) => void;
	/**
	 * Exit a parse tree produced by the `DisjunctionExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitDisjunctionExpr?: (ctx: DisjunctionExprContext) => void;

	/**
	 * Enter a parse tree produced by the `ConcatExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterConcatExpr?: (ctx: ConcatExprContext) => void;
	/**
	 * Exit a parse tree produced by the `ConcatExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitConcatExpr?: (ctx: ConcatExprContext) => void;

	/**
	 * Enter a parse tree produced by the `IfElseExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterIfElseExpr?: (ctx: IfElseExprContext) => void;
	/**
	 * Exit a parse tree produced by the `IfElseExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitIfElseExpr?: (ctx: IfElseExprContext) => void;

	/**
	 * Enter a parse tree produced by the `MatchExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterMatchExpr?: (ctx: MatchExprContext) => void;
	/**
	 * Exit a parse tree produced by the `MatchExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitMatchExpr?: (ctx: MatchExprContext) => void;

	/**
	 * Enter a parse tree produced by the `FunExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterFunExpr?: (ctx: FunExprContext) => void;
	/**
	 * Exit a parse tree produced by the `FunExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitFunExpr?: (ctx: FunExprContext) => void;

	/**
	 * Enter a parse tree produced by the `StatementBlockExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterStatementBlockExpr?: (ctx: StatementBlockExprContext) => void;
	/**
	 * Exit a parse tree produced by the `StatementBlockExpr`
	 * labeled alternative in `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitStatementBlockExpr?: (ctx: StatementBlockExprContext) => void;

	/**
	 * Enter a parse tree produced by the `UnitType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterUnitType?: (ctx: UnitTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `UnitType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitUnitType?: (ctx: UnitTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `IntType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterIntType?: (ctx: IntTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `IntType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitIntType?: (ctx: IntTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `StrType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterStrType?: (ctx: StrTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `StrType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitStrType?: (ctx: StrTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `BoolType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterBoolType?: (ctx: BoolTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `BoolType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitBoolType?: (ctx: BoolTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `SingleIdentifierType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterSingleIdentifierType?: (ctx: SingleIdentifierTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `SingleIdentifierType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitSingleIdentifierType?: (ctx: SingleIdentifierTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `TupleType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterTupleType?: (ctx: TupleTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `TupleType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitTupleType?: (ctx: TupleTypeContext) => void;

	/**
	 * Enter a parse tree produced by the `FunctionType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterFunctionType?: (ctx: FunctionTypeContext) => void;
	/**
	 * Exit a parse tree produced by the `FunctionType`
	 * labeled alternative in `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitFunctionType?: (ctx: FunctionTypeContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.module`.
	 * @param ctx the parse tree
	 */
	enterModule?: (ctx: ModuleContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.module`.
	 * @param ctx the parse tree
	 */
	exitModule?: (ctx: ModuleContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.importModuleMembers`.
	 * @param ctx the parse tree
	 */
	enterImportModuleMembers?: (ctx: ImportModuleMembersContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.importModuleMembers`.
	 * @param ctx the parse tree
	 */
	exitImportModuleMembers?: (ctx: ImportModuleMembersContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.moduleReference`.
	 * @param ctx the parse tree
	 */
	enterModuleReference?: (ctx: ModuleReferenceContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.moduleReference`.
	 * @param ctx the parse tree
	 */
	exitModuleReference?: (ctx: ModuleReferenceContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.moduleMember`.
	 * @param ctx the parse tree
	 */
	enterModuleMember?: (ctx: ModuleMemberContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.moduleMember`.
	 * @param ctx the parse tree
	 */
	exitModuleMember?: (ctx: ModuleMemberContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.clazz`.
	 * @param ctx the parse tree
	 */
	enterClazz?: (ctx: ClazzContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.clazz`.
	 * @param ctx the parse tree
	 */
	exitClazz?: (ctx: ClazzContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.interfaze`.
	 * @param ctx the parse tree
	 */
	enterInterfaze?: (ctx: InterfazeContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.interfaze`.
	 * @param ctx the parse tree
	 */
	exitInterfaze?: (ctx: InterfazeContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.classHeaderDeclaration`.
	 * @param ctx the parse tree
	 */
	enterClassHeaderDeclaration?: (ctx: ClassHeaderDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.classHeaderDeclaration`.
	 * @param ctx the parse tree
	 */
	exitClassHeaderDeclaration?: (ctx: ClassHeaderDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.classMemberDefinition`.
	 * @param ctx the parse tree
	 */
	enterClassMemberDefinition?: (ctx: ClassMemberDefinitionContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.classMemberDefinition`.
	 * @param ctx the parse tree
	 */
	exitClassMemberDefinition?: (ctx: ClassMemberDefinitionContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.classMemberDeclaration`.
	 * @param ctx the parse tree
	 */
	enterClassMemberDeclaration?: (ctx: ClassMemberDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.classMemberDeclaration`.
	 * @param ctx the parse tree
	 */
	exitClassMemberDeclaration?: (ctx: ClassMemberDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.typeParametersDeclaration`.
	 * @param ctx the parse tree
	 */
	enterTypeParametersDeclaration?: (ctx: TypeParametersDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.typeParametersDeclaration`.
	 * @param ctx the parse tree
	 */
	exitTypeParametersDeclaration?: (ctx: TypeParametersDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.typeDeclaration`.
	 * @param ctx the parse tree
	 */
	enterTypeDeclaration?: (ctx: TypeDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.typeDeclaration`.
	 * @param ctx the parse tree
	 */
	exitTypeDeclaration?: (ctx: TypeDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.objectTypeFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	enterObjectTypeFieldDeclaration?: (ctx: ObjectTypeFieldDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.objectTypeFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	exitObjectTypeFieldDeclaration?: (ctx: ObjectTypeFieldDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.variantTypeConstructorDeclaration`.
	 * @param ctx the parse tree
	 */
	enterVariantTypeConstructorDeclaration?: (ctx: VariantTypeConstructorDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.variantTypeConstructorDeclaration`.
	 * @param ctx the parse tree
	 */
	exitVariantTypeConstructorDeclaration?: (ctx: VariantTypeConstructorDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	enterTypeExpr?: (ctx: TypeExprContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.typeExpr`.
	 * @param ctx the parse tree
	 */
	exitTypeExpr?: (ctx: TypeExprContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.typeParameters`.
	 * @param ctx the parse tree
	 */
	enterTypeParameters?: (ctx: TypeParametersContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.typeParameters`.
	 * @param ctx the parse tree
	 */
	exitTypeParameters?: (ctx: TypeParametersContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.annotatedVariable`.
	 * @param ctx the parse tree
	 */
	enterAnnotatedVariable?: (ctx: AnnotatedVariableContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.annotatedVariable`.
	 * @param ctx the parse tree
	 */
	exitAnnotatedVariable?: (ctx: AnnotatedVariableContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.optionallyAnnotatedParameter`.
	 * @param ctx the parse tree
	 */
	enterOptionallyAnnotatedParameter?: (ctx: OptionallyAnnotatedParameterContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.optionallyAnnotatedParameter`.
	 * @param ctx the parse tree
	 */
	exitOptionallyAnnotatedParameter?: (ctx: OptionallyAnnotatedParameterContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.typeAnnotation`.
	 * @param ctx the parse tree
	 */
	enterTypeAnnotation?: (ctx: TypeAnnotationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.typeAnnotation`.
	 * @param ctx the parse tree
	 */
	exitTypeAnnotation?: (ctx: TypeAnnotationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.patternToExpr`.
	 * @param ctx the parse tree
	 */
	enterPatternToExpr?: (ctx: PatternToExprContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.patternToExpr`.
	 * @param ctx the parse tree
	 */
	exitPatternToExpr?: (ctx: PatternToExprContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.statementBlock`.
	 * @param ctx the parse tree
	 */
	enterStatementBlock?: (ctx: StatementBlockContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.statementBlock`.
	 * @param ctx the parse tree
	 */
	exitStatementBlock?: (ctx: StatementBlockContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.statement`.
	 * @param ctx the parse tree
	 */
	enterStatement?: (ctx: StatementContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.statement`.
	 * @param ctx the parse tree
	 */
	exitStatement?: (ctx: StatementContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	enterExpression?: (ctx: ExpressionContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.expression`.
	 * @param ctx the parse tree
	 */
	exitExpression?: (ctx: ExpressionContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.objectFieldDeclarations`.
	 * @param ctx the parse tree
	 */
	enterObjectFieldDeclarations?: (ctx: ObjectFieldDeclarationsContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.objectFieldDeclarations`.
	 * @param ctx the parse tree
	 */
	exitObjectFieldDeclarations?: (ctx: ObjectFieldDeclarationsContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.objectFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	enterObjectFieldDeclaration?: (ctx: ObjectFieldDeclarationContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.objectFieldDeclaration`.
	 * @param ctx the parse tree
	 */
	exitObjectFieldDeclaration?: (ctx: ObjectFieldDeclarationContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.functionArguments`.
	 * @param ctx the parse tree
	 */
	enterFunctionArguments?: (ctx: FunctionArgumentsContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.functionArguments`.
	 * @param ctx the parse tree
	 */
	exitFunctionArguments?: (ctx: FunctionArgumentsContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	enterPattern?: (ctx: PatternContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.pattern`.
	 * @param ctx the parse tree
	 */
	exitPattern?: (ctx: PatternContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.varOrWildCard`.
	 * @param ctx the parse tree
	 */
	enterVarOrWildCard?: (ctx: VarOrWildCardContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.varOrWildCard`.
	 * @param ctx the parse tree
	 */
	exitVarOrWildCard?: (ctx: VarOrWildCardContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.varOrRenamedVar`.
	 * @param ctx the parse tree
	 */
	enterVarOrRenamedVar?: (ctx: VarOrRenamedVarContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.varOrRenamedVar`.
	 * @param ctx the parse tree
	 */
	exitVarOrRenamedVar?: (ctx: VarOrRenamedVarContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.factorOperator`.
	 * @param ctx the parse tree
	 */
	enterFactorOperator?: (ctx: FactorOperatorContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.factorOperator`.
	 * @param ctx the parse tree
	 */
	exitFactorOperator?: (ctx: FactorOperatorContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.termOperator`.
	 * @param ctx the parse tree
	 */
	enterTermOperator?: (ctx: TermOperatorContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.termOperator`.
	 * @param ctx the parse tree
	 */
	exitTermOperator?: (ctx: TermOperatorContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.comparisonOperator`.
	 * @param ctx the parse tree
	 */
	enterComparisonOperator?: (ctx: ComparisonOperatorContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.comparisonOperator`.
	 * @param ctx the parse tree
	 */
	exitComparisonOperator?: (ctx: ComparisonOperatorContext) => void;

	/**
	 * Enter a parse tree produced by `PLParser.literal`.
	 * @param ctx the parse tree
	 */
	enterLiteral?: (ctx: LiteralContext) => void;
	/**
	 * Exit a parse tree produced by `PLParser.literal`.
	 * @param ctx the parse tree
	 */
	exitLiteral?: (ctx: LiteralContext) => void;
}

