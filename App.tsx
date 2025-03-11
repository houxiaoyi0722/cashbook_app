/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@rneui/themed';
import AppNavigator from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';
import { BookProvider } from './src/context/BookContext';
import { BookkeepingProvider } from './src/context/BookkeepingContext';

const App = () => {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <BookProvider>
            <BookkeepingProvider>
              <AppNavigator />
            </BookkeepingProvider>
          </BookProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;
