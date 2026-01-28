import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AIConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'custom';
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  createdAt?: number;
  updatedAt?: number;
}

interface AIConfigStorage {
  version: number;
  configs: AIConfig[];
  activeConfigId: string | null;
}

const DEFAULT_CONFIG: {
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'custom';
  model: string;
  maxTokens: number;
  temperature: number;
  baseURL: string;
} = {
  provider: 'openai',
  model: 'gpt-3.5-turbo',
  maxTokens: 1000,
  temperature: 0.7,
  baseURL: 'https://api.openai.com/v1',
};

const STORAGE_KEY = 'ai_config';
const STORAGE_VERSION = 2;

class AIConfigService {
  private storage: AIConfigStorage | null = null;
  private migrationChecked = false;

  private getDefaultBaseURL(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'google':
        return 'https://generativelanguage.googleapis.com/v1';
      case 'deepseek':
        return 'https://api.deepseek.com';
      case 'custom':
        return 'https://api.openai.com/v1'; // 为自定义提供商提供合理的默认值
      default:
        return '';
    }
  }

  private async migrateFromV1(): Promise<void> {
    if (this.migrationChecked) {return;}

    try {
      const oldConfigStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (!oldConfigStr) {
        this.migrationChecked = true;
        return;
      }

      // 尝试解析旧版本配置
      const oldConfig = JSON.parse(oldConfigStr);
      // 检查是否是旧版本（没有 version 字段）
      if (oldConfig.version === undefined) {
        // 创建新的配置对象
        const newConfig: AIConfig = {
          id: this.generateId(),
          name: '默认配置',
          provider: oldConfig.provider || DEFAULT_CONFIG.provider,
          apiKey: oldConfig.apiKey || '',
          model: oldConfig.model || DEFAULT_CONFIG.model,
          baseURL: oldConfig.baseURL || this.getDefaultBaseURL(oldConfig.provider || DEFAULT_CONFIG.provider),
          maxTokens: oldConfig.maxTokens || DEFAULT_CONFIG.maxTokens,
          temperature: oldConfig.temperature || DEFAULT_CONFIG.temperature,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // 创建新的存储结构
        const storage: AIConfigStorage = {
          version: STORAGE_VERSION,
          configs: [newConfig],
          activeConfigId: newConfig.id,
        };

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
        this.storage = storage;
        console.log('已从旧版本迁移配置到新版本');
      }
    } catch (error) {
      console.error('迁移配置失败:', error);
    } finally {
      this.migrationChecked = true;
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  private async getStorage(): Promise<AIConfigStorage> {
    // 如果已经有缓存的存储，直接返回
    if (this.storage) {
      return this.storage;
    }

    // 执行迁移
    await this.migrateFromV1();

    try {
      const storageStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (storageStr) {
        const parsedStorage = JSON.parse(storageStr);
        // 验证版本
        if (parsedStorage.version === STORAGE_VERSION) {
          this.storage = parsedStorage;
          // 使用非空断言，因为刚刚赋值
          return this.storage!;
        }
      }

      // 如果没有存储数据或版本不匹配，创建默认存储
      const defaultConfig: AIConfig = {
        id: this.generateId(),
        name: '默认配置',
        provider: DEFAULT_CONFIG.provider,
        apiKey: '',
        model: DEFAULT_CONFIG.model,
        baseURL: DEFAULT_CONFIG.baseURL,
        maxTokens: DEFAULT_CONFIG.maxTokens,
        temperature: DEFAULT_CONFIG.temperature,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const defaultStorage: AIConfigStorage = {
        version: STORAGE_VERSION,
        configs: [defaultConfig],
        activeConfigId: defaultConfig.id,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultStorage));
      this.storage = defaultStorage;
      // 使用非空断言，因为刚刚赋值
      return this.storage!;
    } catch (error) {
      console.error('获取存储失败:', error);
      // 返回一个默认的存储结构，确保不会返回 null
      const defaultConfig: AIConfig = {
        id: this.generateId(),
        name: '默认配置',
        provider: DEFAULT_CONFIG.provider,
        apiKey: '',
        model: DEFAULT_CONFIG.model,
        baseURL: DEFAULT_CONFIG.baseURL,
        maxTokens: DEFAULT_CONFIG.maxTokens,
        temperature: DEFAULT_CONFIG.temperature,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const defaultStorage: AIConfigStorage = {
        version: STORAGE_VERSION,
        configs: [defaultConfig],
        activeConfigId: defaultConfig.id,
      };
      // 更新缓存
      this.storage = defaultStorage;
      return defaultStorage;
    }
  }

  private async saveStorage(storage: AIConfigStorage): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
      this.storage = storage;
    } catch (error) {
      console.error('保存存储失败:', error);
    }
  }

  async isConfigured(): Promise<boolean> {
    const config = await this.getActiveConfig();
    return !!(config?.apiKey && config.apiKey.trim().length > 0);
  }

  // 向后兼容：获取活动配置
  async getConfig(): Promise<AIConfig | null> {
    return this.getActiveConfig();
  }

  async getActiveConfig(): Promise<AIConfig | null> {
    const storage = await this.getStorage();
    if (!storage.activeConfigId) {return null;}

    return storage.configs.find(config => config.id === storage.activeConfigId) || null;
  }

  async getAllConfigs(): Promise<AIConfig[]> {
    const storage = await this.getStorage();
    return [...storage.configs];
  }

  async getConfigById(id: string): Promise<AIConfig | null> {
    const storage = await this.getStorage();
    return storage.configs.find(config => config.id === id) || null;
  }

  async addConfig(config: Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIConfig> {
    const storage = await this.getStorage();

    const newConfig: AIConfig = {
      ...config,
      id: this.generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    storage.configs.push(newConfig);
    await this.saveStorage(storage);
    return newConfig;
  }

  async updateConfig(id: string, updates: Partial<Omit<AIConfig, 'id' | 'createdAt'>>): Promise<boolean> {
    const storage = await this.getStorage();
    const index = storage.configs.findIndex(config => config.id === id);

    if (index === -1) {return false;}

    storage.configs[index] = {
      ...storage.configs[index],
      ...updates,
      updatedAt: Date.now(),
    };

    await this.saveStorage(storage);
    return true;
  }

  async deleteConfig(id: string): Promise<boolean> {
    const storage = await this.getStorage();
    const initialLength = storage.configs.length;

    storage.configs = storage.configs.filter(config => config.id !== id);

    // 如果删除的是活动配置，需要设置新的活动配置
    if (storage.activeConfigId === id) {
      if (storage.configs.length > 0) {
        storage.activeConfigId = storage.configs[0].id;
      } else {
        storage.activeConfigId = null;
      }
    }

    if (storage.configs.length !== initialLength) {
      await this.saveStorage(storage);
      return true;
    }

    return false;
  }

  async setActiveConfig(id: string): Promise<boolean> {
    const storage = await this.getStorage();
    const configExists = storage.configs.some(config => config.id === id);

    if (!configExists) {return false;}

    storage.activeConfigId = id;
    await this.saveStorage(storage);
    return true;
  }

  // 向后兼容：保存配置（更新活动配置或创建新配置）
  async saveConfig(config: Partial<AIConfig>): Promise<boolean> {
    try {
      const storage = await this.getStorage();
      const activeConfig = await this.getActiveConfig();

      if (activeConfig) {
        // 更新活动配置
        return await this.updateConfig(activeConfig.id, config);
      } else {
        // 创建新配置
        const newConfig: Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'> = {
          name: '配置',
          provider: config.provider || DEFAULT_CONFIG.provider,
          apiKey: config.apiKey || '',
          model: config.model || DEFAULT_CONFIG.model,
          baseURL: config.baseURL || this.getDefaultBaseURL(config.provider || DEFAULT_CONFIG.provider),
          maxTokens: config.maxTokens || DEFAULT_CONFIG.maxTokens,
          temperature: config.temperature || DEFAULT_CONFIG.temperature,
        };

        const addedConfig = await this.addConfig(newConfig);
        await this.setActiveConfig(addedConfig.id);
        return true;
      }
    } catch (error) {
      console.error('保存AI配置失败:', error);
      return false;
    }
  }

  async clearConfig(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      this.storage = null;
      this.migrationChecked = false;
    } catch (error) {
      console.error('清除AI配置失败:', error);
    }
  }

  async validateConfig(config?: AIConfig): Promise<boolean> {
    const configToValidate = config || await this.getActiveConfig();
    if (!configToValidate?.apiKey) {return false;}

    try {
      let apiEndpoint: string;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      let body: any = null;
      let method = 'GET';

      // 根据服务商设置API端点和认证头
      switch (configToValidate.provider) {
        case 'openai':
          // 使用 chat/completions 端点进行验证，发送一个简单的测试消息
          apiEndpoint = 'https://api.openai.com/v1/chat/completions';
          headers.Authorization = `Bearer ${configToValidate.apiKey}`;
          method = 'POST';
          body = JSON.stringify({
            model: configToValidate.model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5,
          });
          break;
        case 'anthropic':
          // Anthropic 使用 messages 端点进行验证
          apiEndpoint = 'https://api.anthropic.com/v1/messages';
          headers['x-api-key'] = configToValidate.apiKey;
          headers['anthropic-version'] = '2023-06-01';
          method = 'POST';
          body = JSON.stringify({
            model: configToValidate.model || 'claude-3-haiku-20240307',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Hello' }],
          });
          break;
        case 'google':
          // Google Gemini API 验证端点 - 使用 generateContent
          apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${configToValidate.model || 'gemini-pro'}:generateContent?key=${configToValidate.apiKey}`;
          headers = {}; // Google 使用 URL 参数，不需要 Authorization 头
          method = 'POST';
          body = JSON.stringify({
            contents: [{ parts: [{ text: 'Hello' }] }],
          });
          break;
        case 'deepseek':
          // DeepSeek 使用 chat/completions 端点进行验证
          apiEndpoint = 'https://api.deepseek.com/v1/chat/completions';
          headers.Authorization = `Bearer ${configToValidate.apiKey}`;
          method = 'POST';
          body = JSON.stringify({
            model: configToValidate.model || 'deepseek-chat',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5,
          });
          break;
        case 'custom':
          // 自定义服务商，使用 OpenAI 兼容的验证方式
          // 使用用户提供的 baseURL 或默认值
          const customBaseURL = configToValidate.baseURL || this.getDefaultBaseURL('custom');
          apiEndpoint = `${customBaseURL}/chat/completions`;
          headers.Authorization = `Bearer ${configToValidate.apiKey}`;
          method = 'POST';
          body = JSON.stringify({
            model: configToValidate.model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5,
          });
          break;
        default:
          console.error(`不支持的服务商: ${configToValidate.provider}`);
          return false;
      }

      console.log(`验证 ${configToValidate.provider} API Key，端点: ${apiEndpoint}`, {
        method,
        headers: Object.keys(headers),
        hasBody: !!body,
      });

      const fetchOptions: RequestInit = {
        method,
        headers: headers,
      };

      if (body && method === 'POST') {
        fetchOptions.body = body;
      }

      const response = await fetch(apiEndpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        console.error(`API Key 验证失败: ${response.status} ${response.statusText}`, {
          errorText: errorText.substring(0, 200),
        });

        // 对于 Google，如果第一个端点失败，尝试备用端点
        if (configToValidate.provider === 'google') {
          console.log('尝试备用 Google 验证端点...');
          const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1/models/${configToValidate.model || 'gemini-pro'}?key=${configToValidate.apiKey}`;
          const fallbackResponse = await fetch(fallbackEndpoint, { method: 'GET' });
          if (fallbackResponse.ok) {
            console.log('Google API Key 验证成功（备用端点）');
            return true;
          }
        }

        return false;
      }

      console.log(`${configToValidate.provider} API Key 验证成功`);
      return true;
    } catch (error) {
      console.error('验证API Key失败:', error);
      return false;
    }
  }

  async getAvailableModels(configParam?: Partial<AIConfig>): Promise<Array<{id: string, name: string}>> {
    // 确定要使用的配置：优先使用传入的参数，否则使用存储的配置
    let configToUse: AIConfig | null = null;

    if (configParam) {
      // 从传入的参数构建一个完整的配置
      const savedConfig = await this.getActiveConfig();
      configToUse = {
        id: 'temp-id',
        name: '临时配置',
        provider: configParam.provider || savedConfig?.provider || DEFAULT_CONFIG.provider,
        apiKey: configParam.apiKey || savedConfig?.apiKey || '',
        model: configParam.model || savedConfig?.model || DEFAULT_CONFIG.model,
        baseURL: configParam.baseURL || savedConfig?.baseURL || DEFAULT_CONFIG.baseURL,
        maxTokens: configParam.maxTokens || savedConfig?.maxTokens || DEFAULT_CONFIG.maxTokens,
        temperature: configParam.temperature || savedConfig?.temperature || DEFAULT_CONFIG.temperature,
      };
    } else {
      configToUse = await this.getActiveConfig();
    }

    if (!configToUse?.apiKey) {return [];}

    try {
      let apiEndpoint: string;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // 根据服务商设置API端点和认证头
      switch (configToUse.provider) {
        case 'openai':
          apiEndpoint = 'https://api.openai.com/v1/models';
          headers.Authorization = `Bearer ${configToUse.apiKey}`;
          break;
        case 'anthropic':
          // Anthropic 使用 models 端点
          apiEndpoint = 'https://api.anthropic.com/v1/models';
          headers['x-api-key'] = configToUse.apiKey;
          headers['anthropic-version'] = '2023-06-01';
          break;
        case 'google':
          // Google Gemini API - 使用 models.list 端点
          apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${configToUse.apiKey}`;
          headers = {}; // Google 使用 URL 参数
          break;
        case 'deepseek':
          apiEndpoint = 'https://api.deepseek.com/v1/models';
          headers.Authorization = `Bearer ${configToUse.apiKey}`;
          break;
        case 'custom':
          // 自定义服务商，使用 OpenAI 兼容的端点获取模型列表
          const customBaseURL = configToUse.baseURL || this.getDefaultBaseURL('custom');
          apiEndpoint = `${customBaseURL}/models`;
          headers.Authorization = `Bearer ${configToUse.apiKey}`;
          break;
        default:
          return [];
      }

      console.log(`获取 ${configToUse.provider} 模型列表，端点: ${apiEndpoint}`);

      // 设置超时时间
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      const response = await fetch(apiEndpoint, {
        method: 'GET',
        headers: headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        console.error(`获取模型列表失败: ${response.status} ${response.statusText}`, {
          errorText: errorText.substring(0, 200),
        });

        // 对于 Google，尝试备用端点
        if (configToUse.provider === 'google') {
          console.log('尝试备用 Google 模型端点...');
          const fallbackEndpoint = 'https://generativelanguage.googleapis.com/v1/models?key=' + configToUse.apiKey;
          try {
            const fallbackResponse = await fetch(fallbackEndpoint, {
              method: 'GET',
              signal: controller.signal,
            });
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json();
              return this.parseModelsResponse(configToUse.provider, fallbackData);
            }
          } catch (fallbackError) {
            console.error('备用端点也失败:', fallbackError);
          }
        }

        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const models = this.parseModelsResponse(configToUse.provider, data);

      if (models.length === 0) {
        throw new Error('未找到可用模型，请检查API Key权限');
      }

      return models;

    } catch (error: any) {
      console.error('获取模型列表失败:', error);
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接');
      }
      throw error;
    }
  }

  private parseModelsResponse(provider: string, data: any): Array<{id: string, name: string}> {
    try {
      switch (provider) {
        case 'openai':
        case 'custom':
          // 自定义供应商使用与 OpenAI 相同的解析逻辑，因为它们是 OpenAI 兼容的 API 接口
          if (data.data && Array.isArray(data.data)) {
            return data.data
              .filter((model: any) =>
                model.id.includes('gpt') ||
                model.id.includes('text-') ||
                model.object === 'model'
              )
              .map((model: any) => ({
                id: model.id,
                name: model.id,
              }))
              .sort((a: any, b: any) => a.id.localeCompare(b.id));
          }
          break;
        case 'anthropic':
          if (data.data && Array.isArray(data.data)) {
            return data.data
              .filter((model: any) => model.id.includes('claude'))
              .map((model: any) => ({
                id: model.id,
                name: model.id,
              }));
          } else if (data.models && Array.isArray(data.models)) {
            return data.models
              .filter((model: any) => model.id.includes('claude'))
              .map((model: any) => ({
                id: model.id,
                name: model.id,
              }));
          }
          break;
        case 'google':
          if (data.models && Array.isArray(data.models)) {
            return data.models
              .filter((model: any) =>
                model.name &&
                (model.name.includes('gemini') || model.name.includes('models/'))
              )
              .map((model: any) => ({
                id: model.name.replace('models/', ''),
                name: model.displayName || model.name.replace('models/', ''),
              }));
          }
          break;
        case 'deepseek':
          if (data.data && Array.isArray(data.data)) {
            return data.data
              .filter((model: any) =>
                model.id &&
                (model.id.includes('deepseek') || model.id.includes('chat'))
              )
              .map((model: any) => ({
                id: model.id,
                name: model.id,
              }));
          }
          break;
      }
    } catch (error) {
      console.error(`解析 ${provider} 模型响应失败:`, error);
    }
    return [];
  }
}

export const aiConfigService = new AIConfigService();
