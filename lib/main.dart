import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/api.dart';
import 'screens/auth.dart';
import 'screens/tabs.dart';
import 'ui/kit.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.dark);
  session.restore();
  runApp(const AmperaApp());
}

final navigatorKey = GlobalKey<NavigatorState>();

class AmperaApp extends StatefulWidget {
  const AmperaApp({super.key});
  @override
  State<AmperaApp> createState() => _AmperaAppState();
}

class _AmperaAppState extends State<AmperaApp> with WidgetsBindingObserver {
  var _last = session.status;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    session.addListener(_onSession);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    session.removeListener(_onSession);
    super.dispose();
  }

  // Refetch everything when the app comes back to the foreground.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && session.status == SessionStatus.signedIn) refreshAll();
  }

  // Signing in or out swaps the root screen; drop whatever was pushed on top of it.
  void _onSession() {
    if (session.status != _last) navigatorKey.currentState?.popUntil((r) => r.isFirst);
    _last = session.status;
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Ampera',
        debugShowCheckedModeBanner: false,
        navigatorKey: navigatorKey,
        theme: amperaTheme(),
        home: ListenableBuilder(
          listenable: session,
          builder: (_, _) => switch (session.status) {
            SessionStatus.loading => const Scaffold(
                body: Center(child: Image(image: AssetImage('assets/brand/ampera-mark.png'), width: 72)),
              ),
            SessionStatus.signedOut => const LoginScreen(),
            SessionStatus.signedIn => const TabsShell(),
          },
        ),
      );
}
