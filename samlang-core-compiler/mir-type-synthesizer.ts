import type { MidIRTypeDefinition } from 'samlang-core-ast/mir-nodes';
import { MidIRType, prettyPrintMidIRType } from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

/** A helper class to generate an identifier type for each struct type. */
export default class MidIRTypeSynthesizer {
  private readonly _synthesized = new Map<string, MidIRTypeDefinition>();
  private readonly reverseMap = new Map<string, string>();
  private nextID = 0;

  public get mappings(): ReadonlyMap<string, MidIRTypeDefinition> {
    return this._synthesized;
  }

  public get synthesized(): readonly MidIRTypeDefinition[] {
    return Array.from(this._synthesized.values());
  }

  public synthesize(mappings: readonly MidIRType[]): MidIRTypeDefinition {
    const key = mappings.map(prettyPrintMidIRType).join(',');
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
