package com.mvdef.plugin.firebase

import com.google.auth.oauth2.GoogleCredentials
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.database.FirebaseDatabase
import org.bukkit.plugin.java.JavaPlugin
import java.io.File

class FirebaseService(private val plugin: JavaPlugin) {

    lateinit var database: FirebaseDatabase
        private set

    fun initialize(): Boolean {
        return try {
            val keyFile = File(plugin.dataFolder, "firebase-key.json")
            if (!keyFile.exists()) {
                plugin.logger.severe("firebase-key.json не знайдено у папці плагіна!")
                return false
            }

            val options = FirebaseOptions.builder()
                .setCredentials(GoogleCredentials.fromStream(keyFile.inputStream()))
                .setDatabaseUrl(plugin.config.getString("firebase-database-url"))
                .build()

            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseApp.initializeApp(options)
            }

            database = FirebaseDatabase.getInstance()
            plugin.logger.info("Firebase підключено успішно!")
            true
        } catch (e: Exception) {
            plugin.logger.severe("Помилка підключення до Firebase: ${e.message}")
            false
        }
    }
}