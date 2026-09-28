import { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useCart, SelectedOption } from "../lib/cart-store";
import { BRAND } from "../theme";

type Option = { id: string; name: string; price_delta_paise: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  menu_item_options: Option[];
};

type Item = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
};

// Mirrors components/ItemCustomizationModal.tsx on the web: min/max select
// per group, price delta shown, blocks Add until every required group is
// satisfied.
export function ItemCustomizationModal({
  visible,
  item,
  optionGroups,
  storeId,
  storeName,
  onClose,
}: {
  visible: boolean;
  item: Item;
  optionGroups: OptionGroup[];
  storeId: string;
  storeName: string;
  onClose: () => void;
}) {
  const { addItem } = useCart();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = useState(1);

  function isSelected(groupId: string, optionId: string) {
    return selected[groupId]?.has(optionId) ?? false;
  }

  function toggleOption(group: OptionGroup, optionId: string) {
    setSelected((prev) => {
      const current = new Set(prev[group.id] ?? []);
      if (group.max_select === 1) {
        return { ...prev, [group.id]: current.has(optionId) ? new Set() : new Set([optionId]) };
      }
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (current.size >= group.max_select) return prev;
        current.add(optionId);
      }
      return { ...prev, [group.id]: current };
    });
  }

  const allGroupsValid = optionGroups.every((group) => {
    const count = selected[group.id]?.size ?? 0;
    return count >= group.min_select && count <= group.max_select;
  });

  const selectedOptions: SelectedOption[] = optionGroups.flatMap((group) =>
    Array.from(selected[group.id] ?? []).map((optionId) => {
      const option = group.menu_item_options.find((o) => o.id === optionId)!;
      return {
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDeltaPaise: option.price_delta_paise,
      };
    })
  );

  const unitPricePaise =
    Math.round(item.price * 100) + selectedOptions.reduce((sum, o) => sum + o.priceDeltaPaise, 0);
  const totalPaise = unitPricePaise * quantity;

  function reset() {
    setSelected({});
    setQuantity(1);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleAdd() {
    if (!allGroupsValid) return;
    addItem(storeId, storeName, {
      menuItemId: item.id,
      name: item.name,
      price: unitPricePaise / 100,
      quantity,
      imageUrl: item.image_url,
      selectedOptions,
      specialInstructions: null,
    });
    handleClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{item.name}</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {optionGroups.map((group) => (
              <View key={group.id} style={styles.group}>
                <Text style={styles.groupTitle}>
                  {group.name}{" "}
                  <Text style={styles.groupSubtitle}>
                    {group.min_select > 0
                      ? `Required · choose ${
                          group.min_select === group.max_select
                            ? group.min_select
                            : `${group.min_select}-${group.max_select}`
                        }`
                      : `Optional · up to ${group.max_select}`}
                  </Text>
                </Text>
                {group.menu_item_options.map((option) => {
                  const on = isSelected(group.id, option.id);
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => toggleOption(group, option.id)}
                      style={[styles.option, on && styles.optionOn]}
                    >
                      <Text style={styles.optionLabel}>
                        {on ? "●" : "○"} {option.name}
                      </Text>
                      {option.price_delta_paise > 0 && (
                        <Text style={styles.optionPrice}>
                          +₹{(option.price_delta_paise / 100).toFixed(2)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
                {group.menu_item_options.length === 0 && (
                  <Text style={styles.noOptions}>No options available yet.</Text>
                )}
              </View>
            ))}
          </ScrollView>
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Quantity</Text>
            <View style={styles.qtyControls}>
              <Pressable
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                style={styles.qtyButton}
              >
                <Text style={styles.qtyButtonText}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <Pressable onPress={() => setQuantity((q) => q + 1)} style={styles.qtyButton}>
                <Text style={styles.qtyButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            disabled={!allGroupsValid}
            onPress={handleAdd}
            style={[styles.addButton, !allGroupsValid && styles.addButtonDisabled]}
          >
            <Text style={styles.addButtonText}>
              Add {quantity} to cart · ₹{(totalPaise / 100).toFixed(2)}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: BRAND.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontFamily: BRAND.fonts.heading,
    fontSize: 18,
    color: BRAND.colors.ink,
  },
  close: {
    fontSize: 18,
    color: BRAND.colors.inkMuted,
  },
  group: {
    marginBottom: 16,
  },
  groupTitle: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 14,
    color: BRAND.colors.ink,
    marginBottom: 6,
  },
  groupSubtitle: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "30",
    borderRadius: BRAND.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  optionOn: {
    borderColor: BRAND.colors.primary,
  },
  optionLabel: {
    fontFamily: BRAND.fonts.body,
    fontSize: 14,
    color: BRAND.colors.ink,
  },
  optionPrice: {
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  noOptions: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 12,
  },
  qtyLabel: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 14,
    color: BRAND.colors.ink,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qtyButton: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "40",
    borderRadius: 999,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
    color: BRAND.colors.ink,
  },
  qtyValue: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 15,
    color: BRAND.colors.ink,
    minWidth: 16,
    textAlign: "center",
  },
  addButton: {
    backgroundColor: BRAND.colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 15,
    color: BRAND.colors.surface,
  },
});
