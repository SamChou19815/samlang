let printed = '';
const _builtin_stringConcat = (a, b) => a + b;
const _builtin_println = (line) => {
  printed += `${line}
`;
};
const _builtin_stringToInt = (v) => BigInt(v);
const _builtin_intToString = (v) => String(v);
const _module_Test_class_Student_function_getName = (_this) => {
  return _this[0];
  return;
};
const _module_Test_class_Student_function_getAge = (_this) => {
  return _this[1];
  return;
};
const _module_Test_class_Student_function_dummyStudent = () => {
  _t0 = ['RANDOM_BABY', 0];
  return _t0;
  return;
};
const _module_Test_class_Main_function_main = () => {
  var _t1 = _module_Test_class_Student_function_dummyStudent();
  var _t0 = _module_Test_class_Student_function_getName(_t1);
  var _t2 = _builtin_println(_t0);
  var _t3 = _t2;
  var _t4 = _module_Test_class_Student_function_dummyStudent();
  var _t5 = _builtin_intToString(_t4[1]);
  var _t6 = _builtin_println(_t5);
};
_module_Test_class_Main_function_main();
printed;
