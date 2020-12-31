/**
 Some exports to help write Xi bindings
*/
#ifndef LIBXI_H
#define LIBXI_H

#include <stdint.h>
#include <stdio.h>

typedef int64_t samlang_int;
typedef samlang_int *samlang_string;

#define samlang_length(a) *(samlang_int *)((a)-1)

#ifdef __cplusplus
#define SAMLANG_EXPORT extern "C"
#else
#define SAMLANG_EXPORT
#endif

#define SAMLANG_BUILTIN(x) _builtin_ ## x
#define SAMLANG_COMPILED_MAIN _compiled_program_main

// Main allocation hook
SAMLANG_EXPORT void * SAMLANG_BUILTIN(malloc)(samlang_int);

// Registers a finalizer for a given object
typedef void Finalizer(void*, void*);
SAMLANG_EXPORT void registerFinalizer(void*, Finalizer*);

extern samlang_int SAMLANG_BUILTIN(stringToInt)(samlang_string);
extern samlang_string SAMLANG_BUILTIN(intToString)(samlang_int);
extern samlang_string SAMLANG_BUILTIN(stringConcat)(samlang_string, samlang_string);
extern void SAMLANG_BUILTIN(println)(samlang_string);
extern void SAMLANG_BUILTIN(throw)(samlang_string);

static void printUcs4char(long int c, FILE *stream);

#endif
