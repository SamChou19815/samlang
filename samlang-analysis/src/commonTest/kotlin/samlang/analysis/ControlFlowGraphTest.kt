package samlang.analysis

import kotlin.test.Test
import kotlin.test.assertEquals

@ExperimentalStdlibApi
class ControlFlowGraphTest {
    @Test
    fun emptyGraphTest() {
        val graph = ControlFlowGraph.fromIr(functionStatements = emptyList())
        assertEquals(expected = 0, actual = graph.nodes.size)
    }
}
