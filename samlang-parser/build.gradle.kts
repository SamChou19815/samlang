plugins {
    kotlin(module = "multiplatform")
}

// Bug in Kotlin. See https://youtrack.jetbrains.com/issue/KT-34389
plugins.apply(type = org.jetbrains.kotlin.gradle.targets.js.npm.NpmResolverPlugin::class)

kotlin {
    jvm {
        tasks.named<Test>("jvmTest") {
            useJUnitPlatform()
        }
    }
    js { useCommonJs() }
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
        val jsMain by getting {
            dependencies {
                implementation(kotlin("stdlib-js"))
                implementation(npm("@dev-sam/samlang-parser-generated-ts", "0.0.5"))
            }
        }
    }
}

ktlint {
    disabledRules.set(
        setOf(
            "no-wildcard-imports", "import-ordering", "no-unused-imports", "modifier-order", "final-newline"
        )
    )
    filter {
        exclude("**/build/**")
        exclude("**/lib.es*")
        exclude("**/*.module_@dev-sam_*")
    }
}
