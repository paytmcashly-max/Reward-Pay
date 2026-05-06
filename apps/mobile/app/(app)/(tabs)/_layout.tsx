import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "@/theme/colors";
import { fontFamily } from "@/theme/typography";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: "#7c8798",
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: "#ffffff",
          borderTopColor: "#e6eaf0",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: fontFamily.bold,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="clipboard-check-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="wallet-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="invite"
        options={{
          title: "Invite",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-plus-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="transactions" options={{ href: null }} />
      <Tabs.Screen name="games" options={{ href: null }} />
    </Tabs>
  );
}
