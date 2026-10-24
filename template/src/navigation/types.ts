// Route contract (C12). Route names and params are fixed; navigators are built in WS3 task 3.9.

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Otp: { target: string; purpose: 'register' | 'reset-password' };
};

export type HomeStackParamList = {
  Home: undefined;
  // @tempo-feature:samples:start
  ItemsList: undefined;
  ItemDetails: { itemId: number };
  ItemCreate: undefined;
  // @tempo-feature:samples:end
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
  Language: undefined;
  Theme: undefined;
  About: undefined;
};

export type MainTabsParamList = {
  HomeTab: undefined;
  ProfileTab: undefined;
  SettingsTab: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  ForceUpdate: undefined;
  Maintenance: undefined;
  NotFound: undefined;
  // Non-prod only.
  DebugMenu: undefined;
};
