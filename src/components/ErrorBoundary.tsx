import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { logger } from '../services/LogService';
import { getColors } from '../context/ThemeContext';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  containerStyle?: object;
  showFullScreen?: boolean;
  isDarkMode?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，记录错误并显示备用 UI
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // 更新 state，下次渲染时使用备用 UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // 记录错误信息
    try {
      logger.error('React', '组件渲染错误', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    } catch (logError) {
      console.error('记录组件错误失败:', logError);
    }

    // 如果提供了 onError 回调，则调用它
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { isDarkMode = false } = this.props;
    const colors = getColors(isDarkMode);

    if (this.state.hasError) {
      // 自定义备用 UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 获取错误信息
      const errorMessage = this.state.error
        ? `${this.state.error.message || '未知错误'}`
        : '未知错误';

      // 默认错误 UI
      if (this.props.showFullScreen) {
        return (
          <View style={[styles.fullScreenContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.errorCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.title, { color: colors.error }]}>哎呀，出错了</Text>
              <Text style={[styles.message, { color: colors.text }]}>
                抱歉，页面加载失败。请尝试重新加载。
              </Text>
              <Text style={[styles.errorDetails, { color: colors.secondaryText, backgroundColor: colors.input }]}>
                错误信息: {errorMessage}
              </Text>
              <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={this.handleRetry}>
                <Text style={styles.buttonText}>重试</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }

      return (
        <View style={[styles.container, this.props.containerStyle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.error }]}>哎呀，出错了</Text>
          <Text style={[styles.message, { color: colors.text }]}>
            抱歉，这部分内容加载失败。请稍后重试。
          </Text>
          <Text style={[styles.errorDetails, { color: colors.secondaryText, backgroundColor: colors.input }]}>
            {errorMessage}
          </Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    margin: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 100,
  },
  fullScreenContainer: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  errorCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#343a40',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorDetails: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 16,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
    width: '100%',
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ErrorBoundary;
