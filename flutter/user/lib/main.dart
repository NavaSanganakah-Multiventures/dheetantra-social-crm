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
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_callkit_incoming/entities/call_event.dart';
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
  // Background isolate mein SchedulerBinding nahi hota, isliye debugPrint ke
  // bajaye print use karo.
  // ignore: avoid_print

  // App kill/band hone par bhi har message ka notification aana chahiye.
  // Notification-payload wale messages ko Android system tray dikhata hai,
  // lekin data-only messages ya custom handling ke liye local notification
  // khud show karte hain.
  if (type == 'incoming_call' || type == 'twilio_incoming_call') {
    await CallKitService().showIncomingCall(message.data);
  } else if (type == 'call_answered') {
    // Kisi aur agent ne answer kar liya - is device ki CallKit ring band karo.
    final callId = message.data['callId']?.toString() ?? '';
    if (callId.isNotEmpty) {
      await CallKitService().dismissCallRing(callId);
    }
  } else {
    // missed_call, new_message, ya koi bhi dusra data-only event.
    await FcmService().showBackgroundNotification(message);
  }
}

/// CallKit background handler - plugin ka apna background FlutterEngine isolate
/// ise chalata hai jab app terminated ho aur user native call UI se accept/
/// decline kare. acceptCallHandle (CallKitService.init mein) main isolate ke
/// MethodChannel par wahi event deta hai jab app wapas khulta hai, isliye yahan
/// sirf event ko "consume" karna kafi hai taaki plugin ka background engine
/// chalta rahe aur events lost na hon.
@pragma('vm:entry-point')
Future<void> _callkitBackgroundEventHandler(CallEvent event) async {
  try {
    // ignore: avoid_print
  } catch (e) {
    // ignore: avoid_print
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  // acceptCallHandle native callback ko sabse pehle register karo - cold-start
  // accept (plugin ka 750ms callback window) main isolate ka method channel
  // ready hone se pehle aa jata hai, tab event lost ho jata hai. Early
  // register se us race ka window kafi kam ho jata hai.
  CallKitService().registerAcceptHandleEarly();
  // CallKit background engine start karo - iske bina app killed hone par native
  // accept/decline events kisi ko nahi milte aur call attend nahi ho pati.
  try {
    await FlutterCallkitIncoming.onBackgroundMessage(_callkitBackgroundEventHandler);
  } catch (e) {
    debugPrint('CALLKIT background handler register error: $e');
  }
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
