package samlang.demo

@JsName("runDemo")
@ExperimentalStdlibApi
fun jsRunDemo(programString: String): DemoResult = runDemo(programString = programString)
