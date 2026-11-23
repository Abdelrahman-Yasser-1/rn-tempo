#import <AppIconSpec/AppIconSpec.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

@interface AppIconModule : NSObject <NativeAppIconSpec>
@end

@implementation AppIconModule

+ (NSString *)moduleName
{
  return @"AppIconModule";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppIconSpecJSI>(params);
}

- (NSNumber *)isSupported
{
  __block BOOL supported;
  RCTUnsafeExecuteOnMainQueueSync(^{
    supported = UIApplication.sharedApplication.supportsAlternateIcons;
  });
  return @(supported);
}

// actool writes the environment's primary asset name (e.g. AppIcon-Dev) into the built plist.
- (NSString *)iconPrefix
{
  NSDictionary *icons = [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleIcons"];
  NSString *primary = icons[@"CFBundlePrimaryIcon"][@"CFBundleIconName"];
  return primary.length ? [primary stringByAppendingString:@"-"] : nil;
}

- (void)getIcon:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  RCTExecuteOnMainQueue(^{
    NSString *asset = UIApplication.sharedApplication.alternateIconName;
    if (!asset) {
      resolve(nil);
      return;
    }
    NSString *prefix = [self iconPrefix];
    if (!prefix || ![asset hasPrefix:prefix]) {
      reject(@"E_APP_ICON", @"Unexpected alternate icon in bundle", nil);
      return;
    }
    resolve([asset substringFromIndex:prefix.length]);
  });
}

- (void)setIcon:(NSString * _Nullable)name
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
  RCTExecuteOnMainQueue(^{
    UIApplication *app = UIApplication.sharedApplication;
    if (!app.supportsAlternateIcons) {
      reject(@"E_UNSUPPORTED", @"Alternate app icons are unsupported", nil);
      return;
    }
    NSString *asset = name ? [[self iconPrefix] stringByAppendingString:name] : nil;
    if (name && !asset) {
      reject(@"E_APP_ICON", @"Missing primary icon name in bundle", nil);
      return;
    }
    [app setAlternateIconName:asset completionHandler:^(NSError *error) {
      if (error) {
        reject(@"E_APP_ICON", error.localizedDescription, error);
      } else {
        resolve(nil);
      }
    }];
  });
}

@end
