import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

/**
 * 日志服务 - 自定义实现，提供简单的日志记录接口
 */
export class LogService {
  private static instance: LogService;
  private isInitialized: boolean = false;
  private logDirectory: string;
  private originalConsole: any = {};
  private readonly MAX_LOG_DAYS: number = 7; // 日志保留天数
  private readonly MAX_FILE_SIZE: number = 1024 * 1024; // 最大文件大小 (1MB)

  private constructor() {
    // 保存原始console方法引用
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    // 设置日志目录路径 - 使用应用私有目录确保有写入权限
    this.logDirectory = Platform.OS === 'android'
      ? `${RNFS.ExternalDirectoryPath}/logs`
      : `${RNFS.DocumentDirectoryPath}/logs`;
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
   * 初始化日志服务
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 确保日志目录存在
      await this.ensureLogDirectoryExists();

      // 清理过期日志
      await this.cleanupOldLogs();

      // 重写控制台方法以捕获日志
      this.setupConsoleCapture();

      // 写入初始化成功日志
      await this.info('LogService', '日志服务初始化成功');
      this.originalConsole.log('日志服务初始化成功');

      this.isInitialized = true;
    } catch (error) {
      this.originalConsole.error('LogService 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogDirectoryExists(): Promise<void> {
    try {
      const exists = await RNFS.exists(this.logDirectory);
      if (!exists) {
        await RNFS.mkdir(this.logDirectory);
        this.originalConsole.log('日志目录已创建:', this.logDirectory);
      }
    } catch (error) {
      this.originalConsole.error('创建日志目录失败:', error);
      throw error;
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
      self.captureConsoleOutput('log', args);
    };

    // 重写 console.info
    console.info = function(...args: any[]) {
      self.originalConsole.info.apply(console, args);
      self.captureConsoleOutput('info', args);
    };

    // 重写 console.warn
    console.warn = function(...args: any[]) {
      self.originalConsole.warn.apply(console, args);
      self.captureConsoleOutput('warn', args);
    };

    // 重写 console.error
    console.error = function(...args: any[]) {
      self.originalConsole.error.apply(console, args);
      self.captureConsoleOutput('error', args);
    };

    // 重写 console.debug
    console.debug = function(...args: any[]) {
      self.originalConsole.debug.apply(console, args);
      self.captureConsoleOutput('debug', args);
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

      // 将控制台级别映射到日志级别
      let logLevel = level.toUpperCase();
      if (level === 'log') {
        logLevel = 'INFO'; // console.log 映射到 INFO 级别
      }

      // 写入日志文件
      this.writeLogToFile(logLevel, 'Console', message)
        .catch(err => this.originalConsole.error('写入控制台日志失败:', err));
    } catch (error) {
      // 使用原始console避免递归
      this.originalConsole.error('处理控制台输出失败:', error);
    }
  }

  /**
   * 清理过期日志
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const files = await RNFS.readDir(this.logDirectory);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - this.MAX_LOG_DAYS * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.log')) {
          try {
            const stat = await RNFS.stat(file.path);
            const fileDate = new Date(stat.mtime);

            // 如果文件修改时间早于截止日期，删除它
            if (fileDate < cutoffDate) {
              await RNFS.unlink(file.path);
              this.originalConsole.log(`已删除过期日志文件: ${file.name}`);
            }
          } catch (statError) {
            this.originalConsole.error(`获取文件状态失败: ${file.name}`, statError);
          }
        }
      }
    } catch (error) {
      this.originalConsole.error('清理过期日志失败:', error);
    }
  }

  /**
   * 记录调试日志
   * @param tag 日志标签
   * @param message 日志信息
   */
  public async debug(tag: string, message: string | object): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      await this.writeLogToFile('DEBUG', tag, message);
    } catch (error) {
      this.originalConsole.error('记录调试日志失败:', error);
    }
  }

  /**
   * 记录信息日志
   * @param tag 日志标签
   * @param message 日志信息
   */
  public async info(tag: string, message: string | object): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      await this.writeLogToFile('INFO', tag, message);
    } catch (error) {
      this.originalConsole.error('记录信息日志失败:', error);
    }
  }

  /**
   * 记录警告日志
   * @param tag 日志标签
   * @param message 日志信息
   */
  public async warn(tag: string, message: string | object): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      await this.writeLogToFile('WARN', tag, message);
    } catch (error) {
      this.originalConsole.error('记录警告日志失败:', error);
    }
  }

  /**
   * 记录错误日志
   * @param tag 日志标签
   * @param message 日志信息
   * @param error 错误对象
   */
  public async error(tag: string, message: string, error?: any): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      await this.writeLogToFile('ERROR', tag, message, error);
    } catch (logError) {
      this.originalConsole.error('记录错误日志失败:', logError);
    }
  }

  /**
   * 直接将日志写入文件
   * @param level 日志级别
   * @param tag 日志标签
   * @param message 日志信息
   * @param error 可选的错误对象
   */
  private async writeLogToFile(
    level: string,
    tag: string,
    message: string | object,
    error?: any
  ): Promise<void> {
    try {
      // 确保日志目录存在
      await this.ensureLogDirectoryExists();

      // 格式化日期作为文件名
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
      
      // 格式化日志内容
      let logContent = `[${dateStr} ${timeStr}] [${level}] `;
      logContent += this.formatMessage(tag, message);

      if (error) {
        logContent += ` | Error: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
        if (error instanceof Error && error.stack) {
          logContent += ` | Stack: ${error.stack}`;
        }
      }

      logContent += '\n';

      // 获取当前日期的日志文件
      const baseFileName = `app-${dateStr}`;
      const files = await RNFS.readDir(this.logDirectory);
      const todayLogFiles = files.filter(file => 
        file.isFile() && 
        file.name.startsWith(baseFileName) && 
        file.name.endsWith('.log')
      );

      // 按照文件名排序（包含序号的文件名）
      todayLogFiles.sort((a, b) => a.name.localeCompare(b.name));

      let targetFilePath: string;
      
      // 如果没有当天的日志文件，创建第一个
      if (todayLogFiles.length === 0) {
        targetFilePath = `${this.logDirectory}/${baseFileName}.log`;
      } else {
        // 检查最新的日志文件大小
        const latestFile = todayLogFiles[todayLogFiles.length - 1];
        
        // 如果文件大小接近或超过1MB，创建新文件
        if (latestFile.size >= this.MAX_FILE_SIZE) {
          // 创建新的文件名，格式为 app-YYYY-MM-DD-n.log，其中n是序号
          const fileIndex = todayLogFiles.length;
          targetFilePath = `${this.logDirectory}/${baseFileName}-${fileIndex}.log`;
        } else {
          // 使用现有文件
          targetFilePath = latestFile.path;
        }
      }

      // 检查文件是否存在
      const fileExists = await RNFS.exists(targetFilePath);

      if (fileExists) {
        // 追加到现有文件
        await RNFS.appendFile(targetFilePath, logContent, 'utf8');
      } else {
        // 创建新文件
        await RNFS.writeFile(targetFilePath, logContent, 'utf8');
      }

      // 检查写入后的文件大小
      if (fileExists) {
        const fileInfo = await RNFS.stat(targetFilePath);
        // 如果写入后文件大小超过限制，创建新文件并将这条日志写入新文件
        if (fileInfo.size > this.MAX_FILE_SIZE) {
          const fileIndex = todayLogFiles.length;
          const newFilePath = `${this.logDirectory}/${baseFileName}-${fileIndex}.log`;
          await RNFS.writeFile(newFilePath, logContent, 'utf8');
        }
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
      if (!this.isInitialized) {
        await this.initialize();
      }

      // 确保日志目录存在
      await this.ensureLogDirectoryExists();

      // 直接从文件系统读取日志文件
      const files = await RNFS.readDir(this.logDirectory);
      return files.filter(file => file.isFile() && file.name.endsWith('.log')).map(file => file.path);
    } catch (error) {
      this.originalConsole.error('获取日志文件路径失败:', error);
      return [];
    }
  }

  /**
   * 删除所有日志文件
   */
  public async deleteAllLogs(): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // 手动删除日志文件
      const files = await RNFS.readDir(this.logDirectory);
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.log')) {
          await RNFS.unlink(file.path);
        }
      }

      // 写入一条新的日志，确保日志系统继续工作
      await this.info('LogService', '日志已清理');
    } catch (error) {
      this.originalConsole.error('删除日志文件失败:', error);
      throw error;
    }
  }

  /**
   * 确保日志目录存在
   * 此方法为向后兼容保留
   */
  public async ensureLogDirectory(): Promise<boolean> {
    try {
      await this.ensureLogDirectoryExists();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取日志目录路径
   */
  public getLogDirectoryPath(): string {
    return this.logDirectory;
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
