plugins {
    kotlin(module = "js")
}

// Bug in Kotlin. See https://youtrack.jetbrains.com/issue/KT-34389
plugins.apply(type = org.jetbrains.kotlin.gradle.targets.js.npm.NpmResolverPlugin::class)

kotlin {
    target {
        useCommonJs()
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
    }
}

dependencies {
    implementation(kotlin("stdlib-js"))
    // TODO: has dukat integration issues
    // implementation(npm("@dev-sam/samlang-parser-generated-ts", "0.0.2"))
}
