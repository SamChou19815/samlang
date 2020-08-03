plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin("stdlib-jdk8"))
    implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-analysis"))
    implementation(project(":samlang-optimization"))
}
