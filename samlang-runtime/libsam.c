/** An implementation of the SAMLANG standard runtime library. */

#include "./libsam-base.h"

samlang_int _builtin_stringToInt(samlang_string str) {
  // ### should this worry about overflow?
  samlang_int len = str[0];
  str = &str[1];
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

samlang_string _builtin_stringConcat(samlang_string s1, samlang_string s2) {
  samlang_int l1 = s1[0];
  samlang_int l2 = s2[0];
  samlang_int total_length = l1 + l2;
  samlang_int* stringArray = (samlang_int*) _builtin_malloc((total_length + 1) * 8);
  stringArray[0] = total_length;
  samlang_string string = &stringArray[1];
  for (samlang_int i = 0; i < l1; i++) string[i] = s1[i+1];
  for (samlang_int i = 0; i < l2; i++) string[l1 + i] = s2[i+1];
  return stringArray;
}
