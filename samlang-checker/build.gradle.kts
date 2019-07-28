plugins {
    kotlin(module = "jvm")
}

dependencies {
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-utils"))
    testImplementation(project(":samlang-parser"))
}
