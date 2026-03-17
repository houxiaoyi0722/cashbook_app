package com.cashbook_app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * AIShareActivity - 发送给AI入口
 * 从其他应用分享文本或图片时显示在分享面板
 */
class AIShareActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    // 直接处理intent
    handleIntent(intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript.
   */
  override fun getMainComponentName(): String = "cashbook_app"

  /**
   * Returns the instance of the [ReactActivityDelegate].
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * 处理分享intent
   */
  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    intent?.let { incomingIntent ->
      // 将分享数据传递给MainActivity
      val mainIntent = Intent(this, MainActivity::class.java).apply {
        action = Intent.ACTION_MAIN
        putExtra("share_type", "ai")
        
        // 处理文本
        incomingIntent.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
          putExtra(Intent.EXTRA_TEXT, text)
        }
        
        // 处理图片
        if (incomingIntent.action == Intent.ACTION_SEND && incomingIntent.type?.startsWith("image/") == true) {
          val uri: Uri? = incomingIntent.getParcelableExtra(Intent.EXTRA_STREAM)
          uri?.let { putExtra(Intent.EXTRA_STREAM, it) }
        }
        
        // 处理多图
        if (incomingIntent.action == Intent.ACTION_SEND_MULTIPLE && incomingIntent.type?.startsWith("image/") == true) {
          val uris: ArrayList<Uri>? = incomingIntent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
          uris?.let { putParcelableArrayListExtra(Intent.EXTRA_STREAM, it) }
        }
        
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      startActivity(mainIntent)
    }
    finish()
  }
}
