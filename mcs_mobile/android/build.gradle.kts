import com.android.build.api.dsl.ApplicationExtension
import com.android.build.gradle.LibraryExtension
import java.io.File

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

subprojects {
    project.evaluationDependsOn(":app")
}

subprojects {
    pluginManager.withPlugin("com.android.application") {
        val androidExtension = extensions.findByType(ApplicationExtension::class.java)
        if (androidExtension != null && (androidExtension.compileSdk ?: 0) < 36) {
            androidExtension.compileSdk = 36
        }
    }

    pluginManager.withPlugin("com.android.library") {
        val androidExtension = extensions.findByType(LibraryExtension::class.java)
        if (androidExtension != null) {
            if ((androidExtension.compileSdk ?: 0) < 36) {
                androidExtension.compileSdk = 36
            }

            if (androidExtension.namespace.isNullOrBlank()) {
                val manifestFile = File(projectDir, "src/main/AndroidManifest.xml")
                if (manifestFile.exists()) {
                    val manifestText = manifestFile.readText()
                    val packageName = Regex("""package\s*=\s*"([^"]+)"""")
                        .find(manifestText)
                        ?.groupValues
                        ?.getOrNull(1)
                        ?.trim()

                    if (!packageName.isNullOrBlank()) {
                        androidExtension.namespace = packageName
                    }
                }
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
