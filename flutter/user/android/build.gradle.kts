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

// flutter_ringtone_player jaise plugins ko unki default compileSdk (33) ke bajaye
// 36 par compile karne ke liye force karo, kyunki unki transitive AndroidX deps
// API 34+ compileSdk maangti hain. (Ye block evaluationDependsOn se pehle hona chahiye)
subprojects {
    afterEvaluate {
        val androidExt = extensions.findByName("android")
        if (androidExt != null) {
            try {
                val method = androidExt.javaClass.methods.find {
                    it.name == "setCompileSdkVersion" &&
                    it.parameterTypes.size == 1 &&
                    (it.parameterTypes[0] == Int::class.java ||
                     it.parameterTypes[0] == Integer::class.java)
                }
                method?.invoke(androidExt, 36)
            } catch (_: Throwable) {
                // Non-Android subprojects — ignore.
            }
        }
    }
}

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
