package samlang.errors

class FileError(dirName: String) : CompileTimeError(errorInformation = "$dirName is not a file.") {
    override val errorMessage: String = "FileError: $errorInformation"
}
