plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-utils"))
}
