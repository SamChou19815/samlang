import { Range, Position } from '../..';
import { EXPRESSION_TRUE } from '../../ast/samlang-expressions';
import type { Value } from '../value';

it('value equality test', () => {
  expect({ type: 'unit' }).toEqual({ type: 'unit' });
  expect({ type: 'unit' }).not.toEqual({ type: 'bool', value: true });
  expect({ type: 'unit' }).not.toEqual({ type: 'int', value: 1 });
  expect({ type: 'unit' }).not.toEqual({ type: 'string', value: 'string' });
  expect({ type: 'unit' }).not.toEqual({ type: 'tuple', tupleContent: [] });
  expect({ type: 'unit' }).not.toEqual({ type: 'object', objectContent: new Map() });
  expect({ type: 'unit' }).not.toEqual({ type: 'variant', tag: 'tag', data: { type: 'unit' } });

  expect({ type: 'bool', value: true }).toEqual({ type: 'bool', value: true });
  expect({ type: 'bool', value: false }).toEqual({ type: 'bool', value: false });
  expect({ type: 'bool', value: true }).not.toEqual({ type: 'bool', value: false });
  expect({ type: 'bool', value: false }).not.toEqual({ type: 'bool', value: true });

  expect({ type: 'int', value: 1 }).toEqual({ type: 'int', value: 1 });
  expect({ type: 'int', value: 1 }).not.toEqual({ type: 'int', value: 2 });

  expect({ type: 'string', value: 'string' }).toEqual({ type: 'string', value: 'string' });
  expect({ type: 'string', value: 'string' }).not.toEqual({
    type: 'string',
    value: 'not a string',
  });

  expect({ type: 'string', value: 'string' }).toEqual({ type: 'string', value: 'string' });
  expect({ type: 'string', value: 'string' }).not.toEqual({
    type: 'string',
    value: 'not a string',
  });

  expect({ type: 'tuple', tupleContent: [] }).toEqual({ type: 'tuple', tupleContent: [] });
  expect({ type: 'tuple', tupleContent: [] }).not.toEqual({
    type: 'tuple',
    tupleContent: [{ type: 'unit' }],
  });
  expect({ type: 'tuple', tupleContent: [{ type: 'unit' }] }).toEqual({
    type: 'tuple',
    tupleContent: [{ type: 'unit' }],
  });

  expect({ type: 'object', objectContent: new Map() }).toEqual({
    type: 'object',
    objectContent: new Map(),
  });
  const objectContent1 = new Map<string, Value>();
  objectContent1.set('field1', { type: 'unit' });
  const objectContent2 = new Map<string, Value>();
  objectContent2.set('field1', BigInt(1));
  expect({ type: 'object', objectContent: objectContent1 }).not.toEqual({
    type: 'object',
    objectContent: objectContent2,
  });
  objectContent2.set('field2', { type: 'unit' });
  expect({ type: 'object', objectContent: objectContent1 }).not.toEqual({
    type: 'object',
    objectContent: objectContent2,
  });

  expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).toEqual({
    type: 'variant',
    tag: 'tag',
    data: { type: 'unit' },
  });
  expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).not.toEqual({
    type: 'variant',
    tag: 'diff tag',
    data: { type: 'unit' },
  });
  expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).not.toEqual({
    type: 'variant',
    tag: 'diff tag',
    data: { type: 'int', value: 1 },
  });

  const samlangExpression = EXPRESSION_TRUE(new Range(new Position(1, 2), new Position(3, 4)));
  expect({
    type: 'functionValue',
    arguments: [],
    body: samlangExpression,
    context: { classes: new Map(), localValues: new Map() },
  }).toEqual({
    type: 'functionValue',
    arguments: [],
    body: samlangExpression,
    context: { classes: new Map(), localValues: new Map() },
  });
  expect({
    type: 'functionValue',
    arguments: ['param'],
    body: samlangExpression,
    context: { classes: new Map(), localValues: new Map() },
  }).not.toEqual({
    type: 'functionValue',
    arguments: [],
    body: samlangExpression,
    context: { classes: new Map(), localValues: new Map() },
  });
});
