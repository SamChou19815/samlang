#include <stdint.h>

typedef int64_t samlang_int;
typedef samlang_int *samlang_string;

#define SAMLANG_COMPILED_MAIN _compiled_program_main

// Main allocation hook
samlang_int* _builtin_malloc(samlang_int);
samlang_string __Builtins_intToString(samlang_int);
samlang_int __Builtins_println(samlang_string);
samlang_int __Builtins_panic(samlang_string);
