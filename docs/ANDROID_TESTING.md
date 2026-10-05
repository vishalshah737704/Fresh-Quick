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
