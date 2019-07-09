package samlang.errors

class FileError(private val dirName: String) : CompileTimeError() {
    override val errorMessage: String get() = "FileError: $dirName is not a file."
}
