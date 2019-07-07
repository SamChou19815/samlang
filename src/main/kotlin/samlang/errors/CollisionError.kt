package samlang.errors

import samlang.ast.common.Range

class CollisionError(collidedName: Range.WithName) : CompileTimeError.WithPosition(
    reason = "Name ${collidedName.name} collides with a previous defined name.",
    range = collidedName.range
)
