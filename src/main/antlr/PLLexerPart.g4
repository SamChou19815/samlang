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

IMPORT : 'import';

// Declarations
CLASS : 'class';
UTIL : 'util';
CONST : 'const';
VAL : 'val';
FUNCTION : 'function';
METHOD : 'method';
AS : 'as';

// Visibility modifiers
PRIVATE : 'private';
PROTECTED : 'protected';
PUBLIC : 'public';

// Control Flow
IF : 'if';
THEN : 'then';
ELSE : 'else';
MATCH : 'match';
PANIC : 'panic';

// Type Keywords
INT : 'int';
STRING : 'string';
BOOL : 'bool';
UNIT : 'unit';
TRUE : 'true';
FALSE : 'false';

// Forbidden Names
EXPORT : 'export';

// Misc
SELF : 'self';
THIS : 'this';
WILDCARD : '_';

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

SEMICOLON : ';';
COLON : ':';
COMMA : ',';
DOT : '.';


BAR : '|';
COLONCOLON : '::';
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
