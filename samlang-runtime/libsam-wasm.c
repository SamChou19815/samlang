/** An implementation of the SAMLANG standard runtime library. */

#include "./walloc.c"
#define WORDSIZE 4

typedef int32_t samlang_int;
typedef samlang_int *samlang_string;

/** Core runtime */

// Internal helper for making arrays
static void* mkArray(int bytes, int cells) {
  samlang_int* memory = _builtin_malloc(bytes + 16);
  memory[0] = 1;
  memory[1] = cells;
  return memory;
}

// https://stackoverflow.com/questions/1733281/where-is-the-implementation-of-strlen-in-gcc
static int strlen(const char *str) {
  const char *s;
  for (s = str; *s; ++s) ;
  return (s - str);
}

// Helper: C string to samlang string
static samlang_string mkString(const char* in) {
  int c;
  int len = strlen(in);
  samlang_string out = mkArray(len * sizeof(samlang_int), len);
  for (c = 0; c < len; ++c) out[c + 2] = in[c];
  return out;
}

samlang_string WASM_EXPORT(__Builtins_intToString)(samlang_int in) {
  if (in == 0) return mkString("0");
  if (in == -2147483648) return mkString("-2147483648");
  char buffer[16]; // more than enough to represent 32-bit numbers
  int is_negative = in < 0;
  if (is_negative) {
    buffer[0] = '-';
    in = -in;
  }
  int len = is_negative;
  while (in > 0) {
    buffer[len] = (in % 10) + '0';
    in /= 10;
    len += 1;
  }
  // Set the final char to be 0 to make it NULL terminated.
  buffer[len] = 0;
  char *reverse_slice = &buffer[is_negative];
  int reverse_slice_len = len - is_negative;
  int reverse_slice_mid = reverse_slice_len / 2;
  for (int i = 0; i < reverse_slice_mid; i++) {
    char temp = reverse_slice[i];
    reverse_slice[i] = reverse_slice[reverse_slice_len - i - 1];
    reverse_slice[reverse_slice_len - i - 1] = temp;
  }
  return mkString(buffer);
}

samlang_int WASM_EXPORT(__Builtins_stringToInt)(samlang_string str) {
  // ### should this worry about overflow?
  samlang_int len = str[1];
  str = &str[2];
  samlang_int neg = 0;
  samlang_int num = 0;

  if (len == 0) return 0;
  if (str[0] == '-') neg = 1;

  for (samlang_int c = neg; c < len; ++c) {
    if (str[c] >= '0' && str[c] <= '9') {
      num = 10 * num + (str[c] - '0');
    } else {
      return 0;
    }
  }

  if (neg) num = -num;
  return num;
}

samlang_string WASM_EXPORT(_builtin_stringConcat)(samlang_string s1, samlang_string s2) {
  samlang_int l1 = s1[1];
  samlang_int l2 = s2[1];
  samlang_int total_length = l1 + l2;
  samlang_int* stringArray = (samlang_int*) _builtin_malloc((total_length + 2) * 8);
  stringArray[0] = 1;
  stringArray[1] = total_length;
  samlang_string string = &stringArray[2];
  for (samlang_int i = 0; i < l1; i++) string[i] = s1[i+2];
  for (samlang_int i = 0; i < l2; i++) string[l1 + i] = s2[i+2];
  return stringArray;
}
