import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserInfo } from '../types';
import api from './api';

// 认证相关的存储键
const AUTH_TOKEN_KEY = 'auth_token';
const CURRENT_USER_KEY = 'current_user';

// 认证管理类
class AuthManager {
  // 登录
  async login(username: string, password: string): Promise<UserInfo> {
    try {
      const response = await api.login(username, password);

      if (response.c === 200 && response.d) {
        const userInfo: UserInfo = response.d;

        // 保存认证信息
        await this.saveAuthInfo(userInfo);

        return userInfo;
      } else {
        throw new Error(response.m || '登录失败');
      }
    } catch (error) {
      console.error('登录失败', error);
      throw error;
    }
  }

  // 保存认证信息
  async saveAuthInfo(userInfo: UserInfo): Promise<void> {
    try {
      // 保存token
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, userInfo.token);

      // 保存用户信息
      await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo));
    } catch (error) {
      console.error('保存认证信息失败', error);
      throw error;
    }
  }

  // 获取当前用户信息
  async getCurrentUser(): Promise<UserInfo | null> {
    try {
      const userJson = await AsyncStorage.getItem(CURRENT_USER_KEY);
      if (userJson) {
        return JSON.parse(userJson);
      }
      return null;
    } catch (error) {
      console.error('获取当前用户信息失败', error);
      return null;
    }
  }

  // 获取认证token
  async getToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('获取认证token失败', error);
      return null;
    }
  }

  // 检查是否已登录
  async isLoggedIn(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  // 登出
  async logout(): Promise<void> {
    try {
      // 清除认证信息
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(CURRENT_USER_KEY);
    } catch (error) {
      console.error('登出失败', error);
      throw error;
    }
  }

  // 更新密码
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    try {
      const response = await api.changePassword(oldPassword, newPassword);

      if (response.c !== 200) {
        throw new Error(response.m || '更新密码失败');
      }
    } catch (error) {
      console.error('更新密码失败', error);
      throw error;
    }
  }
}

// 导出单例
export const authManager = new AuthManager();
export default authManager;
