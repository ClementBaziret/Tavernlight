import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView } from "react-native";
import { errorText } from "../src/api";
import { useAuth } from "../src/auth";
import { Body, Button, Field, Notice, Screen, Title } from "../src/ui";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Title>Tavernlight</Title>
          <Body muted>Your characters and your dice, compatible with the 5th edition.</Body>
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
          <Button label="Log in" variant="primary" onPress={submit} loading={loading} style={{ marginTop: 8 }} />
          <Notice>Demo: alex@tavernlight.test / tavernlight</Notice>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
