import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Icon } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/types';
import {useBookkeeping} from '../context/BookkeepingContext.tsx';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const BookSelector: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { currentBook} = useBookkeeping();

  const handleSelectBook = () => {
    navigation.navigate('BookList');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.selector}
        onPress={handleSelectBook}
      >
        <Text style={styles.bookName} numberOfLines={1}>
          {currentBook ? currentBook.bookName : '选择账本'}
        </Text>
        <Icon
          name="keyboard-arrow-down"
          type="material"
          size={24}
          color="#1976d2"
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
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
    color: '#1976d2',
    marginRight: 5,
  },
});

export default BookSelector;
