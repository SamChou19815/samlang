(import "env" "memory" (memory $env.memory 2))
(import "builtins" "__Process$println" (func $__Process$println (param (ref eq)) (param (ref $_Str)) (result i32)))
(import "builtins" "__Process$panic" (func $__Process$panic (param (ref eq)) (param (ref $_Str)) (result i32)))
;; Export helper functions for JavaScript to read GC string arrays
(func $__$strLen (export "__strLen") (param $str (ref $_Str)) (result i32)
  (array.len (local.get $str))
)
(func $__$strGet (export "__strGet") (param $str (ref $_Str)) (param $idx i32) (result i32)
  (array.get_s $_Str (local.get $str) (local.get $idx))
)
(global $g1 (mut (ref null $_Str)) (ref.null $_Str))
;; Passive data segment for string constants (used with array.new_data)
(data $d0 "0\00-2147483648")
(func $__$getBuiltinString (param $offset i32) (param $size i32) (result (ref $_Str))
  (array.new_data $_Str $d0 (local.get $offset) (local.get $size))
)
(func $__Str$fromInt (param $this (ref eq)) (param $p0 i32) (result (ref $_Str))
  (local $conversion_result (ref null $_Str)) (local $is_negative i32)
  (local $temp i32) (local $arr_size i32) (local $len i32)
  (local $new_in i32) (local $arr_half_point i32) (local $rev_index i32)
  (local.set $conversion_result (ref.null $_Str))
  (block $B0
    (block $B1
      (br_if $B1 (i32.eq (local.get $p0) (i32.const -2147483648)))
      (block $B2
        (br_if $B2 (local.get $p0))
        (local.set $conversion_result
          (array.new_data $_Str $d0 (i32.const 0) (i32.const 1))
        )
        (br $B0)
      )
      (local.set $temp (local.get $p0))
      (local.set $is_negative (i32.const 0))
      (local.set $len (i32.const 0))
      (local.set $arr_size (i32.const 0))
      (block $is_negative_block
        (br_if $is_negative_block (i32.gt_s (local.get $p0) (i32.const -1)))
        ;; Mark as negative, negate the value
        (local.set $p0 (i32.sub (i32.const 0) (local.get $p0)))
        (local.set $is_negative (i32.const 1))
        (local.set $len (i32.const 1))
        (local.set $arr_size (i32.const 1))
      )
      ;; Also negate temp for size calculation if it was negative
      (block $negate_temp_block
        (br_if $negate_temp_block (i32.gt_s (local.get $temp) (i32.const -1)))
        (local.set $temp (i32.sub (i32.const 0) (local.get $temp)))
      )
      (block $find_size_block
        (loop $find_size_loop
          ;; break when temp < 1
          (br_if $find_size_block (i32.lt_s (local.get $temp) (i32.const 1)))
          ;; temp /= 10
          (local.set $temp (i32.div_u (local.get $temp) (i32.const 10)))
          ;; arr_size++
          (local.set $arr_size (i32.add (local.get $arr_size) (i32.const 1)))
          ;; continue loop
          (br $find_size_loop)
        )
      )
      (local.set $conversion_result (array.new $_Str (i32.const 0) (local.get $arr_size)))
      ;; Now set '-' sign if negative (after array allocation)
      (block $set_negative_sign_block
        (br_if $set_negative_sign_block (i32.eqz (local.get $is_negative)))
        (array.set $_Str (local.get $conversion_result) (i32.const 0) (i32.const 45))
      )
      (block $set_characters_loop_block
        (loop $set_characters_loop
          (br_if $set_characters_loop_block (i32.lt_s (local.get $p0) (i32.const 1)))
          ;; array.set takes (array, index, value)
          (array.set $_Str (local.get $conversion_result)
            (local.get $len)
            ;; This is a clever trick. 48=0b110000.
            ;; The rest of 0 can be filled with mod 10 result with bitwise OR
            (i32.or
              ;; in - (new_in = (in / 10 * 10)), which is equivalent to in % 10
              (i32.sub
                (local.get $p0)
                ;; local.tee also conveniently set the result of in / 10 to new_in
                (i32.mul (local.tee $new_in (i32.div_u (local.get $p0) (i32.const 10))) (i32.const 10))
              )
              (i32.const 48)
            )
          )
          ;; len++
          (local.set $len (i32.add (local.get $len) (i32.const 1)))
          (local.set $p0 (local.get $new_in))
          (br $set_characters_loop)
        )
      )
      ;; compute mid point for array reversal
      (local.set $arr_half_point (i32.add
        ;; half point, assuming no - sign at the beginning
        (i32.div_u (i32.sub (local.get $len) (local.get $is_negative)) (i32.const 2))
        ;; + 1 or 0, depending on is_negative
        (local.get $is_negative)
      ))
      ;; i = 0 or 1, depending on is_negative
      (local.set $len (local.get $is_negative))
      (block $reverse_block
        (loop $reverse_block_loop
          (br_if $B0 (i32.ge_s (local.get $len) (local.get $arr_half_point)))
          ;; temp = arr[i]
          (local.set $temp (array.get_s $_Str (local.get $conversion_result) (local.get $len)))
          ;; rev_index = array_size - len - 1 + is_negative
          ;; This accounts for the minus sign offset when reversing just the digits
          (local.set $rev_index
            (i32.add
              (i32.sub (i32.sub (local.get $arr_size) (local.get $len)) (i32.const 1))
              (local.get $is_negative)
            )
          )
          ;; array[len] = array[rev_index] - array.set takes (array, index, value)
          (array.set $_Str (local.get $conversion_result)
            (local.get $len)
            (array.get_s $_Str (local.get $conversion_result) (local.get $rev_index))
          )
          ;; array[rev_index] = temp - array.set takes (array, index, value)
          (array.set $_Str (local.get $conversion_result)
            (local.get $rev_index)
            (local.get $temp)
          )
          ;; len++
          (local.set $len (i32.add (local.get $len) (i32.const 1)))
          (br $reverse_block_loop)
        )
      )
    )
    (local.set $conversion_result
      (array.new_data $_Str $d0 (i32.const 2) (i32.const 11))
    )
  )
  (ref.cast (ref $_Str) (local.get $conversion_result))
)
(func $__Str$toInt (param $p0 (ref $_Str)) (result i32)
  (local $len i32) (local $neg i32) (local $num i32) (local $character i32) (local $i i32)
  (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32)
  (local.set $len (array.len (local.get $p0)))
  (block $B0
    ;; check empty string
    (block $B0 (br_if $B0 (local.get $len)))
    ;; if first character is -, then neg = 1
    (local.set $neg
      (i32.eq
        (i32.const 45)
        (array.get_s $_Str (local.get $p0) (i32.const 0))
      )
    )
    (local.set $num (i32.const 0))
    (local.set $i (local.get $neg))
    (block $B1
      (loop $L2
        (br_if $B1 (i32.ge_s (local.get $i) (local.get $len)))
        (local.set $character
          (array.get_s $_Str (local.get $p0) (local.get $i))
        )
        (br_if $B0
          (i32.gt_u
            (i32.and
              (i32.add
                (local.get $character)
                (i32.const -48)
              )
              (i32.const 255)
            )
            (i32.const 9)
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (local.set $num
          (i32.add
            (i32.add (i32.mul (local.get $num) (i32.const 10)) (local.get $character))
            (i32.const -48)
          )
        )
        (br $L2)
      )
    )
    (return
      (select
        (i32.sub (i32.const 0) (local.get $num))
        (local.get $num)
        (local.get $neg)
      )
    )
  )
  (i32.const 0)
)
(func $__Str$concat (param $p0 (ref $_Str)) (param $p1 (ref $_Str)) (result (ref $_Str))
  (local $len1 i32) (local $len2 i32) (local $total_len i32) (local $index i32)
  (local $new_array (ref null $_Str))
  (local.set $len1 (array.len (local.get $p0)))
  (local.set $len2 (array.len (local.get $p1)))
  (local.set $total_len (i32.add (local.get $len1) (local.get $len2)))
  (local.set $new_array (array.new $_Str (i32.const 0) (local.get $total_len)))
  (local.set $index (i32.const 0))
  (block $copy_first_arr_block
    (loop $copy_first_arr_loop
      (br_if $copy_first_arr_block (i32.ge_s (local.get $index) (local.get $len1)))
      ;; array.set takes (array, index, value)
      (array.set $_Str (ref.as_non_null (local.get $new_array))
        (local.get $index)
        (array.get_s $_Str (local.get $p0) (local.get $index))
      )
      (local.set $index (i32.add (local.get $index) (i32.const 1)))
      (br $copy_first_arr_loop)
    )
  )
  (local.set $index (i32.const 0))
  (block $copy_second_arr_block
    (loop $copy_second_arr_loop
      (br_if $copy_second_arr_block (i32.ge_s (local.get $index) (local.get $len2)))
      ;; array.set takes (array, index, value)
      (array.set $_Str (ref.as_non_null (local.get $new_array))
        (i32.add (local.get $len1) (local.get $index))
        (array.get_s $_Str (local.get $p1) (local.get $index))
      )
      (local.set $index (i32.add (local.get $index) (i32.const 1)))
      (br $copy_second_arr_loop)
    )
  )
  (ref.as_non_null (local.get $new_array))
)
