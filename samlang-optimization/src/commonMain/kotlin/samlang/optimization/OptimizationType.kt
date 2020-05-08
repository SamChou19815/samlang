package samlang.optimization

/**
 * A collection of supported optimization types.
 *
 * @param isSupported whether the optimization is supported.
 * @param simpleName simple name of the optimization.
 * @param fullName full name of the optimization.
 */
enum class OptimizationType(
    val isSupported: Boolean,
    val simpleName: String,
    val fullName: String
) {
    CF(isSupported = true, simpleName = "cf", fullName = "constant folding"),
    REG(isSupported = true, simpleName = "reg", fullName = "register allocation"),
    MC(isSupported = true, simpleName = "mc", fullName = "move coalescing"),
    CSE(isSupported = true, simpleName = "cse", fullName = "common subexpression elimination"),
    ALG(isSupported = true, simpleName = "alg", fullName = "algebraic optimizations"),
    COPY(isSupported = true, simpleName = "copy", fullName = "copy propagation"),
    DCE(isSupported = true, simpleName = "dce", fullName = "dead code elimination"),
    INL(isSupported = true, simpleName = "inl", fullName = "inlining"),
    SR(isSupported = false, simpleName = "sr", fullName = "strength reduction"),
    LU(isSupported = false, simpleName = "lu", fullName = "loop unrolling"),
    LICM(isSupported = false, simpleName = "licm", fullName = "loop-invariant code motion"),
    PRE(isSupported = false, simpleName = "pre", fullName = "partial redundancy elimination"),
    CP(isSupported = true, simpleName = "cp", fullName = "constant propagation"),
    VN(isSupported = true, simpleName = "vn", fullName = "local value numbering");
}
