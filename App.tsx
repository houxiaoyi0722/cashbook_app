/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider as RNEThemeProvider } from '@rneui/themed';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { logger } from './src/services/LogService';
import { setupErrorHandlers } from './src/utils/errorHandler';
import AppNavigator from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';
import { BookProvider } from './src/context/BookContext';
import { BookkeepingProvider } from './src/context/BookkeepingContext';
import { ThemeProvider, useTheme, getColors } from './src/context/ThemeContext';
import ErrorBoundary from './src/components/ErrorBoundary';

// 应用内容组件，用于访问主题
const AppContent = () => {
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  // 初始化日志服务和错误处理
  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('开始初始化应用...');

        // 初始化日志服务
        try {
          // 初始化日志服务 (这将根据服务器配置设置日志记录开关)
          await logger.initialize();

          // 获取当前日志记录状态
          const isLoggingEnabled = (logger as any).isLoggingEnabled?.();
          console.log(`日志服务初始化成功，日志记录状态: ${isLoggingEnabled ? '已启用' : '已禁用'}`);

          // 如果日志记录已启用，记录一条应用启动日志
          if (isLoggingEnabled) {
            await logger.info('App', '应用启动成功，日志记录已启用');
          }
        } catch (logError) {
          console.error('日志服务初始化失败:', logError);
        }

        // 设置全局错误处理
        try {
          setupErrorHandlers();
          console.log('全局错误处理已设置');
          await logger.info('App', '全局错误处理已设置');
        } catch (errorHandlerError) {
          console.error('设置全局错误处理失败:', errorHandlerError);
        }
      } catch (error) {
        console.error('应用初始化失败:', error);
        Alert.alert('初始化失败', '应用初始化过程中发生错误，某些功能可能受限。');
      }
    };

    initApp();

    return () => {
      // 记录应用退出日志
      try {
        // 只有在日志记录已启用的情况下才记录退出日志
        if ((logger as any).isLoggingEnabled?.()) {
          logger.info('App', '应用退出');
        }
      } catch (error) {
        console.warn('记录应用退出日志失败:', error);
      }
    };
  }, []);

  // 处理 ErrorBoundary 中的错误
  const handleAppError = (error: Error, errorInfo: React.ErrorInfo) => {
    console.error('应用级错误:', error);
    // 尝试记录错误到日志系统
    try {
      logger.error('App', '应用级错误', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    } catch (logError) {
      console.error('记录应用级错误失败:', logError);
    }
  };

  return (
    <ErrorBoundary showFullScreen={true} onError={handleAppError} isDarkMode={isDarkMode}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar
            barStyle={isDarkMode ? "light-content" : "dark-content"}
            backgroundColor={colors.statusBar}
            translucent={false}
          />
          <RNEThemeProvider>
            <AuthProvider>
              <BookProvider>
                <BookkeepingProvider>
                  <AppNavigator />
                </BookkeepingProvider>
              </BookProvider>
            </AuthProvider>
          </RNEThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
