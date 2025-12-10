import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'custom';
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
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
  baseURL: 'https://api.openai.com/v1'
};

const STORAGE_KEY = 'ai_config';

class AIConfigService {
  private config: AIConfig | null = null;

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

  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(config?.apiKey && config.apiKey.trim().length > 0);
  }

  async getConfig(): Promise<AIConfig | null> {
    if (this.config) return this.config;
    
    try {
      const configStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (configStr) {
        const parsedConfig = JSON.parse(configStr);
        // 确保加载的配置有合适的 baseURL
        if (!parsedConfig.baseURL || parsedConfig.baseURL.trim() === '') {
          parsedConfig.baseURL = this.getDefaultBaseURL(parsedConfig.provider);
        }
        this.config = parsedConfig;
      }
      return this.config;
    } catch (error) {
      console.error('获取AI配置失败:', error);
      return null;
    }
  }

  async saveConfig(config: Partial<AIConfig>): Promise<boolean> {
    try {
      const currentConfig = await this.getConfig() || {};
      // 合并配置，确保必需字段有值
      const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...currentConfig,
        ...config
      };
      
      // 确保 baseURL 有合适的默认值
      let baseURL = mergedConfig.baseURL;
      if (!baseURL || baseURL.trim() === '') {
        // 根据 provider 设置默认 baseURL
        baseURL = this.getDefaultBaseURL(mergedConfig.provider);
      }
      
      // 创建最终的配置对象，确保类型匹配
      const newConfig: AIConfig = {
        provider: mergedConfig.provider,
        apiKey: mergedConfig.apiKey || '',
        model: mergedConfig.model,
        baseURL: baseURL,
        maxTokens: mergedConfig.maxTokens,
        temperature: mergedConfig.temperature
      };
      
      // 验证必需字段
      if (!newConfig.apiKey.trim()) {
        throw new Error('API Key 不能为空');
      }
      if (!newConfig.provider) {
        throw new Error('Provider 不能为空');
      }
      if (!newConfig.model) {
        throw new Error('Model 不能为空');
      }
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      this.config = newConfig;
      return true;
    } catch (error) {
      console.error('保存AI配置失败:', error);
      return false;
    }
  }

  async clearConfig(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      this.config = null;
    } catch (error) {
      console.error('清除AI配置失败:', error);
    }
  }

  async validateConfig(config?: AIConfig): Promise<boolean> {
    const configToValidate = config || await this.getConfig();
    if (!configToValidate?.apiKey) return false;

    try {
      let apiEndpoint: string;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      let body: any = null;
      let method = 'GET';

      // 根据服务商设置API端点和认证头
      switch (configToValidate.provider) {
        case 'openai':
          // 使用 chat/completions 端点进行验证，发送一个简单的测试消息
          apiEndpoint = 'https://api.openai.com/v1/chat/completions';
          headers['Authorization'] = `Bearer ${configToValidate.apiKey}`;
          method = 'POST';
          body = JSON.stringify({
            model: configToValidate.model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5
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
            messages: [{ role: 'user', content: 'Hello' }]
          });
          break;
        case 'google':
          // Google Gemini API 验证端点 - 使用 generateContent
          apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${configToValidate.model || 'gemini-pro'}:generateContent?key=${configToValidate.apiKey}`;
          headers = {}; // Google 使用 URL 参数，不需要 Authorization 头
          method = 'POST';
          body = JSON.stringify({
            contents: [{ parts: [{ text: 'Hello' }] }]
          });
          break;
        case 'deepseek':
          // DeepSeek 使用 chat/completions 端点进行验证
          apiEndpoint = 'https://api.deepseek.com/v1/chat/completions';
          headers['Authorization'] = `Bearer ${configToValidate.apiKey}`;
          method = 'POST';
          body = JSON.stringify({
            model: configToValidate.model || 'deepseek-chat',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5
          });
          break;
        case 'custom':
          // 自定义服务商，使用 OpenAI 兼容的验证方式
          // 使用用户提供的 baseURL 或默认值
          const customBaseURL = configToValidate.baseURL || this.getDefaultBaseURL('custom');
          apiEndpoint = `${customBaseURL}/chat/completions`;
          headers['Authorization'] = `Bearer ${configToValidate.apiKey}`;
          method = 'POST';
          body = JSON.stringify({
            model: configToValidate.model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5
          });
          break;
        default:
          console.error(`不支持的服务商: ${configToValidate.provider}`);
          return false;
      }

      console.log(`验证 ${configToValidate.provider} API Key，端点: ${apiEndpoint}`, {
        method,
        headers: Object.keys(headers),
        hasBody: !!body
      });
      
      const fetchOptions: RequestInit = {
        method,
        headers: headers
      };
      
      if (body && method === 'POST') {
        fetchOptions.body = body;
      }
      
      const response = await fetch(apiEndpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        console.error(`API Key 验证失败: ${response.status} ${response.statusText}`, {
          errorText: errorText.substring(0, 200)
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
      const savedConfig = await this.getConfig();
      configToUse = {
        provider: configParam.provider || savedConfig?.provider || DEFAULT_CONFIG.provider,
        apiKey: configParam.apiKey || savedConfig?.apiKey || '',
        model: configParam.model || savedConfig?.model || DEFAULT_CONFIG.model,
        baseURL: configParam.baseURL || savedConfig?.baseURL || DEFAULT_CONFIG.baseURL,
        maxTokens: configParam.maxTokens || savedConfig?.maxTokens || DEFAULT_CONFIG.maxTokens,
        temperature: configParam.temperature || savedConfig?.temperature || DEFAULT_CONFIG.temperature
      };
    } else {
      configToUse = await this.getConfig();
    }
    
    if (!configToUse?.apiKey) return [];

    try {
      let apiEndpoint: string;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // 根据服务商设置API端点和认证头
      switch (configToUse.provider) {
        case 'openai':
          apiEndpoint = 'https://api.openai.com/v1/models';
          headers['Authorization'] = `Bearer ${configToUse.apiKey}`;
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
          headers['Authorization'] = `Bearer ${configToUse.apiKey}`;
          break;
        case 'custom':
          // 自定义服务商，使用 OpenAI 兼容的端点获取模型列表
          const customBaseURL = configToUse.baseURL || this.getDefaultBaseURL('custom');
          apiEndpoint = `${customBaseURL}/models`;
          headers['Authorization'] = `Bearer ${configToUse.apiKey}`;
          break;
        default:
          return [];
      }

      console.log(`获取 ${configToUse.provider} 模型列表，端点: ${apiEndpoint}`);
      
      const response = await fetch(apiEndpoint, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        console.error(`获取模型列表失败: ${response.status} ${response.statusText}`, {
          errorText: errorText.substring(0, 200)
        });
        
        // 对于 Google，尝试备用端点
        if (configToUse.provider === 'google') {
          console.log('尝试备用 Google 模型端点...');
          const fallbackEndpoint = 'https://generativelanguage.googleapis.com/v1/models?key=' + configToUse.apiKey;
          const fallbackResponse = await fetch(fallbackEndpoint, { method: 'GET' });
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            return this.parseModelsResponse(configToUse.provider, fallbackData);
          }
        }
        
        return [];
      }

      const data = await response.json();
      return this.parseModelsResponse(configToUse.provider, data);
      
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return [];
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
                name: model.id
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
                name: model.id
              }));
          } else if (data.models && Array.isArray(data.models)) {
            return data.models
              .filter((model: any) => model.id.includes('claude'))
              .map((model: any) => ({
                id: model.id,
                name: model.id
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
                name: model.displayName || model.name.replace('models/', '')
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
                name: model.id
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
