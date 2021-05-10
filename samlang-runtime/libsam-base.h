#include <stdint.h>

typedef int64_t samlang_int;
typedef samlang_int *samlang_string;

#define SAMLANG_COMPILED_MAIN _compiled_program_main

// Main allocation hook
extern samlang_int* _builtin_malloc(samlang_int);
extern samlang_string _builtin_intToString(samlang_int);
extern samlang_int _builtin_println(samlang_string);
extern samlang_int _builtin_throw(samlang_string);
