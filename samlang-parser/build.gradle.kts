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
                implementation(project(":samlang-errors"))
                implementation(project(":samlang-utils"))
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation(kotlin("stdlib-jdk8"))
                implementation(dependencyNotation = "org.antlr:antlr4:4.8")
                implementation(dependencyNotation = "org.apache.commons:commons-text:1.6")
                implementation(project(":samlang-parser-generated-java"))
            }
        }
    }
}
