/**
 * 导出导入服务
 * 负责导出和导入应用的配置数据
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiConfigService } from './AIConfigService';
import { eventBus } from '../navigation';

// 存储键常量
const SERVER_CONFIGS_KEY = 'server_configs';
const CURRENT_SERVER_KEY = 'current_server';
const AI_CONFIG_KEY = 'ai_config';
const AI_ASSISTANT_ENABLED_KEY = 'ai_assistant_enabled';
const THEME_KEY = 'dark_mode_enabled';
const OFFLINE_MODE_KEY = 'offline_mode';

// 导出数据类型
export interface ExportData {
  version: number; // 导出格式版本
  exportTime: string; // 导出时间
  data: {
    // 服务器配置
    serverConfigs: any[];
    currentServerId: string | null;
    // AI配置
    aiConfig: any;
    aiAssistantEnabled: boolean;
    // 当前账本 (按服务器ID存储)
    currentBooks: Record<string, any>;
    // 主题设置
    themeDarkMode: string | null;
    // 离线模式
    offlineMode: string | null;
  };
}

/**
 * 导出应用配置
 * @returns 导出的JSON字符串
 */
export async function exportAppConfig(): Promise<string> {
  try {
    // 获取服务器配置
    const serverConfigs = await AsyncStorage.getItem(SERVER_CONFIGS_KEY);
    const currentServerId = await AsyncStorage.getItem(CURRENT_SERVER_KEY);

    // 获取AI配置
    const aiConfig = await AsyncStorage.getItem(AI_CONFIG_KEY);
    const aiAssistantEnabled = await AsyncStorage.getItem(AI_ASSISTANT_ENABLED_KEY);

    // 获取主题设置
    const themeDarkMode = await AsyncStorage.getItem(THEME_KEY);

    // 获取离线模式设置
    const offlineMode = await AsyncStorage.getItem(OFFLINE_MODE_KEY);

    // 获取当前账本（需要遍历可能的服务器ID）
    const currentBooks: Record<string, any> = {};

    // 尝试获取所有可能服务器的当前账本
    if (serverConfigs) {
      const configs = JSON.parse(serverConfigs);
      for (const config of configs) {
        const bookKey = `current_book:${config.id}`;
        const bookData = await AsyncStorage.getItem(bookKey);
        if (bookData) {
          currentBooks[config.id] = JSON.parse(bookData);
        }
      }
    }

    // 构建导出数据
    const exportData: ExportData = {
      version: 1,
      exportTime: new Date().toISOString(),
      data: {
        serverConfigs: serverConfigs ? JSON.parse(serverConfigs) : [],
        currentServerId: currentServerId,
        aiConfig: aiConfig ? JSON.parse(aiConfig) : null,
        aiAssistantEnabled: aiAssistantEnabled === 'true',
        currentBooks,
        themeDarkMode,
        offlineMode,
      },
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('导出配置失败:', error);
    throw new Error('导出配置失败');
  }
}

/**
 * 导入应用配置
 * @param jsonString 要导入的JSON字符串
 * @returns 导入结果
 */
export async function importAppConfig(jsonString: string): Promise<{ success: boolean; message: string }> {
  try {
    // 解析JSON
    let importData: ExportData;
    try {
      importData = JSON.parse(jsonString);
    } catch (parseError) {
      return { success: false, message: '无效的JSON格式' };
    }

    // 验证版本
    if (!importData.version || !importData.data) {
      return { success: false, message: '无效的导出文件格式' };
    }

    const { data } = importData;

    // 1. 恢复服务器配置
    if (data.serverConfigs && Array.isArray(data.serverConfigs)) {
      await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(data.serverConfigs));
    }

    // 2. 恢复当前服务器
    if (data.currentServerId) {
      await AsyncStorage.setItem(CURRENT_SERVER_KEY, data.currentServerId);
    }

    // 3. 恢复AI配置
    if (data.aiConfig) {
      await AsyncStorage.setItem(AI_CONFIG_KEY, JSON.stringify(data.aiConfig));
      // 清除aiConfigService的缓存以确保重新加载
      // @ts-ignore - 访问私有缓存
      if (aiConfigService._storage) {
        // @ts-ignore
        aiConfigService._storage = null;
      }
    }

    // 4. 恢复AI助手启用状态
    await AsyncStorage.setItem(AI_ASSISTANT_ENABLED_KEY, String(data.aiAssistantEnabled));

    // 5. 恢复当前账本（按服务器ID）
    if (data.currentBooks && typeof data.currentBooks === 'object') {
      for (const [serverId, book] of Object.entries(data.currentBooks)) {
        const bookKey = `current_book:${serverId}`;
        await AsyncStorage.setItem(bookKey, JSON.stringify(book));
      }
    }

    // 6. 恢复主题设置
    if (data.themeDarkMode !== undefined) {
      if (data.themeDarkMode) {
        await AsyncStorage.setItem(THEME_KEY, data.themeDarkMode);
      } else {
        await AsyncStorage.removeItem(THEME_KEY);
      }
    }

    // 7. 恢复离线模式设置
    if (data.offlineMode !== undefined) {
      if (data.offlineMode) {
        await AsyncStorage.setItem(OFFLINE_MODE_KEY, data.offlineMode);
      } else {
        await AsyncStorage.removeItem(OFFLINE_MODE_KEY);
      }
    }

    // 发出配置更新事件
    eventBus.emit('configImported');

    return { success: true, message: '配置导入成功' };
  } catch (error) {
    console.error('导入配置失败:', error);
    return { success: false, message: '导入配置失败: ' + (error as Error).message };
  }
}

/**
 * 验证导入的JSON数据
 * @param jsonString 要验证的JSON字符串
 * @returns 是否有效
 */
export function validateImportData(jsonString: string): { valid: boolean; version?: number; error?: string } {
  try {
    const data = JSON.parse(jsonString);

    if (!data.version || !data.data) {
      return { valid: false, error: '无效的导出文件格式' };
    }

    return { valid: true, version: data.version };
  } catch (error) {
    return { valid: false, error: '无效的JSON格式' };
  }
}

export default {
  exportAppConfig,
  importAppConfig,
  validateImportData,
};
