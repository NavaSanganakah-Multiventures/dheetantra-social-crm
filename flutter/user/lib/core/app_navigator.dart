import 'package:flutter/material.dart';

/// Global navigator key used by services (CallKit, notifications) that don't
/// have a BuildContext to open screens such as [CallScreen].
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();
