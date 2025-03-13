import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiResponse, ServerConfig, Book, Flow, AnalyticsItem, MonthAnalysis } from '../types';

// 创建API实例
const createApiInstance = (baseURL: string): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // 请求拦截器
  instance.interceptors.request.use(
    async (config) => {
      const token = await AsyncStorage.getItem('auth_token');
      if (token && config.headers) {
        config.headers.Authorization = token;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // 响应拦截器
  instance.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      // 处理401错误，清除token并重定向到登录页面
      if (error.response && error.response.status === 401) {
        AsyncStorage.removeItem('auth_token');
        AsyncStorage.removeItem('current_user');
        // 在实际应用中，这里应该触发导航到登录页面
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

// API类
class Api {
  private instance: AxiosInstance | null = null;
  private serverConfig: ServerConfig | null = null;

  // 初始化API实例
  init(serverConfig: ServerConfig) {
    this.serverConfig = serverConfig;
    this.instance = createApiInstance(serverConfig.url);
  }

  // 获取当前服务器配置
  getServerConfig(): ServerConfig | null {
    return this.serverConfig;
  }

  // 登录
  async login(username: string, password: string) {
    if (!this.instance) throw new Error('API实例未初始化');
    const response = await this.instance.post<ApiResponse<any>>('/api/login', {
      username,
      password,
    });
    return response.data;
  }

  // 更新密码
  async changePassword(old: string, newPassword: string) {
    if (!this.instance) throw new Error('API实例未初始化');
    const response = await this.instance.post<ApiResponse<string>>(
      '/api/entry/user/changePassword',
      {
        old,
        new: newPassword,
        againNew: newPassword,
      }
    );
    return response.data;
  }

  // 账本相关API
  book = {
    // 获取账本列表
    list: async (): Promise<ApiResponse<Book[]>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<Book[]>>('/api/entry/book/list',{});
      return response.data;
    },

    // 获取账本
    get: async (bookId: number): Promise<ApiResponse<Book>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<Book>>(`/api/entry/book${bookId}`);
      return response.data;
    },

    // 添加账本
    create: async (data: string): Promise<ApiResponse<Book>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<Book>>('/api/entry/book/add', {
        'bookName': data
      });
      return response.data;
    },

    // 分享账本
    share: async (data: any): Promise<ApiResponse<Book>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<Book>>('/api/entry/book/share', data);
      return response.data;
    },

    // 添加分享账本
    inshare: async (data: any): Promise<ApiResponse<string>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<string>>('/api/entry/book/inshare', data);
      return response.data;
    },

    // 更新账本
    update: async (data: Book): Promise<ApiResponse<Book>> => {
      console.log('更新账本:',data)
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<Book>>('/api/entry/book/update', data);
      return response.data;
    },

    // 删除账本
    delete: async (id: number): Promise<ApiResponse<void>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<void>>(`/api/entry/book/del`,{id});
      return response.data;
    },
  };

  // 流水相关API
  flow = {
    // 分页获取流水列表
    page: async (params: {
      pageNum: number;
      pageSize: number;
      bookId: string;
      startDay?: string;
      endDay?: string;
      flowType?: string;
      industryType?: string;
      payType?: string;
      moneySort?: string;
      attribution?: string;
      name?: string;
      description?: string;
    }): Promise<ApiResponse<{
      total: number;
      pages: number;
      totalIn: number;
      totalOut: number;
      notInOut: number;
      data: Flow[];
    }>> => {
      console.log(params);
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.get<ApiResponse<{
        total: number;
        pages: number;
        totalIn: number;
        totalOut: number;
        notInOut: number;
        data: Flow[];
      }>>('/api/entry/flow/page', { params });
      console.log(response);
      return response.data;
    },

    // 获取流水
    get: async (flowId: number): Promise<ApiResponse<Flow>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.get<ApiResponse<Flow>>(`/api/flow/${flowId}`);
      return response.data;
    },

    // 添加流水
    create: async (data: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Flow>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<Flow>>('/api/flow', data);
      return response.data;
    },

    // 更新流水
    update: async (flowId: number, data: Partial<Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ApiResponse<Flow>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<Flow>>(`/api/flow/${flowId}`, data);
      return response.data;
    },

    // 删除流水
    delete: async (flowId: number): Promise<ApiResponse<void>> => {
      if (!this.instance) throw new Error('API实例未初始化');
      const response = await this.instance.post<ApiResponse<void>>(`/api/flow/${flowId}`);
      return response.data;
    },
  };

  // 分析相关API
  analytics = {
    // 流水归属统计
    attribution: async (params: any) => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post<ApiResponse<any>>('/api/entry/analytics/attribution', params);
      return response.data;
    },

    // 每月流水统计
    month: async (bookId: string): Promise<ApiResponse<AnalyticsItem[]>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post(`/api/entry/analytics/month`,{bookId});
      return response.data;
    },

    // 每日流水统计
    daily: async (bookId: string): Promise<ApiResponse<Array<{
      type: string;
      inSum: number;
      outSum: number;
      zeroSum: number;
    }>>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post(`/api/entry/analytics/daily`,{bookId});
      return response.data;
    },

    // 支付方式统计
    payType: async (params: {
      bookId: string;
      flowType: string;
      startDay: string;
      endDay: string;
    }): Promise<ApiResponse<Array<{
      type: string;
      inSum: number;
      outSum: number;
      zeroSum: number;
    }>>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post(`/api/entry/analytics/payType`, { params });
      return response.data;
    },

    // 支出类型统计
    industryType: async (params: {
      bookId: string;
      flowType: string;
      startDay: string;
      endDay: string;
    }): Promise<ApiResponse<Array<{
      type: string;
      inSum: number;
      outSum: number;
      zeroSum: number;
    }>>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post(`/api/entry/analytics/industryType`, { params });
      return response.data;
    },

    // 当月分析
    monthAnalysis: async (month: string, bookId: string): Promise<ApiResponse<MonthAnalysis>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post(`/api/entry/analytics/monthAnalysis`, {
        params: { month, bookId }
      });
      return response.data;
    },
  };
}

// 导出单例
export const api = new Api();
export default api;
