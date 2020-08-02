package samlang.ast.asm

import samlang.ast.asm.AssemblyInstruction.AlBinaryOpMemDest
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpRegDest
import samlang.ast.asm.AssemblyInstruction.AlUnaryOp
import samlang.ast.asm.AssemblyInstruction.CallAddress
import samlang.ast.asm.AssemblyInstruction.CmpConstOrReg
import samlang.ast.asm.AssemblyInstruction.CmpMem
import samlang.ast.asm.AssemblyInstruction.Comment
import samlang.ast.asm.AssemblyInstruction.Cqo
import samlang.ast.asm.AssemblyInstruction.IDiv
import samlang.ast.asm.AssemblyInstruction.IMulThreeArgs
import samlang.ast.asm.AssemblyInstruction.IMulTwoArgs
import samlang.ast.asm.AssemblyInstruction.JumpLabel
import samlang.ast.asm.AssemblyInstruction.Label
import samlang.ast.asm.AssemblyInstruction.LoadEffectiveAddress
import samlang.ast.asm.AssemblyInstruction.MoveFromLong
import samlang.ast.asm.AssemblyInstruction.MoveToMem
import samlang.ast.asm.AssemblyInstruction.MoveToReg
import samlang.ast.asm.AssemblyInstruction.Pop
import samlang.ast.asm.AssemblyInstruction.Push
import samlang.ast.asm.AssemblyInstruction.Return
import samlang.ast.asm.AssemblyInstruction.SetOnFlag
import samlang.ast.asm.AssemblyInstruction.ShiftLeft

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
    fun visit(node: AlUnaryOp)
    fun visit(node: ShiftLeft)
    fun visit(node: Push)
    fun visit(node: Pop)
    fun visit(node: Label)
    fun visit(node: Comment)
}
