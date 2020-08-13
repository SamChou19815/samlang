import Position from '../position';
import Range from '../range';

it('toString() works as expected', () => {
  expect(Range.DUMMY.toString()).toBe('0:0-0:0');
  expect(new Range(new Position(1, 1), new Position(2, 4)).toString()).toBe('2:2-3:5');
});

it('containsPosition() works as expected', () => {
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsPosition(new Position(2, 2))
  ).toBeTruthy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsPosition(new Position(1, 2))
  ).toBeFalsy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsPosition(new Position(3, 2))
  ).toBeFalsy();
});

it('containsRange() works as expected', () => {
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 3), new Position(3, 1))
    )
  ).toBeTruthy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 4), new Position(3, 0))
    )
  ).toBeTruthy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 3), new Position(3, 2))
    )
  ).toBeFalsy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 2), new Position(3, 1))
    )
  ).toBeFalsy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 2), new Position(3, 2))
    )
  ).toBeFalsy();
});

it('union() works as expected', () => {
  expect(
    new Range(new Position(1, 3), new Position(3, 1))
      .union(new Range(new Position(2, 3), new Position(4, 1)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());

  expect(
    new Range(new Position(2, 3), new Position(4, 1))
      .union(new Range(new Position(1, 3), new Position(3, 1)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());

  expect(
    new Range(new Position(1, 3), new Position(2, 3))
      .union(new Range(new Position(3, 1), new Position(4, 1)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());

  expect(
    new Range(new Position(3, 1), new Position(4, 1))
      .union(new Range(new Position(1, 3), new Position(2, 3)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());
});
