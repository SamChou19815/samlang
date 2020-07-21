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
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation(kotlin("stdlib-jdk8"))
            }
        }
    }
}
