#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ShareIntent, NSObject)

RCT_EXTERN_METHOD(handleShareIntent:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(application:(UIApplication *)application
                  openURL:(NSURL *)url
                  options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
