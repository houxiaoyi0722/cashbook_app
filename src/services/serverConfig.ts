import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServerConfig } from '../types';

// 服务器配置存储键
const SERVER_CONFIGS_KEY = 'server_configs';
const CURRENT_SERVER_KEY = 'current_server';

// 服务器配置管理类
class ServerConfigManager {
  // 获取所有服务器配置
  async getAllConfigs(): Promise<ServerConfig[]> {
    try {
      const configsJson = await AsyncStorage.getItem(SERVER_CONFIGS_KEY);
      if (configsJson) {
        return JSON.parse(configsJson);
      }
      return [];
    } catch (error) {
      console.error('获取服务器配置失败', error);
      return [];
    }
  }

  // 保存服务器配置
  async saveConfig(config: ServerConfig): Promise<void> {
    try {
      const configs = await this.getAllConfigs();

      // 检查是否已存在相同ID的配置
      const existingIndex = configs.findIndex(c => c.id === config.id);

      if (existingIndex >= 0) {
        // 更新现有配置
        configs[existingIndex] = config;
      } else {
        // 添加新配置
        configs.push(config);
      }

      await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(configs));
    } catch (error) {
      console.error('保存服务器配置失败', error);
      throw error;
    }
  }

  // 删除服务器配置
  async deleteConfig(id: string): Promise<void> {
    try {
      const configs = await this.getAllConfigs();
      const filteredConfigs = configs.filter(c => c.id !== id);
      await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(filteredConfigs));

      // 如果删除的是当前选中的服务器，清除当前服务器
      const currentServer = await this.getCurrentServer();
      if (currentServer && currentServer.id === id) {
        await this.clearCurrentServer();
      }
    } catch (error) {
      console.error('删除服务器配置失败', error);
      throw error;
    }
  }

  // 获取当前选中的服务器配置
  async getCurrentServer(): Promise<ServerConfig | null> {
    try {
      const currentServerId = await AsyncStorage.getItem(CURRENT_SERVER_KEY);
      if (!currentServerId) return null;

      const configs = await this.getAllConfigs();
      return configs.find(c => c.id === currentServerId) || null;
    } catch (error) {
      console.error('获取当前服务器配置失败', error);
      return null;
    }
  }

  // 设置当前选中的服务器
  async setCurrentServer(id: string): Promise<void> {
    try {
      await AsyncStorage.setItem(CURRENT_SERVER_KEY, id);
    } catch (error) {
      console.error('设置当前服务器失败', error);
      throw error;
    }
  }

  // 清除当前选中的服务器
  async clearCurrentServer(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CURRENT_SERVER_KEY);
    } catch (error) {
      console.error('清除当前服务器失败', error);
      throw error;
    }
  }

  // 生成唯一ID
  generateId(): string {
    return Date.now().toString();
  }
}

// 导出单例
export const serverConfigManager = new ServerConfigManager();
export default serverConfigManager;

const STORAGE_KEY = 'server_config';

export const getServerConfig = async (): Promise<ServerConfig> => {
  const config = await AsyncStorage.getItem(STORAGE_KEY);
  if (!config) {
    throw new Error('服务器配置未初始化');
  }
  return JSON.parse(config);
};

export const setServerConfig = async (config: ServerConfig): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const clearServerConfig = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};
