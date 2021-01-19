// @generated
/* eslint-disable */
"use strict";Object.defineProperty(exports,"__esModule",{value:!0}),exports.PLLexer=void 0;const ATNDeserializer_1=require("antlr4ts/atn/ATNDeserializer"),Lexer_1=require("antlr4ts/Lexer"),LexerATNSimulator_1=require("antlr4ts/atn/LexerATNSimulator"),VocabularyImpl_1=require("antlr4ts/VocabularyImpl"),Utils=require("antlr4ts/misc/Utils");class PLLexer extends Lexer_1.Lexer{constructor(input){super(input),this._interp=new LexerATNSimulator_1.LexerATNSimulator(PLLexer._ATN,this)}get vocabulary(){return PLLexer.VOCABULARY}get grammarFileName(){return"PL.g4"}get ruleNames(){return PLLexer.ruleNames}get serializedATN(){return PLLexer._serializedATN}get channelNames(){return PLLexer.channelNames}get modeNames(){return PLLexer.modeNames}static get _ATN(){return PLLexer.__ATN||(PLLexer.__ATN=(new ATNDeserializer_1.ATNDeserializer).deserialize(Utils.toCharArray(PLLexer._serializedATN))),PLLexer.__ATN}}exports.PLLexer=PLLexer,PLLexer.IMPORT=1,PLLexer.FROM=2,PLLexer.CLASS=3,PLLexer.VAL=4,PLLexer.FUNCTION=5,PLLexer.METHOD=6,PLLexer.AS=7,PLLexer.PRIVATE=8,PLLexer.PROTECTED=9,PLLexer.INTERNAL=10,PLLexer.PUBLIC=11,PLLexer.IF=12,PLLexer.THEN=13,PLLexer.ELSE=14,PLLexer.MATCH=15,PLLexer.PANIC=16,PLLexer.RETURN=17,PLLexer.INT=18,PLLexer.STRING=19,PLLexer.BOOL=20,PLLexer.UNIT=21,PLLexer.TRUE=22,PLLexer.FALSE=23,PLLexer.THIS=24,PLLexer.WILDCARD=25,PLLexer.STRING2INT=26,PLLexer.INT2STRING=27,PLLexer.PRINTLN=28,PLLexer.SELF=29,PLLexer.CONST=30,PLLexer.LET=31,PLLexer.VAR=32,PLLexer.TYPE=33,PLLexer.INTERFACE=34,PLLexer.FUNCTOR=35,PLLexer.EXTENDS=36,PLLexer.IMPLEMENTS=37,PLLexer.EXPORT=38,PLLexer.ASSERT=39,PLLexer.LPAREN=40,PLLexer.RPAREN=41,PLLexer.LBRACE=42,PLLexer.RBRACE=43,PLLexer.LBRACKET=44,PLLexer.RBRACKET=45,PLLexer.QUESTION=46,PLLexer.SEMICOLON=47,PLLexer.COLON=48,PLLexer.COLONCOLON=49,PLLexer.COMMA=50,PLLexer.DOT=51,PLLexer.BAR=52,PLLexer.ARROW=53,PLLexer.ASSIGN=54,PLLexer.NOT=55,PLLexer.MUL=56,PLLexer.DIV=57,PLLexer.MOD=58,PLLexer.PLUS=59,PLLexer.MINUS=60,PLLexer.STRUCT_EQ=61,PLLexer.LT=62,PLLexer.LE=63,PLLexer.GT=64,PLLexer.GE=65,PLLexer.STRUCT_NE=66,PLLexer.AND=67,PLLexer.OR=68,PLLexer.SPREAD=69,PLLexer.LowerId=70,PLLexer.UpperId=71,PLLexer.MinInt=72,PLLexer.IntLiteral=73,PLLexer.StrLiteral=74,PLLexer.HexLiteral=75,PLLexer.DecimalLiteral=76,PLLexer.OctalLiteral=77,PLLexer.COMMENT=78,PLLexer.WS=79,PLLexer.LINE_COMMENT=80,PLLexer.channelNames=["DEFAULT_TOKEN_CHANNEL","HIDDEN"],PLLexer.modeNames=["DEFAULT_MODE"],PLLexer.ruleNames=["IMPORT","FROM","CLASS","VAL","FUNCTION","METHOD","AS","PRIVATE","PROTECTED","INTERNAL","PUBLIC","IF","THEN","ELSE","MATCH","PANIC","RETURN","INT","STRING","BOOL","UNIT","TRUE","FALSE","THIS","WILDCARD","STRING2INT","INT2STRING","PRINTLN","SELF","CONST","LET","VAR","TYPE","INTERFACE","FUNCTOR","EXTENDS","IMPLEMENTS","EXPORT","ASSERT","LPAREN","RPAREN","LBRACE","RBRACE","LBRACKET","RBRACKET","QUESTION","SEMICOLON","COLON","COLONCOLON","COMMA","DOT","BAR","ARROW","ASSIGN","NOT","MUL","DIV","MOD","PLUS","MINUS","STRUCT_EQ","LT","LE","GT","GE","STRUCT_NE","AND","OR","SPREAD","LowerId","UpperId","Letter","LowerLetter","UpperLetter","MinInt","IntLiteral","StrLiteral","HexLiteral","DecimalLiteral","OctalLiteral","Digit","NonZeroDigit","ZeroDigit","HexDigit","EscapeSequence","UnicodeEscape","OctalEscape","COMMENT","WS","LINE_COMMENT"],PLLexer._LITERAL_NAMES=[void 0,"'import'","'from'","'class'","'val'","'function'","'method'","'as'","'private'","'protected'","'internal'","'public'","'if'","'then'","'else'","'match'","'panic'","'return'","'int'","'string'","'bool'","'unit'","'true'","'false'","'this'","'_'","'stringToInt'","'intToString'","'println'","'self'","'const'","'let'","'var'","'type'","'interface'","'functor'","'extends'","'implements'","'export'","'assert'","'('","')'","'{'","'}'","'['","']'","'?'","';'","':'","'::'","','","'.'","'|'","'->'","'='","'!'","'*'","'/'","'%'","'+'","'-'","'=='","'<'","'<='","'>'","'>='","'!='","'&&'","'||'","'...'",void 0,void 0,"'-9223372036854775808'"],PLLexer._SYMBOLIC_NAMES=[void 0,"IMPORT","FROM","CLASS","VAL","FUNCTION","METHOD","AS","PRIVATE","PROTECTED","INTERNAL","PUBLIC","IF","THEN","ELSE","MATCH","PANIC","RETURN","INT","STRING","BOOL","UNIT","TRUE","FALSE","THIS","WILDCARD","STRING2INT","INT2STRING","PRINTLN","SELF","CONST","LET","VAR","TYPE","INTERFACE","FUNCTOR","EXTENDS","IMPLEMENTS","EXPORT","ASSERT","LPAREN","RPAREN","LBRACE","RBRACE","LBRACKET","RBRACKET","QUESTION","SEMICOLON","COLON","COLONCOLON","COMMA","DOT","BAR","ARROW","ASSIGN","NOT","MUL","DIV","MOD","PLUS","MINUS","STRUCT_EQ","LT","LE","GT","GE","STRUCT_NE","AND","OR","SPREAD","LowerId","UpperId","MinInt","IntLiteral","StrLiteral","HexLiteral","DecimalLiteral","OctalLiteral","COMMENT","WS","LINE_COMMENT"],PLLexer.VOCABULARY=new VocabularyImpl_1.VocabularyImpl(PLLexer._LITERAL_NAMES,PLLexer._SYMBOLIC_NAMES,[]),PLLexer._serializedATNSegments=2,PLLexer._serializedATNSegment0="줝쪺֍꾺体؇쉁Rʔ\b\t\t\t\t\t\t\b\t\b\t\t\t\n\t\n\v\t\v\f\t\f\r\t\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t \t !\t!\"\t\"#\t#$\t$%\t%&\t&'\t'(\t()\t)*\t*+\t+,\t,-\t-.\t./\t/0\t01\t12\t23\t34\t45\t56\t67\t78\t89\t9:\t:;\t;<\t<=\t=>\t>?\t?@\t@A\tAB\tBC\tCD\tDE\tEF\tFG\tGH\tHI\tIJ\tJK\tKL\tLM\tMN\tNO\tOP\tPQ\tQR\tRS\tST\tTU\tUV\tVW\tWX\tXY\tYZ\tZ[\t[\b\b\b\t\t\t\t\t\t\t\t\n\n\n\n\n\n\n\n\n\n\v\v\v\v\v\v\v\v\v\f\f\f\f\f\f\f\r\r\r    !!!!\"\"\"\"\"##########$$$$$$$$%%%%%%%%&&&&&&&&&&&'''''''((((((())**++,,--..//0011222334455666778899::;;<<==>>>??@@@AABBBCCCDDDEEEFFFFGGGGǾ\nG\fGGȁ\vGHHHHȆ\nH\fHHȉ\vHIIIȍ\nIJJKKLLLLLLLLLLLLLLLLLLLLLMMMMȫ\nMNNNNȰ\nN\fNNȳ\vNNNOOOOȺ\nO\rOOȻPPPPɁ\nP\fPPɄ\vPPɆ\nPQQQɊ\nQ\rQQɋRRRɐ\nRSSTTUUVVVVVɜ\nVWWWWWWWXXXXXXXXXXɮ\nXYYYYYɴ\nY\fYYɷ\vYYYYYYZZɿ\nZ\rZZʀZZ[[[[[ʉ\n[\f[[ʌ\v[[[ʏ\n[[[[[ɵ\\\t\v\r\b\t\n\v\f\r!#%')+-/13579;= ?!A\"C#E$G%I&K'M(O)Q*S+U,W-Y.[/]0_1a2c3e4g5i6k7m8o9q:s;u<w=y>{?}@ABCDEFGHIJKLMN¡O£¥§©«­¯±P³QµR\b$$^^ZZzz2;CHch\n$$))^^ddhhppttvv\v\f\"\"\f\fʟ\t\v\r!#%')+-/13579;=?ACEGIKMOQSUWY[]_acegikmoqsuwy{}¡±³µ·¾Ã\tÉ\vÍ\rÖÝàèòûĂąĊď!ĕ#ě%Ģ'Ħ)ĭ+Ĳ-ķ/ļ1ł3Ň5ŉ7ŕ9š;ũ=Ů?ŴAŸCżEƁGƋIƓKƛMƦOƭQƴSƶUƸWƺYƼ[ƾ]ǀ_ǂaǄcǆeǉgǋiǍkǏmǒoǔqǖsǘuǚwǜyǞ{Ǡ}ǣǥǨǪǭǰǳǶǺȂȌȎȐȒȪȬȶɅ¡ɇ£ɏ¥ɑ§ɓ©ɕ«ɛ­ɝ¯ɭ±ɯ³ɾµʄ·¸k¸¹o¹ºrº»q»¼t¼½v½¾¿h¿ÀtÀÁqÁÂoÂÃÄeÄÅnÅÆcÆÇuÇÈuÈ\bÉÊxÊËcËÌnÌ\nÍÎhÎÏwÏÐpÐÑeÑÒvÒÓkÓÔqÔÕpÕ\fÖ×o×ØgØÙvÙÚjÚÛqÛÜfÜÝÞcÞßußàáráâtâãkãäxäåcåævæçgçèéréêtêëqëìvìígíîeîïvïðgðñfñòókóôpôõvõögö÷t÷øpøùcùúnúûürüýwýþdþÿnÿĀkĀāeāĂăkăĄhĄąĆvĆćjćĈgĈĉpĉĊċgċČnČčučĎgĎďĐoĐđcđĒvĒēeēĔjĔ ĕĖrĖėcėĘpĘękęĚeĚ\"ěĜtĜĝgĝĞvĞğwğĠtĠġpġ$ĢģkģĤpĤĥvĥ&ĦħuħĨvĨĩtĩĪkĪīpīĬiĬ(ĭĮdĮįqįİqİını*ĲĳwĳĴpĴĵkĵĶvĶ,ķĸvĸĹtĹĺwĺĻgĻ.ļĽhĽľcľĿnĿŀuŀŁgŁ0łŃvŃńjńŅkŅņuņ2Ňňaň4ŉŊuŊŋvŋŌtŌōkōŎpŎŏiŏŐVŐőqőŒKŒœpœŔvŔ6ŕŖkŖŗpŗŘvŘřVřŚqŚśUśŜvŜŝtŝŞkŞşpşŠiŠ8šŢrŢţtţŤkŤťpťŦvŦŧnŧŨpŨ:ũŪuŪūgūŬnŬŭhŭ<ŮůeůŰqŰűpűŲuŲųvų>ŴŵnŵŶgŶŷvŷ@ŸŹxŹźcźŻtŻBżŽvŽž{žſrſƀgƀDƁƂkƂƃpƃƄvƄƅgƅƆtƆƇhƇƈcƈƉeƉƊgƊFƋƌhƌƍwƍƎpƎƏeƏƐvƐƑqƑƒtƒHƓƔgƔƕzƕƖvƖƗgƗƘpƘƙfƙƚuƚJƛƜkƜƝoƝƞrƞƟnƟƠgƠơoơƢgƢƣpƣƤvƤƥuƥLƦƧgƧƨzƨƩrƩƪqƪƫtƫƬvƬNƭƮcƮƯuƯưuưƱgƱƲtƲƳvƳPƴƵ*ƵRƶƷ+ƷTƸƹ}ƹVƺƻƻXƼƽ]ƽZƾƿ_ƿ\\ǀǁAǁ^ǂǃ=ǃ`Ǆǅ<ǅbǆǇ<Ǉǈ<ǈdǉǊ.Ǌfǋǌ0ǌhǍǎ~ǎjǏǐ/ǐǑ@ǑlǒǓ?ǓnǔǕ#ǕpǖǗ,ǗrǘǙ1ǙtǚǛ'Ǜvǜǝ-ǝxǞǟ/ǟzǠǡ?ǡǢ?Ǣ|ǣǤ>Ǥ~ǥǦ>Ǧǧ?ǧǨǩ@ǩǪǫ@ǫǬ?ǬǭǮ#Ǯǯ?ǯǰǱ(Ǳǲ(ǲǳǴ~Ǵǵ~ǵǶǷ0ǷǸ0Ǹǹ0ǹǺǿJǻǾIǼǾ£RǽǻǽǼǾȁǿǽǿȀȀȁǿȂȇKȃȆIȄȆ£RȅȃȅȄȆȉȇȅȇȈȈȉȇȊȍJȋȍKȌȊȌȋȍȎȏc|ȏȐȑC\\ȑȒȓ/ȓȔ;Ȕȕ4ȕȖ4Ȗȗ5ȗȘ5Șș9șȚ4Țț2țȜ5Ȝȝ8ȝȞ:Ȟȟ7ȟȠ6Ƞȡ9ȡȢ9Ȣȣ7ȣȤ:Ȥȥ2ȥȦ:ȦȧȫOȨȫ¡QȩȫPȪȧȪȨȪȩȫȬȱ$ȭȰ«VȮȰ\n",PLLexer._serializedATNSegment1="ȯȭȯȮȰȳȱȯȱȲȲȴȳȱȴȵ$ȵȶȷ2ȷȹ\tȸȺ©UȹȸȺȻȻȹȻȼȼȽɆ2Ⱦɂ3;ȿɁ2;ɀȿɁɄɂɀɂɃɃɆɄɂɅȽɅȾɆ ɇɉ2ɈɊ29ɉɈɊɋɋɉɋɌɌ¢ɍɐ¥SɎɐ§TɏɍɏɎɐ¤ɑɒ3;ɒ¦ɓɔ2ɔ¨ɕɖ\tɖªɗɘ^ɘɜ\təɜ­Wɚɜ¯Xɛɗɛəɛɚɜ¬ɝɞ^ɞɟwɟɠ©Uɠɡ©Uɡɢ©Uɢɣ©Uɣ®ɤɥ^ɥɦ25ɦɧ29ɧɮ29ɨɩ^ɩɪ29ɪɮ29ɫɬ^ɬɮ29ɭɤɭɨɭɫɮ°ɯɰ1ɰɱ,ɱɵɲɴ\vɳɲɴɷɵɶɵɳɶɸɷɵɸɹ,ɹɺ1ɺɻɻɼ\bYɼ²ɽɿ\tɾɽɿʀʀɾʀʁʁʂʂʃ\bZʃ´ʄʅ1ʅʆ1ʆʊʇʉ\nʈʇʉʌʊʈʊʋʋʎʌʊʍʏʎʍʎʏʏʐʐʑ\fʑʒʒʓ\b[ʓ¶ǽǿȅȇȌȪȯȱȻɂɅɋɏɛɭɵʀʊʎ",PLLexer._serializedATN=Utils.join([PLLexer._serializedATNSegment0,PLLexer._serializedATNSegment1],"");