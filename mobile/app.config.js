// Adds the Android-only settings that must not live in app.json: the Google Maps key
// (read from mobile/.env, never committed) and the Android package ID.
//
// Expo Go ignores all of this (it always uses Expo's own Maps key). The settings only take
// effect in a development build or release build of the app, for example
// `npx expo prebuild --platform android` followed by a Gradle build.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // Read at runtime by lib/places-api.ts via expo-constants. The cert SHA-1 is the public Expo
    // debug certificate (not a secret); the key itself comes from mobile/.env.
    googleMapsAndroidKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? null,
    googleMapsAndroidCertSha1: process.env.GOOGLE_MAPS_ANDROID_CERT_SHA1 ?? "5E8F16062EA3CD2C4A0D547876BAA6F38CABF625",
  },
  android: {
    ...config.android,
    package: "com.freshquick.app",
    config: {
      ...(config.android && config.android.config),
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
  },
});
