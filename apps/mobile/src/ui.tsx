import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { TOUCH, useTheme } from "./theme";

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.bg }}>{children}</View>;
}

export function Title({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 | 3 }) {
  const t = useTheme();
  const size = level === 1 ? 26 : level === 2 ? 20 : 17;
  return (
    <Text accessibilityRole="header" style={{ color: t.text, fontSize: size, fontWeight: "700", fontFamily: "serif", marginVertical: 6 }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const t = useTheme();
  return <Text style={[{ color: muted ? t.muted : t.text, fontSize: 16, lineHeight: 22 }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 6 }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = "secondary",
  disabled,
  loading,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "accent";
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.brand : variant === "danger" ? t.danger : variant === "accent" ? t.lantern : t.surface;
  const fg = variant === "primary" ? t.brandText : variant === "danger" ? "#ffffff" : variant === "accent" ? "#1d1b16" : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: TOUCH, minWidth: TOUCH, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: bg, borderWidth: 1, borderColor: variant === "secondary" ? t.border : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1, flexDirection: "row", gap: 6 },
        style,
      ]}
    >
      {loading && <ActivityIndicator color={fg} />}
      <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ marginVertical: 6 }}>
      <Text style={{ color: t.text, fontWeight: "600", marginBottom: 4 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...props}
        style={{ minHeight: TOUCH, borderWidth: 1, borderColor: error ? t.danger : t.border, borderRadius: 10, paddingHorizontal: 12, color: t.text, backgroundColor: t.surface, fontSize: 16 }}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: t.danger, marginTop: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Selectable row used for radio lists and checkbox lists. */
export function OptionRow({ label, description, selected, onPress, multiple, disabled }: { label: string; description?: string; selected: boolean; onPress: () => void; multiple?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: TOUCH, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: selected ? 2 : 1, borderColor: selected ? t.brand : t.line, backgroundColor: t.surface, marginVertical: 3, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 22, height: 22, borderRadius: multiple ? 4 : 11, borderWidth: 2, borderColor: selected ? t.brand : t.border, alignItems: "center", justifyContent: "center" }}>
        {selected && <View style={{ width: 12, height: 12, borderRadius: multiple ? 2 : 6, backgroundColor: t.brand }} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{label}</Text>
        {description ? <Text style={{ color: t.muted, fontSize: 14 }}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "danger" }) {
  const t = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ borderLeftWidth: 4, borderLeftColor: tone === "danger" ? t.danger : t.accent, backgroundColor: t.surface2, padding: 10, borderRadius: 8, marginVertical: 6 }}>
      <Text style={{ color: t.text, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={styles.center} accessibilityLabel="Loading" accessible>
      <ActivityIndicator size="large" color={t.text} />
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 90, backgroundColor: t.surface2, borderRadius: 10, padding: 8, alignItems: "center", margin: 3 }}>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 } });
