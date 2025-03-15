import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { UserInfo, ServerConfig } from '../types';
import authManager from '../services/auth';
import serverConfigManager from '../services/serverConfig';
import api from '../services/api';
import {eventBus} from "../navigation";

// 认证上下文类型
interface AuthContextType {
  isLoading: boolean;
  isLoggedIn: boolean;
  isLogOut: boolean;
  userInfo: UserInfo | null;
  serverConfig: ServerConfig | null;
  serverConfigs: ServerConfig[];
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  saveServerConfig: (config: ServerConfig) => Promise<void>;
  deleteServerConfig: (id: string) => Promise<void>;
  switchServer: (id: string) => Promise<void>;
}

// 创建认证上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 认证上下文提供者属性
interface AuthProviderProps {
  children: ReactNode;
}

// 认证上下文提供者
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLogOut, setIsLogOut] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [serverConfigs, setServerConfigs] = useState<ServerConfig[]>([]);

  // 初始化认证状态
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 获取所有服务器配置
        const configs = await serverConfigManager.getAllConfigs();
        setServerConfigs(configs);

        // 获取当前服务器配置
        const currentServer = await serverConfigManager.getCurrentServer();
        setServerConfig(currentServer);

        if (currentServer) {
          // 初始化API
          api.init(currentServer);

          // 检查是否已登录
          const loggedIn = await authManager.isLoggedIn();
          setIsLoggedIn(loggedIn);

          if (loggedIn) {
            // 获取当前用户信息
            const user = await authManager.getCurrentUser();
            setUserInfo(user);
          }
        }
      } catch (error) {
        console.error('初始化认证状态失败', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // 登录
  const login = useCallback(async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const user = await authManager.login(username, password);
      setUserInfo(user);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('登录失败', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [serverConfig]);

  // 登出
  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await authManager.logout();
      setUserInfo(null);
      setIsLoggedIn(false);
      setIsLogOut(true);
    } catch (error) {
      console.error('登出失败', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 添加服务器配置并自动登录
  const saveServerConfig = useCallback(async (config: ServerConfig) => {
    try {
      setIsLoading(true);
      await serverConfigManager.saveConfig(config);

      // 设置为当前服务器
      await serverConfigManager.setCurrentServer(config.id);

      // 获取当前服务器配置
      const currentServer = await serverConfigManager.getCurrentServer();
      setServerConfig(currentServer);
      // 刷新服务器配置列表
      const configs = await serverConfigManager.getAllConfigs();
      setServerConfigs(configs);
    } catch (error) {
      console.error('添加服务器配置失败', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 删除服务器配置
  const deleteServerConfig = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      await serverConfigManager.deleteConfig(id);
      // 刷新服务器配置列表
      const configs = await serverConfigManager.getAllConfigs();
      setServerConfigs(configs);
      // 获取当前服务器配置
      const currentServer = await serverConfigManager.getCurrentServer();
      setServerConfig(currentServer);
    } catch (error) {
      console.error('删除服务器配置失败', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 切换服务器并自动登录
  const switchServer = useCallback(async (id: string) => {
    try {
      setIsLoading(true);

      // 设置当前服务器
      await serverConfigManager.setCurrentServer(id);

      // 获取当前服务器配置
      const configs = await serverConfigManager.getAllConfigs();
      const currentServer = configs.find(c => c.id === id);

      if (!currentServer) {
        throw new Error('找不到服务器配置');
      }

      setServerConfig(currentServer);

      // 初始化API
      api.init(currentServer);
      // 自动登录
      const user = await authManager.login(currentServer.username, currentServer.password);
      setUserInfo(user);
      setIsLoggedIn(true);
      eventBus.emit('refreshCurrentBook');
    } catch (error) {
      console.error('登录失败', error);
      // 即使登录失败也继续，不阻止用户使用
      await authManager.logout();
      setUserInfo(null);
      setIsLoggedIn(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isLoggedIn,
        isLogOut,
        userInfo,
        serverConfig,
        serverConfigs,
        login,
        logout,
        saveServerConfig,
        deleteServerConfig,
        switchServer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// 使用认证上下文的Hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth必须在AuthProvider内部使用');
  }
  return context;
};
