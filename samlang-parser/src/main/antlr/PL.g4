grammar PL;

import PLLexerPart;

module : importModuleMembers* clazz* EOF;

importModuleMembers : IMPORT LBRACE UpperId (COMMA UpperId)* RBRACE FROM moduleReference;
moduleReference : UpperId (DOT UpperId)*;

clazz : classHeaderDeclaration LBRACE classMemberDefinition* RBRACE;

// Module Level Declarations
classHeaderDeclaration
    : CLASS UpperId typeParametersDeclaration? LPAREN typeDeclaration RPAREN # ClassHeader
    | CLASS UpperId # UtilClassHeader
    ;
classMemberDefinition
    : PRIVATE? (FUNCTION | METHOD) typeParametersDeclaration? LowerId
        LPAREN (annotatedVariable (COMMA annotatedVariable)* COMMA?)? RPAREN (COLON typeExpr)?
      ASSIGN expression
    ;
typeParametersDeclaration : LT UpperId (COMMA UpperId)* GT;

typeDeclaration
    : objectTypeFieldDeclaration (COMMA objectTypeFieldDeclaration)* COMMA? # ObjType
    | variantTypeConstructorDeclaration (COMMA variantTypeConstructorDeclaration)+ COMMA? # VariantType
    ;
objectTypeFieldDeclaration : PRIVATE? VAL LowerId typeAnnotation;
variantTypeConstructorDeclaration : UpperId LPAREN typeExpr RPAREN;

// Type expressions
typeExpr
    : UNIT # UnitType
    | INT # IntType
    | STRING # StrType
    | BOOL # BoolType
    | UpperId typeParameters? # SingleIdentifierType
    | LBRACKET typeExpr (MUL typeExpr)+ RBRACKET # TupleType
    | LPAREN typeExpr (COMMA typeExpr)* COMMA? RPAREN ARROW typeExpr # FunctionType
    ;

// Some parser type fragment
typeParameters : LT typeExpr (COMMA typeExpr)* GT;
annotatedVariable : LowerId typeAnnotation;
optionallyAnnotatedParameter : LowerId typeAnnotation?;
typeAnnotation : COLON typeExpr;

patternToExpr : BAR (UpperId varOrWildCard) ARROW expression;

statementBlock : LBRACE statement* expression? RBRACE;

statement
    : VAL pattern typeAnnotation? ASSIGN expression SEMICOLON? # ValStatement
    ;

expression
    : LPAREN expression RPAREN # NestedExpr
    | literal # LiteralExpr
    | THIS # ThisExpr
    | LowerId # VariableExpr
    | UpperId DOT LowerId # ModuleMemberExpr
    | LBRACKET expression (COMMA expression)+ COMMA? RBRACKET # TupleConstructor
    | LBRACE objectFieldDeclarations RBRACE # ObjConstructor
    | UpperId LPAREN expression RPAREN # VariantConstructor
    | expression DOT LowerId # FieldAccessExpr
    | MINUS expression # NegExpr
    | NOT expression # NotExpr
    | PANIC LPAREN expression RPAREN # PanicExpr
    | expression functionArguments # FunctionApplicationExpr
    | expression factorOperator expression # FactorExpr
    | expression termOperator expression # TermExpr
    | expression comparisonOperator expression # ComparisonExpr
    | expression AND expression # ConjunctionExpr
    | expression OR expression # DisjunctionExpr
    | IF expression THEN expression ELSE expression # IfElseExpr
    | MATCH LPAREN expression RPAREN LBRACE patternToExpr+ RBRACE # MatchExpr
    | LPAREN optionallyAnnotatedParameter (COMMA optionallyAnnotatedParameter)* COMMA? RPAREN ARROW expression # FunExpr
    | statementBlock # StatementBlockExpr
    ;

objectFieldDeclarations : objectFieldDeclaration (COMMA objectFieldDeclaration)* COMMA?;
objectFieldDeclaration
    : LowerId COLON expression # NormalObjFieldDeclaration
    | LowerId # ShorthandObjFieldDeclaration
    ;
functionArguments : LPAREN RPAREN | LPAREN expression (COMMA expression)* COMMA? RPAREN;

pattern
    : LBRACKET varOrWildCard (COMMA varOrWildCard)+ COMMA? RBRACKET # TuplePattern
    | LBRACE varOrRenamedVar (COMMA varOrRenamedVar)* COMMA? RBRACE # ObjectPattern
    | LowerId # VariablePattern
    | WILDCARD # WildcardPattern
    ;
varOrWildCard : LowerId | WILDCARD;
varOrRenamedVar
    : LowerId # RawVar
    | LowerId AS LowerId # RenamedVar
    ;

// All Operators
factorOperator : MUL | DIV | MOD;
termOperator : PLUS | MINUS;
comparisonOperator : LT | LE | GT | GE | STRUCT_EQ | STRUCT_NE;

// Literals
literal : UNIT | TRUE | FALSE | MinInt | IntLiteral | StrLiteral;
