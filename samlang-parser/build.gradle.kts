plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin("stdlib-jdk8"))
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-parser-generated-java"))
    implementation(dependencyNotation = "org.antlr:antlr4:4.8")
    implementation(dependencyNotation = "org.apache.commons:commons-text:1.6")
}
