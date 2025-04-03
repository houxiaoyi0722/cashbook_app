import { Alert, Linking } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import axios from 'axios';
import { eventBus } from '../navigation';

// 获取当前应用版本
const getCurrentVersion = async (): Promise<string> => {
  return DeviceInfo.getVersion();
};

// 从GitHub获取最新版本
const getLatestVersion = async (): Promise<{ version: string; url: string }> => {
  try {
    const response = await axios.get(
      'https://api.github.com/repos/houxiaoyi0722/cashbook_app/releases/latest'
    );

    // 版本号格式通常为 v1.0.0，我们需要去掉前缀 'v'
    const latestVersion = response.data.tag_name.replace('v', '');
    const downloadUrl = 'https://github.com/houxiaoyi0722/cashbook_app/releases/latest';

    return { version: latestVersion, url: downloadUrl };
  } catch (error) {
    console.error('获取最新版本失败:', error);
    throw error;
  }
};

// 比较版本号
const compareVersions = (currentVersion: string, latestVersion: string): boolean => {
  const current = currentVersion.split('.').map(Number);
  const latest = latestVersion.split('.').map(Number);

  for (let i = 0; i < Math.max(current.length, latest.length); i++) {
    const currentPart = current[i] || 0;
    const latestPart = latest[i] || 0;

    if (currentPart < latestPart) {
      return true; // 有新版本
    } else if (currentPart > latestPart) {
      return false; // 当前版本更新
    }
  }

  return false; // 版本相同
};

// 检查更新
export const checkForUpdates = async (): Promise<void> => {
  try {
    // 显示加载提示
    eventBus.emit('showLoading', '检查更新中...');

    const currentVersion = await getCurrentVersion();
    const { version: latestVersion, url } = await getLatestVersion();

    // 隐藏加载提示
    eventBus.emit('hideLoading');

    if (compareVersions(currentVersion, latestVersion)) {
      Alert.alert(
        '发现新版本',
        `当前版本: ${currentVersion}\n最新版本: ${latestVersion}\n是否前往下载?`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '更新',
            onPress: () => Linking.openURL(url),
          },
        ]
      );
    } else {
      Alert.alert(
        '版本更新',
        '当前已是最新版本',
        [
          { text: '确定', style: 'cancel' },
        ]
      );
    }
  } catch (error) {
    // 出错时也要隐藏加载提示
    eventBus.emit('hideLoading');
    console.error('检查更新失败:', error);
    Alert.alert(
      '检查更新失败',
      '无法获取最新版本信息，请检查网络连接后重试。',
      [{ text: '确定', style: 'cancel' }]
    );
  }
};

export default {
  checkForUpdates
};
