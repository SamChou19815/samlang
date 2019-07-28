import org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompile

plugins {
    java
    kotlin(module = "jvm") version "1.3.41"
    id("com.github.johnrengelman.shadow") version "5.1.0"
    id("org.jetbrains.dokka") version "0.9.18"
    id("org.jlleitschuh.gradle.ktlint") version "8.2.0" apply false
    id("org.jlleitschuh.gradle.ktlint-idea") version "8.2.0" apply false
    maven
    `maven-publish`
    signing
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
        mavenCentral()
        maven(url = "http://dl.bintray.com/kotlin/kotlinx")
    }
    dependencies {
        implementation(kotlin(module = "stdlib-jdk8"))
        implementation(dependencyNotation = "org.apache.commons:commons-text:1.6")
        implementation(dependencyNotation = "org.jetbrains.kotlinx:kotlinx-collections-immutable:0.1")
        testImplementation(kotlin(module = "reflect"))
        testImplementation(kotlin(module = "test"))
        testImplementation(kotlin(module = "test-junit"))
        testImplementation(dependencyNotation = "io.kotlintest:kotlintest-runner-junit5:3.1.10")
        testImplementation(dependencyNotation = "org.slf4j:slf4j-api:1.7.25")
        testImplementation(dependencyNotation = "org.slf4j:slf4j-simple:1.7.25")
    }
    configure<JavaPluginConvention> {
        sourceCompatibility = JavaVersion.VERSION_11
    }
    tasks {
        withType<KotlinJvmCompile> {
            kotlinOptions.jvmTarget = "11"
            kotlinOptions.freeCompilerArgs = listOf("-Xjvm-default=enable")
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
    implementation(dependencyNotation = "com.github.ajalt:clikt:2.1.0")
}

tasks {
    named<Test>(name = "test") {
        useJUnitPlatform()
        testLogging {
            events("passed", "skipped", "failed")
        }
    }
    javadoc {
        if (JavaVersion.current().isJava9Compatible) {
            (options as StandardJavadocDocletOptions).addBooleanOption("html5", true)
        }
    }
    register<Jar>("sourcesJar") {
        from(sourceSets["main"].allSource)
        archiveClassifier.set("sources")
    }
    register<Jar>("javadocJar") {
        from(javadoc)
        archiveClassifier.set("javadoc")
    }
    shadowJar {
        archiveBaseName.set(Constants.NAME)
        archiveVersion.set(Constants.VERSION)
        manifest { attributes["Main-Class"] = "samlang.Main" }
        isZip64 = true
        artifacts {
            shadow(archiveFile) { builtBy(shadowJar) }
        }
    }
    "assemble" { dependsOn(shadowJar) }
}

publishing {
    publications {
        create<MavenPublication>("mavenJava") {
            from(components["java"])
            artifact(tasks["sourcesJar"])
            artifact(tasks["javadocJar"])
            pom {
                name.set("SAMLANG")
                description.set("Sam's Programming Language")
                url.set("https://github.com/SamChou19815/samlang")
                scm {
                    url.set("https://github.com/SamChou19815/samlang")
                    connection.set("https://github.com/SamChou19815/samlang/tree/master")
                    developerConnection.set("scm:git:ssh://github.com:SamChou19815/samlang.git")
                }
                licenses {
                    license {
                        name.set("AGPL-3.0")
                        url.set("https://opensource.org/licenses/AGPL-3.0")
                    }
                }
                developers {
                    developer {
                        name.set("Developer Sam")
                    }
                }
            }
        }
    }
    repositories {
        maven {
            url = uri("https://oss.sonatype.org/service/local/staging/deploy/maven2/")
            credentials {
                val sonatypeUsername: String? by project
                val sonatypePassword: String? by project
                username = sonatypeUsername
                password = sonatypePassword
            }
        }
    }
}

signing {
    sign(publishing.publications["mavenJava"])
}
