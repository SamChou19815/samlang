const LOGO: &str = r#"
................................................................................
................................................................................
................................................................................
................................................................................
...............WOolllllllo0W....................................................
................XdccccccccdX....................................................
................W0lccccccclkN...................................................
.................Nxcccccccco0W..................................................
..................KoccccccccxX..................................................
..................WOlccccccclOW.................................................
...................XxccccccccoK.................................................
...................W0occccccccxN................................................
....................NklccccccclOW...............................................
.....................XdccccccccdK...............................................
.....................WOlccccccclkN..............................................
......................Nxcccccccco0W.............................................
.......................KoccccccccdX.............................................
.......................WOlccccccclkN............................................
........................XxccccccccoKW...........................................
........................W0occccccccxX..............................WNK0KW.......
........................NkccccccccclOW........................WNX0kdlc:xN.......
.......................Nxc::ccccccccoKW..................WNX0kdlc:;;;;;xN.......
......................Xd:;;:cccccccccxN.............WNX0kdlc:;;;;;;;;;;xN.......
.....................Ko:;;;::cccccccclOW...........W0oc:;;;;;;;;;;;:coxKW.......
....................0o:;;;;;:cccccccccdX...........Nxccc::::;;:codk0XNW.........
...................0l;;;;;;:odlccccccclkXN.........Nkccccccccclx0XW.............
..................Oc;;;;;;:dXXdccccccccox0W........Nkcccccccccccloxk0KNW........
.................kc;;;;;;:xN.W0occcccccccdXX.......WKkdolccccccccccccloOW.......
...............Xx:;;;;;;ckN...NklcccccccclOW.........WWXKOxdllcccccccccxN.......
..............Xd:;;;;;;cOW.....KdcccccccccoKW............WN0xl:::ccccccxN.......
.............Ko:;;;;;:lOW......WOlcccccccccxN.......WNX0kdoc:;;;;;::::cxN.......
............0l:;;;;;:l0W........NxccccccccclOW.....WOoc:;;;;;;;;;;;:coxKW.......
...........Oc;;;;;;:oK...........KocccccccccdK.....Nx:;;;;;;;;:cldk0XNW.........
..........kc;;;;;;:dX............WklcccccccclkN....Nx;;;;;:loxOKNW..............
.........x:;;;;;;:xX..............Xdccccccccco0W...Nx:coxOKNW...................
........XOkkkkkkk0N...............WXOOOOOOOOOOKW...WX0XNW.......................
................................................................................
................................................................................
................................................................................
................................................................................
"#;

pub(super) fn get_logo() -> &'static str {
  LOGO.trim_start()
}

#[cfg(test)]
mod tests {
  #[test]
  fn coverage() {
    assert!(!super::get_logo().is_empty())
  }
}
