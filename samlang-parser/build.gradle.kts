plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(dependencyNotation = "org.antlr:antlr4:4.8")
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-utils"))
    implementation(project(":samlang-parser-generated"))
}
