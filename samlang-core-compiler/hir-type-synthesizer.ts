import type { HighIRTypeDefinition } from 'samlang-core-ast/hir-toplevel';
import { HighIRType, prettyPrintHighIRType } from 'samlang-core-ast/hir-types';
import { checkNotNull } from 'samlang-core-utils';

/** A helper class to generate an identifier type for each struct type. */
export default class HighIRTypeSynthesizer {
  private readonly _synthesized = new Map<string, HighIRTypeDefinition>();
  private readonly reverseMap = new Map<string, string>();
  private nextID = 0;

  public get mappings(): ReadonlyMap<string, HighIRTypeDefinition> {
    return this._synthesized;
  }

  public get synthesized(): readonly HighIRTypeDefinition[] {
    return Array.from(this._synthesized.values());
  }

  public synthesize(mappings: readonly HighIRType[]): HighIRTypeDefinition {
    const key = mappings.map(prettyPrintHighIRType).join(',');
    const existingIdentifier = this.reverseMap.get(key);
    if (existingIdentifier != null) return checkNotNull(this._synthesized.get(existingIdentifier));
    const identifier = `_SYNTHETIC_ID_TYPE_${this.nextID}`;
    this.nextID += 1;
    this.reverseMap.set(key, identifier);
    const typeDefinition = { identifier, mappings };
    this._synthesized.set(identifier, typeDefinition);
    return typeDefinition;
  }
}
