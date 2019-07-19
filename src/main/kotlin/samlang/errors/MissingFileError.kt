package samlang.errors

class MissingFileError(filename: String) :
    CompileTimeError(errorLocation = filename, errorInformation = "`$filename` is not a file.")
