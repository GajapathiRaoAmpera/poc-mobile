This is a Flutter mobile app (Android + iOS) for regular users of Ampera. Flutter only: no React Native, Expo or JS tooling.

## Commands

```bash
flutter pub add <package>   # add a dependency (check pub.dev for a recent, maintained package first)
make run                    # flutter run with --dart-define-from-file=.env.local
make check                  # flutter analyze + flutter test
```

Run `make check` before declaring any task done.

## Conventions

- Navigation: plain `Navigator` with `push()` from `lib/ui/kit.dart`; tabs are an `IndexedStack` in `screens/tabs.dart`.
- Data: `api()` returns decoded JSON maps; screens hold a `Loader` per resource and call `refreshAll()` after any change.
- Styling: brand tokens and widgets in `lib/ui/kit.dart` (`C`, `T`, `Btn`, `Panel`, `Tile`, `Pill`, `Notice`, ...). Reuse them; don't add a UI library.
- Icons: Flutter's built-in Material icons.
- Native config lives in `android/` and `ios/` (edited directly, unlike Expo's generated folders).
