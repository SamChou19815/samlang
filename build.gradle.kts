import org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompile

plugins {
    java
    antlr
    kotlin(module = "jvm") version "1.3.41"
    id("org.jetbrains.dokka") version "0.9.18"
    id("org.jlleitschuh.gradle.ktlint") version "8.2.0"
    id("org.jlleitschuh.gradle.ktlint-idea") version "8.2.0"
    maven
    `maven-publish`
    signing
}

group = "com.developersam"
version = "0.0.7"

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

tasks {
    withType<AntlrTask> {
        outputDirectory = file(path = "${project.rootDir}/src/main/java/samlang/parser/generated")
        arguments.addAll(listOf("-package", "samlang.parser.generated", "-no-listener", "-visitor"))
    }
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
    withType<KotlinJvmCompile> {
        kotlinOptions.jvmTarget = "1.8"
        kotlinOptions.freeCompilerArgs = listOf("-Xjvm-default=enable")
    }
    "compileJava" { dependsOn("generateGrammarSource") }
    "compileKotlin" { dependsOn("generateGrammarSource") }
}

configure<JavaPluginConvention> {
    sourceCompatibility = JavaVersion.VERSION_1_8
}

val compileKotlin: KotlinJvmCompile by tasks
compileKotlin.kotlinOptions {
    jvmTarget = "1.8"
}
val compileTestKotlin: KotlinJvmCompile by tasks
compileTestKotlin.kotlinOptions {
    jvmTarget = "1.8"
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
