import React, {useEffect, useState, useCallback} from 'react';
import {ActivityIndicator, Alert, ScrollView, StyleSheet, View} from 'react-native';
import {Card, Dialog, Icon, Input, ListItem, Overlay, Switch, Text} from '@rneui/themed';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAuth} from '../../context/AuthContext';
import {MainStackParamList} from '../../navigation/types';
import {version} from '../../../package.json';
import updateService from '../../services/updateService';
import api from '../../services/api.ts';
import {eventBus} from '../../navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme, getColors} from '../../context/ThemeContext';
import AIConfigIcon from '../../components/icons/AIConfigIcon';
import { exportAppConfig, importAppConfig } from '../../services/ExportImportService';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
// AIAssistantConfigService 是一个单例实例，直接调用其方法
import AIAssistantConfigService from '../../services/AIAssistantConfigService';


type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout, isOfflineMode, enableOfflineMode, disableOfflineMode } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 添加全局加载状态
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // 添加密码可见性状态
  const [oldPasswordVisible, setOldPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const [serverVersion, setServerVersion] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState<boolean>(false);
  const [isAIAssistantSwitchProcessing, setIsAIAssistantSwitchProcessing] = useState<boolean>(false);

  // 获取服务器配置
  const fetchServerConfig = async () => {
    try {
      const data = await api.config();
      if (data.c === 200 && data.d?.version) {
        setServerVersion(data.d.version);
      }
    } catch (error) {
      console.error('获取服务器配置失败', error);
    }
  };

  // 获取AI助手启用状态
  const fetchAIAssistantEnabled = async () => {
    try {
      // AIAssistantConfigService 是一个单例实例，直接调用其方法
      const enabled = await AIAssistantConfigService.isEnabled();
      setAiAssistantEnabled(enabled);
    } catch (error) {
      console.error('获取AI助手启用状态失败', error);
    }
  };

  // 处理AI助手开关切换
  const handleAIAssistantToggle = async (value: boolean) => {
    // 如果是要启用AI助手，显示确认对话框
    if (value === true) {
      // 设置处理状态为true，防止开关视觉上移动
      setIsAIAssistantSwitchProcessing(true);
      Alert.alert(
        '启用AI助手',
        '启用AI助手功能可能会带来以下风险：\n\n' +
        '1. AI助手需要访问您的账本数据以提供智能建议\n' +
        '2. 部分数据可能会被发送到外部AI服务进行处理\n' +
        '3. 请确保您已备份重要数据\n\n' +
        '强烈建议您在启用前，自行备份数据，或导出账本数据到安全位置 且定期备份数据。\n\n' +
        '启用AI助手功能即表示您了解相关风险，并自行承担可能产生的后果。',
        [
          {
            text: '取消',
            style: 'cancel',
            onPress: () => {
              // 用户取消，重置处理状态，不更新aiAssistantEnabled
              setIsAIAssistantSwitchProcessing(false);
            },
          },
          {
            text: '确定',
            onPress: async () => {
              try {
                // AIAssistantConfigService 是一个单例实例，直接调用其方法
                await AIAssistantConfigService.setEnabled(true);
                setAiAssistantEnabled(true);
              } catch (error) {
                console.error('设置AI助手启用状态失败', error);
                Alert.alert('错误', '无法更新AI助手设置');
                // 恢复之前的状态
                const currentState = await AIAssistantConfigService.isEnabled();
                setAiAssistantEnabled(currentState);
              } finally {
                // 无论成功与否，都重置处理状态
                setIsAIAssistantSwitchProcessing(false);
              }
            },
          },
        ],
        { cancelable: true }
      );
    } else {
      // 如果是禁用AI助手，直接执行
      try {
        // AIAssistantConfigService 是一个单例实例，直接调用其方法
        await AIAssistantConfigService.setEnabled(false);
        setAiAssistantEnabled(false);
      } catch (error) {
        console.error('设置AI助手启用状态失败', error);
        Alert.alert('错误', '无法更新AI助手设置');
        // 恢复之前的状态
        const currentState = await AIAssistantConfigService.isEnabled();
        setAiAssistantEnabled(currentState);
      }
    }
  };

  // 监听全局加载事件
  useEffect(() => {
    fetchServerConfig();
    fetchAIAssistantEnabled();
    const showLoadingListener = eventBus.addListener('showLoading', (message: string = '加载中...') => {
      setLoadingMessage(message);
      setIsGlobalLoading(true);
    });

    const hideLoadingListener = eventBus.addListener('hideLoading', () => {
      setIsGlobalLoading(false);
    });

    return () => {
      showLoadingListener.remove();
      hideLoadingListener.remove();
    };
  }, []);

  // 处理退出登录
  const handleLogout = async () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '确定',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'ServerList' }],
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 处理切换服务器
  const handleSwitchServer = () => {
    navigation.navigate('ServerList');
  };

  // 处理修改密码
  const handleChangePassword = async () => {
    if (!validatePasswordForm()) {return;}

    try {
      setIsLoading(true);
      // 调用修改密码API
      const response = await api.changePassword(oldPassword, newPassword);

      if (response.c === 200) {
        Alert.alert('成功', '密码修改成功');
        setIsChangePasswordVisible(false);
        resetPasswordForm();
      } else {
        Alert.alert('错误', response.m || '密码修改失败');
      }
    } catch (error) {
      console.error('修改密码失败', error);
      Alert.alert('错误', '修改密码失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 验证密码表单
  const validatePasswordForm = () => {
    if (!oldPassword) {
      Alert.alert('错误', '请输入原密码');
      return false;
    }

    if (!newPassword) {
      Alert.alert('错误', '请输入新密码');
      return false;
    }

    if (newPassword.length < 6) {
      Alert.alert('错误', '新密码长度不能少于6位');
      return false;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('错误', '两次输入的新密码不一致');
      return false;
    }

    return true;
  };

  // 重置密码表单
  const resetPasswordForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  // 处理离线模式切换
  const handleOfflineModeToggle = useCallback(() => {
    if (isOfflineMode) {
      // 退出离线模式
      Alert.alert(
        '退出离线模式',
        '退出离线模式后将返回服务器选择页面，本地数据将保留。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确定',
            onPress: () => {
              disableOfflineMode();
              navigation.reset({
                index: 0,
                routes: [{ name: 'ServerList' }],
              });
            },
          },
        ]
      );
    } else {
      // 启用离线模式
      Alert.alert(
        '启用离线模式',
        '在离线模式下，您可以创建本地账本并记账，数据将存储在本地。后续可以选择性同步到服务器。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确定',
            onPress: () => {
              enableOfflineMode();
              navigation.reset({
                index: 0,
                routes: [{ name: 'MainTabs' }],
              });
            },
          },
        ]
      );
    }
  }, [isOfflineMode, enableOfflineMode, disableOfflineMode, navigation]);

  // 处理导出配置
  const handleExportConfig = useCallback(async () => {
    Alert.alert(
      '⚠️ 安全风险警告',
      '导出的配置包含以下敏感信息：\n\n' +
      '• 服务器账户密码\n' +
      '• AI API Key\n' +
      '• 其他敏感配置数据\n\n' +
      '请妥善保管导出的文件，避免泄露敏感信息。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续导出',
          onPress: async () => {
            try {
              setIsExporting(true);
              const jsonData = await exportAppConfig();

              const fileName = 'cashbook_config.cashbookapp';
              const filePath = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/${fileName}`
                : `${RNFS.DownloadDirectoryPath}/${fileName}`;

              await RNFS.writeFile(filePath, jsonData, 'utf8');

              Alert.alert('导出成功', `配置已导出到:\n${filePath}`);
            } catch (error) {
              console.error('导出配置失败:', error);
              Alert.alert('导出失败', '导出配置时发生错误');
            } finally {
              setIsExporting(false);
            }
          },
        },
      ]
    );
  }, []);

  // 处理导入配置
  const handleImportConfig = useCallback(async () => {
    try {
      // 使用文档选择器选择.cashbookapp文件
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['application/json', 'text/plain', '*/*'],
      });

      // 检查用户是否取消选择
      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      // 验证文件扩展名
      if (!file?.uri || (!file.uri.endsWith('.cashbookapp') && !file.name?.endsWith('.cashbookapp'))) {
        Alert.alert('错误', '请选择 .cashbookapp 格式的配置文件');
        return;
      }

      // 读取文件内容
      const content = await RNFS.readFile(file.uri, 'utf8');

      if (!content || content.trim() === '') {
        Alert.alert('错误', '文件内容为空');
        return;
      }

      setIsImporting(true);
      const importResult = await importAppConfig(content.trim());

      if (importResult.success) {
        Alert.alert('导入成功', importResult.message);
      } else {
        Alert.alert('导入失败', importResult.message);
      }
    } catch (error) {
      console.error('导入配置失败:', error);
      Alert.alert('导入失败', '导入配置时发生错误');
    } finally {
      setIsImporting(false);
    }
  }, []);

  // 渲染用户信息
  const renderUserInfo = () => (
    <Card containerStyle={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
      <View style={styles.userInfoContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={[styles.userName, {color: colors.text}]}>{userInfo?.name || '未登录'}</Text>
          <Text style={[styles.userEmail, {color: colors.secondaryText}]}>{userInfo?.email || ''}</Text>
        </View>
      </View>
    </Card>
  );

  // 渲染账户设置
  const renderAccountSettings = () => (
    <Card containerStyle={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
      <Card.Title style={{color: colors.text}}>账户设置</Card.Title>

      <ListItem
        onPress={() => setIsChangePasswordVisible(true)}
        bottomDivider
        key="change-password"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'lock', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>修改密码</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      <ListItem
        onPress={handleSwitchServer}
        bottomDivider
        key="switch-server"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'swap-horiz', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>切换服务器</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      {/* 离线模式管理 */}
      <ListItem
        onPress={handleOfflineModeToggle}
        bottomDivider
        key="offline-mode"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon
          {...({ iconProps: { name: isOfflineMode ? 'cloud-off' : 'offline-bolt', type: 'material', color: isOfflineMode ? colors.warning : colors.primary, size: 24 } } as any)}
        />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>
            {isOfflineMode ? '退出离线模式' : '启用离线模式'}
          </ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      {/* 同步管理 - 始终显示 */}
      <ListItem
        onPress={() => navigation.navigate('SyncManagement')}
        bottomDivider
        key="sync-management"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'sync', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>同步管理</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      <ListItem
        onPress={handleLogout}
        key="logout"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'logout', type: 'material', color: colors.error, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{ color: colors.error }}>退出登录</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>
    </Card>
  );

  // 渲染数据管理设置
  const renderDataManagement = () => (
    <Card containerStyle={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
      <Card.Title style={{color: colors.text}}>配置管理</Card.Title>

      <ListItem
        onPress={() => navigation.navigate('Logs')}
        bottomDivider
        key="logs"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'description', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>日志管理</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      <ListItem
        bottomDivider
        key="ai-assistant-feature"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'smart-toy', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>AI助手功能</ListItem.Title>
          <ListItem.Subtitle style={{color: colors.secondaryText}}>
            开启后显示AI助手聊天页面和底部菜单项
          </ListItem.Subtitle>
        </ListItem.Content>
        <Switch
          value={aiAssistantEnabled}
          onValueChange={handleAIAssistantToggle}
          color={colors.primary}
          disabled={isAIAssistantSwitchProcessing}
        />
      </ListItem>

      {/* AI助手配置 - 仅在AI助手启用时显示 */}
      {aiAssistantEnabled && (
        <ListItem
          onPress={() => navigation.navigate('AIConfig')}
          bottomDivider
          key="ai-config"
          containerStyle={{backgroundColor: colors.card}}
        >
          <AIConfigIcon color={colors.primary} size={24} />
          <ListItem.Content>
            <ListItem.Title style={{color: colors.text}}>AI助手配置</ListItem.Title>
            <ListItem.Subtitle style={{color: colors.secondaryText}}>
              配置API密钥、模型等参数
            </ListItem.Subtitle>
          </ListItem.Content>
          <ListItem.Chevron />
        </ListItem>
      )}

      <ListItem
        bottomDivider
        key="dark-mode"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: isDarkMode ? 'nightlight' : 'wb-sunny', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>深色模式</ListItem.Title>
        </ListItem.Content>
        <Switch
          value={isDarkMode}
          onValueChange={toggleDarkMode}
          color={colors.primary}
        />
      </ListItem>


      <ListItem
        onPress={handleExportConfig}
        bottomDivider
        key="export-config"
        disabled={isExporting}
        containerStyle={{backgroundColor: colors.card}}
      >
        <View style={styles.exportItemContainer}>
          <Icon {...({ iconProps: { name: 'file-upload', type: 'material', color: colors.warning, size: 24 } } as any)} />
          <Icon {...({ iconProps: { name: 'alert', type: 'material', color: colors.warning, size: 14, style: styles.warningIcon } } as any)} />
        </View>
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>导出配置</ListItem.Title>
        </ListItem.Content>
        {isExporting && <ActivityIndicator size="small" color={colors.primary} />}
        <ListItem.Chevron />
      </ListItem>

      <ListItem
        onPress={handleImportConfig}
        key="import-config"
        disabled={isImporting}
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'file-download', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>导入配置</ListItem.Title>
        </ListItem.Content>
        {isImporting && <ActivityIndicator size="small" color={colors.primary} />}
        <ListItem.Chevron />
      </ListItem>
    </Card>
  );

  // 渲染关于信息
  const renderAboutInfo = () => (
    <Card containerStyle={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
      <Card.Title style={{color: colors.text}}>关于</Card.Title>

      <ListItem
        bottomDivider
        key="version"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'info', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>版本</ListItem.Title>
          <ListItem.Subtitle style={{color: colors.secondaryText}}>{version || '1.0.0'}</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>

      <ListItem
        key="developer"
        containerStyle={{backgroundColor: colors.card}}
        bottomDivider
      >
        <Icon {...({ iconProps: { name: 'code', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>开发者</ListItem.Title>
          <ListItem.Subtitle style={{color: colors.secondaryText}}>sang</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>

      <ListItem
        key="server-version"
        containerStyle={{backgroundColor: colors.card}}
        bottomDivider
      >
        <Icon {...({ iconProps: { name: 'dns', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>服务器版本</ListItem.Title>
          <ListItem.Subtitle style={{color: colors.secondaryText}}>{serverVersion || '未知'}</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>
      <ListItem
        key="check-update"
        onPress={() => updateService.checkForUpdates()}
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon {...({ iconProps: { name: 'system-update', type: 'material', color: colors.primary, size: 24 } } as any)} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>检查更新</ListItem.Title>
        </ListItem.Content>
      </ListItem>
    </Card>
  );

  // 渲染修改密码对话框
  const renderChangePasswordDialog = () => (
    <Overlay
      isVisible={isChangePasswordVisible}
      onBackdropPress={() => !isLoading && setIsChangePasswordVisible(false)}
      overlayStyle={[styles.dialog, { backgroundColor: colors.dialog }]}
    >
      <Text style={[styles.dialogTitle, { color: colors.text }]}>修改密码</Text>

      <Input
        placeholder="原密码"
        secureTextEntry={!oldPasswordVisible}
        leftIcon={{ iconProps: { type: 'material', name: 'lock', color: colors.icon } }}
        rightIcon={<Icon iconProps={{ type: 'material', name: oldPasswordVisible ? 'visibility' : 'visibility-off', color: colors.hint }} onPress={() => setOldPasswordVisible(!oldPasswordVisible)} />}
        value={oldPassword}
        onChangeText={setOldPassword}
        disabled={isLoading}
        inputStyle={[{color: colors.inputText}, { paddingVertical: 0 }]}
        placeholderTextColor={colors.hint}
      />

      <Input
        placeholder="新密码"
        secureTextEntry={!newPasswordVisible}
        leftIcon={{ iconProps: { type: 'material', name: 'lock-outline', color: colors.icon } }}
        rightIcon={<Icon iconProps={{ type: 'material', name: newPasswordVisible ? 'visibility' : 'visibility-off', color: colors.hint }} onPress={() => setNewPasswordVisible(!newPasswordVisible)} />}
        value={newPassword}
        onChangeText={setNewPassword}
        disabled={isLoading}
        inputStyle={[{color: colors.inputText}, { paddingVertical: 0 }]}
        placeholderTextColor={colors.hint}
      />

      <Input
        placeholder="确认新密码"
        secureTextEntry={!confirmPasswordVisible}
        leftIcon={{ iconProps: { type: 'material', name: 'lock-outline', color: colors.icon } }}
        rightIcon={<Icon iconProps={{ type: 'material', name: confirmPasswordVisible ? 'visibility' : 'visibility-off', color: colors.hint }} onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)} />}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        disabled={isLoading}
        inputStyle={[{color: colors.inputText}, { paddingVertical: 0 }]}
        placeholderTextColor={colors.hint}
      />

      <View style={styles.dialogActions}>
        <Dialog.Button
          title="取消"
          onPress={() => setIsChangePasswordVisible(false)}
          disabled={isLoading}
          titleStyle={{color: colors.primary}}
        />
        <Dialog.Button
          title={isLoading ? '提交中...' : '提交'}
          onPress={handleChangePassword}
          disabled={isLoading}
          titleStyle={{color: colors.primary}}
        />
      </View>
    </Overlay>
  );

  // 渲染全局加载遮罩
  const renderLoadingOverlay = () => (
    <Overlay
      isVisible={isGlobalLoading}
      overlayStyle={[styles.loadingOverlay, {backgroundColor: colors.dialog}]}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, {color: colors.primary}]}>{loadingMessage}</Text>
    </Overlay>
  );

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={[styles.container, {backgroundColor: colors.background}]}>
        <ScrollView>
          {renderUserInfo()}
          {renderAccountSettings()}
          {renderDataManagement()}
          {renderAboutInfo()}
        </ScrollView>

        {renderChangePasswordDialog()}
        {renderLoadingOverlay()}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userDetails: {
    marginLeft: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 14,
    color: '#757575',
  },
  dialog: {
    borderRadius: 10,
    padding: 20,
    width: '90%',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  inputContainer: {
    marginBottom: 10,
  },
  exportItemContainer: {
    position: 'relative',
  },
  warningIcon: {
    position: 'absolute',
    bottom: -2,
    right: -6,
  },
  loadingOverlay: {
    width: 200,
    height: 100,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIndicator: {
    marginBottom: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
});

export default SettingsScreen;
