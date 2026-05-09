(import "builtins" "__Process$println" (func $__Process$println (param (ref eq)) (param (ref $_Str)) (result i32)))
(import "builtins" "__Process$panic" (func $__Process$panic (param (ref eq)) (param (ref $_Str)) (result i32)))
;; Export helper functions for JavaScript to read GC string arrays
(func $__$strLen (export "__strLen") (param $str (ref $_Str)) (result i32)
  (array.len (local.get $str))
)
(func $__$strGet (export "__strGet") (param $str (ref $_Str)) (param $idx i32) (result i32)
  (array.get_s $_Str (local.get $str) (local.get $idx))
)
(func $__Str$eq (param $a (ref $_Str)) (param $b (ref $_Str)) (result i32)
  (local $len i32) (local $i i32)
  (if (ref.eq (local.get $a) (local.get $b)) (then (return (i32.const 1))))
  (local.set $len (array.len (local.get $a)))
  (if (i32.ne (local.get $len) (array.len (local.get $b))) (then (return (i32.const 0))))
  (local.set $i (i32.const 0))
  (block $done
    (loop $loop
      (br_if $done (i32.ge_s (local.get $i) (local.get $len)))
      (if (i32.ne
        (array.get_s $_Str (local.get $a) (local.get $i))
        (array.get_s $_Str (local.get $b) (local.get $i))
      ) (then (return (i32.const 0))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $loop)
    )
  )
  (i32.const 1)
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

;; -----------------------------------------------------------------------------
;; Vec<T> runtime
;;
;; Vec is a builtin growable container with a uniform (ref null eq) element
;; representation, regardless of the source-level element type. Element values
;; that are i32 (e.g. `int`) are boxed/unboxed via i31 at the call site by the
;; WASM lowering pass; reference values pass through untouched via subtyping.
;;
;; A Vec is a struct of {data: ref _VecData, length: i32}; capacity is the
;; backing array's length. Static methods take a (ref eq) placeholder receiver,
;; matching the pattern used by Str.fromInt and Process.println.
;; -----------------------------------------------------------------------------

(func $__$unwrapI31 (param $v (ref eq)) (result i32)
  (i31.get_s (ref.cast (ref i31) (local.get $v)))
)

(func $__Vec$empty (param $_this (ref eq)) (result (ref $_Vec))
  (struct.new $_Vec (array.new $_VecData (ref.null eq) (i32.const 0)) (i32.const 0))
)

(func $__Vec$withCapacity (param $_this (ref eq)) (param $cap i32) (result (ref $_Vec))
  (struct.new $_Vec (array.new $_VecData (ref.null eq) (local.get $cap)) (i32.const 0))
)

(func $__Vec$of (param $_this (ref eq)) (param $v (ref null eq)) (result (ref $_Vec))
  (local $d (ref $_VecData))
  (local.set $d (array.new $_VecData (local.get $v) (i32.const 1)))
  (struct.new $_Vec (local.get $d) (i32.const 1))
)

(func $__Vec$length (param $this (ref $_Vec)) (result i32)
  (struct.get $_Vec 1 (local.get $this))
)

(func $__Vec$capacity (param $this (ref $_Vec)) (result i32)
  (array.len (struct.get $_Vec 0 (local.get $this)))
)

;; reserve(min_cap): grow data to at least min_cap (geometric: max(min_cap, 2*cap, 4))
(func $__Vec$reserve (param $this (ref $_Vec)) (param $min i32) (result i32)
  (local $cap i32) (local $new_cap i32)
  (local $old (ref $_VecData)) (local $new (ref $_VecData)) (local $len i32)
  (local.set $old (struct.get $_Vec 0 (local.get $this)))
  (local.set $cap (array.len (local.get $old)))
  (block $no_grow
    (br_if $no_grow (i32.le_s (local.get $min) (local.get $cap)))
    (local.set $new_cap (i32.shl (local.get $cap) (i32.const 1)))
    (if (i32.lt_s (local.get $new_cap) (local.get $min))
      (then (local.set $new_cap (local.get $min))))
    (if (i32.lt_s (local.get $new_cap) (i32.const 4))
      (then (local.set $new_cap (i32.const 4))))
    (local.set $new (array.new $_VecData (ref.null eq) (local.get $new_cap)))
    (local.set $len (struct.get $_Vec 1 (local.get $this)))
    (array.copy $_VecData $_VecData
      (local.get $new) (i32.const 0)
      (local.get $old) (i32.const 0)
      (local.get $len))
    (struct.set $_Vec 0 (local.get $this) (local.get $new))
  )
  (i32.const 0)
)

(func $__Vec$push (param $this (ref $_Vec)) (param $v (ref null eq)) (result i32)
  (local $len i32)
  (local.set $len (struct.get $_Vec 1 (local.get $this)))
  (drop (call $__Vec$reserve (local.get $this) (i32.add (local.get $len) (i32.const 1))))
  (array.set $_VecData
    (struct.get $_Vec 0 (local.get $this))
    (local.get $len)
    (local.get $v))
  (struct.set $_Vec 1 (local.get $this) (i32.add (local.get $len) (i32.const 1)))
  (i32.const 0)
)

(func $__Vec$pop (param $this (ref $_Vec)) (result (ref eq))
  (local $len i32) (local $v (ref null eq))
  (local.set $len (struct.get $_Vec 1 (local.get $this)))
  (if (i32.eqz (local.get $len)) (then (unreachable)))
  (local.set $len (i32.sub (local.get $len) (i32.const 1)))
  (local.set $v (array.get $_VecData
    (struct.get $_Vec 0 (local.get $this))
    (local.get $len)))
  ;; Clear the slot so the popped value can be GC'd.
  (array.set $_VecData
    (struct.get $_Vec 0 (local.get $this))
    (local.get $len)
    (ref.null eq))
  (struct.set $_Vec 1 (local.get $this) (local.get $len))
  (ref.as_non_null (local.get $v))
)

(func $__Vec$get (param $this (ref $_Vec)) (param $i i32) (result (ref eq))
  (if (i32.ge_u (local.get $i) (struct.get $_Vec 1 (local.get $this)))
    (then (unreachable)))
  (ref.as_non_null
    (array.get $_VecData (struct.get $_Vec 0 (local.get $this)) (local.get $i)))
)

(func $__Vec$set (param $this (ref $_Vec)) (param $i i32) (param $v (ref null eq)) (result i32)
  (if (i32.ge_u (local.get $i) (struct.get $_Vec 1 (local.get $this)))
    (then (unreachable)))
  (array.set $_VecData
    (struct.get $_Vec 0 (local.get $this))
    (local.get $i)
    (local.get $v))
  (i32.const 0)
)

(func $__Vec$eq (param $a (ref $_Vec)) (param $b (ref $_Vec)) (result i32)
  (local $len i32) (local $i i32)
  (local $ad (ref $_VecData)) (local $bd (ref $_VecData))
  (if (ref.eq (local.get $a) (local.get $b)) (then (return (i32.const 1))))
  (local.set $len (struct.get $_Vec 1 (local.get $a)))
  (if (i32.ne (local.get $len) (struct.get $_Vec 1 (local.get $b)))
    (then (return (i32.const 0))))
  (local.set $ad (struct.get $_Vec 0 (local.get $a)))
  (local.set $bd (struct.get $_Vec 0 (local.get $b)))
  (local.set $i (i32.const 0))
  (block $done
    (loop $loop
      (br_if $done (i32.ge_s (local.get $i) (local.get $len)))
      (if (i32.eqz (ref.eq
        (array.get $_VecData (local.get $ad) (local.get $i))
        (array.get $_VecData (local.get $bd) (local.get $i))
      )) (then (return (i32.const 0))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $loop)
    )
  )
  (i32.const 1)
)
