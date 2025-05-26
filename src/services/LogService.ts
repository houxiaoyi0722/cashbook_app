import { FileLogger, LogLevel } from 'react-native-file-logger';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

/**
 * 日志服务 - 封装 FileLogger 功能，提供简单的日志记录接口
 */
export class LogService {
  private static instance: LogService;
  private isInitialized: boolean = false;
  private logDirectoryPath: string = '';
  private originalConsole: any = {};

  private constructor() {
    // 设置日志目录路径
    this.logDirectoryPath = Platform.OS === 'android'
      ? `${RNFS.ExternalDirectoryPath}/cashbook_logs`
      : `${RNFS.DocumentDirectoryPath}/cashbook_logs`;

    // 保存原始console方法引用
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
  }

  /**
   * 获取日志服务单例
   */
  public static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * 获取日志目录路径
   */
  public getLogDirectoryPath(): string {
    return this.logDirectoryPath;
  }

  /**
   * 确保日志目录存在
   */
  public async ensureLogDirectory(): Promise<boolean> {
    try {
      const exists = await RNFS.exists(this.logDirectoryPath);
      if (!exists) {
        await RNFS.mkdir(this.logDirectoryPath);
        console.log('日志目录已创建:', this.logDirectoryPath);
      }
      return true;
    } catch (error) {
      console.error('创建日志目录失败:', error);
      return false;
    }
  }

  /**
   * 重写控制台方法以捕获日志
   */
  private setupConsoleCapture(): void {
    const self = this;

    // 重写 console.log
    console.log = function(...args: any[]) {
      self.originalConsole.log.apply(console, args);
      self.captureConsoleOutput('LOG', args);
    };

    // 重写 console.info
    console.info = function(...args: any[]) {
      self.originalConsole.info.apply(console, args);
      self.captureConsoleOutput('INFO', args);
    };

    // 重写 console.warn
    console.warn = function(...args: any[]) {
      self.originalConsole.warn.apply(console, args);
      self.captureConsoleOutput('WARN', args);
    };

    // 重写 console.error
    console.error = function(...args: any[]) {
      self.originalConsole.error.apply(console, args);
      self.captureConsoleOutput('ERROR', args);
    };

    // 重写 console.debug
    console.debug = function(...args: any[]) {
      self.originalConsole.debug.apply(console, args);
      self.captureConsoleOutput('DEBUG', args);
    };
  }

  /**
   * 捕获控制台输出并写入日志
   */
  private captureConsoleOutput(level: string, args: any[]): void {
    try {
      // 将参数转换为字符串
      const message = args.map(arg => {
        if (typeof arg === 'string') {
          return arg;
        } else if (arg instanceof Error) {
          return `${arg.message} ${arg.stack || ''}`;
        } else {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
      }).join(' ');

      // 异步写入日志文件
      this.writeLogToFile(
        level === 'LOG' ? 'INFO' : level as any,
        'Console',
        message
      ).catch(err => {
        // 使用原始console避免递归
        this.originalConsole.error('写入控制台日志失败:', err);
      });
    } catch (error) {
      // 使用原始console避免递归
      this.originalConsole.error('处理控制台输出失败:', error);
    }
  }

  /**
   * 初始化日志服务
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 确保日志目录存在
      await this.ensureLogDirectory();

      // 配置 FileLogger
      try {
        await FileLogger.configure({
          captureConsole: true,           // 捕获所有控制台输出
          dailyRolling: true,             // 每天创建新日志文件
          maximumFileSize: 1024 * 1024,   // 1MB
          maximumNumberOfFiles: 7,        // 保留7天的日志
          logLevel: LogLevel.Debug,       // 日志级别
          logsDirectory: 'cashbook_logs', // 日志存储目录名
        });
      } catch (configError) {
        console.warn('FileLogger 配置失败:', configError);
      }

      // 设置控制台捕获
      this.setupConsoleCapture();

      this.isInitialized = true;

      // 使用直接写入方式记录初始化成功日志
      await this.writeLogToFile('INFO', 'LogService', '日志服务初始化成功');
    } catch (error) {
      console.error('LogService 初始化失败:', error);
    }
  }

  /**
   * 记录调试日志
   * @param tag 日志标签
   * @param message 日志信息
   */
  public async debug(tag: string, message: string | object): Promise<void> {
    const formattedMessage = this.formatMessage(tag, message);
    try {
      FileLogger.debug(formattedMessage);
    } catch (error) {
      console.warn('FileLogger.debug 失败:', error);
    }

    // 使用自定义方法直接写入日志文件
    await this.writeLogToFile('DEBUG', tag, message);
  }

  /**
   * 记录信息日志
   * @param tag 日志标签
   * @param message 日志信息
   */
  public async info(tag: string, message: string | object): Promise<void> {
    const formattedMessage = this.formatMessage(tag, message);
    try {
      FileLogger.info(formattedMessage);
    } catch (error) {
      console.warn('FileLogger.info 失败:', error);
    }

    // 使用自定义方法直接写入日志文件
    await this.writeLogToFile('INFO', tag, message);
  }

  /**
   * 记录警告日志
   * @param tag 日志标签
   * @param message 日志信息
   */
  public async warn(tag: string, message: string | object): Promise<void> {
    const formattedMessage = this.formatMessage(tag, message);
    try {
      FileLogger.warn(formattedMessage);
    } catch (error) {
      console.warn('FileLogger.warn 失败:', error);
    }

    // 使用自定义方法直接写入日志文件
    await this.writeLogToFile('WARN', tag, message);
  }

  /**
   * 记录错误日志
   * @param tag 日志标签
   * @param message 日志信息
   * @param error 错误对象
   */
  public async error(tag: string, message: string, error?: any): Promise<void> {
    let formattedMessage = this.formatMessage(tag, message);

    if (error) {
      formattedMessage += ` | Error: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
      if (error instanceof Error && error.stack) {
        formattedMessage += ` | Stack: ${error.stack}`;
      }
    }

    try {
      FileLogger.error(formattedMessage);
    } catch (logError) {
      console.warn('FileLogger.error 失败:', logError);
    }

    // 使用自定义方法直接写入日志文件
    await this.writeLogToFile('ERROR', tag, message, error);
  }

  /**
   * 直接将日志写入文件
   * @param level 日志级别
   * @param tag 日志标签
   * @param message 日志信息
   * @param error 可选的错误对象
   */
  private async writeLogToFile(
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    tag: string,
    message: string | object,
    error?: any
  ): Promise<void> {
    try {
      // 确保日志目录存在
      const dirExists = await this.ensureLogDirectory();
      if (!dirExists) {
        console.error('日志目录不存在，无法写入日志');
        return;
      }

      // 格式化日期作为文件名
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
      const fileName = `app-log-${dateStr}.txt`;
      const filePath = `${this.logDirectoryPath}/${fileName}`;

      // 格式化日志内容
      let logContent = `[${level}] [${dateStr} ${timeStr}] `;
      logContent += this.formatMessage(tag, message);

      if (error) {
        logContent += ` | Error: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
        if (error instanceof Error && error.stack) {
          logContent += ` | Stack: ${error.stack}`;
        }
      }

      logContent += '\n';

      // 检查文件是否存在
      const fileExists = await RNFS.exists(filePath);

      if (fileExists) {
        // 追加到现有文件
        await RNFS.appendFile(filePath, logContent, 'utf8');
      } else {
        // 创建新文件
        await RNFS.writeFile(filePath, logContent, 'utf8');
      }
    } catch (writeError) {
      // 使用原始console避免递归
      this.originalConsole.error('写入日志文件失败:', writeError);
    }
  }

