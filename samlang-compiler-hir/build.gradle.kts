plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin(module = "stdlib-jdk8"))
    implementation(project(":samlang-ast"))

    testImplementation(kotlin(module = "reflect"))
    testImplementation(kotlin(module = "test"))
    testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
}
