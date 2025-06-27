import React, {useEffect, useState} from 'react';
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


type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout } = useAuth();
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

  // 监听全局加载事件
  useEffect(() => {
    fetchServerConfig();
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
        <Icon name="lock" type="material" color={colors.primary} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>修改密码</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron color={colors.secondaryText} />
      </ListItem>

      <ListItem 
        onPress={handleSwitchServer} 
        bottomDivider 
        key="switch-server"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon name="swap-horiz" type="material" color={colors.primary} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>切换服务器</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron color={colors.secondaryText} />
      </ListItem>

      <ListItem
        onPress={() => navigation.navigate('Logs')}
        bottomDivider
        key="logs"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon name="description" type="material" color={colors.primary} />
        <ListItem.Content>
          <ListItem.Title style={{color: colors.text}}>日志管理</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron color={colors.secondaryText} />
      </ListItem>

      <ListItem 
        bottomDivider 
        key="dark-mode"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon name={isDarkMode ? "nightlight" : "wb-sunny"} type="material" color={colors.primary} />
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
        onPress={handleLogout} 
        key="logout"
        containerStyle={{backgroundColor: colors.card}}
      >
        <Icon name="logout" type="material" color={colors.error} />
        <ListItem.Content>
          <ListItem.Title style={{ color: colors.error }}>退出登录</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron color={colors.secondaryText} />
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
        <Icon name="info" type="material" color={colors.primary} />
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
        <Icon name="code" type="material" color={colors.primary} />
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
        <Icon name="dns" type="material" color={colors.primary} />
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
        <Icon name="system-update" type="material" color={colors.primary} />
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
        leftIcon={{ type: 'material', name: 'lock', color: colors.icon }}
        rightIcon={{
          type: 'material',
          name: oldPasswordVisible ? 'visibility' : 'visibility-off',
          onPress: () => setOldPasswordVisible(!oldPasswordVisible),
          color: colors.hint,
        }}
        value={oldPassword}
        onChangeText={setOldPassword}
        disabled={isLoading}
        inputStyle={[{color: colors.inputText}, { paddingVertical: 0 }]}
        placeholderTextColor={colors.hint}
      />

      <Input
        placeholder="新密码"
        secureTextEntry={!newPasswordVisible}
        leftIcon={{ type: 'material', name: 'lock-outline', color: colors.icon }}
        rightIcon={{
          type: 'material',
          name: newPasswordVisible ? 'visibility' : 'visibility-off',
          onPress: () => setNewPasswordVisible(!newPasswordVisible),
          color: colors.hint,
        }}
        value={newPassword}
        onChangeText={setNewPassword}
        disabled={isLoading}
        inputStyle={[{color: colors.inputText}, { paddingVertical: 0 }]}
        placeholderTextColor={colors.hint}
      />

      <Input
        placeholder="确认新密码"
        secureTextEntry={!confirmPasswordVisible}
        leftIcon={{ type: 'material', name: 'lock-outline', color: colors.icon }}
        rightIcon={{
          type: 'material',
          name: confirmPasswordVisible ? 'visibility' : 'visibility-off',
          onPress: () => setConfirmPasswordVisible(!confirmPasswordVisible),
          color: colors.hint,
        }}
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
