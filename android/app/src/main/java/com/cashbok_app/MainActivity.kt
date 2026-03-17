package com.cashbook_app

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  private lateinit var prefs: SharedPreferences

  /**
   * 重写 onCreate 方法，传入 null 来丢弃持久化的 Activity 状态
   * 这可以防止 react-native-screens 的 fragment 恢复导致的崩溃
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    prefs = getSharedPreferences("share_intent", MODE_PRIVATE)
    // 处理启动时的intent
    handleIntent(intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "cashbook_app"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * 处理新的intent（当应用已在后台时通过分享入口启动）
   */
  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    handleIntent(intent)
  }

  /**
   * 处理分享intent - 将分享数据保存到SharedPreferences供React Native读取
   */
  private fun handleIntent(intent: Intent?) {
    intent?.let {
      val shareType = it.getStringExtra("share_type")
      if (shareType != null) {
        // 保存分享数据到SharedPreferences
        prefs.edit().apply {
          putString("share_type", shareType)
          
          // 获取文本内容
          it.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
            putString("share_text", text)
          }
          
          // 获取图片URI
          val uri = it.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM)
          uri?.let { imageUri ->
            putString("share_image_uri", imageUri.toString())
          }
          
          // 获取多图
          val uris = it.getParcelableArrayListExtra<android.net.Uri>(Intent.EXTRA_STREAM)
          uris?.let { imageUris ->
            putString("share_image_uris", imageUris.joinToString(",") { u -> u.toString() })
          }
          
          // 添加时间戳，用于区分新旧的分享
          putLong("share_timestamp", System.currentTimeMillis())
          
          apply()
        }
        
        // 如果应用已经在运行，发送广播通知
        sendBroadcast(Intent("com.cashbook_app.SHARE_INTENT").apply {
          putExtra("share_type", shareType)
        })
      }
    }
  }
  
  override fun onResume() {
    super.onResume()
    // 检查是否有待处理的分享intent
    checkAndProcessPendingShareIntent()
  }
  
  /**
   * 检查并处理待处理的分享intent
   */
  private fun checkAndProcessPendingShareIntent() {
    val shareType = prefs.getString("share_type", null)
    if (shareType != null) {
      val timestamp = prefs.getLong("share_timestamp", 0)
      // 如果是5秒内的分享，认为是有效的
      if (System.currentTimeMillis() - timestamp < 5000) {
        // 清理数据，触发RN重新读取
        prefs.edit().remove("share_type").apply()
      }
    }
  }
}
