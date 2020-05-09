import org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompile

plugins {
    java
    kotlin(module = "jvm") version "1.3.72"
    id("com.github.johnrengelman.shadow") version "5.2.0"
    id("org.jlleitschuh.gradle.ktlint") version "9.2.1" apply false
    id("org.jlleitschuh.gradle.ktlint-idea") version "9.2.1" apply false
}

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
    configure<JavaPluginConvention> {
        sourceCompatibility = JavaVersion.VERSION_11
    }
    tasks {
        withType<KotlinJvmCompile> {
            kotlinOptions.jvmTarget = "11"
            kotlinOptions.freeCompilerArgs = listOf("-Xjvm-default=enable", "-Xopt-in=kotlin.ExperimentalStdlibApi")
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

dependencies {
    implementation(kotlin(module = "stdlib-jdk8"))
    implementation(project(":samlang-ast"))
    implementation(project(":samlang-checker"))
    implementation(project(":samlang-errors"))
    implementation(project(":samlang-utils"))
    implementation(project(":samlang-parser"))
    implementation(project(":samlang-interpreter"))
    implementation(project(":samlang-analysis"))
    implementation(project(":samlang-optimization"))
    implementation(project(":samlang-compiler"))
    implementation(project(":samlang-printer"))
    implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3")
    implementation(dependencyNotation = "com.google.code.gson:gson:2.8.6")
    implementation(dependencyNotation = "com.sparkjava:spark-core:2.9.1")
    implementation(dependencyNotation = "com.github.ajalt:clikt:2.1.0")
    implementation(dependencyNotation = "org.eclipse.lsp4j:org.eclipse.lsp4j:0.8.1")

    testImplementation(kotlin(module = "reflect"))
    testImplementation(kotlin(module = "test"))
    testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.4.2")
}

tasks {
    shadowJar {
        minimize()
        archiveBaseName.set("samlang")
        manifest { attributes["Main-Class"] = "samlang.Main" }
        isZip64 = true
        artifacts { shadow(archiveFile) { builtBy(shadowJar) } }
    }
    register<TestReport>("testReport") {
        destinationDir = file("$buildDir/reports/allTests")
        // Include the results from the `test` task in all subprojects
        reportOn(subprojects.map { it.tasks["test"] } + this@tasks["test"])
    }
    "assemble" { dependsOn(shadowJar) }
    "build" { dependsOn("testReport") }
}
