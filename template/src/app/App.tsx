import { NewAppScreen } from '@react-native/new-app-screen';
import { StatusBar, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const TEMPLATE_FILE_NAME = 'src/app/App.tsx';
const rootStyle = { flex: 1 };

// Temporary root: WS3 (task 3.12) replaces this with providers, navigation and bootstrap.
export function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View style={rootStyle}>
      <NewAppScreen templateFileName={TEMPLATE_FILE_NAME} safeAreaInsets={safeAreaInsets} />
    </View>
  );
}
