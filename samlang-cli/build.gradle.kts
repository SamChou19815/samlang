plugins {
    java
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin(module = "stdlib-jdk8"))
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-checker"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-parser"))
    implementation(project(":samlang-analysis"))
    implementation(project(":samlang-optimization"))
    implementation(project(":samlang-compiler"))
    implementation(project(":samlang-service"))
    implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")

    testImplementation(kotlin(module = "reflect"))
    testImplementation(kotlin(module = "test"))
    testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
}

tasks {
    withType<Test> {
        maxParallelForks = 4
        reports.junitXml.isEnabled = false
    }
    named<Test>(name = "test") {
        useJUnitPlatform()
    }
}
