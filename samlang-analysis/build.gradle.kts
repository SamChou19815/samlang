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
                implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
                implementation(project(":samlang-ast"))
            }
        }
        commonTest {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-common")
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-annotations-common")
                implementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-stdlib")
            }
        }
        val jvmTest by getting {}
        val jsMain by getting {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-stdlib-js")
            }
        }
        val jsTest by getting {}
    }
}
