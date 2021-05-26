#include <stdint.h>

typedef int32_t samlang_int;
typedef samlang_int *samlang_string;

#define SAMLANG_COMPILED_MAIN _compiled_program_main

// Main allocation hook
extern samlang_int* _builtin_malloc(samlang_int);
extern samlang_string _module__class_Builtins_function_intToString(samlang_int);
extern samlang_int _module__class_Builtins_function_println(samlang_string);
extern samlang_int _module__class_Builtins_function_panic(samlang_string);
