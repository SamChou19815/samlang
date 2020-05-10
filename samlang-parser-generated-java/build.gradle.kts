plugins {
    java
    antlr
}

dependencies {
    antlr(dependencyNotation = "org.antlr:antlr4:4.8")
}

tasks {
    withType<AntlrTask> {
        outputDirectory = file(
            path = "${project.rootDir}/samlang-parser-generated-java/src/main/java/samlang/parser/generated"
        )
        arguments.addAll(listOf("-package", "samlang.parser.generated", "-no-listener", "-visitor"))
    }
    "compileJava" { dependsOn("generateGrammarSource") }

    withType<Test> {
        maxParallelForks = 4
        reports.junitXml.isEnabled = false
    }
    named<Test>(name = "test") {
        useJUnitPlatform()
    }
}
