plugins {
    kotlin("jvm") version "2.1.0"
    id("com.gradleup.shadow") version "9.0.0"
}

group = "com.mvdef"
version = "1.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.19.4-R0.1-SNAPSHOT")
    implementation(kotlin("stdlib"))
    implementation("com.google.firebase:firebase-admin:9.3.0")
}

kotlin {
    jvmToolchain(17)
}

tasks {
    build {
        dependsOn(shadowJar)
    }

    shadowJar {
        archiveFileName.set("MVDeF-Plugin.jar")
    }
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(17))
}
tasks {
    jar {
        enabled = false
    }

    build {
        dependsOn(shadowJar)
    }

    shadowJar {
        archiveFileName.set("MVDeF-Plugin.jar")
    }
}