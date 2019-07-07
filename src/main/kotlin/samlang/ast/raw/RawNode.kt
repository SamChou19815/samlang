package samlang.ast.raw

import samlang.ast.common.Position

interface RawNode {

    /**
     * The position of the entire node.
     */
    val position: Position

}
