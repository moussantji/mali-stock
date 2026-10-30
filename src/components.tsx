/**
 * Composants Mali Stock — Palette 04 Bogolan Tricolore Premium
 * Boutons sans emoji : icônes Ionicons (@expo/vector-icons) uniquement.
 * Animations fluides : apparitions en cascade, barres et jauges animées, boutons ressort.
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadows, spacing, tricoloreBand, typography } from "./theme";
import { STATUS_LABEL, type Product, type StockStatus } from "./data";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/* ------------------------------------------------------------------ */
/* Apparition fluide en cascade                                        */
/* ------------------------------------------------------------------ */
export function Reveal({ index = 0, style, children }: { index?: number; style?: ViewStyle; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 620,
      delay: index * 110,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Bandeau signature vert · or · rouge                                 */
/* ------------------------------------------------------------------ */
export function TricoloreBand({ height = 5 }: { height?: number }) {
  return (
    <View style={[styles.band, { height }]} accessibilityElementsHidden>
      {tricoloreBand.map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Boutons (icônes vectorielles, zéro emoji)                           */
/* ------------------------------------------------------------------ */
interface ButtonProps {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  style?: ViewStyle;
}

export function PrimaryButton({ label, icon = "add", onPress, style }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 6, tension: 140 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(0.965)}
        onPressOut={() => press(1)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <LinearGradient
          colors={[colors.primaryLight, colors.primaryDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.btnPrimary, shadows.primaryButton]}
        >
          <Ionicons name={icon} size={18} color={colors.onPrimary} />
          <Text style={styles.btnPrimaryText}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function SecondaryButton({ label, icon = "scan-outline", onPress, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed, style]}
    >
      <Ionicons name={icon} size={18} color={colors.text} />
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, badge = false, onPress }: { icon: IconName; label: string; badge?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.iconBtn}>
      <Ionicons name={icon} size={19} color={colors.text} />
      {badge ? <View style={styles.iconBtnDot} /> : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Hero banner : image bogolan + valeur du stock                       */
/* ------------------------------------------------------------------ */
export function HeroBanner({
  value,
  trend,
  onReport,
  onScan,
}: {
  value: string;
  trend: string;
  onReport?: () => void;
  onScan?: () => void;
}) {
  return (
    <View style={styles.heroWrap}>
      <ImageBackground
        source={require("../assets/hero-tricolore.jpg")}
        style={styles.hero}
        imageStyle={styles.heroImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={["rgba(6,61,41,0.92)", "rgba(10,107,69,0.55)", "rgba(10,107,69,0.25)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.heroOverline}>VALEUR DU STOCK</Text>
        <Text style={styles.heroValue}>{value}</Text>
        <View style={styles.trendChip}>
          <Ionicons name="trending-up-outline" size={13} color="#7BE8BC" />
          <Text style={styles.trendText}>{trend}</Text>
        </View>
        <View style={styles.heroActions}>
          <Pressable onPress={onReport} accessibilityRole="button" style={styles.heroBtnSolid}>
            <Ionicons name="bar-chart-outline" size={14} color="#231903" />
            <Text style={styles.heroBtnSolidText}>Rapport</Text>
          </Pressable>
          <Pressable onPress={onScan} accessibilityRole="button" style={styles.heroBtnGhost}>
            <Ionicons name="scan-outline" size={14} color="#FFFFFF" />
            <Text style={styles.heroBtnGhostText}>Scanner</Text>
          </Pressable>
        </View>
        <View style={styles.heroBand}>
          <TricoloreBand />
        </View>
      </ImageBackground>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */
export function SearchBar({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search-outline" size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Rechercher un produit, un code…"
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        returnKeyType="search"
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Cartes KPI                                                          */
/* ------------------------------------------------------------------ */
export function KpiCard({ icon, value, label, tone = "primary" }: { icon: IconName; value: string; label: string; tone?: "primary" | "gold" | "danger" }) {
  const paletteByTone = {
    primary: { fg: colors.primary, bg: "rgba(10,107,69,0.12)" },
    gold: { fg: colors.goldDark, bg: "rgba(223,169,33,0.20)" },
    danger: { fg: colors.stockOut, bg: colors.stockOutBg },
  }[tone];
  return (
    <View style={[styles.kpi, shadows.card]}>
      <View style={[styles.kpiIcon, { backgroundColor: paletteByTone.bg }]}>
        <Ionicons name={icon} size={14} color={paletteByTone.fg} />
      </View>
      <Text style={[styles.kpiValue, tone === "danger" && { color: colors.stockOut }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Graphique 7 jours — barre du pic en or, dernière barre en rouge     */
/* ------------------------------------------------------------------ */
export function StockChart({ data }: { data: { day: string; value: number }[] }) {
  const values = useRef(data.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      85,
      values.map((v) => Animated.spring(v, { toValue: 1, useNativeDriver: false, friction: 7, tension: 60 }))
    ).start();
  }, [values]);
  const MAX = 54;
  return (
    <View style={[styles.chart, shadows.card]}>
      <View style={styles.chartHead}>
        <Text style={styles.chartTitle}>Mouvements · 7 jours</Text>
        <Text style={styles.chartSub}>Hebdomadaire</Text>
      </View>
      <View style={styles.bars}>
        {(() => {
          const peakIndex = data.reduce(
            (best, d, i) => (d.value > data[best].value ? i : best),
            0
          );
          return data.map((d, i) => {
            const isPeak = i === peakIndex;
            const isSignature = i === data.length - 1;
          const barColors = isPeak
            ? ([colors.goldLight, "#C99412"] as const)
            : isSignature
              ? ([colors.redLight, colors.red] as const)
              : ([colors.primaryLight, colors.primary] as const);
          return (
            <View key={i} style={styles.barCol}>
              <Animated.View
                style={{
                  width: "100%",
                  height: values[i].interpolate({ inputRange: [0, 1], outputRange: [4, Math.max(6, MAX * d.value)] }),
                }}
              >
                <LinearGradient colors={[barColors[0], barColors[1]]} style={styles.barFill} />
              </Animated.View>
              <Text style={styles.barDay}>{d.day}</Text>
            </View>
          );
        });
        })()}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Statuts de stock                                                    */
/* ------------------------------------------------------------------ */
const STATUS_STYLE: Record<StockStatus, { fg: string; bg: string }> = {
  ok: { fg: colors.stockOk, bg: colors.stockOkBg },
  low: { fg: colors.stockLow, bg: colors.stockLowBg },
  out: { fg: colors.stockOut, bg: colors.stockOutBg },
};

export function StatusChip({ status }: { status: StockStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.chipText, { color: s.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Carte produit — tuiles vert / or / rouge en patchwork bogolan       */
/* ------------------------------------------------------------------ */
const TILE_TONES = [
  { fg: colors.primary, bg: "rgba(10,107,69,0.13)" },
  { fg: colors.goldDark, bg: "rgba(223,169,33,0.20)" },
  { fg: colors.red, bg: "rgba(178,58,46,0.12)" },
] as const;

export function ProductCard({ product, index = 0, onPress }: { product: Product; index?: number; onPress?: () => void }) {
  const tone = TILE_TONES[index % TILE_TONES.length];
  const meter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(meter, { toValue: 1, duration: 1100, delay: 250 + index * 140, useNativeDriver: false }).start();
  }, [meter, index]);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Gérer ${product.name}` : undefined}
    >
      <View style={[styles.product, shadows.card]}>
        <View style={[styles.tile, { backgroundColor: tone.bg }]}>
          <Text style={[styles.tileText, { color: tone.fg }]}>{product.initials}</Text>
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.productMeta}>{product.sku} · {product.quantityLabel}</Text>
          <View style={styles.meterTrack}>
            <Animated.View
              style={[
                styles.meterFillWrap,
                { width: meter.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${product.level}%`] }) },
              ]}
            >
              <LinearGradient colors={[colors.primary, colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.meterFill} />
            </Animated.View>
          </View>
        </View>
        <StatusChip status={product.status} />
        {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation inférieure avec bouton Scan central                      */
/* ------------------------------------------------------------------ */
export type TabKey = "home" | "stock" | "scan" | "orders" | "profile";

export function BottomNav({
  active,
  onChange,
  badges = {},
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
  badges?: Partial<Record<TabKey, number>>;
}) {
  const insets = useSafeAreaInsets();
  const item = (key: TabKey, icon: IconName, label: string) => {
    const count = badges[key] ?? 0;
    return (
      <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="button" accessibilityLabel={count > 0 ? `${label}, ${count} en attente` : label} style={styles.navItem}>
        <View style={styles.navIconWrap}>
          <Ionicons name={icon} size={20} color={active === key ? colors.primary : colors.textMuted} />
          {count > 0 ? (
            <View style={styles.navBadge}>
              <Text style={styles.navBadgeText}>{count > 9 ? "9+" : count}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.navLabel, active === key && { color: colors.primary }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 14) }]}>
      {item("home", "home", "Accueil")}
      {item("stock", "cube-outline", "Stock")}
      <Pressable onPress={() => onChange("scan")} accessibilityRole="button" accessibilityLabel="Scanner un code-barres" style={styles.fabWrap}>
        <LinearGradient colors={[colors.primaryLight, colors.primaryDeep]} style={[styles.fab, shadows.primaryButton]}>
          <Ionicons name="scan-outline" size={21} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
      {item("orders", "cart-outline", "Commandes")}
      {item("profile", "person-outline", "Profil")}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  band: { flexDirection: "row", width: "100%" },

  btnPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: radius.md,
  },
  btnPrimaryText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },
  btnSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, paddingHorizontal: 18, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary,
  },
  btnPressed: { opacity: 0.75 },
  btnSecondaryText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  iconBtn: {
    width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  iconBtnDot: {
    position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.stockOut, borderWidth: 1.5, borderColor: colors.background,
  },

  heroWrap: { borderRadius: radius.xl, overflow: "hidden" },
  hero: { padding: spacing.xl, paddingBottom: 26, minHeight: 196, justifyContent: "flex-end" },
  heroImage: { borderRadius: radius.xl },
  heroOverline: { ...typography.overline, color: "rgba(255,255,255,0.85)" },
  heroValue: { ...typography.display, color: "#FFFFFF", marginVertical: 6 },
  trendChip: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    backgroundColor: "rgba(62,213,152,0.20)", borderWidth: 1, borderColor: "rgba(123,232,188,0.35)",
    paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill,
  },
  trendText: { color: "#7BE8BC", fontSize: 11, fontWeight: "800" },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  heroBtnSolid: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF",
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill,
  },
  heroBtnSolidText: { color: "#231903", fontSize: 12, fontWeight: "800" },
  heroBtnGhost: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill,
  },
  heroBtnGhostText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  heroBand: { position: "absolute", left: 0, right: 0, bottom: 0 },

  search: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text, padding: 0 },

  kpi: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border },
  kpiIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  kpiLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: colors.textMuted, marginTop: 2 },

  chart: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  chartTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  chartSub: { fontSize: 11, fontWeight: "800", color: colors.primary },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 78 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" },
  barFill: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  barDay: { fontSize: 10, fontWeight: "700", color: colors.textMuted },

  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill },
  chipText: { fontSize: 10, fontWeight: "800" },

  product: {
    flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.surface,
    borderRadius: 15, padding: 11, borderWidth: 1, borderColor: colors.border,
  },
  tile: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileText: { fontSize: 13, fontWeight: "800" },
  productInfo: { flex: 1 },
  productName: { fontSize: 13, fontWeight: "800", color: colors.text },
  productMeta: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  meterTrack: { height: 5, borderRadius: 99, backgroundColor: "rgba(27,32,26,0.08)", marginTop: 7, overflow: "hidden" },
  meterFillWrap: { height: "100%" },
  meterFill: { flex: 1, borderRadius: 99 },

  bottomNav: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around",
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 10, paddingBottom: 14, paddingHorizontal: 6,
  },
  navItem: { alignItems: "center", gap: 3, minWidth: 56 },
  navIconWrap: { position: "relative" },
  navBadge: {
    position: "absolute", top: -5, right: -10, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3, backgroundColor: colors.stockOut, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.surface,
  },
  navBadgeText: { fontSize: 8.5, fontWeight: "900", color: "#FFFFFF" },
  navLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
  fabWrap: { marginTop: -26 },
  fab: {
    width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: colors.background,
  },
});
