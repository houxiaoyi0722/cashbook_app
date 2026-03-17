import {NativeModules, NativeEventEmitter, Platform, AppState, AppStateStatus, DeviceEventEmitter} from 'react-native';

const {ShareIntentModule} = NativeModules;

interface ShareIntentData {
  type: 'ocr' | 'ai' | null;
  text?: string;
  imageUri?: string;
  imageUris?: string[];
  url?: string;
  extraData?: any;
}

type ShareIntentCallback = (data: ShareIntentData) => void;

class ShareIntentService {
  private static instance: ShareIntentService;
  private eventEmitter: NativeEventEmitter | null = null;
  private listeners: ShareIntentCallback[] = [];
  private appStateSubscription: any = null;
  private lastProcessedTime: number = 0;
  private initialCheckDone: boolean = false;

  private constructor() {
    if (Platform.OS === 'ios') {
      // iOS 模块初始化
    }
  }

  public static getInstance(): ShareIntentService {
    if (!ShareIntentService.instance) {
      ShareIntentService.instance = new ShareIntentService();
    }
    return ShareIntentService.instance;
  }

  /**
   * 初始化分享intent监听
   */
  public initialize(): void {
    // 监听app state变化来检测分享intent
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this),
    );

    // Android: 监听设备事件
    if (Platform.OS === 'android') {
      this.setupAndroidListener();
    }

    // 初始检查
    this.checkForShareIntent();
  }

  /**
   * 检查是否有分享intent
   */
  private async checkForShareIntent(): Promise<void> {
    if (this.initialCheckDone) {
      return;
    }
    this.initialCheckDone = true;

    try {
      if (Platform.OS === 'android' && ShareIntentModule) {
        const hasIntent = await ShareIntentModule.hasShareIntent();
        if (hasIntent) {
          // 延迟一下确保RN已完全初始化
          setTimeout(async () => {
            await this.processShareIntent();
          }, 500);
        }
      }
    } catch (error) {
      console.error('检查分享intent失败:', error);
    }
  }

  /**
   * 处理分享intent (Android - 使用原生模块)
   */
  private async processShareIntent(): Promise<void> {
    try {
      // 避免重复处理
      const currentTime = Date.now();
      if (currentTime - this.lastProcessedTime < 1000) {
        return;
      }
      this.lastProcessedTime = currentTime;

      if (Platform.OS === 'android' && ShareIntentModule) {
        const shareData = await ShareIntentModule.getShareIntent();
        if (shareData && shareData.type) {
          this.notifyListeners(shareData as ShareIntentData);
        }
      }
    } catch (error) {
      console.error('处理分享intent失败:', error);
    }
  }

  /**
   * 设置Android事件监听
   */
  private setupAndroidListener(): void {
    DeviceEventEmitter.addListener('onShareIntent', (data: ShareIntentData) => {
      if (data && data.type) {
        this.notifyListeners(data);
      }
    });
  }

  /**
   * 处理app状态变化
   */
  private async handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    if (nextAppState === 'active') {
      // 检查是否有待处理的分享intent
      await this.checkForShareIntent();
    }
  }

  /**
   * 添加分享intent监听器
   */
  public addListener(callback: ShareIntentCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(data: ShareIntentData): void {
    this.listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('分享intent回调执行失败:', error);
      }
    });
  }

  /**
   * 移除所有监听器
   */
  public removeAllListeners(): void {
    this.listeners = [];
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (Platform.OS === 'android') {
      DeviceEventEmitter.removeAllListeners('onShareIntent');
    }
  }
}

export const shareIntentService = ShareIntentService.getInstance();
export type {ShareIntentData, ShareIntentCallback};
