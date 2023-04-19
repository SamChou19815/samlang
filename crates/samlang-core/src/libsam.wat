(type $t0 (func (param i32) (result i32)))
(type $t1 (func (param i32 i32) (result i32)))
(type $t2 (func))
(import "env" "memory" (memory $env.memory 2))
(import "builtins" "__Builtins$println" (func $__Builtins$println (param i32) (result i32)))
(import "builtins" "__Builtins$panic" (func $__Builtins$panic (param i32) (result i32)))
(global $g0 (mut i32) (i32.const 66688))
(data $d0 (i32.const 1024) "0\00-2147483648\00\00\00\08\00\00\00\10\00\00\00\18\00\00\00 \00\00\00(\00\00\000\00\00\00@\00\00\00P\00\00\00\80\00\00\00\00\01\00\00")
(data $d1 (i32.const 1088) "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00")
(func $_builtin_malloc (type $t0) (param $p0 i32) (result i32)
  (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32) (local $l6 i32)
  (local.set $l1 (i32.const 0))
  (block $B0
    (br_if $B0 (i32.lt_u (local.tee $l2 (i32.add (local.get $p0) (i32.const 7))) (i32.const 16)))
    (local.set $l1 (i32.const 1))
    (br_if $B0 (i32.eq (local.tee $l3 (i32.shr_u (local.get $l2) (i32.const 3))) (i32.const 2)))
    (local.set $l1 (i32.const 2))
    (br_if $B0 (i32.lt_u (local.get $l2) (i32.const 32)))
    (local.set $l1 (i32.const 3))
    (br_if $B0 (i32.eq (local.get $l3) (i32.const 4)))
    (local.set $l1 (i32.const 4))
    (br_if $B0 (i32.lt_u (local.get $l2) (i32.const 48)))
    (local.set $l1 (i32.const 5))
    (br_if $B0 (i32.eq (local.get $l3) (i32.const 6)))
    (local.set $l1 (i32.const 6))
    (br_if $B0 (i32.lt_u (local.get $l2) (i32.const 72)))
    (local.set $l1 (i32.const 7))
    (br_if $B0 (i32.lt_u (local.get $l2) (i32.const 88)))
    (local.set $l1 (i32.const 8))
    (br_if $B0 (i32.lt_u (local.get $l2) (i32.const 136)))
    (local.set $l1 (i32.const 9))
    (br_if $B0 (i32.lt_u (local.get $l2) (i32.const 264)))
    (return
      (select
        (i32.add (local.tee $l1 (call $allocate_large_object (local.get $p0))) (i32.const 8))
        (i32.const 0)
        (local.get $l1)
      )
    )
  )
  (block $B1
    (block $B2
      (br_if $B2
        (local.tee $l2
          (i32.load
            (local.tee $l4 (i32.add (i32.shl (local.get $l1) (i32.const 2)) (i32.const 1104)))
          )
        )
      )
      (local.set $l2 (i32.const 0))
      (block $B3
        (block $B4
          (br_if $B4
            (i32.eqz (local.tee $p0 (i32.load offset=1140 (i32.const 0)))))
            (i32.store offset=1140 (i32.const 0) (i32.load (local.get $p0)))
          (br $B3)
        )
        (br_if $B1 (i32.eqz (local.tee $p0 (call $allocate_large_object (i32.const 0)))))
      )
      (i32.store8
        (i32.or
          (local.tee $l2 (i32.and (local.get $p0) (i32.const -65536)))
          (local.tee $p0 (i32.and (i32.shr_u (local.get $p0) (i32.const 8)) (i32.const 255)))
        )
        (local.get $l1)
      )
      (local.set $l5
        (i32.add
          (local.tee $p0
            (i32.or
              (i32.shl (local.get $p0) (i32.const 8))
              (local.get $l2)))
          (i32.const 256)
        )
      )
      (local.set $p0
        (i32.add
          (i32.sub
            (local.get $p0)
            (local.tee $l3
              (i32.load
                (i32.add
                  (i32.shl (local.get $l1) (i32.const 2))
                  (i32.const 1040)
                )
              )
            )
          )
          (i32.const 256)
        )
      )
      (local.set $l2 (i32.const 0))
      (local.set $l6 (i32.sub (i32.const 0) (local.get $l3)))
      (local.set $l1 (local.get $l3))
      (block $B5
        (loop $L6
          (br_if $B5 (i32.gt_u (local.get $l1) (i32.const 256)))
          (i32.store (local.get $p0) (local.get $l2))
          (local.set $p0 (i32.add (local.get $p0) (local.get $l6)))
          (local.set $l2 (i32.sub (local.get $l5) (local.get $l1)))
          (local.set $l1 (i32.add (local.get $l1) (local.get $l3)))
          (br $L6)
        )
      )
      (block $B7
        (br_if $B7 (local.get $l2))
        (return (i32.const 0))
      )
      (i32.store (local.get $l4) (local.get $l2))
    )
    (i32.store (local.get $l4) (i32.load (local.get $l2)))
  )
  (local.get $l2)
)
(func $allocate_large_object (type $t0) (param $p0 i32) (result i32)
  (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32) (local $l6 i32) (local $l7 i32) (local $l8 i32)
  (local.set $l1 (i32.const 0))
  (block $B0
    (br_if $B0 (i32.eqz (i32.load8_u offset=1092 (i32.const 0))))
    (i32.store8 offset=1092 (i32.const 0) (i32.const 0))
    (local.set $l2 (i32.const 1088))
    (loop $L1
      (br_if $B0 (i32.eqz (local.tee $l3 (i32.load (local.get $l2)))))
      (local.set $l4 (i32.add (local.get $l3) (i32.const 8)))
      (local.set $l5 (i32.load offset=4 (local.get $l3)))
      (block $B2
        (loop $L3
          (br_if $B2
            (i32.eqz
              (local.tee $l7
                (i32.and
                  (i32.shr_u (local.tee $l6 (i32.add (local.get $l4) (local.get $l5))) (i32.const 8))
                  (i32.const 255)
                )
              )
            )
          )
          (br_if $B2
            (i32.ne
              (i32.load8_u (i32.or (i32.and (local.get $l6) (i32.const -65536)) (local.get $l7)))
              (i32.const 254)
            )
          )
          (local.set $l7 (i32.const 1088))
          (loop $L4
            (br_if $L4
              (i32.ne
                (local.tee $l7 (i32.load (local.tee $l8 (local.get $l7))))
                (local.get $l6)
              )
            )
          )
          (i32.store (local.get $l8) (i32.load (local.get $l6)))
          (i32.store offset=4
            (local.get $l3)
            (local.tee $l5
              (i32.add
                (i32.add (local.get $l5) (i32.load offset=4 (local.get $l6)))
                (i32.const 8)
              )
            )
          )
          (local.set $l2
            (select
              (local.get $l8)
              (local.get $l2)
              (i32.eq (local.get $l2) (local.get $l6))
            )
          )
          (br $L3)
        )
      )
      (local.set $l2 (i32.load (local.get $l2)))
      (br $L1)
    )
  )
  (local.set $l3 (i32.and (i32.add (local.get $p0) (i32.const 263)) (i32.const -256)))
  (local.set $l5 (i32.const -1))
  (local.set $l8 (i32.const 1088))
  (local.set $l2 (i32.const 1088))
  (block $B5
    (block $B6
      (block $B7
        (loop $L8
          (br_if $B7 (i32.eqz (local.tee $l7 (i32.load (local.get $l8)))))
          (block $B9
            (br_if $B9 (i32.lt_u (local.tee $l6 (i32.load offset=4 (local.get $l7))) (local.get $p0)))
            (br_if $B9 (i32.ge_u (local.get $l6) (local.get $l5)))
            (local.set $l5 (local.get $l6))
            (local.set $l2 (local.get $l8))
            (local.set $l1 (local.get $l7))
            (br_if $B9 (i32.ne (i32.add (local.get $l6) (i32.const 8)) (local.get $l3)))
            (local.set $l2 (local.get $l8))
            (local.set $l5 (local.get $l6))
            (local.set $l1 (local.get $l7))
            (br $B6)
          )
          (local.set $l8 (local.get $l7))
          (br $L8)
        )
      )
      (br_if $B6 (local.get $l1))
      (local.set $l3 (i32.shl (memory.size) (i32.const 16)))
      (local.set $l8 (i32.add (local.get $p0) (i32.const 264)))
      (local.set $l4 (i32.const 0))
      (block $B10
        (block $B11
          (br_if $B11 (i32.eqz (local.tee $l5 (i32.load offset=1096 (i32.const 0)))))
          (local.set $l6 (i32.const 0))
          (local.set $l7 (local.get $l3))
          (br $B10)
        )
        (i32.store offset=1096
          (i32.const 0)
          (local.tee $l5
            (i32.sub
              (local.get $l3)
              (local.tee $l7 (i32.and (i32.add (i32.const 66688) (i32.const 65535)) (i32.const -65536)))
            )
          )
        )
        (local.set $l6 (local.get $l5))
      )
      (block $B12
        (br_if $B12 (i32.le_u (local.get $l8) (local.get $l6)))
        (br_if $B5
          (i32.eq
            (memory.grow
              (i32.shr_u
                (local.tee $l8
                  (i32.add
                    (select
                      (local.tee $l8 (i32.sub (local.get $l8) (local.get $l6)))
                      (local.tee $l5 (i32.shr_u (local.get $l5) (i32.const 1)))
                      (i32.lt_u (local.get $l5) (local.get $l8))
                    )
                    (i32.const 65535)
                  )
                )
                (i32.const 16)
              )
            )
            (i32.const -1)
          )
        )
        (i32.store offset=1096
          (i32.const 0)
          (i32.add
            (i32.load offset=1096 (i32.const 0))
            (local.tee $l4 (i32.and (local.get $l8) (i32.const -65536)))
          )
        )
      )
      (br_if $B5 (i32.eqz (local.get $l7)))
      (i32.store8 offset=1 (local.get $l7) (i32.const 255))
      (i32.store offset=256 (local.get $l7) (i32.load offset=1088 (i32.const 0)))
      (i32.store
        (i32.add (local.get $l7) (i32.const 260))
        (local.tee $l5
          (i32.add
            (i32.and (i32.add (local.get $l4) (local.get $l6)) (i32.const -65536))
            (i32.const -264)
          )
        )
      )
      (local.set $l1 (i32.add (local.get $l7) (i32.const 256)))
    )
    (i32.store8
      (i32.or
        (local.tee $l7 (i32.and (local.get $l1) (i32.const -65536)))
        (i32.and (i32.shr_u (local.get $l1) (i32.const 8)) (i32.const 255))
      )
      (i32.const 255)
    )
    (i32.store (local.get $l2) (i32.load (local.get $l1)))
    (block $B13
      (br_if $B13 (local.tee $l6 (i32.and (i32.sub (local.get $l5) (local.get $p0)) (i32.const -256))))
      (return (local.get $l1))
    )
    (local.set $l3 (local.get $l1))
    (block $B14
      (br_if $B14
        (i32.eq
          (local.get $l7)
          (i32.and
            (i32.add
              (i32.xor (local.get $l6) (i32.const -1))
              (local.tee $l8
                (i32.add
                  (local.tee $l2 (i32.add (local.get $l1) (i32.const 8)))
                  (local.get $l5))
                )
              )
            (i32.const -65536)
          )
        )
      )
      (local.set $l6 (i32.and (local.get $l2) (i32.const 65535)))
      (block $B15
        (br_if $B15 (i32.gt_u (local.get $p0) (i32.const 65271)))
        (i32.store8
          (i32.add
            (local.get $l7)
            (i32.and (i32.shr_u (local.get $l2) (i32.const 8)) (i32.const 255))
          )
          (i32.const 254)
        )
        (i32.store (local.get $l1) (i32.load offset=1088 (i32.const 0)))
        (i32.store offset=4
          (local.get $l1)
          (local.tee $l6 (i32.sub (i32.const 65536) (local.get $l6)))
        )
        (i32.store offset=1088 (i32.const 0) (local.get $l1))
        (call $maybe_repurpose_single_chunk_large_objects_head)
        (i32.store
          (i32.add (local.get $l7) (i32.const 65796))
          (local.tee $l6 (i32.add (i32.sub (local.get $l5) (local.get $l6)) (i32.const -264)))
        )
        (i32.store8 (i32.add (local.get $l7) (i32.const 65537)) (i32.const 255))
        (local.set $l3 (i32.add (local.get $l7) (i32.const 65792)))
        (local.set $l6 (i32.and (i32.sub (local.get $l6) (local.get $p0)) (i32.const -256)))
        (br $B14)
      )
      (local.set $l6
        (i32.add
          (i32.sub
            (i32.add (local.get $l5) (local.get $l6))
            (i32.and (i32.add (i32.add (local.get $p0) (local.get $l6)) (i32.const -1)) (i32.const -65536))
          )
          (i32.const -65536)
        )
      )
      (local.set $l3 (local.get $l1))
    )
    (i32.store offset=4 (local.get $l3) (i32.sub (i32.load offset=4 (local.get $l3)) (local.get $l6)))
    (local.set $l7 (i32.add (local.get $l6) (i32.const 248)))
    (local.set $l8
      (i32.and
        (i32.shr_u  (i32.sub (local.get $l8) (local.get $l6)) (i32.const 8))
        (i32.const 255)
      )
    )
    (block $B16
      (loop $L17
        (local.set $l2 (local.get $l8))
        (local.set $l7 (i32.add (local.tee $l6 (local.get $l7)) (i32.const -256)))
        (br_if $B16 (i32.eq (local.get $l6) (i32.const 248)))
        (local.set $l8  (i32.const 1))
        (br_if $L17 (i32.eqz (local.get $l2)))
      )
    )
    (block $B18
      (br_if $B18 (i32.eq (local.get $l6) (i32.const 248)))
      (i32.store8
        (i32.add
          (local.tee $l6
            (i32.and
              (i32.sub (i32.add (local.get $l5) (local.get $l1)) (local.get $l7))
              (i32.const -65536)
            )
          )
          (local.get $l2)
        )
        (i32.const 254)
      )
      (i32.store
        (local.tee $l6 (i32.add (local.get $l6) (i32.shl (local.get $l2) (i32.const 8))))
        (i32.load offset=1088 (i32.const 0))
      )
      (i32.store offset=4 (local.get $l6) (local.get $l7))
      (i32.store offset=1088 (i32.const 0) (local.get $l6))
      (call $maybe_repurpose_single_chunk_large_objects_head)
    )
    (return (local.get $l3))
  )
  (i32.const 0)
)
(func $_builtin_free (type $t0) (param $p0 i32) (result i32)
  (local $l1 i32) (local $l2 i32)
  (block $B0
    (br_if $B0 (i32.eqz (local.get $p0)))
    (block $B1
      (br_if $B1
        (i32.ne
          (local.tee $l2
            (i32.load8_u
              (local.tee $l1
                (i32.or
                  (i32.and (local.get $p0) (i32.const -65536))
                  (i32.and (i32.shr_u (local.get $p0) (i32.const 8)) (i32.const 255))
                )
              )
            )
          )
          (i32.const 255)
        )
      )
      (i32.store
        (local.tee $p0 (i32.add (local.get $p0) (i32.const -8)))
        (i32.load offset=1088 (i32.const 0))
      )
      (i32.store offset=1088 (i32.const 0) (local.get $p0))
      (i32.store8 (local.get $l1) (i32.const 254))
      (i32.store8 offset=1092 (i32.const 0) (i32.const 1))
      (br $B0)
    )
    (i32.store
      (local.get $p0)
      (i32.load (local.tee $l2 (i32.add (i32.shl (local.get $l2) (i32.const 2)) (i32.const 1104))))
    )
    (i32.store (local.get $l2) (local.get $p0))
  )
  (i32.const 0)
)
(func $__Builtins$intToString (type $t0) (param $p0 i32) (result i32)
  (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32)
  (global.set $g0 (local.tee $l1 (i32.sub (global.get $g0) (i32.const 16))))
  (block $B0
    (block $B1
      (br_if $B1 (i32.eq (local.get $p0) (i32.const -2147483648)))
      (block $B2
        (br_if $B2 (local.get $p0))
        (local.set $l2 (call $mkString (i32.const 1024)))
        (br $B0)
      )
      (local.set $l2 (i32.shr_u (local.get $p0) (i32.const 31)))
      (block $B3
        (br_if $B3 (i32.gt_s (local.get $p0) (i32.const -1)))
        (i32.store8 (local.get $l1) (i32.const 45))
        (local.set $p0 (i32.sub (i32.const 0) (local.get $p0)))
      )
      (local.set $l2 (i32.or (local.get $l1) (local.get $l2)))
      (local.set $l3 (i32.const 0))
      (block $B4
        (loop $L5
          (br_if $B4 (i32.lt_s (local.get $p0) (i32.const 1)))
          (i32.store8
            (i32.add (local.get $l2) (local.get $l3))
            (i32.or
              (i32.sub
                (local.get $p0)
                (i32.mul (local.tee $l4 (i32.div_u (local.get $p0) (i32.const 10))) (i32.const 10))
              )
              (i32.const 48)
            )
          )
          (local.set $l3 (i32.add (local.get $l3) (i32.const 1)))
          (local.set $p0 (local.get $l4))
          (br $L5)
        )
      )
      (i32.store8 (local.tee $p0 (i32.add (local.get $l2) (local.get $l3))) (i32.const 0))
      (local.set $l3
        (select
          (local.tee $l3
            (i32.div_s
              (local.get $l3)
              (i32.const 2)))
          (i32.const 0)
          (i32.gt_s (local.get $l3) (i32.const 0))
        )
      )
      (local.set $p0 (i32.add (local.get $p0) (i32.const -1)))
      (loop $L6
        (block $B7
          (br_if $B7 (local.get $l3))
          (local.set $l2 (call $mkString (local.get $l1)))
          (br $B0)
        )
        (local.set $l4 (i32.load8_u (local.get $l2)))
        (i32.store8 (local.get $l2) (i32.load8_u (local.get $p0)))
        (i32.store8 (local.get $p0) (local.get $l4))
        (local.set $l2 (i32.add (local.get $l2) (i32.const 1)))
        (local.set $p0 (i32.add (local.get $p0) (i32.const -1)))
        (local.set $l3 (i32.add (local.get $l3) (i32.const -1)))
        (br $L6)
      )
    )
    (local.set $l2 (call $mkString (i32.const 1026)))
  )
  (global.set $g0 (i32.add (local.get $l1) (i32.const 16)))
  (local.get $l2)
)
(func $mkString (type $t0) (param $p0 i32) (result i32)
  (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32)
  (local.set $l1 (i32.add (local.get $p0) (i32.const -1)))
  (loop $L0
    (br_if $L0 (i32.load8_u (local.tee $l1 (i32.add (local.get $l1) (i32.const 1)))))
  )
  (local.set $l4
    (i32.add
      (local.tee $l3
        (call $mkArray
          (local.tee $l2 (i32.sub (local.get $l1) (local.get $p0)))
          (local.get $l2)))
      (i32.const 8)
    )
  )
  (local.set $l1 (i32.const 0))
  (block $B1
    (loop $L2
      (br_if $B1 (i32.ge_s (local.get $l1) (local.get $l2)))
      (i32.store8
        (i32.add (local.get $l4) (local.get $l1))
        (i32.load8_u (i32.add (local.get $p0) (local.get $l1)))
      )
      (local.set $l1 (i32.add (local.get $l1) (i32.const 1)))
      (br $L2)
    )
  )
  (local.get $l3)
)
(func $mkArray (type $t1) (param $p0 i32) (param $p1 i32) (result i32)
  (i32.store offset=4
    (local.tee $p0
      (call $_builtin_malloc (i32.add (local.get $p0) (i32.const 8))))
      (local.get $p1)
  )
  (i32.store (local.get $p0) (i32.const 1))
  (local.get $p0)
)
(func $__Builtins$stringToInt (type $t0) (param $p0 i32) (result i32)
  (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32)
  (block $B0
    (br_if $B0 (i32.eqz (local.tee $l1 (i32.load offset=4 (local.get $p0)))))
    (local.set $l2 (i32.add (local.get $p0) (i32.const 8)))
    (local.set $p0 (i32.eq (local.tee $l3 (i32.load (local.get $p0))) (i32.const 45)))
    (local.set $l4 (i32.const 0))
    (block $B1
      (loop $L2
        (br_if $B1 (i32.ge_s (local.get $p0) (local.get $l1)))
        (br_if $B0
          (i32.gt_u
            (i32.and
              (i32.add
                (local.tee $l5 (i32.load8_u (i32.add (local.get $l2) (local.get $p0))))
                (i32.const -48)
              )
              (i32.const 255)
            )
            (i32.const 9)
          )
        )
        (local.set $p0 (i32.add (local.get $p0) (i32.const 1)))
        (local.set $l4
          (i32.add
            (i32.add (i32.mul (local.get $l4) (i32.const 10)) (local.get $l5))
            (i32.const -48)
          )
        )
        (br $L2)
      )
    )
    (return
      (select
        (i32.sub (i32.const 0) (local.get $l4))
        (local.get $l4)
        (i32.eq (local.get $l3) (i32.const 45))
      )
    )
  )
  (i32.const 0)
)
(func $__Builtins$stringConcat (type $t1) (param $p0 i32) (param $p1 i32) (result i32)
  (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32) (local $l6 i32)
  (local.set $l2 (i32.add (local.get $p1) (i32.const 8)))
  (local.set $l3 (i32.add (local.get $p0) (i32.const 8)))
  (local.set $l6
    (i32.add
      (local.tee $l5
        (call $mkArray
          (local.tee $p0
            (i32.add
              (local.tee $l4 (i32.load offset=4 (local.get $p1)))
              (local.tee $p1 (i32.load offset=4 (local.get $p0)))
            )
          )
          (local.get $p0)
        )
      )
      (i32.const 8)
    )
  )
  (local.set $p0 (i32.const 0))
  (block $B0
    (loop $L1
      (block $B2
        (br_if $B2 (i32.lt_s (local.get $p0) (local.get $p1)))
        (local.set $p1 (i32.add (i32.add (local.get $p1) (local.get $l5)) (i32.const 8)))
        (local.set $p0 (i32.const 0))
        (loop $L3
          (br_if $B0 (i32.ge_s (local.get $p0) (local.get $l4)))
          (i32.store8 (i32.add (local.get $p1) (local.get $p0))
          (i32.load8_u (i32.add (local.get $l2) (local.get $p0))))
          (local.set $p0 (i32.add (local.get $p0) (i32.const 1)))
          (br $L3)
        )
      )
      (i32.store8
        (i32.add (local.get $l6) (local.get $p0))
        (i32.load8_u (i32.add (local.get $l3) (local.get $p0)))
      )
      (local.set $p0 (i32.add (local.get $p0) (i32.const 1)))
      (br $L1)
    )
  )
  (local.get $l5)
)
(func $maybe_repurpose_single_chunk_large_objects_head (type $t2)
  (local $l0 i32) (local $l1 i32)
  (block $B0
    (br_if $B0
      (i32.gt_u
        (i32.load offset=4 (local.tee $l0 (i32.load offset=1088 (i32.const 0))))
        (i32.const 255)
      )
    )
    (i32.store8
      (i32.or
        (local.tee $l1 (i32.and (local.get $l0) (i32.const -65536)))
        (local.tee $l0 (i32.and (i32.shr_u (local.get $l0) (i32.const 8)) (i32.const 255)))
      )
      (i32.const 9)
    )
    (i32.store offset=1088
      (i32.const 0)
      (i32.load (i32.load offset=1088 (i32.const 0)))
    )
    (i32.store
      (local.tee $l0 (i32.or (local.get $l1) (i32.shl (local.get $l0) (i32.const 8))))
      (i32.load offset=1140 (i32.const 0))
    )
    (i32.store offset=1140 (i32.const 0) (local.get $l0))
  )
)
