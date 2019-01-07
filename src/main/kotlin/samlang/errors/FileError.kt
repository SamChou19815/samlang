package samlang.errors

class FileError(dirName: String) : CompileTimeError(errorMessage = "$dirName is not a file.")
