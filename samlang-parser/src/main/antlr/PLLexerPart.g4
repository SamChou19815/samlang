/**
 * {@code PLLexer} is the lexer of the PL.
 * No parser rules should ever appear in this file.
 */
lexer grammar PLLexerPart;

/*
 * ----------------------------------------------------------------------------
 * PART 1: Keywords
 * ----------------------------------------------------------------------------
 */

// Imports
IMPORT : 'import';
FROM : 'from';

// Declarations
CLASS : 'class';
VAL : 'val';
FUNCTION : 'function';
METHOD : 'method';
AS : 'as';

// Visibility modifiers
PRIVATE : 'private';
PROTECTED : 'protected';
INTERNAL : 'internal';
PUBLIC : 'public';

// Control Flow
IF : 'if';
THEN : 'then';
ELSE : 'else';
MATCH : 'match';
PANIC : 'panic';
RETURN : 'return';

// Type Keywords
INT : 'int';
STRING : 'string';
BOOL : 'bool';
UNIT : 'unit';

// Some Important Literals
TRUE : 'true';
FALSE : 'false';
THIS : 'this';
WILDCARD : '_';

// Builtins
STRING2INT: 'stringToInt';
INT2STRING: 'intToString';
PRINTLN: 'println';

// Forbidden Names
SELF : 'self';
CONST : 'const';
LET : 'let';
VAR : 'var';
TYPE : 'type';
INTERFACE : 'interface';
EXTENDS : 'extends';
IMPLEMENTS : 'implements';
EXPORT : 'export';
ASSERT : 'assert';

/*
 * ----------------------------------------------------------------------------
 * PART 2: Parentheses & Separators
 * ----------------------------------------------------------------------------
 */

LPAREN : '(';
RPAREN : ')';

LBRACE : '{';
RBRACE : '}';

LBRACKET : '[';
RBRACKET : ']';

// SEPARATORS

QUESTION : '?';
SEMICOLON : ';';
COLON : ':';
COLONCOLON : '::';
COMMA : ',';
DOT : '.';


BAR : '|';
ARROW : '->';

/*
 * ----------------------------------------------------------------------------
 * PART 3: Operators
 * ----------------------------------------------------------------------------
 */

ASSIGN : '=';

NOT : '!';

MUL : '*';
DIV : '/';
MOD : '%';

PLUS : '+';
MINUS : '-';

STRUCT_EQ : '==';
LT : '<';
LE : '<=';
GT : '>';
GE : '>=';
STRUCT_NE : '!=';

AND : '&&';
OR : '||';

SPREAD : '...';

/*
 * ----------------------------------------------------------------------------
 * PART 4: Identifiers
 * ----------------------------------------------------------------------------
 */

LowerId : LowerLetter (Letter | Digit)*;
UpperId : UpperLetter (Letter | Digit)*;

// Letters
fragment Letter : LowerLetter | UpperLetter;
fragment LowerLetter : 'a'..'z';
fragment UpperLetter : 'A'..'Z';

/*
 * ----------------------------------------------------------------------------
 * PART 5: Literals
 * ----------------------------------------------------------------------------
 */

MinInt : '-9223372036854775808';
IntLiteral : HexLiteral | OctalLiteral | DecimalLiteral;
StrLiteral : '"' ( EscapeSequence | ~('\\'|'"') )* '"';

// Base Literals
HexLiteral : '0' ('x'|'X') HexDigit+;
DecimalLiteral : ('0' | '1'..'9' '0'..'9'*);
OctalLiteral : '0' ('0'..'7')+;

// Digits
fragment Digit : NonZeroDigit | ZeroDigit;
fragment NonZeroDigit : '1'..'9';
fragment ZeroDigit : '0';
fragment HexDigit : ('0'..'9'|'a'..'f'|'A'..'F');

// Escapes
fragment EscapeSequence : '\\' ('b'|'t'|'n'|'f'|'r'|'"'|'\''|'\\') | UnicodeEscape | OctalEscape;
fragment UnicodeEscape : '\\' 'u' HexDigit HexDigit HexDigit HexDigit;
fragment OctalEscape
    : '\\' ('0'..'3') ('0'..'7') ('0'..'7')
    | '\\' ('0'..'7') ('0'..'7')
    | '\\' ('0'..'7')
    ;

/*
 * ----------------------------------------------------------------------------
 * PART 6: Comments
 * ----------------------------------------------------------------------------
 */

COMMENT : '/*' .*? '*/' -> channel(HIDDEN); // match anything between /* and */
WS : [ \r\t\u000C\n]+ -> channel(HIDDEN); // white space
LINE_COMMENT : '//' ~[\r\n]* '\r'? '\n' -> channel(HIDDEN);
