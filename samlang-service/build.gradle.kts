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
}
