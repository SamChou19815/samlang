plugins {
    antlr
    kotlin(module = "jvm")
}

dependencies {
    antlr(dependencyNotation = "org.antlr:antlr4:4.5")
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-utils"))
}

tasks {
    withType<AntlrTask> {
        outputDirectory = file(
            path = "${project.rootDir}/samlang-parser/src/main/java/samlang/parser/generated"
        )
        arguments.addAll(listOf("-package", "samlang.parser.generated", "-no-listener", "-visitor"))
    }
    "compileJava" { dependsOn("generateGrammarSource") }
    "compileKotlin" { dependsOn("generateGrammarSource") }
}
