plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin("stdlib-jdk8"))
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-checker"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-parser"))
    implementation(project(":samlang-analysis"))
    implementation(project(":samlang-optimization"))
    implementation(project(":samlang-compiler"))

    testImplementation("org.jetbrains.kotlin:kotlin-test-common")
    testImplementation("org.jetbrains.kotlin:kotlin-test-annotations-common")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit")
    testImplementation("io.kotlintest:kotlintest-runner-junit5:3.4.2")
}
