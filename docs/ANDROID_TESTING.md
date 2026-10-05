# Android testing checklist for Fresh & Quick

This is the checklist for trying the mobile app on a real Android phone using Expo Go.

## Prerequisites

1. Install Expo Go from the Google Play Store. It must be the SDK 57 version (the app is built on Expo SDK 57). If the Play Store version is older or newer, Expo Go will say the project is incompatible.
2. Put the phone on the same Wi-Fi network as the PC.
3. On the PC, make sure the services are running (Docker, Supabase, the web app on port 3000, n8n) and that `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` uses the PC's LAN address (for example `http://192.168.x.x:3000`), not `localhost`. Supabase's URL in that file must also use the LAN address.
4. Start Metro from the `mobile` folder (`npx expo start`), then scan the QR code with Expo Go, or type the `exp://<PC LAN address>:8081` address into Expo Go.
5. If Windows Firewall asks, allow Node.js on private networks.

## Steps

1. Launch. The app signs you out on every cold start, so you land on "Who's using the app?". Check the status bar text is readable.
2. Sign in. Tap Customer, tap the email field, and confirm the keyboard does not hide the Log In button (you can scroll the form). Use your own customer account or sign up with Sign Up.
3. Home. Check the delivery bar, search box, cuisine row, store cards and the bottom tabs (Home, Orders, Account). The content should start below the status bar.
4. Search. Type a restaurant or dish name and confirm results filter as you type.
5. Store page. Open a store. Add an item with the round + button; if it has options, a sheet opens. Check the cart pill appears at the bottom.
6. Cart. Tap the cart pill, change quantities, add an order note.
7. Checkout, without placing an order. Open Checkout, tap each field (name, email, phone, address, UPI id) and confirm the keyboard never hides the field you are typing in and you can scroll. Check email fields do not capitalise and phone and pincode fields show a number pad. Do NOT tap Place order, because real emails are sent.
8. Zippy streaming. Tap the Ask Zippy button, ask "How do I track my order?" and watch the answer: words should appear a little at a time, not all at once at the end. The orange header must fill right up under the status bar with no white strip.
9. Zippy cards. Ask Zippy to show your cart, to help with checkout and to add an order note; confirm the cart, checkout and order-note cards appear and work (do not confirm an order).
10. Back button. With Zippy open, press the phone's Back button: the chat should close and leave you on the screen you were on. Then press Back on a store page, cart and checkout and confirm each goes back one screen.
11. Keyboard in Zippy. Tap the chat input, type a question, and confirm the input and Send button stay visible above the keyboard.
12. Location permission. Ask Zippy "What is the nearest restaurant?". Android should show a location permission prompt. Try Allow, and on a second run (clear the app's permission) try Deny: Zippy should still answer, saying nearest is unavailable.
13. Account tab. Open Account, Help and Wallet, and sign out.
14. Delivery Partner sign-in. On the first screen tap Delivery Partner and check the form and keyboard behave as in step 2.

## What to report

For anything that looks wrong, send a screenshot and tell us: the screen, what you did, what you expected, what happened, and your phone model and Android version. Also mention any red or yellow error screen text, any text that is cut off or unreadable, and anything that feels slow.

## Android emulator on this PC

Android Studio was installed with winget. The SDK is at `%LOCALAPPDATA%\Android\Sdk` and the virtual device is `Pixel_API_35` (Pixel 7, API 35, with Expo Go 57 installed).

Start it from PowerShell, in the project folder. This script starts the emulator and then centres and resizes its window, because on its own the emulator opens partly off-screen on this PC (it is 2136 px tall and the usable screen is 2052 px):

```
.\scripts\start-emulator.ps1
```

Add `-OpenApp` to also open the app in Expo Go once the phone has booted (Metro must be running on port 8081). Running the script again while the emulator is open just moves the window back into place.

Stop it with `.\scripts\stop-emulator.ps1`. It asks the phone to shut down and, if that does not finish within about 15 seconds, stops it by force. It does not touch Metro, Docker or the web app.

Open the app in Expo Go (Vishal's Metro on port 8081; 10.0.2.2 is the emulator's name for the PC):

```
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081"
```

Take a screenshot into a file:

```
cmd /c "`"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`" exec-out screencap -p > shot.png"
```

Vishal has no Android phone, so this emulator is the Android test device.

Tips for the emulator on this PC:

- If the emulator window is ever off-screen or cut off (this PC is 3840x2160 at 225% scaling), run `.\scripts\start-emulator.ps1` again; it repositions the window without restarting the phone.
- The docked on-screen keyboard was verified: the login form moves up and Log In and Sign up stay visible.
- With a hardware keyboard attached the emulator's Gboard can show as a small floating keyboard, which floats over the app and does not push the layout up. That is an emulator quirk, not an app bug.

## The map on Android (working since 2026-10-05)

Expo Go always uses Expo's own Google Maps key, so in Expo Go on the emulator the map area stays blank (Google rejects that copy: logcat shows "Authorization failure" for `host.exp.exponent`). Nothing in Google Cloud Console can change that. The map works in a NATIVE build of the app (package `com.freshquick.app`) that carries our own key. Verified on the emulator on 2026-10-05: real Google tiles, a dashed straight line between store, partner and address, and three coloured markers (orange store, green address, dark navy partner). Known cosmetic gap: the S, H and D letters inside the markers do not show on Android (the legend letters are coloured to match); on iPhone the letters show.

### One-time Google Cloud Console setup (done)
1. Same project as the web key: APIs & Services > Library > enable **Maps SDK for Android**.
2. Credentials > Create credentials > API key (separate from the browser key). Restrict it to Android apps: package `com.freshquick.app` and SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (the standard Expo debug certificate, not secret), and to the Maps SDK for Android API only. A build signed with a different keystore (for example one made by Expo's cloud build) needs its own SHA-1 added to the same key.
3. Put the key in `mobile/.env` as `GOOGLE_MAPS_ANDROID_API_KEY` (placeholder in `mobile/.env.example`). `mobile/app.config.js` passes it to the native build; Expo Go ignores it.

### Build and install on the emulator
Prerequisites on this PC (all installed): Android Studio SDK with platform 36, NDK 27, **CMake 3.31.6** (its Ninja 1.12.1 supports long paths), **Temurin JDK 21** at `C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot` (Java 25 breaks the Android prefab/CMake step), and Windows long paths enabled (`LongPathsEnabled = 1`). The first Android build failed twice on this PC: first on Java 25, then on the 260-character Windows path limit in the C++ compile; the fixes are the two bullets above.
1. In `mobile`: `npx expo install expo-dev-client` is NOT needed for this and must stay out of `package.json`, because it makes `expo start` produce development-build QR codes instead of Expo Go.
2. `npx expo prebuild --platform android --no-install --no-clean` (use `--no-clean` when `mobile/android` exists; a plain prebuild fails with EBUSY while VS Code's Java tooling or Gradle has the folder open). It rewrites the `android` and `ios` scripts in `package.json`; restore them to `expo start --android` and `expo start --ios`. Create `mobile/android/local.properties` with `sdk.dir=C:/Users/visha/AppData/Local/Android/Sdk` and `cmake.dir=C:/Users/visha/AppData/Local/Android/Sdk/cmake/3.31.6` (use forward slashes).
3. With `JAVA_HOME` set to the JDK 21 folder (only for this command), run in `mobile/android`: `gradlew.bat assembleDebug -x lint -PreactNativeArchitectures=x86_64`. About 8 minutes the first time. The debug app is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
4. Start Metro in `mobile` (`npx expo start`, port 8081), run `adb reverse tcp:8081 tcp:8081`, install with `adb install -r <apk>` and start `com.freshquick.app`. Sign in as a customer and open an order that is assigned or on the way. A debug build needs Metro running; an app for a real phone away from the PC needs a release build (`assembleRelease`, add `arm64-v8a` to `reactNativeArchitectures`), which bundles the JavaScript.

## Delivery location and address search

The Customer app's delivery location picker (Home pill, and the address search at Checkout) calls Google's Places API (New) and Geocoding API directly with the Android key (no server proxy; Vishal's choice). Verified on the emulator's native build on 2026-10-05.

### One-time Google Cloud Console setup (done)
Enable **Places API (New)** and **Geocoding API** in the same project, and add both to the API restrictions of the Android key (it already allows Maps SDK for Android; Routes API is enabled too). The key's Android-app restriction (package `com.freshquick.app` plus SHA-1) stays as is. A build signed with another keystore needs its own SHA-1 on the key, otherwise search quietly stops working and the sheet shows that search is unavailable.

### Native build only
Search and reverse geocoding only work where Google accepts the Android key, which is the native Android build. Expo Go on the emulator is rejected for the same reason as the map. On an iPhone in Expo Go this is unverified: the Expo manifest also carries the key and the Android headers, so it may or may not work. When search is unavailable the sheet says so, and the pin and "Use my current location" still work.

### How to test
1. Install the native debug build and start Metro (see "Build and install on the emulator"), then sign in as a customer. Sign-in matters: the saved location is stored on the account.
2. Home: tap the location pill. The full-screen "Delivery location" sheet opens.
3. Type 3 or more characters (for example `Bandra`): live suggestions appear; tapping one saves and closes the sheet, and Home reorders restaurants nearest first.
4. Tap the map or drag the pin: the footer shows an address (or coordinates if the lookup fails) and "Confirm location" saves it.
5. "Use my current location": `adb emu geo fix <longitude> <latitude>` (longitude first) sets a mock fix, but on 2026-10-05 the fix never reached the app on this emulator, so the button timed out after 15 seconds with its friendly message. Treat GPS as not verified on the emulator; check it on a real phone.
6. Checkout: "Search for your address" fills Address 1, City and State (type the Pincode when it is blank); "Use my saved location" fills from the saved pin.
7. Restart the app, or sign out and back in: the saved location comes back from the account (and the device cache). Signing in as a different customer on the same emulator must not show the previous account's location.
