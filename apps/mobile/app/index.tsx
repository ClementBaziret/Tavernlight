import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import type { CharacterSummary } from "@tavernlight/shared";
import { api, errorText } from "../src/api";
import { useAuth } from "../src/auth";
import { TOUCH, useTheme } from "../src/theme";
import { Body, Button, Loading, Notice, Screen, Title } from "../src/ui";

export default function Home() {
  const { user, ready, logout } = useAuth();
  const t = useTheme();
  const characters = useQuery({ queryKey: ["characters"], queryFn: () => api.get<CharacterSummary[]>("/characters"), enabled: !!user });
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  const mine = (characters.data ?? []).filter((c) => c.ownerId === user.id);
  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 8 }}
        data={mine}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={characters.isFetching} onRefresh={() => void characters.refetch()} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Title>Hello, {user.displayName}</Title>
            {characters.error && <Notice tone="danger">{errorText(characters.error)}</Notice>}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button label="New character" variant="primary" onPress={() => router.push("/new")} />
              <Button label="Dice" onPress={() => router.push("/dice")} />
              <Button label="Log out" onPress={() => void logout()} />
            </View>
            <Title level={2}>My characters</Title>
            {characters.isLoading && <Loading />}
            {!characters.isLoading && mine.length === 0 && <Body muted>No character yet. Create one: the builder checks every rule.</Body>}
          </View>
        }
        renderItem={({ item: c }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${c.name}, ${c.species} ${c.className} level ${c.level}, ${c.hp} of ${c.maxHp} hit points, armor class ${c.ac}`}
            onPress={() => router.push(`/character/${c.id}`)}
            style={{ minHeight: TOUCH, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 12, padding: 12 }}
          >
            <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{c.name}</Text>
            <Text style={{ color: t.muted, fontSize: 15 }}>
              {c.species} · {c.className} {c.level}
              {c.campaignName ? ` · ${c.campaignName}` : ""}
            </Text>
            <Text style={{ color: t.text, fontSize: 15 }}>
              HP {c.hp}/{c.maxHp} · AC {c.ac}
            </Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}
