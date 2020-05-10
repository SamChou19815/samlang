plugins {
    java
    kotlin(module = "jvm")
    id("com.github.johnrengelman.shadow") version "5.2.0"
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
    implementation(project(":samlang-compiler-hir"))
    implementation(project(":samlang-compiler-mir"))
    implementation(project(":samlang-compiler-asm"))
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
        destinationDirectory.set(file("../build/libs"))
        manifest { attributes["Main-Class"] = "samlang.Main" }
        isZip64 = true
        artifacts { shadow(archiveFile) { builtBy(shadowJar) } }
    }
    "assemble" { dependsOn(shadowJar) }

    withType<Test> {
        maxParallelForks = 4
        reports.junitXml.isEnabled = false
    }
    named<Test>(name = "test") {
        useJUnitPlatform()
    }
}
