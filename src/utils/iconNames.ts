/**
 * Icon-name string unions for the `@react-native-vector-icons/*` sets we use.
 *
 * Replaces the old `keyof typeof Ionicons.glyphMap` pattern from
 * `@expo/vector-icons`, which no longer compiles under the new package
 * because the static glyphMap field isn't part of the component type.
 *
 * Type-only imports — no runtime weight from importing icon fonts into
 * services or other non-UI modules.
 */

import type { ComponentProps } from 'react';
import type Ionicons from '@react-native-vector-icons/ionicons/static';
import type MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons/static';

export type IoniconsName = ComponentProps<typeof Ionicons>['name'];
export type MaterialCommunityIconsName = ComponentProps<typeof MaterialCommunityIcons>['name'];
