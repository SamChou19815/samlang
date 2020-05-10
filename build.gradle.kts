plugins {
    kotlin(module = "multiplatform") version "1.3.72"
    id("org.jlleitschuh.gradle.ktlint") version "9.2.1" apply false
    id("org.jlleitschuh.gradle.ktlint-idea") version "9.2.1" apply false
}

allprojects {
    // Apply linters to all projects
    apply(plugin = "org.jlleitschuh.gradle.ktlint")
    apply(plugin = "org.jlleitschuh.gradle.ktlint-idea")

    repositories {
        jcenter()
    }
}
