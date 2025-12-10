import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogService } from './LogService';
import { eventBus } from '../navigation';

/**
 * AI助手配置服务
 * 管理AI助手功能的启用/禁用状态
 */
class AIAssistantConfigService {
  private static instance: AIAssistantConfigService;
  private readonly STORAGE_KEY = 'ai_assistant_enabled';
  private readonly DEFAULT_VALUE = false;
  private logService: LogService;
  // 事件常量
  public static readonly AI_ASSISTANT_ENABLED_CHANGED = 'ai_assistant_enabled_changed';

  private constructor() {
    this.logService = LogService.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): AIAssistantConfigService {
    if (!AIAssistantConfigService.instance) {
      AIAssistantConfigService.instance = new AIAssistantConfigService();
    }
    return AIAssistantConfigService.instance;
  }

  /**
   * 检查AI助手是否启用
   * @returns Promise<boolean> - 启用状态
   */
  public async isEnabled(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(this.STORAGE_KEY);

      if (value === null) {
        // 如果存储中没有值，返回默认值
        await this.logService.info(
          'AIAssistantConfigService',
          `No stored value found, returning default: ${this.DEFAULT_VALUE}`
        );
        return this.DEFAULT_VALUE;
      }

      const enabled = value === 'true';
      await this.logService.info(
        'AIAssistantConfigService',
        `Retrieved AI assistant enabled state: ${enabled}`
      );
      return enabled;
    } catch (error) {
      await this.logService.error(
        'AIAssistantConfigService',
        'Failed to retrieve AI assistant enabled state',
        error
      );
      // 出错时返回默认值
      return this.DEFAULT_VALUE;
    }
  }

  /**
   * 设置AI助手启用状态
   * @param enabled - 是否启用
   * @returns Promise<void>
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    try {
      const value = enabled ? 'true' : 'false';
      await AsyncStorage.setItem(this.STORAGE_KEY, value);

      await this.logService.info(
        'AIAssistantConfigService',
        `AI assistant enabled state set to: ${enabled}`
      );

      // 发射事件通知状态已改变
      eventBus.emit(AIAssistantConfigService.AI_ASSISTANT_ENABLED_CHANGED, enabled);
    } catch (error) {
      await this.logService.error(
        'AIAssistantConfigService',
        `Failed to set AI assistant enabled state to: ${enabled}`,
        error
      );
      throw error;
    }
  }

  /**
   * 切换AI助手启用状态
   * @returns Promise<boolean> - 切换后的新状态
   */
  public async toggle(): Promise<boolean> {
    try {
      const currentState = await this.isEnabled();
      const newState = !currentState;

      await this.setEnabled(newState);

      await this.logService.info(
        'AIAssistantConfigService',
        `AI assistant toggled from ${currentState} to ${newState}`
      );

      return newState;
    } catch (error) {
      await this.logService.error(
        'AIAssistantConfigService',
        'Failed to toggle AI assistant enabled state',
        error
      );
      throw error;
    }
  }

  /**
   * 清除配置（主要用于测试）
   * @returns Promise<void>
   */
  public async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
      await this.logService.info(
        'AIAssistantConfigService',
        'AI assistant configuration cleared'
      );
      // 清除配置后发射事件，状态为默认值
      eventBus.emit(AIAssistantConfigService.AI_ASSISTANT_ENABLED_CHANGED, this.DEFAULT_VALUE);
    } catch (error) {
      await this.logService.error(
        'AIAssistantConfigService',
        'Failed to clear AI assistant configuration',
        error
      );
      throw error;
    }
  }
}

export default AIAssistantConfigService.getInstance();
