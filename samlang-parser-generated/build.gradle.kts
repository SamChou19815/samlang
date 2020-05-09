plugins {
    antlr
    kotlin(module = "jvm")
}

dependencies {
    antlr(dependencyNotation = "org.antlr:antlr4:4.8")
}

tasks {
    withType<AntlrTask> {
        outputDirectory = file(
            path = "${project.rootDir}/samlang-parser-generated/src/main/java/samlang/parser/generated"
        )
        arguments.addAll(listOf("-package", "samlang.parser.generated", "-no-listener", "-visitor"))
    }
    "compileJava" { dependsOn("generateGrammarSource") }
}
