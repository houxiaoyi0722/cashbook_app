import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Icon, Button } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/types';
import { useTheme, getColors } from '../context/ThemeContext';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface OfflineModeOverlayProps {
  title: string;
  description: string;
}

const OfflineModeOverlay: React.FC<OfflineModeOverlayProps> = ({ title, description }) => {
  const navigation = useNavigation<NavigationProp>();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { backgroundColor: colors.card }]}>
        <Icon
          name="offline-bolt"
          type="material"
          color={colors.primary}
          size={48}
          containerStyle={styles.icon}
        />
        <Text style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.description, { color: colors.secondaryText }]}>
          {description}
        </Text>
        <Text style={[styles.suggestion, { color: colors.secondaryText }]}>
          离线模式下只支持添加流水记录，其他功能暂时不可用。
        </Text>
        <Button
          title="去添加流水"
          icon={<Icon name="add" type="material" color="white" size={20} />}
          buttonStyle={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('FlowForm', {})}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    maxWidth: 300,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
  },
  suggestion: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  outlineButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
  },
});

export default OfflineModeOverlay;
