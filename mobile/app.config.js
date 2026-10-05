// Adds the Android-only settings that must not live in app.json: the Google Maps key
// (read from mobile/.env, never committed) and the Android package ID.
//
// Expo Go ignores all of this (it always uses Expo's own Maps key). The settings only take
// effect in a development build or release build of the app, for example
// `npx expo prebuild --platform android` followed by a Gradle build.
module.exports = ({ config }) => ({
  ...config,
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
