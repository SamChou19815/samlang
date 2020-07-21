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
                implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
                implementation(project(":samlang-ast"))
                implementation(project(":samlang-errors"))
                implementation(project(":samlang-utils"))
            }
        }
        val commonTest by getting {
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-common")
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-annotations-common")
                implementation(project(":samlang-parser"))
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation(kotlin("stdlib-jdk8"))
            }
        }
        val jvmTest by getting {
            dependsOn(jvmMain)
            dependencies {
                implementation(dependencyNotation = "org.jetbrains.kotlin:kotlin-test-junit")
                implementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
            }
        }
    }
}
