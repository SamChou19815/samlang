plugins {
    kotlin(module = "multiplatform")
}

kotlin {
    jvm()
    js()
    sourceSets {
        commonMain {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-stdlib-common")
                implementation(project(":samlang-ast"))
                implementation(project(":samlang-utils"))
            }
        }
        jvm().compilations["main"].defaultSourceSet {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-stdlib")
            }
        }
        jvm().compilations["test"].defaultSourceSet {
            dependencies {}
        }
        js().compilations["main"].defaultSourceSet {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-stdlib-js")
            }
        }
        js().compilations["test"].defaultSourceSet {
            dependencies {}
        }
    }
}
