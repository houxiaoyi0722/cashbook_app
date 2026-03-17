import {NativeModules, NativeEventEmitter, Platform, AppState, AppStateStatus, DeviceEventEmitter} from 'react-native';

const {ShareIntentModule} = NativeModules;

interface ShareIntentData {
  type: 'ocr' | 'ai' | null;
  text?: string;
  imageUri?: string;
  imageUris?: string[];
}

type ShareIntentCallback = (data: ShareIntentData) => void;

class ShareIntentService {
  private static instance: ShareIntentService;
  private listeners: ShareIntentCallback[] = [];
  private appStateSubscription: any = null;
  private pollingInterval: any = null;
  private lastProcessedTimestamp: number = 0;

  private constructor() {}

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

    // Android: 启动轮询
    if (Platform.OS === 'android') {
      this.startPolling();
    }

    // 立即检查一次
    this.checkForShareIntent();
  }

  /**
   * 启动轮询检查
   */
  private startPolling(): void {
    if (this.pollingInterval) return;
    
    // 每500ms检查一次
    this.pollingInterval = setInterval(() => {
      this.checkForShareIntent();
    }, 500);
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
      if (Platform.OS !== 'android' || !ShareIntentModule) return;

      const shareData = await ShareIntentModule.getShareIntent();
      
      if (shareData && shareData.type) {
        // 检查是否是新的分享（通过时间戳）
        const timestamp = shareData.timestamp || 0;
        const currentTime = Date.now();
        
        // 如果时间戳相同或太旧，跳过
        if (timestamp === this.lastProcessedTimestamp || 
            (currentTime - timestamp > 10000)) { // 10秒以上的忽略
          return;
        }
        
        // 避免重复处理
        if (timestamp === this.lastProcessedTimestamp) {
          return;
        }
        
        this.lastProcessedTimestamp = timestamp;
        
        console.log('处理分享intent:', shareData);
        this.notifyListeners(shareData as ShareIntentData);
      }
    } catch (error) {
      // 静默处理错误
    }
  }

  /**
   * 处理app状态变化
   */
  private async handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    if (nextAppState === 'active') {
      // 应用变为活跃时立即检查
      this.lastProcessedTimestamp = 0; // 重置，确保能检测到
      await this.checkForShareIntent();
    } else if (nextAppState === 'background') {
      // 应用进入后台时停止轮询
      this.stopPolling();
      this.lastProcessedTimestamp = 0;
    } else if (nextAppState === 'inactive') {
      // 应用从活跃变为非活跃时，重新启动轮询
      if (Platform.OS === 'android') {
        this.startPolling();
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
  }
}

export const shareIntentService = ShareIntentService.getInstance();
export type {ShareIntentData, ShareIntentCallback};
