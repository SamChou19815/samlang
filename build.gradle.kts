import org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompile

plugins {
    java
    kotlin(module = "jvm") version "1.3.72"
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

tasks {
    register<TestReport>("testReport") {
        destinationDir = file("$buildDir/reports/allTests")
        // Include the results from the `test` task in all subprojects
        reportOn(subprojects.map { it.tasks["test"] } + this@tasks["test"])
    }
    register<Copy>("copyFarJar") {
        from(file("samlang-cli/build/libs/samlang-all.jar"))
        into(file("$buildDir/libs"))
    }
    "build" {
        dependsOn("copyFarJar")
        dependsOn("testReport")
    }
}
