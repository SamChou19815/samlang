export type LLVMType =
  | 'void'
  | 'int'
  | { readonly __type__: 'PointerType'; readonly boxed: LLVMType }
  | { readonly __type__: 'StructType'; readonly mappings: readonly LLVMType[] }
  | {
      readonly __type__: 'FunctionType';
      readonly argumentTypes: readonly LLVMType[];
      readonly returnTypes: LLVMType;
    };
