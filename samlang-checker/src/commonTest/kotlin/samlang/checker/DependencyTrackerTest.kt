package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference

class DependencyTrackerTest : StringSpec() {
    init {
        "can track and update dependencies" {
            val tracker = DependencyTracker()
            val moduleA = ModuleReference(moduleName = "A")
            val moduleB = ModuleReference(moduleName = "B")
            val moduleC = ModuleReference(moduleName = "C")
            val moduleD = ModuleReference(moduleName = "D")
            val moduleE = ModuleReference(moduleName = "E")
            // Wave 1
            tracker.update(moduleReference = moduleA, importedModules = listOf(moduleB, moduleC))
            tracker.update(moduleReference = moduleD, importedModules = listOf(moduleB, moduleC))
            tracker.update(moduleReference = moduleE, importedModules = listOf(moduleB, moduleC))
            tracker.getForwardDependencies(moduleReference = moduleA) shouldBe setOf(moduleB, moduleC)
            tracker.getForwardDependencies(moduleReference = moduleB) shouldBe emptySet()
            tracker.getForwardDependencies(moduleReference = moduleC) shouldBe emptySet()
            tracker.getForwardDependencies(moduleReference = moduleD) shouldBe setOf(moduleB, moduleC)
            tracker.getForwardDependencies(moduleReference = moduleE) shouldBe setOf(moduleB, moduleC)
            tracker.getReverseDependencies(moduleReference = moduleA) shouldBe emptySet()
            tracker.getReverseDependencies(moduleReference = moduleB) shouldBe setOf(moduleA, moduleD, moduleE)
            tracker.getReverseDependencies(moduleReference = moduleC) shouldBe setOf(moduleA, moduleD, moduleE)
            tracker.getReverseDependencies(moduleReference = moduleD) shouldBe emptySet()
            tracker.getReverseDependencies(moduleReference = moduleE) shouldBe emptySet()
            // Wave 2
            tracker.update(moduleReference = moduleA, importedModules = listOf(moduleD, moduleE))
            tracker.getForwardDependencies(moduleReference = moduleA) shouldBe setOf(moduleD, moduleE)
            tracker.getForwardDependencies(moduleReference = moduleB) shouldBe emptySet()
            tracker.getForwardDependencies(moduleReference = moduleC) shouldBe emptySet()
            tracker.getForwardDependencies(moduleReference = moduleD) shouldBe setOf(moduleB, moduleC)
            tracker.getForwardDependencies(moduleReference = moduleE) shouldBe setOf(moduleB, moduleC)
            tracker.getReverseDependencies(moduleReference = moduleA) shouldBe emptySet()
            tracker.getReverseDependencies(moduleReference = moduleB) shouldBe setOf(moduleD, moduleE)
            tracker.getReverseDependencies(moduleReference = moduleC) shouldBe setOf(moduleD, moduleE)
            tracker.getReverseDependencies(moduleReference = moduleD) shouldBe setOf(moduleA)
            tracker.getReverseDependencies(moduleReference = moduleE) shouldBe setOf(moduleA)
            // Wave 3
            tracker.update(moduleReference = moduleA, importedModules = null)
            tracker.getForwardDependencies(moduleReference = moduleA) shouldBe emptySet()
            tracker.getForwardDependencies(moduleReference = moduleB) shouldBe emptySet()
            tracker.getForwardDependencies(moduleReference = moduleC) shouldBe emptySet()
            tracker.getForwardDependencies(moduleReference = moduleD) shouldBe setOf(moduleB, moduleC)
            tracker.getForwardDependencies(moduleReference = moduleE) shouldBe setOf(moduleB, moduleC)
            tracker.getReverseDependencies(moduleReference = moduleA) shouldBe emptySet()
            tracker.getReverseDependencies(moduleReference = moduleB) shouldBe setOf(moduleD, moduleE)
            tracker.getReverseDependencies(moduleReference = moduleC) shouldBe setOf(moduleD, moduleE)
            tracker.getReverseDependencies(moduleReference = moduleD) shouldBe setOf()
            tracker.getReverseDependencies(moduleReference = moduleE) shouldBe setOf()
        }
    }
}
