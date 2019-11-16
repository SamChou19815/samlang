import org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompile

plugins {
    java
    kotlin(module = "jvm") version "1.3.60"
    id("com.github.johnrengelman.shadow") version "5.1.0"
    id("org.jlleitschuh.gradle.ktlint") version "9.0.0" apply false
    id("org.jlleitschuh.gradle.ktlint-idea") version "9.0.0" apply false
}

object Constants {
    const val NAME: String = "samlang"
    const val VERSION: String = "0.0.8"
}

group = Constants.NAME
version = Constants.VERSION

allprojects {
    apply<JavaPlugin>()
    plugins.withId("org.jetbrains.kotlin.jvm") {
        val compileKotlin: KotlinJvmCompile by tasks
        compileKotlin.kotlinOptions {
            jvmTarget = "11"
        }
        val compileTestKotlin: KotlinJvmCompile by tasks
        compileTestKotlin.kotlinOptions {
            jvmTarget = "11"
        }
    }
    // Apply linters to all projects
    apply(plugin = "org.jlleitschuh.gradle.ktlint")
    apply(plugin = "org.jlleitschuh.gradle.ktlint-idea")

    repositories {
        jcenter()
    }
    dependencies {
        implementation(kotlin(module = "stdlib-jdk8"))
        implementation(dependencyNotation = "org.apache.commons:commons-text:1.6")
        implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
        testImplementation(kotlin(module = "reflect"))
        testImplementation(kotlin(module = "test"))
        testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.1.10")
    }
    configure<JavaPluginConvention> {
        sourceCompatibility = JavaVersion.VERSION_11
    }
    tasks {
        withType<KotlinJvmCompile> {
            kotlinOptions.jvmTarget = "11"
            kotlinOptions.freeCompilerArgs = listOf("-Xjvm-default=enable")
        }
        withType<Test> {
            maxParallelForks = 4
            reports.junitXml.isEnabled = false
        }
        named<Test>(name = "test") {
            useJUnitPlatform()
            testLogging { events("skipped", "failed") }
        }
    }
}

subprojects {
    version = Constants.VERSION
}

dependencies {
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-checker"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-utils"))
    implementation(project(":samlang-parser"))
    implementation(project(":samlang-interpreter"))
    implementation(project(":samlang-compiler"))
    implementation(project(":samlang-printer"))
    implementation(dependencyNotation = "com.google.code.gson:gson:2.8.6")
    implementation(dependencyNotation = "com.sparkjava:spark-core:2.9.1")
    implementation(dependencyNotation = "com.github.ajalt:clikt:2.1.0")
}

tasks {
    shadowJar {
        minimize()
        archiveBaseName.set(Constants.NAME)
        archiveVersion.set(Constants.VERSION)
        manifest { attributes["Main-Class"] = "samlang.Main" }
        isZip64 = true
        artifacts { shadow(archiveFile) { builtBy(shadowJar) } }
    }
}
