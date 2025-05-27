import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

// 主题设置存储键
const DARK_MODE_KEY = 'dark_mode_enabled';

// 主题上下文类型
interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (enabled: boolean) => void;
}

// 创建主题上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 主题上下文提供者属性
interface ThemeProviderProps {
  children: ReactNode;
}

// 主题上下文提供者
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const deviceTheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // 初始化主题状态
  useEffect(() => {
    const initTheme = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(DARK_MODE_KEY);
        // 如果本地存储中有值，使用存储的值，否则使用设备默认主题
        if (storedValue !== null) {
          setIsDarkMode(storedValue === 'true');
        } else {
          setIsDarkMode(deviceTheme === 'dark');
        }
      } catch (error) {
        console.error('读取主题设置失败', error);
        // 默认使用设备主题
        setIsDarkMode(deviceTheme === 'dark');
      } finally {
        setIsInitialized(true);
      }
    };

    initTheme();
  }, [deviceTheme]);

  // 切换深色模式
  const toggleDarkMode = async () => {
    try {
      const newValue = !isDarkMode;
      setIsDarkMode(newValue);
      await AsyncStorage.setItem(DARK_MODE_KEY, newValue.toString());
    } catch (error) {
      console.error('保存主题设置失败', error);
    }
  };

  // 设置深色模式
  const setDarkMode = async (enabled: boolean) => {
    try {
      setIsDarkMode(enabled);
      await AsyncStorage.setItem(DARK_MODE_KEY, enabled.toString());
    } catch (error) {
      console.error('保存主题设置失败', error);
    }
  };

  // 仅在初始化完成后渲染子组件
  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        toggleDarkMode,
        setDarkMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// 使用主题上下文的自定义钩子
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme 必须在 ThemeProvider 内部使用');
  }
  return context;
};

// 常用颜色
export const getColors = (isDark: boolean) => {
  return {
    // 基础颜色
    write: '#ffffff',  // 白色保持不变
    black: '#000000',  // 黑色保持不变
    primary: '#1976d2',  // 蓝色保持不变
    error: '#f44336',    // 错误色保持不变
    success: '#4caf50',  // 成功色保持不变
    warning: '#ff9800',  // 警告色保持不变

    // 背景颜色
    background: isDark ? '#121212' : '#f5f5f5',
    card: isDark ? '#1e1e1e' : '#ffffff',
    dialog: isDark ? '#2c2c2c' : '#ffffff',

    // 文本颜色
    text: isDark ? '#e0e0e0' : '#333333',
    secondaryText: isDark ? '#a0a0a0' : '#757575',
    hint: isDark ? '#707070' : '#9e9e9e',

    // 边框和分隔线
    border: isDark ? '#383838' : '#e0e0e0',
    divider: isDark ? '#383838' : '#e0e0e0',

    // 图标颜色
    icon: isDark ? '#e0e0e0' : '#1976d2',

    // 按钮颜色
    button: '#1976d2',
    buttonText: '#ffffff',

    // 输入框颜色
    input: isDark ? '#383838' : '#f5f5f5',
    inputText: isDark ? '#e0e0e0' : '#333333',

    // 状态栏
    statusBar: isDark ? '#121212' : '#f5f5f5',
  };
};
