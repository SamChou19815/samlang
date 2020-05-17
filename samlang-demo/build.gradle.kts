import org.jetbrains.kotlin.gradle.targets.js.webpack.KotlinWebpackOutput

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
        browser {
            webpackTask {
                output.library = "samlang-demo"
                output.libraryTarget = KotlinWebpackOutput.Target.COMMONJS_MODULE
            }
            @Suppress("EXPERIMENTAL_API_USAGE")
            dceTask {
                keep("samlang-demo.samlang.demo.runDemo", "samlang-samlang-demo.samlang.demo.runDemo")
            }
        }
        nodejs {
            testTask {
                useKarma {
                    useChromeHeadless()
                }
            }
        }
        useCommonJs()
        compilations.all {
            compileKotlinTask.kotlinOptions.sourceMap = false
        }
    }
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(kotlin("stdlib-common"))
                implementation(project(":samlang-ast"))
                implementation(project(":samlang-errors"))
                implementation(project(":samlang-interpreter"))
                implementation(project(":samlang-printer"))
                implementation(project(":samlang-service"))
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
