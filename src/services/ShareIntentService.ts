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
  private pollingInterval: any = null;
  private lastProcessedTimestamp: number = 0;

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
    // 监听app state变化
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this),
    );

    // Android: 监听设备事件
    if (Platform.OS === 'android') {
      this.setupAndroidListener();
      this.startPolling();
    }

    // 初始检查
    this.checkForShareIntent();
  }

  /**
   * 设置Android事件监听
   */
  private setupAndroidListener(): void {
    // 监听原生模块发送的事件
    DeviceEventEmitter.addListener('onShareIntent', (data: ShareIntentData) => {
      console.log('收到分享intent事件:', data);
      if (data && data.type) {
        this.notifyListeners(data);
      }
    });
  }

  /**
   * 启动轮询检查
   */
  private startPolling(): void {
    if (this.pollingInterval) return;

    // 每秒检查一次是否有新的分享
    this.pollingInterval = setInterval(() => {
      this.checkForShareIntent();
    }, 1000);
  }

  /**
   * 停止轮询
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * 检查是否有分享intent
   */
  private async checkForShareIntent(): Promise<void> {
    try {
      if (Platform.OS === 'android' && ShareIntentModule) {
        const shareData = await ShareIntentModule.getShareIntent();

        if (shareData && shareData.type) {
          // 检查是否是新的分享（通过时间戳）
          // 避免重复处理
          const currentTime = Date.now();
          if (currentTime - this.lastProcessedTimestamp < 1000) {
            return;
          }
          this.lastProcessedTimestamp = currentTime;

          console.log('处理分享intent:', shareData);
          this.notifyListeners(shareData as ShareIntentData);
        }
      }
    } catch (error) {
      // 静默处理错误，避免日志刷屏
    }
  }

  /**
   * 处理app状态变化
   */
  private async handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    if (nextAppState === 'active') {
      // 应用变为活跃时立即检查
      await this.checkForShareIntent();

      // 重启轮询
      if (Platform.OS === 'android') {
        this.startPolling();
      }
    } else if (nextAppState === 'background') {
      // 应用进入后台时停止轮询，节省资源
      if (Platform.OS === 'android') {
        this.stopPolling();
      }
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
    this.stopPolling();
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
