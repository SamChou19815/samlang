plugins {
    kotlin(module = "multiplatform")
}

kotlin {
    jvm {
        tasks.named<Test>("jvmTest") {
            useJUnitPlatform()
        }
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
                implementation(project(":samlang-analysis"))
                implementation(project(":samlang-optimization"))
                implementation(project(":samlang-compiler-asm"))
                implementation(project(":samlang-compiler-ir"))
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
    }
}
