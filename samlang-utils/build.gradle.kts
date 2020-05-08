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
                implementation(project(":samlang-errors"))
            }
        }
        commonTest {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-common")
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-annotations-common")
                implementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
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
