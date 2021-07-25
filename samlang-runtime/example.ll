declare i32 @__Builtins_println(i32*) nounwind
declare i32* @__Builtins_intToString(i32) nounwind

define i32 @_factorial(i32 %n) local_unnamed_addr nounwind {
start:
  %comparison = icmp slt i32 %n, 2                 ; if (%0 < 2) then goto loop_end else goto loop
  br i1 %comparison, label %loop_end, label %loop
loop:
  %i = phi i32 [ %i2, %loop ], [ %n, %start ]      ; i = phi(i2 from loop, %0 from start)
  %acc = phi i32 [ %acc2, %loop ], [ 1, %start ]   ; acc = phi(acc2 from loop, 1 from start)
  %i2 = add i32 %i, -1                             ; i2 = i - 1;
  %acc2 = mul i32 %i, %acc                         ; acc2 = i * acc;
  %c2 = icmp slt i32 %i, 3                         ; if i < 3 then goto loop_end else goto loop
  br i1 %c2, label %loop_end, label %loop
loop_end:
  %result = phi i32 [ 1, %start ], [ %acc2, %loop ] ; result = phi(1 from start, acc2 from loop)
  ret i32 %result
}

define void @_compiled_program_main(i32** %0) local_unnamed_addr nounwind {
  %t0 = call i32 @_factorial(i32 10) nounwind
  %t1 = call i32* @__Builtins_intToString(i32 %t0) nounwind
  call i32 @__Builtins_println(i32* %t1) nounwind
  ret void
}
