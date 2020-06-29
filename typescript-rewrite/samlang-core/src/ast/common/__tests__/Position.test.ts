import Position from '../Position';

it('Correct toString() for display', () => {
  expect(Position.DUMMY.toString()).toBe('0:0');
  expect(new Position(42, 53).toString()).toBe('43:54');
});

it('Position comparison smoke test', () => {
  expect(new Position(1, 4).compareTo(new Position(1, 4))).toBe(0);
});

it('Correct same line comparision test', () => {
  expect(new Position(1, 2).compareTo(new Position(1, 3))).toBeLessThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 2))).toBeGreaterThan(0);
  expect(new Position(1, 2).compareTo(new Position(1, 3))).toBeLessThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 2))).toBeGreaterThan(0);
  expect(new Position(1, 4).compareTo(new Position(1, 3))).toBeGreaterThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 4))).toBeLessThan(0);
  expect(new Position(1, 4).compareTo(new Position(1, 3))).toBeGreaterThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 4))).toBeLessThan(0);
});

it('Correct different lines comparision test', () => {
  expect(new Position(1, 2).compareTo(new Position(2, 3))).toBeLessThan(0);
  expect(new Position(1, 3).compareTo(new Position(2, 3))).toBeLessThan(0);
  expect(new Position(1, 4).compareTo(new Position(2, 3))).toBeLessThan(0);
  expect(new Position(2, 3).compareTo(new Position(1, 2))).toBeGreaterThan(0);
  expect(new Position(2, 3).compareTo(new Position(1, 3))).toBeGreaterThan(0);
  expect(new Position(2, 3).compareTo(new Position(1, 4))).toBeGreaterThan(0);
});
