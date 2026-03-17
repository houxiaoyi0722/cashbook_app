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

  /**
   * 处理分享intent - 将分享数据保存到SharedPreferences供React Native读取
   */
  private fun handleIntent(intent: Intent?) {
    intent?.let {
      // 如果已经有share_type，说明是分享入口Activity传递过来的
      val shareType = it.getStringExtra("share_type")
      if (shareType != null) {
        // 已有数据，不需要再次保存
        return
      }
      
      // 检查是否从分享入口启动的（通过检查intent action）
      val hasShareData = prefs.getString("share_type", null)
      if (hasShareData != null) {
        // 有待处理的分享数据，不做处理，等待RN读取
        return
      }
    }
  }
  
  override fun onResume() {
    super.onResume()
    // 每次恢复时检查是否有待处理的分享intent
    checkPendingShareIntent()
  }
  
  /**
   * 检查并标记待处理的分享intent
   */
  private fun checkPendingShareIntent() {
    val shareType = prefs.getString("share_type", null)
    if (shareType != null) {
      val timestamp = prefs.getLong("share_timestamp", 0)
      val currentTime = System.currentTimeMillis()
      
      // 如果是5秒内的新分享，触发检查
      if (currentTime - timestamp < 5000) {
        // 重新设置时间戳，确保RN能够检测到变化
        prefs.edit().putLong("share_timestamp", currentTime).apply()
      }
    }
  }
}
