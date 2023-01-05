#include <stdint.h>

#define WASM_EXPORT(name) \
  __attribute__((export_name(#name))) \
  name

typedef int32_t samlang_int;
typedef samlang_int *samlang_string;

void* WASM_EXPORT(_builtin_malloc)(samlang_int);
samlang_int WASM_EXPORT(_builtin_free)(samlang_int*);
samlang_string WASM_EXPORT(__Builtins_intToString)(samlang_int);
samlang_int WASM_EXPORT(__Builtins_stringToInt)(samlang_string str);
samlang_string WASM_EXPORT(_builtin_stringConcat)(samlang_string, samlang_string);
