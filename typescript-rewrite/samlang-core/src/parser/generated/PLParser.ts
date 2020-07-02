// Generated from PL.g4 by ANTLR 4.7.3-SNAPSHOT


import { ATN } from "antlr4ts/atn/ATN";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException";
import { NotNull } from "antlr4ts/Decorators";
import { NoViableAltException } from "antlr4ts/NoViableAltException";
import { Override } from "antlr4ts/Decorators";
import { Parser } from "antlr4ts/Parser";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { ParserATNSimulator } from "antlr4ts/atn/ParserATNSimulator";
import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";
import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";
import { RecognitionException } from "antlr4ts/RecognitionException";
import { RuleContext } from "antlr4ts/RuleContext";
//import { RuleVersion } from "antlr4ts/RuleVersion";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Token } from "antlr4ts/Token";
import { TokenStream } from "antlr4ts/TokenStream";
import { Vocabulary } from "antlr4ts/Vocabulary";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl";

import * as Utils from "antlr4ts/misc/Utils";

import { PLVisitor } from "./PLVisitor";


export class PLParser extends Parser {
	public static readonly IMPORT = 1;
	public static readonly FROM = 2;
	public static readonly CLASS = 3;
	public static readonly VAL = 4;
	public static readonly FUNCTION = 5;
	public static readonly METHOD = 6;
	public static readonly AS = 7;
	public static readonly PRIVATE = 8;
	public static readonly PROTECTED = 9;
	public static readonly INTERNAL = 10;
	public static readonly PUBLIC = 11;
	public static readonly IF = 12;
	public static readonly THEN = 13;
	public static readonly ELSE = 14;
	public static readonly MATCH = 15;
	public static readonly PANIC = 16;
	public static readonly RETURN = 17;
	public static readonly INT = 18;
	public static readonly STRING = 19;
	public static readonly BOOL = 20;
	public static readonly UNIT = 21;
	public static readonly TRUE = 22;
	public static readonly FALSE = 23;
	public static readonly THIS = 24;
	public static readonly WILDCARD = 25;
	public static readonly STRING2INT = 26;
	public static readonly INT2STRING = 27;
	public static readonly PRINTLN = 28;
	public static readonly SELF = 29;
	public static readonly CONST = 30;
	public static readonly LET = 31;
	public static readonly VAR = 32;
	public static readonly TYPE = 33;
	public static readonly INTERFACE = 34;
	public static readonly FUNCTOR = 35;
	public static readonly EXTENDS = 36;
	public static readonly IMPLEMENTS = 37;
	public static readonly EXPORT = 38;
	public static readonly ASSERT = 39;
	public static readonly LPAREN = 40;
	public static readonly RPAREN = 41;
	public static readonly LBRACE = 42;
	public static readonly RBRACE = 43;
	public static readonly LBRACKET = 44;
	public static readonly RBRACKET = 45;
	public static readonly QUESTION = 46;
	public static readonly SEMICOLON = 47;
	public static readonly COLON = 48;
	public static readonly COLONCOLON = 49;
	public static readonly COMMA = 50;
	public static readonly DOT = 51;
	public static readonly BAR = 52;
	public static readonly ARROW = 53;
	public static readonly ASSIGN = 54;
	public static readonly NOT = 55;
	public static readonly MUL = 56;
	public static readonly DIV = 57;
	public static readonly MOD = 58;
	public static readonly PLUS = 59;
	public static readonly MINUS = 60;
	public static readonly STRUCT_EQ = 61;
	public static readonly LT = 62;
	public static readonly LE = 63;
	public static readonly GT = 64;
	public static readonly GE = 65;
	public static readonly STRUCT_NE = 66;
	public static readonly AND = 67;
	public static readonly OR = 68;
	public static readonly SPREAD = 69;
	public static readonly LowerId = 70;
	public static readonly UpperId = 71;
	public static readonly MinInt = 72;
	public static readonly IntLiteral = 73;
	public static readonly StrLiteral = 74;
	public static readonly HexLiteral = 75;
	public static readonly DecimalLiteral = 76;
	public static readonly OctalLiteral = 77;
	public static readonly COMMENT = 78;
	public static readonly WS = 79;
	public static readonly LINE_COMMENT = 80;
	public static readonly RULE_module = 0;
	public static readonly RULE_importModuleMembers = 1;
	public static readonly RULE_moduleReference = 2;
	public static readonly RULE_moduleMember = 3;
	public static readonly RULE_clazz = 4;
	public static readonly RULE_interfaze = 5;
	public static readonly RULE_classHeaderDeclaration = 6;
	public static readonly RULE_classMemberDefinition = 7;
	public static readonly RULE_classMemberDeclaration = 8;
	public static readonly RULE_typeParametersDeclaration = 9;
	public static readonly RULE_typeDeclaration = 10;
	public static readonly RULE_objectTypeFieldDeclaration = 11;
	public static readonly RULE_variantTypeConstructorDeclaration = 12;
	public static readonly RULE_typeExpr = 13;
	public static readonly RULE_typeParameters = 14;
	public static readonly RULE_annotatedVariable = 15;
	public static readonly RULE_optionallyAnnotatedParameter = 16;
	public static readonly RULE_typeAnnotation = 17;
	public static readonly RULE_patternToExpr = 18;
	public static readonly RULE_statementBlock = 19;
	public static readonly RULE_statement = 20;
	public static readonly RULE_expression = 21;
	public static readonly RULE_objectFieldDeclarations = 22;
	public static readonly RULE_objectFieldDeclaration = 23;
	public static readonly RULE_functionArguments = 24;
	public static readonly RULE_pattern = 25;
	public static readonly RULE_varOrWildCard = 26;
	public static readonly RULE_varOrRenamedVar = 27;
	public static readonly RULE_factorOperator = 28;
	public static readonly RULE_termOperator = 29;
	public static readonly RULE_comparisonOperator = 30;
	public static readonly RULE_literal = 31;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"module", "importModuleMembers", "moduleReference", "moduleMember", "clazz", 
		"interfaze", "classHeaderDeclaration", "classMemberDefinition", "classMemberDeclaration", 
		"typeParametersDeclaration", "typeDeclaration", "objectTypeFieldDeclaration", 
		"variantTypeConstructorDeclaration", "typeExpr", "typeParameters", "annotatedVariable", 
		"optionallyAnnotatedParameter", "typeAnnotation", "patternToExpr", "statementBlock", 
		"statement", "expression", "objectFieldDeclarations", "objectFieldDeclaration", 
		"functionArguments", "pattern", "varOrWildCard", "varOrRenamedVar", "factorOperator", 
		"termOperator", "comparisonOperator", "literal",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'import'", "'from'", "'class'", "'val'", "'function'", "'method'", 
		"'as'", "'private'", "'protected'", "'internal'", "'public'", "'if'", 
		"'then'", "'else'", "'match'", "'panic'", "'return'", "'int'", "'string'", 
		"'bool'", "'unit'", "'true'", "'false'", "'this'", "'_'", "'stringToInt'", 
		"'intToString'", "'println'", "'self'", "'const'", "'let'", "'var'", "'type'", 
		"'interface'", "'functor'", "'extends'", "'implements'", "'export'", "'assert'", 
		"'('", "')'", "'{'", "'}'", "'['", "']'", "'?'", "';'", "':'", "'::'", 
		"','", "'.'", "'|'", "'->'", "'='", "'!'", "'*'", "'/'", "'%'", "'+'", 
		"'-'", "'=='", "'<'", "'<='", "'>'", "'>='", "'!='", "'&&'", "'||'", "'...'", 
		undefined, undefined, "'-9223372036854775808'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "IMPORT", "FROM", "CLASS", "VAL", "FUNCTION", "METHOD", "AS", 
		"PRIVATE", "PROTECTED", "INTERNAL", "PUBLIC", "IF", "THEN", "ELSE", "MATCH", 
		"PANIC", "RETURN", "INT", "STRING", "BOOL", "UNIT", "TRUE", "FALSE", "THIS", 
		"WILDCARD", "STRING2INT", "INT2STRING", "PRINTLN", "SELF", "CONST", "LET", 
		"VAR", "TYPE", "INTERFACE", "FUNCTOR", "EXTENDS", "IMPLEMENTS", "EXPORT", 
		"ASSERT", "LPAREN", "RPAREN", "LBRACE", "RBRACE", "LBRACKET", "RBRACKET", 
		"QUESTION", "SEMICOLON", "COLON", "COLONCOLON", "COMMA", "DOT", "BAR", 
		"ARROW", "ASSIGN", "NOT", "MUL", "DIV", "MOD", "PLUS", "MINUS", "STRUCT_EQ", 
		"LT", "LE", "GT", "GE", "STRUCT_NE", "AND", "OR", "SPREAD", "LowerId", 
		"UpperId", "MinInt", "IntLiteral", "StrLiteral", "HexLiteral", "DecimalLiteral", 
		"OctalLiteral", "COMMENT", "WS", "LINE_COMMENT",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(PLParser._LITERAL_NAMES, PLParser._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return PLParser.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace

	// @Override
	public get grammarFileName(): string { return "PL.g4"; }

	// @Override
	public get ruleNames(): string[] { return PLParser.ruleNames; }

	// @Override
	public get serializedATN(): string { return PLParser._serializedATN; }

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(PLParser._ATN, this);
	}
	// @RuleVersion(0)
	public module(): ModuleContext {
		let _localctx: ModuleContext = new ModuleContext(this._ctx, this.state);
		this.enterRule(_localctx, 0, PLParser.RULE_module);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 67;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === PLParser.IMPORT) {
				{
				{
				this.state = 64;
				this.importModuleMembers();
				}
				}
				this.state = 69;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 73;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 3)) & ~0x1F) === 0 && ((1 << (_la - 3)) & ((1 << (PLParser.CLASS - 3)) | (1 << (PLParser.PRIVATE - 3)) | (1 << (PLParser.INTERFACE - 3)))) !== 0)) {
				{
				{
				this.state = 70;
				this.moduleMember();
				}
				}
				this.state = 75;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 76;
			this.match(PLParser.EOF);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public importModuleMembers(): ImportModuleMembersContext {
		let _localctx: ImportModuleMembersContext = new ImportModuleMembersContext(this._ctx, this.state);
		this.enterRule(_localctx, 2, PLParser.RULE_importModuleMembers);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 78;
			this.match(PLParser.IMPORT);
			this.state = 79;
			this.match(PLParser.LBRACE);
			this.state = 80;
			this.match(PLParser.UpperId);
			this.state = 85;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === PLParser.COMMA) {
				{
				{
				this.state = 81;
				this.match(PLParser.COMMA);
				this.state = 82;
				this.match(PLParser.UpperId);
				}
				}
				this.state = 87;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 88;
			this.match(PLParser.RBRACE);
			this.state = 89;
			this.match(PLParser.FROM);
			this.state = 90;
			this.moduleReference();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public moduleReference(): ModuleReferenceContext {
		let _localctx: ModuleReferenceContext = new ModuleReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 4, PLParser.RULE_moduleReference);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 92;
			this.match(PLParser.UpperId);
			this.state = 97;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === PLParser.DOT) {
				{
				{
				this.state = 93;
				this.match(PLParser.DOT);
				this.state = 94;
				this.match(PLParser.UpperId);
				}
				}
				this.state = 99;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public moduleMember(): ModuleMemberContext {
		let _localctx: ModuleMemberContext = new ModuleMemberContext(this._ctx, this.state);
		this.enterRule(_localctx, 6, PLParser.RULE_moduleMember);
		try {
			this.state = 102;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 4, this._ctx) ) {
			case 1:
				_localctx = new ClassAsModuleMemberContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 100;
				this.clazz();
				}
				break;

			case 2:
				_localctx = new InterfaceAsModuleMemberContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 101;
				this.interfaze();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public clazz(): ClazzContext {
		let _localctx: ClazzContext = new ClazzContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, PLParser.RULE_clazz);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 104;
			this.classHeaderDeclaration();
			this.state = 105;
			this.match(PLParser.LBRACE);
			this.state = 109;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << PLParser.FUNCTION) | (1 << PLParser.METHOD) | (1 << PLParser.PRIVATE))) !== 0)) {
				{
				{
				this.state = 106;
				this.classMemberDefinition();
				}
				}
				this.state = 111;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 112;
			this.match(PLParser.RBRACE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public interfaze(): InterfazeContext {
		let _localctx: InterfazeContext = new InterfazeContext(this._ctx, this.state);
		this.enterRule(_localctx, 10, PLParser.RULE_interfaze);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 115;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.PRIVATE) {
				{
				this.state = 114;
				this.match(PLParser.PRIVATE);
				}
			}

			this.state = 117;
			this.match(PLParser.INTERFACE);
			this.state = 118;
			this.match(PLParser.UpperId);
			this.state = 120;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.LT) {
				{
				this.state = 119;
				this.typeParametersDeclaration();
				}
			}

			this.state = 122;
			this.match(PLParser.LBRACE);
			this.state = 126;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << PLParser.FUNCTION) | (1 << PLParser.METHOD) | (1 << PLParser.PRIVATE))) !== 0)) {
				{
				{
				this.state = 123;
				this.classMemberDeclaration();
				}
				}
				this.state = 128;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 129;
			this.match(PLParser.RBRACE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public classHeaderDeclaration(): ClassHeaderDeclarationContext {
		let _localctx: ClassHeaderDeclarationContext = new ClassHeaderDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, PLParser.RULE_classHeaderDeclaration);
		let _la: number;
		try {
			this.state = 148;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 12, this._ctx) ) {
			case 1:
				_localctx = new ClassHeaderContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 132;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.PRIVATE) {
					{
					this.state = 131;
					this.match(PLParser.PRIVATE);
					}
				}

				this.state = 134;
				this.match(PLParser.CLASS);
				this.state = 135;
				this.match(PLParser.UpperId);
				this.state = 137;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.LT) {
					{
					this.state = 136;
					this.typeParametersDeclaration();
					}
				}

				this.state = 139;
				this.match(PLParser.LPAREN);
				this.state = 140;
				this.typeDeclaration();
				this.state = 141;
				this.match(PLParser.RPAREN);
				}
				break;

			case 2:
				_localctx = new UtilClassHeaderContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 144;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.PRIVATE) {
					{
					this.state = 143;
					this.match(PLParser.PRIVATE);
					}
				}

				this.state = 146;
				this.match(PLParser.CLASS);
				this.state = 147;
				this.match(PLParser.UpperId);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public classMemberDefinition(): ClassMemberDefinitionContext {
		let _localctx: ClassMemberDefinitionContext = new ClassMemberDefinitionContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, PLParser.RULE_classMemberDefinition);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 151;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.PRIVATE) {
				{
				this.state = 150;
				this.match(PLParser.PRIVATE);
				}
			}

			this.state = 153;
			_la = this._input.LA(1);
			if (!(_la === PLParser.FUNCTION || _la === PLParser.METHOD)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 155;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.LT) {
				{
				this.state = 154;
				this.typeParametersDeclaration();
				}
			}

			this.state = 157;
			this.match(PLParser.LowerId);
			this.state = 158;
			this.match(PLParser.LPAREN);
			this.state = 170;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.LowerId) {
				{
				this.state = 159;
				this.annotatedVariable();
				this.state = 164;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 160;
						this.match(PLParser.COMMA);
						this.state = 161;
						this.annotatedVariable();
						}
						}
					}
					this.state = 166;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
				}
				this.state = 168;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 167;
					this.match(PLParser.COMMA);
					}
				}

				}
			}

			this.state = 172;
			this.match(PLParser.RPAREN);
			this.state = 175;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.COLON) {
				{
				this.state = 173;
				this.match(PLParser.COLON);
				this.state = 174;
				this.typeExpr();
				}
			}

			this.state = 177;
			this.match(PLParser.ASSIGN);
			this.state = 178;
			this.expression(0);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public classMemberDeclaration(): ClassMemberDeclarationContext {
		let _localctx: ClassMemberDeclarationContext = new ClassMemberDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, PLParser.RULE_classMemberDeclaration);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 181;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.PRIVATE) {
				{
				this.state = 180;
				this.match(PLParser.PRIVATE);
				}
			}

			this.state = 183;
			_la = this._input.LA(1);
			if (!(_la === PLParser.FUNCTION || _la === PLParser.METHOD)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 185;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.LT) {
				{
				this.state = 184;
				this.typeParametersDeclaration();
				}
			}

			this.state = 187;
			this.match(PLParser.LowerId);
			this.state = 188;
			this.match(PLParser.LPAREN);
			this.state = 200;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.LowerId) {
				{
				this.state = 189;
				this.annotatedVariable();
				this.state = 194;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 21, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 190;
						this.match(PLParser.COMMA);
						this.state = 191;
						this.annotatedVariable();
						}
						}
					}
					this.state = 196;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 21, this._ctx);
				}
				this.state = 198;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 197;
					this.match(PLParser.COMMA);
					}
				}

				}
			}

			this.state = 202;
			this.match(PLParser.RPAREN);
			this.state = 205;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.COLON) {
				{
				this.state = 203;
				this.match(PLParser.COLON);
				this.state = 204;
				this.typeExpr();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeParametersDeclaration(): TypeParametersDeclarationContext {
		let _localctx: TypeParametersDeclarationContext = new TypeParametersDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, PLParser.RULE_typeParametersDeclaration);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 207;
			this.match(PLParser.LT);
			this.state = 208;
			this.match(PLParser.UpperId);
			this.state = 213;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === PLParser.COMMA) {
				{
				{
				this.state = 209;
				this.match(PLParser.COMMA);
				this.state = 210;
				this.match(PLParser.UpperId);
				}
				}
				this.state = 215;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 216;
			this.match(PLParser.GT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeDeclaration(): TypeDeclarationContext {
		let _localctx: TypeDeclarationContext = new TypeDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, PLParser.RULE_typeDeclaration);
		let _la: number;
		try {
			let _alt: number;
			this.state = 239;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case PLParser.VAL:
			case PLParser.PRIVATE:
				_localctx = new ObjTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 218;
				this.objectTypeFieldDeclaration();
				this.state = 223;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 26, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 219;
						this.match(PLParser.COMMA);
						this.state = 220;
						this.objectTypeFieldDeclaration();
						}
						}
					}
					this.state = 225;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 26, this._ctx);
				}
				this.state = 227;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 226;
					this.match(PLParser.COMMA);
					}
				}

				}
				break;
			case PLParser.UpperId:
				_localctx = new VariantTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 229;
				this.variantTypeConstructorDeclaration();
				this.state = 232;
				this._errHandler.sync(this);
				_alt = 1;
				do {
					switch (_alt) {
					case 1:
						{
						{
						this.state = 230;
						this.match(PLParser.COMMA);
						this.state = 231;
						this.variantTypeConstructorDeclaration();
						}
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					this.state = 234;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 28, this._ctx);
				} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
				this.state = 237;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 236;
					this.match(PLParser.COMMA);
					}
				}

				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public objectTypeFieldDeclaration(): ObjectTypeFieldDeclarationContext {
		let _localctx: ObjectTypeFieldDeclarationContext = new ObjectTypeFieldDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, PLParser.RULE_objectTypeFieldDeclaration);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 242;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.PRIVATE) {
				{
				this.state = 241;
				this.match(PLParser.PRIVATE);
				}
			}

			this.state = 244;
			this.match(PLParser.VAL);
			this.state = 245;
			this.match(PLParser.LowerId);
			this.state = 246;
			this.typeAnnotation();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public variantTypeConstructorDeclaration(): VariantTypeConstructorDeclarationContext {
		let _localctx: VariantTypeConstructorDeclarationContext = new VariantTypeConstructorDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, PLParser.RULE_variantTypeConstructorDeclaration);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 248;
			this.match(PLParser.UpperId);
			this.state = 249;
			this.match(PLParser.LPAREN);
			this.state = 250;
			this.typeExpr();
			this.state = 251;
			this.match(PLParser.RPAREN);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeExpr(): TypeExprContext {
		let _localctx: TypeExprContext = new TypeExprContext(this._ctx, this.state);
		this.enterRule(_localctx, 26, PLParser.RULE_typeExpr);
		let _la: number;
		try {
			let _alt: number;
			this.state = 287;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case PLParser.UNIT:
				_localctx = new UnitTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 253;
				this.match(PLParser.UNIT);
				}
				break;
			case PLParser.INT:
				_localctx = new IntTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 254;
				this.match(PLParser.INT);
				}
				break;
			case PLParser.STRING:
				_localctx = new StrTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 255;
				this.match(PLParser.STRING);
				}
				break;
			case PLParser.BOOL:
				_localctx = new BoolTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 256;
				this.match(PLParser.BOOL);
				}
				break;
			case PLParser.UpperId:
				_localctx = new SingleIdentifierTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 257;
				this.match(PLParser.UpperId);
				this.state = 259;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.LT) {
					{
					this.state = 258;
					this.typeParameters();
					}
				}

				}
				break;
			case PLParser.LBRACKET:
				_localctx = new TupleTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 261;
				this.match(PLParser.LBRACKET);
				this.state = 262;
				this.typeExpr();
				this.state = 265;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 263;
					this.match(PLParser.MUL);
					this.state = 264;
					this.typeExpr();
					}
					}
					this.state = 267;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === PLParser.MUL);
				this.state = 269;
				this.match(PLParser.RBRACKET);
				}
				break;
			case PLParser.LPAREN:
				_localctx = new FunctionTypeContext(_localctx);
				this.enterOuterAlt(_localctx, 7);
				{
				this.state = 271;
				this.match(PLParser.LPAREN);
				this.state = 272;
				this.typeExpr();
				this.state = 277;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 34, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 273;
						this.match(PLParser.COMMA);
						this.state = 274;
						this.typeExpr();
						}
						}
					}
					this.state = 279;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 34, this._ctx);
				}
				this.state = 281;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 280;
					this.match(PLParser.COMMA);
					}
				}

				this.state = 283;
				this.match(PLParser.RPAREN);
				this.state = 284;
				this.match(PLParser.ARROW);
				this.state = 285;
				this.typeExpr();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeParameters(): TypeParametersContext {
		let _localctx: TypeParametersContext = new TypeParametersContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, PLParser.RULE_typeParameters);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 289;
			this.match(PLParser.LT);
			this.state = 290;
			this.typeExpr();
			this.state = 295;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === PLParser.COMMA) {
				{
				{
				this.state = 291;
				this.match(PLParser.COMMA);
				this.state = 292;
				this.typeExpr();
				}
				}
				this.state = 297;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 298;
			this.match(PLParser.GT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public annotatedVariable(): AnnotatedVariableContext {
		let _localctx: AnnotatedVariableContext = new AnnotatedVariableContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, PLParser.RULE_annotatedVariable);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 300;
			this.match(PLParser.LowerId);
			this.state = 301;
			this.typeAnnotation();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public optionallyAnnotatedParameter(): OptionallyAnnotatedParameterContext {
		let _localctx: OptionallyAnnotatedParameterContext = new OptionallyAnnotatedParameterContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, PLParser.RULE_optionallyAnnotatedParameter);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 303;
			this.match(PLParser.LowerId);
			this.state = 305;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.COLON) {
				{
				this.state = 304;
				this.typeAnnotation();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeAnnotation(): TypeAnnotationContext {
		let _localctx: TypeAnnotationContext = new TypeAnnotationContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, PLParser.RULE_typeAnnotation);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 307;
			this.match(PLParser.COLON);
			this.state = 308;
			this.typeExpr();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public patternToExpr(): PatternToExprContext {
		let _localctx: PatternToExprContext = new PatternToExprContext(this._ctx, this.state);
		this.enterRule(_localctx, 36, PLParser.RULE_patternToExpr);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 310;
			this.match(PLParser.BAR);
			{
			this.state = 311;
			this.match(PLParser.UpperId);
			this.state = 312;
			this.varOrWildCard();
			}
			this.state = 314;
			this.match(PLParser.ARROW);
			this.state = 315;
			this.expression(0);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public statementBlock(): StatementBlockContext {
		let _localctx: StatementBlockContext = new StatementBlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 38, PLParser.RULE_statementBlock);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 317;
			this.match(PLParser.LBRACE);
			this.state = 321;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === PLParser.VAL) {
				{
				{
				this.state = 318;
				this.statement();
				}
				}
				this.state = 323;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 325;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 12)) & ~0x1F) === 0 && ((1 << (_la - 12)) & ((1 << (PLParser.IF - 12)) | (1 << (PLParser.MATCH - 12)) | (1 << (PLParser.PANIC - 12)) | (1 << (PLParser.TRUE - 12)) | (1 << (PLParser.FALSE - 12)) | (1 << (PLParser.THIS - 12)) | (1 << (PLParser.STRING2INT - 12)) | (1 << (PLParser.INT2STRING - 12)) | (1 << (PLParser.PRINTLN - 12)) | (1 << (PLParser.LPAREN - 12)) | (1 << (PLParser.LBRACE - 12)))) !== 0) || ((((_la - 44)) & ~0x1F) === 0 && ((1 << (_la - 44)) & ((1 << (PLParser.LBRACKET - 44)) | (1 << (PLParser.NOT - 44)) | (1 << (PLParser.MINUS - 44)) | (1 << (PLParser.LowerId - 44)) | (1 << (PLParser.UpperId - 44)) | (1 << (PLParser.MinInt - 44)) | (1 << (PLParser.IntLiteral - 44)) | (1 << (PLParser.StrLiteral - 44)))) !== 0)) {
				{
				this.state = 324;
				this.expression(0);
				}
			}

			this.state = 327;
			this.match(PLParser.RBRACE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public statement(): StatementContext {
		let _localctx: StatementContext = new StatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 40, PLParser.RULE_statement);
		let _la: number;
		try {
			_localctx = new ValStatementContext(_localctx);
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 329;
			this.match(PLParser.VAL);
			this.state = 330;
			this.pattern();
			this.state = 332;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.COLON) {
				{
				this.state = 331;
				this.typeAnnotation();
				}
			}

			this.state = 334;
			this.match(PLParser.ASSIGN);
			this.state = 335;
			this.expression(0);
			this.state = 337;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.SEMICOLON) {
				{
				this.state = 336;
				this.match(PLParser.SEMICOLON);
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	public expression(): ExpressionContext;
	public expression(_p: number): ExpressionContext;
	// @RuleVersion(0)
	public expression(_p?: number): ExpressionContext {
		if (_p === undefined) {
			_p = 0;
		}

		let _parentctx: ParserRuleContext = this._ctx;
		let _parentState: number = this.state;
		let _localctx: ExpressionContext = new ExpressionContext(this._ctx, _parentState);
		let _prevctx: ExpressionContext = _localctx;
		let _startState: number = 42;
		this.enterRecursionRule(_localctx, 42, PLParser.RULE_expression, _p);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 432;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 48, this._ctx) ) {
			case 1:
				{
				_localctx = new NestedExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;

				this.state = 340;
				this.match(PLParser.LPAREN);
				this.state = 341;
				this.expression(0);
				this.state = 342;
				this.match(PLParser.RPAREN);
				}
				break;

			case 2:
				{
				_localctx = new LiteralExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 344;
				this.literal();
				}
				break;

			case 3:
				{
				_localctx = new ThisExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 345;
				this.match(PLParser.THIS);
				}
				break;

			case 4:
				{
				_localctx = new VariableExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 346;
				this.match(PLParser.LowerId);
				}
				break;

			case 5:
				{
				_localctx = new ClassMemberExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 347;
				this.match(PLParser.UpperId);
				this.state = 348;
				this.match(PLParser.DOT);
				this.state = 349;
				this.match(PLParser.LowerId);
				}
				break;

			case 6:
				{
				_localctx = new TupleConstructorContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 350;
				this.match(PLParser.LBRACKET);
				this.state = 351;
				this.expression(0);
				this.state = 354;
				this._errHandler.sync(this);
				_alt = 1;
				do {
					switch (_alt) {
					case 1:
						{
						{
						this.state = 352;
						this.match(PLParser.COMMA);
						this.state = 353;
						this.expression(0);
						}
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					this.state = 356;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 43, this._ctx);
				} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
				this.state = 359;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 358;
					this.match(PLParser.COMMA);
					}
				}

				this.state = 361;
				this.match(PLParser.RBRACKET);
				}
				break;

			case 7:
				{
				_localctx = new ObjConstructorContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 363;
				this.match(PLParser.LBRACE);
				this.state = 364;
				this.objectFieldDeclarations();
				this.state = 365;
				this.match(PLParser.RBRACE);
				}
				break;

			case 8:
				{
				_localctx = new VariantConstructorContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 367;
				this.match(PLParser.UpperId);
				this.state = 368;
				this.match(PLParser.LPAREN);
				this.state = 369;
				this.expression(0);
				this.state = 370;
				this.match(PLParser.RPAREN);
				}
				break;

			case 9:
				{
				_localctx = new NegExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 372;
				this.match(PLParser.MINUS);
				this.state = 373;
				this.expression(17);
				}
				break;

			case 10:
				{
				_localctx = new NotExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 374;
				this.match(PLParser.NOT);
				this.state = 375;
				this.expression(16);
				}
				break;

			case 11:
				{
				_localctx = new PanicExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 376;
				this.match(PLParser.PANIC);
				this.state = 377;
				this.match(PLParser.LPAREN);
				this.state = 378;
				this.expression(0);
				this.state = 379;
				this.match(PLParser.RPAREN);
				}
				break;

			case 12:
				{
				_localctx = new StringToIntExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 381;
				this.match(PLParser.STRING2INT);
				this.state = 382;
				this.match(PLParser.LPAREN);
				this.state = 383;
				this.expression(0);
				this.state = 384;
				this.match(PLParser.RPAREN);
				}
				break;

			case 13:
				{
				_localctx = new IntToStringExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 386;
				this.match(PLParser.INT2STRING);
				this.state = 387;
				this.match(PLParser.LPAREN);
				this.state = 388;
				this.expression(0);
				this.state = 389;
				this.match(PLParser.RPAREN);
				}
				break;

			case 14:
				{
				_localctx = new PrintLineExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 391;
				this.match(PLParser.PRINTLN);
				this.state = 392;
				this.match(PLParser.LPAREN);
				this.state = 393;
				this.expression(0);
				this.state = 394;
				this.match(PLParser.RPAREN);
				}
				break;

			case 15:
				{
				_localctx = new IfElseExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 396;
				this.match(PLParser.IF);
				this.state = 397;
				this.expression(0);
				this.state = 398;
				this.match(PLParser.THEN);
				this.state = 399;
				this.expression(0);
				this.state = 400;
				this.match(PLParser.ELSE);
				this.state = 401;
				this.expression(4);
				}
				break;

			case 16:
				{
				_localctx = new MatchExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 403;
				this.match(PLParser.MATCH);
				this.state = 404;
				this.match(PLParser.LPAREN);
				this.state = 405;
				this.expression(0);
				this.state = 406;
				this.match(PLParser.RPAREN);
				this.state = 407;
				this.match(PLParser.LBRACE);
				this.state = 409;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 408;
					this.patternToExpr();
					}
					}
					this.state = 411;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === PLParser.BAR);
				this.state = 413;
				this.match(PLParser.RBRACE);
				}
				break;

			case 17:
				{
				_localctx = new FunExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 415;
				this.match(PLParser.LPAREN);
				this.state = 416;
				this.optionallyAnnotatedParameter();
				this.state = 421;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 46, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 417;
						this.match(PLParser.COMMA);
						this.state = 418;
						this.optionallyAnnotatedParameter();
						}
						}
					}
					this.state = 423;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 46, this._ctx);
				}
				this.state = 425;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 424;
					this.match(PLParser.COMMA);
					}
				}

				this.state = 427;
				this.match(PLParser.RPAREN);
				this.state = 428;
				this.match(PLParser.ARROW);
				this.state = 429;
				this.expression(2);
				}
				break;

			case 18:
				{
				_localctx = new StatementBlockExprContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 431;
				this.statementBlock();
				}
				break;
			}
			this._ctx._stop = this._input.tryLT(-1);
			this.state = 462;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 50, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					if (this._parseListeners != null) {
						this.triggerExitRuleEvent();
					}
					_prevctx = _localctx;
					{
					this.state = 460;
					this._errHandler.sync(this);
					switch ( this.interpreter.adaptivePredict(this._input, 49, this._ctx) ) {
					case 1:
						{
						_localctx = new FactorExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 434;
						if (!(this.precpred(this._ctx, 10))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 10)");
						}
						this.state = 435;
						this.factorOperator();
						this.state = 436;
						this.expression(11);
						}
						break;

					case 2:
						{
						_localctx = new TermExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 438;
						if (!(this.precpred(this._ctx, 9))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 9)");
						}
						this.state = 439;
						this.termOperator();
						this.state = 440;
						this.expression(10);
						}
						break;

					case 3:
						{
						_localctx = new ComparisonExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 442;
						if (!(this.precpred(this._ctx, 8))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 8)");
						}
						this.state = 443;
						this.comparisonOperator();
						this.state = 444;
						this.expression(9);
						}
						break;

					case 4:
						{
						_localctx = new ConjunctionExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 446;
						if (!(this.precpred(this._ctx, 7))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 7)");
						}
						this.state = 447;
						this.match(PLParser.AND);
						this.state = 448;
						this.expression(8);
						}
						break;

					case 5:
						{
						_localctx = new DisjunctionExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 449;
						if (!(this.precpred(this._ctx, 6))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 6)");
						}
						this.state = 450;
						this.match(PLParser.OR);
						this.state = 451;
						this.expression(7);
						}
						break;

					case 6:
						{
						_localctx = new ConcatExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 452;
						if (!(this.precpred(this._ctx, 5))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 5)");
						}
						this.state = 453;
						this.match(PLParser.COLONCOLON);
						this.state = 454;
						this.expression(6);
						}
						break;

					case 7:
						{
						_localctx = new FieldAccessExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 455;
						if (!(this.precpred(this._ctx, 18))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 18)");
						}
						this.state = 456;
						this.match(PLParser.DOT);
						this.state = 457;
						this.match(PLParser.LowerId);
						}
						break;

					case 8:
						{
						_localctx = new FunctionApplicationExprContext(new ExpressionContext(_parentctx, _parentState));
						this.pushNewRecursionContext(_localctx, _startState, PLParser.RULE_expression);
						this.state = 458;
						if (!(this.precpred(this._ctx, 11))) {
							throw new FailedPredicateException(this, "this.precpred(this._ctx, 11)");
						}
						this.state = 459;
						this.functionArguments();
						}
						break;
					}
					}
				}
				this.state = 464;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 50, this._ctx);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.unrollRecursionContexts(_parentctx);
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public objectFieldDeclarations(): ObjectFieldDeclarationsContext {
		let _localctx: ObjectFieldDeclarationsContext = new ObjectFieldDeclarationsContext(this._ctx, this.state);
		this.enterRule(_localctx, 44, PLParser.RULE_objectFieldDeclarations);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 465;
			this.objectFieldDeclaration();
			this.state = 470;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 51, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 466;
					this.match(PLParser.COMMA);
					this.state = 467;
					this.objectFieldDeclaration();
					}
					}
				}
				this.state = 472;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 51, this._ctx);
			}
			this.state = 474;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === PLParser.COMMA) {
				{
				this.state = 473;
				this.match(PLParser.COMMA);
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public objectFieldDeclaration(): ObjectFieldDeclarationContext {
		let _localctx: ObjectFieldDeclarationContext = new ObjectFieldDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 46, PLParser.RULE_objectFieldDeclaration);
		try {
			this.state = 480;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 53, this._ctx) ) {
			case 1:
				_localctx = new NormalObjFieldDeclarationContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 476;
				this.match(PLParser.LowerId);
				this.state = 477;
				this.match(PLParser.COLON);
				this.state = 478;
				this.expression(0);
				}
				break;

			case 2:
				_localctx = new ShorthandObjFieldDeclarationContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 479;
				this.match(PLParser.LowerId);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public functionArguments(): FunctionArgumentsContext {
		let _localctx: FunctionArgumentsContext = new FunctionArgumentsContext(this._ctx, this.state);
		this.enterRule(_localctx, 48, PLParser.RULE_functionArguments);
		let _la: number;
		try {
			let _alt: number;
			this.state = 498;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 56, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 482;
				this.match(PLParser.LPAREN);
				this.state = 483;
				this.match(PLParser.RPAREN);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 484;
				this.match(PLParser.LPAREN);
				this.state = 485;
				this.expression(0);
				this.state = 490;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 54, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 486;
						this.match(PLParser.COMMA);
						this.state = 487;
						this.expression(0);
						}
						}
					}
					this.state = 492;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 54, this._ctx);
				}
				this.state = 494;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 493;
					this.match(PLParser.COMMA);
					}
				}

				this.state = 496;
				this.match(PLParser.RPAREN);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public pattern(): PatternContext {
		let _localctx: PatternContext = new PatternContext(this._ctx, this.state);
		this.enterRule(_localctx, 50, PLParser.RULE_pattern);
		let _la: number;
		try {
			let _alt: number;
			this.state = 529;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case PLParser.LBRACKET:
				_localctx = new TuplePatternContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 500;
				this.match(PLParser.LBRACKET);
				this.state = 501;
				this.varOrWildCard();
				this.state = 504;
				this._errHandler.sync(this);
				_alt = 1;
				do {
					switch (_alt) {
					case 1:
						{
						{
						this.state = 502;
						this.match(PLParser.COMMA);
						this.state = 503;
						this.varOrWildCard();
						}
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					this.state = 506;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 57, this._ctx);
				} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
				this.state = 509;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 508;
					this.match(PLParser.COMMA);
					}
				}

				this.state = 511;
				this.match(PLParser.RBRACKET);
				}
				break;
			case PLParser.LBRACE:
				_localctx = new ObjectPatternContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 513;
				this.match(PLParser.LBRACE);
				this.state = 514;
				this.varOrRenamedVar();
				this.state = 519;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 59, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 515;
						this.match(PLParser.COMMA);
						this.state = 516;
						this.varOrRenamedVar();
						}
						}
					}
					this.state = 521;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 59, this._ctx);
				}
				this.state = 523;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === PLParser.COMMA) {
					{
					this.state = 522;
					this.match(PLParser.COMMA);
					}
				}

				this.state = 525;
				this.match(PLParser.RBRACE);
				}
				break;
			case PLParser.LowerId:
				_localctx = new VariablePatternContext(_localctx);
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 527;
				this.match(PLParser.LowerId);
				}
				break;
			case PLParser.WILDCARD:
				_localctx = new WildcardPatternContext(_localctx);
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 528;
				this.match(PLParser.WILDCARD);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public varOrWildCard(): VarOrWildCardContext {
		let _localctx: VarOrWildCardContext = new VarOrWildCardContext(this._ctx, this.state);
		this.enterRule(_localctx, 52, PLParser.RULE_varOrWildCard);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 531;
			_la = this._input.LA(1);
			if (!(_la === PLParser.WILDCARD || _la === PLParser.LowerId)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public varOrRenamedVar(): VarOrRenamedVarContext {
		let _localctx: VarOrRenamedVarContext = new VarOrRenamedVarContext(this._ctx, this.state);
		this.enterRule(_localctx, 54, PLParser.RULE_varOrRenamedVar);
		try {
			this.state = 537;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 62, this._ctx) ) {
			case 1:
				_localctx = new RawVarContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 533;
				this.match(PLParser.LowerId);
				}
				break;

			case 2:
				_localctx = new RenamedVarContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 534;
				this.match(PLParser.LowerId);
				this.state = 535;
				this.match(PLParser.AS);
				this.state = 536;
				this.match(PLParser.LowerId);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public factorOperator(): FactorOperatorContext {
		let _localctx: FactorOperatorContext = new FactorOperatorContext(this._ctx, this.state);
		this.enterRule(_localctx, 56, PLParser.RULE_factorOperator);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 539;
			_la = this._input.LA(1);
			if (!(((((_la - 56)) & ~0x1F) === 0 && ((1 << (_la - 56)) & ((1 << (PLParser.MUL - 56)) | (1 << (PLParser.DIV - 56)) | (1 << (PLParser.MOD - 56)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public termOperator(): TermOperatorContext {
		let _localctx: TermOperatorContext = new TermOperatorContext(this._ctx, this.state);
		this.enterRule(_localctx, 58, PLParser.RULE_termOperator);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 541;
			_la = this._input.LA(1);
			if (!(_la === PLParser.PLUS || _la === PLParser.MINUS)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public comparisonOperator(): ComparisonOperatorContext {
		let _localctx: ComparisonOperatorContext = new ComparisonOperatorContext(this._ctx, this.state);
		this.enterRule(_localctx, 60, PLParser.RULE_comparisonOperator);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 543;
			_la = this._input.LA(1);
			if (!(((((_la - 61)) & ~0x1F) === 0 && ((1 << (_la - 61)) & ((1 << (PLParser.STRUCT_EQ - 61)) | (1 << (PLParser.LT - 61)) | (1 << (PLParser.LE - 61)) | (1 << (PLParser.GT - 61)) | (1 << (PLParser.GE - 61)) | (1 << (PLParser.STRUCT_NE - 61)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public literal(): LiteralContext {
		let _localctx: LiteralContext = new LiteralContext(this._ctx, this.state);
		this.enterRule(_localctx, 62, PLParser.RULE_literal);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 545;
			_la = this._input.LA(1);
			if (!(_la === PLParser.TRUE || _la === PLParser.FALSE || ((((_la - 72)) & ~0x1F) === 0 && ((1 << (_la - 72)) & ((1 << (PLParser.MinInt - 72)) | (1 << (PLParser.IntLiteral - 72)) | (1 << (PLParser.StrLiteral - 72)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	public sempred(_localctx: RuleContext, ruleIndex: number, predIndex: number): boolean {
		switch (ruleIndex) {
		case 21:
			return this.expression_sempred(_localctx as ExpressionContext, predIndex);
		}
		return true;
	}
	private expression_sempred(_localctx: ExpressionContext, predIndex: number): boolean {
		switch (predIndex) {
		case 0:
			return this.precpred(this._ctx, 10);

		case 1:
			return this.precpred(this._ctx, 9);

		case 2:
			return this.precpred(this._ctx, 8);

		case 3:
			return this.precpred(this._ctx, 7);

		case 4:
			return this.precpred(this._ctx, 6);

		case 5:
			return this.precpred(this._ctx, 5);

		case 6:
			return this.precpred(this._ctx, 18);

		case 7:
			return this.precpred(this._ctx, 11);
		}
		return true;
	}

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03R\u0226\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x04" +
		"\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B\t\x1B\x04\x1C\t\x1C\x04" +
		"\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t \x04!\t!\x03\x02\x07\x02" +
		"D\n\x02\f\x02\x0E\x02G\v\x02\x03\x02\x07\x02J\n\x02\f\x02\x0E\x02M\v\x02" +
		"\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x07\x03V\n\x03" +
		"\f\x03\x0E\x03Y\v\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x04\x03\x04" +
		"\x03\x04\x07\x04b\n\x04\f\x04\x0E\x04e\v\x04\x03\x05\x03\x05\x05\x05i" +
		"\n\x05\x03\x06\x03\x06\x03\x06\x07\x06n\n\x06\f\x06\x0E\x06q\v\x06\x03" +
		"\x06\x03\x06\x03\x07\x05\x07v\n\x07\x03\x07\x03\x07\x03\x07\x05\x07{\n" +
		"\x07\x03\x07\x03\x07\x07\x07\x7F\n\x07\f\x07\x0E\x07\x82\v\x07\x03\x07" +
		"\x03\x07\x03\b\x05\b\x87\n\b\x03\b\x03\b\x03\b\x05\b\x8C\n\b\x03\b\x03" +
		"\b\x03\b\x03\b\x03\b\x05\b\x93\n\b\x03\b\x03\b\x05\b\x97\n\b\x03\t\x05" +
		"\t\x9A\n\t\x03\t\x03\t\x05\t\x9E\n\t\x03\t\x03\t\x03\t\x03\t\x03\t\x07" +
		"\t\xA5\n\t\f\t\x0E\t\xA8\v\t\x03\t\x05\t\xAB\n\t\x05\t\xAD\n\t\x03\t\x03" +
		"\t\x03\t\x05\t\xB2\n\t\x03\t\x03\t\x03\t\x03\n\x05\n\xB8\n\n\x03\n\x03" +
		"\n\x05\n\xBC\n\n\x03\n\x03\n\x03\n\x03\n\x03\n\x07\n\xC3\n\n\f\n\x0E\n" +
		"\xC6\v\n\x03\n\x05\n\xC9\n\n\x05\n\xCB\n\n\x03\n\x03\n\x03\n\x05\n\xD0" +
		"\n\n\x03\v\x03\v\x03\v\x03\v\x07\v\xD6\n\v\f\v\x0E\v\xD9\v\v\x03\v\x03" +
		"\v\x03\f\x03\f\x03\f\x07\f\xE0\n\f\f\f\x0E\f\xE3\v\f\x03\f\x05\f\xE6\n" +
		"\f\x03\f\x03\f\x03\f\x06\f\xEB\n\f\r\f\x0E\f\xEC\x03\f\x05\f\xF0\n\f\x05" +
		"\f\xF2\n\f\x03\r\x05\r\xF5\n\r\x03\r\x03\r\x03\r\x03\r\x03\x0E\x03\x0E" +
		"\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x05\x0F\u0106\n\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x06\x0F\u010C\n\x0F" +
		"\r\x0F\x0E\x0F\u010D\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x07" +
		"\x0F\u0116\n\x0F\f\x0F\x0E\x0F\u0119\v\x0F\x03\x0F\x05\x0F\u011C\n\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x05\x0F\u0122\n\x0F\x03\x10\x03\x10\x03" +
		"\x10\x03\x10\x07\x10\u0128\n\x10\f\x10\x0E\x10\u012B\v\x10\x03\x10\x03" +
		"\x10\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x05\x12\u0134\n\x12\x03\x13" +
		"\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14" +
		"\x03\x15\x03\x15\x07\x15\u0142\n\x15\f\x15\x0E\x15\u0145\v\x15\x03\x15" +
		"\x05\x15\u0148\n\x15\x03\x15\x03\x15\x03\x16\x03\x16\x03\x16\x05\x16\u014F" +
		"\n\x16\x03\x16\x03\x16\x03\x16\x05\x16\u0154\n\x16\x03\x17\x03\x17\x03" +
		"\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03" +
		"\x17\x03\x17\x03\x17\x03\x17\x06\x17\u0165\n\x17\r\x17\x0E\x17\u0166\x03" +
		"\x17\x05\x17\u016A\n\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x06\x17\u019C\n\x17\r" +
		"\x17\x0E\x17\u019D\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x07" +
		"\x17\u01A6\n\x17\f\x17\x0E\x17\u01A9\v\x17\x03\x17\x05\x17\u01AC\n\x17" +
		"\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x05\x17\u01B3\n\x17\x03\x17\x03" +
		"\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03" +
		"\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03" +
		"\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x07\x17\u01CF\n\x17" +
		"\f\x17\x0E\x17\u01D2\v\x17\x03\x18\x03\x18\x03\x18\x07\x18\u01D7\n\x18" +
		"\f\x18\x0E\x18\u01DA\v\x18\x03\x18\x05\x18\u01DD\n\x18\x03\x19\x03\x19" +
		"\x03\x19\x03\x19\x05\x19\u01E3\n\x19\x03\x1A\x03\x1A\x03\x1A\x03\x1A\x03" +
		"\x1A\x03\x1A\x07\x1A\u01EB\n\x1A\f\x1A\x0E\x1A\u01EE\v\x1A\x03\x1A\x05" +
		"\x1A\u01F1\n\x1A\x03\x1A\x03\x1A\x05\x1A\u01F5\n\x1A\x03\x1B\x03\x1B\x03" +
		"\x1B\x03\x1B\x06\x1B\u01FB\n\x1B\r\x1B\x0E\x1B\u01FC\x03\x1B\x05\x1B\u0200" +
		"\n\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x07\x1B\u0208\n" +
		"\x1B\f\x1B\x0E\x1B\u020B\v\x1B\x03\x1B\x05\x1B\u020E\n\x1B\x03\x1B\x03" +
		"\x1B\x03\x1B\x03\x1B\x05\x1B\u0214\n\x1B\x03\x1C\x03\x1C\x03\x1D\x03\x1D" +
		"\x03\x1D\x03\x1D\x05\x1D\u021C\n\x1D\x03\x1E\x03\x1E\x03\x1F\x03\x1F\x03" +
		" \x03 \x03!\x03!\x03!\x02\x02\x03,\"\x02\x02\x04\x02\x06\x02\b\x02\n\x02" +
		"\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02" +
		"\x1E\x02 \x02\"\x02$\x02&\x02(\x02*\x02,\x02.\x020\x022\x024\x026\x02" +
		"8\x02:\x02<\x02>\x02@\x02\x02\b\x03\x02\x07\b\x04\x02\x1B\x1BHH\x03\x02" +
		":<\x03\x02=>\x03\x02?D\x04\x02\x18\x19JL\x02\u0261\x02E\x03\x02\x02\x02" +
		"\x04P\x03\x02\x02\x02\x06^\x03\x02\x02\x02\bh\x03\x02\x02\x02\nj\x03\x02" +
		"\x02\x02\fu\x03\x02\x02\x02\x0E\x96\x03\x02\x02\x02\x10\x99\x03\x02\x02" +
		"\x02\x12\xB7\x03\x02\x02\x02\x14\xD1\x03\x02\x02\x02\x16\xF1\x03\x02\x02" +
		"\x02\x18\xF4\x03\x02\x02\x02\x1A\xFA\x03\x02\x02\x02\x1C\u0121\x03\x02" +
		"\x02\x02\x1E\u0123\x03\x02\x02\x02 \u012E\x03\x02\x02\x02\"\u0131\x03" +
		"\x02\x02\x02$\u0135\x03\x02\x02\x02&\u0138\x03\x02\x02\x02(\u013F\x03" +
		"\x02\x02\x02*\u014B\x03\x02\x02\x02,\u01B2\x03\x02\x02\x02.\u01D3\x03" +
		"\x02\x02\x020\u01E2\x03\x02\x02\x022\u01F4\x03\x02\x02\x024\u0213\x03" +
		"\x02\x02\x026\u0215\x03\x02\x02\x028\u021B\x03\x02\x02\x02:\u021D\x03" +
		"\x02\x02\x02<\u021F\x03\x02\x02\x02>\u0221\x03\x02\x02\x02@\u0223\x03" +
		"\x02\x02\x02BD\x05\x04\x03\x02CB\x03\x02\x02\x02DG\x03\x02\x02\x02EC\x03" +
		"\x02\x02\x02EF\x03\x02\x02\x02FK\x03\x02\x02\x02GE\x03\x02\x02\x02HJ\x05" +
		"\b\x05\x02IH\x03\x02\x02\x02JM\x03\x02\x02\x02KI\x03\x02\x02\x02KL\x03" +
		"\x02\x02\x02LN\x03\x02\x02\x02MK\x03\x02\x02\x02NO\x07\x02\x02\x03O\x03" +
		"\x03\x02\x02\x02PQ\x07\x03\x02\x02QR\x07,\x02\x02RW\x07I\x02\x02ST\x07" +
		"4\x02\x02TV\x07I\x02\x02US\x03\x02\x02\x02VY\x03\x02\x02\x02WU\x03\x02" +
		"\x02\x02WX\x03\x02\x02\x02XZ\x03\x02\x02\x02YW\x03\x02\x02\x02Z[\x07-" +
		"\x02\x02[\\\x07\x04\x02\x02\\]\x05\x06\x04\x02]\x05\x03\x02\x02\x02^c" +
		"\x07I\x02\x02_`\x075\x02\x02`b\x07I\x02\x02a_\x03\x02\x02\x02be\x03\x02" +
		"\x02\x02ca\x03\x02\x02\x02cd\x03\x02\x02\x02d\x07\x03\x02\x02\x02ec\x03" +
		"\x02\x02\x02fi\x05\n\x06\x02gi\x05\f\x07\x02hf\x03\x02\x02\x02hg\x03\x02" +
		"\x02\x02i\t\x03\x02\x02\x02jk\x05\x0E\b\x02ko\x07,\x02\x02ln\x05\x10\t" +
		"\x02ml\x03\x02\x02\x02nq\x03\x02\x02\x02om\x03\x02\x02\x02op\x03\x02\x02" +
		"\x02pr\x03\x02\x02\x02qo\x03\x02\x02\x02rs\x07-\x02\x02s\v\x03\x02\x02" +
		"\x02tv\x07\n\x02\x02ut\x03\x02\x02\x02uv\x03\x02\x02\x02vw\x03\x02\x02" +
		"\x02wx\x07$\x02\x02xz\x07I\x02\x02y{\x05\x14\v\x02zy\x03\x02\x02\x02z" +
		"{\x03\x02\x02\x02{|\x03\x02\x02\x02|\x80\x07,\x02\x02}\x7F\x05\x12\n\x02" +
		"~}\x03\x02\x02\x02\x7F\x82\x03\x02\x02\x02\x80~\x03\x02\x02\x02\x80\x81" +
		"\x03\x02\x02\x02\x81\x83\x03\x02\x02\x02\x82\x80\x03\x02\x02\x02\x83\x84" +
		"\x07-\x02\x02\x84\r\x03\x02\x02\x02\x85\x87\x07\n\x02\x02\x86\x85\x03" +
		"\x02\x02\x02\x86\x87\x03\x02\x02\x02\x87\x88\x03\x02\x02\x02\x88\x89\x07" +
		"\x05\x02\x02\x89\x8B\x07I\x02\x02\x8A\x8C\x05\x14\v\x02\x8B\x8A\x03\x02" +
		"\x02\x02\x8B\x8C\x03\x02\x02\x02\x8C\x8D\x03\x02\x02\x02\x8D\x8E\x07*" +
		"\x02\x02\x8E\x8F\x05\x16\f\x02\x8F\x90\x07+\x02\x02\x90\x97\x03\x02\x02" +
		"\x02\x91\x93\x07\n\x02\x02\x92\x91\x03\x02\x02\x02\x92\x93\x03\x02\x02" +
		"\x02\x93\x94\x03\x02\x02\x02\x94\x95\x07\x05\x02\x02\x95\x97\x07I\x02" +
		"\x02\x96\x86\x03\x02\x02\x02\x96\x92\x03\x02\x02\x02\x97\x0F\x03\x02\x02" +
		"\x02\x98\x9A\x07\n\x02\x02\x99\x98\x03\x02\x02\x02\x99\x9A\x03\x02\x02" +
		"\x02\x9A\x9B\x03\x02\x02\x02\x9B\x9D\t\x02\x02\x02\x9C\x9E\x05\x14\v\x02" +
		"\x9D\x9C\x03\x02\x02\x02\x9D\x9E\x03\x02\x02\x02\x9E\x9F\x03\x02\x02\x02" +
		"\x9F\xA0\x07H\x02\x02\xA0\xAC\x07*\x02\x02\xA1\xA6\x05 \x11\x02\xA2\xA3" +
		"\x074\x02\x02\xA3\xA5\x05 \x11\x02\xA4\xA2\x03\x02\x02\x02\xA5\xA8\x03" +
		"\x02\x02\x02\xA6\xA4\x03\x02\x02\x02\xA6\xA7\x03\x02\x02\x02\xA7\xAA\x03" +
		"\x02\x02\x02\xA8\xA6\x03\x02\x02\x02\xA9\xAB\x074\x02\x02\xAA\xA9\x03" +
		"\x02\x02\x02\xAA\xAB\x03\x02\x02\x02\xAB\xAD\x03\x02\x02\x02\xAC\xA1\x03" +
		"\x02\x02\x02\xAC\xAD\x03\x02\x02\x02\xAD\xAE\x03\x02\x02\x02\xAE\xB1\x07" +
		"+\x02\x02\xAF\xB0\x072\x02\x02\xB0\xB2\x05\x1C\x0F\x02\xB1\xAF\x03\x02" +
		"\x02\x02\xB1\xB2\x03\x02\x02\x02\xB2\xB3\x03\x02\x02\x02\xB3\xB4\x078" +
		"\x02\x02\xB4\xB5\x05,\x17\x02\xB5\x11\x03\x02\x02\x02\xB6\xB8\x07\n\x02" +
		"\x02\xB7\xB6\x03\x02\x02\x02\xB7\xB8\x03\x02\x02\x02\xB8\xB9\x03\x02\x02" +
		"\x02\xB9\xBB\t\x02\x02\x02\xBA\xBC\x05\x14\v\x02\xBB\xBA\x03\x02\x02\x02" +
		"\xBB\xBC\x03\x02\x02\x02\xBC\xBD\x03\x02\x02\x02\xBD\xBE\x07H\x02\x02" +
		"\xBE\xCA\x07*\x02\x02\xBF\xC4\x05 \x11\x02\xC0\xC1\x074\x02\x02\xC1\xC3" +
		"\x05 \x11\x02\xC2\xC0\x03\x02\x02\x02\xC3\xC6\x03\x02\x02\x02\xC4\xC2" +
		"\x03\x02\x02\x02\xC4\xC5\x03\x02\x02\x02\xC5\xC8\x03\x02\x02\x02\xC6\xC4" +
		"\x03\x02\x02\x02\xC7\xC9\x074\x02\x02\xC8\xC7\x03\x02\x02\x02\xC8\xC9" +
		"\x03\x02\x02\x02\xC9\xCB\x03\x02\x02\x02\xCA\xBF\x03\x02\x02\x02\xCA\xCB" +
		"\x03\x02\x02\x02\xCB\xCC\x03\x02\x02\x02\xCC\xCF\x07+\x02\x02\xCD\xCE" +
		"\x072\x02\x02\xCE\xD0\x05\x1C\x0F\x02\xCF\xCD\x03\x02\x02\x02\xCF\xD0" +
		"\x03\x02\x02\x02\xD0\x13\x03\x02\x02\x02\xD1\xD2\x07@\x02\x02\xD2\xD7" +
		"\x07I\x02\x02\xD3\xD4\x074\x02\x02\xD4\xD6\x07I\x02\x02\xD5\xD3\x03\x02" +
		"\x02\x02\xD6\xD9\x03\x02\x02\x02\xD7\xD5\x03\x02\x02\x02\xD7\xD8\x03\x02" +
		"\x02\x02\xD8\xDA\x03\x02\x02\x02\xD9\xD7\x03\x02\x02\x02\xDA\xDB\x07B" +
		"\x02\x02\xDB\x15\x03\x02\x02\x02\xDC\xE1\x05\x18\r\x02\xDD\xDE\x074\x02" +
		"\x02\xDE\xE0\x05\x18\r\x02\xDF\xDD\x03\x02\x02\x02\xE0\xE3\x03\x02\x02" +
		"\x02\xE1\xDF\x03\x02\x02\x02\xE1\xE2\x03\x02\x02\x02\xE2\xE5\x03\x02\x02" +
		"\x02\xE3\xE1\x03\x02\x02\x02\xE4\xE6\x074\x02\x02\xE5\xE4\x03\x02\x02" +
		"\x02\xE5\xE6\x03\x02\x02\x02\xE6\xF2\x03\x02\x02\x02\xE7\xEA\x05\x1A\x0E" +
		"\x02\xE8\xE9\x074\x02\x02\xE9\xEB\x05\x1A\x0E\x02\xEA\xE8\x03\x02\x02" +
		"\x02\xEB\xEC\x03\x02\x02\x02\xEC\xEA\x03\x02\x02\x02\xEC\xED\x03\x02\x02" +
		"\x02\xED\xEF\x03\x02\x02\x02\xEE\xF0\x074\x02\x02\xEF\xEE\x03\x02\x02" +
		"\x02\xEF\xF0\x03\x02\x02\x02\xF0\xF2\x03\x02\x02\x02\xF1\xDC\x03\x02\x02" +
		"\x02\xF1\xE7\x03\x02\x02\x02\xF2\x17\x03\x02\x02\x02\xF3\xF5\x07\n\x02" +
		"\x02\xF4\xF3\x03\x02\x02\x02\xF4\xF5\x03\x02\x02\x02\xF5\xF6\x03\x02\x02" +
		"\x02\xF6\xF7\x07\x06\x02\x02\xF7\xF8\x07H\x02\x02\xF8\xF9\x05$\x13\x02" +
		"\xF9\x19\x03\x02\x02\x02\xFA\xFB\x07I\x02\x02\xFB\xFC\x07*\x02\x02\xFC" +
		"\xFD\x05\x1C\x0F\x02\xFD\xFE\x07+\x02\x02\xFE\x1B\x03\x02\x02\x02\xFF" +
		"\u0122\x07\x17\x02\x02\u0100\u0122\x07\x14\x02\x02\u0101\u0122\x07\x15" +
		"\x02\x02\u0102\u0122\x07\x16\x02\x02\u0103\u0105\x07I\x02\x02\u0104\u0106" +
		"\x05\x1E\x10\x02\u0105\u0104\x03\x02\x02\x02\u0105\u0106\x03\x02\x02\x02" +
		"\u0106\u0122\x03\x02\x02\x02\u0107\u0108\x07.\x02\x02\u0108\u010B\x05" +
		"\x1C\x0F\x02\u0109\u010A\x07:\x02\x02\u010A\u010C\x05\x1C\x0F\x02\u010B" +
		"\u0109\x03\x02\x02\x02\u010C\u010D\x03\x02\x02\x02\u010D\u010B\x03\x02" +
		"\x02\x02\u010D\u010E\x03\x02\x02\x02\u010E\u010F\x03\x02\x02\x02\u010F" +
		"\u0110\x07/\x02\x02\u0110\u0122\x03\x02\x02\x02\u0111\u0112\x07*\x02\x02" +
		"\u0112\u0117\x05\x1C\x0F\x02\u0113\u0114\x074\x02\x02\u0114\u0116\x05" +
		"\x1C\x0F\x02\u0115\u0113\x03\x02\x02\x02\u0116\u0119\x03\x02\x02\x02\u0117" +
		"\u0115\x03\x02\x02\x02\u0117\u0118\x03\x02\x02\x02\u0118\u011B\x03\x02" +
		"\x02\x02\u0119\u0117\x03\x02\x02\x02\u011A\u011C\x074\x02\x02\u011B\u011A" +
		"\x03\x02\x02\x02\u011B\u011C\x03\x02\x02\x02\u011C\u011D\x03\x02\x02\x02" +
		"\u011D\u011E\x07+\x02\x02\u011E\u011F\x077\x02\x02\u011F\u0120\x05\x1C" +
		"\x0F\x02\u0120\u0122\x03\x02\x02\x02\u0121\xFF\x03\x02\x02\x02\u0121\u0100" +
		"\x03\x02\x02\x02\u0121\u0101\x03\x02\x02\x02\u0121\u0102\x03\x02\x02\x02" +
		"\u0121\u0103\x03\x02\x02\x02\u0121\u0107\x03\x02\x02\x02\u0121\u0111\x03" +
		"\x02\x02\x02\u0122\x1D\x03\x02\x02\x02\u0123\u0124\x07@\x02\x02\u0124" +
		"\u0129\x05\x1C\x0F\x02\u0125\u0126\x074\x02\x02\u0126\u0128\x05\x1C\x0F" +
		"\x02\u0127\u0125\x03\x02\x02\x02\u0128\u012B\x03\x02\x02\x02\u0129\u0127" +
		"\x03\x02\x02\x02\u0129\u012A\x03\x02\x02\x02\u012A\u012C\x03\x02\x02\x02" +
		"\u012B\u0129\x03\x02\x02\x02\u012C\u012D\x07B\x02\x02\u012D\x1F\x03\x02" +
		"\x02\x02\u012E\u012F\x07H\x02\x02\u012F\u0130\x05$\x13\x02\u0130!\x03" +
		"\x02\x02\x02\u0131\u0133\x07H\x02\x02\u0132\u0134\x05$\x13\x02\u0133\u0132" +
		"\x03\x02\x02\x02\u0133\u0134\x03\x02\x02\x02\u0134#\x03\x02\x02\x02\u0135" +
		"\u0136\x072\x02\x02\u0136\u0137\x05\x1C\x0F\x02\u0137%\x03\x02\x02\x02" +
		"\u0138\u0139\x076\x02\x02\u0139\u013A\x07I\x02\x02\u013A\u013B\x056\x1C" +
		"\x02\u013B\u013C\x03\x02\x02\x02\u013C\u013D\x077\x02\x02\u013D\u013E" +
		"\x05,\x17\x02\u013E\'\x03\x02\x02\x02\u013F\u0143\x07,\x02\x02\u0140\u0142" +
		"\x05*\x16\x02\u0141\u0140\x03\x02\x02\x02\u0142\u0145\x03\x02\x02\x02" +
		"\u0143\u0141\x03\x02\x02\x02\u0143\u0144\x03\x02\x02\x02\u0144\u0147\x03" +
		"\x02\x02\x02\u0145\u0143\x03\x02\x02\x02\u0146\u0148\x05,\x17\x02\u0147" +
		"\u0146\x03\x02\x02\x02\u0147\u0148\x03\x02\x02\x02\u0148\u0149\x03\x02" +
		"\x02\x02\u0149\u014A\x07-\x02\x02\u014A)\x03\x02\x02\x02\u014B\u014C\x07" +
		"\x06\x02\x02\u014C\u014E\x054\x1B\x02\u014D\u014F\x05$\x13\x02\u014E\u014D" +
		"\x03\x02\x02\x02\u014E\u014F\x03\x02\x02\x02\u014F\u0150\x03\x02\x02\x02" +
		"\u0150\u0151\x078\x02\x02\u0151\u0153\x05,\x17\x02\u0152\u0154\x071\x02" +
		"\x02\u0153\u0152\x03\x02\x02\x02\u0153\u0154\x03\x02\x02\x02\u0154+\x03" +
		"\x02\x02\x02\u0155\u0156\b\x17\x01\x02\u0156\u0157\x07*\x02\x02\u0157" +
		"\u0158\x05,\x17\x02\u0158\u0159\x07+\x02\x02\u0159\u01B3\x03\x02\x02\x02" +
		"\u015A\u01B3\x05@!\x02\u015B\u01B3\x07\x1A\x02\x02\u015C\u01B3\x07H\x02" +
		"\x02\u015D\u015E\x07I\x02\x02\u015E\u015F\x075\x02\x02\u015F\u01B3\x07" +
		"H\x02\x02\u0160\u0161\x07.\x02\x02\u0161\u0164\x05,\x17\x02\u0162\u0163" +
		"\x074\x02\x02\u0163\u0165\x05,\x17\x02\u0164\u0162\x03\x02\x02\x02\u0165" +
		"\u0166\x03\x02\x02\x02\u0166\u0164\x03\x02\x02\x02\u0166\u0167\x03\x02" +
		"\x02\x02\u0167\u0169\x03\x02\x02\x02\u0168\u016A\x074\x02\x02\u0169\u0168" +
		"\x03\x02\x02\x02\u0169\u016A\x03\x02\x02\x02\u016A\u016B\x03\x02\x02\x02" +
		"\u016B\u016C\x07/\x02\x02\u016C\u01B3\x03\x02\x02\x02\u016D\u016E\x07" +
		",\x02\x02\u016E\u016F\x05.\x18\x02\u016F\u0170\x07-\x02\x02\u0170\u01B3" +
		"\x03\x02\x02\x02\u0171\u0172\x07I\x02\x02\u0172\u0173\x07*\x02\x02\u0173" +
		"\u0174\x05,\x17\x02\u0174\u0175\x07+\x02\x02\u0175\u01B3\x03\x02\x02\x02" +
		"\u0176\u0177\x07>\x02\x02\u0177\u01B3\x05,\x17\x13\u0178\u0179\x079\x02" +
		"\x02\u0179\u01B3\x05,\x17\x12\u017A\u017B\x07\x12\x02\x02\u017B\u017C" +
		"\x07*\x02\x02\u017C\u017D\x05,\x17\x02\u017D\u017E\x07+\x02\x02\u017E" +
		"\u01B3\x03\x02\x02\x02\u017F\u0180\x07\x1C\x02\x02\u0180\u0181\x07*\x02" +
		"\x02\u0181\u0182\x05,\x17\x02\u0182\u0183\x07+\x02\x02\u0183\u01B3\x03" +
		"\x02\x02\x02\u0184\u0185\x07\x1D\x02\x02\u0185\u0186\x07*\x02\x02\u0186" +
		"\u0187\x05,\x17\x02\u0187\u0188\x07+\x02\x02\u0188\u01B3\x03\x02\x02\x02" +
		"\u0189\u018A\x07\x1E\x02\x02\u018A\u018B\x07*\x02\x02\u018B\u018C\x05" +
		",\x17\x02\u018C\u018D\x07+\x02\x02\u018D\u01B3\x03\x02\x02\x02\u018E\u018F" +
		"\x07\x0E\x02\x02\u018F\u0190\x05,\x17\x02\u0190\u0191\x07\x0F\x02\x02" +
		"\u0191\u0192\x05,\x17\x02\u0192\u0193\x07\x10\x02\x02\u0193\u0194\x05" +
		",\x17\x06\u0194\u01B3\x03\x02\x02\x02\u0195\u0196\x07\x11\x02\x02\u0196" +
		"\u0197\x07*\x02\x02\u0197\u0198\x05,\x17\x02\u0198\u0199\x07+\x02\x02" +
		"\u0199\u019B\x07,\x02\x02\u019A\u019C\x05&\x14\x02\u019B\u019A\x03\x02" +
		"\x02\x02\u019C\u019D\x03\x02\x02\x02\u019D\u019B\x03\x02\x02\x02\u019D" +
		"\u019E\x03\x02\x02\x02\u019E\u019F\x03\x02\x02\x02\u019F\u01A0\x07-\x02" +
		"\x02\u01A0\u01B3\x03\x02\x02\x02\u01A1\u01A2\x07*\x02\x02\u01A2\u01A7" +
		"\x05\"\x12\x02\u01A3\u01A4\x074\x02\x02\u01A4\u01A6\x05\"\x12\x02\u01A5" +
		"\u01A3\x03\x02\x02\x02\u01A6\u01A9\x03\x02\x02\x02\u01A7\u01A5\x03\x02" +
		"\x02\x02\u01A7\u01A8\x03\x02\x02\x02\u01A8\u01AB\x03\x02\x02\x02\u01A9" +
		"\u01A7\x03\x02\x02\x02\u01AA\u01AC\x074\x02\x02\u01AB\u01AA\x03\x02\x02" +
		"\x02\u01AB\u01AC\x03\x02\x02\x02\u01AC\u01AD\x03\x02\x02\x02\u01AD\u01AE" +
		"\x07+\x02\x02\u01AE\u01AF\x077\x02\x02\u01AF\u01B0\x05,\x17\x04\u01B0" +
		"\u01B3\x03\x02\x02\x02\u01B1\u01B3\x05(\x15\x02\u01B2\u0155\x03\x02\x02" +
		"\x02\u01B2\u015A\x03\x02\x02\x02\u01B2\u015B\x03\x02\x02\x02\u01B2\u015C" +
		"\x03\x02\x02\x02\u01B2\u015D\x03\x02\x02\x02\u01B2\u0160\x03\x02\x02\x02" +
		"\u01B2\u016D\x03\x02\x02\x02\u01B2\u0171\x03\x02\x02\x02\u01B2\u0176\x03" +
		"\x02\x02\x02\u01B2\u0178\x03\x02\x02\x02\u01B2\u017A\x03\x02\x02\x02\u01B2" +
		"\u017F\x03\x02\x02\x02\u01B2\u0184\x03\x02\x02\x02\u01B2\u0189\x03\x02" +
		"\x02\x02\u01B2\u018E\x03\x02\x02\x02\u01B2\u0195\x03\x02\x02\x02\u01B2" +
		"\u01A1\x03\x02\x02\x02\u01B2\u01B1\x03\x02\x02\x02\u01B3\u01D0\x03\x02" +
		"\x02\x02\u01B4\u01B5\f\f\x02\x02\u01B5\u01B6\x05:\x1E\x02\u01B6\u01B7" +
		"\x05,\x17\r\u01B7\u01CF\x03\x02\x02\x02\u01B8\u01B9\f\v\x02\x02\u01B9" +
		"\u01BA\x05<\x1F\x02\u01BA\u01BB\x05,\x17\f\u01BB\u01CF\x03\x02\x02\x02" +
		"\u01BC\u01BD\f\n\x02\x02\u01BD\u01BE\x05> \x02\u01BE\u01BF\x05,\x17\v" +
		"\u01BF\u01CF\x03\x02\x02\x02\u01C0\u01C1\f\t\x02\x02\u01C1\u01C2\x07E" +
		"\x02\x02\u01C2\u01CF\x05,\x17\n\u01C3\u01C4\f\b\x02\x02\u01C4\u01C5\x07" +
		"F\x02\x02\u01C5\u01CF\x05,\x17\t\u01C6\u01C7\f\x07\x02\x02\u01C7\u01C8" +
		"\x073\x02\x02\u01C8\u01CF\x05,\x17\b\u01C9\u01CA\f\x14\x02\x02\u01CA\u01CB" +
		"\x075\x02\x02\u01CB\u01CF\x07H\x02\x02\u01CC\u01CD\f\r\x02\x02\u01CD\u01CF" +
		"\x052\x1A\x02\u01CE\u01B4\x03\x02\x02\x02\u01CE\u01B8\x03\x02\x02\x02" +
		"\u01CE\u01BC\x03\x02\x02\x02\u01CE\u01C0\x03\x02\x02\x02\u01CE\u01C3\x03" +
		"\x02\x02\x02\u01CE\u01C6\x03\x02\x02\x02\u01CE\u01C9\x03\x02\x02\x02\u01CE" +
		"\u01CC\x03\x02\x02\x02\u01CF\u01D2\x03\x02\x02\x02\u01D0\u01CE\x03\x02" +
		"\x02\x02\u01D0\u01D1\x03\x02\x02\x02\u01D1-\x03\x02\x02\x02\u01D2\u01D0" +
		"\x03\x02\x02\x02\u01D3\u01D8\x050\x19\x02\u01D4\u01D5\x074\x02\x02\u01D5" +
		"\u01D7\x050\x19\x02\u01D6\u01D4\x03\x02\x02\x02\u01D7\u01DA\x03\x02\x02" +
		"\x02\u01D8\u01D6\x03\x02\x02\x02\u01D8\u01D9\x03\x02\x02\x02\u01D9\u01DC" +
		"\x03\x02\x02\x02\u01DA\u01D8\x03\x02\x02\x02\u01DB\u01DD\x074\x02\x02" +
		"\u01DC\u01DB\x03\x02\x02\x02\u01DC\u01DD\x03\x02\x02\x02\u01DD/\x03\x02" +
		"\x02\x02\u01DE\u01DF\x07H\x02\x02\u01DF\u01E0\x072\x02\x02\u01E0\u01E3" +
		"\x05,\x17\x02\u01E1\u01E3\x07H\x02\x02\u01E2\u01DE\x03\x02\x02\x02\u01E2" +
		"\u01E1\x03\x02\x02\x02\u01E31\x03\x02\x02\x02\u01E4\u01E5\x07*\x02\x02" +
		"\u01E5\u01F5\x07+\x02\x02\u01E6\u01E7\x07*\x02\x02\u01E7\u01EC\x05,\x17" +
		"\x02\u01E8\u01E9\x074\x02\x02\u01E9\u01EB\x05,\x17\x02\u01EA\u01E8\x03" +
		"\x02\x02\x02\u01EB\u01EE\x03\x02\x02\x02\u01EC\u01EA\x03\x02\x02\x02\u01EC" +
		"\u01ED\x03\x02\x02\x02\u01ED\u01F0\x03\x02\x02\x02\u01EE\u01EC\x03\x02" +
		"\x02\x02\u01EF\u01F1\x074\x02\x02\u01F0\u01EF\x03\x02\x02\x02\u01F0\u01F1" +
		"\x03\x02\x02\x02\u01F1\u01F2\x03\x02\x02\x02\u01F2\u01F3\x07+\x02\x02" +
		"\u01F3\u01F5\x03\x02\x02\x02\u01F4\u01E4\x03\x02\x02\x02\u01F4\u01E6\x03" +
		"\x02\x02\x02\u01F53\x03\x02\x02\x02\u01F6\u01F7\x07.\x02\x02\u01F7\u01FA" +
		"\x056\x1C\x02\u01F8\u01F9\x074\x02\x02\u01F9\u01FB\x056\x1C\x02\u01FA" +
		"\u01F8\x03\x02\x02\x02\u01FB\u01FC\x03\x02\x02\x02\u01FC\u01FA\x03\x02" +
		"\x02\x02\u01FC\u01FD\x03\x02\x02\x02\u01FD\u01FF\x03\x02\x02\x02\u01FE" +
		"\u0200\x074\x02\x02\u01FF\u01FE\x03\x02\x02\x02\u01FF\u0200\x03\x02\x02" +
		"\x02\u0200\u0201\x03\x02\x02\x02\u0201\u0202\x07/\x02\x02\u0202\u0214" +
		"\x03\x02\x02\x02\u0203\u0204\x07,\x02\x02\u0204\u0209\x058\x1D\x02\u0205" +
		"\u0206\x074\x02\x02\u0206\u0208\x058\x1D\x02\u0207\u0205\x03\x02\x02\x02" +
		"\u0208\u020B\x03\x02\x02\x02\u0209\u0207\x03\x02\x02\x02\u0209\u020A\x03" +
		"\x02\x02\x02\u020A\u020D\x03\x02\x02\x02\u020B\u0209\x03\x02\x02\x02\u020C" +
		"\u020E\x074\x02\x02\u020D\u020C\x03\x02\x02\x02\u020D\u020E\x03\x02\x02" +
		"\x02\u020E\u020F\x03\x02\x02\x02\u020F\u0210\x07-\x02\x02\u0210\u0214" +
		"\x03\x02\x02\x02\u0211\u0214\x07H\x02\x02\u0212\u0214\x07\x1B\x02\x02" +
		"\u0213\u01F6\x03\x02\x02\x02\u0213\u0203\x03\x02\x02\x02\u0213\u0211\x03" +
		"\x02\x02\x02\u0213\u0212\x03\x02\x02\x02\u02145\x03\x02\x02\x02\u0215" +
		"\u0216\t\x03\x02\x02\u02167\x03\x02\x02\x02\u0217\u021C\x07H\x02\x02\u0218" +
		"\u0219\x07H\x02\x02\u0219\u021A\x07\t\x02\x02\u021A\u021C\x07H\x02\x02" +
		"\u021B\u0217\x03\x02\x02\x02\u021B\u0218\x03\x02\x02\x02\u021C9\x03\x02" +
		"\x02\x02\u021D\u021E\t\x04\x02\x02\u021E;\x03\x02\x02\x02\u021F\u0220" +
		"\t\x05\x02\x02\u0220=\x03\x02\x02\x02\u0221\u0222\t\x06\x02\x02\u0222" +
		"?\x03\x02\x02\x02\u0223\u0224\t\x07\x02\x02\u0224A\x03\x02\x02\x02AEK" +
		"Wchouz\x80\x86\x8B\x92\x96\x99\x9D\xA6\xAA\xAC\xB1\xB7\xBB\xC4\xC8\xCA" +
		"\xCF\xD7\xE1\xE5\xEC\xEF\xF1\xF4\u0105\u010D\u0117\u011B\u0121\u0129\u0133" +
		"\u0143\u0147\u014E\u0153\u0166\u0169\u019D\u01A7\u01AB\u01B2\u01CE\u01D0" +
		"\u01D8\u01DC\u01E2\u01EC\u01F0\u01F4\u01FC\u01FF\u0209\u020D\u0213\u021B";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!PLParser.__ATN) {
			PLParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(PLParser._serializedATN));
		}

		return PLParser.__ATN;
	}

}

export class ModuleContext extends ParserRuleContext {
	public EOF(): TerminalNode { return this.getToken(PLParser.EOF, 0); }
	public importModuleMembers(): ImportModuleMembersContext[];
	public importModuleMembers(i: number): ImportModuleMembersContext;
	public importModuleMembers(i?: number): ImportModuleMembersContext | ImportModuleMembersContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ImportModuleMembersContext);
		} else {
			return this.getRuleContext(i, ImportModuleMembersContext);
		}
	}
	public moduleMember(): ModuleMemberContext[];
	public moduleMember(i: number): ModuleMemberContext;
	public moduleMember(i?: number): ModuleMemberContext | ModuleMemberContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ModuleMemberContext);
		} else {
			return this.getRuleContext(i, ModuleMemberContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_module; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitModule) {
			return visitor.visitModule(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ImportModuleMembersContext extends ParserRuleContext {
	public IMPORT(): TerminalNode { return this.getToken(PLParser.IMPORT, 0); }
	public LBRACE(): TerminalNode { return this.getToken(PLParser.LBRACE, 0); }
	public UpperId(): TerminalNode[];
	public UpperId(i: number): TerminalNode;
	public UpperId(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.UpperId);
		} else {
			return this.getToken(PLParser.UpperId, i);
		}
	}
	public RBRACE(): TerminalNode { return this.getToken(PLParser.RBRACE, 0); }
	public FROM(): TerminalNode { return this.getToken(PLParser.FROM, 0); }
	public moduleReference(): ModuleReferenceContext {
		return this.getRuleContext(0, ModuleReferenceContext);
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_importModuleMembers; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitImportModuleMembers) {
			return visitor.visitImportModuleMembers(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ModuleReferenceContext extends ParserRuleContext {
	public UpperId(): TerminalNode[];
	public UpperId(i: number): TerminalNode;
	public UpperId(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.UpperId);
		} else {
			return this.getToken(PLParser.UpperId, i);
		}
	}
	public DOT(): TerminalNode[];
	public DOT(i: number): TerminalNode;
	public DOT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.DOT);
		} else {
			return this.getToken(PLParser.DOT, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_moduleReference; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitModuleReference) {
			return visitor.visitModuleReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ModuleMemberContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_moduleMember; }
	public copyFrom(ctx: ModuleMemberContext): void {
		super.copyFrom(ctx);
	}
}
export class ClassAsModuleMemberContext extends ModuleMemberContext {
	public clazz(): ClazzContext {
		return this.getRuleContext(0, ClazzContext);
	}
	constructor(ctx: ModuleMemberContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitClassAsModuleMember) {
			return visitor.visitClassAsModuleMember(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class InterfaceAsModuleMemberContext extends ModuleMemberContext {
	public interfaze(): InterfazeContext {
		return this.getRuleContext(0, InterfazeContext);
	}
	constructor(ctx: ModuleMemberContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitInterfaceAsModuleMember) {
			return visitor.visitInterfaceAsModuleMember(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ClazzContext extends ParserRuleContext {
	public classHeaderDeclaration(): ClassHeaderDeclarationContext {
		return this.getRuleContext(0, ClassHeaderDeclarationContext);
	}
	public LBRACE(): TerminalNode { return this.getToken(PLParser.LBRACE, 0); }
	public RBRACE(): TerminalNode { return this.getToken(PLParser.RBRACE, 0); }
	public classMemberDefinition(): ClassMemberDefinitionContext[];
	public classMemberDefinition(i: number): ClassMemberDefinitionContext;
	public classMemberDefinition(i?: number): ClassMemberDefinitionContext | ClassMemberDefinitionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ClassMemberDefinitionContext);
		} else {
			return this.getRuleContext(i, ClassMemberDefinitionContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_clazz; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitClazz) {
			return visitor.visitClazz(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InterfazeContext extends ParserRuleContext {
	public INTERFACE(): TerminalNode { return this.getToken(PLParser.INTERFACE, 0); }
	public UpperId(): TerminalNode { return this.getToken(PLParser.UpperId, 0); }
	public LBRACE(): TerminalNode { return this.getToken(PLParser.LBRACE, 0); }
	public RBRACE(): TerminalNode { return this.getToken(PLParser.RBRACE, 0); }
	public PRIVATE(): TerminalNode | undefined { return this.tryGetToken(PLParser.PRIVATE, 0); }
	public typeParametersDeclaration(): TypeParametersDeclarationContext | undefined {
		return this.tryGetRuleContext(0, TypeParametersDeclarationContext);
	}
	public classMemberDeclaration(): ClassMemberDeclarationContext[];
	public classMemberDeclaration(i: number): ClassMemberDeclarationContext;
	public classMemberDeclaration(i?: number): ClassMemberDeclarationContext | ClassMemberDeclarationContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ClassMemberDeclarationContext);
		} else {
			return this.getRuleContext(i, ClassMemberDeclarationContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_interfaze; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitInterfaze) {
			return visitor.visitInterfaze(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ClassHeaderDeclarationContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_classHeaderDeclaration; }
	public copyFrom(ctx: ClassHeaderDeclarationContext): void {
		super.copyFrom(ctx);
	}
}
export class ClassHeaderContext extends ClassHeaderDeclarationContext {
	public CLASS(): TerminalNode { return this.getToken(PLParser.CLASS, 0); }
	public UpperId(): TerminalNode { return this.getToken(PLParser.UpperId, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public typeDeclaration(): TypeDeclarationContext {
		return this.getRuleContext(0, TypeDeclarationContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	public PRIVATE(): TerminalNode | undefined { return this.tryGetToken(PLParser.PRIVATE, 0); }
	public typeParametersDeclaration(): TypeParametersDeclarationContext | undefined {
		return this.tryGetRuleContext(0, TypeParametersDeclarationContext);
	}
	constructor(ctx: ClassHeaderDeclarationContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitClassHeader) {
			return visitor.visitClassHeader(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class UtilClassHeaderContext extends ClassHeaderDeclarationContext {
	public CLASS(): TerminalNode { return this.getToken(PLParser.CLASS, 0); }
	public UpperId(): TerminalNode { return this.getToken(PLParser.UpperId, 0); }
	public PRIVATE(): TerminalNode | undefined { return this.tryGetToken(PLParser.PRIVATE, 0); }
	constructor(ctx: ClassHeaderDeclarationContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitUtilClassHeader) {
			return visitor.visitUtilClassHeader(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ClassMemberDefinitionContext extends ParserRuleContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	public ASSIGN(): TerminalNode { return this.getToken(PLParser.ASSIGN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public FUNCTION(): TerminalNode | undefined { return this.tryGetToken(PLParser.FUNCTION, 0); }
	public METHOD(): TerminalNode | undefined { return this.tryGetToken(PLParser.METHOD, 0); }
	public PRIVATE(): TerminalNode | undefined { return this.tryGetToken(PLParser.PRIVATE, 0); }
	public typeParametersDeclaration(): TypeParametersDeclarationContext | undefined {
		return this.tryGetRuleContext(0, TypeParametersDeclarationContext);
	}
	public annotatedVariable(): AnnotatedVariableContext[];
	public annotatedVariable(i: number): AnnotatedVariableContext;
	public annotatedVariable(i?: number): AnnotatedVariableContext | AnnotatedVariableContext[] {
		if (i === undefined) {
			return this.getRuleContexts(AnnotatedVariableContext);
		} else {
			return this.getRuleContext(i, AnnotatedVariableContext);
		}
	}
	public COLON(): TerminalNode | undefined { return this.tryGetToken(PLParser.COLON, 0); }
	public typeExpr(): TypeExprContext | undefined {
		return this.tryGetRuleContext(0, TypeExprContext);
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_classMemberDefinition; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitClassMemberDefinition) {
			return visitor.visitClassMemberDefinition(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ClassMemberDeclarationContext extends ParserRuleContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	public FUNCTION(): TerminalNode | undefined { return this.tryGetToken(PLParser.FUNCTION, 0); }
	public METHOD(): TerminalNode | undefined { return this.tryGetToken(PLParser.METHOD, 0); }
	public PRIVATE(): TerminalNode | undefined { return this.tryGetToken(PLParser.PRIVATE, 0); }
	public typeParametersDeclaration(): TypeParametersDeclarationContext | undefined {
		return this.tryGetRuleContext(0, TypeParametersDeclarationContext);
	}
	public annotatedVariable(): AnnotatedVariableContext[];
	public annotatedVariable(i: number): AnnotatedVariableContext;
	public annotatedVariable(i?: number): AnnotatedVariableContext | AnnotatedVariableContext[] {
		if (i === undefined) {
			return this.getRuleContexts(AnnotatedVariableContext);
		} else {
			return this.getRuleContext(i, AnnotatedVariableContext);
		}
	}
	public COLON(): TerminalNode | undefined { return this.tryGetToken(PLParser.COLON, 0); }
	public typeExpr(): TypeExprContext | undefined {
		return this.tryGetRuleContext(0, TypeExprContext);
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_classMemberDeclaration; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitClassMemberDeclaration) {
			return visitor.visitClassMemberDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeParametersDeclarationContext extends ParserRuleContext {
	public LT(): TerminalNode { return this.getToken(PLParser.LT, 0); }
	public UpperId(): TerminalNode[];
	public UpperId(i: number): TerminalNode;
	public UpperId(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.UpperId);
		} else {
			return this.getToken(PLParser.UpperId, i);
		}
	}
	public GT(): TerminalNode { return this.getToken(PLParser.GT, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_typeParametersDeclaration; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTypeParametersDeclaration) {
			return visitor.visitTypeParametersDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeDeclarationContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_typeDeclaration; }
	public copyFrom(ctx: TypeDeclarationContext): void {
		super.copyFrom(ctx);
	}
}
export class ObjTypeContext extends TypeDeclarationContext {
	public objectTypeFieldDeclaration(): ObjectTypeFieldDeclarationContext[];
	public objectTypeFieldDeclaration(i: number): ObjectTypeFieldDeclarationContext;
	public objectTypeFieldDeclaration(i?: number): ObjectTypeFieldDeclarationContext | ObjectTypeFieldDeclarationContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ObjectTypeFieldDeclarationContext);
		} else {
			return this.getRuleContext(i, ObjectTypeFieldDeclarationContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(ctx: TypeDeclarationContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitObjType) {
			return visitor.visitObjType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class VariantTypeContext extends TypeDeclarationContext {
	public variantTypeConstructorDeclaration(): VariantTypeConstructorDeclarationContext[];
	public variantTypeConstructorDeclaration(i: number): VariantTypeConstructorDeclarationContext;
	public variantTypeConstructorDeclaration(i?: number): VariantTypeConstructorDeclarationContext | VariantTypeConstructorDeclarationContext[] {
		if (i === undefined) {
			return this.getRuleContexts(VariantTypeConstructorDeclarationContext);
		} else {
			return this.getRuleContext(i, VariantTypeConstructorDeclarationContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(ctx: TypeDeclarationContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitVariantType) {
			return visitor.visitVariantType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ObjectTypeFieldDeclarationContext extends ParserRuleContext {
	public VAL(): TerminalNode { return this.getToken(PLParser.VAL, 0); }
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	public typeAnnotation(): TypeAnnotationContext {
		return this.getRuleContext(0, TypeAnnotationContext);
	}
	public PRIVATE(): TerminalNode | undefined { return this.tryGetToken(PLParser.PRIVATE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_objectTypeFieldDeclaration; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitObjectTypeFieldDeclaration) {
			return visitor.visitObjectTypeFieldDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class VariantTypeConstructorDeclarationContext extends ParserRuleContext {
	public UpperId(): TerminalNode { return this.getToken(PLParser.UpperId, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public typeExpr(): TypeExprContext {
		return this.getRuleContext(0, TypeExprContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_variantTypeConstructorDeclaration; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitVariantTypeConstructorDeclaration) {
			return visitor.visitVariantTypeConstructorDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeExprContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_typeExpr; }
	public copyFrom(ctx: TypeExprContext): void {
		super.copyFrom(ctx);
	}
}
export class UnitTypeContext extends TypeExprContext {
	public UNIT(): TerminalNode { return this.getToken(PLParser.UNIT, 0); }
	constructor(ctx: TypeExprContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitUnitType) {
			return visitor.visitUnitType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class IntTypeContext extends TypeExprContext {
	public INT(): TerminalNode { return this.getToken(PLParser.INT, 0); }
	constructor(ctx: TypeExprContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitIntType) {
			return visitor.visitIntType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class StrTypeContext extends TypeExprContext {
	public STRING(): TerminalNode { return this.getToken(PLParser.STRING, 0); }
	constructor(ctx: TypeExprContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitStrType) {
			return visitor.visitStrType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class BoolTypeContext extends TypeExprContext {
	public BOOL(): TerminalNode { return this.getToken(PLParser.BOOL, 0); }
	constructor(ctx: TypeExprContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitBoolType) {
			return visitor.visitBoolType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class SingleIdentifierTypeContext extends TypeExprContext {
	public UpperId(): TerminalNode { return this.getToken(PLParser.UpperId, 0); }
	public typeParameters(): TypeParametersContext | undefined {
		return this.tryGetRuleContext(0, TypeParametersContext);
	}
	constructor(ctx: TypeExprContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitSingleIdentifierType) {
			return visitor.visitSingleIdentifierType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class TupleTypeContext extends TypeExprContext {
	public LBRACKET(): TerminalNode { return this.getToken(PLParser.LBRACKET, 0); }
	public typeExpr(): TypeExprContext[];
	public typeExpr(i: number): TypeExprContext;
	public typeExpr(i?: number): TypeExprContext | TypeExprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(TypeExprContext);
		} else {
			return this.getRuleContext(i, TypeExprContext);
		}
	}
	public RBRACKET(): TerminalNode { return this.getToken(PLParser.RBRACKET, 0); }
	public MUL(): TerminalNode[];
	public MUL(i: number): TerminalNode;
	public MUL(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.MUL);
		} else {
			return this.getToken(PLParser.MUL, i);
		}
	}
	constructor(ctx: TypeExprContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTupleType) {
			return visitor.visitTupleType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class FunctionTypeContext extends TypeExprContext {
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public typeExpr(): TypeExprContext[];
	public typeExpr(i: number): TypeExprContext;
	public typeExpr(i?: number): TypeExprContext | TypeExprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(TypeExprContext);
		} else {
			return this.getRuleContext(i, TypeExprContext);
		}
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	public ARROW(): TerminalNode { return this.getToken(PLParser.ARROW, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(ctx: TypeExprContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitFunctionType) {
			return visitor.visitFunctionType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeParametersContext extends ParserRuleContext {
	public LT(): TerminalNode { return this.getToken(PLParser.LT, 0); }
	public typeExpr(): TypeExprContext[];
	public typeExpr(i: number): TypeExprContext;
	public typeExpr(i?: number): TypeExprContext | TypeExprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(TypeExprContext);
		} else {
			return this.getRuleContext(i, TypeExprContext);
		}
	}
	public GT(): TerminalNode { return this.getToken(PLParser.GT, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_typeParameters; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTypeParameters) {
			return visitor.visitTypeParameters(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class AnnotatedVariableContext extends ParserRuleContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	public typeAnnotation(): TypeAnnotationContext {
		return this.getRuleContext(0, TypeAnnotationContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_annotatedVariable; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitAnnotatedVariable) {
			return visitor.visitAnnotatedVariable(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class OptionallyAnnotatedParameterContext extends ParserRuleContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	public typeAnnotation(): TypeAnnotationContext | undefined {
		return this.tryGetRuleContext(0, TypeAnnotationContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_optionallyAnnotatedParameter; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitOptionallyAnnotatedParameter) {
			return visitor.visitOptionallyAnnotatedParameter(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeAnnotationContext extends ParserRuleContext {
	public COLON(): TerminalNode { return this.getToken(PLParser.COLON, 0); }
	public typeExpr(): TypeExprContext {
		return this.getRuleContext(0, TypeExprContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_typeAnnotation; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTypeAnnotation) {
			return visitor.visitTypeAnnotation(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PatternToExprContext extends ParserRuleContext {
	public BAR(): TerminalNode { return this.getToken(PLParser.BAR, 0); }
	public ARROW(): TerminalNode { return this.getToken(PLParser.ARROW, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public UpperId(): TerminalNode | undefined { return this.tryGetToken(PLParser.UpperId, 0); }
	public varOrWildCard(): VarOrWildCardContext | undefined {
		return this.tryGetRuleContext(0, VarOrWildCardContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_patternToExpr; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitPatternToExpr) {
			return visitor.visitPatternToExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class StatementBlockContext extends ParserRuleContext {
	public LBRACE(): TerminalNode { return this.getToken(PLParser.LBRACE, 0); }
	public RBRACE(): TerminalNode { return this.getToken(PLParser.RBRACE, 0); }
	public statement(): StatementContext[];
	public statement(i: number): StatementContext;
	public statement(i?: number): StatementContext | StatementContext[] {
		if (i === undefined) {
			return this.getRuleContexts(StatementContext);
		} else {
			return this.getRuleContext(i, StatementContext);
		}
	}
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_statementBlock; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitStatementBlock) {
			return visitor.visitStatementBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class StatementContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_statement; }
	public copyFrom(ctx: StatementContext): void {
		super.copyFrom(ctx);
	}
}
export class ValStatementContext extends StatementContext {
	public VAL(): TerminalNode { return this.getToken(PLParser.VAL, 0); }
	public pattern(): PatternContext {
		return this.getRuleContext(0, PatternContext);
	}
	public ASSIGN(): TerminalNode { return this.getToken(PLParser.ASSIGN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public typeAnnotation(): TypeAnnotationContext | undefined {
		return this.tryGetRuleContext(0, TypeAnnotationContext);
	}
	public SEMICOLON(): TerminalNode | undefined { return this.tryGetToken(PLParser.SEMICOLON, 0); }
	constructor(ctx: StatementContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitValStatement) {
			return visitor.visitValStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ExpressionContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_expression; }
	public copyFrom(ctx: ExpressionContext): void {
		super.copyFrom(ctx);
	}
}
export class NestedExprContext extends ExpressionContext {
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitNestedExpr) {
			return visitor.visitNestedExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class LiteralExprContext extends ExpressionContext {
	public literal(): LiteralContext {
		return this.getRuleContext(0, LiteralContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitLiteralExpr) {
			return visitor.visitLiteralExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ThisExprContext extends ExpressionContext {
	public THIS(): TerminalNode { return this.getToken(PLParser.THIS, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitThisExpr) {
			return visitor.visitThisExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class VariableExprContext extends ExpressionContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitVariableExpr) {
			return visitor.visitVariableExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ClassMemberExprContext extends ExpressionContext {
	public UpperId(): TerminalNode { return this.getToken(PLParser.UpperId, 0); }
	public DOT(): TerminalNode { return this.getToken(PLParser.DOT, 0); }
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitClassMemberExpr) {
			return visitor.visitClassMemberExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class TupleConstructorContext extends ExpressionContext {
	public LBRACKET(): TerminalNode { return this.getToken(PLParser.LBRACKET, 0); }
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public RBRACKET(): TerminalNode { return this.getToken(PLParser.RBRACKET, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTupleConstructor) {
			return visitor.visitTupleConstructor(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ObjConstructorContext extends ExpressionContext {
	public LBRACE(): TerminalNode { return this.getToken(PLParser.LBRACE, 0); }
	public objectFieldDeclarations(): ObjectFieldDeclarationsContext {
		return this.getRuleContext(0, ObjectFieldDeclarationsContext);
	}
	public RBRACE(): TerminalNode { return this.getToken(PLParser.RBRACE, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitObjConstructor) {
			return visitor.visitObjConstructor(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class VariantConstructorContext extends ExpressionContext {
	public UpperId(): TerminalNode { return this.getToken(PLParser.UpperId, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitVariantConstructor) {
			return visitor.visitVariantConstructor(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class FieldAccessExprContext extends ExpressionContext {
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public DOT(): TerminalNode { return this.getToken(PLParser.DOT, 0); }
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitFieldAccessExpr) {
			return visitor.visitFieldAccessExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class NegExprContext extends ExpressionContext {
	public MINUS(): TerminalNode { return this.getToken(PLParser.MINUS, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitNegExpr) {
			return visitor.visitNegExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class NotExprContext extends ExpressionContext {
	public NOT(): TerminalNode { return this.getToken(PLParser.NOT, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitNotExpr) {
			return visitor.visitNotExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class PanicExprContext extends ExpressionContext {
	public PANIC(): TerminalNode { return this.getToken(PLParser.PANIC, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitPanicExpr) {
			return visitor.visitPanicExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class StringToIntExprContext extends ExpressionContext {
	public STRING2INT(): TerminalNode { return this.getToken(PLParser.STRING2INT, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitStringToIntExpr) {
			return visitor.visitStringToIntExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class IntToStringExprContext extends ExpressionContext {
	public INT2STRING(): TerminalNode { return this.getToken(PLParser.INT2STRING, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitIntToStringExpr) {
			return visitor.visitIntToStringExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class PrintLineExprContext extends ExpressionContext {
	public PRINTLN(): TerminalNode { return this.getToken(PLParser.PRINTLN, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitPrintLineExpr) {
			return visitor.visitPrintLineExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class FunctionApplicationExprContext extends ExpressionContext {
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public functionArguments(): FunctionArgumentsContext {
		return this.getRuleContext(0, FunctionArgumentsContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitFunctionApplicationExpr) {
			return visitor.visitFunctionApplicationExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class FactorExprContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public factorOperator(): FactorOperatorContext {
		return this.getRuleContext(0, FactorOperatorContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitFactorExpr) {
			return visitor.visitFactorExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class TermExprContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public termOperator(): TermOperatorContext {
		return this.getRuleContext(0, TermOperatorContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTermExpr) {
			return visitor.visitTermExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ComparisonExprContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public comparisonOperator(): ComparisonOperatorContext {
		return this.getRuleContext(0, ComparisonOperatorContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitComparisonExpr) {
			return visitor.visitComparisonExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ConjunctionExprContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public AND(): TerminalNode { return this.getToken(PLParser.AND, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitConjunctionExpr) {
			return visitor.visitConjunctionExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class DisjunctionExprContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public OR(): TerminalNode { return this.getToken(PLParser.OR, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitDisjunctionExpr) {
			return visitor.visitDisjunctionExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ConcatExprContext extends ExpressionContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public COLONCOLON(): TerminalNode { return this.getToken(PLParser.COLONCOLON, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitConcatExpr) {
			return visitor.visitConcatExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class IfElseExprContext extends ExpressionContext {
	public IF(): TerminalNode { return this.getToken(PLParser.IF, 0); }
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public THEN(): TerminalNode { return this.getToken(PLParser.THEN, 0); }
	public ELSE(): TerminalNode { return this.getToken(PLParser.ELSE, 0); }
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitIfElseExpr) {
			return visitor.visitIfElseExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class MatchExprContext extends ExpressionContext {
	public MATCH(): TerminalNode { return this.getToken(PLParser.MATCH, 0); }
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	public LBRACE(): TerminalNode { return this.getToken(PLParser.LBRACE, 0); }
	public RBRACE(): TerminalNode { return this.getToken(PLParser.RBRACE, 0); }
	public patternToExpr(): PatternToExprContext[];
	public patternToExpr(i: number): PatternToExprContext;
	public patternToExpr(i?: number): PatternToExprContext | PatternToExprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(PatternToExprContext);
		} else {
			return this.getRuleContext(i, PatternToExprContext);
		}
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitMatchExpr) {
			return visitor.visitMatchExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class FunExprContext extends ExpressionContext {
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public optionallyAnnotatedParameter(): OptionallyAnnotatedParameterContext[];
	public optionallyAnnotatedParameter(i: number): OptionallyAnnotatedParameterContext;
	public optionallyAnnotatedParameter(i?: number): OptionallyAnnotatedParameterContext | OptionallyAnnotatedParameterContext[] {
		if (i === undefined) {
			return this.getRuleContexts(OptionallyAnnotatedParameterContext);
		} else {
			return this.getRuleContext(i, OptionallyAnnotatedParameterContext);
		}
	}
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	public ARROW(): TerminalNode { return this.getToken(PLParser.ARROW, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitFunExpr) {
			return visitor.visitFunExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class StatementBlockExprContext extends ExpressionContext {
	public statementBlock(): StatementBlockContext {
		return this.getRuleContext(0, StatementBlockContext);
	}
	constructor(ctx: ExpressionContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitStatementBlockExpr) {
			return visitor.visitStatementBlockExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ObjectFieldDeclarationsContext extends ParserRuleContext {
	public objectFieldDeclaration(): ObjectFieldDeclarationContext[];
	public objectFieldDeclaration(i: number): ObjectFieldDeclarationContext;
	public objectFieldDeclaration(i?: number): ObjectFieldDeclarationContext | ObjectFieldDeclarationContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ObjectFieldDeclarationContext);
		} else {
			return this.getRuleContext(i, ObjectFieldDeclarationContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_objectFieldDeclarations; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitObjectFieldDeclarations) {
			return visitor.visitObjectFieldDeclarations(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ObjectFieldDeclarationContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_objectFieldDeclaration; }
	public copyFrom(ctx: ObjectFieldDeclarationContext): void {
		super.copyFrom(ctx);
	}
}
export class NormalObjFieldDeclarationContext extends ObjectFieldDeclarationContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	public COLON(): TerminalNode { return this.getToken(PLParser.COLON, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	constructor(ctx: ObjectFieldDeclarationContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitNormalObjFieldDeclaration) {
			return visitor.visitNormalObjFieldDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ShorthandObjFieldDeclarationContext extends ObjectFieldDeclarationContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	constructor(ctx: ObjectFieldDeclarationContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitShorthandObjFieldDeclaration) {
			return visitor.visitShorthandObjFieldDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class FunctionArgumentsContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(PLParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(PLParser.RPAREN, 0); }
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_functionArguments; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitFunctionArguments) {
			return visitor.visitFunctionArguments(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PatternContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_pattern; }
	public copyFrom(ctx: PatternContext): void {
		super.copyFrom(ctx);
	}
}
export class TuplePatternContext extends PatternContext {
	public LBRACKET(): TerminalNode { return this.getToken(PLParser.LBRACKET, 0); }
	public varOrWildCard(): VarOrWildCardContext[];
	public varOrWildCard(i: number): VarOrWildCardContext;
	public varOrWildCard(i?: number): VarOrWildCardContext | VarOrWildCardContext[] {
		if (i === undefined) {
			return this.getRuleContexts(VarOrWildCardContext);
		} else {
			return this.getRuleContext(i, VarOrWildCardContext);
		}
	}
	public RBRACKET(): TerminalNode { return this.getToken(PLParser.RBRACKET, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(ctx: PatternContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTuplePattern) {
			return visitor.visitTuplePattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ObjectPatternContext extends PatternContext {
	public LBRACE(): TerminalNode { return this.getToken(PLParser.LBRACE, 0); }
	public varOrRenamedVar(): VarOrRenamedVarContext[];
	public varOrRenamedVar(i: number): VarOrRenamedVarContext;
	public varOrRenamedVar(i?: number): VarOrRenamedVarContext | VarOrRenamedVarContext[] {
		if (i === undefined) {
			return this.getRuleContexts(VarOrRenamedVarContext);
		} else {
			return this.getRuleContext(i, VarOrRenamedVarContext);
		}
	}
	public RBRACE(): TerminalNode { return this.getToken(PLParser.RBRACE, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.COMMA);
		} else {
			return this.getToken(PLParser.COMMA, i);
		}
	}
	constructor(ctx: PatternContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitObjectPattern) {
			return visitor.visitObjectPattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class VariablePatternContext extends PatternContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	constructor(ctx: PatternContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitVariablePattern) {
			return visitor.visitVariablePattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class WildcardPatternContext extends PatternContext {
	public WILDCARD(): TerminalNode { return this.getToken(PLParser.WILDCARD, 0); }
	constructor(ctx: PatternContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitWildcardPattern) {
			return visitor.visitWildcardPattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class VarOrWildCardContext extends ParserRuleContext {
	public LowerId(): TerminalNode | undefined { return this.tryGetToken(PLParser.LowerId, 0); }
	public WILDCARD(): TerminalNode | undefined { return this.tryGetToken(PLParser.WILDCARD, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_varOrWildCard; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitVarOrWildCard) {
			return visitor.visitVarOrWildCard(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class VarOrRenamedVarContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_varOrRenamedVar; }
	public copyFrom(ctx: VarOrRenamedVarContext): void {
		super.copyFrom(ctx);
	}
}
export class RawVarContext extends VarOrRenamedVarContext {
	public LowerId(): TerminalNode { return this.getToken(PLParser.LowerId, 0); }
	constructor(ctx: VarOrRenamedVarContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitRawVar) {
			return visitor.visitRawVar(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class RenamedVarContext extends VarOrRenamedVarContext {
	public LowerId(): TerminalNode[];
	public LowerId(i: number): TerminalNode;
	public LowerId(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(PLParser.LowerId);
		} else {
			return this.getToken(PLParser.LowerId, i);
		}
	}
	public AS(): TerminalNode { return this.getToken(PLParser.AS, 0); }
	constructor(ctx: VarOrRenamedVarContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitRenamedVar) {
			return visitor.visitRenamedVar(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class FactorOperatorContext extends ParserRuleContext {
	public MUL(): TerminalNode | undefined { return this.tryGetToken(PLParser.MUL, 0); }
	public DIV(): TerminalNode | undefined { return this.tryGetToken(PLParser.DIV, 0); }
	public MOD(): TerminalNode | undefined { return this.tryGetToken(PLParser.MOD, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_factorOperator; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitFactorOperator) {
			return visitor.visitFactorOperator(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TermOperatorContext extends ParserRuleContext {
	public PLUS(): TerminalNode | undefined { return this.tryGetToken(PLParser.PLUS, 0); }
	public MINUS(): TerminalNode | undefined { return this.tryGetToken(PLParser.MINUS, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_termOperator; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitTermOperator) {
			return visitor.visitTermOperator(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ComparisonOperatorContext extends ParserRuleContext {
	public LT(): TerminalNode | undefined { return this.tryGetToken(PLParser.LT, 0); }
	public LE(): TerminalNode | undefined { return this.tryGetToken(PLParser.LE, 0); }
	public GT(): TerminalNode | undefined { return this.tryGetToken(PLParser.GT, 0); }
	public GE(): TerminalNode | undefined { return this.tryGetToken(PLParser.GE, 0); }
	public STRUCT_EQ(): TerminalNode | undefined { return this.tryGetToken(PLParser.STRUCT_EQ, 0); }
	public STRUCT_NE(): TerminalNode | undefined { return this.tryGetToken(PLParser.STRUCT_NE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_comparisonOperator; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitComparisonOperator) {
			return visitor.visitComparisonOperator(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class LiteralContext extends ParserRuleContext {
	public TRUE(): TerminalNode | undefined { return this.tryGetToken(PLParser.TRUE, 0); }
	public FALSE(): TerminalNode | undefined { return this.tryGetToken(PLParser.FALSE, 0); }
	public MinInt(): TerminalNode | undefined { return this.tryGetToken(PLParser.MinInt, 0); }
	public IntLiteral(): TerminalNode | undefined { return this.tryGetToken(PLParser.IntLiteral, 0); }
	public StrLiteral(): TerminalNode | undefined { return this.tryGetToken(PLParser.StrLiteral, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return PLParser.RULE_literal; }
	// @Override
	public accept<Result>(visitor: PLVisitor<Result>): Result {
		if (visitor.visitLiteral) {
			return visitor.visitLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


