// src/services/LocalCacheService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CachedData {
  industryTypes: { [key: string]: string[] };
  payTypes: string[];
  attributions: string[];
  lastUpdated: number;
}

class LocalCacheService {
  private readonly CACHE_KEY = 'flow_form_cache';
  private readonly CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天过期

  // 默认数据
  private readonly defaultIndustryTypes = {
    '收入': ['工资', '奖金', '转账红包', '其他'],
    '支出': ['餐饮美食', '日用百货', '交通出行', '充值缴费', '服饰装扮', '公共服务', '商业服务', '家居家装', '文化休闲', '爱车养车', '生活服务', '运动户外', '亲友代付', '其他'],
    '不计收支': ['信用借还', '投资理财', '退款', '报销', '收款', '其他'],
  };

  private readonly defaultPayTypes = ['现金', '支付宝', '微信', '银行卡', '信用卡', '其他'];

  // 获取缓存数据
  async getCachedData(): Promise<CachedData> {
    try {
      const cached = await AsyncStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const data: CachedData = JSON.parse(cached);
        // 检查是否过期
        if (Date.now() - data.lastUpdated < this.CACHE_EXPIRY) {
          return data;
        }
      }
    } catch (error) {
      console.error('读取缓存失败:', error);
    }
    
    // 返回默认数据
    return {
      industryTypes: this.defaultIndustryTypes,
      payTypes: this.defaultPayTypes,
      attributions: [],
      lastUpdated: Date.now()
    };
  }

  // 更新缓存数据
  async updateCache(data: Partial<CachedData>): Promise<void> {
    try {
      const current = await this.getCachedData();
      const updated = {
        ...current,
        ...data,
        lastUpdated: Date.now()
      };
      await AsyncStorage.setItem(this.CACHE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('更新缓存失败:', error);
    }
  }

  // 合并服务器数据和本地数据
  async mergeServerData(
    serverIndustryTypes: { [key: string]: string[] },
    serverPayTypes: string[],
    serverAttributions: string[]
  ): Promise<void> {
    const current = await this.getCachedData();
    
    // 合并行业类型
    const mergedIndustryTypes = { ...current.industryTypes };
    Object.keys(serverIndustryTypes).forEach(flowType => {
      const existing = mergedIndustryTypes[flowType] || [];
      const server = serverIndustryTypes[flowType] || [];
      mergedIndustryTypes[flowType] = [...new Set([...existing, ...server])];
    });

    // 合并支付方式
    const mergedPayTypes = [...new Set([...current.payTypes, ...serverPayTypes])];

    // 合并归属人
    const mergedAttributions = [...new Set([...current.attributions, ...serverAttributions])];

    await this.updateCache({
      industryTypes: mergedIndustryTypes,
      payTypes: mergedPayTypes,
      attributions: mergedAttributions
    });
  }

  // 添加自定义选项
  async addCustomOption(
    type: 'industryType' | 'payType' | 'attribution',
    value: string,
    flowType?: string
  ): Promise<void> {
    const current = await this.getCachedData();
    
    if (type === 'industryType' && flowType) {
      const existing = current.industryTypes[flowType] || [];
      if (!existing.includes(value)) {
        current.industryTypes[flowType] = [...existing, value];
      }
    } else if (type === 'payType') {
      if (!current.payTypes.includes(value)) {
        current.payTypes.push(value);
      }
    } else if (type === 'attribution') {
      if (!current.attributions.includes(value)) {
        current.attributions.push(value);
      }
    }

    await this.updateCache(current);
  }

  // 获取行业类型（支持离线）
  async getIndustryTypes(flowType: string): Promise<string[]> {
    const cached = await this.getCachedData();
    return cached.industryTypes[flowType] || this.defaultIndustryTypes[flowType] || [];
  }

  // 获取支付方式（支持离线）
  async getPayTypes(): Promise<string[]> {
    const cached = await this.getCachedData();
    return cached.payTypes.length > 0 ? cached.payTypes : this.defaultPayTypes;
  }

  // 获取归属人（支持离线）
  async getAttributions(): Promise<string[]> {
    const cached = await this.getCachedData();
    return cached.attributions;
  }

  // 清除缓存
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.CACHE_KEY);
    } catch (error) {
      console.error('清除缓存失败:', error);
    }
  }
}

export default new LocalCacheService();
