package samlang.errors

import samlang.parser.Position

class CollisionError(collidedName: Position.WithName) : CompileTimeError.WithPosition(
    reason = "Name ${collidedName.name} collides with a previous defined name.",
    position = collidedName.position
)
