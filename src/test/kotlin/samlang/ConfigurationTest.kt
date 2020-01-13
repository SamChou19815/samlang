package samlang

import io.kotlintest.shouldBe
import io.kotlintest.shouldThrow
import io.kotlintest.specs.StringSpec
import samlang.Configuration.IllFormattedConfigurationException

class ConfigurationTest : StringSpec() {
    init {
        "empty configuration can parse." {
            Configuration.parse(string = "{}") shouldBe Configuration(
                sourceDirectory = ".",
                outputDirectory = "out",
                excludes = emptyList()
            )
        }
        "partial configuration can parse." {
            val json = """{ "sourceDirectory": "source" }"""
            Configuration.parse(string = json) shouldBe Configuration(
                sourceDirectory = "source",
                outputDirectory = "out",
                excludes = emptyList()
            )
        }
        "full configuration can parse." {
            val json = """
            {
                "sourceDirectory": "source",
                "outputDirectory": "output",
                "excludes": ["foo", "bar"]
            }
            """.trimIndent()
            Configuration.parse(string = json) shouldBe Configuration(
                sourceDirectory = "source",
                outputDirectory = "output",
                excludes = listOf("foo", "bar")
            )
        }
        "empty string does not parse." {
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = "")
            }
        }
        "bad json does not parse." {
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = "{")
            }
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = "}")
            }
        }
        "bad format does not parse." {
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = """{ "sourceDirectory": 3 }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = """{ "outputDirectory": 3 }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = """{ "excludes": 3 }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = """{ "excludes": [3] }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                Configuration.parse(string = """{ "excludes": ["3", 4] }""")
            }
        }
        "can parse project configuration file." {
            Configuration.parse()
        }
    }
}
