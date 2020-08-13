import { Type } from '../ast/common/types';

const collectUndecidedTypeIndicesVisitor = (type: Type, collector: Set<number>): void => {
  switch (type.type) {
    case 'PrimitiveType':
      return;
    case 'IdentifierType':
      type.typeArguments.forEach((typeArgument) =>
        collectUndecidedTypeIndicesVisitor(typeArgument, collector)
      );
      return;
    case 'TupleType':
      type.mappings.forEach((oneType) => collectUndecidedTypeIndicesVisitor(oneType, collector));
      return;
    case 'FunctionType':
      type.argumentTypes.forEach((typeArgument) =>
        collectUndecidedTypeIndicesVisitor(typeArgument, collector)
      );
      collectUndecidedTypeIndicesVisitor(type.returnType, collector);
      return;
    case 'UndecidedType':
      collector.add(type.index);
  }
};

const collectUndecidedTypeIndices = (type: Type): ReadonlySet<number> => {
  const collector = new Set<number>();
  collectUndecidedTypeIndicesVisitor(type, collector);
  return collector;
};

export default collectUndecidedTypeIndices;