  /**
   * 格式化日志消息
   * @param tag 日志标签
   * @param message 日志信息
   * @returns 格式化后的消息
   */
  private formatMessage(tag: string, message: string | object): string {
    const messageStr = typeof message === 'string'
      ? message
      : JSON.stringify(message, null, 2);

    return `[${tag}] ${messageStr}`;
  }

  /**
   * 获取所有日志文件路径
   * @returns 日志文件路径数组
   */
  public async getLogFilePaths(): Promise<string[]> {
    try {
      // 尝试使用 FileLogger 获取路径
      const paths = await FileLogger.getLogFilePaths();
      return paths;
    } catch (error) {
      console.warn('FileLogger.getLogFilePaths 失败，使用自定义方法:', error);

      // 回退到自定义方法
      return await this.getLogFilesFromFS();
    }
  }

  /**
   * 从文件系统直接获取日志文件
   */
  public async getLogFilesFromFS(): Promise<string[]> {
    try {
      const dirExists = await RNFS.exists(this.logDirectoryPath);
      if (!dirExists) {
        return [];
      }

      const files = await RNFS.readDir(this.logDirectoryPath);
      return files.filter(file => file.isFile()).map(file => file.path);
    } catch (error) {
      console.error('从文件系统获取日志文件失败:', error);
      return [];
    }
  }

  /**
   * 删除所有日志文件
   */
  public async deleteAllLogs(): Promise<void> {
    try {
      // 尝试使用 FileLogger API
      await FileLogger.deleteLogFiles();
    } catch (error) {
      console.warn('FileLogger.deleteLogFiles 失败，使用自定义方法:', error);
    }

    // 无论上面是否成功，都尝试手动删除
    try {
      const dirExists = await RNFS.exists(this.logDirectoryPath);
      if (dirExists) {
        const files = await RNFS.readDir(this.logDirectoryPath);
        for (const file of files) {
          if (file.isFile()) {
            await RNFS.unlink(file.path);
          }
        }
      }
    } catch (deleteError) {
      console.error('手动删除日志文件失败:', deleteError);
      throw deleteError;
    }
  }

  /**
   * 通过邮件发送日志文件
   * @param options 邮件选项
   */
  public async sendLogsByEmail(options: {
    to?: string;
    subject?: string;
    body?: string;
    compress?: boolean;
  } = {}): Promise<void> {
    const defaultOptions = {
      to: '',
      subject: 'Cashbook App 日志文件',
      body: '请在此邮件中查看应用日志文件，用于故障排查。',
      compress: true,
    };

    try {
      return await FileLogger.sendLogFilesByEmail({
        ...defaultOptions,
        ...options,
      });
    } catch (error) {
      console.error('发送日志邮件失败:', error);
      throw error;
    }
  }

  /**
   * 恢复原始控制台
   */
  public restoreConsole(): void {
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
  }
}

// 导出单例实例
export const logger = LogService.getInstance();
