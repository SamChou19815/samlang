/**
 Some exports to help write Xi bindings
*/
#ifndef LIBXI_H
#define LIBXI_H

#include <stdint.h>
#include <stdio.h>

typedef int64_t samlang_int;
typedef samlang_int *samlang_string;

#define samlang_length(a) *(xiint *)((a)-1)

#ifdef __cplusplus
#define SAMLANG_EXPORT extern "C"
#else
#define SAMLANG_EXPORT
#endif

// Main allocation hook
SAMLANG_EXPORT void * builtin_malloc(samlang_int);

// Registers a finalizer for a given object
typedef void Finalizer(void*, void*);
SAMLANG_EXPORT void registerFinalizer(void*, Finalizer*);

extern samlang_int builtin_stringToInt(samlang_string);
extern samlang_string builtin_intToString(samlang_int);
extern void builtin_println(samlang_string);
extern void builtin_panic(samlang_string);

static void printUcs4char(long int c, FILE *stream);

#endif
