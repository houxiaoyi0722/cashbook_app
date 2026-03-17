package com.cashbook_app

import android.content.Context
import com.facebook.react.bridge.*

/**
 * 原生模块用于处理分享intent
 */
class ShareIntentModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ShareIntentModule"

    /**
     * 获取分享intent数据
     */
    @ReactMethod
    fun getShareIntent(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("share_intent", Context.MODE_PRIVATE)
            
            val shareType = prefs.getString("share_type", null)
            if (shareType == null) {
                promise.resolve(Arguments.createMap())
                return
            }

            val timestamp = prefs.getLong("share_timestamp", 0)

            val result = Arguments.createMap().apply {
                putString("type", shareType)
                putDouble("timestamp", timestamp.toDouble())
                
                val text = prefs.getString("share_text", null)
                text?.let { putString("text", it) }
                
                val imageUri = prefs.getString("share_image_uri", null)
                imageUri?.let { putString("imageUri", it) }
                
                val imageUris = prefs.getString("share_image_uris", null)
                imageUris?.let { urisString -> 
                    val urisList = urisString.split(",").filter { it.isNotEmpty() }
                    val array = Arguments.createArray()
                    urisList.forEach { uri ->
                        array.pushString(uri)
                    }
                    putArray("imageUris", array)
                }
            }

            // 立即清理数据，避免重复处理
            // 但为了确保能读取到，先不清理，让上层处理完后再清理
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * 清理分享intent数据
     */
    @ReactMethod
    fun clearShareIntent(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("share_intent", Context.MODE_PRIVATE)
            prefs.edit().clear().apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * 检查是否有待处理的分享intent
     */
    @ReactMethod
    fun hasShareIntent(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("share_intent", Context.MODE_PRIVATE)
            val shareType = prefs.getString("share_type", null)
            promise.resolve(shareType != null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
