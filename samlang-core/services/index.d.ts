import type { ModuleReference } from "../ast/types";
import type { LanguageServices } from "../services/types";

export default function createSamlangLanguageService(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
): LanguageServices;
