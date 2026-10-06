/**
 * App-wide React error boundary. Without one, a single render throw anywhere
 * in the tree (a malformed cached envelope, a null deref in a Row, a
 * non-conformant server's Child) unwinds to the root and leaves a permanent
 * black screen — force-quit the only recovery. This catches post-mount render
 * throws and shows a recovery UI instead.
 *
 * Deliberately self-contained: hard-coded English copy and `colors` passed as a
 * prop (not read from context) so the fallback still renders even if i18n or the
 * theme provider is what crashed.
 */
import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type ThemeColors } from '../constants/theme';

interface Props {
  colors: ThemeColors;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // console.* is stripped in release builds, but this surfaces the crash in
    // dev and during on-device debugging with a connected Metro.
    // eslint-disable-next-line no-console
    console.error('[RootErrorBoundary] render crash:', error, info?.componentStack ?? '');
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { colors, children } = this.props;
    if (!error) return children;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Something went wrong
        </Text>
        <Text
          style={[styles.message, { color: colors.textSecondary }]}
          numberOfLines={5}
        >
          {error.message || 'An unexpected error occurred.'}
        </Text>
        <Pressable
          onPress={this.handleRetry}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>Try again</Text>
        </Pressable>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          If this keeps happening, fully close and reopen the app.
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
  },
});
