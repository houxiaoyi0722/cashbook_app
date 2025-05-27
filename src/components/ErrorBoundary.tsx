import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { logger } from '../services/LogService';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
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
    console.log(111)
    // 更新 state，下次渲染时使用备用 UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.log(222)
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
    console.log(444)
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    console.log(333,this.state.hasError)
    if (this.state.hasError) {
      // 自定义备用 UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // 默认错误 UI
      return (
        <View style={styles.container}>
          <Text style={styles.title}>哎呀，出错了</Text>
          <Text style={styles.message}>
            抱歉，这部分内容加载失败。请报告此问题。
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#343a40',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ErrorBoundary;
