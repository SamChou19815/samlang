/** An implementation of the SAMLANG standard runtime library. */

#include "libsam.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "./gc.h"
#define WORDSIZE 8

/** Core runtime */

int GC_ready = 0;
void* SAMLANG_BUILTIN(malloc)(samlang_int size) {
    if (!GC_ready) {
        /*
         * This check unfortunately needs to be here, since
         * GC_malloc() could be called from static initialization
         * code written in Xi (in other words, we can't rely
         * on main() to do the initialization)
         */
        gc_init();
        GC_ready = 1;
    }

	return (int64_t *) GC_malloc(size);
}

// Internal helper for making arrays
static void* mkArray(int bytes, int cells) {
    samlang_int* memory = SAMLANG_BUILTIN(malloc)(bytes + sizeof(samlang_int));
    memory[0] = cells;
    return memory + 1;
}

// Helper: C string to samlang string
static samlang_string mkString(const char* in) {
    int c;
    int len = strlen(in);
    samlang_string out = mkArray(len * sizeof(samlang_int), len);

    for (c = 0; c < len; ++c) {
        out[c] = in[c];
    }
    return out;
}

extern void SAMLANG_COMPILED_MAIN(samlang_string[]);

int main(int argc, char *argv[]) {
    // Create arguments array.
    samlang_string* args = mkArray(sizeof(samlang_int *) * argc, argc);
    int c;
    for (c = 0; c < argc; ++c)
        args[c] = mkString(argv[c]);

    // transfer to program's main
    SAMLANG_COMPILED_MAIN(args);
    return 0;
}

static void SAMLANG_BUILTIN(print)(samlang_string str) {
    int c;
    int len = str[-1];
    for (c = 0; c < len; ++c) {
        printUcs4char(str[c], stdout);
    }
}

void SAMLANG_BUILTIN(println)(samlang_string str) {
    SAMLANG_BUILTIN(print)(str);
    fputc('\n', stdout);
}

samlang_int SAMLANG_BUILTIN(stringToInt)(samlang_string str) {
    // ### should this worry about overflow?
    int len = str[-1];
    int neg = 0;
    samlang_int num = 0;

    if (!len) {
        SAMLANG_BUILTIN(print)(mkString("Bad string: "));
        SAMLANG_BUILTIN(print)(str);
        SAMLANG_BUILTIN(println)(mkString(""));
        return num;
    }

    if (str[0] == '-') {
        neg = 1;
    }

    int c;
    for (c = neg; c < len; ++c) {
        if (str[c] >= '0' && str[c] <= '9') {
            num = 10 * num + (str[c] - '0');
        } else {
            num = 0;
            SAMLANG_BUILTIN(print)(mkString("Bad string: "));
            SAMLANG_BUILTIN(print)(str);
            SAMLANG_BUILTIN(println)(mkString(""));
            return num; // returning (0, false);
        }
    }

    if (neg) {
        num = -num;
    }
    return num;
}

samlang_string SAMLANG_BUILTIN(intToString)(samlang_int in) {
    char buffer[32]; // more than enough to represent 64-bit numbers

#if defined(WINDOWS) || defined(WIN32)
    sprintf(buffer, "%I64d", in);
#elif defined(__APPLE__)
    sprintf(buffer, "%lld", in);
#else
    sprintf(buffer, "%ld", in);
#endif

    return mkString(buffer);
}

samlang_string SAMLANG_BUILTIN(stringConcat)(samlang_string s1, samlang_string s2) {
    samlang_int l1 = samlang_length(s1);
    samlang_int l2 = samlang_length(s2);
    samlang_int total_length = l1 + l2;
    samlang_int* stringArray = (samlang_int*) SAMLANG_BUILTIN(malloc)(total_length * 8);
    stringArray[0] = total_length;
    samlang_string string = &stringArray[1];
    for (samlang_int i = 0; i < l1; i++) {
        string[i] = s1[i];
    }
    for (samlang_int i = 0; i < l2; i++) {
        string[l1 + i] = s2[i];
    }
    return string;
}

void SAMLANG_BUILTIN(throw)(samlang_string in) {
    SAMLANG_BUILTIN(println)(in);
    exit(1);
}

/* converting UTF-16 to UTF-8 */
#define kUTF8ByteSwapNotAChar    0xFFFE
#define kUTF8NotAChar            0xFFFF
#define kMaxUTF8FromUCS4         0x10FFFF

// 0xFFFD or U+FFFD is the "replacement character", e.g. the question mark symbol
#define kUTF8ReplacementChar     0xFFFD

static void printUcs4char(const long int c, FILE *stream) {
    // We can optimize for the common case - e.g. a one byte character - only the overhead of one branch
    if (c <= 0x7F)  /* 0XXX XXXX one byte */
    {
        fputc(c, stream);
    }
    else if (c <= 0x7FF)  /* 110X XXXX  two bytes */
    {
        fputc(( 0xC0 | (c >> 6) ), stream);
        fputc(( 0x80 | (c & 0x3F) ), stream);
    }
    // start checking for weird chars - we are well above 16 bits now, so it doesn't matter how optimal this is
    else if ( c == kUTF8ByteSwapNotAChar || c == kUTF8NotAChar || c > kMaxUTF8FromUCS4)
    {
        printUcs4char(kUTF8ReplacementChar, stream);
    }
    else if (c <= 0xFFFF)  /* 1110 XXXX  three bytes */
    {
        fputc((0xE0 | (c >> 12)), stream);
        fputc((0x80 | ((c >> 6) & 0x3F)), stream);
        fputc((0x80 | (c & 0x3F)), stream);
    }
    else if (c <= kMaxUTF8FromUCS4)  /* 1111 0XXX  four bytes */
    {
        fputc((0xF0 | (c >> 18)), stream);
        fputc((0x80 | ((c >> 12) & 0x3F)), stream);
        fputc((0x80 | ((c >> 6) & 0x3F)), stream);
        fputc((0x80 | (c & 0x3F)), stream);
    }
}
