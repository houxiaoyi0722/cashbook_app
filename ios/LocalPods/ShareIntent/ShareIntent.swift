import Foundation
import React
import UIKit

@objc(ShareIntent)
class ShareIntent: NSObject {
  
  private var hasListeners = false
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  @objc
  func supportedEvents() -> [String]! {
    return ["onShareIntent"]
  }
  
  @objc
  func startObserving() {
    hasListeners = true
  }
  
  @objc
  func stopObserving() {
    hasListeners = false
  }
  
  // 处理分享intent
  @objc
  func handleShareIntent(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      
      // 从 UIApplication.shared.delegate 获取 rootViewController
      guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let rootViewController = windowScene.windows.first?.rootViewController else {
        resolve(nil)
        return
      }
      
      // 查找正在处理的分享activity
      if let activity = self.getShareActivity(from: rootViewController) {
        self.processActivity(activity, resolve: resolve, reject: reject)
      } else {
        resolve(nil)
      }
    }
  }
  
  // 从view controller中查找分享activity
  private func getShareActivity(from viewController: UIViewController) -> UIActivity? {
    // iOS的分享通过UIActivityViewController完成，但我们可以通过extension来处理
    // 这里返回nil，因为iOS的分享extension是独立的进程
    return nil
  }
  
  // 处理分享数据
  private func processActivity(_ activity: UIActivity, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    var shareData: [String: Any] = [:]
    
    if let text = activity.userInfo?[UIActivity.ActivityType(rawValue: "public.text")] as? String {
      shareData["text"] = text
      shareData["type"] = "text"
    }
    
    if let image = activity.userInfo?[UIActivity.ActivityType(rawValue: "public.image")] as? UIImage {
      shareData["type"] = "image"
      // 可以转换为base64或保存到临时文件
      if let imageData = image.jpegData(compressionQuality: 0.8) {
        shareData["imageData"] = imageData.base64EncodedString()
      }
    }
    
    resolve(shareData)
  }
  
  // 注册AppDelegate处理方法
  @objc
  func application(_ application: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    // 处理来自其他app的URL scheme分享
    handleURLScheme(url)
    return true
  }
  
  private func handleURLScheme(_ url: URL) {
    // 解析URL并发送事件到React Native
    var params: [String: Any] = [:]
    
    if let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
      if components.scheme == "cashbook" {
        if components.host == "ocr" {
          params["type"] = "ocr"
        } else if components.host == "ai" {
          params["type"] = "ai"
        }
      }
      
      // 解析query参数
      if let queryItems = components.queryItems {
        for item in queryItems {
          params[item.name] = item.value
        }
      }
    }
    
    // 发送事件
    if hasListeners {
      // 事件将通过EventEmitter发送
    }
  }
}
