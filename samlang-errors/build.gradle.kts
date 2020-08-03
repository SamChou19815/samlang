plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(kotlin("stdlib-jdk8"))
    implementation(project(":samlang-ast"))
}
