import { DarkTheme, DefaultTheme } from '@react-navigation/native';

export const palette = {
  ink: '#17211B', muted: '#66736B', paper: '#F5F7F2', card: '#FFFFFF',
  green: '#216A4A', greenSoft: '#DDF1E5', amber: '#F4B942', danger: '#B53A3A', line: '#DDE4DC',
};
export const dark = {
  ink: '#F2F6F2', muted: '#9EAAA2', paper: '#111713', card: '#1A231D',
  green: '#68D49B', greenSoft: '#1E3A2B', amber: '#F4B942', danger: '#FF8888', line: '#344039',
};
export const navTheme = (isDark: boolean) => ({
  ...(isDark ? DarkTheme : DefaultTheme),
  colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, primary: isDark ? dark.green : palette.green, background: isDark ? dark.paper : palette.paper, card: isDark ? dark.card : palette.card, text: isDark ? dark.ink : palette.ink, border: isDark ? dark.line : palette.line },
});
