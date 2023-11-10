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

#[cfg(test)]
mod tests {
  use super::measure_time;

  fn test_closure() {}

  #[test]
  fn boilterplate() {
    measure_time(true, "", test_closure);
    measure_time(false, "", test_closure);
  }
}
