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
        nodejs()
        useCommonJs()
    }
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(kotlin("stdlib-common"))
                implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
                implementation(project(":samlang-ast"))
                implementation(project(":samlang-analysis"))
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation(kotlin("stdlib-jdk8"))
            }
        }
        val jsMain by getting {
            dependencies {
                implementation(kotlin("stdlib-js"))
            }
        }
    }
}
