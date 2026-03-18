import {NativeModules, Platform, AppState, AppStateStatus} from 'react-native';

const {ShareIntentModule} = NativeModules;

interface ShareIntentData {
  type: 'ocr' | 'ai' | null;
  text?: string;
  imageUri?: string;
  imageUris?: string[];
  timestamp?: number;
}

type ShareIntentCallback = (data: ShareIntentData) => void;

class ShareIntentService {
  private static instance: ShareIntentService;
  private listeners: ShareIntentCallback[] = [];
  private appStateSubscription: any = null;
  private pollingInterval: any = null;
  private lastProcessedTimestamp: number = 0;
  private pendingData: ShareIntentData | null = null;

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
  }

  /**
   * 启动轮询检查
   */
  private startPolling(): void {
    if (this.pollingInterval) {return;}

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
   * 检查是否有分享intent - 只保存数据，不立即通知
   */
  private async checkForShareIntent(): Promise<void> {
    try {
      if (Platform.OS !== 'android' || !ShareIntentModule) {return;}

      const shareData = await ShareIntentModule.getShareIntent();

      if (shareData && shareData.type) {
        const timestamp = shareData.timestamp || 0;

        // 忽略太旧的数据（10秒以上）
        if (Date.now() - timestamp > 10000) {
          return;
        }

        // 忽略已经处理过的
        if (timestamp === this.lastProcessedTimestamp) {
          return;
        }

        // 保存待处理数据，等待监听器
        this.pendingData = shareData as ShareIntentData;

        // 如果已经有监听器，立即处理
        this.processPendingData();
      }
    } catch (error) {
      // 静默处理错误
    }
  }

  /**
   * 处理待处理的分享数据
   */
  private processPendingData(): void {
    if (!this.pendingData) {return;}
    if (this.listeners.length === 0) {
      return;
    }

    const data = this.pendingData;
    this.lastProcessedTimestamp = data.timestamp || 0;
    this.pendingData = null; // 清除待处理数据

    this.notifyListeners(data);
  }

  /**
   * 处理app状态变化
   */
  private async handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    if (nextAppState === 'active') {
      // 应用变为活跃时重置并检查
      this.lastProcessedTimestamp = 0;
      this.checkForShareIntent();
    } else if (nextAppState === 'background') {
      // 应用进入后台时停止轮询
      this.stopPolling();
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

    // 如果有待处理的分享数据，立即处理
    this.processPendingData();

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
