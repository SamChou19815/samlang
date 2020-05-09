plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin(module = "stdlib-jdk8"))
    implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-analysis"))
    implementation(project(":samlang-optimization"))

    testImplementation(kotlin(module = "reflect"))
    testImplementation(kotlin(module = "test"))
    testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
}
