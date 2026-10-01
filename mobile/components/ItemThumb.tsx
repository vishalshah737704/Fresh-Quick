import { View, Text, Image, StyleSheet } from "react-native";
import { BRAND } from "../theme";
import { isAllowedImageUrl } from "../lib/image-url";

export function ItemThumb({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  const box = { width: size, height: size };
  if (url && isAllowedImageUrl(url)) {
    return <Image source={{ uri: url }} style={[styles.image, box]} resizeMode="cover" accessibilityLabel={name} />;
  }
  return (
    <View style={[styles.placeholder, box]} accessibilityLabel={name}>
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.4) }]}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: 8, backgroundColor: BRAND.colors.inkTint },
  placeholder: {
    borderRadius: 8,
    backgroundColor: BRAND.colors.inkTint,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.inkMuted },
});
