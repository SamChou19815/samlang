package samlang.ast.asm

import samlang.ast.asm.AssemblyInstruction.*

interface AssemblyInstructionVisitor {
    fun visit(node: MoveFromLong)
    fun visit(node: MoveToMem)
    fun visit(node: MoveToReg)
    fun visit(node: LoadEffectiveAddress)
    fun visit(node: CmpConstOrReg)
    fun visit(node: CmpMem)
    fun visit(node: SetOnFlag)
    fun visit(node: JumpLabel)
    fun visit(node: CallAddress)
    fun visit(node: Return)
    fun visit(node: AlBinaryOpMemDest)
    fun visit(node: AlBinaryOpRegDest)
    fun visit(node: IMulTwoArgs)
    fun visit(node: IMulThreeArgs)
    fun visit(node: Cqo)
    fun visit(node: IDiv)
    fun visit(node: Neg)
    fun visit(node: ShiftLeft)
    fun visit(node: Push)
    fun visit(node: PopRBP)
    fun visit(node: Label)
    fun visit(node: Comment)
}
