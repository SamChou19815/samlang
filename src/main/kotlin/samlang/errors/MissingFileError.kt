package samlang.errors

class MissingFileError(dirName: String) : CompileTimeError(errorInformation = "`$dirName` is not a file.")
