declare void @_builtin_malloc(i64) nounwind
declare void @_builtin_println(i64*) nounwind
declare void @_builtin_throw(i64*) nounwind
declare i64* @_builtin_intToString(i64) nounwind
declare i64 @_builtin_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind

define i64 @_factorial(i64 %n) local_unnamed_addr nounwind {
start:
  %comparison = icmp slt i64 %n, 2                 ; if (%0 < 2) then goto loop_end else goto loop
  br i1 %comparison, label %loop_end, label %loop

loop:
  %i = phi i64 [ %i2, %loop ], [ %n, %start ]      ; i = phi(i2 from loop, %0 from start)
  %acc = phi i64 [ %acc2, %loop ], [ 1, %start ]   ; acc = phi(acc2 from loop, 1 from start)
  %i2 = add i64 %i, -1                             ; i2 = i - 1;
  %acc2 = mul i64 %i, %acc                         ; acc2 = i * acc;
  %c2 = icmp slt i64 %i, 3                         ; if i < 3 then goto loop_end else goto loop
  br i1 %c2, label %loop_end, label %loop

loop_end:
  %result = phi i64 [ 1, %start ], [ %acc2, %loop ] ; result = phi(1 from start, acc2 from loop)
  ret i64 %result
}

define void @_compiled_program_main(i64** %0) local_unnamed_addr nounwind {
  %t0 = call i64 @_factorial(i64 10) nounwind
  %t1 = call i64* @_builtin_intToString(i64 %t0) nounwind
  call void @_builtin_println(i64* %t1) nounwind
  ret void
}
