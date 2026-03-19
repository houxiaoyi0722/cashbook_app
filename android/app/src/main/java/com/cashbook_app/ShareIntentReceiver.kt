package com.cashbook_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 分享intent广播接收器
 */
class ShareIntentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        // 转发广播以唤醒MainActivity
        intent?.let {
            val launchIntent = context?.packageManager?.getLaunchIntentForPackage(context.packageName)
            launchIntent?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("share_type", it.getStringExtra("share_type"))
            }
            context?.startActivity(launchIntent)
        }
    }
}
