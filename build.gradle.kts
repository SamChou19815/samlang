import org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompile

plugins {
    java
    antlr
    kotlin(module = "jvm") version "1.3.21"
    id("org.jetbrains.dokka") version "0.9.17"
}

group = "samlang"
version = "0.0.3"

repositories {
    jcenter()
    mavenCentral()
    maven(url = "http://dl.bintray.com/kotlin/kotlinx")
}

dependencies {
    compile(kotlin(module = "stdlib-jdk8"))
    antlr(dependencyNotation = "org.antlr:antlr4:4.5")
    implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.1")
    implementation(dependencyNotation = "org.apache.commons:commons-text:1.6")
    testImplementation(kotlin(module = "reflect"))
    testImplementation(kotlin(module = "test"))
    testImplementation(kotlin(module = "test-junit"))
    testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.1.10")
    testImplementation(dependencyNotation = "org.slf4j:slf4j-api:1.7.25")
    testImplementation(dependencyNotation = "org.slf4j:slf4j-simple:1.7.25")
}

tasks.named<Test>(name = "test") {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed", "standardOut", "standardError")
        setExceptionFormat("full")
    }
}

tasks.withType<AntlrTask> {
    outputDirectory = file(path = "${project.rootDir}/src/main/java/samlang/parser/generated")
    arguments.addAll(listOf("-package", "samlang.parser.generated", "-no-listener", "-visitor"))
}

tasks {
    "compileJava" { dependsOn("generateGrammarSource") }
    "compileKotlin" { dependsOn("generateGrammarSource") }
}

configure<JavaPluginConvention> {
    sourceCompatibility = JavaVersion.VERSION_1_8
}
tasks.withType<KotlinJvmCompile> {
    kotlinOptions.jvmTarget = "1.8"
    kotlinOptions.freeCompilerArgs = listOf("-Xjvm-default=enable")
}
val compileKotlin: KotlinJvmCompile by tasks
compileKotlin.kotlinOptions {
    jvmTarget = "1.8"
}
val compileTestKotlin: KotlinJvmCompile by tasks
compileTestKotlin.kotlinOptions {
    jvmTarget = "1.8"
}
