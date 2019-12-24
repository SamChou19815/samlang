package samlang.service

import java.lang.module.ModuleReference
import samlang.ast.lang.Expression
import samlang.ast.lang.Module

class LocationLookupBuilder(val locationLookup: LocationLookup<Expression>) {
    fun rebuild(moduleReference: ModuleReference, module: Module) {
        // TODO
    }
}
