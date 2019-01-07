package samlang.ast.raw

import samlang.parser.Position

interface RawNode {

    /**
     * The position of the entire node.
     */
    val position: Position

}
