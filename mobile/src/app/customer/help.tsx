import { View, Text, ScrollView, StyleSheet } from "react-native";
import { BRAND } from "../../../theme";

const FAQS = [
  {
    q: "How do I find restaurants or stores?",
    a: "Use the search box on the home screen, or browse by category. The home screen also shows a mixed feed of nearby stores.",
  },
  {
    q: "How do I place an order?",
    a: "Add items to your cart from a store's menu screen. Review your cart, then go to checkout to enter contact details, delivery address, and payment method.",
  },
  {
    q: "Can I order from more than one restaurant at once?",
    a: "No — a cart can only hold items from one store at a time. Adding an item from a different store will prompt you to clear your current cart first.",
  },
  {
    q: "How do I track my order?",
    a: "After placing an order, you're taken to its order screen which shows live status updates (accepted, preparing, out for delivery, delivered). You can also find past and current orders under Orders.",
  },
  {
    q: "How do I cancel an order?",
    a: "Orders can only be cancelled by the restaurant before they're accepted, or automatically if payment fails. Once a restaurant accepts your order, it can no longer be cancelled from this app.",
  },
  {
    q: "What payment methods are supported?",
    a: "This is a demo app — all payments are mocked. You can choose Mock Card, Mock UPI, or Cash on Delivery at checkout; no real payment is processed.",
  },
];

export default function HelpScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Help</Text>
      <View style={{ gap: 12 }}>
        {FAQS.map((item) => (
          <View key={item.q} style={styles.card}>
            <Text style={styles.question}>{item.q}</Text>
            <Text style={styles.answer}>{item.a}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  card: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
    gap: 4,
  },
  question: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink },
  answer: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
});
