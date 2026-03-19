package com.cashbook_app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.content.SharedPreferences

/**
 * AIShareActivity - 发送给AI入口
 * 从其他应用分享文本或图片时显示在分享面板
 */
class AIShareActivity : ReactActivity() {

  private lateinit var prefs: SharedPreferences

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    prefs = getSharedPreferences("share_intent", MODE_PRIVATE)
    handleIntent(intent)
  }

  override fun getMainComponentName(): String = "cashbook_app"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    intent?.let { incomingIntent ->
      // 保存分享数据
      prefs.edit().apply {
        putString("share_type", "ai")
        
        // 处理文本
        incomingIntent.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
          putString("share_text", text)
        }
        
        // 处理图片
        if (incomingIntent.action == Intent.ACTION_SEND && incomingIntent.type?.startsWith("image/") == true) {
          val uri: Uri? = incomingIntent.getParcelableExtra(Intent.EXTRA_STREAM)
          uri?.let { putString("share_image_uri", it.toString()) }
        }
        
        // 处理多图
        if (incomingIntent.action == Intent.ACTION_SEND_MULTIPLE && incomingIntent.type?.startsWith("image/") == true) {
          val uris: ArrayList<Uri>? = incomingIntent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
          uris?.let { 
            putString("share_image_uris", it.joinToString(",") { u -> u.toString() })
          }
        }
        
        putLong("share_timestamp", System.currentTimeMillis())
        apply()
      }
      
      // 启动MainActivity
      val mainIntent = Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      startActivity(mainIntent)
    }
    finish()
  }
}
