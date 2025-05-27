import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Icon } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/types';
import {useBookkeeping} from '../context/BookkeepingContext.tsx';
import { useTheme, getColors } from '../context/ThemeContext';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const BookSelector: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { currentBook } = useBookkeeping();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const handleSelectBook = () => {
    navigation.navigate('BookList');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.selector}
        onPress={handleSelectBook}
      >
        <Text style={[styles.bookName, { color: colors.primary }]} numberOfLines={1}>
          {currentBook ? currentBook.bookName : '选择账本'}
        </Text>
        <Icon
          name="keyboard-arrow-down"
          type="material"
          size={24}
          color={colors.primary}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
  },
  selector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  bookName: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 5,
  },
});

export default BookSelector;
