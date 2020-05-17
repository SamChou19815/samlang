package samlang.compiler.mir

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.mir.MidIrExpression

class MidIrTransformUtilTest {
    @Test
    fun invertConditionTest1() {
        assertEquals(
            expected = MidIrExpression.ZERO,
            actual = MidIrTransformUtil.invertCondition(expression = MidIrExpression.ONE)
        )
    }

    @Test
    fun invertConditionTest2() {
        assertEquals(
            expected = MidIrExpression.ONE,
            actual = MidIrTransformUtil.invertCondition(expression = MidIrExpression.ZERO)
        )
    }

    @Test
    fun invertConditionTest3() {
        assertEquals(
            expected = MidIrExpression.GE(
                e1 = MidIrExpression.ONE,
                e2 = MidIrExpression.MINUS_ONE
            ),
            actual = MidIrTransformUtil.invertCondition(
                expression = MidIrExpression.LT(
                    e1 = MidIrExpression.ONE,
                    e2 = MidIrExpression.MINUS_ONE
                )
            )
        )
    }
}
