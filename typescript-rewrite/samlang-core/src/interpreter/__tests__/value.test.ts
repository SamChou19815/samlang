import { Range, Position } from '../..';
import { EXPRESSION_TRUE } from '../../ast/lang/samlang-expressions';
import { Value, isSameValue } from '../value';

it('value equality test', () => {
  expect(isSameValue({ type: 'unit' }, { type: 'unit' })).toBeTruthy();
  expect(isSameValue({ type: 'unit' }, { type: 'bool', value: true })).toBeFalsy();
  expect(isSameValue({ type: 'unit' }, { type: 'int', value: 1 })).toBeFalsy();
  expect(isSameValue({ type: 'unit' }, { type: 'string', value: 'string' })).toBeFalsy();
  expect(isSameValue({ type: 'unit' }, { type: 'tuple', tupleContent: [] })).toBeFalsy();
  expect(isSameValue({ type: 'unit' }, { type: 'object', objectContent: new Map() })).toBeFalsy();
  expect(
    isSameValue({ type: 'unit' }, { type: 'variant', tag: 'tag', data: { type: 'unit' } })
  ).toBeFalsy();

  expect(isSameValue({ type: 'bool', value: true }, { type: 'bool', value: true })).toBeTruthy();
  expect(isSameValue({ type: 'bool', value: false }, { type: 'bool', value: false })).toBeTruthy();
  expect(isSameValue({ type: 'bool', value: true }, { type: 'bool', value: false })).toBeFalsy();
  expect(isSameValue({ type: 'bool', value: false }, { type: 'bool', value: true })).toBeFalsy();

  expect(isSameValue({ type: 'int', value: 1 }, { type: 'int', value: 1 })).toBeTruthy();
  expect(isSameValue({ type: 'int', value: 1 }, { type: 'int', value: 2 })).toBeFalsy();

  expect(
    isSameValue({ type: 'string', value: 'string' }, { type: 'string', value: 'string' })
  ).toBeTruthy();
  expect(
    isSameValue({ type: 'string', value: 'string' }, { type: 'string', value: 'not a string' })
  ).toBeFalsy();

  expect(
    isSameValue({ type: 'string', value: 'string' }, { type: 'string', value: 'string' })
  ).toBeTruthy();
  expect(
    isSameValue({ type: 'string', value: 'string' }, { type: 'string', value: 'not a string' })
  ).toBeFalsy();

  expect(
    isSameValue({ type: 'tuple', tupleContent: [] }, { type: 'tuple', tupleContent: [] })
  ).toBeTruthy();
  expect(
    isSameValue(
      { type: 'tuple', tupleContent: [] },
      { type: 'tuple', tupleContent: [{ type: 'unit' }] }
    )
  ).toBeFalsy();
  expect(
    isSameValue(
      { type: 'tuple', tupleContent: [{ type: 'unit' }] },
      { type: 'tuple', tupleContent: [{ type: 'unit' }] }
    )
  ).toBeTruthy();

  expect(
    isSameValue(
      { type: 'object', objectContent: new Map() },
      { type: 'object', objectContent: new Map() }
    )
  ).toBeTruthy();
  const objectContent1 = new Map<string, Value>();
  objectContent1.set('field1', { type: 'unit' });
  const objectContent2 = new Map<string, Value>();
  objectContent2.set('field1', { type: 'int', value: 1 });
  expect(
    isSameValue(
      { type: 'object', objectContent: objectContent1 },
      { type: 'object', objectContent: objectContent2 }
    )
  ).toBeFalsy();
  objectContent2.set('field2', { type: 'unit' });
  expect(
    isSameValue(
      { type: 'object', objectContent: objectContent1 },
      { type: 'object', objectContent: objectContent2 }
    )
  ).toBeFalsy();

  expect(
    isSameValue(
      { type: 'variant', tag: 'tag', data: { type: 'unit' } },
      { type: 'variant', tag: 'tag', data: { type: 'unit' } }
    )
  ).toBeTruthy();
  expect(
    isSameValue(
      { type: 'variant', tag: 'tag', data: { type: 'unit' } },
      { type: 'variant', tag: 'diff tag', data: { type: 'unit' } }
    )
  ).toBeFalsy();
  expect(
    isSameValue(
      { type: 'variant', tag: 'tag', data: { type: 'unit' } },
      { type: 'variant', tag: 'diff tag', data: { type: 'int', value: 1 } }
    )
  ).toBeFalsy();

  const samlangExpression = EXPRESSION_TRUE(new Range(new Position(1, 2), new Position(3, 4)));
  expect(
    isSameValue(
      {
        type: 'functionValue',
        arguments: [],
        body: samlangExpression,
        context: { classes: new Map(), localValues: new Map() },
      },
      {
        type: 'functionValue',
        arguments: [],
        body: samlangExpression,
        context: { classes: new Map(), localValues: new Map() },
      }
    )
  ).toBeTruthy();
  expect(
    isSameValue(
      {
        type: 'functionValue',
        arguments: ['param'],
        body: samlangExpression,
        context: { classes: new Map(), localValues: new Map() },
      },
      {
        type: 'functionValue',
        arguments: [],
        body: samlangExpression,
        context: { classes: new Map(), localValues: new Map() },
      }
    )
  ).toBeFalsy();
});
