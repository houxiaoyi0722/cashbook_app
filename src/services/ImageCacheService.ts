import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// 图片缓存记录
interface CacheRecord {
  localPath: string;  // 本地文件路径
  timestamp: number;  // 缓存时间戳
}

class ImageCacheService {
  private static instance: ImageCacheService;
  private cacheMap: Record<string, CacheRecord> = {};
  private isCaching = false;
  private cacheDir = `${RNFS.CachesDirectoryPath}/invoiceImages`;

  // 私有构造函数
  private constructor() {
    // 创建缓存目录
    this.initCacheDir();
    // 从存储加载缓存记录
    this.loadCacheMap();
  }

  // 单例获取方法
  public static getInstance(): ImageCacheService {
    if (!ImageCacheService.instance) {
      ImageCacheService.instance = new ImageCacheService();
    }
    return ImageCacheService.instance;
  }

  // 初始化缓存目录
  private async initCacheDir(): Promise<void> {
    try {
      const exists = await RNFS.exists(this.cacheDir);
      if (!exists) {
        await RNFS.mkdir(this.cacheDir);
      }
    } catch (error) {
      console.error('创建缓存目录失败:', error);
    }
  }

  // 从存储加载缓存映射
  private async loadCacheMap(): Promise<void> {
    try {
      const cacheData = await AsyncStorage.getItem('invoice_image_cache');
      if (cacheData) {
        this.cacheMap = JSON.parse(cacheData);

        // 验证缓存文件是否存在
        for (const key in this.cacheMap) {
          const exists = await RNFS.exists(this.cacheMap[key].localPath);
          if (!exists) {
            delete this.cacheMap[key];
          }
        }

        // 保存验证后的缓存记录
        this.saveCacheMap();
      }
    } catch (error) {
      console.error('加载缓存映射失败:', error);
      this.cacheMap = {};
    }
  }

  // 保存缓存映射到存储
  private async saveCacheMap(): Promise<void> {
    try {
      await AsyncStorage.setItem('invoice_image_cache', JSON.stringify(this.cacheMap));
    } catch (error) {
      console.error('保存缓存映射失败:', error);
    }
  }

  // 检查图片是否已缓存
  public isImageCached(invoiceName: string): boolean {
    return !!this.cacheMap[invoiceName];
  }

  // 获取图片URL（优先返回缓存的本地路径）
  public getImageUrl(invoiceName: string): string {
    if (invoiceName.startsWith('file://')) {
      return invoiceName;
    }
    const cacheRecord = this.cacheMap[invoiceName];
    if (cacheRecord) {
      return `file://${cacheRecord.localPath}`;
    }
    return api.flow.getInvoiceUrl(invoiceName);
  }

  // 缓存单张图片
  public async cacheImage(invoiceName: string): Promise<string | null> {
    if (this.isImageCached(invoiceName)) {
      return this.getImageUrl(invoiceName);
    }

    try {
      // 获取授权Token
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        console.log('无法获取授权Token');
        return null;
      }

      const remoteUrl = api.flow.getInvoiceUrl(invoiceName);
      const localPath = `${this.cacheDir}/${invoiceName}.jpg`;

      // 下载图片
      const downloadResult = await RNFS.downloadFile({
        fromUrl: remoteUrl,
        toFile: localPath,
        headers: {
          Authorization: token,
        },
        background: true, // 允许后台下载
        discretionary: true, // 系统决定最佳下载时机
      }).promise;

      if (downloadResult.statusCode === 200) {
        // 更新缓存记录
        this.cacheMap[invoiceName] = {
          localPath,
          timestamp: Date.now(),
        };
        this.saveCacheMap();
        return `file://${localPath}`;
      } else {
        console.error(`下载图片失败: ${invoiceName}, 状态码: ${downloadResult.statusCode}`);
        return null;
      }
    } catch (error) {
      console.error(`缓存图片出错: ${invoiceName}`, error);
      return null;
    }
  }

  // 批量缓存图片
  public async cacheImages(invoiceNames: string[]): Promise<void> {
    if (this.isCaching) {return;}

    this.isCaching = true;
    try {
      // 筛选出未缓存的图片
      const uncachedImages = invoiceNames.filter(name => !this.isImageCached(name));

      // 并行下载图片（每次最多5张）
      const batchSize = 5;
      for (let i = 0; i < uncachedImages.length; i += batchSize) {
        const batch = uncachedImages.slice(i, i + batchSize);
        await Promise.all(batch.map(name => this.cacheImage(name)));
      }
    } catch (error) {
      console.error('批量缓存图片出错:', error);
    } finally {
      this.isCaching = false;
    }
  }

  // 清除图片缓存
  public async clearCache(invoiceName: string): Promise<boolean> {
    try {
      const cacheRecord = this.cacheMap[invoiceName];
      if (cacheRecord) {
        // 删除文件
        if (await RNFS.exists(cacheRecord.localPath)) {
          await RNFS.unlink(cacheRecord.localPath);
        }

        // 更新缓存记录
        delete this.cacheMap[invoiceName];
        this.saveCacheMap();
        return true;
      }
      return false;
    } catch (error) {
      console.error(`清除图片缓存出错: ${invoiceName}`, error);
      return false;
    }
  }

  // 清除所有缓存
  public async clearAllCache(): Promise<void> {
    try {
      // 删除所有缓存文件
      const keys = Object.keys(this.cacheMap);
      await Promise.all(
        keys.map(key => this.clearCache(key))
      );

      // 重置缓存记录
      this.cacheMap = {};
      this.saveCacheMap();
    } catch (error) {
      console.error('清除所有缓存出错:', error);
    }
  }
}

// 导出单例
export default ImageCacheService.getInstance();
