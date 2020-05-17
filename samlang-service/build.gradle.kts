plugins {
    kotlin(module = "multiplatform")
}

kotlin {
    jvm {
        tasks.named<Test>("jvmTest") {
            useJUnitPlatform()
        }
    }
    js {
        nodejs {
            testTask {
                useMocha {
                    timeout = "30000"
                }
            }
        }
        useCommonJs()
    }
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(kotlin("stdlib-common"))
                implementation(project(":samlang-ast"))
                implementation(project(":samlang-utils"))
                implementation(project(":samlang-checker"))
                implementation(project(":samlang-errors"))
                implementation(project(":samlang-parser"))
                implementation(project(":samlang-interpreter"))
                implementation(project(":samlang-analysis"))
                implementation(project(":samlang-optimization"))
                implementation(project(":samlang-compiler-hir"))
                implementation(project(":samlang-compiler-mir"))
                implementation(project(":samlang-compiler-asm"))
                implementation(project(":samlang-printer"))
            }
        }
        val commonTest by getting {
            dependsOn(commonMain)
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-common")
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-annotations-common")
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation(kotlin("stdlib-jdk8"))
            }
        }
        val jvmTest by getting {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-junit")
                implementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
            }
        }
        val jsMain by getting {
            dependencies {
                implementation(kotlin("stdlib-js"))
            }
        }
        val jsTest by getting {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-js")
            }
        }
    }
}
