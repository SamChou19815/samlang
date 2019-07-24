package samlang.util

sealed class Either<out A, out B> {
    data class Left<A>(val v: A) : Either<A, Nothing>()
    data class Right<B>(val v: B) : Either<Nothing, B>()
}
