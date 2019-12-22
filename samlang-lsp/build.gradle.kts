plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-checker"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-utils"))
    implementation(project(":samlang-parser"))
    implementation(project(":samlang-interpreter"))
    implementation(project(":samlang-compiler"))
}
