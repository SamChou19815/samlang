plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin("stdlib-jdk8"))
    implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-errors"))

    testImplementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-common")
    testImplementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-annotations-common")
    testImplementation(project(":samlang-parser"))
    testImplementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-junit")
    testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
}
