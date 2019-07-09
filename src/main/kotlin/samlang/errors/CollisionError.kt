package samlang.errors

import samlang.ast.Range

class CollisionError(collidedName: String, range: Range) : CompileTimeError.WithPosition(
    reason = "Name $collidedName collides with a previous defined name.",
    range = range
)
