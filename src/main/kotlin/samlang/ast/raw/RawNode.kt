package samlang.ast.raw

import samlang.ast.common.Range

interface RawNode {

    /**
     * The range of the entire node.
     */
    val range: Range

}
