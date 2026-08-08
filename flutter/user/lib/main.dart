import 'package:flutter/material.dart';

import 'core/app_navigator.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_service.dart';
import 'services/fcm_service.dart';
import 'services/notification_router.dart';
import 'services/callkit_service.dart';
import 'theme/app_theme.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firebase_options.dart';

/// Global route observer so child screens can refresh when they become
/// visible again (e.g. chat screen se wapas aane par).
final RouteObserver<ModalRoute<void>> routeObserver = RouteObserver<ModalRoute<void>>();

/// Top-level handler invoked by the OS when a push arrives while the app is
/// terminated or in background. Must be a top-level function (not a method)
/// and annotated with @pragma so the Dart AOT compiler preserves it.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  final type = message.data['type'] ?? '';
  debugPrint('[FCM Background] message type: $type');

  // Backend notification payload ke saath bhejta hai, toh system tray pe
  // notification Android khud dikhayega. Yahan sirf un actions ki zaroorat
  // hai jo UI notification se nahi ho sakti (jaise incoming call screen).
  if (type == 'incoming_call') {
    await CallKitService().showIncomingCall(message.data);
  } else if (type == 'missed_call') {
    // Agar future mein missed-call background notification customize karni
    // ho toh yahan handle karein. Abhi system notification kaafi hai.
    debugPrint('[FCM Background] missed_call recorded');
  } else if (type == 'new_message') {
    // Data-only background message aaye toh call kit / local notification
    // dikhane ka logic future mein add kar sakte hain.
    debugPrint('[FCM Background] new_message recorded');
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  await ApiService().init();
  await FcmService().init();
  await CallKitService().init();
  FcmService().onNotificationTap = (data) => NotificationRouter().dispatch(data);
  runApp(const DheeTantraApp());
}

class DheeTantraApp extends StatelessWidget {
  const DheeTantraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DheeTantra',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      navigatorKey: appNavigatorKey,
      navigatorObservers: [routeObserver],
      home: const SplashScreen(),
      routes: {
        LoginScreen.routeName: (_) => const LoginScreen(),
      },
    );
  }
}
