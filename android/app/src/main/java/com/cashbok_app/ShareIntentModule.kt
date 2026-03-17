package com.cashbook_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * 原生模块用于处理分享intent
 */
class ShareIntentModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var broadcastReceiver: BroadcastReceiver? = null

    override fun getName(): String = "ShareIntentModule"

    /**
     * 初始化广播接收器
     */
    @ReactMethod
    fun initializeReceiver() {
        if (broadcastReceiver != null) return
        
        broadcastReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                intent?.let {
                    val shareType = it.getStringExtra("share_type")
                    if (shareType != null) {
                        sendEvent(shareType)
                    }
                }
            }
        }
        
        try {
            reactApplicationContext.registerReceiver(
                broadcastReceiver,
                IntentFilter("com.cashbook_app.SHARE_INTENT")
            )
        } catch (e: Exception) {
            // 可能已经注册
        }
    }

    /**
     * 移除广播接收器
     */
    @ReactMethod
    fun removeReceiver() {
        broadcastReceiver?.let {
            try {
                reactApplicationContext.unregisterReceiver(it)
            } catch (e: Exception) {
                // 未注册
            }
            broadcastReceiver = null
        }
    }

    /**
     * 发送事件到React Native
     */
    private fun sendEvent(shareType: String) {
        try {
            val params = Arguments.createMap().apply {
                putString("type", shareType)
            }
            
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onShareIntent", params)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

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

            val result = Arguments.createMap().apply {
                putString("type", shareType)
                
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

            // 清理数据
            prefs.edit().clear().apply()

            promise.resolve(result)
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
