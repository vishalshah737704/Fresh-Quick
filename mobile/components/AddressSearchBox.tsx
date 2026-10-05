import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BRAND } from "../theme";
import { SEARCH_UNAVAILABLE_MESSAGE, usePlaceSearch, type PlaceSearch } from "../lib/use-place-search";
import type { PlaceDetails, PlaceSuggestion } from "../lib/places-parse";

export function SuggestionRows({ search }: { search: PlaceSearch }) {
  if (search.unavailable) return <Text style={styles.note}>{SEARCH_UNAVAILABLE_MESSAGE}</Text>;
  if (search.error) return <Text style={styles.error}>{search.error}</Text>;
  if (search.noResults) return <Text style={styles.note}>No matching address found.</Text>;
  return (
    <View>
      {search.suggestions.map((s: PlaceSuggestion) => (
        <Pressable
          key={s.placeId}
          style={styles.row}
          onPress={() => void search.pick(s)}
          accessibilityRole="button"
          accessibilityLabel={`${s.text} ${s.secondaryText}`}
        >
          <Ionicons name="location-outline" size={18} color={BRAND.colors.inkMuted} />
          <View style={styles.rowText}>
            <Text style={styles.rowMain} numberOfLines={1}>
              {s.text}
            </Text>
            {s.secondaryText !== "" && (
              <Text style={styles.rowSecondary} numberOfLines={1}>
                {s.secondaryText}
              </Text>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function SearchInput({ search, placeholder }: { search: PlaceSearch; placeholder: string }) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name="search" size={18} color={BRAND.colors.inkMuted} />
      <TextInput
        style={styles.input}
        value={search.query}
        onChangeText={search.setQuery}
        placeholder={placeholder}
        placeholderTextColor={BRAND.colors.inkMuted}
        autoCorrect={false}
        returnKeyType="search"
      />
      {search.loading && <ActivityIndicator size="small" color={BRAND.colors.primary} />}
    </View>
  );
}

// Search input with an inline suggestion list; picking a suggestion calls onPick with the place.
export function AddressSearchBox({
  onPick,
  placeholder = "Search for your address",
}: {
  onPick: (place: PlaceDetails) => void;
  placeholder?: string;
}) {
  const search = usePlaceSearch(onPick);
  return (
    <View style={styles.box}>
      <SearchInput search={search} placeholder={placeholder} />
      <SuggestionRows search={search} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "33",
  },
  input: { flex: 1, fontFamily: BRAND.fonts.body, color: BRAND.colors.ink, padding: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.inkMuted + "22",
  },
  rowText: { flex: 1 },
  rowMain: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 14, color: BRAND.colors.ink },
  rowSecondary: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  note: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted, paddingHorizontal: 6 },
  error: { fontFamily: BRAND.fonts.body, fontSize: 12, color: "#dc2626", paddingHorizontal: 6 },
});
