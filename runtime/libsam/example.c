#include "libsam.h"

samlang_int factorial(samlang_int i) {
  if (i <= 1) return 1;
  return i * factorial(i-1);
}

void SAMLANG_COMPILED_MAIN(samlang_string *args) {
  SAMLANG_BUILTIN(println)(SAMLANG_BUILTIN(intToString)(factorial(10)));
}
