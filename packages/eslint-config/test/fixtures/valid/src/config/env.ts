import Config from 'react-native-config';

export const API_URL: string = Config.API_URL ?? '';
export const isDev = API_URL.includes('dev');
