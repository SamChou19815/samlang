/** An implementation of the SAMLANG standard runtime library. */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "./gc.h"
#include "./libsam-base.h"
#define WORDSIZE 8

typedef int64_t samlang_int;
typedef samlang_int *samlang_string;

/** Core runtime */

extern samlang_int* _builtin_malloc(samlang_int size) {
  return GC_malloc(size);
}

// Internal helper for making arrays
static void* mkArray(int bytes, int cells) {
  samlang_int* memory = _builtin_malloc(bytes + 8);
  memory[0] = cells;
  return memory;
}

// Helper: C string to samlang string
static samlang_string mkString(const char* in) {
  int c;
  int len = strlen(in);
  samlang_string out = mkArray(len * sizeof(samlang_int), len);
  for (c = 0; c < len; ++c) out[c + 1] = in[c];
  return out;
}

extern samlang_int _compiled_program_main(samlang_string[]);

int main(int argc, char *argv[]) {
  gc_init();
  // Create arguments array.
  samlang_string* args = mkArray(sizeof(samlang_int *) * argc, argc);
  int c;
  for (c = 0; c < argc; ++c) args[c] = mkString(argv[c]);
  // transfer to program's main
  _compiled_program_main(args);
  return 0;
}

/* converting UTF-16 to UTF-8 */
#define kUTF8ByteSwapNotAChar    0xFFFE
#define kUTF8NotAChar            0xFFFF
#define kMaxUTF8FromUCS4         0x10FFFF

// 0xFFFD or U+FFFD is the "replacement character", e.g. the question mark symbol
#define kUTF8ReplacementChar     0xFFFD

static void printUcs4char(const long int c, FILE *stream) {
  // We can optimize for the common case - e.g. a one byte character - only the overhead of one branch
  /* 0XXX XXXX one byte */
  if (c <= 0x7F) {
    fputc(c, stream);
  } else if (c <= 0x7FF) {
    /* 110X XXXX  two bytes */
    fputc(( 0xC0 | (c >> 6) ), stream);
    fputc(( 0x80 | (c & 0x3F) ), stream);
  } else if ( c == kUTF8ByteSwapNotAChar || c == kUTF8NotAChar || c > kMaxUTF8FromUCS4) {
    // start checking for weird chars - we are well above 16 bits now, so it doesn't matter how optimal this is
    printUcs4char(kUTF8ReplacementChar, stream);
  } else if (c <= 0xFFFF) {
    /* 1110 XXXX  three bytes */
    fputc((0xE0 | (c >> 12)), stream);
    fputc((0x80 | ((c >> 6) & 0x3F)), stream);
    fputc((0x80 | (c & 0x3F)), stream);
  } else if (c <= kMaxUTF8FromUCS4) {
    /* 1111 0XXX  four bytes */
    fputc((0xF0 | (c >> 18)), stream);
    fputc((0x80 | ((c >> 12) & 0x3F)), stream);
    fputc((0x80 | ((c >> 6) & 0x3F)), stream);
    fputc((0x80 | (c & 0x3F)), stream);
  }
}

samlang_int _builtin_println(samlang_string str) {
  int c;
  int len = str[0];
  for (c = 1; c <= len; ++c) {
    printUcs4char(str[c], stdout);
  }
  fputc('\n', stdout);
  return 0;
}

samlang_string _builtin_intToString(samlang_int in) {
  char buffer[32]; // more than enough to represent 64-bit numbers

#if defined(__APPLE__)
  sprintf(buffer, "%lld", in);
#else
  sprintf(buffer, "%ld", in);
#endif

  return mkString(buffer);
}

samlang_int _builtin_throw(samlang_string in) {
  _builtin_println(in);
  exit(1);
  return 0;
}
