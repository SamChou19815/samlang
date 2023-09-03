use std::time::Instant;

pub fn measure_time<R, F: FnOnce() -> R>(enabled: bool, name: &'static str, f: F) -> R {
  if enabled {
    let now = Instant::now();
    let result = f();
    let time = now.elapsed().as_micros();
    eprintln!("{name} takes {}ms.", (time as f64) / 1000.0);
    result
  } else {
    f()
  }
}

/// Forked from https://github.com/Sgeo/take_mut/blob/master/src/lib.rs
/// Assuming no panic
pub(crate) fn take_mut<T, F: FnOnce(T) -> T>(mut_ref: &mut T, closure: F) {
  unsafe {
    let old_t = std::ptr::read(mut_ref);
    let new_t = closure(old_t);
    std::ptr::write(mut_ref, new_t);
  }
}

#[cfg(test)]
mod tests {
  use super::measure_time;
  use pretty_assertions::assert_eq;

  fn test_closure() {}

  #[test]
  fn boilterplate() {
    measure_time(true, "", test_closure);
    measure_time(false, "", test_closure);
  }

  #[test]
  fn take_mut_tests() {
    #[derive(PartialEq, Eq, Debug)]
    enum Foo {
      A,
      B,
    }
    assert_eq!("A", format!("{:?}", Foo::A));
    assert_eq!("B", format!("{:?}", Foo::B));
    impl Drop for Foo {
      fn drop(&mut self) {
        match *self {
          Foo::A => println!("Foo::A dropped"),
          Foo::B => println!("Foo::B dropped"),
        }
      }
    }
    let mut foo = Foo::A;
    super::take_mut(&mut foo, |f| {
      drop(f);
      Foo::B
    });
    assert_eq!(&foo, &Foo::B);
  }
}
